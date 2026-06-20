# openproject-abyz-taxonomy

OpenProject plugin skeleton for Abyz taxonomy/title support.

Purpose:

- Store display-only title/category nodes separately from WorkPackage and Project.
- Assign taxonomy nodes to Projects and WorkPackages.
- Provide validation endpoints for UI, n8n, and Hermes before creating work.
- Preserve legacy title-like work packages while preventing new ones.

This is an initial skeleton. It is not wired into the OpenProject frontend yet.

## Target Endpoints

```text
GET  /api/v3/abyz_taxonomy
GET  /api/v3/projects/:id/abyz_taxonomy
POST /api/v3/abyz_taxonomy/validate
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
