---
id: SPEC-OP-TAXONOMY-TEST-001
version: 0.1.0
status: planned
created: 2026-06-23
updated: 2026-06-23
author: drake.lee
priority: high
issue_number: null
---

# SPEC-OP-TAXONOMY-TEST-001: RSpec Unit/Integration Test Suite for TaxonomyService and Models

## HISTORY

- 2026-06-23: 최초 작성. `openproject-abyz-taxonomy` 플러그인의 TaxonomyService·모델·ContractPatches에 대한 RSpec 단위/통합 테스트 스위트 명세. 대상 소스(`taxonomy_service.rb` 417 lines, `node.rb`, `assignment.rb`, `contract_patches.rb`) 직접 검증 후 EARS 요구사항 도출.

---

## 개요 (Overview)

`openproject-abyz-taxonomy`는 OpenProject 17.5.x용 Rails Engine 플러그인으로, 표시 전용(display-only) taxonomy 노드를 Project 목록과 Work Package 테이블에 주입한다. 현재 단위/통합 테스트가 **전무**하며, 790라인 Playwright E2E 스위트만 존재한다.

본 SPEC은 핵심 비즈니스 로직 계층(`TaxonomyService`), 도메인 모델(`Node`, `Assignment`), 생성 차단 컨트랙트 패치(`ContractPatches`)에 대한 RSpec 테스트 스위트를 정의한다. 개발 방식은 **TDD(RED-GREEN-REFACTOR)**, 전체 커버리지 목표는 **85%**이다.

본 문서는 *무엇을(WHAT)* 검증할지와 *왜(WHY)* 검증하는지에 집중하며, 구현 코드는 작성하지 않는다.

---

## 환경 및 가정 (Environment and Assumptions)

- **테스트 프레임워크**: RSpec (OP 플러그인 관례). host 앱의 `rails_helper`를 통해 실행.
- **팩토리**: FactoryBot. OP 코어 팩토리(`:project`, `:work_package`, `:type`, `:status`, `:priority`, `:user`/`:admin`)는 host 테스트 환경에서 제공된다고 가정.
- **OP 서비스**: `Projects::CreateService`, `WorkPackages::CreateService`는 ServiceResult 패턴(`call` → `success?`/`result`/`errors`)을 따른다.
- **`module_function` 모듈**: `TaxonomyService`는 인스턴스화 없이 `described_class.method(...)`(공개) 또는 `described_class.send(:method, ...)`(비공개)로 호출 가능하다.
- **DB**: 트랜잭션 격리(`use_transactional_fixtures`)가 활성화된 표준 OP 테스트 DB.
- **`TaxonomyError`**: `StandardError` 하위 클래스, `status` 속성(기본 422, 일부 404).

---

## 요구사항 (Requirements — EARS Format)

### 그룹 A — 모델 스펙 (Node, Assignment)

- **REQ-A-01 (Ubiquitous)**: 테스트 스위트는 `AbyzTaxonomy::Node`의 presence 검증(`scope_type`, `node_kind`, `code`, `name`)을 항상 검증해야 한다(SHALL).
- **REQ-A-02 (Event-Driven)**: WHEN `node_kind`가 `NODE_KINDS`(`title`/`project_title`/`project_category`/`wp_section`/`wp_category`) 외의 값일 때, 테스트는 inclusion 검증 실패를 단언해야 한다(SHALL).
- **REQ-A-03 (Event-Driven)**: WHEN 동일 `code`를 가진 두 번째 노드를 저장하려 할 때, 테스트는 uniqueness 검증 실패를 단언해야 한다(SHALL).
- **REQ-A-04 (State-Driven)**: WHILE 노드가 자식(children) 또는 assignment를 보유한 상태에서, 테스트는 하드 `destroy`가 `dependent: :restrict_with_error`로 차단됨을 단언해야 한다(SHALL).
- **REQ-A-05 (Ubiquitous)**: 테스트는 `active` 스코프가 `active: true` 노드만, `ordered` 스코프가 `(scope_type, position, name)` 순으로 반환함을 검증해야 한다(SHALL).
- **REQ-A-06 (Ubiquitous)**: 테스트는 `Node`의 자기참조 `parent`/`children` 연관(`inverse_of` 포함) 양방향을 검증해야 한다(SHALL).
- **REQ-A-07 (Ubiquitous)**: 테스트는 `AbyzTaxonomy::Assignment`의 `role` presence 및 `node_id` uniqueness(scope: `[entity_type, entity_id, role]`)를 검증해야 한다(SHALL).
- **REQ-A-08 (Event-Driven)**: WHEN `entity`가 Project 또는 WorkPackage로 설정될 때, 테스트는 폴리모픽 `entity` 연관이 올바른 `entity_type`/`entity_id`로 해석됨을 검증해야 한다(SHALL).

