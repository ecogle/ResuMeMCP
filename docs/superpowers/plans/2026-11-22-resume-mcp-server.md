# ResuMe MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Node MCP server that exposes all CRUD operations in the ResuMe PHP API through route-aligned MCP tools.

**Architecture:** A TypeScript MCP server communicates with local MCP clients over STDIO and uses a shared HTTP client for the fixed PHP API origin and `/api/v1` prefix. Resource-specific tools validate inputs, preserve the PHP API's ID and pagination semantics, and return API data or explicit errors without connecting to MySQL.

**Tech Stack:** Node.js 22.23.4+, TypeScript, `@modelcontextprotocol/sdk`, Zod, native `fetch`, npm, and Vitest.

**Spec:** [ResuMe MCP Server Design](../specs/2026-11-22-resume-mcp-server-design.md)

## Global Constraints

- Use STDIO transport; reserve stdout for MCP messages and write diagnostics to stderr.
- Call only the configured API origin under the fixed `/api/v1` prefix; do not connect to the database or expose an arbitrary HTTP request tool.
- Require HTTPS except for loopback development. Read the API base URL, username, and password from the MCP process environment.
- Keep all API identifiers as decimal strings. Collections use `limit` default `20`, maximum `100`, and `offset` default `0`.
- Treat API validation and business rules as authoritative. Preserve useful API error details, never silently retry mutations, and never log credentials.
- Treat HTTP `204` deletes as successful without parsing a response body.
- Use mocked HTTP transport for tests; tests must not require live credentials or a database.

## Review Focus

- Missing configuration, malformed base URLs, and remote plain HTTP: test fail-closed behavior and confirm errors never include credentials (Task 1).
- IDs above JavaScript's safe integer range, invalid decimal IDs, and pagination boundaries: preserve valid IDs as strings and reject invalid limits/offsets (Tasks 2-3).
- Empty `204` responses and malformed or non-JSON API responses: do not attempt to parse empty bodies or return success-shaped data for failures (Task 2).
- PHP validation/authentication errors and network timeouts: retain status, code, message, and field details while reporting transport failures explicitly (Task 2).
- Nested achievement and version-membership routes: use each parent ID in its correct path position and pass `PUT` overrides without changing them (Task 4).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore` | Node project metadata, scripts, compiler settings, and generated/secret-file exclusions |
| `src/config.ts` | Validate required process environment and API-origin security rules |
| `src/api/client.ts` | Authenticated HTTP methods, fixed API prefix, pagination query, timeout, and response parsing |
| `src/api/errors.ts` | Typed HTTP and transport errors |
| `src/tools/resource-definitions.ts` | Strict resource field schemas and the API resource-to-tool naming/path map |
| `src/tools/register-resource-tools.ts` | Register top-level resource CRUD and candidate summary tools |
| `src/tools/register-achievement-tools.ts` | Register experience achievement CRUD tools |
| `src/tools/register-membership-tools.ts` | Register version section and version achievement membership tools |
| `src/tools/tool-results.ts` | Convert API successes and known failures into MCP tool results |
| `src/server.ts` | Compose the MCP server and all tool registrations |
| `src/index.ts` | Load configuration, start STDIO transport, and report process-level failures to stderr |
| `tests/config.test.ts` | Environment and URL security tests |
| `tests/api-client.test.ts` | HTTP construction, response, error, timeout, and ID/query tests |
| `tests/resource-tools.test.ts` | Resource schema and CRUD registration/dispatch tests |
| `tests/achievement-tools.test.ts` | Nested achievement CRUD tests |
| `tests/membership-tools.test.ts` | Version section membership route and payload tests |
| `tests/server.test.ts` | Complete server tool catalog and MCP result integration tests |
| `README.md` | Setup, environment variables, MCP client configuration, and complete tool catalog |

`ResuMeMCP` currently has no Git repository. Do not initialize Git or create commits as part of this implementation.

### Task 1: Scaffold the Node project and validate configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- `loadConfig(env: NodeJS.ProcessEnv): ServerConfig`
- `ServerConfig`: `{ apiBaseUrl: URL; username: string; password: string }`
- Read `RESUME_API_BASE_URL`, `RESUME_API_USERNAME`, and `RESUME_API_PASSWORD`. The base URL is the API origin (for example `https://host.example` or local `http://127.0.0.1:8000`), not a URL already ending in `/api/v1`.
- Throw `ConfigError` for missing or invalid values. Error text must not contain the username or password.

- [ ] **Step 1: Write the failing configuration tests**

