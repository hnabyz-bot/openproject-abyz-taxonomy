# Changelog

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