### 그룹 B — TaxonomyService 순수 헬퍼 단위 스펙

- **REQ-B-01 (State-Driven)**: WHILE payload가 string 키 또는 symbol 키 또는 `ActionController::Parameters`일 때, 테스트는 `fetch_value`가 세 입력 형태 모두에서 값을 반환함을 검증해야 한다(SHALL).
- **REQ-B-02 (Event-Driven)**: WHEN 요구된 키의 값이 blank일 때, 테스트는 `require_value`가 `TaxonomyError("<key> is required")`(status 422)를 발생시킴을 단언해야 한다(SHALL).
- **REQ-B-03 (Ubiquitous)**: 테스트는 `normalized_code`/`normalized_identifier`가 값 존재 시 그대로, blank 시 prefix+slug를 생성함을 검증해야 한다(SHALL).
- **REQ-B-04 (Event-Driven)**: WHEN 입력 문자열이 전부 비영숫자일 때, 테스트는 `slug_or_timestamp`가 타임스탬프 fallback(`taxonomy-YYYYMMDDHHMMSS`)을 반환함을 단언해야 한다(SHALL).
- **REQ-B-05 (Event-Driven)**: WHEN 날짜 문자열이 `YYYY-MM-DD` 포맷이 아닐 때, 테스트는 `parse_date`가 `TaxonomyError("<field> must use YYYY-MM-DD")`를 발생시킴을 단언해야 한다(SHALL). blank 입력은 nil을 반환해야 한다(SHALL).
- **REQ-B-06 (Ubiquitous)**: 테스트는 `payload_has_key?`가 string·symbol 키 존재 여부를 정확히 판별함을 검증해야 한다(SHALL).

### 그룹 C — TaxonomyService DB 전용 메서드 스펙 (성공 + 에러 경로)

