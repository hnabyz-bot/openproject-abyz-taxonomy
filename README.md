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

2026-06-21 기준 격리 개발 인스턴스:

```text
Image:     openproject-abyz-taxonomy:17.5.0-0.2.23
Container: openproject-taxonomy-openproject-taxonomy-1
Access:    http://localhost:8087
           http://10.20.6.187:8087
           http://100.110.194.101:8087
```

운영 인스턴스(`openproject-stack-openproject-1`, `openproject/openproject:17`)는 개발 검증 중 재시작·수정 금지.

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

---

## 빌드

레포 루트에서 실행:

```bash
OP_VERSION=17.5.0 ABYZ_VERSION=0.2.23 ./custom-openproject/build.sh
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

**개발 인스턴스 기동:**

```bash
# 런타임 스택 레포에서 실행
cd ~/workspace/openproject-taxonomy-stack
OP_IMAGE=openproject-abyz-taxonomy:17.5.0-0.2.23 \
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
Result: test-results/op-taxonomy/20260621111705/result.json
Selector alignment:
  titleTextAlign=left
  titleOffsetFromList=13px
  childTextIndentPx=16px
Project list child indent: 46px
Gantt timeline aligned: true
```

---

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
