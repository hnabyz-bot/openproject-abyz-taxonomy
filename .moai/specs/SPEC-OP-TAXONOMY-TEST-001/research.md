# 리서치 요약 — SPEC-OP-TAXONOMY-TEST-001

RSpec 단위/통합 테스트 스위트 구축을 위한 사전 분석. 대상 소스 파일을 직접 읽고 도출한 결과이며, 작업 지시서의 일부 시그니처(예: `create_wp_section!`의 `user:` 인자)는 실제 코드와 차이가 있어 **실제 코드 기준**으로 정정하였다.

---

## 1. 대상 소스 현황 (검증 완료)

| 파일 | 핵심 단위 | 비고 |
|------|-----------|------|
| `app/services/abyz_taxonomy/taxonomy_service.rb` | `module_function` 모듈 (417 lines) | `TaxonomyError < StandardError` (status 기본 422) 포함 |
| `app/models/abyz_taxonomy/node.rb` | `AbyzTaxonomy::Node` | 자기참조 parent/children, `dependent: :restrict_with_error` |
| `app/models/abyz_taxonomy/assignment.rb` | `AbyzTaxonomy::Assignment` | `belongs_to :entity, polymorphic: true` |
| `app/models/abyz_taxonomy/rule.rb` | `AbyzTaxonomy::Rule` | `delete_node!`에서 일괄 비활성화 대상 |
| `lib/open_project/abyz_taxonomy/contract_patches.rb` | `ContractPatches` | `TITLE_LIKE_PATTERN = /\A\[[^\]]+\]/`, prepend 패치 |

### 지시서와 실제 코드의 차이 (정정 사항)

- **`create_wp_section!(payload)`** — `user:` 키워드 인자 **없음**. `find_project!`로 프로젝트만 조회하며 OP CreateService를 호출하지 않는다.
- **`update_node!`** — `taxonomyType`는 `node_kind`가 `PROJECT_TITLE_KINDS`(`project_title`, `title`)일 때만 `rules_json`에 병합된다. `wp_section` 갱신 시에는 `rules_json`을 건드리지 않는다. `code` 리네임도 지원.
- **`delete_node!(code)`** — 소프트 삭제. `Node.transaction` 안에서 (1) 자식 노드 `parent_id: nil` 고아화, (2) `Rule.active = false`, (3) `node.active = false` 순으로 처리.
- **`Node`의 `NODE_KINDS`** = `%w[title project_title project_category wp_section wp_category]` (5종).

---

## 2. TaxonomyService 메서드 복잡도·테스트 용이성 평가

테스트 비용은 **OP 의존성 표면(surface)** 에 비례한다. 4개 계층으로 분류한다.

### 계층 1 — 순수 헬퍼 (DB·OP 불필요, 직접 호출 가능)

`module_function`이므로 `AbyzTaxonomy::TaxonomyService.send(:helper, ...)`로 직접 테스트 가능.

| 메서드 | 복잡도 | 테스트 포인트 |
|--------|--------|---------------|
| `fetch_value` | 낮음 | string/symbol 키 양방향, `ActionController::Parameters`의 `to_unsafe_h` 분기 |
| `require_value` | 낮음 | blank 시 `TaxonomyError("X is required")` |
| `normalized_code` / `normalized_identifier` | 낮음 | 값 존재 시 그대로, blank 시 prefix+slug |
| `slug_or_timestamp` | 낮음 | 특수문자 → 하이픈, 전체 비영숫자 → 타임스탬프 fallback |
| `parse_date` | 낮음 | 유효 ISO8601 → Date, blank → nil, 잘못된 포맷 → `TaxonomyError("X must use YYYY-MM-DD")` |
| `payload_has_key?` | 낮음 | string/symbol 키 존재 여부 |

평가: **테스트 용이성 최상.** DB 트랜잭션 없이 빠르게 100% 커버 가능. 최우선 RED 대상.

### 계층 2 — DB 전용 서비스 메서드 (FactoryBot Node/Project 필요, OP CreateService 불필요)

