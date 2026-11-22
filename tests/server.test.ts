import { describe, expect, it } from 'vitest';
import type { ServerConfig } from '../src/config.js';
import { createServer } from '../src/server.js';
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

const membershipSections = [
  ['contacts', 'contact'],
  ['experiences', 'experience'],
  ['skills', 'skill'],
  ['education', 'education'],
  ['projects', 'project'],
  ['certifications', 'certification'],
] as const;

const expectedToolNames = [
  ...resources.flatMap(([collection, singular]) => [
    `list_${collection}`,
    `create_${singular}`,
    `get_${singular}`,
    `update_${singular}`,
    `delete_${singular}`,
  ]),
  'list_candidate_summaries',
  'list_experience_achievements',
  'create_experience_achievement',
  'get_experience_achievement',
  'update_experience_achievement',
  'delete_experience_achievement',
  ...membershipSections.flatMap(([section, singular]) => [
    `list_resume_version_${section}`,
    `put_resume_version_${singular}`,
    `delete_resume_version_${singular}`,
  ]),
  'list_resume_version_experience_achievements',
  'put_resume_version_experience_achievement',
  'delete_resume_version_experience_achievement',
];

describe('MCP server', () => {
  it('registers_the_complete_catalog', async () => {
    const { fetchImpl } = createApiFetch();
    const server = createServer(config, fetchImpl);
    const toolNames = await withMcpClient(server, async (client) =>
      (await client.listTools()).tools.map((tool) => tool.name),
    );

    expect(toolNames).toHaveLength(72);
    expect([...toolNames].sort()).toEqual([...expectedToolNames].sort());
  });

  it('returns_structured_tool_results', async () => {
    const { fetchImpl, calls } = createApiFetch([
      jsonResponse({
        data: [{ candidate_id: '15', full_name: 'Ada Lovelace' }],
        pagination: { limit: 10, offset: 2 },
      }),
      new Response(null, { status: 204 }),
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
    const server = createServer(config, fetchImpl);

    const results = await withMcpClient(server, async (client) => {
      const listed = await client.callTool({
        name: 'list_candidates',
        arguments: { limit: 10, offset: 2 },
      });
      const deleted = await client.callTool({
        name: 'delete_resume_version_contact',
        arguments: {
          resume_version_id: '18446744073709551615',
          contact_method_id: '9007199254740993',
        },
      });
      const failed = await client.callTool({
        name: 'create_candidate',
        arguments: { full_name: 'Ada Lovelace' },
      });

      return { listed, deleted, failed };
    });

    expect(results.listed.structuredContent).toEqual({
      data: [{ candidate_id: '15', full_name: 'Ada Lovelace' }],
      pagination: { limit: 10, offset: 2 },
    });
    expect(results.deleted.isError).toBeFalsy();
    expect(results.deleted.structuredContent).toEqual({ deleted: true });
    expect(results.failed.isError).toBe(true);
    expect(results.failed.structuredContent).toMatchObject({
      error: {
        code: 'validation_error',
        status: 422,
        details: { full_name: ['This field must not be empty.'] },
      },
    });
    expect(calls.map((call) => call.init?.method)).toEqual(['GET', 'DELETE', 'POST']);
    expect(calls[1]?.url).toBe(
      'https://api.example.test/api/v1/resume-versions/18446744073709551615/contacts/9007199254740993',
    );
  });
});
