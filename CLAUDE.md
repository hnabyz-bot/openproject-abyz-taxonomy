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

> **[HARD] UI 정렬/레이아웃 검증은 픽셀 좌표로**: CSS 속성값(`text-align`, `justify-content`)만 보고 "적용됐다"고 보고하지 말 것. flex/grid 레이아웃이 요소를 의도치 않은 위치에 배치할 수 있다. 반드시 `getBoundingClientRect()`로 **실제 렌더링된 픽셀 좌표(bbox)** 를 측정하고, 스크린샷 비전으로 시각 확인할 것. (교훈: `text-align: left`인데 flex `space-between`이 label을 중앙에 놓아 사용자에게 중앙 정렬로 보인 사례 — labelLeft 좌표 측정 전까지 못 잡음)

> **[HARD] CSS 변경 시 전체 레이아웃 회귀 검증**: font-weight, text-align, 들여쓰기(padding-left/margin-left/hierarchy indent), justify — 변경 대상 속성뿐 아니라 **인접 레이아웃 속성까지 Playwright computed style로 전부 측정**할 것. 한 속성만 확인하고 완료 보고하면 들여쓰기 등 사이드이펙트를 놓친다.

> **[HARD] 드래그 핸들러 충돌 — 하나의 요소에 두 drop 의도를 붙이지 말 것**: 같은 요소(예: 타이틀 행)에 reorder(순서 변경) drop 핸들러와 reparent(부모 변경, move_title) drop 핸들러를 동시에 붙이면, 단일 drop 이벤트에서 한 API가 선점 실행되어 다른 쪽이 동작하지 않는다(교훈: 0.2.45 move_title이 reorder_node에 선점당해 네이티브 DnD 이벤트가 발생해도 parent_id 미변경). "재정렬" vs "부모 변경"은 드롭 영역 분리 또는 modifier key 등 **사용자 제스처로 명시 구분**하는 UX 설계가 선행되어야 한다.

> **[HARD] WP permalink 형식 차이 (숫자 id vs slug) — dev와 운영이 다름**: dev OP는 WP permalink가 숫자 id(`/work_packages/330`)이고, 운영 OP는 slug(`/projects/.../work_packages/PROJ6-1/activity`)이다. JS에서 `a[href]` 정규식 `/\/work_packages\/(\d+)/`로 WP id를 추출하는 코드는 dev에서만 동작하고 운영에서는 매칭 실패한다. WP id가 필요한 모든 JS 경로(`getWpIdFromRow`, `workPackageRowMap`, `workPackageRenderSignature`, `postRowSigs`)는 **`tr[data-work-package-id]` 속성에서 id를 우선 읽어야 한다**. 교훈(0.2.47 #13 move_wp, 0.2.48 #14 렌더링): dev=운영 동일 코드인데 **운영만 안 되면 WP permalink 형식(slug)을 1순위로 의심**하라.

> **[HARD] OP 네이티브 WP 행에 플러그인 UI/이벤트 주입 불가 (#15 실패)**: OP 네이티브 WP 행(`tr[data-work-package-id]`)은 Angular CDK가 pointer drag tracking을 등록하고 Zone.js가 모든 DOM 이벤트(click, dragover, drop, mousedown)를 추적한다. 플러그인이 WP 행에 버튼/handle/overlay를 주입하거나 이벤트 핸들러를 붙여도, Zone.js change detection이 트리거되어 WP 테이블을 재렌더 → 주입 요소가 소실/중복된다. 17번 시도(0.2.49~0.2.65) 전부 실패. **섹션 행(플러그인이 createElement로 생성)만 CDK/Zone.js 간섭 없이 동작**. WP parent 변경은 OP 네이티브 기능(WP 상세 페이지 parent 설정) 또는 별도 독립 Rails 페이지(OP SPA 라우팅 밖)로만 가능하다.

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
