import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../src/config.js';
import { ResumeApiClient } from '../src/api/client.js';
import { registerAchievementTools } from '../src/tools/register-achievement-tools.js';
import { registerMembershipTools } from '../src/tools/register-membership-tools.js';
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

const resumeVersionId = '18446744073709551615';
const membershipSections = [
  {
    section: 'contacts',
    singular: 'contact',
    recordIdField: 'contact_method_id',
    recordId: '9007199254740993',
    fields: { display_order: 1 },
  },
  {
    section: 'experiences',
    singular: 'experience',
    recordIdField: 'experience_id',
    recordId: '9007199254740994',
    fields: { display_order: 2, summary_override: null },
  },
  {
    section: 'skills',
    singular: 'skill',
    recordIdField: 'skill_id',
    recordId: '9007199254740995',
    fields: { display_order: 3 },
  },
  {
    section: 'education',
    singular: 'education',
    recordIdField: 'education_id',
    recordId: '9007199254740996',
    fields: { display_order: 4 },
  },
  {
    section: 'projects',
    singular: 'project',
    recordIdField: 'project_id',
    recordId: '9007199254740997',
    fields: { display_order: 5, summary_override: 'Selected project' },
  },
  {
    section: 'certifications',
    singular: 'certification',
    recordIdField: 'certification_id',
    recordId: '9007199254740998',
    fields: { display_order: 6 },
  },
] as const;

const versionAchievementToolNames = [
  'list_resume_version_experience_achievements',
  'put_resume_version_experience_achievement',
  'delete_resume_version_experience_achievement',
];

const membershipToolNames = [
  ...membershipSections.flatMap(({ section, singular }) => [
    `list_resume_version_${section}`,
    `put_resume_version_${singular}`,
    `delete_resume_version_${singular}`,
  ]),
  ...versionAchievementToolNames,
];

function createServer(api: ResumeApiClient): McpServer {
  const server = new McpServer({ name: 'resume-test-server', version: '1.0.0' });
  registerResourceTools(server, api);
  registerAchievementTools(server, api);
  registerMembershipTools(server, api);
  return server;
}

describe('resume-version membership tools', () => {
  it('lists_each_version_section', async () => {
    const responses = membershipSections.map(() =>
      jsonResponse({ data: [], pagination: { limit: 5, offset: 2 } }),
    );
    const { fetchImpl, calls } = createApiFetch(responses);
    const server = createServer(new ResumeApiClient(config, fetchImpl));

    const results = await withMcpClient(server, async (client) => {
      const tools = (await client.listTools()).tools.map((tool) => tool.name);
      expect(tools).toEqual(expect.arrayContaining(membershipToolNames));

      return Promise.all(
        membershipSections.map(({ section }) =>
          client.callTool({
            name: `list_resume_version_${section}`,
            arguments: { resume_version_id: resumeVersionId, limit: 5, offset: 2 },
          }),
        ),
      );
    });

    expect(results.every((result) => !result.isError)).toBe(true);
    expect(calls.map((call) => call.url)).toEqual(
      membershipSections.map(
        ({ section }) =>
          `https://api.example.test/api/v1/resume-versions/${resumeVersionId}/${section}?limit=5&offset=2`,
      ),
    );
  });

  it('puts_and_deletes_each_membership', async () => {
    const responses = membershipSections.flatMap(({ fields }) => [
      jsonResponse({ data: fields }),
      new Response(null, { status: 204 }),
    ]);
    const { fetchImpl, calls } = createApiFetch(responses);
    const server = createServer(new ResumeApiClient(config, fetchImpl));

    const results = await withMcpClient(server, async (client) => {
      const operationResults = [];
      for (const section of membershipSections) {
        const arguments_ = {
          resume_version_id: resumeVersionId,
          [section.recordIdField]: section.recordId,
          ...section.fields,
        };
        const put = await client.callTool({
          name: `put_resume_version_${section.singular}`,
          arguments: arguments_,
        });
        const deleted = await client.callTool({
          name: `delete_resume_version_${section.singular}`,
          arguments: {
            resume_version_id: resumeVersionId,
            [section.recordIdField]: section.recordId,
          },
        });
        operationResults.push({ put, deleted });
      }

      return operationResults;
    });

    expect(results.every(({ put, deleted }) => !put.isError && !deleted.isError)).toBe(true);
    expect(results.map(({ deleted }) => deleted.structuredContent)).toEqual(
      membershipSections.map(() => ({ deleted: true })),
    );
    expect(calls.map((call) => call.url)).toEqual(
      membershipSections.flatMap(({ section, recordId }) => {
        const path = `https://api.example.test/api/v1/resume-versions/${resumeVersionId}/${section}/${recordId}`;
        return [path, path];
      }),
    );
    expect(calls.map((call) => call.init?.method)).toEqual(
      membershipSections.flatMap(() => ['PUT', 'DELETE']),
    );
    expect(
      calls
        .filter((call) => call.init?.method === 'PUT')
        .map((call) => JSON.parse(String(call.init?.body))),
    ).toEqual(membershipSections.map(({ fields }) => fields));
  });

  it('uses_both_parent_ids_for_version_achievements', async () => {
    const experienceId = '9007199254740999';
    const achievementId = '9007199254741000';
    const fields = { display_order: 7, achievement_text_override: null };
    const { fetchImpl, calls } = createApiFetch([
      jsonResponse({ data: [] }),
      jsonResponse({ data: fields }),
      new Response(null, { status: 204 }),
    ]);
    const server = createServer(new ResumeApiClient(config, fetchImpl));

    const results = await withMcpClient(server, async (client) => {
      const listed = await client.callTool({
        name: 'list_resume_version_experience_achievements',
        arguments: { resume_version_id: resumeVersionId, experience_id: experienceId },
      });
      const put = await client.callTool({
        name: 'put_resume_version_experience_achievement',
        arguments: {
          resume_version_id: resumeVersionId,
          experience_id: experienceId,
          achievement_id: achievementId,
          ...fields,
        },
      });
      const deleted = await client.callTool({
        name: 'delete_resume_version_experience_achievement',
        arguments: {
          resume_version_id: resumeVersionId,
          experience_id: experienceId,
          achievement_id: achievementId,
        },
      });
      return { listed, put, deleted };
    });

    expect(results.listed.isError).toBeFalsy();
    expect(results.put.isError).toBeFalsy();
    expect(results.deleted.structuredContent).toEqual({ deleted: true });
    const collectionPath =
      `https://api.example.test/api/v1/resume-versions/${resumeVersionId}/experiences/${experienceId}/achievements`;
    const itemPath = `${collectionPath}/${achievementId}`;
    expect(calls.map((call) => call.url)).toEqual([collectionPath, itemPath, itemPath]);
    expect(calls.map((call) => call.init?.method)).toEqual(['GET', 'PUT', 'DELETE']);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual(fields);
  });

  it('rejects_invalid_membership_fields_before_http', async () => {
    const { fetchImpl, calls } = createApiFetch();
    const server = createServer(new ResumeApiClient(config, fetchImpl));

    const result = await withMcpClient(server, (client) =>
      client.callTool({
        name: 'put_resume_version_experience',
        arguments: {
          resume_version_id: resumeVersionId,
          experience_id: '23',
          display_order: 65536,
          unexpected: true,
        },
      }),
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Input validation error');
    expect(calls).toHaveLength(0);
  });
});
