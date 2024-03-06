import { schema } from '@osd/config-schema';
import { IOpenSearchDashboardsResponse, IRouter, ResponseError } from '../../../../src/core/server';
import { PPLFacet } from '../search/ppl_facet';

export function defineRoutes(router: IRouter, facet: PPLFacet) {
  router.post(
    {
      path: `/api/ql/search`,
      validate: {
        body: schema.object({
          query: schema.string(),
          format: schema.string(),
        }),
      },
    },
    async (context, req, res): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const queryRes: any = await facet.describeQuery(req);
      if (queryRes.success) {
        const result: any = {
          body: {
            ...queryRes.data,
          },
        };
        return res.ok(result);
      }
      return res.custom({
        statusCode: queryRes.data.statusCode || queryRes.data.status || 500,
        body: queryRes.data.body || queryRes.data.message || '',
      });
    }
  );
}
