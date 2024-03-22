import { PluginConfigDescriptor, PluginInitializerContext } from '../../../src/core/server';
import { QlDashboardsPlugin } from './plugin';
import { configSchema, ConfigSchema } from '../common/config';

// This exports static code and TypeScript types,
// as well as, OpenSearch Dashboards Platform `plugin()` initializer.

export const config: PluginConfigDescriptor<ConfigSchema> = {
  exposeToBrowser: {},
  schema: configSchema,
};

export function plugin(initializerContext: PluginInitializerContext) {
  return new QlDashboardsPlugin(initializerContext);
}

export { QlDashboardsPluginSetup, QlDashboardsPluginStart } from './types';
