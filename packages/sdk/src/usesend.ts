import { ErrorResponse } from "../types";
import { Contacts } from "./contact";
import { Emails } from "./email";
import { Domains } from "./domain";
import { Campaigns } from "./campaign";
import { Webhooks } from "./webhooks";

const defaultBaseUrl = "https://app.usesend.com";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const baseUrl = `${process?.env?.USESEND_BASE_URL ?? process?.env?.UNSEND_BASE_URL ?? defaultBaseUrl}/api/v1`;

function isUseSendErrorResponse(error: { error: ErrorResponse }) {
  return error.error.code !== undefined;
}

type RequestOptions = {
  headers?: HeadersInit;
};

export class UseSend {
  private readonly baseHeaders: Headers;

  readonly emails = new Emails(this);
  readonly domains = new Domains(this);
  readonly contacts = new Contacts(this);
  readonly campaigns = new Campaigns(this);
  url = baseUrl;

  constructor(
    readonly key?: string,
    url?: string,
  ) {
    if (!key) {
      if (typeof process !== "undefined" && process.env) {
        this.key = process.env.USESEND_API_KEY ?? process.env.UNSEND_API_KEY;
      }

      if (!this.key) {
        throw new Error(
          'Missing API key. Pass it to the constructor `new UseSend("us_123")`',
        );
      }
    }

    if (url) {
      this.url = `${url}/api/v1`;
    }

    this.baseHeaders = new Headers({
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
    });
  }

  private mergeHeaders(extra?: HeadersInit) {
    const headers = new Headers(this.baseHeaders);
    if (!extra) {
      return headers;
    }

    const additional = new Headers(extra);
    additional.forEach((value, key) => {
      headers.set(key, value);
    });

    return headers;
  }

  async fetchRequest<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<{ data: T | null; error: ErrorResponse | null }> {
    const requestOptions: RequestInit = {
      ...options,
      headers: this.mergeHeaders(options.headers),
    };

    const response = await fetch(`${this.url}${path}`, requestOptions);
    const defaultError = {
      code: "INTERNAL_SERVER_ERROR",
      message: response.statusText,
    };

    if (!response.ok) {
      try {
        const resp = await response.json();
        if (isUseSendErrorResponse(resp)) {
          return { data: null, error: resp };
        }

        return { data: null, error: resp.error };
      } catch (err) {
        if (err instanceof Error) {
          return {
            data: null,
            error: defaultError,
          };
        }

        return { data: null, error: defaultError };
      }
    }

    const data = await response.json();
    return { data, error: null };
  }

  async post<T>(path: string, body: unknown, options?: RequestOptions) {
    const requestOptions: RequestInit = {
      method: "POST",
      body: JSON.stringify(body),
    };

    if (options?.headers) {
      requestOptions.headers = options.headers;
    }

    return this.fetchRequest<T>(path, requestOptions);
  }

  async get<T>(path: string, options?: RequestOptions) {
    const requestOptions: RequestInit = {
      method: "GET",
    };

    if (options?.headers) {
      requestOptions.headers = options.headers;
    }

    return this.fetchRequest<T>(path, requestOptions);
  }

  async put<T>(path: string, body: any, options?: RequestOptions) {
    const requestOptions: RequestInit = {
      method: "PUT",
      body: JSON.stringify(body),
    };

    if (options?.headers) {
      requestOptions.headers = options.headers;
    }

    return this.fetchRequest<T>(path, requestOptions);
  }

  async patch<T>(path: string, body: any, options?: RequestOptions) {
    const requestOptions: RequestInit = {
      method: "PATCH",
      body: JSON.stringify(body),
    };

    if (options?.headers) {
      requestOptions.headers = options.headers;
    }

    return this.fetchRequest<T>(path, requestOptions);
  }

  async delete<T>(path: string, body?: unknown, options?: RequestOptions) {
    const requestOptions: RequestInit = {
      method: "DELETE",
    };

    if (body !== undefined) {
      requestOptions.body = JSON.stringify(body);
    }

    if (options?.headers) {
      requestOptions.headers = options.headers;
    }

    return this.fetchRequest<T>(path, requestOptions);
  }

  /**
   * Creates a webhook handler with the given secret.
   * Follows the Stripe pattern: `usesend.webhooks(secret).constructEvent(...)`
   *
   * @param secret - Webhook signing secret from your UseSend dashboard
   * @returns Webhooks instance for verifying webhook events
   *
   * @example
   * ```ts
   * const usesend = new UseSend('us_xxx');
   * const webhooks = usesend.webhooks('whsec_xxx');
   *
   * // In your webhook route
   * const event = webhooks.constructEvent(req.body, {
   *   headers: req.headers
   * });
   * ```
   */
  webhooks(secret: string): Webhooks {
    return new Webhooks(secret);
  }
}
