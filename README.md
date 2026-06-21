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
PATCH  /api/v3/abyz_taxonomy/nodes/:code
DELETE /api/v3/abyz_taxonomy/nodes/:code

GET  /abyz_taxonomy/ui/tree
POST /abyz_taxonomy/ui/project_titles
POST /abyz_taxonomy/ui/projects
POST /abyz_taxonomy/ui/wp_sections
POST /abyz_taxonomy/ui/work_packages
GET  /abyz_taxonomy/ui/nodes/:code/settings/general
PATCH /abyz_taxonomy/ui/nodes/:code/settings/general
PATCH  /abyz_taxonomy/ui/nodes/:code
DELETE /abyz_taxonomy/ui/nodes/:code
```

All endpoints require an authenticated admin user.

## UI Flow

Project list:

1. Open `/projects`.
2. Open the app-header top-right global `+` menu, or the Project list `+ 추가` menu.
3. Use `포트폴리오 추가`, `프로그램 추가`, or `타이틀 추가` to create a display-only `project_title`.
4. Use `타이틀 아래 프로젝트 추가` from the create menu, or `새 하위 프로젝트` from the title row `...` menu, to create a real OpenProject Project under it.
5. The created Project is moved directly under its display-only title row in the active Project list.
6. The top-left project selector also shows the display-only portfolio/program/title row and the linked Project directly below it, without management buttons.
7. Use the display-only row's `...` menu, matching the native Project row pattern, to open settings, create a child Project, or delete/hide the taxonomy node. Delete sets `active=false`; it does not delete the real Project.
8. The title row has no Project link/status/date/progress of its own.

Work package table:

1. Open `/projects/:identifier/work_packages`.
2. Open the app-header top-right global `+` menu, or the Work package `만들기` menu.
3. Use `섹션 추가` to create a display-only `wp_section`.
4. Use `섹션 아래 WP` from the create menu, or `새 작업 패키지 만들기` from the section row `...` menu, to create a real WorkPackage under the section.
5. The created WorkPackage is moved directly under its display-only section row in both the WP table and Gantt table.
6. Dated WorkPackages render their Gantt bar on the WorkPackage row, with a matching timeline spacer for the section row.
7. Use the display-only section row's `...` menu, matching the native WorkPackage context-menu pattern, to open details, create a WorkPackage, or delete/hide the taxonomy node. Delete sets `active=false`; it does not delete the real WorkPackage.
8. The section row has no WorkPackage id/status/assignee/dates of its own.

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
6. Edit/delete display-only titles and sections from the injected row `...` menus when the grouping needs to change.

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
OP_E2E_API_TOKEN=... \
node scripts/e2e/op_taxonomy_ui_e2e.js
```

The test creates, edits, and soft-deletes display-only taxonomy nodes, creates a
Project, WP section, and dated WorkPackage through the browser UI, verifies the
app-header global quick-add menu, top-left project selector taxonomy rows
without management buttons, Project/WP-like `...` row menus,
portfolio/program/title labels, settings form editing, and node management API,
Project/WP/Gantt adjacency and Gantt timeline row alignment, checks the
validation API, and writes screenshots plus
`trace.zip` under `test-results/op-taxonomy/<timestamp>/`.
