import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { StatusCode, ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { logger } from "../logger/log";

const ErrorCode = z.enum([
  "BAD_REQUEST",
  "FORBIDDEN",
  "INTERNAL_SERVER_ERROR",
  "NOT_FOUND",
  "NOT_UNIQUE",
  "RATE_LIMITED",
  "UNAUTHORIZED",
  "METHOD_NOT_ALLOWED",
]);

function codeToStatus(code: z.infer<typeof ErrorCode>): ContentfulStatusCode {
  switch (code) {
    case "BAD_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "METHOD_NOT_ALLOWED":
      return 405;
    case "NOT_UNIQUE":
      return 409;
    case "RATE_LIMITED":
      return 429;
    case "INTERNAL_SERVER_ERROR":
      return 500;
  }
}

function statusToCode(status: StatusCode): z.infer<typeof ErrorCode> {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 405:
      return "METHOD_NOT_ALLOWED";
    case 409:
      return "NOT_UNIQUE";
    case 429:
      return "RATE_LIMITED";
    case 500:
      return "INTERNAL_SERVER_ERROR";
    default:
      return "INTERNAL_SERVER_ERROR";
  }
}

export class UseSendApiError extends HTTPException {
  public readonly code: z.infer<typeof ErrorCode>;

  constructor({
    code,
    message,
  }: {
    code: z.infer<typeof ErrorCode>;
    message: string;
  }) {
    super(codeToStatus(code), { message });
    this.code = code;
  }
}

export function handleError(err: Error, c: Context): Response {
  /**
   * We can handle this very well, as it is something we threw ourselves
   */
  if (err instanceof UseSendApiError) {
    if (err.status >= 500) {
      logger.error(
        { name: err.name, code: err.code, status: err.status, err },
        err.message
      );
    }
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
        },
      },
      { status: err.status }
    );
  }

  /**
   * HTTPExceptions from hono at least give us some idea of what to do as they provide a status and
   * message
   */
  if (err instanceof HTTPException) {
    if (err.status >= 500) {
      logger.error(
        { message: err.message, status: err.status, err },
        "HTTPException"
      );
    }
    const code = statusToCode(err.status);
    return c.json(
      {
        error: {
          code,
          message: err.message,
        },
      },
      { status: err.status }
    );
  }

  /**
   * We're lost here, all we can do is return a 500 and log it to investigate
   */
  logger.error(
    {
      err,
      name: err.name,
      message: err.message,
      cause: err.cause,
      stack: err.stack,
    },
    "unhandled exception"
  );
  return c.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "something unexpected happened",
      },
    },
    { status: 500 }
  );
}
