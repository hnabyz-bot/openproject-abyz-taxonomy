# openproject-abyz-taxonomy

OpenProject plugin for Abyz taxonomy/title support.

Purpose:

- Store display-only title/category nodes separately from WorkPackage and Project.
- Assign taxonomy nodes to Projects and WorkPackages.
- Provide UI and API endpoints for creating title nodes, assigning Projects,
  creating WP sections, and creating WorkPackages under a section.
- Preserve legacy title-like work packages while preventing new ones.

The plugin injects browser UI into the OpenProject Project and Work Package
screens through plugin assets. OpenProject core data remains native Project/WP
records; display-only title/section rows live in `abyz_taxonomy_*` tables.

## Endpoints

```text
GET  /api/v3/abyz_taxonomy
GET  /api/v3/abyz_taxonomy/tree
POST /api/v3/abyz_taxonomy/titles
POST /api/v3/abyz_taxonomy/wp_sections
POST /api/v3/abyz_taxonomy/projects
POST /api/v3/abyz_taxonomy/project_assignments
POST /api/v3/abyz_taxonomy/work_packages
POST /api/v3/abyz_taxonomy/work_package_assignments
GET  /api/v3/projects/:id/abyz_taxonomy
POST /api/v3/abyz_taxonomy/validate

GET  /abyz_taxonomy/ui/tree
POST /abyz_taxonomy/ui/project_titles
POST /abyz_taxonomy/ui/projects
POST /abyz_taxonomy/ui/wp_sections
POST /abyz_taxonomy/ui/work_packages
```

All endpoints require an authenticated admin user.

## UI Flow

Project list:

1. Open `/projects`.
2. Open the top-right `+ 추가` menu.
3. Use `포트폴리오 추가`, `프로그램 추가`, or `타이틀 추가` to create a display-only `project_title`.
4. Use `타이틀 아래 프로젝트 추가` from the same menu, or `프로젝트 추가` on the title row, to create a real OpenProject Project under it.
5. The title row has no Project link/status/date/progress of its own.

Work package table:

1. Open `/projects/:identifier/work_packages`.
2. Open the top-right `만들기` menu.
3. Use `섹션 추가` to create a display-only `wp_section`.
4. Use `섹션 아래 WP` from the same menu, or `WP 추가` on the section row, to create a real WorkPackage under the section.
5. The section row has no WorkPackage id/status/assignee/dates of its own.

Native creation guard:

- New WorkPackages with subjects starting with `[ ... ]` are rejected.
- New Projects with names starting with `[ ... ]` are rejected.
- Use the taxonomy UI/API to create display-only title/section rows instead.

## Usage Model

The title and section concepts do not replace OpenProject Projects or
WorkPackages. A project title is stored as an `abyz_taxonomy_nodes` row with
`node_kind=project_title`; a WP section is stored with `node_kind=wp_section`.
Projects and WorkPackages stay as native OpenProject records and are linked via
`abyz_taxonomy_assignments`.

Supported flow:

1. Create a project title.
2. Create or assign a Project under that title.
3. Create a WP section inside a Project.
4. Create or assign WorkPackages under that section.
5. Read `/api/v3/abyz_taxonomy/tree` to see the grouped title/project/section/WP view.

Example:

```bash
curl -u "apikey:${OP_API_KEY}" -H "Content-Type: application/json" \
  -X POST http://localhost:8087/api/v3/abyz_taxonomy/titles \
  -d '{"code":"ra.maintenance","name":"인허가 유지관리"}'

curl -u "apikey:${OP_API_KEY}" -H "Content-Type: application/json" \
  -X POST http://localhost:8087/api/v3/abyz_taxonomy/projects \
  -d '{"titleCode":"ra.maintenance","identifier":"ra-maintenance","name":"RA 유지관리"}'

curl -u "apikey:${OP_API_KEY}" -H "Content-Type: application/json" \
  -X POST http://localhost:8087/api/v3/abyz_taxonomy/wp_sections \
  -d '{"projectIdentifier":"ra-maintenance","code":"wp.ra-maintenance.renewal","name":"정기 갱신"}'

curl -u "apikey:${OP_API_KEY}" -H "Content-Type: application/json" \
  -X POST http://localhost:8087/api/v3/abyz_taxonomy/work_packages \
  -d '{"sectionCode":"wp.ra-maintenance.renewal","projectIdentifier":"ra-maintenance","subject":"정기 갱신 검토"}'
```

## Build

Build from the repository root:

```bash
docker build -f custom-openproject/Dockerfile -t openproject-abyz-taxonomy:17 .
```

Staging boot from the repository root:

```bash
docker compose --env-file .env -f custom-openproject/docker-compose.taxonomy.yml up -d
```

## E2E

```bash
NODE_PATH=/tmp/op-taxonomy-playwright-runner/node_modules \
OP_BASE_URL=http://localhost:8087 \
OP_E2E_USER=taxonomy.e2e \
OP_E2E_PASSWORD=... \
node scripts/e2e/op_taxonomy_ui_e2e.js
```

The test creates a project title, Project, WP section, and WorkPackage through
the browser UI and writes screenshots plus `trace.zip` under
`test-results/op-taxonomy/<timestamp>/`.
