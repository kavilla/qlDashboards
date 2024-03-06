import React from 'react';
import ReactDOM from 'react-dom';
import { AppMountParameters, CoreStart } from '../../../src/core/public';
import { QlDashboardsPluginStartDependencies } from './types';
import { QlPluginApp } from './components/app';

export const renderApp = (
  { notifications, http }: CoreStart,
  { navigation }: QlDashboardsPluginStartDependencies,
  { appBasePath, element }: AppMountParameters
) => {
  ReactDOM.render(
    <QlPluginApp
      basename={appBasePath}
      notifications={notifications}
      http={http}
      navigation={navigation}
    />,
    element
  );

  return () => ReactDOM.unmountComponentAtNode(element);
};