- **REQ-C-01 (Event-Driven)**: WHEN 유효한 payload로 `create_project_title!`이 호출될 때, 테스트는 `project_title` 노드가 영속화되고 `rules_json["taxonomyType"]`가 병합됨을 단언해야 한다(SHALL).
- **REQ-C-02 (State-Driven)**: WHILE 동일 `code`의 노드가 이미 존재하는 상태에서 `create_project_title!`이 재호출될 때, 테스트는 신규 행 생성 없이 기존 노드가 갱신(멱등 upsert)됨을 단언해야 한다(SHALL).
- **REQ-C-03 (Event-Driven)**: WHEN `create_wp_section!`이 유효한 `projectIdentifier`로 호출될 때, 테스트는 `wp_section` 노드가 `scope_type: "project"`·`scope_id: project.id`로 생성됨을 단언해야 한다(SHALL).
- **REQ-C-04 (Event-Driven)**: WHEN `projectIdentifier`가 존재하지 않는 프로젝트를 가리킬 때, 테스트는 `create_wp_section!`이 `TaxonomyError`(status 404)를 발생시킴을 단언해야 한다(SHALL).
- **REQ-C-05 (Event-Driven)**: WHEN `update_node!`가 부분 필드 payload로 호출될 때, 테스트는 `payload_has_key?`가 참인 필드만 갱신되고 나머지는 보존됨을 단언해야 한다(SHALL).
- **REQ-C-06 (State-Driven)**: WHILE 노드가 `wp_section`인 상태에서 `update_node!`에 `taxonomyType`가 전달될 때, 테스트는 `rules_json`이 **변경되지 않음**을 단언해야 한다(SHALL). 노드가 `PROJECT_TITLE_KINDS`일 때만 병합되어야 한다.
- **REQ-C-07 (Event-Driven)**: WHEN `delete_node!`가 호출될 때, 테스트는 트랜잭션 내에서 (1) 자식 노드 `parent_id`가 nil로 고아화, (2) 연결된 `Rule`이 `active: false`, (3) 노드가 `active: false`로 소프트 삭제됨을 모두 단언해야 한다(SHALL).
- **REQ-C-08 (State-Driven)**: WHILE `delete_node!` 트랜잭션 내부에서 노드 갱신이 실패하는 상태일 때, 테스트는 자식 고아화·룰 비활성화가 모두 롤백되어 부분 상태가 남지 않음을 단언해야 한다(SHALL).
- **REQ-C-09 (Event-Driven)**: WHEN `assign_project_to_title!` 또는 `assign_work_package_to_section!`이 동일 `(node, entity, role)` 3중쌍으로 두 번 호출될 때, 테스트는 단일 `Assignment` 행만 존재함(멱등)을 단언해야 한다(SHALL).
- **REQ-C-10 (Event-Driven)**: WHEN `assign_*` 메서드가 미존재 노드/엔티티 코드로 호출될 때, 테스트는 `TaxonomyError`(status 404)를 단언해야 한다(SHALL).
- **REQ-C-11 (Ubiquitous)**: 테스트는 `tree`가 `{ projectTitles: [...], wpSections: [...] }` 구조를 반환하고, 각 항목이 직렬화된 노드 + 연결 엔티티를 포함함을 검증해야 한다(SHALL).
- **REQ-C-12 (State-Driven)**: WHILE assignment의 `entity`가 nil(삭제됨)인 상태일 때, 테스트는 `serialize_project_titles`/`serialize_wp_sections`의 `filter_map`이 해당 항목을 제외함을 단언해야 한다(SHALL).
- **REQ-C-13 (Event-Driven)**: WHEN `validate`가 미존재 `taxonomyCode`·미존재 `projectIdentifier`·blank 조합으로 호출될 때, 테스트는 각 케이스의 `errors` 배열과 `valid: false`를 단언해야 한다(SHALL).
- **REQ-C-14 (State-Driven)**: WHILE `wp_section`의 `scope_id`가 대상 프로젝트 id와 불일치하는 상태일 때, 테스트는 `validate`가 "taxonomyCode does not belong to projectIdentifier" 오류를 반환함을 단언해야 한다(SHALL).
- **REQ-C-15 (Ubiquitous)**: 테스트는 `serialize_node`/`serialize_project`/`serialize_work_package`가 camelCase 키로 기대 필드를 매핑함을 검증해야 한다(SHALL).

### 그룹 D — TaxonomyService OP 서비스 의존 메서드 스펙 (모킹)

- **REQ-D-01 (Event-Driven)**: WHEN `create_project_under_title!`이 호출되고 모킹된 `Projects::CreateService`가 성공 ServiceResult를 반환할 때, 테스트는 프로젝트가 생성되고 title 노드에 `display_parent` assignment가 연결됨을 단언해야 한다(SHALL).
- **REQ-D-02 (Event-Driven)**: WHEN 모킹된 `Projects::CreateService`가 실패 ServiceResult(`success? == false`)를 반환할 때, 테스트는 `TaxonomyError`가 `errors.full_messages`를 메시지로 발생함을 단언해야 한다(SHALL).
- **REQ-D-03 (State-Driven)**: WHILE 동일 `identifier`의 프로젝트가 이미 존재하는 상태일 때, 테스트는 `create_project_under_title!`이 `CreateService`를 호출하지 않고 기존 프로젝트를 재사용함을 단언해야 한다(SHALL).
- **REQ-D-04 (Event-Driven)**: WHEN `create_work_package_under_section!`이 호출되고 모킹된 `WorkPackages::CreateService`가 성공할 때, 테스트는 WP가 생성되고 section 노드에 assignment가 연결됨을 단언해야 한다(SHALL).
- **REQ-D-05 (Event-Driven)**: WHEN 사용 가능한 Type/Status/Priority가 없을 때, 테스트는 `create_work_package_under_section!`이 각각 "project has no available work package type"/"no default status is available"/"no default priority is available" `TaxonomyError`를 발생시킴을 단언해야 한다(SHALL).
- **REQ-D-06 (Event-Driven)**: WHEN `create_work_package_under_section!`에 잘못된 날짜 포맷이 전달될 때, 테스트는 `parse_date` 경유 `TaxonomyError`를 단언해야 한다(SHALL).

