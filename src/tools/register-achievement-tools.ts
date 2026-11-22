import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { ResumeApiClient } from '../api/client.js';
import {
  achievementCreateSchema,
  achievementPatchSchema,
  apiIdSchema,
  listQuerySchema,
  normalizeApiId,
  validateAchievementPayload,
} from './resource-definitions.js';
import { runTool } from './tool-results.js';

export function registerAchievementTools(server: McpServer, api: ResumeApiClient): void {
  const collectionSchema = z.strictObject({
    experience_id: apiIdSchema,
    ...listQuerySchema.shape,
  });
  server.registerTool(
    'list_experience_achievements',
    {
      description: 'List achievements for an experience.',
      inputSchema: collectionSchema,
    },
    async ({ experience_id, ...query }) =>
      runTool(() =>
        api.get(
          `/experiences/${encodeURIComponent(normalizeApiId(experience_id))}/achievements`,
          query,
        ),
      ),
  );

  const createSchema = z.strictObject({
    experience_id: apiIdSchema,
    ...achievementCreateSchema.shape,
  });
  server.registerTool(
    'create_experience_achievement',
    {
      description: 'Create an achievement for an experience.',
      inputSchema: createSchema,
    },
    async ({ experience_id, ...input }) =>
      runTool(() =>
        api.post(
          `/experiences/${encodeURIComponent(normalizeApiId(experience_id))}/achievements`,
          validateAchievementPayload(input, false),
        ),
      ),
  );

  const itemSchema = z.strictObject({
    experience_id: apiIdSchema,
    achievement_id: apiIdSchema,
  });
  server.registerTool(
    'get_experience_achievement',
    {
      description: 'Read one achievement from an experience.',
      inputSchema: itemSchema,
    },
    async ({ experience_id, achievement_id }) =>
      runTool(() =>
        api.get(
          `/experiences/${encodeURIComponent(normalizeApiId(experience_id))}/achievements/${encodeURIComponent(normalizeApiId(achievement_id))}`,
        ),
      ),
  );

  const updateSchema = z.strictObject({
    experience_id: apiIdSchema,
    achievement_id: apiIdSchema,
    changes: achievementPatchSchema,
  });
  server.registerTool(
    'update_experience_achievement',
    {
      description: 'Partially update one achievement from an experience.',
      inputSchema: updateSchema,
    },
    async ({ experience_id, achievement_id, changes }) =>
      runTool(() =>
        api.patch(
          `/experiences/${encodeURIComponent(normalizeApiId(experience_id))}/achievements/${encodeURIComponent(normalizeApiId(achievement_id))}`,
          validateAchievementPayload(changes, true),
        ),
      ),
  );

  server.registerTool(
    'delete_experience_achievement',
    {
      description: 'Permanently delete one achievement from an experience.',
      inputSchema: itemSchema,
    },
    async ({ experience_id, achievement_id }) =>
      runTool(async () => {
        await api.delete(
          `/experiences/${encodeURIComponent(normalizeApiId(experience_id))}/achievements/${encodeURIComponent(normalizeApiId(achievement_id))}`,
        );
        return { deleted: true };
      }),
  );
}
