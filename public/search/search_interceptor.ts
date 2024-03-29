import { trimEnd } from 'lodash';
import { Observable, from } from 'rxjs';
import { stringify } from '@osd/std';
import { formatFieldValue, getTimeField } from '../../../../src/plugins/data/common';
import {
  DataPublicPluginStart,
  IOpenSearchDashboardsSearchRequest,
  IOpenSearchDashboardsSearchResponse,
  ISearchOptions,
  SearchInterceptor,
  SearchInterceptorDeps,
} from '../../../../src/plugins/data/public';
import { formatDate } from '../../common';
import { QlDashboardsPluginStartDependencies } from '../types';

export class QlSearchInterceptor extends SearchInterceptor {
  protected queryService!: DataPublicPluginStart['query'];

  constructor(deps: SearchInterceptorDeps) {
    super(deps);

    deps.startServices.then(([coreStart, depsStart]) => {
      this.queryService = (depsStart as QlDashboardsPluginStartDependencies).data.query;
    });
  }

  protected runSearch(
    request: IOpenSearchDashboardsSearchRequest,
    signal?: AbortSignal
  ): Observable<IOpenSearchDashboardsSearchResponse> {
    const { id, ...searchRequest } = request;
    const path = trimEnd('/api/ql/search');

    const { filterManager, timefilter } = this.queryService;
    // console.log('params', searchRequest.params);
    // TODO: get timestamp field
    // TODO: disable relative time
    // TODO: calc_auto_interval for auto
    // TODO: pass interval to query if not auto
    // TODO: what to do with filters here?
    // TODO: inspect request adapter
    // TODO: query parser in service to invoke preflight
    // TODO: bank on created index pattern but create temporary index pattern
    const dataFrame = searchRequest.params.body.df;
    let queryString = searchRequest.params.body.query[0].query;
    if (dataFrame) {
      const timeField = getTimeField(dataFrame);
      // const formattedFrom = formatFieldValue(timeField!, timefilter.timefilter.getTime().from);
      // const formattedTo = formatFieldValue(timeField!, timefilter.timefilter.getTime().to);
      const formattedFrom = formatDate(timefilter.timefilter.getTime().from);
      const formattedTo = formatDate(timefilter.timefilter.getTime().to);
      queryString = `${queryString} | where  ${timeField?.name} >= '${formattedFrom}' and ${timeField?.name} <= '${formattedTo}'`;
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
    return this.runSearch(request, options.abortSignal);
  }
}
