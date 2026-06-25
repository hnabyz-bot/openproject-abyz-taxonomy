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

> **[HARD] 진짜 마우스 e2e 필수**: DnD/클릭 등 UI 동작의 최종 검증은 합성 `dispatchEvent`가 아닌 `page.mouse` 수동 제어(mousedown→mousemove steps→mouseup) 진짜 마우스 이벤트로 수행한다. 드래그 중 인디케이터·드롭 후 결과를 스크린샷으로 시각 확인하고 DB(API) 변경으로 영속성을 이중 검증한다. (교훈: 합성 이벤트 PASS를 진짜 동작으로 오인한 사례 — `scripts/e2e/op_taxonomy_drag_reorder_real_e2e.js` 참고)

> **[HARD] 사이드바 popover vs /projects 주 경로**: 사이드바 "모든 프로젝트" 드롭다운(헤더 project-select popover)은 Angular 컴포넌트라 커스텀 drop이 타이틀 행에만 잡힌다. 프로젝트 이동(타이틀 간)의 주 경로는 `/projects` 전체 목록(OP 네이티브 테이블)이며, 이동 즉시 사이드바에 동기화된다. 사이드바에서 영역을 넓히려(list/프로젝트 li drop) 시도하면 Angular가 이벤트를 소비해 회귀/drop 미발생이 생기니 list 수준 핸들러는 금지.

> **[HARD] asset version 캐시 함정**: 코드를 빌드해도 `ABYZ_TAXONOMY_ASSET_VERSION` env를 올리지 않으면 브라우저가 예전 `?v=` JS를 캐시해 새 코드가 안 먹는다. Playwright headless는 캐시가 없어 이 함정을 잡지 못한다. 빌드 시 `ABYZ_TAXONOMY_ASSET_VERSION`을 반드시 같이 올리고, headless 검증과 실제 브라우저의 갭을 염두에 둘 것.

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
