import React, { useEffect } from "react";
import { Route, Switch, useHistory } from "react-router-dom";
import { configure } from "react-hotkeys";

import ApplicationLayout from "./Application/ApplicationLayout";
import Login from "./User/Login";
import Signup from "./User/Signup";
import Applications from "./Application/Applications";

import PrivateRoute from "./authentication/PrivateRoute";
import BreadcrumbsProvider from "./Layout/BreadcrumbsProvider";
import { track, dispatch, init as initAnalytics } from "./util/analytics";

const { NODE_ENV } = process.env;

const context = {
  source: "amplication-client",
};

export const enhance = track<keyof typeof context>(
  // app-level tracking data
  context,

  {
    dispatch,
  }
);

function App() {
  const history = useHistory();
  if (NODE_ENV === "development") {
    history.listen((...args) => {
      console.debug("History: ", ...args);
    });
  }

  useEffect(() => {
    initAnalytics();
  }, []);

  //The default behavior across all <HotKeys> components
  configure({
    //Disable simulate keypress events for the keys that do not natively emit them
    //When Enabled - events are not captured after using Enter in <textarea/>
    simulateMissingKeyPressEvents: false,
    //Clear the ignoreTags array to includes events on textarea and input
    ignoreTags: [],
    logLevel: "debug",
  });

  return (
    <BreadcrumbsProvider>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <PrivateRoute exact path="/" component={Applications} />
        <PrivateRoute path="/:application" component={ApplicationLayout} />
      </Switch>
    </BreadcrumbsProvider>
  );
}

export default enhance(App);
