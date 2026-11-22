import * as z from 'zod/v4';
import { ToolInputError } from './tool-results.js';

const MAX_UNSIGNED_ID = '18446744073709551615';

function requiredString(maxLength?: number): z.ZodString {
  const schema = z.string().min(1);
  return maxLength === undefined ? schema : schema.max(maxLength);
}

function nullableString(maxLength?: number) {
  const schema = z.string();
  return (maxLength === undefined ? schema : schema.max(maxLength)).nullable().optional();
}

function nullableUrl(maxLength: number) {
  return z.url().max(maxLength).nullable().optional();
}

function nullableDate() {
  return z.iso.date().nullable().optional();
}

function optionalBoolean(defaultValue: boolean) {
  return z.boolean().optional().describe(`Defaults to ${defaultValue} when omitted.`);
}

function optionalSmallInt(defaultValue: number) {
  return z
    .number()
    .int()
    .min(0)
    .max(65535)
    .optional()
    .describe(`Defaults to ${defaultValue} when omitted.`);
}

export const apiIdSchema = z
  .string()
  .regex(/^[0-9]+$/)
  .describe('A positive decimal ID string.');

export const listQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export interface ResourceDefinition {
  path: string;
  collectionTool: string;
  singularTool: string;
  primaryKey: string;
  idFields: readonly string[];
  requiredStringFields: readonly string[];
  urlFields: readonly string[];
  datePairs: readonly (readonly [string, string])[];
  currentEndPair?: {
    current: string;
    end: string;
  };
  createSchema: z.ZodType;
  patchSchema: z.ZodType;
}

function defineResource(
  definition: Omit<ResourceDefinition, 'createSchema' | 'patchSchema'> & {
    fields: z.ZodRawShape;
  },
): ResourceDefinition {
  const { fields, ...metadata } = definition;
  const createSchema = z.strictObject(fields);

  return {
    ...metadata,
    createSchema,
    patchSchema: createSchema.partial(),
  };
}

export const resourceDefinitions = {
  candidates: defineResource({
    path: 'candidates',
    collectionTool: 'candidates',
    singularTool: 'candidate',
    primaryKey: 'candidate_id',
    idFields: [],
    requiredStringFields: ['full_name'],
    urlFields: [],
    datePairs: [],
    fields: {
      full_name: requiredString(150),
      preferred_name: nullableString(100),
      location: nullableString(255),
    },
  }),
  contactMethods: defineResource({
    path: 'contact-methods',
    collectionTool: 'contact_methods',
    singularTool: 'contact_method',
    primaryKey: 'contact_method_id',
    idFields: ['candidate_id'],
    requiredStringFields: ['contact_type', 'label', 'contact_value'],
    urlFields: [],
    datePairs: [],
    fields: {
      candidate_id: apiIdSchema,
      contact_type: requiredString(40),
      label: requiredString(100),
      contact_value: requiredString(500),
      is_primary: optionalBoolean(false),
    },
  }),
  employers: defineResource({
    path: 'employers',
    collectionTool: 'employers',
    singularTool: 'employer',
    primaryKey: 'employer_id',
    idFields: [],
    requiredStringFields: ['company_name'],
    urlFields: ['website'],
    datePairs: [],
    fields: {
      company_name: requiredString(200),
      location: nullableString(255),
      website: nullableUrl(500),
    },
  }),
  experiences: defineResource({
    path: 'experiences',
    collectionTool: 'experiences',
    singularTool: 'experience',
    primaryKey: 'experience_id',
    idFields: ['employer_id'],
    requiredStringFields: ['job_title'],
    urlFields: [],
    datePairs: [['start_date', 'end_date']],
    currentEndPair: { current: 'is_current', end: 'end_date' },
    fields: {
      employer_id: apiIdSchema.nullable().optional(),
      job_title: requiredString(180),
      location: nullableString(255),
      employment_type: nullableString(40),
      start_date: nullableDate(),
      end_date: nullableDate(),
      is_current: optionalBoolean(false),
      summary: nullableString(),
    },
  }),
  skills: defineResource({
    path: 'skills',
    collectionTool: 'skills',
    singularTool: 'skill',
    primaryKey: 'skill_id',
    idFields: [],
    requiredStringFields: ['skill_name', 'category'],
    urlFields: [],
    datePairs: [],
    fields: {
      skill_name: requiredString(120),
      category: requiredString(60),
    },
  }),
  education: defineResource({
    path: 'education',
    collectionTool: 'education_records',
    singularTool: 'education_record',
    primaryKey: 'education_id',
    idFields: [],
    requiredStringFields: ['institution_name'],
    urlFields: [],
    datePairs: [['start_date', 'end_date']],
    fields: {
      institution_name: requiredString(200),
      credential: nullableString(160),
      field_of_study: nullableString(160),
      location: nullableString(255),
      start_date: nullableDate(),
      end_date: nullableDate(),
      details: nullableString(),
    },
  }),
  projects: defineResource({
    path: 'projects',
    collectionTool: 'projects',
    singularTool: 'project',
    primaryKey: 'project_id',
    idFields: [],
    requiredStringFields: ['project_name'],
    urlFields: ['project_url'],
    datePairs: [['start_date', 'end_date']],
    fields: {
      project_name: requiredString(180),
      project_role: nullableString(160),
      project_url: nullableUrl(500),
      start_date: nullableDate(),
      end_date: nullableDate(),
      summary: nullableString(),
    },
  }),
  certifications: defineResource({
    path: 'certifications',
    collectionTool: 'certifications',
    singularTool: 'certification',
    primaryKey: 'certification_id',
    idFields: [],
    requiredStringFields: ['certification_name', 'issuing_organization'],
    urlFields: ['credential_url'],
    datePairs: [['issued_date', 'expiration_date']],
    fields: {
      certification_name: requiredString(200),
      issuing_organization: requiredString(200),
      credential_id: nullableString(150),
      credential_url: nullableUrl(500),
      issued_date: nullableDate(),
      expiration_date: nullableDate(),
    },
  }),
  resumeVersions: defineResource({
    path: 'resume-versions',
    collectionTool: 'resume_versions',
    singularTool: 'resume_version',
    primaryKey: 'resume_version_id',
    idFields: ['candidate_id'],
    requiredStringFields: ['version_name', 'target_title'],
    urlFields: [],
    datePairs: [],
    fields: {
      candidate_id: apiIdSchema,
      version_name: requiredString(120),
      target_title: requiredString(160),
      headline: nullableString(255),
      summary: nullableString(),
      is_published: optionalBoolean(false),
    },
  }),
} satisfies Record<string, ResourceDefinition>;

