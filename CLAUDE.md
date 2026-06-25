# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⛔ CRITICAL: Deployment Safety Rule

**절대 금지 — 리얼 운영 OpenProject에 플러그인을 배포하지 말 것.**

- 모든 개발·검증·테스트는 **개발용 OP Docker 인스턴스**에서만 수행한다.
- 운영 OP(`openproject-stack-openproject-1`)는 절대 재시작하거나 수정하지 않는다.
- `build.sh` 실행 전 반드시 대상 docker-compose 파일 확인.

```
개발용 OP  →  ~/workspace/openproject-taxonomy-stack/ (런타임 스택 레포)  ✅ 허용
운영 OP    →  openproject-stack 컨테이너                                  ⛔ 절대 금지
```

---

## Project Overview

**openproject-abyz-taxonomy** is an OpenProject plugin that adds display-only title/section nodes to Project lists and Work Package tables.

- gem: `openproject-op-plugin` | version tracks `OP_VERSION-ABYZ_VERSION` (e.g. `17.5.0-0.2.34`)
- Architecture: Rails Engine + Docker custom image build + versioned OP source patches
- Target: OpenProject 17.5.x+

### Core Concept

Taxonomy nodes (`abyz_taxonomy_nodes`) are display-only rows — not real Projects or WorkPackages.
They appear inside native OP screens via injected plugin assets + versioned source patches.

```
Plugin core (stable)         → DB models, API endpoints, Ruby business logic
Versioned OP UI adapter      → patches/openproject/<op-version>/, DOM selectors, E2E assertions
```

---

## Repository Structure

```
openproject-abyz-taxonomy/
  app/                          ← Rails controllers, models, serializers
  assets/                       ← Plugin JS/CSS injected into OP frontend
  config/                       ← Routes, locales
  db/migrate/                   ← Schema migrations
  lib/                          ← Engine registration, API endpoints
  openproject-abyz-taxonomy.gemspec
  custom-openproject/           ← Docker build system (build-only)
    Dockerfile                  ← OP_VERSION-pinned custom image
    build.sh                    ← Image builder (OP_VERSION + ABYZ_VERSION)
    Gemfile.plugins             ← Registers plugin in OP
    DEPLOY_RUNBOOK.md           ← Build/deploy runbook
    # 런타임(compose, nginx)은 별도 레포: ~/workspace/openproject-taxonomy-stack/
  patches/
    openproject/<op-version>/   ← Versioned OP source patches
      manifest.yml
      *.patch
  scripts/
    e2e/
      op_taxonomy_ui_e2e.js     ← Playwright E2E test suite
```

---

## Build & Run (Development)

```bash
# Build dev image
OP_VERSION=17.5.0 ABYZ_VERSION=0.2.34 ./custom-openproject/build.sh

# Start dev instance (runtime stack lives in a separate repo)
cd ~/workspace/openproject-taxonomy-stack
OP_IMAGE=openproject-abyz-taxonomy:OP_VERSION-ABYZ_VERSION \
docker compose -p openproject-taxonomy up -d

# 접속: http://localhost:8087 (로컬) | http://100.110.194.101:8087 (Tailscale)
```

---

## Version Compatibility Strategy

This plugin maintains OP version compatibility via **release branches**:

```
main          ← latest development
release/17.x  ← OP 17.x stable (production deployable)
release/18.x  ← created when OP 18 support is needed
```

### Layer separation

| Layer | Stability | Location |
|-------|-----------|----------|
| DB models, API, Ruby logic | High — use `patches()`, `add_api_endpoint` | `app/`, `lib/` |
| Plugin assets (JS injection) | Medium — DOM selectors may change | `assets/` |
| OP source patches | Low — tied to OP version | `patches/openproject/<version>/` |

When OP upgrades:
1. Create `patches/openproject/<new-version>/manifest.yml` + new `.patch` files
2. Update `custom-openproject/Dockerfile` FROM version
3. Run E2E suite to validate
4. Tag and create `release/<new-version>` branch

---

## E2E Testing

```bash
NODE_PATH=/tmp/op-taxonomy-playwright-runner/node_modules \
OP_BASE_URL=http://localhost:8087 \
OP_E2E_USER=taxonomy.e2e \
OP_E2E_PASSWORD=... \
OP_E2E_API_TOKEN=... \
node scripts/e2e/op_taxonomy_ui_e2e.js
```

---

## MoAI Workflow

```bash
/moai plan "feature description"   # Creates SPEC → .moai/specs/
/moai run SPEC-XXX                  # TDD implementation
/moai review                        # Code review
```

---

## Language Settings

- Conversation: **Korean (한국어)**
- Code comments: English
- Git commits: Korean
