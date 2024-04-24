import { trimEnd } from 'lodash';
import { Observable, from } from 'rxjs';
import { stringify } from '@osd/std';
import { concatMap } from 'rxjs/operators';
import { getRawQueryString, getTimeField } from '../../../../src/plugins/data/common';
import {
  DataPublicPluginStart,
  IOpenSearchDashboardsSearchRequest,
  IOpenSearchDashboardsSearchResponse,
  ISearchOptions,
  SearchInterceptor,
  SearchInterceptorDeps,
} from '../../../../src/plugins/data/public';
import { formatDate, PPL_SEARCH_STRATEGY } from '../../common';
import { QlDashboardsPluginStartDependencies } from '../types';

export class QlSearchInterceptor extends SearchInterceptor {
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
    const path = trimEnd('/api/ql/search');
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
      const auto = this.aggsService.calculateAutoTimeExpression({
        from: fromDate,
        to: toDate,
        mode: 'absolute',
      });

      return ` | stats count() by span(${timeField?.name}, ${auto}) | where ${
        timeField?.name
      } >= '${formatDate(fromDate)}' and ${timeField?.name} <= '${formatDate(toDate)}'`;
    };

    let queryString = getRawQueryString(searchRequest) ?? '';
    const dataFrame = searchRequest.params.body.df;

    if (!dataFrame) {
      return fetchDataFrame(queryString).pipe(
        concatMap((response) => {
          const df = response.body;
          const timeField = getTimeField(df);
          queryString += getTimeFilter(timeField);
          return fetchDataFrame(queryString, df);
        })
      );
    }

    if (dataFrame) {
      const timeField = getTimeField(dataFrame);
      queryString += getTimeFilter(timeField);
    }

    return fetchDataFrame(queryString, dataFrame);
  }

  public search(request: IOpenSearchDashboardsSearchRequest, options: ISearchOptions) {
    return this.runSearch(request, options.abortSignal, PPL_SEARCH_STRATEGY);
  }
}
