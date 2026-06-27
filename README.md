# openproject-abyz-taxonomy

OpenProject 17.x+ 용 taxonomy/title 플러그인. 프로젝트 목록과 WP 테이블에 표시 전용 타이틀·섹션 행을 주입해 포트폴리오/프로그램/타이틀 계층을 네이티브 OP 화면 안에서 구현한다. 실제 Project·WorkPackage 레코드는 OP 기본 테이블에 유지하고, 표시 전용 노드는 `abyz_taxonomy_*` 테이블에 별도 저장한다.

---

## 아키텍처 계약

이 플러그인은 커스텀 필드 분류 레이어가 아니다. 제품 계약은 다음을 요구한다:

- **프로젝트 목록**: 포트폴리오/프로그램/타이틀 행 + 연결된 Project가 바로 아래 인접 표시.
- **프로젝트 셀렉터**: 동일 구조, 관리 버튼 없음.
- **WP 테이블**: `wp_section` 행 + 연결된 WorkPackage가 바로 아래 인접 표시.
- **Gantt/타임라인**: 섹션 spacer가 연결된 WP 행/bar에 정렬.

유지 가능한 구조:

```text
Plugin core
  DB tables, models, services, API, validation, rake tasks

Versioned OP UI adapter
  plugin assets, DOM selector contract, optional source patches, E2E assertions

Release gates
  base image checksum, required patch apply, selector smoke, browser E2E,
  rollback rehearsal
```

OP 소스 패치는 버전드 어댑터 패치로만 허용한다. `patches/openproject/<op-version>/manifest.yml`에 `target_sha256`으로 선언해야 하며, 비호환 시 빌드 또는 E2E가 실패해야 한다. 네이티브 화면 행을 커스텀 필드·필터·별도 플러그인 화면으로 대체하는 것은 제품 실패다.

---

## 현재 개발 상태

2026-06-26 기준 격리 개발 인스턴스:

```text
Image:     openproject-abyz-taxonomy:17.5.0-0.2.45
Container: openproject-taxonomy-openproject-taxonomy-1
Access:    http://localhost:8087
           http://10.20.6.187:8087
           http://100.110.194.101:8087
```

