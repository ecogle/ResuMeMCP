import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from './config.js';
import { ResumeApiClient } from './api/client.js';
import { registerAchievementTools } from './tools/register-achievement-tools.js';
import { registerMembershipTools } from './tools/register-membership-tools.js';
import { registerResourceTools } from './tools/register-resource-tools.js';

export function createServer(
  config: ServerConfig,
  fetchImpl: typeof fetch = fetch,
): McpServer {
  const server = new McpServer({ name: 'resume-mcp', version: '0.1.0' });
  const api = new ResumeApiClient(config, fetchImpl);

  registerResourceTools(server, api);
  registerAchievementTools(server, api);
  registerMembershipTools(server, api);

  return server;
}