const achievementFields = {
  achievement_text: requiredString(),
  default_order: optionalSmallInt(0),
};

export const achievementCreateSchema = z.strictObject(achievementFields);
export const achievementPatchSchema = achievementCreateSchema.partial();

export function normalizeApiId(value: string, field = 'id'): string {
  if (!/^[0-9]+$/.test(value)) {
    throw new ToolInputError(`${field} must be a positive decimal ID string.`, {
      [field]: ['IDs must be positive decimal strings.'],
    });
  }

  const normalized = value.replace(/^0+/, '') || '0';
  if (
    normalized === '0' ||
    normalized.length > MAX_UNSIGNED_ID.length ||
    (normalized.length === MAX_UNSIGNED_ID.length && normalized > MAX_UNSIGNED_ID)
  ) {
    throw new ToolInputError(`${field} is outside the supported ID range.`, {
      [field]: ['The ID is outside the supported range.'],
    });
  }

  return normalized;
}

export function validateResourcePayload(
  definition: ResourceDefinition,
  input: unknown,
  partial: boolean,
): Record<string, unknown> {
  const parsed = (partial ? definition.patchSchema : definition.createSchema).safeParse(input);
  if (!parsed.success) {
    throw new ToolInputError('The request contains invalid fields.', issuesToDetails(parsed.error.issues));
  }
  if (!isRecord(parsed.data)) {
    throw new ToolInputError('The request body must be an object.');
  }

  const payload = { ...parsed.data };
  if (partial && Object.keys(payload).length === 0) {
    throw new ToolInputError('At least one writable field is required.', {
      _body: ['At least one writable field is required.'],
    });
  }

  for (const field of definition.requiredStringFields) {
    const value = payload[field];
    if (typeof value === 'string' && value.trim() === '') {
      throw new ToolInputError('The request contains invalid fields.', {
        [field]: ['This field must not be empty.'],
      });
    }
  }

  for (const field of definition.urlFields) {
    const value = payload[field];
    if (typeof value === 'string') {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new ToolInputError('The request contains invalid fields.', {
          [field]: ['URLs must be absolute HTTP or HTTPS URLs.'],
        });
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '') {
        throw new ToolInputError('The request contains invalid fields.', {
          [field]: ['URLs must be absolute HTTP or HTTPS URLs.'],
        });
      }
    }
  }

  for (const [startField, endField] of definition.datePairs) {
    const start = payload[startField];
    const end = payload[endField];
    if (typeof start === 'string' && typeof end === 'string' && end < start) {
      throw new ToolInputError('The request contains invalid fields.', {
        [endField]: ['The end date must not be earlier than the start date.'],
      });
    }
  }

  if (definition.currentEndPair !== undefined) {
    const current = payload[definition.currentEndPair.current];
    const end = payload[definition.currentEndPair.end];
    if (current === true && end !== undefined && end !== null) {
      throw new ToolInputError('The request contains invalid fields.', {
        [definition.currentEndPair.end]: ['A current experience must not have an end date.'],
      });
    }
  }

  for (const field of definition.idFields) {
    const value = payload[field];
    if (typeof value === 'string') {
      payload[field] = normalizeApiId(value, field);
    }
  }

  return payload;
}

export function validateAchievementPayload(input: unknown, partial: boolean): Record<string, unknown> {
  const schema = partial ? achievementPatchSchema : achievementCreateSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ToolInputError('The achievement contains invalid fields.', issuesToDetails(parsed.error.issues));
  }
  if (!isRecord(parsed.data)) {
    throw new ToolInputError('The achievement body must be an object.');
  }

  const payload = { ...parsed.data };
  if (partial && Object.keys(payload).length === 0) {
    throw new ToolInputError('At least one writable field is required.', {
      _body: ['At least one writable field is required.'],
    });
  }
  if (typeof payload.achievement_text === 'string' && payload.achievement_text.trim() === '') {
    throw new ToolInputError('The achievement contains invalid fields.', {
      achievement_text: ['This field must not be empty.'],
    });
  }

  return payload;
}

function issuesToDetails(issues: readonly { path: PropertyKey[]; message: string }[]): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of issues) {
    const field = issue.path.length === 0 ? '_body' : String(issue.path[0]);
    details[field] = [...(details[field] ?? []), issue.message];
  }

  return details;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
