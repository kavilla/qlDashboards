import { PluginInitializerContext } from '../../../src/core/server';
import { QlDashboardsPlugin } from './plugin';

// This exports static code and TypeScript types,
// as well as, OpenSearch Dashboards Platform `plugin()` initializer.

export function plugin(initializerContext: PluginInitializerContext) {
  return new QlDashboardsPlugin(initializerContext);
}

export { QlDashboardsPluginSetup, QlDashboardsPluginStart } from './types';
