import { first } from 'rxjs/operators';
import { SharedGlobalConfig, Logger, ILegacyClusterClient } from 'opensearch-dashboards/server';
import { Observable } from 'rxjs';
import {
  ISearchStrategy,
  getDefaultSearchParams,
  SearchUsage,
} from '../../../../src/plugins/data/server';
import {
  IDataFrameResponse,
  IDataFrameWithAggs,
  IOpenSearchDashboardsSearchRequest,
  PartialDataFrame,
  createDataFrame,
} from '../../../../src/plugins/data/common';
import { PPLFacet } from './ppl_facet';
import { formatDate } from './utils';

export const pplSearchStrategyProvider = (
  config$: Observable<SharedGlobalConfig>,
  logger: Logger,
  client: ILegacyClusterClient,
  usage?: SearchUsage
): ISearchStrategy<IOpenSearchDashboardsSearchRequest, IDataFrameResponse> => {
  const pplFacet = new PPLFacet(client);

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

  return {
    search: async (context, request: any, options) => {
      const config = await config$.pipe(first()).toPromise();
      const uiSettingsClient = await context.core.uiSettings.client;

      // ignoreThrottled is not supported in OSS
      const { ignoreThrottled, ...defaultParams } = await getDefaultSearchParams(uiSettingsClient);

      // const params = toSnakeCase({
      //   ...defaultParams,
      //   ...getShardTimeout(config),
      // });

      try {
        // if (!request.body.query) {
        //   return handleEmptyRequest();
        // }

        const requestParams = parseRequest(request.body.query);

        request.body.query = requestParams.search;
        const rawResponse: any = await pplFacet.describeQuery(request);
        const source = requestParams.map.get('search source');

        const partial: PartialDataFrame = {
          name: source,
          fields: rawResponse.data.schema,
        };
        const dataFrame = createDataFrame(partial);
        dataFrame.fields.forEach((field, index) => {
          field.values = rawResponse.data.datarows.map((row: any) => row[index]);
          if (field.type === 'date') {
            field.format = { convert: (value: any) => formatDate(value) };
          }
        });

        dataFrame.size = rawResponse.data.datarows.length;

        if (usage) usage.trackSuccess(rawResponse.took);

        if (requestParams.aggs) {
          request.body.query = requestParams.aggs;
          const rawAggs: any = await pplFacet.describeQuery(request);
          (dataFrame as IDataFrameWithAggs).aggs = rawAggs.data.datarows.map((hit: any) => {
            return {
              key: hit[1],
              value: hit[0],
            };
          });
        }

        return {
          type: 'data_frame',
          body: dataFrame,
          took: rawResponse.took,
        } as IDataFrameResponse;
      } catch (e) {
        logger.error(`pplSearchStrategy: ${e.message}`);
        if (usage) usage.trackError();
        throw e;
      }
    },
  };
};
