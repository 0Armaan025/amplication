import React, { useCallback, useContext } from "react";
import { match } from "react-router-dom";
import "./CreateServiceWizard.scss";
import { AppRouteProps } from "../../routes/routesUtil";
import { AppContext } from "../../context/appContext";
import AuthWithGit from "../git/AuthWithGit";

type Props = AppRouteProps & {
  match: match<{
    workspace: string;
    project: string;
  }>;
};

const CreateGithubSync: React.FC<Props> = ({ moduleClass }) => {
  const { refreshCurrentWorkspace } = useContext(AppContext);

  const handleOnDone = useCallback(() => {
    refreshCurrentWorkspace();
  }, [refreshCurrentWorkspace]);

  return (
    <div className={`${moduleClass}__splitWrapper`}>
      <div className={`${moduleClass}__left`}>
        <div className={`${moduleClass}__description`}>
          <div className={`${moduleClass}__description_top`}>
            <h2>Now, let’s connect to a Git repository</h2>
          </div>
          <div className={`${moduleClass}__description_bottom`}>
            <h3>
              Amplication automatically pushes the generated code of your
              services to a git repository. You are the owner of the code and
              can freely customize it.
            </h3>
          </div>
        </div>
      </div>
      <div className={`${moduleClass}__right`}>
        <div className={`${moduleClass}__github_box`}>
          <AuthWithGit onDone={handleOnDone}></AuthWithGit>
        </div>
      </div>
    </div>
  );
};

export default CreateGithubSync;
