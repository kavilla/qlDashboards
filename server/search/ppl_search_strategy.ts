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
  };

  // search source=opensearch_dashboards_sample_data_logs| fields agent,bytes,timestamp,clientip | stats count() by span(timestamp, 12h) | where timestamp >= '2024-02-02 16:00:00.000000' and timestamp <= '2024-03-15 16:49:13.456000'

  const parseRequest = (query: string) => {
    const pipeMap = new Map<string, string>();
    const pipeArray = query.split('|');
    pipeArray.forEach((pipe, index) => {
      const split = pipe.trim().split(index === 0 ? '=' : ' ');
      const key = split[0];
      const value = pipe.replace(index === 0 ? `${key}=` : key, '').trim();
      pipeMap.set(key, value);
    });

    const source = pipeMap.get('search source');
    const searchQuery = Array.from(pipeMap.entries())
      .filter(([key]) => key !== 'stats')
      .map(([key, value]) => (key === 'search source' ? `${key}=${value}` : `${key} ${value}`))
      .join(' | ');

    const filters = pipeMap.get('where');

    const stats = pipeMap.get('stats');
    const aggsQuery = stats
      ? `search source=${source} ${filters ? `| where ${filters}` : ''} | stats ${stats}`
      : undefined;

    return {
      map: pipeMap,
      search: searchQuery,
      aggs: aggsQuery,
    };
  };

  const getFields = async (source: string) => {
    const rawHead: any = await pplFacet.describeQuery({
      body: {
        format: 'jdbc',
        query: `search source=${source} | head 1`,
      },
    });
    return rawHead.data.schema.map((field: any) => field.name);
  };

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

        const requestParams = parseRequest(request.body.query);

        request.body.query = requestParams.search;
        const rawResponse: any = await pplFacet.describeQuery(request);
        const source = requestParams.map.get('search source');
        const fields = requestParams.map.has('fields')
          ? requestParams.map.get('fields')!.split(',')
          : await getFields(source!);

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
        const searchResponse = {
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
          total: 1,
          loaded: 1,
          withLongNumeralsSupport: withLongNumeralsSupport ?? false,
        } as any;

        if (requestParams.aggs) {
          request.body.query = requestParams.aggs;
          const rawAggs: any = await pplFacet.describeQuery(request);

          let totalDocs = 0;
          searchResponse.rawResponse.aggregations = {
            2: {
              buckets: rawAggs.data.datarows.map((hit: any) => {
                totalDocs += hit[0];
                return {
                  key_as_string: hit[1],
                  key: new Date(hit[1]).getTime(),
                  doc_count: hit[0],
                };
              }),
            },
          };

          searchResponse.rawResponse.hits.total = totalDocs;
        }

        return searchResponse;
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
