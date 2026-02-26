import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "../../hono";
import { db } from "~/server/db";
import { UnsendApiError } from "../../api-error";
import {
  deleteDomain as deleteDomainService,
  resolveDomainId,
} from "~/server/service/domain-service";

const route = createRoute({
  method: "delete",
  path: "/v1/domains/{id}",
  request: {
    params: z.object({
      id: z
        .string()
        .min(1)
        .openapi({
          param: {
            name: "id",
            in: "path",
          },
          example: "dom_3NfPq7hK9a2Tj6Rx",
        }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number(),
            success: z.boolean(),
            message: z.string(),
          }),
        },
      },
      description: "Domain deleted successfully",
    },
    403: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "Forbidden - API key doesn't have access",
    },
    404: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "Domain not found",
    },
  },
});

function deleteDomain(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const identifier = c.req.valid("param").id;
    const domainId = await resolveDomainId(identifier, team.id);

    if (!domainId) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Domain not found",
      });
    }

    // Enforce API key domain restriction
    if (team.apiKey.domainId && team.apiKey.domainId !== domainId) {
      throw new UnsendApiError({
        code: "FORBIDDEN",
        message: "API key doesn't have access to this domain",
      });
    }

    const domain = await db.domain.findFirst({
      where: {
        id: domainId,
        teamId: team.id,
      },
    });

    if (!domain) {
      throw new UnsendApiError({
        code: "NOT_FOUND",
        message: "Domain not found",
      });
    }

    const deletedDomain = await deleteDomainService(domainId);

    return c.json({
      id: deletedDomain.id,
      success: true,
      message: "Domain deleted successfully",
    });
  });
}

export default deleteDomain;
