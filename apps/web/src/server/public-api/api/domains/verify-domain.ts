import { createRoute, z } from "@hono/zod-openapi";
import { PublicAPIApp } from "~/server/public-api/hono";
import { db } from "~/server/db";

const route = createRoute({
  method: "put",
  path: "/v1/domains/{id}/verify",
  request: {
    params: z.object({
      id: z.coerce.number().openapi({
        param: {
          name: "id",
          in: "path",
        },
        example: 1,
      }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
      description: "Verify domain",
    },
    403: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
      description: "Forbidden - API key doesn't have access to this domain",
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

function verifyDomain(app: PublicAPIApp) {
  app.openapi(route, async (c) => {
    const team = c.var.team;
    const domainId = c.req.valid("param").id;

    // Check if API key has access to this domain
    let domain = null;
    
    if (team.apiKey.domainId) {
      // If API key is restricted to a specific domain, verify the requested domain matches
      if (domainId === team.apiKey.domainId) {
        domain = await db.domain.findFirst({
          where: { 
            teamId: team.id, 
            id: domainId
          },
        });
      }
      // If domainId doesn't match the API key's restriction, domain remains null
    } else {
      // API key has access to all team domains
      domain = await db.domain.findFirst({ 
        where: { 
          teamId: team.id, 
          id: domainId 
        } 
      });
    }

    if (!domain) {
      return c.json({
        error: team.apiKey.domainId 
          ? "API key doesn't have access to this domain" 
          : "Domain not found"
      }, 404);
    }

    await db.domain.update({
      where: { id: domainId },
      data: { isVerifying: true },
    });

    return c.json({
      message: "Domain verification started",
    });
  });
}

export default verifyDomain;