### 그룹 E — ContractPatches 스펙

- **REQ-E-01 (Ubiquitous)**: 테스트는 `ContractPatches.title_like?`가 `TITLE_LIKE_PATTERN`(`/\A\[[^\]]+\]/`)에 대해 대괄호 prefix 문자열은 true, 일반 문자열은 false를 반환함을 검증해야 한다(SHALL).
- **REQ-E-02 (Unwanted Behavior)**: IF 대괄호 prefix 이름으로 Project를 생성하려 하면, THEN 테스트는 `Projects::CreateContract` 검증이 `name`에 `TITLE_LIKE_ERROR`를 추가하여 생성을 차단함을 단언해야 한다(SHALL).
- **REQ-E-03 (Unwanted Behavior)**: IF 대괄호 prefix subject로 WorkPackage를 생성하려 하면, THEN 테스트는 `WorkPackages::CreateContract` 검증이 `subject`에 `TITLE_LIKE_ERROR`를 추가하여 생성을 차단함을 단언해야 한다(SHALL).
- **REQ-E-04 (State-Driven)**: WHILE subject/name이 대괄호 prefix가 아닌 일반 값인 상태일 때, 테스트는 contract 검증이 통과(차단 없음)함을 단언해야 한다(SHALL).

### 그룹 F — 팩토리 정의

- **REQ-F-01 (Ubiquitous)**: 스위트는 `:abyz_taxonomy_node` 팩토리(`code` sequence로 유일, 기본 `node_kind: project_title`, `scope_type: project_tree`, `name` 필수)를 제공해야 한다(SHALL).
- **REQ-F-02 (Optional)**: Where 트레잇이 필요한 경우, 팩토리는 `:wp_section`(`node_kind: wp_section`, `scope_type: project`, transient `project`로 `scope_id` 세팅) 및 `:inactive`(`active: false`) 트레잇을 제공해야 한다(SHALL).
- **REQ-F-03 (Ubiquitous)**: 스위트는 `:abyz_taxonomy_assignment` 팩토리(`association :node`, 기본 `role: display_parent`)와 폴리모픽 트레잇 `:for_project`/`:for_work_package`를 제공해야 한다(SHALL).

### 그룹 G — 통합 스펙 (서비스 상호작용 라운드트립)

- **REQ-G-01 (Event-Driven)**: WHEN title 생성 → 프로젝트 assign → `tree`/`serialize` 직렬화의 전체 흐름이 실제 모델·OP 팩토리를 통해 실행될 때, 테스트는 직렬화 결과가 생성·할당 데이터와 정합함(create → assign → serialize 왕복)을 단언해야 한다(SHALL).
- **REQ-G-02 (Event-Driven)**: WHEN wp_section 생성 → WP assign → `tree` 직렬화 흐름이 실행될 때, 테스트는 `wpSections` 항목이 올바른 project·workPackages 배열을 포함함을 단언해야 한다(SHALL).

---

## 제외 사항 (Exclusions — What NOT to Build)

- **E2E 테스트**: `scripts/e2e/op_taxonomy_ui_e2e.js`(Playwright, 기존 790라인)는 본 SPEC 범위 밖. 신규 E2E 작성·수정 금지.
- **UiController 뷰/요청 스펙**: `app/controllers/abyz_taxonomy/ui_controller.rb` 및 `app/views/abyz_taxonomy/**`의 렌더링/뷰 스펙 제외.
- **API v3 엔드포인트 요청 스펙**: `lib/api/v3/abyz_taxonomy/**`의 Grape API request spec 제외.
- **Rake 태스크 스펙**: `lib/tasks/abyz_taxonomy.rake` 제외.
- **Engine/Hooks/Asset 주입 스펙**: `engine.rb`, `hooks.rb`, asset 파셜 제외.
- **OP 코어 동작 검증**: `Projects::CreateService`/`WorkPackages::CreateService` 자체의 정상성은 OP 코어 책임 — 본 스위트는 호출·결과 처리 경계만 검증.
- **프런트엔드 JS/CSS 단위 테스트**: `assets/**` 제외.
- **Rule 모델 단독 스펙**: `Rule`은 `delete_node!` 통합 검증 내에서만 다루며, 독립 모델 스펙은 작성하지 않는다.

