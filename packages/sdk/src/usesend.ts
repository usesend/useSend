import { ErrorResponse } from "../types";
import { Contacts } from "./contact";
import { Emails } from "./email";

const defaultBaseUrl = "https://app.usesend.com";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const baseUrl = `${process?.env?.USESEND_BASE_URL ?? process?.env?.UNSEND_BASE_URL ?? defaultBaseUrl}/api/v1`;

function isUseSendErrorResponse(error: { error: ErrorResponse }) {
  return error.error.code !== undefined;
}

export class UseSend {
  private readonly headers: Headers;

  // readonly domains = new Domains(this);
  readonly emails = new Emails(this);
  readonly contacts = new Contacts(this);
  url = baseUrl;

  constructor(
    readonly key?: string,
    url?: string
  ) {
    if (!key) {
      if (typeof process !== "undefined" && process.env) {
        this.key = process.env.USESEND_API_KEY ?? process.env.UNSEND_API_KEY;
      }

      if (!this.key) {
        throw new Error(
          'Missing API key. Pass it to the constructor `new UseSend("us_123")`'
        );
      }
    }

    if (url) {
      this.url = `${url}/api/v1`;
    }

    this.headers = new Headers({
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
    });
  }

  async fetchRequest<T>(
    path: string,
    options = {}
  ): Promise<{ data: T | null; error: ErrorResponse | null }> {
    const response = await fetch(`${this.url}${path}`, options);
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

  async post<T>(path: string, body: unknown) {
    const requestOptions = {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    };

    return this.fetchRequest<T>(path, requestOptions);
  }

  async get<T>(path: string) {
    const requestOptions = {
      method: "GET",
      headers: this.headers,
    };

    return this.fetchRequest<T>(path, requestOptions);
  }

  async put<T>(path: string, body: any) {
    const requestOptions = {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(body),
    };

    return this.fetchRequest<T>(path, requestOptions);
  }

  async patch<T>(path: string, body: any) {
    const requestOptions = {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(body),
    };

    return this.fetchRequest<T>(path, requestOptions);
  }

  async delete<T>(path: string, body?: unknown) {
    const requestOptions = {
      method: "DELETE",
      headers: this.headers,
      body: JSON.stringify(body),
    };

    return this.fetchRequest<T>(path, requestOptions);
  }
}
