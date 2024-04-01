import { trimEnd } from 'lodash';
import { Observable, from } from 'rxjs';
import { stringify } from '@osd/std';
import { getTimeField } from '../../../../src/plugins/data/common';
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
    // TODO: inspect request adapter
    // TODO: query parser in service to invoke preflight
    // TODO: bank on created index pattern but create temporary index pattern
    const dataFrame = searchRequest.params.body.df;
    let queryString = searchRequest.params.body.query.queries[0].query;
    if (dataFrame) {
      const timeField = getTimeField(dataFrame);

      const fromDate = timefilter.timefilter.getTime().from;
      const toDate = timefilter.timefilter.getTime().to;

      const auto = this.aggsService.calculateAutoTimeExpression({
        from: fromDate,
        to: toDate,
        mode: 'absolute',
      });

      queryString = `${queryString} | stats count() by span(${timeField?.name}, ${auto})`;

      queryString = `${queryString} | where  ${timeField?.name} >= '${formatDate(fromDate)}' and ${
        timeField?.name
      } <= '${formatDate(toDate)}'`;
    }

    const body = stringify({ query: { qs: queryString, format: 'jdbc' }, df: dataFrame ?? null });

    return from(
      this.deps.http.fetch({
        method: 'POST',
        path,
        body,
        signal,
      })
    );
  }

  public search(request: IOpenSearchDashboardsSearchRequest, options: ISearchOptions) {
    return this.runSearch(request, options.abortSignal, PPL_SEARCH_STRATEGY);
  }
}
