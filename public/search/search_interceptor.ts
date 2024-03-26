import { get, trimEnd, debounce } from 'lodash';
import { Observable, from } from 'rxjs';
import { stringify } from '@osd/std';
import {
  DataPublicPluginStart,
  IOpenSearchDashboardsSearchRequest,
  IOpenSearchDashboardsSearchResponse,
  ISearchOptions,
  SearchInterceptor,
  SearchInterceptorDeps,
} from '../../../../src/plugins/data/public';
import { QlDashboardsPluginStartDependencies } from '../types';

export class QlSearchInterceptor extends SearchInterceptor {
  protected queryService!: DataPublicPluginStart['query'];

  constructor(deps: SearchInterceptorDeps) {
    super(deps);

    deps.startServices.then(([coreStart, depsStart]) => {
      this.queryService = (depsStart as QlDashboardsPluginStartDependencies).data.query;
    });
  }

  private formatDate(dateString: string) {
    const date = new Date(dateString);
    return (
      date.getFullYear() +
      '-' +
      ('0' + (date.getMonth() + 1)).slice(-2) +
      '-' +
      ('0' + date.getDate()).slice(-2) +
      ' ' +
      ('0' + date.getHours()).slice(-2) +
      ':' +
      ('0' + date.getMinutes()).slice(-2) +
      ':' +
      ('0' + date.getSeconds()).slice(-2)
    );
  }

  protected runSearch(
    request: IOpenSearchDashboardsSearchRequest,
    signal?: AbortSignal
  ): Observable<IOpenSearchDashboardsSearchResponse> {
    const { id, ...searchRequest } = request;
    const path = trimEnd('/api/ql/search');

    const { filterManager, timefilter } = this.queryService;
    // TODO: get timestamp field
    // TODO: disable relative time
    // TODO: calc_auto_interval for auto
    // TODO: pass interval to query if not auto
    // TODO: what to do with filters here?
    // TODO: inspect request adapter
    // TODO: query parser in service to invoke preflight
    // TODO: bank on created index pattern but create temporary index pattern
    const queryString = `${
      searchRequest.params.body.query[0].query
    } | where timestamp >= '${this.formatDate(
      timefilter.timefilter.getTime().from
    )}' and timestamp <= '${this.formatDate(timefilter.timefilter.getTime().to)}'`;

    const body = stringify({ query: queryString, format: 'jdbc' });

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
