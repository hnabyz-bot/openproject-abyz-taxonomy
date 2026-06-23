# Product: openproject-abyz-taxonomy

## 개요

OpenProject 17.5.x+ 용 Rails Engine 플러그인. 프로젝트 목록과 WP 테이블에 표시 전용 타이틀·섹션 행을 주입해 포트폴리오/프로그램/타이틀 계층을 네이티브 OP 화면 안에서 구현한다.

- **gem**: `openproject-abyz-taxonomy`
- **버전 패턴**: `OP_VERSION-ABYZ_VERSION` (예: `17.5.0-0.2.23`)
- **라이선스**: GPL-3.0-only
- **최소 OP 버전**: `>= 17.5.0`

## 핵심 개념

`abyz_taxonomy_nodes`는 표시 전용 행 — 실제 Project/WorkPackage가 아님.  
네이티브 OP 화면에 플러그인 assets 주입 + 버전드 소스 패치를 통해 표시.

```
Plugin core (stable)       → DB 모델, API 엔드포인트, Ruby 비즈니스 로직
Versioned OP UI adapter    → patches/openproject/<op-version>/, DOM 셀렉터, E2E 검증
```

## 지원 Node Kinds

| node_kind | 역할 |
|-----------|------|
| `title` | 레거시 타이틀 (project_title 별칭) |
| `project_title` | 프로젝트 목록 포트폴리오/프로그램/타이틀 행 |
| `project_category` | 프로젝트 카테고리 |
| `wp_section` | WP 테이블 섹션 행 |
| `wp_category` | WP 카테고리 |

## 핵심 API

```
GET/POST/PATCH/DELETE  /api/v3/abyz_taxonomy/*
  - titles, wp_sections, projects, assignments
  - tree, validate, nodes/:code CRUD
GET    /api/v3/projects/:id/abyz_taxonomy
```

## DB 테이블

| 테이블 | 역할 |
|--------|------|
| `abyz_taxonomy_nodes` | 타이틀/섹션 노드 (표시 전용) |
| `abyz_taxonomy_assignments` | 노드 ↔ Project/WP 연결 |

## 대상 사용자

OP 관리자 — 포트폴리오/프로그램/타이틀 계층 관리, WP 테이블 섹션 편집

## 제품 영역

1. **프로젝트 목록 뷰**: 포트폴리오/프로그램/타이틀 행 + 연결 Project 인접 표시
2. **프로젝트 셀렉터**: 동일 구조, 관리 버튼 없음
3. **WP 테이블**: `wp_section` 행 + 연결 WP 인접 표시
4. **Gantt/타임라인**: 섹션 spacer와 WP 행/bar 정렬
5. **관리 API**: CRUD + 검증 + tree 조회
6. **UI 관리 화면**: 노드 설정 편집

## 현재 상태 (2026-06-23)

- 릴리즈 블로커 5/5 완료
- 개발 인스턴스: `http://localhost:8087`
- 활성 브랜치: `release/17.x`
