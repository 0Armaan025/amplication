import { parse } from "path";
import { GitProvider } from "../../git-provider.interface";
import {
  OAuthData,
  Branch,
  CreateBranchIfNotExistsArgs,
  CreateCommitArgs,
  CreatePullRequestForBranchArgs,
  CreatePullRequestFromFilesArgs,
  CreateRepositoryArgs,
  CurrentUser,
  GetFileArgs,
  GetPullRequestForBranchArgs,
  GetRepositoriesArgs,
  GetRepositoryArgs,
  GitFile,
  RemoteGitOrganization,
  RemoteGitRepos,
  RemoteGitRepository,
  CloneUrlArgs,
  Commit,
  CreateBranchArgs,
  CreatePullRequestCommentArgs,
  EnumGitProvider,
  GetBranchArgs,
  PullRequest,
  GitProviderArgs,
  PaginatedGitGroup,
  BitBucketConfiguration,
} from "../../types";
import { CustomError, NotImplementedError } from "../../utils/custom-error";
import {
  authDataRequest,
  authorizeRequest,
  createCommitRequest,
  currentUserRequest,
  currentUserWorkspacesRequest,
  getFileMetaRequest,
  getFileRequest,
  refreshTokenRequest,
  repositoriesInWorkspaceRequest,
  repositoryCreateRequest,
  repositoryRequest,
} from "./requests";
import { ILogger } from "@amplication/util/logging";
import { PaginatedTreeEntry, TreeEntry } from "./bitbucket.types";

export class BitBucketService implements GitProvider {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string;
  private refreshToken: string;
  public readonly name = EnumGitProvider.Bitbucket;
  public readonly domain = "bitbucket.com";

  constructor(
    private readonly gitProviderArgs: GitProviderArgs,
    private readonly providerConfiguration: BitBucketConfiguration,
    private readonly logger: ILogger
  ) {}

