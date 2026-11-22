import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../src/config.js';
import { ResumeApiClient } from '../src/api/client.js';
import { registerAchievementTools } from '../src/tools/register-achievement-tools.js';
import { registerResourceTools } from '../src/tools/register-resource-tools.js';
import {
  createApiFetch,
  jsonResponse,
  withMcpClient,
} from './helpers/mcp-harness.js';

const config: ServerConfig = {
  apiBaseUrl: new URL('https://api.example.test'),
  username: 'test-admin',
  password: 'test-secret',
};

const resources = [
  ['candidates', 'candidate'],
  ['contact_methods', 'contact_method'],
  ['employers', 'employer'],
  ['experiences', 'experience'],
  ['skills', 'skill'],
  ['education_records', 'education_record'],
  ['projects', 'project'],
  ['certifications', 'certification'],
  ['resume_versions', 'resume_version'],
] as const;

function createServer(api: ResumeApiClient): McpServer {
  const server = new McpServer({ name: 'resume-test-server', version: '1.0.0' });
  registerResourceTools(server, api);
  registerAchievementTools(server, api);
  return server;
}

describe('resource tools', () => {
  it('registers all top-level CRUD and candidate summary tools', async () => {
    const { fetchImpl } = createApiFetch();
    const server = createServer(new ResumeApiClient(config, fetchImpl));

    const tools = await withMcpClient(server, async (client) => (await client.listTools()).tools);
    const names = tools.map((tool) => tool.name);
    const expectedNames = resources.flatMap(([collection, singular]) => [
      `list_${collection}`,
      `create_${singular}`,
      `get_${singular}`,
      `update_${singular}`,
      `delete_${singular}`,
    ]);

    expect(names).toHaveLength(51);
    expect(names).toEqual(expect.arrayContaining([
      ...expectedNames,
      'list_candidate_summaries',
      'list_experience_achievements',
      'create_experience_achievement',
      'get_experience_achievement',
      'update_experience_achievement',
      'delete_experience_achievement',
    ]));
  });

  it('maps create, get, and summary tools to their PHP API routes', async () => {
    const largeId = '18446744073709551615';
    const { fetchImpl, calls } = createApiFetch([
      jsonResponse({ data: { candidate_id: '15', full_name: 'Ada Lovelace' } }, 201),
      jsonResponse({ data: { resume_version_id: largeId, candidate_id: '15' } }),
      jsonResponse({
        data: [{ full_name: 'Ada Lovelace', email: null }],
        pagination: { limit: 10, offset: 5 },
      }),
    ]);
    const server = createServer(new ResumeApiClient(config, fetchImpl));

    const results = await withMcpClient(server, async (client) => {
      const created = await client.callTool({
        name: 'create_candidate',
        arguments: { full_name: 'Ada Lovelace' },
      });
      const version = await client.callTool({
        name: 'get_resume_version',
        arguments: { id: largeId },
      });
      const summaries = await client.callTool({
        name: 'list_candidate_summaries',
        arguments: { limit: 10, offset: 5 },
      });

      return { created, version, summaries };
    });

    expect(results.created.structuredContent).toEqual({
      data: { candidate_id: '15', full_name: 'Ada Lovelace' },
    });
    expect(results.version.structuredContent).toEqual({
      data: { resume_version_id: largeId, candidate_id: '15' },
    });
    expect(results.summaries.structuredContent).toEqual({
      data: [{ full_name: 'Ada Lovelace', email: null }],
      pagination: { limit: 10, offset: 5 },
    });
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.example.test/api/v1/candidates',
      `https://api.example.test/api/v1/resume-versions/${largeId}`,
      'https://api.example.test/api/v1/list?limit=10&offset=5',
    ]);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ full_name: 'Ada Lovelace' });
  });

  it('rejects unknown fields, empty patches, and invalid pagination before HTTP', async () => {
    const { fetchImpl, calls } = createApiFetch();
    const server = createServer(new ResumeApiClient(config, fetchImpl));

    await withMcpClient(server, async (client) => {
      const unknownField = await client.callTool({
        name: 'create_candidate',
        arguments: { full_name: 'Ada Lovelace', unexpected: true },
      });
      expect(unknownField.isError).toBe(true);

      const emptyPatch = await client.callTool({
        name: 'update_candidate',
        arguments: { id: '15', changes: {} },
      });
      expect(emptyPatch.isError).toBe(true);

      const invalidLimit = await client.callTool({
        name: 'list_candidates',
        arguments: { limit: 101 },
      });
      const invalidOffset = await client.callTool({
        name: 'list_candidates',
        arguments: { offset: -1 },
      });
      expect(invalidLimit.isError).toBe(true);
      expect(invalidOffset.isError).toBe(true);
    });

    expect(calls).toHaveLength(0);
  });

  it('validates PHP resource field constraints before HTTP', async () => {
    const { fetchImpl, calls } = createApiFetch();
    const server = createServer(new ResumeApiClient(config, fetchImpl));

    await withMcpClient(server, async (client) => {
      const invalidInputs = [
        { name: 'create_candidate', arguments: { full_name: '   ' } },
        { name: 'create_employer', arguments: { company_name: 'Example', website: 'ftp://example.test' } },
        {
          name: 'create_experience',
          arguments: { job_title: 'Engineer', start_date: '2024-12-01', end_date: '2024-11-30' },
        },
        {
          name: 'create_experience',
          arguments: { job_title: 'Engineer', is_current: true, end_date: '2024-11-30' },
        },
        {
          name: 'create_contact_method',
          arguments: {
            candidate_id: '0',
            contact_type: 'email',
            label: 'Email',
            contact_value: 'ada@example.test',
          },
        },
      ];

      for (const input of invalidInputs) {
        const result = await client.callTool(input);
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({
          error: { code: 'validation_error' },
        });
      }
    });

    expect(calls).toHaveLength(0);
  });
});