Create the package manifest and TypeScript/Vitest configuration needed to run tests, add the scripts `build`, `test`, and `start`, then add these cases to `tests/config.test.ts`:
- Missing each required variable throws `ConfigError`.
- HTTPS origin with or without one trailing slash normalizes to the same origin.
- HTTP loopback is accepted; remote HTTP, URL credentials, and a non-root path are rejected.
- Error messages do not contain configured username or password.
Run `npm install` after adding the dependency manifest.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL because `src/config.ts` does not exist yet.

- [ ] **Step 3: Implement `loadConfig` and `ConfigError` in `src/config.ts`**

Use ESM TypeScript with the official MCP SDK, Zod, and Vitest. Ignore `node_modules`, `dist`, `.env`, and coverage output. Do not add a `.env` loader: the MCP host supplies environment variables.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- tests/config.test.ts`
Expected: PASS for all URL and environment cases.

### Task 2: Implement the authenticated PHP API client

**Files:**
- Create: `src/api/client.ts`
- Create: `src/api/errors.ts`
- Test: `tests/api-client.test.ts`

**Interfaces:**
- `ResumeApiClient(config: ServerConfig, fetchImpl?: typeof fetch)`
- `get<T>(route: string, query?: ApiQuery): Promise<ApiEnvelope<T>>`
- `post<T>(route: string, body: unknown): Promise<ApiEnvelope<T>>`
- `patch<T>(route: string, body: unknown): Promise<ApiEnvelope<T>>`
- `put<T>(route: string, body: unknown): Promise<ApiEnvelope<T>>`
- `delete(route: string): Promise<void>`
- `ApiEnvelope<T>` is `{ data: T; pagination?: { limit: number; offset: number } }`.
- `ApiQuery` is `{ limit?: number; offset?: number }`.
- `ApiError` carries HTTP `status`, PHP error `code`, `message`, and optional `details`; `ApiTransportError` carries a safe transport/timeout message without request credentials.

- [ ] **Step 1: Write failing client tests using an injected fetch mock**

Add tests named `adds_basic_auth_and_fixed_api_prefix`, `serializes_json_and_pagination`, `preserves_string_ids_and_php_error_details`, `accepts_empty_204_delete`, and `reports_transport_and_invalid_json_failures`. Assert:
- Requests target only the configured origin plus `/api/v1` and the supplied route.
- GET query values stay decimal strings/numbers and do not coerce record IDs.
- Write methods send JSON with `Content-Type: application/json`; Basic auth is generated from the configured credentials.
- PHP errors retain status, code, message, and details; failed or invalid responses do not become success results.
- DELETE accepts an empty `204` body, and a failed mutation is attempted once (no retry).

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/api-client.test.ts`
Expected: FAIL because `ResumeApiClient` and its errors are not implemented.

- [ ] **Step 3: Implement `ResumeApiClient` and typed API errors**

Join paths under `/api/v1`, add `limit`/`offset` with `URLSearchParams`, send Basic auth, use a 30-second request timeout, reject redirects, and parse JSON only when a response has a body. Wrap network/timeout failures as `ApiTransportError`; do not catch unrelated programming errors.

- [ ] **Step 4: Run the API client tests**

Run: `npm test -- tests/api-client.test.ts`
Expected: PASS, including large ID strings, API error details, and empty `204` responses.

### Task 3: Add top-level resource and experience-achievement tools

**Files:**
- Create: `src/tools/resource-definitions.ts`
- Create: `src/tools/register-resource-tools.ts`
- Create: `src/tools/register-achievement-tools.ts`
- Create: `src/tools/tool-results.ts`
- Test: `tests/resource-tools.test.ts`
- Test: `tests/achievement-tools.test.ts`

**Interfaces:**
- `registerResourceTools(server: McpServer, api: ResumeApiClient): void`
- `registerAchievementTools(server: McpServer, api: ResumeApiClient): void`
- Register `list_<resource>`, `create_<resource>`, `get_<resource>`, `update_<resource>`, and `delete_<resource>` for candidates, contact methods, employers, experiences, skills, education records, projects, certifications, and resume versions.
- Register `list_candidate_summaries` for `GET /list`.
- Register `list_experience_achievements`, `create_experience_achievement`, `get_experience_achievement`, `update_experience_achievement`, and `delete_experience_achievement`.
- List tools take optional `limit` and `offset`; get/delete tools take string IDs; update tools take a string ID and a non-empty `changes` object; create tools take the resource's writable fields.

- [ ] **Step 1: Write failing schema and registration tests**