---

## 기술적 제약 (Technical Constraints)

- **OP 테스트 헬퍼**: 플러그인 `spec/`는 host OP 앱의 `rails_helper`를 통해 실행되며, `spec/spec_helper.rb`는 `require "open_project/plugins/spec_helper"`로 부트스트랩한다.
- **factory_bot**: 신규 팩토리는 `spec/factories/`에 배치하고 OP 코어 팩토리(`:project`, `:work_package`, `:type`, `:status`, `:priority`, `:user`/`:admin`)를 재사용한다.
- **OP 서비스 모킹**: `Projects::CreateService`/`WorkPackages::CreateService`는 `instance_double` + `allow(...).to receive(:new)`로 격리한다. 가짜 ServiceResult는 `success?`/`result`/`errors`(→ `full_messages`)에 응답해야 한다.
- **module_function 호출 규약**: 공개 메서드는 `described_class.method(...)`, 비공개 헬퍼는 `described_class.send(:method, ...)`로 호출.
- **예외 구분 [HARD]**: `find_or_initialize_by` 멱등 upsert는 에러가 아니며, uniqueness 위반은 `ActiveRecord::RecordInvalid`로 발생(이는 `TaxonomyError`로 래핑되지 **않음**). 스펙은 이 구분을 정확히 단언해야 한다.
- **트랜잭션 격리**: 표준 OP 테스트 트랜잭션 사용. `delete_node!` 롤백 검증은 트랜잭션 내부 강제 실패를 주입하여 단언한다.
- **TDD 모드**: RED-GREEN-REFACTOR. 각 요구사항은 먼저 실패하는 테스트로 시작한다.

---

## 파일 구조 계획 (File Structure Plan)

```
spec/
  spec_helper.rb                              # require "open_project/plugins/spec_helper"
  rails_helper.rb                             # host rails_helper 연동
  factories/
    abyz_taxonomy_node_factory.rb             # REQ-F-01, REQ-F-02
    abyz_taxonomy_assignment_factory.rb       # REQ-F-03
  models/abyz_taxonomy/
    node_spec.rb                              # 그룹 A (REQ-A-01..06)
    assignment_spec.rb                        # 그룹 A (REQ-A-07..08)
  services/abyz_taxonomy/
    taxonomy_service_helpers_spec.rb          # 그룹 B (순수 헬퍼)
    taxonomy_service_node_spec.rb             # 그룹 C (title/section/update/delete)
    taxonomy_service_assignment_spec.rb       # 그룹 C (assign/tree/validate/serialize)
    taxonomy_service_op_creation_spec.rb      # 그룹 D (OP 서비스 모킹)
  lib/open_project/abyz_taxonomy/
    contract_patches_spec.rb                  # 그룹 E
  integration/abyz_taxonomy/
    taxonomy_round_trip_spec.rb               # 그룹 G
```

---

## 영역별 커버리지 목표 (Coverage Targets by Area)

| 영역 | 대상 파일 | 목표 | 근거 |
|------|-----------|------|------|
| 순수 헬퍼 | `taxonomy_service.rb` (private helpers) | 100% | DB·OP 의존 없음, 분기 적음 |
| 모델 | `node.rb`, `assignment.rb` | 95%+ | 검증·스코프·연관 단순 |
| DB 전용 서비스 | `taxonomy_service.rb` (title/section/update/delete/assign/tree/validate/serialize) | 90%+ | 성공+에러 경로 모두 |
| OP 서비스 의존 | `create_*_under_*` 메서드 + 기본값 fallback | 80% | 경계 모킹, OP 결합 회피 |
| ContractPatches | `contract_patches.rb` | 100% | 술어 + prepend 차단 검증 |
| **전체** | 플러그인 코어 | **>= 85%** | quality.yaml `test_coverage_target` |

---

## 참고 (References)

- 상세 테스트 용이성 평가·엣지 케이스·모킹 전략: `research.md` (동일 디렉터리)
- 수용 기준(Given-When-Then): `acceptance.md` (동일 디렉터리)
- 구현 계획·마일스톤: `plan.md` (동일 디렉터리)