| 메서드 | 복잡도 | 주요 분기 |
|--------|--------|-----------|
| `create_project_title!` | 중 | `find_or_initialize_by(code)` 멱등 upsert, `rules_json`에 `taxonomyType` 항상 병합, parent 연결 |
| `create_wp_section!` | 중 | 실제/스텁 Project 필요, scope_type="project"+scope_id 세팅 |
| `update_node!` | 중 | code 리네임, 부분 필드 갱신(`payload_has_key?` 기반), taxonomyType 조건부 병합 |
| `delete_node!` | 중상 | 트랜잭션·자식 고아화·룰 비활성화·소프트삭제 3단계 |
| `assign_project_to_title!` / `assign_work_package_to_section!` | 중 | 폴리모픽 Assignment 멱등 생성 |
| `tree` / `serialize_project_titles` / `serialize_wp_sections` | 중 | Assignment join, `filter_map`로 nil entity 제외 |
| `validate` | 중 | 노드/프로젝트 미존재·스코프 불일치 교차검증 |
| `serialize_node/project/work_package` | 낮음 | 키 매핑 (camelCase) |

평가: **표준 모델 스펙 수준.** OP의 `Project` 팩토리만 있으면 OP 서비스 모킹 불필요.

### 계층 3 — OP 서비스 의존 메서드 (모킹 필수)

| 메서드 | OP 의존성 | 모킹 전략 |
|--------|-----------|-----------|
| `create_project_under_title!(payload, user:)` | `::Projects::CreateService`, `attach_default_types!`, `default_type_for`, `Type` | CreateService 인스턴스 더블 + 가짜 ServiceResult |
| `create_work_package_under_section!(payload, user:)` | `::WorkPackages::CreateService`, `Type`/`Status`/`IssuePriority` 기본값 fallback | 동일 + 기본값 lookup 스텁 |

평가: **경계(boundary) 테스트.** 성공/실패 ServiceResult 양 경로 모두 검증. 기본값 부재 시 `TaxonomyError` 3종(타입/상태/우선순위 없음) 분기 확인.

### 계층 4 — ContractPatches

- `title_like?(value)` — 순수 정규식 술어. `[`로 시작하는 문자열 차단. 단위 테스트 trivial.
- `apply!` / prepend 동작 — OP `WorkPackages::CreateContract`, `Projects::CreateContract` 로드 필요. 통합 스타일. 대괄호 prefix subject/name 생성이 contract validation에서 차단되는지 검증.

---

## 3. 핵심 엣지 케이스 (소스에서 직접 도출)

1. **nil/blank payload** — `require_value`가 blank에서 `TaxonomyError(status: 422)`. `fetch_value`는 string·symbol 키 및 `ActionController::Parameters`(`to_unsafe_h`)를 모두 처리해야 함.
2. **중복 code** — `create_project_title!`의 `find_or_initialize_by(code)`는 **의도된 멱등 upsert**(에러 아님). 반면 `update_node!`로 다른 노드가 점유한 code로 리네임 시 `Node`의 uniqueness 검증 위반 → `ActiveRecord::RecordInvalid` 발생. **이 예외는 `TaxonomyError`로 래핑되지 않는다** — 명세에 명시할 중요한 구분.
3. **OP 엔티티 부재** — `find_project!`/`find_project_title!`/`find_wp_section!`/`find_work_package!`/`find_node!` 모두 `TaxonomyError(status: 404)`. 각 경로별 에러 테스트 필요.
4. **트랜잭션 롤백** — `delete_node!`에서 `node.update!`가 실패하면 자식 고아화·룰 비활성화가 모두 롤백되어야 함. 트랜잭션 내부 강제 실패 시 부분 상태(partial state)가 남지 않음을 검증.
5. **OP 서비스 실패** — `call.success? == false`면 `TaxonomyError(call.errors.full_messages.join(", "))`. 성공 시 `call.result` 사용. 양 경로 검증.
6. **기본값 fallback** — `default_type_for`/`default_status`/`default_priority`. 모두 부재 시 `TaxonomyError` 3종.
7. **parse_date** — 잘못된 포맷 → `TaxonomyError`, blank → nil.
8. **validate 교차검증** — `wp_section`의 `scope_id != project.id` → "does not belong" 오류. 노드/프로젝트 미존재·둘 다 blank 조합.
9. **taxonomyType 배치** — `create_project_title!`은 항상 병합, `update_node!`는 `PROJECT_TITLE_KINDS`일 때만 병합(wp_section 갱신 시 `rules_json` 불변).
10. **Assignment 멱등성** — `find_or_initialize_by(node, entity, role)` 동일 3중쌍 2회 호출 → 1행, position 기본 0. DB unique index `[entity_type, entity_id, role, node_id]`.
11. **`dependent: :restrict_with_error`** — 자식/할당이 있는 노드를 **하드 destroy** 시 차단. 서비스는 소프트 삭제만 쓰므로 destroy 차단은 모델 스펙에서만 확인.

