export function invariant(
  condition: unknown,
  message = "Invariant failed"
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertUnreachable(value: never): never {
  throw new Error(`Reached unreachable code with value: ${String(value)}`);
}

export const isDefined = <T>(
  value: T | null | undefined
): value is T => value !== null && value !== undefined;

export {
  BOUNCE_ERROR_MESSAGES,
  COMPLAINT_ERROR_MESSAGES,
  DELIVERY_DELAY_ERRORS,
} from "./constants/ses-errors";
