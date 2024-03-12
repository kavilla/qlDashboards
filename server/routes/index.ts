import { schema } from '@osd/config-schema';
import {
  IOpenSearchDashboardsResponse,
  IRouter,
  Logger,
  ResponseError,
} from '../../../../src/core/server';
import { ISearchStrategy } from '../../../../src/plugins/data/server';

export function defineRoutes(logger: Logger, router: IRouter, searchStrategy: ISearchStrategy) {
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
      const queryRes: any = await searchStrategy.search(context, req as any, {});
      if (queryRes.success) {
        const result: any = {
          body: {
            ...queryRes,
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