**0.2.45 하이어라키 들여쓰기 (portfolio → program → title → project) (#9):**

- 타이틀 3종을 `data-abyz-taxonomy-type`(portfolio/program/title) 속성으로 구분하고, `.abyz-taxonomy-row-inner`의 `padding-left`를 0 / 2rem / 4rem으로 단계 적용해 시각적 계층을 표현한다.
- 프로젝트 행은 부모 타이틀 타입을 `data-abyz-parent-type`로 표시하고, `td.hierarchy` 셀(보이는 display-link가 위치한 열)의 `padding-left`를 2rem(portfolio 하위) / 4rem(program) / 6rem(title)로 적용한다. 프로젝트명은 항상 소속 타이틀보다 한 단계 아래에 들여쓰기된다.
- **검증**: 진짜 마우스 Playwright로 `getBoundingClientRect()` 실측 — 타이틀 nameX 346/378/410(32px=2rem 단계), 프로젝트 dispX 398(portfolio 하위)/462(title 하위)로 부모별 64px 차이 명확히 구분. 스크린샷 비전 "프로젝트가 부모보다 한 단계 깊이, 깔끔한 트리" 확증. 사용자 최종 확인 완료.
- **⚠️ 타이틀 계층 드래그 이동(move_title)은 미구현**: `PATCH /abyz_taxonomy/ui/assignments/move_title`(부모 parent_id 변경) 라우트/컨트롤러/서비스/JS 드롭 핸들러 코드는 포함되어 있으나, 타이틀 행에 reorder 드롭 핸들러와 계층 이동 드롭 핸들러가 동시에 붙어 **드롭 시 reorder_node가 API를 선점**해 parent_id가 변경되지 않는다(네이티브 DnD dragstart/dragover/drop 이벤트가 모두 발생해도 reorder만 호출됨). "재정렬 vs 부모 변경"을 구분하는 UX 설계가 필요해 후속 이슈로 분리됨. 현재 타이틀 드래그 = reorder(순서 변경)만 동작.

**0.2.42 타이틀 행 좌측 사이드 정렬 (#6):**

- 타이틀 행 label이 row-inner flex `space-between`의 3자식(drag-handle/label/actions) 중 중간이라 시각적으로 행 중앙에 배치되는 문제. `text-align: left`만으로는 해결 안 됨(픽셀 좌표로 확인).
- 해결: `.abyz-taxonomy-project-title-row .abyz-taxonomy-row-label { margin-right: auto }` — label을 drag-handle 옆(좌측 끝)으로 고정, actions만 우측 끝.
- 검증: `labelLeft` 665(중앙) → 346(행 좌측), 비전 "좌측 끝 정렬" 확증.

**0.2.37 프로젝트 드래그 이동 (#4) — /projects 목록이 주 경로, 사이드바는 동기화:**

- **주 정렬 경로 = `/projects` 전체 프로젝트 목록**(OP 네이티브 테이블, WP 테이블과 동일 메커니즘). 프로젝트를 다른 타이틀 행으로 끌면 `move_project`로 DB가 바뀌고, 좌측 사이드바 "모든 프로젝트" 드롭다운에도 자동 반영된다. 검증: `scripts/e2e/op_taxonomy_project_move_sidebar_sync_e2e.js`(진짜 마우스 + DB + 사이드바 동기화 삼중 확증).
- **사이드바 "모든 프로젝트" 드롭다운 제한**: 헤더 project-select popover가 Angular 컴포넌트라, 커스텀 생성한 **타이틀 행에 정확히 놓아야만** 프로젝트 이동이 잡힌다(좁은 drop zone). 프로젝트 li나 빈 공간에는 Angular가 이벤트를 소비해 drop이 발생하지 않는다. 타이틀 reorder(순서 변경)는 사이드바에서도 가능하다.
- 전수 매트릭스 검증(`scripts/e2e/op_taxonomy_drag_full_matrix_e2e.js`): 프로젝트 목록/사이드바 타이틀/WP 테이블의 드래그 이동 케이스를 진짜 마우스 DnD + DB 변경으로 검증한다.

**0.2.35 드래그 앤 드롭 노드 reorder (진짜 마우스 e2e 검증 완료):**

- 타이틀(포트폴리오/프로그램/타이틀)과 WP 섹션의 순서를 드래그로 수동 정렬한다. 사이드바 "모든 프로젝트" 드롭다운에서도 동일하게 동작한다.
- 백엔드: `PATCH /abyz_taxonomy/ui/assignments/reorder_node` (code, beforeCode)
- 드롭 위치(clientY) 기반 before/after 삽입 인디케이터 (파란 border)
- **검증**: 진짜 마우스(`page.mouse`) DnD 5종(TC-A 타이틀 reorder / TC-B WP 섹션 reorder / TC-C 프로젝트 이동 / TC-D WP 이동 / TC-E 사이드바 reorder) 전부 PASS — 이벤트 진단(dragStart/dragOver/drop) + DB position/parent 변경 + 스크린샷 비전 분석으로 삼중 확증. 스크립트: `scripts/e2e/op_taxonomy_drag_reorder_real_e2e.js`

**0.2.34 TC-055 근본 수정 (Angular mid-render race condition):**

- Angular CD가 WP 행을 재렌더하는 mid-render 구간에 `renderWpSectionRows()`가 실행될 때, 링크(`<a href>`)가 없는 WP 행이 미할당 풀로 오인돼 마지막 섹션(SEC-Z) 이후에 배치되는 버그 수정
- `realRows.forEach`에서 `a[href*="/work_packages/"]` 없는 행을 건너뜀 → Angular 렌더 완료 후 다음 refresh 사이클에서 정상 처리
- 0.2.32: validate 엔드포인트 권한 분리 (admin gate 제거) + API route별 authorize_admin 적용

**0.2.24 UI 수정사항:**

- taxonomy child 프로젝트 행 계층 들여쓰기 정렬 오류 수정 (`padding-left: 0`) — 프로젝트 목록 child indent 46px → 40px
- taxonomy child 프로젝트 이름 bold 상속 제거 (`font-weight: normal`) — `cloneNode(true)` OP 스타일 상속 문제 해결

운영 인스턴스(`openproject-stack-openproject-1`, `plm.abyz-lab.work`) — **2026-06-27 0.2.45 배포 완료**(하이어라키 들여쓰기). 배포는 RUNBOOK Phase 6 최소 다운타임 절차(`.env` OP_IMAGE 만 `sed -i` 교체 → `compose up -d`, openproject 서비스만 재생성). 운영 반영 시 사전 백업 + `sed -i`(echo 금지) + HTTP 실확인 + 롤백 Path A 대기 필수(INC-20260625 교훈).

최근 검증 데이터 리셋 기준:

```text
Projects:          3
WorkPackages:      1
Taxonomy nodes:    4
Assignments:       4
Sample screenshots:
  test-results/op-taxonomy/final-selector-20260621112030/sample-project-list.png
  test-results/op-taxonomy/final-selector-20260621112030/sample-project-selector.png
```

---

## 엔드포인트

모든 엔드포인트는 인증된 관리자 사용자가 필요하다.

```text
GET    /api/v3/abyz_taxonomy
GET    /api/v3/abyz_taxonomy/tree
POST   /api/v3/abyz_taxonomy/titles
POST   /api/v3/abyz_taxonomy/wp_sections
POST   /api/v3/abyz_taxonomy/projects
POST   /api/v3/abyz_taxonomy/project_assignments
POST   /api/v3/abyz_taxonomy/work_packages
POST   /api/v3/abyz_taxonomy/work_package_assignments
GET    /api/v3/projects/:id/abyz_taxonomy
POST   /api/v3/abyz_taxonomy/validate
PATCH  /api/v3/abyz_taxonomy/nodes/:code
DELETE /api/v3/abyz_taxonomy/nodes/:code

GET    /abyz_taxonomy/ui/tree
POST   /abyz_taxonomy/ui/project_titles
POST   /abyz_taxonomy/ui/projects
POST   /abyz_taxonomy/ui/wp_sections
POST   /abyz_taxonomy/ui/work_packages
PATCH  /abyz_taxonomy/ui/assignments/move_wp          # WP를 다른 섹션으로 이동
PATCH  /abyz_taxonomy/ui/assignments/move_project     # 프로젝트를 다른 타이틀로 이동
PATCH  /abyz_taxonomy/ui/assignments/reorder_node     # 타이틀/섹션 순서 재정렬(beforeCode 기준)
PATCH  /abyz_taxonomy/ui/assignments/move_title       # 타이틀 부모(parent_id) 변경 — ⚠️ 0.2.45 현재 미구현(reorder가 선점)
GET    /abyz_taxonomy/ui/nodes/:code/settings/general
PATCH  /abyz_taxonomy/ui/nodes/:code/settings/general
PATCH  /abyz_taxonomy/ui/nodes/:code
DELETE /abyz_taxonomy/ui/nodes/:code
```

---

## UI 흐름

**프로젝트 목록:**

1. `/projects` 열기.
2. 앱 헤더 우측 상단 전역 `+` 메뉴 또는 프로젝트 목록 `+ 추가` 메뉴 열기.
3. `포트폴리오 추가`, `프로그램 추가`, `타이틀 추가`로 표시 전용 `project_title` 생성.
4. 생성 메뉴의 `타이틀 아래 프로젝트 추가` 또는 타이틀 행 `...` 메뉴의 `새 하위 프로젝트`로 실제 Project 생성.
5. 생성된 Project는 활성 프로젝트 목록에서 표시 전용 타이틀 행 바로 아래에 배치됨.
6. 좌측 상단 프로젝트 셀렉터에서도 포트폴리오/프로그램/타이틀 행과 연결된 Project가 관리 버튼 없이 인접 표시됨.
7. 표시 전용 행의 `...` 메뉴로 설정, 하위 프로젝트 생성, 삭제/숨기기 가능. 삭제는 `active=false` soft delete이며 실제 Project는 삭제하지 않음.
8. 타이틀 행은 Project 링크·상태·날짜·진행률을 갖지 않음.
9. 포트폴리오/프로그램/타이틀 행은 프로젝트 목록과 프로젝트 셀렉터 모두에서 왼쪽 정렬. 연결된 Project는 들여쓰기로 바로 아래 표시.

**WP 테이블:**

1. `/projects/:identifier/work_packages` 열기.
2. 앱 헤더 우측 상단 전역 `+` 메뉴 또는 WP `만들기` 메뉴 열기.
3. `섹션 추가`로 표시 전용 `wp_section` 생성.
4. 생성 메뉴의 `섹션 아래 WP` 또는 섹션 행 `...` 메뉴의 `새 작업 패키지 만들기`로 실제 WorkPackage 생성.
5. 생성된 WP는 WP 테이블과 Gantt 테이블 모두에서 섹션 행 바로 아래에 배치됨.
6. 날짜가 있는 WP는 WP 행에 Gantt bar가 렌더링되고, 섹션 행에 대응하는 타임라인 spacer가 정렬됨.
7. 섹션 행의 `...` 메뉴로 자세히 보기, WP 생성, 삭제/숨기기 가능. 삭제는 `active=false` soft delete.
8. 섹션 행은 WP id·상태·담당자·날짜를 갖지 않음.
9. context menu 액션 전에 메뉴를 닫아 후속 클릭 방해를 방지.

**네이티브 생성 가드:**

- `[ ... ]`로 시작하는 subject의 WorkPackage 생성 거부.
- `[ ... ]`로 시작하는 이름의 Project 생성 거부.
- 표시 전용 행은 taxonomy UI/API로 생성할 것.

---

## 사용 모델

타이틀과 섹션은 OP Project·WorkPackage를 대체하지 않는다. `project_title`은 `abyz_taxonomy_nodes` 테이블에 `node_kind=project_title`로 저장되고, `wp_section`은 `node_kind=wp_section`으로 저장된다. Project·WorkPackage는 OP 기본 레코드로 유지되고 `abyz_taxonomy_assignments`로 연결된다.

지원 흐름:

1. project title 생성.
2. title 아래 Project 생성 또는 할당.
3. Project 안에 WP section 생성.
4. section 아래 WorkPackage 생성 또는 할당.
5. `/api/v3/abyz_taxonomy/tree`로 타이틀/프로젝트/섹션/WP 그룹 뷰 확인.
6. 그룹 변경 시 행의 `...` 메뉴에서 타이틀·섹션 편집/삭제.

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

### Validate API 계약 확인

PROJ6 seed 또는 동등한 staging fixture가 준비된 뒤, n8n/Hermes 연동 전에 validate 계약을 확인한다.

운영/스테이징 OpenProject 컨테이너에서는 먼저 PROJ6 taxonomy seed와 Rails-side contract를 확인한다.

```bash
bundle exec rake abyz_taxonomy:seed:proj6_legacy_titles
bundle exec rake abyz_taxonomy:verify:proj6_contract
```

`ABYZ_TAXONOMY_PROJECT_IDENTIFIER`로 대상 프로젝트 identifier를 바꿀 수 있다. `ABYZ_TAXONOMY_STRICT_WP=1`을 함께 주면 legacy title WP assignment 누락 시 seed를 실패 처리한다. `ABYZ_TAXONOMY_ROLLBACK=1`은 같은 seed/검증 로직을 실행한 뒤 트랜잭션을 rollback하므로 staging rehearsal에 사용할 수 있다.

```bash
OP_BASE_URL=http://localhost:8087 \
OP_E2E_API_TOKEN="$OP_API_KEY" \
OP_VALIDATE_PROJECT_IDENTIFIER=PROJ6 \
node scripts/e2e/op_taxonomy_validate_contract.js
```

검증 항목:

- PROJ6 workflow taxonomy codes 전체는 HTTP 200, `valid=true`, `nodeKind=wp_section`
- 누락된 `taxonomyCode`는 HTTP 422, `taxonomyCode is required`
- 알 수 없는 `taxonomyCode`는 HTTP 422, `taxonomyCode is unknown`

PROJ6 legacy seed includes the RA section codes used by `ra-request-to-op_v6`: `ra.common.eudamed_product_registration`, `ra.misc`, `ra.overseas_registration_followup`, `ra.project_certification.retrofit_hnx_r1`, `ra.regulatory_maintenance`, and `ra.regulatory_response`. `OP_VALIDATE_TAXONOMY_CODES=code1,code2` or `OP_VALIDATE_TAXONOMY_CODE=code1` can override the default all-code list for focused checks.

---

## 빌드

레포 루트에서 실행:

```bash
OP_VERSION=17.5.0 ABYZ_VERSION=0.2.34 ./custom-openproject/build.sh
```

**빌드 동작:**

1. `patches/openproject/<OP_VERSION>/manifest.yml` 존재 확인.
2. 각 패치의 `target_sha256`을 `openproject/openproject:<OP_VERSION>` 도커 이미지에서 직접 소스 파일을 추출해 검증. 로컬 OP 소스트리 불필요.
3. `required: true` 패치가 이미지에서 추출되지 않으면 빌드 실패.
4. `--build-arg OP_VERSION` / `--build-arg ABYZ_VERSION`을 Dockerfile에 전달.

**Dockerfile ARG 스코프:** `ARG OP_VERSION`은 `FROM` 전후 양쪽에 선언되어 있어 `FROM` 이후 단계(`COPY`, `RUN` 등)에서도 올바르게 확장된다.

**전제 조건:**

- Docker 데몬 실행 중.
- `OP_VERSION`에 해당하는 `patches/openproject/<op-version>/manifest.yml` 존재.
- 패치 체크섬 검증을 위해 base 이미지 pull 가능한 네트워크.
- `~/workspace/openproject-taxonomy-stack/.env` 파일 필수 — `OPENPROJECT_SECRET_KEY_BASE=<64바이트 hex>` 설정 (`openssl rand -hex 64`로 생성). 미설정 시 Rails production 기동 실패.

**개발 인스턴스 기동:**

```bash
# 런타임 스택 레포에서 실행
cd ~/workspace/openproject-taxonomy-stack
OP_IMAGE=openproject-abyz-taxonomy:17.5.0-0.2.34 \
docker compose -p openproject-taxonomy up -d
```

**릴리즈 블로커 현황:**

| 항목 | 상태 | 커밋 |
|---|---|---|
| Dockerfile ARG OP_VERSION 변수화 (ARG 스코프 버그 수정 포함) | ✅ 완료 | d2571f9 |
| build.sh target_sha256 검증 (Docker 이미지 소스 추출) | ✅ 완료 | 2abf5d0 |
| manifest.yml 스키마 `checksum`→`target_sha256`, `severity`→`required` | ✅ 완료 | 2abf5d0 |
| gemspec `assets/**/*` 포함 | ✅ 완료 | 2abf5d0 |
| E2E 어댑터 오류 실패처리 + TC 릴리즈 아티팩트 | ✅ 완료 | c3db048 |

---

## E2E

```bash
NODE_PATH=/tmp/op-taxonomy-playwright-runner/node_modules \
OP_BASE_URL=http://localhost:8087 \
OP_E2E_USER=taxonomy.e2e \
OP_E2E_PASSWORD=... \
OP_E2E_API_TOKEN=... \
node scripts/e2e/op_taxonomy_ui_e2e.js
```

**커버리지:** 표시 전용 taxonomy 노드 생성/편집/soft-delete, Project·WP섹션·날짜 WP 브라우저 UI 생성, 앱 헤더 전역 퀵 애드 메뉴, 좌측 프로젝트 셀렉터 taxonomy 행(관리 버튼 없음), `...` 행 메뉴, 포트폴리오/프로그램/타이틀 레이블, 설정 폼 편집, 노드 관리 API, 프로젝트 목록/셀렉터/WP/Gantt 인접성, Gantt 타임라인 행 정렬, 검증 API.

**TC 릴리즈 아티팩트:** E2E 실행 후 `test-results/op-taxonomy/<timestamp>/`에 다음 파일이 생성된다. 성공/실패 양쪽 경로에서 모두 기록되며 `result.json`에도 포함된다.

| 파일 | 검증 항목 |
|---|---|
| `TC-005.json` | 어댑터 로딩 smoke — 초기 페이지 로드 후 taxonomy DOM 셀렉터 확인 |
| `TC-050.json` | 프로젝트 목록 taxonomy 행 — 타이틀 생성/편집/삭제, 프로젝트 인접성, 셀렉터 |
| `TC-051.json` | WP 테이블 섹션/WP 인접성 — 섹션 생성/편집, WP 생성, Gantt 인접성 |
| `TC-052.json` | Gantt 타임라인 정렬 — 섹션 spacer와 WP bar Y좌표 오차 ≤ 3px |
| `TC-090.json` | API 정합성 — tree API, 노드 관리 CRUD, 검증 API |

**어댑터 오류 실패처리:** `pageerror:` 및 `error:` console 메시지 중 `/abyz|taxonomy/i` 패턴을 포함하는 것이 감지되면 즉시 throw하고 실패로 기록한다. TC-005 직후, TC-090 직후 두 지점에서 검사한다.

최근 통과 실행:

```text
Result: test-results/op-taxonomy/20260624001756/result.json
Selector alignment:
  titleTextAlign=left
  titleOffsetFromList=13px
  childTextIndentPx=16px
Project list child indent: 40px (0.2.24 CSS fix 적용)
Gantt timeline aligned: true
TC-005 PASS | TC-050 PASS | TC-051 PASS | TC-052 PASS | TC-090 PASS
```

---


**진짜 마우스 DnD 검증 (dispatchEvent 함정 방지):** 합성 `dispatchEvent(new DragEvent(...))`는 `isTrusted=false`로 실제 사용자 마우스 드래그와 1:1 동작을 보장하지 않는다. 드래그 reorder 등 UI 동작의 최종 검증은 반드시 `page.mouse` 수동 제어(mousedown→mousemove steps→mouseup)로 진짜 HTML5 DnD 이벤트를 발생시키고, (1) 드래그 중 인디케이터·드롭 후 결과 스크린샷을 비전 분석으로 시각 확인하고 (2) DB(API) position/parent 변경으로 영속성을 이중 확인한다.

```bash
NODE_PATH=/tmp/op-taxonomy-playwright-runner/node_modules \
OP_BASE_URL=http://localhost:8087 \
node scripts/e2e/op_taxonomy_drag_reorder_real_e2e.js
```

검증 결과 아티팩트: `/tmp/op-taxonomy-playwright-runner/real-out/real_<timestamp>/` (TC별 before/mid/after 스크린샷 + result.json). 이벤트 발생 진단은 `scripts/e2e/diagnose_dnd_events.js`.

## RSpec 단위/통합 테스트

SPEC-OP-TAXONOMY-TEST-001 구현 완료 (2026-06-23).

**스위트 구성 (871 LOC):**

| 파일 | 대상 | 요구사항 |
|---|---|---|
| `spec/models/abyz_taxonomy/node_spec.rb` | `Node` 모델 | REQ-A-01..06 |
| `spec/models/abyz_taxonomy/assignment_spec.rb` | `Assignment` 모델 | REQ-A-07..08 |
| `spec/services/abyz_taxonomy/taxonomy_service_helpers_spec.rb` | 헬퍼 메서드 | REQ-B-01..06 |
| `spec/services/abyz_taxonomy/taxonomy_service_node_spec.rb` | 노드 CRUD 서비스 | REQ-C-01..08 |
| `spec/services/abyz_taxonomy/taxonomy_service_assignment_spec.rb` | assign/tree/validate/serialize | REQ-C-09..15 |
| `spec/services/abyz_taxonomy/taxonomy_service_op_creation_spec.rb` | OP Project/WP 생성 서비스 | REQ-D-01..06 |
| `spec/lib/open_project/abyz_taxonomy/contract_patches_spec.rb` | 생성 가드 | REQ-E-01..04 |
| `spec/integration/abyz_taxonomy/taxonomy_round_trip_spec.rb` | 전체 라운드트립 | REQ-G-01..02 |

**실행 전제 조건:** 스펙은 호스트 OP 앱 컨텍스트에서 실행된다. 개발용 OP 컨테이너에 플러그인이 마운트된 상태에서 아래 명령을 실행한다.

```bash
# 개발용 컨테이너 내부에서 실행
bundle exec rspec spec/ --format documentation
```

**커버리지 목표:** 85% (헬퍼 100%, 모델 95%+, 서비스/ContractPatches 90%+, OP-커플드 80%)

---

## 버전 호환성 전략

| 브랜치 | 대상 OP 버전 | 비고 |
|---|---|---|
| `release/17.x` | OpenProject 17.x | 현재 활성 개발 브랜치 |
| `release/18.x` | OpenProject 18.x | 18.x 출시 시 `patches/openproject/18.x.x/` 추가 후 브랜치 생성 |

`Gemfile.plugins`에서 버전 고정:

```ruby
group :opf_plugins do
  gem "openproject-abyz-taxonomy",
      github: "hnabyz-bot/openproject-abyz-taxonomy",
      branch: "release/17.x"
end
```

OP 업그레이드 시:

1. 새 `patches/openproject/<new-version>/manifest.yml` 작성 (패치 파일 + `target_sha256` 갱신).
2. `release/<new-major>.x` 브랜치 생성.
3. `OP_VERSION=<new-version> ABYZ_VERSION=x.x.x ./custom-openproject/build.sh`로 빌드 검증.
4. E2E 전체 통과 확인.

플러그인 core (DB/모델/API/Ruby 로직)는 OP 버전에 관계없이 안정적이다. 버전 의존성은 `patches/openproject/<version>/` 어댑터 레이어에만 격리된다.

---

## 라이선스

GPL-3.0 — [OpenProject](https://www.openproject.org/)와 동일한 라이선스.
