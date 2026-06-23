## Task Decomposition
SPEC: SPEC-OP-TAXONOMY-TEST-001

| Task ID | Description | Requirement | Dependencies | Planned Files | Status |
|---------|-------------|-------------|--------------|---------------|--------|
| T-001 | spec_helper.rb, rails_helper.rb, .rspec 부트스트랩 | 인프라 | - | spec/spec_helper.rb, spec/rails_helper.rb, .rspec | completed |
| T-002 | :abyz_taxonomy_node / :abyz_taxonomy_assignment 팩토리 정의 | REQ-F-01..03 | T-001 | spec/factories/abyz_taxonomy_node_factory.rb, spec/factories/abyz_taxonomy_assignment_factory.rb | completed |
| T-003 | 순수 헬퍼 스펙 (fetch_value/require_value/normalized_*/slug_or_timestamp/parse_date/payload_has_key?) | REQ-B-01..06 | T-001 | spec/services/abyz_taxonomy/taxonomy_service_helpers_spec.rb | completed |
| T-004 | Node 모델 스펙 (presence/inclusion/uniqueness/restrict_with_error/scopes/associations) | REQ-A-01..06 | T-002 | spec/models/abyz_taxonomy/node_spec.rb | completed |
| T-005 | Assignment 모델 스펙 (role presence/uniqueness scope/polymorphic entity) | REQ-A-07..08 | T-002 | spec/models/abyz_taxonomy/assignment_spec.rb | completed |
| T-006 | 서비스 노드 스펙 (create_project_title!/create_wp_section!/update_node!/delete_node! + 롤백) | REQ-C-01..08 | T-002, T-004 | spec/services/abyz_taxonomy/taxonomy_service_node_spec.rb | completed |
| T-007 | 서비스 assign/tree/validate/serialize 스펙 | REQ-C-09..15 | T-006, T-005 | spec/services/abyz_taxonomy/taxonomy_service_assignment_spec.rb | completed |
| T-008 | ContractPatches 스펙 (title_like? + 생성 차단 + 정상 통과) | REQ-E-01..04 | T-002 | spec/lib/open_project/abyz_taxonomy/contract_patches_spec.rb | completed |
| T-009 | OP 서비스 모킹 스펙 (create_project_under_title!/create_work_package_under_section!) | REQ-D-01..06 | T-002 | spec/services/abyz_taxonomy/taxonomy_service_op_creation_spec.rb | completed |
| T-010 | 통합 라운드트립 + 커버리지 검증 85% | REQ-G-01..02 | T-006, T-007, T-009 | spec/integration/abyz_taxonomy/taxonomy_round_trip_spec.rb | completed |
