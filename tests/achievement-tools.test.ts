import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../src/config.js';
import { ResumeApiClient } from '../src/api/client.js';
import { registerAchievementTools } from '../src/tools/register-achievement-tools.js';
import { createApiFetch, jsonResponse, withMcpClient } from './helpers/mcp-harness.js';

const config: ServerConfig = {
  apiBaseUrl: new URL('https://api.example.test'),
  username: 'test-admin',
  password: 'test-secret',
};

describe('experience achievement tools', () => {
  it('registers and dispatches all nested achievement CRUD routes', async () => {
    const { fetchImpl, calls } = createApiFetch([
      jsonResponse({
        data: [{ achievement_id: '7', experience_id: '23', achievement_text: 'Improved latency', default_order: 1 }],
        pagination: { limit: 10, offset: 2 },
      }),
      jsonResponse({ data: { achievement_id: '8', experience_id: '23', achievement_text: 'Automated tests' } }, 201),
      jsonResponse({ data: { achievement_id: '7', experience_id: '23', achievement_text: 'Improved latency' } }),
      jsonResponse({ data: { achievement_id: '7', experience_id: '23', achievement_text: 'Reduced latency' } }),
      new Response(null, { status: 204 }),
    ]);
    const server = new McpServer({ name: 'achievement-test-server', version: '1.0.0' });
    registerAchievementTools(server, new ResumeApiClient(config, fetchImpl));

    const results = await withMcpClient(server, async (client) => {
      const list = await client.callTool({
        name: 'list_experience_achievements',
        arguments: { experience_id: '23', limit: 10, offset: 2 },
      });
      const created = await client.callTool({
        name: 'create_experience_achievement',
        arguments: { experience_id: '23', achievement_text: 'Automated tests', default_order: 3 },
      });
      const read = await client.callTool({
        name: 'get_experience_achievement',
        arguments: { experience_id: '23', achievement_id: '7' },
      });
      const updated = await client.callTool({
        name: 'update_experience_achievement',
        arguments: {
          experience_id: '23',
          achievement_id: '7',
          changes: { achievement_text: 'Reduced latency' },
        },
      });
      const deleted = await client.callTool({
        name: 'delete_experience_achievement',
        arguments: { experience_id: '23', achievement_id: '7' },
      });

      return { list, created, read, updated, deleted };
    });

    expect(results.list.structuredContent).toMatchObject({
      data: [{ achievement_id: '7', experience_id: '23' }],
      pagination: { limit: 10, offset: 2 },
    });
    expect(results.created.structuredContent).toMatchObject({
      data: { achievement_id: '8', achievement_text: 'Automated tests' },
    });
    expect(results.read.structuredContent).toMatchObject({
      data: { achievement_id: '7', experience_id: '23' },
    });
    expect(results.updated.structuredContent).toMatchObject({
      data: { achievement_id: '7', achievement_text: 'Reduced latency' },
    });
    expect(results.deleted.structuredContent).toEqual({ deleted: true });
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.example.test/api/v1/experiences/23/achievements?limit=10&offset=2',
      'https://api.example.test/api/v1/experiences/23/achievements',
      'https://api.example.test/api/v1/experiences/23/achievements/7',
      'https://api.example.test/api/v1/experiences/23/achievements/7',
      'https://api.example.test/api/v1/experiences/23/achievements/7',
    ]);
    expect(calls.map((call) => call.init?.method)).toEqual(['GET', 'POST', 'GET', 'PATCH', 'DELETE']);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      achievement_text: 'Automated tests',
      default_order: 3,
    });
    expect(JSON.parse(String(calls[3]?.init?.body))).toEqual({
      achievement_text: 'Reduced latency',
    });
  });

  it('rejects invalid achievement fields before HTTP', async () => {
    const { fetchImpl, calls } = createApiFetch();
    const server = new McpServer({ name: 'achievement-test-server', version: '1.0.0' });
    registerAchievementTools(server, new ResumeApiClient(config, fetchImpl));

    await withMcpClient(server, async (client) => {
      const invalidCreate = await client.callTool({
        name: 'create_experience_achievement',
        arguments: { experience_id: '23', achievement_text: '', default_order: 65536 },
      });
      expect(invalidCreate.isError).toBe(true);

      const emptyPatch = await client.callTool({
        name: 'update_experience_achievement',
        arguments: { experience_id: '23', achievement_id: '7', changes: {} },
      });
      expect(emptyPatch.isError).toBe(true);
    });

    expect(calls).toHaveLength(0);
  });
});
