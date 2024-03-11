import { first } from 'rxjs/operators';
import { SharedGlobalConfig, Logger, ILegacyClusterClient } from 'opensearch-dashboards/server';
import { Observable } from 'rxjs';
import { DataSourcePluginSetup } from 'src/plugins/data_source/server';
import {
  ISearchStrategy,
  getDefaultSearchParams,
  SearchUsage,
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

  const handleEmptyRequest = () => {
    return {
      success: true,
      isPartial: false,
      isRunning: false,
      rawResponse: {
        took: 0,
        timed_out: false,
        _shards: {
          total: 1,
          successful: 1,
          skipped: 0,
          failed: 0,
        },
        hits: {
          hits: [],
        },
      },
      total: 0,
      loaded: 0,
      withLongNumeralsSupport: withLongNumeralsSupport ?? false,
    };
  }

  return {
    search: async (context, request: any, options) => {
      const config = await config$.pipe(first()).toPromise();
      const uiSettingsClient = await context.core.uiSettings.client;

      // Only default index pattern type is supported here.
      // See data_enhanced for other type support.
      if (!!request.indexType) {
        throw new Error(`Unsupported index pattern type ${request.indexType}`);
      }

      // ignoreThrottled is not supported in OSS
      const { ignoreThrottled, ...defaultParams } = await getDefaultSearchParams(uiSettingsClient);

      // const params = toSnakeCase({
      //   ...defaultParams,
      //   ...getShardTimeout(config),
      // });

      try {
        if (
          dataSource?.dataSourceEnabled() &&
          !dataSource?.defaultClusterEnabled() &&
          !request.dataSourceId
        ) {
          throw new Error(`Data source id is required when no openseach hosts config provided`);
        }

        if (!request.body.query) {
          return handleEmptyRequest();
        }

        const rawResponse: any = await pplFacet.describeQuery(request);
        const query: string = request.body.query;
        const source = query.substring(query.indexOf('search source=') + 14, query.indexOf('|'));
        const fields = query.substring(query.indexOf('fields') + 7).split(',');

        const response = rawResponse.data.datarows.map((hit: any) => {
          return {
            _index: source,
            _source: fields.reduce((obj: any, field: string, index: number) => {
              obj[field] = hit[index];
              return obj;
            }, {}),
          };
        });

        // if (usage) usage.trackSuccess(rawResponse.took);

        // The above query will either complete or timeout and throw an error.
        // There is no progress indication on this api.
        return {
          success: true,
          isPartial: false,
          isRunning: false,
          rawResponse: {
            took: 0,
            timed_out: false,
            _shards: {
              total: 1,
              successful: 1,
              skipped: 0,
              failed: 0,
            },
            hits: {
              hits: response,
            },
          },
          total: rawResponse.data.total,
          loaded: rawResponse.data.size,
          withLongNumeralsSupport: withLongNumeralsSupport ?? false,
        } as any;
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
