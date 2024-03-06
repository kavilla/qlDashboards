import { get, trimEnd, debounce } from 'lodash';
import { Observable, from } from 'rxjs';
import { stringify } from '@osd/std';
import {
  IOpenSearchDashboardsSearchRequest,
  IOpenSearchDashboardsSearchResponse,
  ISearchOptions,
  SearchInterceptor,
  SearchInterceptorDeps,
} from '../../../../src/plugins/data/public';

export class QlSearchInterceptor extends SearchInterceptor {
  constructor(deps: SearchInterceptorDeps) {
    super(deps);
  }

  protected runSearch(
    request: IOpenSearchDashboardsSearchRequest,
    signal?: AbortSignal
  ): Observable<IOpenSearchDashboardsSearchResponse> {
    const { id, ...searchRequest } = request;
    const path = trimEnd('/api/ql/search');

    const body = stringify({ query: searchRequest.params.body.query[0].query, format: 'jdbc' });

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
