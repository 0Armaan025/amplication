import { ILogger } from "@amplication/util/logging";
import { mkdir, rm, writeFile } from "fs/promises";
import { join, normalize, resolve } from "path";
import { v4 } from "uuid";
import {
  accumulativePullRequestBody,
  accumulativePullRequestTitle,
  getDefaultREADMEFile,
} from "../constants";
import { InvalidPullRequestMode } from "../errors/InvalidPullRequestMode";
import { GitProvider } from "../git-provider.interface";
import {
  Branch,
  Commit,
  CreateBranchIfNotExistsArgs,
  CreatePullRequestArgs,
  CreateRepositoryArgs,
  CurrentUser,
  EnumPullRequestMode,
  GetRepositoriesArgs,
  GetRepositoryArgs,
  GitProviderArgs,
  GitProvidersConfiguration,
  OAuthData,
  PaginatedGitGroup,
  PostCommitProcessArgs,
  PreCommitProcessArgs,
  PreCommitProcessResult,
  RemoteGitOrganization,
  RemoteGitRepos,
  RemoteGitRepository,
  UpdateFile,
} from "../types";
import { AmplicationIgnoreManger } from "../utils/amplication-ignore-manger";
import { getCloneDir } from "../utils/clone-dir";
import { prepareFilesForPullRequest } from "../utils/prepare-files-for-pull-request";
import { GitClient } from "./git-client";
import { GitFactory } from "./git-factory";

export class GitClientService {
  private provider: GitProvider;
  private logger: ILogger;

  async create(
    gitProviderArgs: GitProviderArgs,
    providersConfiguration: GitProvidersConfiguration,
    logger: ILogger
  ): Promise<GitClientService> {
    this.provider = await GitFactory.getProvider(
      gitProviderArgs,
      providersConfiguration,
      logger
    );
    this.logger = logger;
    return this;
  }

  async getGitInstallationUrl(amplicationWorkspaceId: string): Promise<string> {
    return this.provider.getGitInstallationUrl(amplicationWorkspaceId);
  }

