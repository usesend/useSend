import { AdminApiError, param } from "~/server/admin-api";
import {
  GuardConflictError,
  GuardNotFoundError,
} from "~/server/service/guard-service";

/** Turns the Guard service's errors into admin API status codes. */
export async function guardCall<T>(call: () => Promise<T>) {
  try {
    return await call();
  } catch (error) {
    if (error instanceof GuardNotFoundError) {
      throw new AdminApiError(404, error.message);
    }
    if (error instanceof GuardConflictError) {
      throw new AdminApiError(409, error.message);
    }
    throw error;
  }
}

export function teamIdParam(value: string | string[] | undefined) {
  const id = Number(param(value));
  if (!Number.isInteger(id) || id <= 0) {
    throw new AdminApiError(400, "Invalid team id");
  }
  return id;
}

export function idParam(value: string | string[] | undefined) {
  const id = param(value);
  if (!id) throw new AdminApiError(400, "Missing id");
  return id;
}
