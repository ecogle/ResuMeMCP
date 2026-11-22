# ResuMe MCP Server

A local Model Context Protocol server that exposes the ResuMe PHP API as
route-aligned tools. It uses HTTP Basic authentication and the MCP STDIO
transport; all API reads and writes go through the PHP API.

## Requirements and build

- Node.js `>=22.23.4`
- A running ResuMe PHP API and its configured MySQL database

From this directory, install dependencies and build the server:

```powershell
npm install
npm run build
```

The MCP client starts the built server with `npm start` or runs
`node dist/index.js` directly.

## Configuration

Set these environment variables in the MCP client's server configuration:

| Variable | Description |
| --- | --- |
| `RESUME_API_BASE_URL` | PHP API origin only, without `/api/v1` or another path. Use HTTPS except for loopback development. |
| `RESUME_API_USERNAME` | HTTP Basic Auth username accepted by the PHP API. |
| `RESUME_API_PASSWORD` | HTTP Basic Auth password accepted by the PHP API. |

For local development, the API origin can be `http://127.0.0.1:8080`. The PHP
API must separately be configured with matching `ADMIN_USER` and
`ADMIN_PASSWORD` values, plus its `DB_*` settings. From the `PhpApi` directory,
the PHP built-in server can route API requests through `index.php`:

```powershell
php -S 127.0.0.1:8080 index.php
```

Remote API origins must use HTTPS. The server rejects credentials, paths,
queries, or fragments embedded in `RESUME_API_BASE_URL`; it appends the fixed
`/api/v1` prefix itself. Credentials are read from the environment and are not
written to logs.

## MCP client configuration

Build the project first, then configure the client to launch the compiled
entrypoint. Replace the path and credential placeholders; do not check real
credentials into source control.

```json
{
  "mcpServers": {
    "resume": {
      "command": "node",
      "args": ["C:\\path\\to\\ResuMeMCP\\dist\\index.js"],
      "env": {
        "RESUME_API_BASE_URL": "http://127.0.0.1:8080",
        "RESUME_API_USERNAME": "<PHP API username>",
        "RESUME_API_PASSWORD": "<PHP API password>"
      }
    }
  }
}
```

The server communicates over STDIO. Startup diagnostics are written to stderr,
leaving stdout available for MCP messages.

## Tool catalog

The server registers 72 tools. IDs are decimal strings so large PHP `BIGINT`
values are preserved. Collection tools accept optional `limit` and `offset`
pagination arguments. Successful reads and writes return API `data` and
pagination in structured MCP output; successful detach/delete operations return
`{ "deleted": true }` after the API's empty `204` response.

### Top-level resources

| Resource | List | Create | Get | Update | Delete |
| --- | --- | --- | --- | --- | --- |
| Candidates | `list_candidates` | `create_candidate` | `get_candidate` | `update_candidate` | `delete_candidate` |
| Contact methods | `list_contact_methods` | `create_contact_method` | `get_contact_method` | `update_contact_method` | `delete_contact_method` |
| Employers | `list_employers` | `create_employer` | `get_employer` | `update_employer` | `delete_employer` |
| Experiences | `list_experiences` | `create_experience` | `get_experience` | `update_experience` | `delete_experience` |
| Skills | `list_skills` | `create_skill` | `get_skill` | `update_skill` | `delete_skill` |
| Education records | `list_education_records` | `create_education_record` | `get_education_record` | `update_education_record` | `delete_education_record` |
| Projects | `list_projects` | `create_project` | `get_project` | `update_project` | `delete_project` |
| Certifications | `list_certifications` | `create_certification` | `get_certification` | `update_certification` | `delete_certification` |
| Resume versions | `list_resume_versions` | `create_resume_version` | `get_resume_version` | `update_resume_version` | `delete_resume_version` |

`list_candidate_summaries` reads the read-only candidate summary endpoint.

### Experience achievements

| Operation | Tool |
| --- | --- |
| List achievements for an experience | `list_experience_achievements` |
| Create an experience achievement | `create_experience_achievement` |
| Get an experience achievement | `get_experience_achievement` |
| Update an experience achievement | `update_experience_achievement` |
| Delete an experience achievement | `delete_experience_achievement` |

### Resume-version memberships

| Section | List | Attach or update (`PUT`) | Detach (`DELETE`) |
| --- | --- | --- | --- |
| Contacts | `list_resume_version_contacts` | `put_resume_version_contact` | `delete_resume_version_contact` |
| Experiences | `list_resume_version_experiences` | `put_resume_version_experience` | `delete_resume_version_experience` |
| Skills | `list_resume_version_skills` | `put_resume_version_skill` | `delete_resume_version_skill` |
| Education | `list_resume_version_education` | `put_resume_version_education` | `delete_resume_version_education` |
| Projects | `list_resume_version_projects` | `put_resume_version_project` | `delete_resume_version_project` |
| Certifications | `list_resume_version_certifications` | `put_resume_version_certification` | `delete_resume_version_certification` |
| Experience achievements | `list_resume_version_experience_achievements` | `put_resume_version_experience_achievement` | `delete_resume_version_experience_achievement` |

Membership `PUT` tools accept only writable fields: `display_order` for all
sections, `summary_override` for experiences and projects, and
`achievement_text_override` for version achievements. The override fields may
be `null`. Achievement membership tools require both `resume_version_id` and
`experience_id`.

Top-level `delete_*` tools permanently delete their resource. Membership
`delete_resume_version_*` tools only detach a resource from a resume version;
they do not delete the underlying resource.