  async getAccessToken(authorizationCode: string): Promise<OAuthData> {
    return this.provider.getAccessToken(authorizationCode);
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthData> {
    return this.provider.refreshAccessToken(refreshToken);
  }

  async getCurrentOAuthUser(accessToken: string): Promise<CurrentUser> {
    return this.provider.getCurrentOAuthUser(accessToken);
  }

  async getGitGroups(): Promise<PaginatedGitGroup> {
    return this.provider.getGitGroups();
  }

  async getRepository(
    getRepositoryArgs: GetRepositoryArgs
  ): Promise<RemoteGitRepository> {
    return this.provider.getRepository(getRepositoryArgs);
  }

  async getRepositories(
    getRepositoriesArgs: GetRepositoriesArgs
  ): Promise<RemoteGitRepos> {
    return this.provider.getRepositories(getRepositoriesArgs);
  }

  async createRepository(
    createRepositoryArgs: CreateRepositoryArgs
  ): Promise<RemoteGitRepository | null> {
    return this.provider.createRepository(createRepositoryArgs);
  }

  async deleteGitOrganization(): Promise<boolean> {
    return this.provider.deleteGitOrganization();
  }

  async getOrganization(): Promise<RemoteGitOrganization> {
    return this.provider.getOrganization();
  }

  async createPullRequest(
    createPullRequestArgs: CreatePullRequestArgs
  ): Promise<string> {
    const {
      owner,
      repositoryName,
      branchName,
      commitMessage,
      pullRequestTitle,
      pullRequestBody,
      pullRequestMode,
      gitResourceMeta,
      files,
    } = createPullRequestArgs;

    const gitClient = new GitClient();
    let isCloned = false;

    const cloneToken = await this.provider.getToken();

    const cloneUrl = this.provider.getCloneUrl({
      owner,
      repositoryName,
      token: cloneToken,
    });

    const cloneDir = getCloneDir({
      owner,
      repositoryName,
      provider: this.provider.name,
      suffix: v4(),
    });

    const { defaultBranch } = await this.provider.getRepository({
      owner,
      repositoryName,
    });

    const haveFirstCommitInDefaultBranch =
      await this.isHaveFirstCommitInDefaultBranch({
        owner,
        repositoryName,
        defaultBranch,
      });

    if (haveFirstCommitInDefaultBranch === false) {
      if (isCloned === false) {
        await gitClient.clone(cloneUrl, cloneDir);
        isCloned = true;
      }
      await this.createInitialCommit({
        cloneDir,
        defaultBranch,
        gitClient,
        repositoryName,
      });
    }

    const amplicationIgnoreManger = await this.manageAmplicationIgnoreFile(
      owner,
      repositoryName
    );
    const preparedFiles = await prepareFilesForPullRequest(
      gitResourceMeta,
      files,
      amplicationIgnoreManger
    );

    this.logger.info(`Got a ${pullRequestMode} pull request mode`);

    let pullRequestUrl: string | null = null;

    switch (pullRequestMode) {
      case EnumPullRequestMode.Basic:
        pullRequestUrl = await this.provider.createPullRequestFromFiles({
          owner,
          repositoryName,
          branchName,
          commitMessage,
          pullRequestTitle,
          pullRequestBody,
          files: preparedFiles,
        });
        break;
      case EnumPullRequestMode.Accumulative:
        pullRequestUrl = await this.accumulativePullRequest(
          cloneUrl,
          cloneDir,
          gitClient,
          owner,
          repositoryName,
          branchName,
          commitMessage,
          pullRequestBody,
          preparedFiles,
          defaultBranch,
          isCloned
        );
        break;
      default:
        throw new InvalidPullRequestMode();
    }

    if (isCloned === true) {
      await rm(cloneDir, { recursive: true, force: true });
    }

    return pullRequestUrl;
  }

  async accumulativePullRequest(
    cloneUrl: string,
    cloneDir: string,
    gitClient: GitClient,
    owner: string,
    repositoryName: string,
    branchName: string,
    commitMessage: string,
    pullRequestBody: string,
    preparedFiles: UpdateFile[],
    defaultBranch: string,
    isCloned: boolean
  ) {
    if (isCloned === false) {
      await gitClient.clone(cloneUrl, cloneDir);
    }

    await this.restoreAmplicationBranchIfNotExists({
      owner,
      repositoryName,
      branchName,
      gitClient,
      defaultBranch,
    });

    const diffFolder = normalize(
      join(
        `.amplication/diffs`,
        this.provider.name,
        owner,

        repositoryName,
        v4()
      )
    );

    const { diff } = await this.preCommitProcess({
      branchName,
      gitClient,
      owner,
      repositoryName,
    });

    await this.provider.createCommit({
      owner,
      repositoryName,
      commitMessage,
      branchName,
      files: preparedFiles,
    });

    if (diff) {
      await mkdir(diffFolder, { recursive: true });
      const diffPath = join(diffFolder, "diff.patch");
      await writeFile(diffPath, diff);
      const fullDiffPath = resolve(diffPath);
      this.logger.info(`Saving diff to: ${fullDiffPath}`);
      await this.postCommitProcess({
        diffPath: fullDiffPath,
        gitClient,
      });
      await rm(fullDiffPath);
    }

    const existingPullRequest = await this.provider.getPullRequestForBranch({
      owner,
      repositoryName,
      branchName,
    });

    let pullRequest = existingPullRequest;

    if (!pullRequest) {
      pullRequest = await this.provider.createPullRequestForBranch({
        owner,
        repositoryName,
        pullRequestTitle: accumulativePullRequestTitle,
        pullRequestBody: accumulativePullRequestBody,
        branchName,
        defaultBranchName: defaultBranch,
      });
    }

    await this.provider.commentOnPullRequest({
      where: { issueNumber: pullRequest.number, owner, repositoryName },
      data: { body: pullRequestBody },
    });

    return pullRequest.url;
  }

  private async preCommitProcess({
    gitClient,
    branchName,
    owner,
    repositoryName,
  }: PreCommitProcessArgs): PreCommitProcessResult {
    this.logger.info("Pre commit process");
    await gitClient.git.checkout(branchName);

    const commitsList = await this.provider.getCurrentUserCommitList({
      branchName,
      owner,
      repositoryName,
    });

    const latestCommit = commitsList[0];

    if (!latestCommit) {
      this.logger.info(
        "Didn't find a commit that has been created by Amplication"
      );
      return { diff: null };
    }

    const { sha } = latestCommit;
    const diff = await gitClient.git.diff([sha]);
    if (diff.length === 0) {
      this.logger.info("Diff returned empty");
      return { diff: null };
    }
    // Reset the branch to the latest commit
    await gitClient.git.reset([sha]);
    await gitClient.git.push(["--force"]);
    await gitClient.resetState();
    this.logger.info("Diff returned");
    return { diff };
  }

  async postCommitProcess({ diffPath, gitClient }: PostCommitProcessArgs) {
    await gitClient.resetState();
    await gitClient.git
      .applyPatch(diffPath, ["--3way", "--whitespace=nowarn"])
      .add(["."])
      .commit("Amplication diff restoration", undefined, {
        "--author": "Amplication diff <info@amplication.com>",
      })
      .push();
  }

  private async restoreAmplicationBranchIfNotExists(
    args: CreateBranchIfNotExistsArgs
  ): Promise<Branch> {
    const { branchName, owner, repositoryName, gitClient, defaultBranch } =
      args;
    const branch = await this.provider.getBranch(args);
    if (branch) {
      return branch;
    }
    const firstCommitOnDefaultBranch =
      await this.provider.getFirstCommitOnBranch({
        owner,
        repositoryName,
        branchName: defaultBranch,
      });
    const newBranch = await this.provider.createBranch({
      owner,
      branchName,
      repositoryName,
      pointingSha: firstCommitOnDefaultBranch.sha,
    });
    const amplicationCommits = await this.provider.getCurrentUserCommitList({
      owner,
      repositoryName,
      branchName: defaultBranch,
    });
    await this.cherryPickCommits(
      amplicationCommits,
      gitClient,
      branchName,
      firstCommitOnDefaultBranch
    );
    return newBranch;
  }

  private async cherryPickCommits(
    commits: Commit[],
    gitClient: GitClient,
    branchName: string,
    firstCommitOnDefaultBranch: Commit
  ) {
    await gitClient.resetState();
    await gitClient.checkout(branchName);

    for (let index = commits.length - 1; index >= 0; index--) {
      const commit = commits[index];
      if (firstCommitOnDefaultBranch.sha === commit.sha) {
        continue;
      }
      await gitClient.cherryPick(commit.sha);
    }

    await gitClient.git.push();
  }

  private async manageAmplicationIgnoreFile(owner, repositoryName) {
    const amplicationIgnoreManger = new AmplicationIgnoreManger();
    await amplicationIgnoreManger.init(async (fileName) => {
      try {
        const file = await this.provider.getFile({
          owner,
          repositoryName,
          path: fileName,
        });
        if (!file) {
          return "";
        }
        const { content, htmlUrl, name } = file;
        this.logger.info(`Got ${name} file ${htmlUrl}`);
        return content;
      } catch (error) {
        this.logger.info("Repository does not have a .amplicationignore file");
        return "";
      }
    });
    return amplicationIgnoreManger;
  }

  private async createInitialCommit(args: {
    repositoryName: string;
    gitClient: GitClient;
    defaultBranch: string;
    cloneDir: string;
  }) {
    const { gitClient, repositoryName, defaultBranch, cloneDir } = args;
    const defaultREADMEFile = getDefaultREADMEFile(repositoryName);
    await gitClient.checkout(defaultBranch);
    await writeFile(normalize(join(cloneDir, "README.md")), defaultREADMEFile);
    await gitClient.git.add(["."]).commit("Initial commit").push();
  }

  private async isHaveFirstCommitInDefaultBranch(args: {
    owner: string;
    repositoryName: string;
    defaultBranch: string;
  }): Promise<boolean> {
    const { owner, repositoryName, defaultBranch } = args;
    const defaultBranchFirstCommit = this.provider.getFirstCommitOnBranch({
      branchName: defaultBranch,
      owner,
      repositoryName,
    });

    return Boolean(defaultBranchFirstCommit);
  }
}
