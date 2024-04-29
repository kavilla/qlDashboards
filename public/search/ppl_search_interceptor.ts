import { trimEnd } from 'lodash';
import { Observable, from } from 'rxjs';
import { stringify } from '@osd/std';
import { concatMap } from 'rxjs/operators';
import {
  DataFrameAggConfig,
  getAggConfig,
  getRawDataFrame,
  getRawQueryString,
  getTimeField,
  getUniqueValuesForRawAggs,
} from '../../../../src/plugins/data/common';
import {
  DataPublicPluginStart,
  IOpenSearchDashboardsSearchRequest,
  IOpenSearchDashboardsSearchResponse,
  ISearchOptions,
  SearchInterceptor,
  SearchInterceptorDeps,
} from '../../../../src/plugins/data/public';
import { formatDate, PPL_SEARCH_STRATEGY, removeKeyword } from '../../common';
import { QlDashboardsPluginStartDependencies } from '../types';

export class PPLQlSearchInterceptor extends SearchInterceptor {
  protected queryService!: DataPublicPluginStart['query'];
  protected aggsService!: DataPublicPluginStart['search']['aggs'];

  constructor(deps: SearchInterceptorDeps) {
    super(deps);

    deps.startServices.then(([coreStart, depsStart]) => {
      this.queryService = (depsStart as QlDashboardsPluginStartDependencies).data.query;
      this.aggsService = (depsStart as QlDashboardsPluginStartDependencies).data.search.aggs;
    });
  }

  protected runSearch(
    request: IOpenSearchDashboardsSearchRequest,
    signal?: AbortSignal,
    strategy?: string
  ): Observable<IOpenSearchDashboardsSearchResponse> {
    const { id, ...searchRequest } = request;
    const path = trimEnd('/api/pplql/search');
    const { filterManager, timefilter } = this.queryService;
    const fromDate = timefilter.timefilter.getTime().from;
    const toDate = timefilter.timefilter.getTime().to;

    const fetchDataFrame = (queryString: string, df = null) => {
      const body = stringify({ query: { qs: queryString, format: 'jdbc' }, df });
      return from(
        this.deps.http.fetch({
          method: 'POST',
          path,
          body,
          signal,
        })
      );
    };

    const getTimeFilter = (timeField: any) => {
      return ` | where ${timeField?.name} >= '${formatDate(fromDate)}' and ${
        timeField?.name
      } <= '${formatDate(toDate)}'`;
    };

    const getAggString = (timeField: any, aggsConfig?: DataFrameAggConfig) => {
      if (!aggsConfig) {
        return ` | stats count() by span(${
          timeField?.name
        }, ${this.aggsService.calculateAutoTimeExpression({
          from: fromDate,
          to: toDate,
          mode: 'absolute',
        })})`;
      }
      if (aggsConfig.date_histogram) {
        return ` | stats count() by span(${timeField?.name}, ${
          aggsConfig.date_histogram.fixed_interval ??
          aggsConfig.date_histogram.calendar_interval ??
          this.aggsService.calculateAutoTimeExpression({
            from: fromDate,
            to: toDate,
            mode: 'absolute',
          })
        })`;
      }
      if (aggsConfig.avg) {
        return ` | stats avg(${aggsConfig.avg.field})`;
      }
      if (aggsConfig.cardinality) {
        return ` | dedup ${aggsConfig.cardinality.field} | stats count()`;
      }
      if (aggsConfig.terms) {
        return ` | stats count() by ${aggsConfig.terms.field}`;
      }
      if (aggsConfig.id === 'other-filter') {
        const uniqueConfig = getUniqueValuesForRawAggs(aggsConfig);
        if (
          !uniqueConfig ||
          !uniqueConfig.field ||
          !uniqueConfig.values ||
          uniqueConfig.values.length === 0
        ) {
          return '';
        }

        let otherQueryString = ` | stats count() by ${uniqueConfig.field}`;
        uniqueConfig.values.forEach((value, index) => {
          otherQueryString += ` ${index === 0 ? '| where' : 'and'} ${
            uniqueConfig.field
          }<>'${value}'`;
        });
        return otherQueryString;
      }
    };

    let queryString = removeKeyword(getRawQueryString(searchRequest)) ?? '';
    const dataFrame = getRawDataFrame(searchRequest);
    const aggConfig = getAggConfig(
      searchRequest,
      {},
      this.aggsService.types.get.bind(this)
    ) as DataFrameAggConfig;

    if (!dataFrame) {
      return fetchDataFrame(queryString).pipe(
        concatMap((response) => {
          const df = response.body;
          const timeField = getTimeField(df, aggConfig);
          const timeFilter = getTimeFilter(timeField);
          df.meta = {};
          df.meta.aggs = aggConfig;
          df.meta.aggQueryStrings = {};
          df.meta.aggQueryStrings[df.meta.aggs.id] = removeKeyword(
            `${queryString} ${getAggString(timeField, df.meta.aggs)} ${timeFilter}`
          );
          if (df.meta.aggs.aggs) {
            const subAggs = df.meta.aggs.aggs as Record<string, DataFrameAggConfig>;
            for (const [key, subAgg] of Object.entries(subAggs)) {
              const subAggConfig: Record<string, any> = {};
              subAggConfig[key] = subAgg;
              df.meta.aggQueryStrings[subAgg.id] = removeKeyword(
                `${queryString} ${getAggString(timeField, df.meta.aggs)} ${getAggString(
                  timeField,
                  subAggConfig as DataFrameAggConfig
                )} ${timeFilter}`
              );
            }
          }

          return fetchDataFrame(queryString, df);
        })
      );
    }

    if (dataFrame) {
      const timeField = getTimeField(dataFrame, aggConfig);
      const timeFilter = getTimeFilter(timeField);
      dataFrame.meta = {};
      dataFrame.meta.aggs = aggConfig;
      dataFrame.meta.aggQueryStrings = {};
      dataFrame.meta.aggQueryStrings[dataFrame.meta.aggs.id] = removeKeyword(
        `${queryString} ${getAggString(timeField, dataFrame.meta.aggs)} ${timeFilter}`
      );
      if (dataFrame.meta.aggs.aggs) {
        const subAggs = dataFrame.meta.aggs.aggs as Record<string, DataFrameAggConfig>;
        for (const [key, subAgg] of Object.entries(subAggs)) {
          const subAggConfig: Record<string, any> = {};
          subAggConfig[key] = subAgg;
          dataFrame.meta.aggQueryStrings[subAgg.id] = removeKeyword(
            `${queryString} ${getAggString(timeField, dataFrame.meta.aggs)} ${getAggString(
              timeField,
              subAggConfig as DataFrameAggConfig
            )} ${timeFilter}`
          );
        }
      }
      queryString += timeFilter;
    }

    return fetchDataFrame(queryString, dataFrame);
  }

  public search(request: IOpenSearchDashboardsSearchRequest, options: ISearchOptions) {
    return this.runSearch(request, options.abortSignal, PPL_SEARCH_STRATEGY);
  }
}
