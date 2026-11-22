import { describe, expect, it } from 'vitest';
import type { ServerConfig } from '../src/config.js';
import { ResumeApiClient } from '../src/api/client.js';
import { ApiError, ApiTransportError } from '../src/api/errors.js';

const config: ServerConfig = {
  apiBaseUrl: new URL('https://api.example.test'),
  username: 'test-admin',
  password: 'test-secret',
};

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function createFetch(responses: Array<Response | Error>): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (response instanceof Error) {
      throw response;
    }
    if (response === undefined) {
      throw new Error('No mocked response remains.');
    }

    return response;
  };

  return { fetchImpl, calls };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ResumeApiClient', () => {
  it('adds Basic auth and the fixed API prefix', async () => {
    const { fetchImpl, calls } = createFetch([
      jsonResponse({ data: [], pagination: { limit: 20, offset: 0 } }),
    ]);
    const client = new ResumeApiClient(config, fetchImpl);

    const result = await client.get('/experiences');

    expect(result).toEqual({ data: [], pagination: { limit: 20, offset: 0 } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.example.test/api/v1/experiences');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('test-admin:test-secret', 'utf8').toString('base64')}`,
    );
    expect(calls[0]?.init?.redirect).toBe('error');
  });

  it('serializes pagination queries and JSON write bodies', async () => {
    const { fetchImpl, calls } = createFetch([
      jsonResponse({ data: [], pagination: { limit: 100, offset: 9007199254740991 } }),
      jsonResponse({ data: { candidate_id: '18446744073709551615' } }, 201),
      jsonResponse({ data: { candidate_id: '18446744073709551615' } }),
      jsonResponse({ data: { candidate_id: '18446744073709551615' } }),
    ]);
    const client = new ResumeApiClient(config, fetchImpl);
    const candidate = { full_name: 'Ada Lovelace' };

    await client.get('/candidates', { limit: 100, offset: 9007199254740991 });
    await client.post('/candidates', candidate);
    await client.patch('/candidates/18446744073709551615', { location: 'London' });
    await client.put('/resume-versions/12/contacts/4', { display_order: 2 });

    const listUrl = new URL(calls[0]?.url ?? '');
    expect(listUrl.searchParams.get('limit')).toBe('100');
    expect(listUrl.searchParams.get('offset')).toBe('9007199254740991');
    expect(calls.slice(1).map((call) => call.init?.method)).toEqual(['POST', 'PATCH', 'PUT']);
    expect(calls.slice(1).map((call) => new Headers(call.init?.headers).get('content-type'))).toEqual([
      'application/json',
      'application/json',
      'application/json',
    ]);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual(candidate);
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({ location: 'London' });
    expect(JSON.parse(String(calls[3]?.init?.body))).toEqual({ display_order: 2 });
  });

  it('preserves large IDs as strings and PHP error details', async () => {
    const { fetchImpl, calls } = createFetch([
      jsonResponse({ data: { resume_version_id: '18446744073709551615' } }),
      jsonResponse(
        {
          error: {
            code: 'validation_error',
            message: 'The request contains invalid fields.',
            details: { full_name: ['This field must not be empty.'] },
          },
        },
        422,
      ),
    ]);
    const client = new ResumeApiClient(config, fetchImpl);

    const record = await client.get<{ resume_version_id: string }>(
      '/resume-versions/18446744073709551615',
    );
    expect(record.data.resume_version_id).toBe('18446744073709551615');
    await expect(client.post('/candidates', { full_name: '' })).rejects.toMatchObject({
      status: 422,
      code: 'validation_error',
      message: 'The request contains invalid fields.',
      details: { full_name: ['This field must not be empty.'] },
    } satisfies Partial<ApiError>);
    expect(calls).toHaveLength(2);
  });

  it('accepts an empty 204 response from DELETE', async () => {
    const { fetchImpl } = createFetch([new Response(null, { status: 204 })]);
    const client = new ResumeApiClient(config, fetchImpl);

    await expect(client.delete('/candidates/42')).resolves.toBeUndefined();
  });

  it('reports transport and invalid JSON failures', async () => {
    const network = createFetch([new TypeError('network unavailable')]);
    await expect(new ResumeApiClient(config, network.fetchImpl).get('/candidates')).rejects.toBeInstanceOf(
      ApiTransportError,
    );

    const malformed = createFetch([new Response('not-json', { status: 200 })]);
    await expect(
      new ResumeApiClient(config, malformed.fetchImpl).get('/candidates'),
    ).rejects.toBeInstanceOf(ApiTransportError);
  });

  it('rejects invalid pagination metadata in a successful response', async () => {
    const invalid = createFetch([
      jsonResponse({ data: [], pagination: { limit: '100', offset: -1 } }),
    ]);

    await expect(
      new ResumeApiClient(config, invalid.fetchImpl).get('/candidates'),
    ).rejects.toBeInstanceOf(ApiTransportError);
  });

  it('does not retry a failed mutation', async () => {
    const { fetchImpl, calls } = createFetch([
      jsonResponse(
        { error: { code: 'service_unavailable', message: 'The database is unavailable.' } },
        503,
      ),
    ]);
    const client = new ResumeApiClient(config, fetchImpl);

    await expect(client.post('/candidates', { full_name: 'Ada Lovelace' })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(calls).toHaveLength(1);
  });
});
