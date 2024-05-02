import { i18n } from '@osd/i18n';
import moment from 'moment';
import { AppMountParameters, CoreSetup, CoreStart, Plugin } from '../../../src/core/public';
import {
  QlDashboardsPluginSetup,
  QlDashboardsPluginStart,
  QlDashboardsPluginStartDependencies,
  QlDashboardsPluginSetupDependencies,
} from './types';
import { PLUGIN_NAME } from '../common';
import { PPLQlSearchInterceptor } from './search/ppl_search_interceptor';
import { SQLQlSearchInterceptor } from './search/sql_search_interceptor';

export class QlDashboardsPlugin
  implements Plugin<QlDashboardsPluginSetup, QlDashboardsPluginStart> {
  public setup(
    core: CoreSetup,
    { data }: QlDashboardsPluginSetupDependencies
  ): QlDashboardsPluginSetup {
    // Register an application into the side navigation menu
    core.application.register({
      id: 'qlDashboards',
      title: PLUGIN_NAME,
      async mount(params: AppMountParameters) {
        // Load application bundle
        const { renderApp } = await import('./application');
        // Get start services as specified in opensearch_dashboards.json
        const [coreStart, depsStart] = await core.getStartServices();
        // Render the application
        return renderApp(coreStart, depsStart as QlDashboardsPluginStartDependencies, params);
      },
    });

    const pplSearchInterceptor = new PPLQlSearchInterceptor({
      toasts: core.notifications.toasts,
      http: core.http,
      uiSettings: core.uiSettings,
      startServices: core.getStartServices(),
      usageCollector: data.search.usageCollector,
    });

    const sqlSearchInterceptor = new SQLQlSearchInterceptor({
      toasts: core.notifications.toasts,
      http: core.http,
      uiSettings: core.uiSettings,
      startServices: core.getStartServices(),
      usageCollector: data.search.usageCollector,
    });

    data.__enhance({
      ui: {
        query: {
          language: 'PPL',
          search: pplSearchInterceptor,
          searchBar: {
            queryStringInput: { initialValue: 'source=<data_source>' },
            dateRange: {
              initialFrom: moment().subtract(2, 'days').toISOString(),
              initialTo: moment().add(2, 'days').toISOString(),
            },
          },
          fields: {
            visualizable: false,
          },
          supportedAppNames: ['discover'],
        },
      },
    });

    data.__enhance({
      ui: {
        query: {
          language: 'SQL',
          search: sqlSearchInterceptor,
          searchBar: {
            showDatePicker: false,
            showFilterBar: false,
            queryStringInput: { initialValue: 'SELECT * FROM <data_source>' },
          },
          fields: {
            filterable: false,
            visualizable: false,
          },
          showDocLinks: false,
          supportedAppNames: ['discover'],
        },
      },
    });

    // Return methods that should be available to other plugins
    return {
      getGreeting() {
        return i18n.translate('qlPlugin.greetingText', {
          defaultMessage: 'Hello from {name}!',
          values: {
            name: PLUGIN_NAME,
          },
        });
      },
    };
  }

  public start(core: CoreStart): QlDashboardsPluginStart {
    return {};
  }

  public stop() {}
}
