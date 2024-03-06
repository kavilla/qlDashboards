import './index.scss';

import { QlDashboardsPlugin } from './plugin';

// This exports static code and TypeScript types,
// as well as, OpenSearch Dashboards Platform `plugin()` initializer.
export function plugin() {
  return new QlDashboardsPlugin();
}
export { QlDashboardsPluginSetup, QlDashboardsPluginStart } from './types';
