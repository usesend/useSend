import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { logger } from "~/server/logger/log";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    // Only server-side failures are logged. Rejected input, bad credentials and
    // missing records are a normal part of the API surface and stay unlogged.
    onError: ({ path, error }) => {
      if (error.code !== "INTERNAL_SERVER_ERROR" && error.code !== "TIMEOUT") {
        return;
      }

      logger.error(
        {
          err: error,
          cause: error.cause,
          trpcPath: path,
          trpcCode: error.code,
        },
        "[Trpc]: Request failed"
      );
    },
  });

export { handler as GET, handler as POST };
