# Changelog

## [0.2.59] — 2026-06-30

### Reverted — WP parent 드래그/클릭 기능(#15) 전체 원복

- **원복 대상**: 0.2.49~0.2.58(#15 관련 전체 코드) 제거. 코드를 0.2.48(8ebe350) 상태로 복원.
- **이유**: OP CDK + Zone.js가 WP 행(네이티브)의 모든 DOM 이벤트를 추적하여, 플러그인이 주입한 parent 버튼/드롭다운이 중복 누적되고 기존 섹션 드래그 기능까지 회귀. 화살표 계속 늘어남, API 미도달 등 악화.
- **분석 결론**: WP 행(네이티브)에서의 클릭/드래그/드롭은 OP CDK + Zone.js 근본 간섭으로 불가능. 섹션 행(플러그인 생성)에서만 동작. WP parent 변경은 다른 접근(별도 페이지, OP API 등) 필요.

## [0.2.56] — 2026-06-29

### Fixed — 드롭다운 항목 선택 시 API 요청 미발생 (#15)

- **원인**: `<div>` 항목의 click 이벤트를 OP Angular/CDK가 소비. 서버 로그 move_wp_parent 0건 확인.
- **수정**: 항목을 `<button type="button">` 요소로 변경(OP가 button click은 소비하지 않음) + `confirm()` 다이얼로그로 사용자 확인 후 API 호출(confirm은 브라우저 네이티브 → OP 관여 불가). 드롭다운 닫기 후 confirm → API 호출 순서로 변경하여 이벤트 간섭 원천 차단.

## [0.2.55] — 2026-06-29

### Fixed — 하위 WP(자식)에서 parent 버튼 클릭 → 드롭다운 안 됨 (CDK mousedown 소비) (#15)

- **원인**: OP CDK가 자식 WP 행(`__hierarchy-group-*`)의 `mousedown` 이벤트를 소비 → `click` 이벤트가 parentBtn에 전달되지 않음. 상위 WP(루트, `__hierarchy-root-*`)는 CDK가 다르게 처리하여 통과. Playwright(headless)는 CDK 활성화가 달라서 모두 동작 → 실제 브라우저와 갭.
- **수정**: parentBtn에 `mousedown stopPropagation` 추가. 기존 드래그 handle(line 807)과 **동일한 CDK 우회 패턴** — CDK가 mousedown을 가로채기 전에 전파 차단 → click 정상 발생.

## [0.2.54] — 2026-06-29

### Fixed — parent 드롭다운이 실제 브라우저에서 안 보임 (#15)

- **원인**: `position: absolute` + `z-index: 10000`이 OP Angular의 stacking context에 갇혀 가려짐. OP 헤더/사이드바가 더 높은 z-index 사용.
- **수정**: `position: fixed !important` + `z-index: 2147483647`(int 최대값)로 viewport 기준 최상위 표시. `display/visibility/opacity` 강제 적용.
- 외부 클릭 닫기 로직 개선: 드롭다운 내부 클릭 `stopPropagation`으로 닫힘 방지, setTimeout 200ms로 클릭 버블링 완전 분리.

## [0.2.53] — 2026-06-29

### Changed — WP parent 드래그 → 클릭 기반 parent 설정 버튼으로 전환 (#15)

- **드래그 방식 폐기** — OP CDK가 WP 행(네이티브)의 HTML5 DnD drop 이벤트를 근본적으로 소비하여, 실제 브라우저에서 drop이 발생하지 않음(0.2.49~0.2.52 5번 시도 모두 실패). 기존 패턴 교차검증 결과: 섹션 드래그(플러그인 생성 행)만 동작, WP 행(네이티브)은 CDK 충돌로 불가.
- **클릭 기반 parent 설정 버튼 구현** — WP 행 handle 옆에 ↓ 아이콘 버튼(.abyz-parent-btn) 추가. 클릭 시 같은 프로젝트 WP 목록 드롭다운 표시 → parent 선택 → move_wp_parent API 호출. "부모 없음" 옵션으로 해제 가능. 기존 taxonomyRowMenuButton(섹션 행 메뉴)과 동일한 클릭 패턴, CDK 완전 무관.
- 드래그 관련 코드(overlay, parent drop zone, capture phase) 제거, 클릭 기반 showParentSelector 함수 추가.

## [0.2.52] — 2026-06-29

### Fixed — WP parent 드래그: overlay div 패턴으로 CDK drop 소비 근본 우회 (#15)

- 기존 시도(capture phase 등)로 CDK 간섭을 부분 해결했으나 실제 브라우저에서 여전히 drop 미발생.
- **해결**: dragenter 시 WP 행 위에 플러그인 관리 overlay `<div>(.abyz-parent-overlay)`를 주입. CDK는 overlay를 모르므로 HTML5 drop 이벤트가 확실히 발생. 기존 `mousedown stopPropagation`(line 794)과 동일한 "CDK보다 먼저 잡기" 원리를 drop 쪽에 적용. dragend 시 overlay 제거.
- 기존 패턴 교차검증: 섹션 drop(동작함)은 플러그인 생성 행이라 CDK 무관. WP 행은 OP 네이티브라 CDK가 drop 소비 → overlay로 우회.

## [0.2.51] — 2026-06-29

### Fixed — WP parent 드래그 drop이 실제 브라우저에서 안 됨 (CDK 간섭) (#15)

- **원인**: OP CDK가 WP 행(네이티브 행)의 drop 이벤트를 bubble phase에서 소비 → 플러그인 drop 핸들러 안 불림. Playwright(headless)는 CDK 간섭 없이 동작해서 200이었으나, 실제 브라우저에서는 녹색 표시(dragover)만 되고 drop이 안 됨.
- **수정**: `addWpParentDropHandlers`의 dragover/dragleave/drop을 **capture phase**(`addEventListener(..., true)`)로 등록 → CDK보다 먼저 drop 이벤트를 선점 처리.
- 섹션 행(플러그인 생성 행)은 CDK 간섭 없어 bubble로 충분하지만, WP 행(OP 네이티브)은 capture 필수.

## [0.2.50] — 2026-06-29

### Changed — WP parent 드래그 UX 개선: Alt 제거 + handle 항상 표시 (#15)

- **Alt modifier 제거** — 기본 드래그 하나로 drop target 자동 구분. WP 행에 drop = 부모(parent) 변경, 섹션 행에 drop = 섹션 이동(move_wp). 사용자 정정: "Alt를 누르고 이동하라고?" → modifier 없이 직관적 드래그로 수정.
- **drag handle 항상 표시** — `opacity: 0`(hover 시만 표시) → `opacity: 0.5`(항상 보임, hover 시 1). 사용자 정정: "드래그로 이동 모습도 안 보임" → handle 가시성 문제 수정.
- drop 이벤트 `stopPropagation`으로 WP drop/섹션 drop 충돌 방지.

## [0.2.49] — 2026-06-29

### Added — WP 부모/자식(parent) 드래그 설정/변경 + 들여쓰기 (#15)

- **WP를 다른 WP에 Alt+드래그 → 부모(parent_id) 설정/변경**. 기본 드래그는 기존 섹션 이동(move_wp). Alt modifier로 두 의도를 UX 분리(#11 드롭 핸들러 충돌 교훈 반영).
- 백엔드: `PATCH /abyz_taxonomy/ui/assignments/move_wp_parent` (wpId, toParentId). `set_work_package_parent!` 가 OP `WorkPackages::UpdateService` 경유로 parent 변경(권한/콜백/계약 안전). self/순환/타 프로젝트 부모 거부, toParentId 빈 값이면 부모 해제(최상위).
- JS: `addWpParentDropHandlers`(WP 행 drop → move_wp_parent), dragstart에서 `e.altKey` 시 `state.drag.parentMode=true`로 WP 행을 drop target 활성화.
- CSS: parent drop zone 시각 표시(녹색 outline) + 자식 WP 들여쓰기(`__hierarchy-group-*` 행 padding-left 1.5rem). OP가 WP parent를 `__hierarchy-root-{id}`/`__hierarchy-group-{parentId}` class로 렌더링하는 것을 활용.
- 검증 예정: dev Playwright 진짜 마우스 Alt 드래그 → WP parent_id 영속 + 들여쓰기 표시 확인.

## [0.2.48] — 2026-06-28

### Fixed — 운영 slug permalink에서 WP 행이 섹션 아래 배치 안 됨 (#14, #13 후속)

- `workPackageRowMap` / `workPackageRenderSignature` / `postRowSigs`(abyz_taxonomy_ui.js)가 `getWpIdFromRow`(data-work-package-id 우선)를 재사용하도록 통일. 기존 a[href] 정규식 `/\/work_packages\/(\d+)/`이 운영 slug URL(`/work_packages/PROJ6-1/`)에서 매칭 실패해 rowsById가 빈 → renderWpSectionRows가 섹션 아래 WP 행을 배치하지 못함(섹션만 상단, WP 안 보임).
- #13에서 getWpIdFromRow만 fix했고, 이 3곳이 같은 slug 버그로 남아있었음.
- 검증 예정: dev Playwright slug 모킹 + 운영 실화면(WP가 섹션 아래 표시) + move_wp.

## [0.2.47] — 2026-06-28

### Fixed — unassigned WP→섹션 move_wp 운영 미동작 (slug permalink) (#13)

- `getWpIdFromRow`(abyz_taxonomy_ui.js)가 `data-work-package-id` 속성에서 WP id를 우선 읽도록 수정. 기존 `a[href]` 정규식 `/\/work_packages\/(\d+)/`은 운영처럼 WP permalink가 slug(`/projects/PROJ6/work_packages/PROJ6-1/activity`)인 경우 매칭 실패 → wpId null → dragstart `e.preventDefault()` → 드래그 취소 → move_wp 미동작. dev는 permalink가 숫자 id(`/work_packages/330`)라 정상 동작했고, 운영만 slug라 발생.
- `data-work-package-id` 우선 + 기존 `a[href]` 정규식 fallback 유지 → dev/운영 모두 커버.
- 검증 예정: dev Playwright 진짜 마우스 move_wp(기본 숫자 id URL + slug URL 모킹) + DB 영속.

## [0.2.46] — 2026-06-28

### Fixed — WP 섹션 행 label 좌측 정렬 (#6 섹션 확장, #12)

- `.abyz-taxonomy-wp-section-row .abyz-taxonomy-row-label { margin-right: auto }` 추가. #6에서 타이틀 행에만 적용했던 좌측 고정을 섹션 행으로 확장. `.abyz-taxonomy-row-inner` flex `space-between`이 3자식(drag-handle/label/actions) 중 label을 시각적 중앙에 배치하던 문제 해결. 개발/운영 공통 코드 버그라 환경 무관.
- 검증 예정: 진짜 마우스 Playwright(`getBoundingClientRect()` 실측)로 section label 좌표가 drag-handle 인접 좌측으로 이동했는지 + 인접 레이아웃(들여쓰기/액션 위치) 회귀 없는지 확인.

## [0.2.45] — 2026-06-26

### Added — 하이어라키 들여쓰기 (#9)

- **타이틀 3종 계층 들여쓰기**: `buildProjectTitleRow`가 `data-abyz-taxonomy-type`(portfolio/program/title) 속성을 주입하고, CSS가 `.abyz-taxonomy-row-inner { padding-left }`를 0 / 2rem / 4rem으로 적용. portfolio → program → title 시각적 계층 표현.
- **프로젝트 행 부모 타입별 들여쓰기**: `renderProjectTitleRows`가 각 프로젝트 행에 `data-abyz-parent-type`을 설정하고 `td.hierarchy`(display-link가 위치한 열)의 `padding-left`를 부모 타입별 2rem(portfolio)/4rem(program)/6rem(title)로 적용. 프로젝트명은 항상 소속 타이틀보다 한 단계 아래.
- **타이틀 계층 이동(move_title) 코드 추가(미구현)**: `PATCH /abyz_taxonomy/ui/assignments/move_title` 라우트 + `UiController#move_title` + `TaxonomyService.move_title_to_parent!`(parent_id 변경) + JS `addTitleHierarchyDropHandlers`. **단, 타이틀 행에 reorder 드롭 핸들러와 동시에 붙어 드롭 시 reorder_node가 API를 선점 → 실동작 안 함(후속 과제)**.

### 검증

- 진짜 마우스 Playwright(시스템 chromium, `getBoundingClientRect()` 실측) — 타이틀 nameX 346/378/410(32px=2rem 단계), 프로젝트 dispX 398(portfolio 하위)/462(title 하위). 스크린샷 비전 "프로젝트가 부모보다 한 단계 깊이" 확증. 사용자 최종 확인 완료.
- move_title: 네이티브 DnD(dragstart/dragover/drop 발생)에도 `reorder_node`만 호출되어 parent_id 미변경 → 미구현으로 확정, 후속 이슈로 분리.

### 운영 배포 (2026-06-27)

- `plm.abyz-lab.work` 운영 OP: 0.2.43 → **0.2.45** 적용 완료.
- 절차: RUNBOOK Phase 6 최소 다운타임 — `.env` `OP_IMAGE` 만 `sed -i` 교체(INC-20260625 echo 금지 준수, sed 후 SECRET_KEY_BASE 보존·diff 1행 확인) → `docker compose up -d`(openproject 서비스만 재생성, op_assets/DB 유지).
- 검증: 컨테이너 0.2.45 구동, plm HTTP 302 안정화, ENV `ABYZ_TAXONOMY_ASSET_VERSION=0.2.45`, 정적 JS 60,518바이트(hierarchyIndent 포함) = dev 검증본과 동일.
- 다운타임 ~1분 44초(사용자 승인 전제). 사전 백업(.env 사본 + 0.2.43 이미지 태그 보존). 롤백 미사용(정상 동작).

### [교훈] 드래그 핸들러 충돌 설계

- 하나의 요소(타이틀 행)에 reorder 드롭 핸들러와 reparent 드롭 핸들러를 동시에 붙이면, 드롭 이벤트에서 한쪽 API가 먼저 실행되어 다른 쪽이 의도대로 동작하지 않는다. "재정렬"과 "부모 변경"은 사용자 제스처(예: 드롭 영역 분리, modifier key)로 명시적으로 구분하는 UX 설계가 선행되어야 한다.

### 참고

- 0.2.43 / 0.2.44는 플러그인 코드 변경 없이 배포/OP 설정(`Setting.per_page` 페이지네이션 비활성화 등)만 포함된 이미지 버전.

---

## [0.2.42] — 2026-06-26

### Fixed

- **타이틀 행 label 좌측 사이드 정렬** (#6): row-inner flex `space-between`의 3자식(drag-handle/label/actions) 중 label이 시각적으로 행 중앙에 배치되어, `text-align: left`임에도 중앙으로 보이는 문제. `.abyz-taxonomy-project-title-row .abyz-taxonomy-row-label { margin-right: auto }`로 label을 drag-handle 옆(좌측 끝)으로 고정.
- 검증: `labelLeft` 665(중앙) → 346(행 좌측), 스크린샷 비전 "좌측 끝 정렬" 확증.

### Changed

- **테스트 데이터 정리** (#6): 개발용 OP에서 fixture 38개 타이틀 → 3개(sample.portfolio/program/title)만 남기고 삭제(프로젝트 40/WP 48/섹션 108/assignment 123 제거).

### [교훈] UI 정렬 검증 기준 강화

- CSS 속성값(`text-align`)이 아니라 **실제 렌더링된 픽셀 좌표(bbox)** 로 검증해야 flex/grid 레이아웃 문제를 잡을 수 있다. 속성값만 보고 "완료" 보고하면 flex가 요소를 중앙에 놓는 갭을 놓친다. `labelLeft` 좌표 측정 도입.

---

## [0.2.37] — 2026-06-25

### Fixed

- **사이드바 "모든 프로젝트" 드롭다운에서 프로젝트 이동(타이틀 간) 지원** (#4): 사용자 실사용 피드백으로 발견된 회귀. `renderProjectSelectTaxonomyRows`가 사이드바 프로젝트 `<li>`에 드래그 핸들을 주입하지 않아 dragstart가 일어나지 않고 move_project가 호출되지 않았다.
  - 신규 함수 `injectProjectSelectDragHandle` + `addProjectSelectTitleDropHandlers` (사이드바 `<li>` 구조 맞춤, 목록용 tr 기반 함수와 별개)
  - 기존 `PATCH /abyz_taxonomy/ui/assignments/move_project` 재사용 — 신규 API 불필요
  - 전수 재검증(진짜 마우스 DnD + DB 변경 + 스크린샷 비전)으로 6종 케이스(A1/A2/E1/E2/B/D) 전부 PASS 확증
  - **사이드바 드롭다운 제한**: 헤더 project-select popover(Angular) 구조상 커스텀 타이틀 행에만 drop이 잡히고, 프로젝트 li/빈 공간은 Angular가 이벤트를 소비해 drop 미발생. **프로젝트 이동의 주 경로는 `/projects` 전체 목록**(OP 네이티브 테이블)이며, 이동 즉시 사이드바에 동기화된다. (`scripts/e2e/op_taxonomy_project_move_sidebar_sync_e2e.js`로 확증)
  - **빌드/배포 교훈**: 코드를 빌드해도 `ABYZ_TAXONOMY_ASSET_VERSION`을 올리지 않으면 브라우저가 예전 JS를 캐시해 새 코드가 안 먹는다(합성 이벤트 headless 검증은 통과하지만 실제 브라우저는 구버전). 빌드 시 asset version을 반드시 함께 올릴 것.

### Added

- `scripts/e2e/op_taxonomy_drag_full_matrix_e2e.js` — 드래그 이동 전수 매트릭스 검증(모든 화면 × 모든 이동 케이스). 초기 검증이 사이드바 프로젝트 이동을 누락한 빈틈을 보완.

---

## [0.2.35] — 2026-06-25

### Added

- **드래그 앤 드롭 노드 reorder(순서 변경) 기능**: 타이틀(포트폴리오/프로그램/타이틀) 및 WP 섹션의 순서를 드래그로 수동 정렬한다. (#3)
  - 백엔드: `PATCH /abyz_taxonomy/ui/assignments/reorder_node` (code, beforeCode) 신규 — `TaxonomyService.reorder_node!`가 형제 노드의 position을 트랜잭션으로 갱신
  - 프론트엔드: `injectNodeReorderHandle` + `addNodeReorderDropHandlers` — 프로젝트 목록 테이블, 프로젝트 셀렉터/사이드바 "모든 프로젝트" 드롭다운, WP 테이블 섹션에 적용
  - 드롭 위치(clientY) 기반 before/after 삽입 인디케이터 (`.abyz-drop-insert-before/after`)

### Changed

- **E2E 검증 방식 강화**: dispatchEvent 합성 DragEvent를 1차 스크리닝용으로만 사용하고, 최종 검증은 `page.mouse` 수동 제어(mousedown→mousemove steps→mouseup) 진짜 마우스 DnD + 스크린샷 비전 분석으로 수행한다. 진단 결과 `dragStart=1, dragOver=11, drop=1`로 실제 HTML5 DnD 이벤트 발생을 확인했고, DB position/parent 변경으로 영속성을 이중 검증했다.
- `scripts/e2e/op_taxonomy_drag_reorder_real_e2e.js`, `scripts/e2e/diagnose_dnd_events.js` 신규 추가 — 드래그 reorder 5종(TC-A~E) 진짜 마우스 검증 및 이벤트 진단.

---

## [0.2.34] — 2026-06-25

### Fixed

- **TC-055 근본 수정 — Angular mid-render race condition**: 새 WP 섹션이 알파벳 마지막 위치에 추가될 때 기존 마지막 섹션의 WP들이 신규 섹션 아래로 이동하는 버그를 근본적으로 수정했다.
  - 원인: Angular CD의 WP 행 재렌더 mid-render 구간에서 `renderWpSectionRows()`가 실행될 때 `<a href="/work_packages/N">` 링크가 아직 없는 행을 `workPackageRowMap()`이 인식하지 못해 미할당 풀로 오인, 마지막 섹션 이후에 배치됨
  - 수정: `realRows.forEach`에서 WP 링크(`a[href*="/work_packages/"]`)가 없는 행을 건너뜀. Angular 렌더 완료 후 다음 refresh 사이클(250ms debounce)에서 올바르게 처리됨
  - 0.2.29 수정(postRowSigs)은 Angular CD 재렌더 복원 문제를 해결했으나, mid-render 링크 누락 경쟁 조건은 별개 경로로 남아있었음

---

## [0.2.33] — 2026-06-25

### Fixed (reverted — wrong diagnosis)

- TC-055 wrong fix: 미할당 WP를 섹션 앞에 배치하는 `sectionBlocks` 접근을 시도했으나 TC-055 시나리오(할당된 WP)와 무관한 잘못된 진단으로 reverted
- 소스는 0.2.32 동등 코드로 복원됨; 0.2.33 이미지는 할당된 WP만 있는 경우 0.2.32와 동일하게 동작

---

## [0.2.32] — 2026-06-24

### Fixed

- `/api/v3/abyz_taxonomy/validate`는 read-only RA workflow contract endpoint이므로 인증은 요구하되 admin 권한은 요구하지 않도록 조정했다.
- 운영 rollout helper가 parent shell의 stale `OP_IMAGE` 값을 Docker Compose에 전달해 잘못된 image로 재기동하는 회귀를 방지했다.

### Added

- production image audit이 validate endpoint가 admin gate 뒤에 묶이는 회귀를 검출하도록 강화했다.

---

## [0.2.31] — 2026-06-24

### Fixed

- `projectIdentifier` lookup을 case-insensitive 공통 helper로 정리해 `validate`, section 생성, mutating taxonomy path가 같은 lookup 계약을 사용한다.
- production 후보 이미지에서 WP section UI debug 로그(`ABYZ-DEBUG`)를 제거했다.

### Added

- `/api/v3/abyz_taxonomy/validate` E2E contract script에 alternate-case `projectIdentifier` 검증을 추가했다.
- `ra-request-to-op_v6` rollout audit이 image tag/label 일치, image 내부 lookup helper, exact lookup 회귀, UI debug log 포함 여부를 검증할 수 있도록 production gate를 강화했다.

---

## [0.2.29] — 2026-06-24

### Fixed

- **TC-055 버그 수정**: 신규 WP 섹션이 알파벳 정렬 마지막 위치에 추가될 때 기존 마지막 섹션의 WP가 신규 섹션 하위로 이동되어 보이는 버그 수정
  - 원인: `renderWpSectionRows`에서 `abyzTaxonomySignature`를 pre-render DOM 상태로 저장하여, Angular CD가 section rows 제거 시 signature가 일치 → SKIP → section rows 영구 복원 불가
  - 수정: orderedRows 기반 post-render 예상 signature를 저장 → section rows 제거 시 mismatch → 재렌더 → 올바른 순서 복원

### Added

- DnD(드래그 앤 드롭) WP 섹션 간 이동 기능 (`data-abyz-drag-handle`, `draggable="true"`)
- 섹션/타이틀 행에 툴팁 ⓘ 아이콘 추가 (`data-tooltip`, `.abyz-info-icon`)
- HTML5 DnD UI 검증 E2E 테스트 (TC-057, TC-058)
- 신규 기능 E2E 테스트 스위트 (TC-053 툴팁, TC-055 WP 섹션 버그픽스, TC-056 프로젝트 이동)

---

## [0.2.24] — 2026-06-24

### Fixed

- taxonomy child 프로젝트 행 계층 들여쓰기 정렬 오류 수정 (`padding-left: 0`) — `cloneNode(true)`가 OP depth-based padding을 상속하는 문제 해결 (프로젝트 목록 child indent 46px → 40px)
- taxonomy child 프로젝트 이름 bold 상속 제거 (`font-weight: normal`) — `cloneNode(true)`로 복제된 링크가 OP 스타일 상속으로 bold 렌더링되는 문제 해결

### Added

- `test-results/` gitignore 추가 (로컬 전용 E2E 결과 파일 git 추적 제외)

---

## [0.2.23] — 2026-06-21 (이전 릴리즈)

### Added

- **RSpec 테스트 스위트** (SPEC-OP-TAXONOMY-TEST-001)
  - `spec/services/abyz_taxonomy/taxonomy_service_helpers_spec.rb` — TaxonomyService 헬퍼 메서드 단위 테스트 (29개 케이스)
  - `spec/services/abyz_taxonomy/taxonomy_service_node_spec.rb` — 노드 생성/수정/삭제 서비스 테스트
  - `spec/services/abyz_taxonomy/taxonomy_service_assignment_spec.rb` — WP 할당 서비스 테스트
  - `spec/services/abyz_taxonomy/taxonomy_service_op_creation_spec.rb` — OP 연동 생성 서비스 테스트
  - `spec/models/abyz_taxonomy/node_spec.rb` — AbyzTaxonomy::Node 모델 유효성 검사 테스트
  - `spec/models/abyz_taxonomy/assignment_spec.rb` — AbyzTaxonomy::Assignment 모델 테스트
  - `spec/contracts/abyz_taxonomy/contract_patches_spec.rb` — 계약 패치 단위 테스트
  - `spec/spec_helper.rb`, `spec/rails_helper.rb` — OP 플러그인 공식 bootstrap 패턴 적용

- **프로젝트 문서** (`.moai/project/`)
  - `product.md`, `structure.md`, `tech.md` — 프로젝트 개요·구조·기술 스택 초기화
  - `.moai/specs/SPEC-OP-TAXONOMY-STACK-001/spec.md` — 런타임 분리 SPEC 완료 상태 기록

### Changed

- **런타임 스택 분리** (SPEC-OP-TAXONOMY-STACK-001)
  - `custom-openproject/docker-compose.taxonomy.yml`, `docker-compose.dev-access.yml`, `nginx/` 제거
  - `custom-openproject/`는 빌드 전용 4파일만 유지: `Dockerfile`, `build.sh`, `Gemfile.plugins`, `DEPLOY_RUNBOOK.md`
  - 런타임 파일은 별도 레포 `hnabyz-bot/openproject-taxonomy-stack`으로 이전

- **`custom-openproject/build.sh`** — 기동 안내 메시지를 `openproject-taxonomy-stack` 레포 경로로 갱신
- **`CLAUDE.md`** — 개발 인스턴스 경로, Repository Structure, Build & Run 섹션 갱신
- **`README.md`** — 빌드/E2E/릴리즈 블로커 현행화, RSpec 테스트 섹션 추가, 런타임 분리 반영

### Fixed

- E2E taxonomy 어댑터 오류 실패 처리 추가 (TC 릴리즈 아티팩트 생성)
- Dockerfile ARG 스코프·패치경로·E2E 오탐 방지 수정
- 릴리즈 블로커 3종 수정
- RSpec `spec/spec_helper.rb` 자기참조 부트스트랩 문제 수정 (`require "open_project/plugins/spec_helper"`)
- RSpec `instance_double` + `and_call_original` 오용 수정 (실제 `ActionController::Parameters` 인스턴스 사용)

---

_변경 이력은 [Conventional Commits](https://www.conventionalcommits.org/) 규칙을 따릅니다._
