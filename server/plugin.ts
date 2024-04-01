import { Observable } from 'rxjs';
import {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
  SharedGlobalConfig,
} from '../../../src/core/server';

import {
  QlDashboardsPluginSetup,
  QlDashboardsPluginSetupDependencies,
  QlDashboardsPluginStart,
} from './types';
import { defineRoutes } from './routes';
import { PPLPlugin } from './search/ppl_plugin';
import { EnginePlugin } from './search/engine_plugin';
import { PPL_SEARCH_STRATEGY } from '../common';
import { pplSearchStrategyProvider } from './search/ppl_search_strategy';

export class QlDashboardsPlugin
  implements Plugin<QlDashboardsPluginSetup, QlDashboardsPluginStart> {
  private readonly logger: Logger;
  private readonly config$: Observable<SharedGlobalConfig>;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
    this.config$ = initializerContext.config.legacy.globalConfig$;
  }

  public setup(core: CoreSetup, { data }: QlDashboardsPluginSetupDependencies) {
    this.logger.debug('qlDashboards: Setup');
    const router = core.http.createRouter();
    // Register server side APIs
    const client = core.opensearch.legacy.createClient('opensearch_observability', {
      plugins: [PPLPlugin, EnginePlugin],
    });

    const searchStrategy = pplSearchStrategyProvider(this.config$, this.logger, client);
    data.search.registerSearchStrategy(PPL_SEARCH_STRATEGY, searchStrategy);

    defineRoutes(this.logger, router, searchStrategy);

    this.logger.info('qlDashboards: Setup complete');
    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('qlDashboards: Started');
    return {};
  }

  public stop() {}
}
