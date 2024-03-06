import { first } from 'rxjs/operators';
import { SharedGlobalConfig, Logger, ILegacyClusterClient } from 'opensearch-dashboards/server';
import { SearchResponse } from 'elasticsearch';
import { Observable } from 'rxjs';
import { ApiResponse } from '@opensearch-project/opensearch';
import { DataSourcePluginSetup } from 'src/plugins/data_source/server';
import { TransportRequestPromise } from '@opensearch-project/opensearch/lib/Transport';
import {
  ISearchStrategy,
  getDefaultSearchParams,
  getTotalLoaded,
  getShardTimeout,
  shimAbortSignal,
  SearchUsage,
  toSnakeCase,
} from '../../../../src/plugins/data/server';
import { PPLFacet } from './ppl_facet';

export const pplSearchStrategyProvider = (
  config$: Observable<SharedGlobalConfig>,
  logger: Logger,
  client: ILegacyClusterClient,
  usage?: SearchUsage,
  dataSource?: DataSourcePluginSetup,
  withLongNumeralsSupport?: boolean
): ISearchStrategy => {
  const pplFacet = new PPLFacet(client);

  return {
    search: async (context, request, options) => {
      const config = await config$.pipe(first()).toPromise();
      const uiSettingsClient = await context.core.uiSettings.client;

      // Only default index pattern type is supported here.
      // See data_enhanced for other type support.
      if (!!request.indexType) {
        throw new Error(`Unsupported index pattern type ${request.indexType}`);
      }

      // ignoreThrottled is not supported in OSS
      const { ignoreThrottled, ...defaultParams } = await getDefaultSearchParams(uiSettingsClient);

      const params = toSnakeCase({
        ...defaultParams,
        ...getShardTimeout(config),
        ...request.params,
      });

      try {
        if (
          dataSource?.dataSourceEnabled() &&
          !dataSource?.defaultClusterEnabled() &&
          !request.dataSourceId
        ) {
          throw new Error(`Data source id is required when no openseach hosts config provided`);
        }

        const promise = shimAbortSignal(
          (pplFacet.describeQuery(params?.body?.query) as unknown) as TransportRequestPromise<
            SearchResponse<any>
          >,
          options?.abortSignal
        );

        const { body: rawResponse } = ((await promise) as unknown) as ApiResponse<
          SearchResponse<any>
        >;

        logger.info(JSON.stringify(rawResponse));

        if (usage) usage.trackSuccess(rawResponse.took);

        // The above query will either complete or timeout and throw an error.
        // There is no progress indication on this api.
        return {
          isPartial: false,
          isRunning: false,
          rawResponse: rawResponse.hits.hits[0]._source,
          ...getTotalLoaded(rawResponse._shards),
          withLongNumeralsSupport,
        };
      } catch (e) {
        if (usage) usage.trackError();

        if (dataSource?.dataSourceEnabled()) {
          throw dataSource.createDataSourceError(e);
        }
        throw e;
      }
    },
  };
};
