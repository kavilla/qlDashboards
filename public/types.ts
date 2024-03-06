import { DataPublicPluginSetup } from 'src/plugins/data/public';
import { NavigationPublicPluginStart } from '../../../src/plugins/navigation/public';

export interface QlDashboardsPluginSetup {
  getGreeting: () => string;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface QlDashboardsPluginStart {}

export interface QlDashboardsPluginSetupDependencies {
  data: DataPublicPluginSetup;
}

export interface QlDashboardsPluginStartDependencies {
  navigation: NavigationPublicPluginStart;
}
