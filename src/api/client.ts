import type { ServerConfig } from '../config.js';
import { ApiError, ApiTransportError } from './errors.js';

const REQUEST_TIMEOUT_MS = 30_000;
const API_ROUTE_PATTERN = /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/i;

export interface ApiEnvelope<T> {
  data: T;
  pagination?: {
    limit: number;
    offset: number;
  };
}

export interface ApiQuery {
  limit?: number | undefined;
  offset?: number | undefined;
}

export class ResumeApiClient {
  constructor(
    private readonly config: ServerConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async get<T>(route: string, query?: ApiQuery): Promise<ApiEnvelope<T>> {
    return this.requestEnvelope<T>('GET', route, query);
  }

  async post<T>(route: string, body: unknown): Promise<ApiEnvelope<T>> {
    return this.requestEnvelope<T>('POST', route, undefined, body);
  }

  async patch<T>(route: string, body: unknown): Promise<ApiEnvelope<T>> {
    return this.requestEnvelope<T>('PATCH', route, undefined, body);
  }

  async put<T>(route: string, body: unknown): Promise<ApiEnvelope<T>> {
    return this.requestEnvelope<T>('PUT', route, undefined, body);
  }

  async delete(route: string): Promise<void> {
    const response = await this.send('DELETE', route);
    if (!response.ok) {
      await this.throwApiError(response);
    }
    if (response.status !== 204) {
      throw new ApiTransportError(`The PHP API returned an unexpected DELETE response (HTTP ${response.status}).`);
    }
  }

  private async requestEnvelope<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT',
    route: string,
    query?: ApiQuery,
    body?: unknown,
  ): Promise<ApiEnvelope<T>> {
    const response = await this.send(method, route, query, body);
    if (!response.ok) {
      await this.throwApiError(response);
    }

    const payload = await this.parseJson(response);
    if (!isRecord(payload) || !('data' in payload)) {
      throw new ApiTransportError(`The PHP API returned an invalid response (HTTP ${response.status}).`);
    }
    const pagination = payload.pagination;
    if (pagination !== undefined && !isPagination(pagination)) {
      throw new ApiTransportError(`The PHP API returned invalid pagination (HTTP ${response.status}).`);
    }

    return {
      data: payload.data as T,
      ...(pagination === undefined ? {} : { pagination }),
    };
  }

  private async send(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    route: string,
    query?: ApiQuery,
    body?: unknown,
  ): Promise<Response> {
    const url = this.buildUrl(route, query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`, 'utf8').toString('base64')}`,
    };
    const request: RequestInit = {
      method,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      request.body = JSON.stringify(body);
    }

    try {
      return await this.fetchImpl(url, request);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new ApiTransportError('The PHP API request timed out.');
      }

      throw new ApiTransportError('The PHP API request failed.');
    }
  }

  private buildUrl(route: string, query?: ApiQuery): URL {
    if (!API_ROUTE_PATTERN.test(route)) {
      throw new TypeError('API route must contain only relative path segments.');
    }

    const url = new URL(`/api/v1${route}`, this.config.apiBaseUrl);
    if (
      url.origin !== this.config.apiBaseUrl.origin ||
      !url.pathname.startsWith('/api/v1/')
    ) {
      throw new TypeError('API route escaped the configured API prefix.');
    }
    if (query?.limit !== undefined) {
      url.searchParams.set('limit', String(query.limit));
    }
    if (query?.offset !== undefined) {
      url.searchParams.set('offset', String(query.offset));
    }

    return url;
  }

  private async parseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new ApiTransportError(`The PHP API returned invalid JSON (HTTP ${response.status}).`);
    }
  }

  private async throwApiError(response: Response): Promise<never> {
    const payload = await this.parseJson(response);
    const error = isRecord(payload) ? payload.error : undefined;
    if (
      !isRecord(error) ||
      typeof error.code !== 'string' ||
      typeof error.message !== 'string'
    ) {
      throw new ApiTransportError(`The PHP API returned an invalid error response (HTTP ${response.status}).`);
    }

    let details: Record<string, string[]> | undefined;
    if (error.details !== undefined) {
      if (!isErrorDetails(error.details)) {
        throw new ApiTransportError(`The PHP API returned invalid error details (HTTP ${response.status}).`);
      }
      details = error.details;
    }

    throw new ApiError(response.status, error.code, error.message, details);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrorDetails(value: unknown): value is Record<string, string[]> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (messages) => Array.isArray(messages) && messages.every((message) => typeof message === 'string'),
    )
  );
}

function isPagination(value: unknown): value is { limit: number; offset: number } {
  return (
    isRecord(value) &&
    typeof value.limit === 'number' &&
    Number.isInteger(value.limit) &&
    value.limit >= 1 &&
    value.limit <= 100 &&
    typeof value.offset === 'number' &&
    Number.isInteger(value.offset) &&
    value.offset >= 0
  );
}
