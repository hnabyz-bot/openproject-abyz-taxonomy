# openproject-abyz-taxonomy

OpenProject plugin for Abyz taxonomy/title support.

Purpose:

- Store display-only title/category nodes separately from WorkPackage and Project.
- Assign taxonomy nodes to Projects and WorkPackages.
- Provide API endpoints for creating title nodes, assigning Projects/WorkPackages,
  and creating WorkPackages under a title.
- Preserve legacy title-like work packages while preventing new ones.

This plugin is API-first. It is not wired into the OpenProject Angular frontend yet.

## Endpoints

```text
GET  /api/v3/abyz_taxonomy
GET  /api/v3/abyz_taxonomy/tree
POST /api/v3/abyz_taxonomy/titles
POST /api/v3/abyz_taxonomy/projects
POST /api/v3/abyz_taxonomy/project_assignments
POST /api/v3/abyz_taxonomy/work_packages
POST /api/v3/abyz_taxonomy/work_package_assignments
GET  /api/v3/projects/:id/abyz_taxonomy
POST /api/v3/abyz_taxonomy/validate
```

All endpoints require an authenticated admin user.

## Usage Model

The title concept does not replace OpenProject Projects. A title is stored as an
`abyz_taxonomy_nodes` row with `node_kind=title`. Projects and WorkPackages stay
as native OpenProject records and are linked to a title through
`abyz_taxonomy_assignments`.

Supported flow:

1. Create a title.
2. Create or assign a Project under that title.
3. Create or assign WorkPackages under the same title.
4. Read `/api/v3/abyz_taxonomy/tree` to see the grouped title/project/WP view.

Example:

```bash
curl -u "apikey:${OP_API_KEY}" -H "Content-Type: application/json" \
  -X POST http://localhost:8087/api/v3/abyz_taxonomy/titles \
  -d '{"code":"ra.maintenance","name":"인허가 유지관리"}'

curl -u "apikey:${OP_API_KEY}" -H "Content-Type: application/json" \
  -X POST http://localhost:8087/api/v3/abyz_taxonomy/projects \
  -d '{"titleCode":"ra.maintenance","identifier":"ra-maintenance","name":"RA 유지관리"}'

curl -u "apikey:${OP_API_KEY}" -H "Content-Type: application/json" \
  -X POST http://localhost:8087/api/v3/abyz_taxonomy/work_packages \
  -d '{"titleCode":"ra.maintenance","projectIdentifier":"ra-maintenance","subject":"정기 갱신 검토"}'
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