Add tests named `registers_all_top_level_crud_tools`, `maps_resource_ids_and_fields`, `rejects_unknown_or_empty_patch_fields`, `validates_php_field_constraints`, and `registers_nested_achievement_crud`. Verify all nine resource routes, the `/list` summary tool, pagination bounds, and the five achievement routes. Accept `18446744073709551615` as an ID string and reject zero, non-decimal IDs, and larger values. Mirror writable field names, requiredness, types, nullability, defaults, lengths, date/URL rules, and date-pair/current-experience validation from `PhpApi\api\ResourceSchema.php`.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/resource-tools.test.ts tests/achievement-tools.test.ts`
Expected: FAIL because definitions and tool registrations do not exist.

- [ ] **Step 3: Implement strict resource schemas and tool registration**

Use strict Zod objects so unknown API fields are rejected. Keep identifiers as decimal strings, enforce `limit` 1-100 and non-negative `offset`, and use route-specific singular/plural names without exposing arbitrary paths. `tool-results.ts` must return structured `data`/pagination on success and explicit MCP errors for `ApiError` or `ApiTransportError`; let unexpected programming errors surface.

- [ ] **Step 4: Run the focused tool tests**

Run: `npm test -- tests/resource-tools.test.ts tests/achievement-tools.test.ts`
Expected: PASS; all 51 tools in this group are registered (45 top-level CRUD, five achievement CRUD, and one candidate summary).

### Task 4: Add resume-version membership tools

**Files:**
- Create: `src/tools/register-membership-tools.ts`
- Test: `tests/membership-tools.test.ts`

**Interfaces:**
- `registerMembershipTools(server: McpServer, api: ResumeApiClient): void`
- For each section `contacts`, `experiences`, `skills`, `education`, `projects`, and `certifications`, register list, PUT, and DELETE membership tools.
- Also register list, PUT, and DELETE tools for version achievements, which require `resume_version_id` and `experience_id`; PUT/DELETE additionally require `achievement_id`.
- List tools accept optional `limit` and `offset`; PUT tools accept only the section's writable membership fields.

- [ ] **Step 1: Write failing membership route and payload tests**

Add tests named `lists_each_version_section`, `puts_and_deletes_each_membership`, and `uses_both_parent_ids_for_version_achievements`. Verify exact section paths, string IDs, `PUT` fields (`display_order`, `summary_override`, or `achievement_text_override` as applicable), and HTTP 204 handling.

- [ ] **Step 2: Run the membership tests and verify they fail**

Run: `npm test -- tests/membership-tools.test.ts`
Expected: FAIL because membership tools are not registered.

- [ ] **Step 3: Register the 21 version membership tools**

Map the six regular sections to `/resume-versions/{versionId}/{section}` and version achievements to `/resume-versions/{versionId}/experiences/{experienceId}/achievements`. Use strict schemas, preserve nullable overrides, and keep `display_order` within 0-65535.

- [ ] **Step 4: Run the membership tests**

Run: `npm test -- tests/membership-tools.test.ts`
Expected: PASS for all 21 membership operations (18 regular section tools and three version-achievement tools).

### Task 5: Compose the STDIO server and document setup

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`
- Create: `tests/server.test.ts`
- Create: `README.md`
- Modify: `package.json` if needed to finalize `start`/`build` scripts

**Interfaces:**
- `createServer(config: ServerConfig, fetchImpl?: typeof fetch): McpServer`
- `main(): Promise<void>` loads process configuration, creates the server, and connects `StdioServerTransport`.

- [ ] **Step 1: Write failing server composition tests**

Add tests named `registers_the_complete_catalog` and `returns_structured_tool_results`. Verify the complete 72-tool catalog, that successful tool calls return API data/pagination in structured output, that deletes report success without parsing a body, and that PHP failures return MCP `isError` results with status and details.

- [ ] **Step 2: Run the server tests and verify they fail**

Run: `npm test -- tests/server.test.ts`
Expected: FAIL because no server composition or entrypoint exists.

- [ ] **Step 3: Implement server composition, entrypoint, and README**

Register resource, achievement, and membership tools on the official MCP server. Connect only over STDIO. Write startup diagnostics to stderr, set a failing process exit code for configuration/startup errors, and do not log secrets. Document npm setup, all three environment variables, the local PHP API example, MCP client STDIO configuration, HTTPS requirements, and the complete tool catalog.

- [ ] **Step 4: Run the complete test suite and build**

Run: `npm test`
Expected: PASS without live API credentials or MySQL.

Run: `npm run build`
Expected: TypeScript compilation succeeds and produces `dist/index.js`.
