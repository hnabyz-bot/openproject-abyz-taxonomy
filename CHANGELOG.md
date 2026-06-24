# Changelog

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