---

## 4. OP 서비스 모킹 전략

`Projects::CreateService` / `WorkPackages::CreateService`는 OP 코어의 ServiceResult 패턴을 따른다(`call(attributes)` → `success?`, `result`, `errors`).

권장 접근:

- **계층 3 단위 스펙**: `instance_double` + `allow(::Projects::CreateService).to receive(:new).and_return(service_double)`로 격리. 가짜 ServiceResult는 `success?`, `result`, `errors`(→ `full_messages`)에 응답하는 더블로 구성. OP 전체 팩토리 부담 없이 분기 검증.
- **성공 경로**: `success? => true`, `result => factory_or_stub_project`.
- **실패 경로**: `success? => false`, `errors.full_messages => ["..."]` → `TaxonomyError` 메시지 검증.
- **기본값 lookup**(`Type`/`Status`/`IssuePriority`): 부재 시나리오는 `allow(Type).to receive(:first).and_return(nil)` 등으로 스텁하여 3종 `TaxonomyError` 분기 트리거.

reject 사유: OP CreateService 전체 협력자(컨트랙트·콜백·권한)를 실제로 태우면 단위 스펙이 무거워지고 OP 버전에 결합된다. 실제 서비스 경유 검증은 **통합 라운드트립 스펙 1건**으로 한정한다.

---

## 5. 폴리모픽 연관 FactoryBot 전략

- **`:abyz_taxonomy_node`** — `node_kind`(기본 `project_title`), `scope_type`(기본 `project_tree`), `code`(sequence로 유일성 보장), `name` 필수. 트레잇: `:wp_section`(`node_kind: wp_section`, `scope_type: project`, transient `project`로 `scope_id` 세팅), `:inactive`(`active: false`).
- **`:abyz_taxonomy_assignment`** — `association :node`, `role`(기본 `display_parent`). 폴리모픽 `entity`는 트레잇으로 분기:
  - `:for_project` → `entity` = OP `:project` 팩토리
  - `:for_work_package` → `entity` = OP `:work_package` 팩토리
  - transient + `after(:build)`로 `entity_type`/`entity_id` 정합성 보장.
- OP 코어 팩토리(`:project`, `:work_package`, `:type`, `:status`, `:priority`, `:user`/`:admin`)는 host 앱 테스트 환경에서 제공되므로 라운드트립·계층 3 스펙에서만 사용.

---

## 6. OP 플러그인 테스트 관례 참조 패턴

- OP 플러그인은 플러그인 루트 `spec/` 디렉터리에 스펙을 두고, host 앱의 `rails_helper`를 통해 실행된다. 플러그인 `spec/spec_helper.rb`는 `require "open_project/plugins/spec_helper"`로 부트스트랩한다.
- 팩토리는 `spec/factories/`에 두며 host의 FactoryBot 경로에 자동 합류한다.
- 커버리지는 OP CI가 이미 SimpleCov로 집계한다 — 플러그인 스펙도 동일 집계에 포함.
- 실행: `bundle exec rspec` (host 앱 컨텍스트). 단일 파일은 경로 지정, `--format documentation`으로 상세 출력.
- `module_function` 모듈 테스트: 인스턴스화 없이 `described_class.send(:method, ...)` 또는 공개 메서드는 `described_class.method(...)`로 직접 호출.

---

## 7. 권장 RED 착수 순서 (TDD)

1. 순수 헬퍼 스펙(계층 1) — 가장 빠른 피드백, DB 불필요.
2. 모델 스펙(Node, Assignment) — 검증·스코프·연관·`restrict_with_error`.
3. DB 전용 서비스 스펙(계층 2) — 성공+에러 경로.
4. ContractPatches 스펙(`title_like?` 단위 + prepend 통합).
5. OP 서비스 모킹 스펙(계층 3) — 성공/실패/기본값 부재.
6. 통합 라운드트립 스펙 — create → assign → serialize 왕복.
