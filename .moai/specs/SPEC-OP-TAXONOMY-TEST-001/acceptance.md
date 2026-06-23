# 수용 기준 — SPEC-OP-TAXONOMY-TEST-001

Given-When-Then 시나리오. 모든 기준은 테스트 가능(testable)하고 구체적이어야 한다.

---

## 시나리오 (Given-When-Then)

### AC-01 — 순수 헬퍼: require_value blank 처리
- **Given** symbol 키 payload `{ name: "" }`
- **When** `TaxonomyService.send(:require_value, payload, "name")` 호출
- **Then** `TaxonomyError`가 발생하고 메시지는 `"name is required"`, `status`는 422

### AC-02 — fetch_value 다중 입력 형태
- **Given** string 키 hash, symbol 키 hash, `ActionController::Parameters` 세 입력
- **When** `fetch_value(payload, "code")` 호출
- **Then** 세 경우 모두 동일 값을 반환 (`to_unsafe_h` 경로 포함)

### AC-03 — Node uniqueness 검증
- **Given** `code: "project.alpha"` 노드가 이미 저장됨
- **When** 동일 code의 두 번째 노드를 `save` 시도
- **Then** `valid?`가 false, `errors[:code]`에 uniqueness 위반 포함

### AC-04 — Node 하드 destroy 차단
- **Given** 자식 노드를 1개 보유한 부모 노드
- **When** 부모 노드를 `destroy` 시도
- **Then** `destroy`가 false 반환, `restrict_dependent_destroy` 오류 추가, 행이 삭제되지 않음

### AC-05 — create_project_title! 멱등 upsert
- **Given** `code: "project.beta"` 노드가 이미 존재
- **When** 동일 code로 `create_project_title!`을 다른 `name`으로 재호출
- **Then** `Node.where(code: "project.beta").count == 1`, name이 갱신, `rules_json["taxonomyType"]` 병합됨

### AC-06 — create_wp_section! 미존재 프로젝트
- **Given** 존재하지 않는 `projectIdentifier: "ghost"`
- **When** `create_wp_section!({ projectIdentifier: "ghost", name: "X" })` 호출
- **Then** `TaxonomyError` 발생, `status == 404`

### AC-07 — update_node! 조건부 taxonomyType
- **Given** `node_kind: "wp_section"` 노드
- **When** `update_node!(code, { taxonomyType: "category" })` 호출
- **Then** `rules_json`이 변경되지 않음 (wp_section은 PROJECT_TITLE_KINDS 아님)

### AC-08 — delete_node! 소프트 삭제 + 고아화
- **Given** 자식 1개와 `Rule` 1개를 가진 활성 노드
- **When** `delete_node!(code)` 호출
- **Then** 자식의 `parent_id`가 nil, `Rule.active`가 false, 노드의 `active`가 false (행 보존)

### AC-09 — delete_node! 트랜잭션 롤백
- **Given** 자식·룰을 가진 노드, `node.update!`가 내부에서 실패하도록 주입
- **When** `delete_node!` 호출
- **Then** 예외 전파, 자식 `parent_id`·룰 `active`가 변경 전 상태로 롤백 (부분 상태 없음)

### AC-10 — assign 멱등성
- **Given** 활성 title 노드와 프로젝트
- **When** `assign_project_to_title!`을 동일 인자로 2회 호출
- **Then** `Assignment` 행이 정확히 1개, `position == 0`

### AC-11 — validate 스코프 불일치
- **Given** 프로젝트 A에 속한 `wp_section` 노드와 프로젝트 B의 identifier
- **When** `validate({ taxonomyCode: section.code, projectIdentifier: project_b.identifier })` 호출
- **Then** `valid: false`, `errors`에 "taxonomyCode does not belong to projectIdentifier" 포함

### AC-12 — OP 서비스 실패 경로 (모킹)
- **Given** `Projects::CreateService` 더블이 `success? == false`, `errors.full_messages == ["boom"]` 반환
- **When** `create_project_under_title!(payload, user:)` 호출
- **Then** `TaxonomyError` 발생, 메시지에 `"boom"` 포함

### AC-13 — WP 생성 기본값 부재 (모킹)
- **Given** 사용 가능한 `Status`가 없음(스텁 nil)
- **When** `create_work_package_under_section!` 호출
- **Then** `TaxonomyError("no default status is available")` 발생

### AC-14 — ContractPatches 대괄호 차단
- **Given** `name: "[그룹] 실 프로젝트"`로 Project 생성 시도
- **When** `Projects::CreateContract` 검증 실행
- **Then** `errors[:name]`에 `TITLE_LIKE_ERROR` 포함, 생성 차단

### AC-15 — 통합 라운드트립
- **Given** 실제 모델·OP 팩토리
- **When** title 생성 → 프로젝트 assign → `tree` 직렬화 흐름 실행
- **Then** `tree[:projectTitles]`의 항목이 생성한 노드·할당 프로젝트와 정합 (create → assign → serialize 왕복 일치)

---

## 엣지 케이스 (Edge Cases)

- nil payload / blank 필수값 → `TaxonomyError(422)`
- 잘못된 날짜 포맷 → `TaxonomyError("... must use YYYY-MM-DD")`
- uniqueness 위반 리네임 → `ActiveRecord::RecordInvalid` (TaxonomyError 아님)
- `serialize_*`의 nil entity → `filter_map`으로 결과에서 제외
- 모든 `find_*!` 미존재 → `TaxonomyError(404)`

---

## 품질 게이트 (Quality Gate Criteria)

- 영역별 커버리지: 헬퍼 100%, 모델 95%+, DB 서비스 90%+, OP 의존 80%, ContractPatches 100%
- 전체 커버리지 >= 85% (quality.yaml `test_coverage_target`)
- 모든 EARS 요구사항(REQ-A..G)이 1개 이상의 검증 시나리오로 매핑됨
- `bundle exec rspec` 전체 통과, 0 failure

---

## Definition of Done

- [ ] 그룹 A~G의 모든 요구사항에 대응하는 RSpec 파일 작성
- [ ] `:abyz_taxonomy_node`/`:abyz_taxonomy_assignment` 팩토리 정의 및 트레잇 동작
- [ ] OP 서비스 모킹으로 성공·실패·기본값 부재 경로 검증
- [ ] 통합 라운드트립 스펙 통과
- [ ] SimpleCov 집계상 전체 커버리지 >= 85% 확인
- [ ] 전체 스위트 0 failure, RuboCop 위반 없음
- [ ] 기존 소스 코드 무변경 (테스트 추가만)
