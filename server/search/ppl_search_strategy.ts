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
  createDataFrame,
} from '../../../../src/plugins/data/common';
import { PPLFacet } from './ppl_facet';
import { getFields } from '../../common/utils';

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
      const splitChar = index === 0 ? '=' : ' ';
      const split = pipe.trim().split(splitChar);
      const key = split[0];
      const value = pipe.replace(index === 0 ? `${key}=` : key, '').trim();
      pipeMap.set(key, value);
    });

    const source = pipeMap.get('source');

    const describeQuery = `describe ${source}`;

    const searchQuery = `${Array.from(pipeMap.entries())
      .filter(([key]) => key !== 'stats' && key !== 'fields')
      .map(([key, value]) => (key === 'source' ? `${key}=${value}` : `${key} ${value}`))
      .join(' | ')} ${pipeMap.has('fields') ? `| fields ${pipeMap.get('fields')}` : ''}`;

    const filters = pipeMap.get('where');

    const stats = pipeMap.get('stats');
    const aggsQuery = stats
      ? `source=${source} ${filters ? `| where ${filters}` : ''} | stats ${stats}`
      : undefined;

    return {
      map: pipeMap,
      describe: describeQuery,
      search: searchQuery,
      aggs: aggsQuery,
    };
  };

  return {
    search: async (context, request: any, options) => {
      const config = await config$.pipe(first()).toPromise();
      const uiSettingsClient = await context.core.uiSettings.client;

      const { dataFrameHydrationStrategy, ...defaultParams } = await getDefaultSearchParams(
        uiSettingsClient
      );

      // const params = toSnakeCase({
      //   ...defaultParams,
      //   ...getShardTimeout(config),
      // });

      try {
        const requestParams = parseRequest(request.body.query.qs);
        const source = requestParams.map.get('source');
        const schema = request.body.df?.schema;
        request.body.query =
          !schema || dataFrameHydrationStrategy === 'perQuery'
            ? `source=${source} | head`
            : requestParams.search;
        const rawResponse: any = await pplFacet.describeQuery(request);

        const dataFrame = createDataFrame({
          name: source,
          schema: schema ?? rawResponse.data.schema,
          fields: getFields(rawResponse),
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