  async init(): Promise<void> {
    this.logger.info("BitbucketService init");
    const { accessToken, refreshToken } =
      this.gitProviderArgs.providerOrganizationProperties;
    const { clientId, clientSecret } = this.providerConfiguration;

    if (!clientId || !clientSecret) {
      this.logger.error("Missing Bitbucket configuration");
      throw new Error("Missing Bitbucket configuration");
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  getGitInstallationUrl(amplicationWorkspaceId: string): Promise<string> {
    return authorizeRequest(this.clientId, amplicationWorkspaceId);
  }

  async getAccessToken(authorizationCode: string): Promise<OAuthData> {
    const authData = await authDataRequest(
      this.clientId,
      this.clientSecret,
      authorizationCode
    );

    this.logger.info("BitBucketService: getAccessToken");

    return {
      accessToken: authData.access_token,
      refreshToken: authData.refresh_token,
      scopes: authData.scopes.split(" "),
      tokenType: authData.token_type,
      expiresAt: Date.now() + authData.expires_in * 1000, // 7200 seconds = 2 hours
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthData> {
    const newOAuthData = await refreshTokenRequest(
      this.clientId,
      this.clientSecret,
      refreshToken
    );

    this.logger.info("BitBucketService: refreshAccessToken");

    return {
      accessToken: newOAuthData.access_token,
      refreshToken: newOAuthData.refresh_token,
      scopes: newOAuthData.scopes.split(" "),
      tokenType: newOAuthData.token_type,
      expiresAt: Date.now() + newOAuthData.expires_in * 1000, // 7200 seconds = 2 hours
    };
  }

  async getCurrentOAuthUser(accessToken: string): Promise<CurrentUser> {
    const currentUser = await currentUserRequest(accessToken);

    const { links, display_name, username, uuid } = currentUser;
    this.logger.info("BitBucketService getCurrentUser");
    return {
      links,
      displayName: display_name,
      username,
      uuid,
      useGroupingForRepositories: true,
    };
  }

  async getGitGroups(): Promise<PaginatedGitGroup> {
    const paginatedWorkspaceMembership = await currentUserWorkspacesRequest(
      this.accessToken
    );

    const { size, page, pagelen, next, previous, values } =
      paginatedWorkspaceMembership;
    const gitGroups = values.map(({ workspace }) => {
      const { uuid: workspaceUuid, name, slug } = workspace;
      return {
        id: workspaceUuid,
        name,
        slug,
      };
    });

    this.logger.info("BitBucketService getGitGroups");

    return {
      size,
      page,
      pagelen,
      next,
      previous,
      groups: gitGroups,
    };
  }

  async getOrganization(): Promise<RemoteGitOrganization> {
    throw NotImplementedError;
  }

  async getRepository(
    getRepositoryArgs: GetRepositoryArgs
  ): Promise<RemoteGitRepository> {
    const { gitGroupName, repositoryName } = getRepositoryArgs;

    if (!gitGroupName) {
      this.logger.error("Missing gitGroupName");
      throw new CustomError("Missing gitGroupName");
    }

    const repository = await repositoryRequest(
      gitGroupName,
      repositoryName,
      this.accessToken
    );
    const { links, name, is_private, full_name, mainbranch, accessLevel } =
      repository;

    return {
      name,
      url: links.self.href,
      private: is_private,
      fullName: full_name,
      admin: !!(accessLevel === "admin"),
      defaultBranch: mainbranch.name,
    };
  }

  async getRepositories(
    getRepositoriesArgs: GetRepositoriesArgs
  ): Promise<RemoteGitRepos> {
    const { gitGroupName } = getRepositoriesArgs;

    if (!gitGroupName) {
      this.logger.error("Missing gitGroupName");
      throw new CustomError("Missing gitGroupName");
    }

    const repositoriesInWorkspace = await repositoriesInWorkspaceRequest(
      gitGroupName,
      this.accessToken
    );

    const { size, page, pagelen, values } = repositoriesInWorkspace;
    const gitRepos = values.map(
      ({ name, is_private, links, full_name, mainbranch, accessLevel }) => {
        return {
          name,
          url: links.self.href,
          private: is_private,
          fullName: full_name,
          admin: !!(accessLevel === "admin"),
          defaultBranch: mainbranch.name,
        };
      }
    );

    return {
      repos: gitRepos,
      totalRepos: size,
      currentPage: page,
      pageSize: pagelen,
    };
  }

  async createRepository(
    createRepositoryArgs: CreateRepositoryArgs
  ): Promise<RemoteGitRepository> {
    const {
      gitGroupName,
      repositoryName,
      isPrivateRepository,
      gitOrganization,
    } = createRepositoryArgs;

    if (!gitGroupName) {
      this.logger.error("Missing gitGroupName");
      throw new CustomError("Missing gitGroupName");
    }

    const newRepository = await repositoryCreateRequest(
      gitGroupName,
      repositoryName,
      {
        is_private: isPrivateRepository,
        name: repositoryName,
        full_name: `${gitOrganization.name}/${repositoryName}`,
      },
      this.accessToken
    );

    return {
      name: newRepository.name,
      url: "https://bitbucket.org/" + newRepository.full_name,
      private: newRepository.is_private,
      fullName: newRepository.full_name,
      admin: !!(newRepository.accessLevel === "admin"),
      defaultBranch: newRepository.mainbranch.name,
    };
  }

  deleteGitOrganization(): Promise<boolean> {
    throw NotImplementedError;
  }

  // pull request flow

  async getFile(file: GetFileArgs): Promise<GitFile | null> {
    const { owner, repositoryName, baseBranchName, path } = file;

    if (!baseBranchName) {
      this.logger.error("Missing baseBranchName");
      throw new CustomError("Missing baseBranchName");
    }

    const fileResponse = await getFileMetaRequest(
      owner,
      repositoryName,
      baseBranchName,
      path,
      this.accessToken
    );

    const fileBufferResponse = await getFileRequest(
      owner,
      repositoryName,
      baseBranchName,
      path,
      this.accessToken
    );

    if ((fileResponse as PaginatedTreeEntry).values) {
      this.logger.error(
        "BitbucketService getFile: Path points to a directory, please provide a file path"
      );
      throw new CustomError(
        "Path points to a directory, please provide a file path"
      );
    }

    const gitFileResponse = fileResponse as TreeEntry;
    this.logger.info("BitBucketService getFile");

    return {
      content: fileBufferResponse.toString("utf-8"),
      htmlUrl: gitFileResponse.commit.links.html.href,
      name: parse(gitFileResponse.path).name,
      path: gitFileResponse.path,
    };
  }

  createPullRequestFromFiles(
    createPullRequestFromFilesArgs: CreatePullRequestFromFilesArgs
  ): Promise<string> {
    throw NotImplementedError;
  }

  createBranchIfNotExists(
    createBranchIfNotExistsArgs: CreateBranchIfNotExistsArgs
  ): Promise<Branch> {
    throw NotImplementedError;
  }

  async createCommit(createCommitArgs: CreateCommitArgs): Promise<void> {
    const { repositoryName, owner, files, branchName, commitMessage } =
      createCommitArgs;
    const commit = await createCommitRequest(
      owner,
      repositoryName,
      commitMessage,
      {},
      this.accessToken
    );
  }

  getPullRequestForBranch(
    getPullRequestForBranchArgs: GetPullRequestForBranchArgs
  ): Promise<{ url: string; number: number }> {
    throw NotImplementedError;
  }

  createPullRequestForBranch(
    createPullRequestForBranchArgs: CreatePullRequestForBranchArgs
  ): Promise<PullRequest> {
    throw NotImplementedError;
  }
  getBranch(args: GetBranchArgs): Promise<Branch | null> {
    throw NotImplementedError;
  }
  createBranch(args: CreateBranchArgs): Promise<Branch> {
    throw NotImplementedError;
  }
  getFirstCommitOnBranch(args: GetBranchArgs): Promise<Commit> {
    throw NotImplementedError;
  }
  getCurrentUserCommitList(args: GetBranchArgs): Promise<Commit[]> {
    throw NotImplementedError;
  }
  getCloneUrl(args: CloneUrlArgs): string {
    throw NotImplementedError;
  }
  commentOnPullRequest(args: CreatePullRequestCommentArgs): Promise<void> {
    throw NotImplementedError;
  }
  getToken(): Promise<string> {
    throw NotImplementedError;
  }
}
