# Structure: openproject-abyz-taxonomy

## 디렉터리 구조

```
openproject-abyz-taxonomy/
  app/
    controllers/abyz_taxonomy/
      ui_controller.rb          Rails controller (관리자 전용 UI)
    models/abyz_taxonomy/
      node.rb                   Node 모델 (abyz_taxonomy_nodes)
      assignment.rb             Assignment 모델 (노드 ↔ 엔티티 연결)
      rule.rb                   Rule 모델 (노드 검증 규칙)
      validation.rb             Validation 모델
    services/abyz_taxonomy/
      taxonomy_service.rb       핵심 비즈니스 로직 (TaxonomyService 모듈)
  assets/
    abyz_taxonomy_ui.js         프론트엔드 JS (OP에 주입)
    abyz_taxonomy_ui.css        프론트엔드 CSS
  config/
    routes.rb                   라우트 정의
  db/migrate/
    20260618000000_create_abyz_taxonomy_tables.rb  스키마 마이그레이션 (Rails 8.1)
  lib/
    open_project/abyz_taxonomy/
      engine.rb                 Rails Engine (플러그인 진입점)
      hooks.rb                  OP view hooks (assets 주입)
      contract_patches.rb       OP CreateContract 패치 (검증)
    api/v3/abyz_taxonomy/
      abyz_taxonomy_api.rb      /api/v3/abyz_taxonomy/* 엔드포인트
      project_abyz_taxonomy_api.rb  /api/v3/projects/:id/abyz_taxonomy
  spec/
    (RSpec 테스트 스위트, SPEC-OP-TAXONOMY-TEST-001)
  openproject-abyz-taxonomy.gemspec
  custom-openproject/           (빌드 전용 — 런타임은 별도 레포)
    Dockerfile                  커스텀 OP 이미지 (OP_VERSION + ABYZ_VERSION ARG)
    build.sh                    이미지 빌더 (target_sha256 검증)
    Gemfile.plugins             플러그인 등록
    DEPLOY_RUNBOOK.md           빌드/배포 런북
    # 런타임 스택: ~/workspace/openproject-taxonomy-stack/ (compose, nginx)
  patches/
    openproject/17.5.0/
      manifest.yml              패치 메타데이터 (target_sha256, required)
      wp-section-row-builder.patch
      project-title-row-component.patch
  scripts/e2e/
    op_taxonomy_ui_e2e.js       Playwright E2E 테스트 스위트
  .moai/specs/                  SPEC 문서
```

## 핵심 의존 관계

```
Engine
  └── add_api_endpoint → AbyzTaxonomyAPI
  └── add_api_endpoint → ProjectAbyzTaxonomyAPI
  └── config.to_prepare → Hooks (asset 주입)
  └── config.to_prepare → ContractPatches (검증 가드)

AbyzTaxonomyAPI / ProjectAbyzTaxonomyAPI
  └── TaxonomyService (모든 비즈니스 로직)

TaxonomyService
  └── Node, Assignment, Rule 모델
  └── OP 모델: Project, WorkPackage
```

## API 엔드포인트

```
GET    /api/v3/abyz_taxonomy              전체 노드 목록
GET    /api/v3/abyz_taxonomy/tree         타이틀/섹션 트리
POST   /api/v3/abyz_taxonomy/titles       project_title 생성
POST   /api/v3/abyz_taxonomy/wp_sections  wp_section 생성
POST   /api/v3/abyz_taxonomy/projects     타이틀 아래 Project 생성
POST   /api/v3/abyz_taxonomy/project_assignments  Project ↔ title 연결
POST   /api/v3/abyz_taxonomy/work_packages        섹션 아래 WP 생성
POST   /api/v3/abyz_taxonomy/work_package_assignments  WP ↔ section 연결
POST   /api/v3/abyz_taxonomy/validate     검증
PATCH  /api/v3/abyz_taxonomy/nodes/:code  노드 수정
DELETE /api/v3/abyz_taxonomy/nodes/:code  노드 soft-delete
GET    /api/v3/projects/:id/abyz_taxonomy 프로젝트별 assignment 조회
```
