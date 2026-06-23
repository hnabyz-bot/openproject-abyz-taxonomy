# 구현 계획 — SPEC-OP-TAXONOMY-TEST-001

RSpec 단위/통합 테스트 스위트 구축 계획. 개발 방식 **TDD(RED-GREEN-REFACTOR)**, 전체 커버리지 목표 **85%**.

---

## 기술 접근 (Technical Approach)

- **부트스트랩**: OP 플러그인 관례에 따라 플러그인 루트 `spec/`에 스펙을 배치하고 host 앱 `rails_helper`로 실행. `spec/spec_helper.rb`는 `require "open_project/plugins/spec_helper"`.
- **계층화 전략**: OP 의존성 표면(surface)이 낮은 순서로 RED 착수 — 순수 헬퍼 → 모델 → DB 전용 서비스 → ContractPatches → OP 서비스 모킹 → 통합.
- **모킹 경계**: `Projects::CreateService`/`WorkPackages::CreateService`는 `instance_double`로 격리하고, 실제 서비스 경유 검증은 통합 라운드트립 1건으로 한정.
- **팩토리**: 신규 `:abyz_taxonomy_node`/`:abyz_taxonomy_assignment` 팩토리 + OP 코어 팩토리 재사용.

---

## 마일스톤 (Milestones — Priority-Based)

### M1 — 팩토리 + 순수 헬퍼 (Priority: High)
- `:abyz_taxonomy_node`, `:abyz_taxonomy_assignment` 팩토리 정의 (REQ-F-01..03)
- `taxonomy_service_helpers_spec.rb` — `fetch_value`/`require_value`/`normalized_*`/`slug_or_timestamp`/`parse_date`/`payload_has_key?` (REQ-B-01..06)
- 산출: DB 불필요·최속 피드백, 100% 헬퍼 커버

### M2 — 모델 스펙 (Priority: High)
- `node_spec.rb` — presence/inclusion/uniqueness/스코프/연관/`restrict_with_error` (REQ-A-01..06)
- `assignment_spec.rb` — role presence/uniqueness scope/폴리모픽 entity (REQ-A-07..08)

### M3 — DB 전용 서비스 스펙 (Priority: High)
- `taxonomy_service_node_spec.rb` — title/section 생성, 멱등 upsert, update_node! 조건부 taxonomyType, delete_node! 트랜잭션·롤백 (REQ-C-01..08)
- `taxonomy_service_assignment_spec.rb` — assign 멱등/404, tree, filter_map nil 제외, validate 교차검증, serialize (REQ-C-09..15)

### M4 — ContractPatches 스펙 (Priority: Medium)
- `contract_patches_spec.rb` — `title_like?` 단위 + Project/WP 생성 차단 통합 + 정상 통과 (REQ-E-01..04)

### M5 — OP 서비스 모킹 스펙 (Priority: Medium)
- `taxonomy_service_op_creation_spec.rb` — CreateService 성공/실패/기존 재사용, 기본값 부재 3종, 날짜 오류 (REQ-D-01..06)

### M6 — 통합 라운드트립 (Priority: Medium)
- `taxonomy_round_trip_spec.rb` — create → assign → serialize 왕복 (REQ-G-01..02)

### M7 — 커버리지 검증 (Priority: Low)
- SimpleCov 집계로 영역별 목표·전체 85% 달성 확인. 미달 영역 보강.

---

## 리스크 (Risks)

| 리스크 | 영향 | 완화 |
|--------|------|------|
| OP 코어 팩토리 가용성 차이 | M2/M5/M6 차단 | 단위 스펙은 스텁 우선, 실제 팩토리는 통합 스펙으로 한정 |
| `delete_node!` 롤백 강제 실패 주입 난이도 | REQ-C-08 미검증 | `allow(node).to receive(:update!).and_raise`로 트랜잭션 내부 실패 주입 |
| OP 버전 결합(컨트랙트 prepend) | M4 취약 | `title_like?` 순수 단위로 핵심 로직 분리, prepend는 차단 결과만 단언 |
| RecordInvalid vs TaxonomyError 혼동 | 잘못된 예외 단언 | spec.md 기술 제약에 구분 명시, 해당 케이스 별도 단언 |

---

## 의존성 (Dependencies)

- 선행: 없음(신규 테스트 스위트). 기존 소스 변경 없이 검증 전용.
- 도구: RSpec, FactoryBot, SimpleCov (host OP 테스트 환경 제공).
