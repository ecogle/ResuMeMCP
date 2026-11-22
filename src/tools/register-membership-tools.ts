import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { ResumeApiClient } from '../api/client.js';
import {
  apiIdSchema,
  listQuerySchema,
  normalizeApiId,
} from './resource-definitions.js';
import { runTool, ToolInputError } from './tool-results.js';

interface MembershipSectionDefinition {
  section: string;
  singular: string;
  label: string;
  recordIdField: string;
  fields: z.ZodRawShape;
}

const displayOrderField = z.number().int().min(0).max(65535).optional();
const nullableTextOverrideField = z.string().nullable().optional();

const membershipSections = [
  {
    section: 'contacts',
    singular: 'contact',
    label: 'contact method',
    recordIdField: 'contact_method_id',
    fields: { display_order: displayOrderField },
  },
  {
    section: 'experiences',
    singular: 'experience',
    label: 'experience',
    recordIdField: 'experience_id',
    fields: {
      display_order: displayOrderField,
      summary_override: nullableTextOverrideField,
    },
  },
  {
    section: 'skills',
    singular: 'skill',
    label: 'skill',
    recordIdField: 'skill_id',
    fields: { display_order: displayOrderField },
  },
  {
    section: 'education',
    singular: 'education',
    label: 'education record',
    recordIdField: 'education_id',
    fields: { display_order: displayOrderField },
  },
  {
    section: 'projects',
    singular: 'project',
    label: 'project',
    recordIdField: 'project_id',
    fields: {
      display_order: displayOrderField,
      summary_override: nullableTextOverrideField,
    },
  },
  {
    section: 'certifications',
    singular: 'certification',
    label: 'certification',
    recordIdField: 'certification_id',
    fields: { display_order: displayOrderField },
  },
] satisfies readonly MembershipSectionDefinition[];

const versionAchievementFields = {
  display_order: displayOrderField,
  achievement_text_override: nullableTextOverrideField,
};

const versionAchievementListSchema = z.strictObject({
  resume_version_id: apiIdSchema,
  experience_id: apiIdSchema,
  ...listQuerySchema.shape,
});

const versionAchievementItemSchema = z.strictObject({
  resume_version_id: apiIdSchema,
  experience_id: apiIdSchema,
  achievement_id: apiIdSchema,
});

const versionAchievementPutSchema = z.strictObject({
  ...versionAchievementItemSchema.shape,
  ...versionAchievementFields,
});

export function registerMembershipTools(server: McpServer, api: ResumeApiClient): void {
  const listSectionSchema = z.strictObject({
    resume_version_id: apiIdSchema,
    ...listQuerySchema.shape,
  });

  for (const section of membershipSections) {
    server.registerTool(
      `list_resume_version_${section.section}`,
      {
        description: `List ${section.label} memberships in a resume version.`,
        inputSchema: listSectionSchema,
      },
      async ({ resume_version_id, ...query }) =>
        runTool(() =>
          api.get(
            `${versionSectionRoute(section.section, resume_version_id)}`,
            query,
          ),
        ),
    );

    const itemSchema = z.strictObject({
      resume_version_id: apiIdSchema,
      [section.recordIdField]: apiIdSchema,
    });
    const putSchema = z.strictObject({
      ...itemSchema.shape,
      ...section.fields,
    });

    server.registerTool(
      `put_resume_version_${section.singular}`,
      {
        description: `Attach a ${section.label} to a resume version or update its membership fields.`,
        inputSchema: putSchema,
      },
      async (input) =>
        runTool(() => {
          const resumeVersionId = readStringArgument(input, 'resume_version_id');
          const recordId = readStringArgument(input, section.recordIdField);
          const body = membershipFields(input, ['resume_version_id', section.recordIdField]);
          return api.put(
            versionSectionItemRoute(section.section, resumeVersionId, recordId),
            body,
          );
        }),
    );

    server.registerTool(
      `delete_resume_version_${section.singular}`,
      {
        description: `Detach a ${section.label} from a resume version without deleting the source record.`,
        inputSchema: itemSchema,
      },
      async (input) =>
        runTool(async () => {
          const resumeVersionId = readStringArgument(input, 'resume_version_id');
          const recordId = readStringArgument(input, section.recordIdField);
          await api.delete(
            versionSectionItemRoute(section.section, resumeVersionId, recordId),
          );
          return { deleted: true };
        }),
    );
  }

  server.registerTool(
    'list_resume_version_experience_achievements',
    {
      description: 'List achievements attached to an experience in a resume version.',
      inputSchema: versionAchievementListSchema,
    },
    async ({ resume_version_id, experience_id, ...query }) =>
      runTool(() =>
        api.get(
          versionAchievementCollectionRoute(resume_version_id, experience_id),
          query,
        ),
      ),
  );

  server.registerTool(
    'put_resume_version_experience_achievement',
    {
      description: 'Attach an experience achievement to a resume version or update its membership fields.',
      inputSchema: versionAchievementPutSchema,
    },
    async ({ resume_version_id, experience_id, achievement_id, ...fields }) =>
      runTool(() =>
        api.put(
          versionAchievementItemRoute(resume_version_id, experience_id, achievement_id),
          fields,
        ),
      ),
  );

  server.registerTool(
    'delete_resume_version_experience_achievement',
    {
      description: 'Detach an achievement from a resume version without deleting the experience achievement.',
      inputSchema: versionAchievementItemSchema,
    },
    async ({ resume_version_id, experience_id, achievement_id }) =>
      runTool(async () => {
        await api.delete(
          versionAchievementItemRoute(resume_version_id, experience_id, achievement_id),
        );
        return { deleted: true };
      }),
  );
}

function versionSectionRoute(section: string, resumeVersionId: string): string {
  return `/resume-versions/${apiIdSegment(resumeVersionId)}/${section}`;
}

function versionSectionItemRoute(
  section: string,
  resumeVersionId: string,
  recordId: string,
): string {
  return `${versionSectionRoute(section, resumeVersionId)}/${apiIdSegment(recordId)}`;
}

function versionAchievementCollectionRoute(
  resumeVersionId: string,
  experienceId: string,
): string {
  return `/resume-versions/${apiIdSegment(resumeVersionId)}/experiences/${apiIdSegment(experienceId)}/achievements`;
}

function versionAchievementItemRoute(
  resumeVersionId: string,
  experienceId: string,
  achievementId: string,
): string {
  return `${versionAchievementCollectionRoute(resumeVersionId, experienceId)}/${apiIdSegment(achievementId)}`;
}

function apiIdSegment(id: string): string {
  return encodeURIComponent(normalizeApiId(id));
}

function readStringArgument(input: object, key: string): string {
  const value = Reflect.get(input, key);
  if (typeof value !== 'string') {
    throw new ToolInputError(`${key} must be a string.`);
  }
  return value;
}

function membershipFields(
  input: object,
  excludedFields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => !excludedFields.includes(key)),
  );
}
