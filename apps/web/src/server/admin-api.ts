import { ZodError } from "zod";

import { env } from "~/env";
import { logger } from "~/server/logger/log";
import { isAdminAuthorized } from "~/server/admin-auth";

/**
 * The internal admin API: routes under /api/admin, used by our own tools (HQ,
 * the Guard). Off unless ADMIN_API_TOKEN is set; then every request needs
 * `Authorization: Bearer <ADMIN_API_TOKEN>`.
 */

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const HEADERS = { "Cache-Control": "no-store" };

type Params = Record<string, string | string[] | undefined>;
type Handler = (input: {
  req: Request;
  body: unknown;
  params: Params;
}) => Promise<unknown>;

export function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: HEADERS });
}

async function readJsonBody(req: Request, maxBytes: number) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new AdminApiError(413, "Body too large");
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) {
    throw new AdminApiError(413, "Body too large");
  }
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AdminApiError(400, "Invalid JSON");
  }
}

/** Only an error's name and code: messages can contain request data. */
function safeErrorDetails(error: unknown) {
  if (!(error instanceof Error)) return { name: typeof error };
  const { code } = error as { code?: unknown };
  return {
    name: error.name,
    code: typeof code === "string" ? code : undefined,
  };
}

/**
 * Wraps a route handler: answers 404 unless ADMIN_API_TOKEN is set, 401
 * without the token, and reads a JSON body only once the request is
 * authorised. A handler returns the JSON to send with status 200, or a
 * Response. `AdminApiError` and zod errors become their status codes.
 */
export function adminApiRoute(
  handler: Handler,
  { maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = {},
) {
  return async (req: Request, context?: { params?: Promise<Params> }) => {
    if (!env.ADMIN_API_TOKEN) return json(404, { error: "Not found" });
    if (
      !isAdminAuthorized(req.headers.get("authorization"), env.ADMIN_API_TOKEN)
    ) {
      return json(401, { error: "Unauthorized" });
    }

    try {
      let body: unknown;
      if (req.method !== "GET") {
        const type = req.headers.get("content-type") ?? "";
        if (!/^application\/json\b/i.test(type)) {
          return json(415, { error: "Send a JSON body" });
        }
        body = await readJsonBody(req, maxBodyBytes);
      }
      const params = (await context?.params) ?? {};
      const result = await handler({ req, body, params });
      return result instanceof Response ? result : json(200, result);
    } catch (error) {
      if (error instanceof AdminApiError) {
        return json(error.status, { error: error.message });
      }
      if (error instanceof ZodError) {
        return json(400, { error: "Invalid request", issues: error.issues });
      }
      logger.error(safeErrorDetails(error), "[AdminApi]: Request failed");
      return json(500, { error: "Internal server error" });
    }
  };
}

/** A single string route or query param. */
export function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
