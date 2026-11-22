# ResuMe MCP Server Design

## Intent

Create a standalone Node MCP server in `ResuMeMCP` so MCP clients can manage
ResuMe data through the existing authenticated PHP API. The user confirmed that
all CRUD operations should be in scope and selected route-aligned MCP tools.

## Goals

- Expose the PHP API's CRUD operations as discoverable, operation-specific MCP
  tools with input schemas that match the API contract.
- Support all nine top-level resources: candidates, contact methods, employers,
  experiences, skills, education, projects, certifications, and resume versions.
- Support nested experience achievement CRUD and resume-version membership
  operations for contacts, experiences, skills, education, projects,
  certifications, and achievements.
- Include the API's candidate summary list endpoint.
- Preserve API pagination, string IDs, response data, and useful validation or
  server errors for MCP callers.
- Keep PHP credentials in server-side environment variables and never expose
  them in tool results or logs.

## Non-goals and anti-goals

- Do not change the Astro application or PHP API.
- Do not connect to MySQL directly or duplicate its business rules.
- Do not provide an arbitrary URL or unrestricted HTTP request tool.
- Do not silently retry mutations, hide API errors, or return success-shaped
  fallbacks.
- Do not implement resume generation, file downloads, or other application
  workflows not provided by the PHP API.

## Constraints and API contract

- All application reads and writes go to the PHP API's fixed `/api/v1` prefix.
- The PHP API uses HTTP Basic authentication and expects HTTPS outside local
  development. The MCP server will read a base URL, username, and password from
  its environment; credentials will not be hard-coded.
- The MCP server will use STDIO transport for local MCP clients. Diagnostics go
  to stderr so stdout remains reserved for MCP messages.
- Collection routes support `GET` and `POST`; item routes support `GET`,
  `PATCH`, and `DELETE`. Experience achievements are nested under an experience
  and support the corresponding CRUD operations.
- Resume-version sections are listed with `GET`, attached or updated with
  `PUT`, and detached with `DELETE`; version achievements are nested under both
  a version and an experience.
- Collections accept `limit` (default 20, maximum 100) and `offset` (default 0).
  API identifiers are decimal strings to preserve `BIGINT` values. Successful
  deletes return `204` with no body. API errors use an `error` object with a
  code, message, and optional field details.
- The MCP tool schemas will mirror the PHP API's writable fields and validation
  rules. PHP remains authoritative and may reject requests with field-level
  errors.

## Approaches considered

1. **Constrained request proxy:** few tools and maximum flexibility, but MCP
   callers must know the PHP routes and payload schemas. Even when constrained
   to `/api/v1`, this is less discoverable and easier to misuse.
2. **Grouped resource/action tools:** fewer tools, but generic payload objects
   make it harder to validate required and writable fields per operation.
3. **Route-aligned tools (selected):** dedicated tools for collection reads and
   creates, item reads/updates/deletes, achievement CRUD, and version-section
   membership operations. This is a larger catalog, but maps clearly to the
   existing API and supports precise input schemas.

## Proposed implementation

- Build a TypeScript Node project using the official MCP SDK and STDIO transport.
- Implement one shared API client for URL construction, Basic authentication,
  JSON encoding/decoding, pagination, timeouts, and PHP error translation.
  Restrict requests to the configured API origin and `/api/v1`; allow plain
  HTTP only for loopback development.
- Define route-aligned tools for each top-level resource and nested achievement
  resource. Define tools for each version-section membership action, including
  the two-parent route required for version achievements. Use descriptive tool
  names, resource-specific argument schemas, and document destructive actions.
- Include a tool for the read-only candidate summary endpoint. Keep all record
  IDs as strings and pass `limit`/`offset` through without widening the API's
  supported ranges.
- Return API `data` and pagination in a structured MCP result. For `204`
  responses, return a clear success result without attempting to parse a body.
  Surface API failures as MCP tool errors with the HTTP status and API error
  details; do not include authentication headers or secrets.
- Add a README with setup, required environment variables, MCP client
  configuration, and the complete tool catalog. Add tests using a mocked HTTP
  transport so no live API credentials or database are needed.

## Decisions left to the builder

- Exact tool names and how repetitive route-aligned definitions are organized
  internally.
- The MCP SDK's current TypeScript APIs and compatible dependency versions.
- Whether the configured base URL accepts a trailing slash; normalize it
  consistently while always appending `/api/v1`.
