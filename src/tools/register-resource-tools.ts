import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { ResumeApiClient } from '../api/client.js';
import {
  apiIdSchema,
  listQuerySchema,
  normalizeApiId,
  resourceDefinitions,
  validateResourcePayload,
} from './resource-definitions.js';
import { runTool, ToolInputError } from './tool-results.js';

export function registerResourceTools(server: McpServer, api: ResumeApiClient): void {
  for (const definition of Object.values(resourceDefinitions)) {
    server.registerTool(
      `list_${definition.collectionTool}`,
      {
        description: `List ${definition.collectionTool.replaceAll('_', ' ')} from the ResuMe API.`,
        inputSchema: listQuerySchema,
      },
      async (query) => runTool(() => api.get(`/${definition.path}`, query)),
    );

    server.registerTool(
      `create_${definition.singularTool}`,
      {
        description: `Create a ${definition.singularTool.replaceAll('_', ' ')} in the ResuMe API.`,
        inputSchema: definition.createSchema,
      },
      async (input) =>
        runTool(() =>
          api.post(
            `/${definition.path}`,
            validateResourcePayload(definition, input, false),
          ),
        ),
    );

    const itemSchema = z.strictObject({ id: apiIdSchema });
    server.registerTool(
      `get_${definition.singularTool}`,
      {
        description: `Read a ${definition.singularTool.replaceAll('_', ' ')} by ${definition.primaryKey}.`,
        inputSchema: itemSchema,
      },
      async ({ id }) =>
        runTool(() =>
          api.get(`/${definition.path}/${encodeURIComponent(normalizeApiId(id))}`),
        ),
    );

    const updateSchema = z.strictObject({
      id: apiIdSchema,
      changes: definition.patchSchema,
    });
    server.registerTool(
      `update_${definition.singularTool}`,
      {
        description: `Partially update a ${definition.singularTool.replaceAll('_', ' ')} by ${definition.primaryKey}.`,
        inputSchema: updateSchema,
      },
      async ({ id, changes }) =>
        runTool(() =>
          api.patch(
            `/${definition.path}/${encodeURIComponent(normalizeApiId(id))}`,
            validateResourcePayload(definition, changes, true),
          ),
        ),
    );

    server.registerTool(
      `delete_${definition.singularTool}`,
      {
        description: `Permanently delete a ${definition.singularTool.replaceAll('_', ' ')} by ${definition.primaryKey}.`,
        inputSchema: itemSchema,
      },
      async ({ id }) =>
        runTool(async () => {
          await api.delete(`/${definition.path}/${encodeURIComponent(normalizeApiId(id))}`);
          return { deleted: true };
        }),
    );
  }

  server.registerTool(
    'list_candidate_summaries',
    {
      description: 'List candidate names and email addresses.',
      inputSchema: listQuerySchema,
    },
    async (query) => runTool(() => api.get('/list', query)),
  );
}
