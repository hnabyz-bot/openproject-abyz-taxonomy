# Tech: openproject-abyz-taxonomy

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 언어 | Ruby 3.x |
| 프레임워크 | OpenProject Rails Engine (`openproject-plugins`) |
| 마이그레이션 | Rails 8.1 style |
| API | Grape (`API::OpenProjectAPI`) |
| 데이터베이스 | PostgreSQL (ActiveRecord, JSONB) |
| 테스트 (단위/통합) | RSpec + FactoryBot |
| 테스트 (E2E) | Playwright (Node.js) |
| 컨테이너 | Docker (커스텀 이미지, openproject/openproject 기반) |
| 개발 환경 | Docker Compose (`http://localhost:8087`) |

## 핵심 패턴

| 패턴 | 설명 |
|------|------|
| `module_function` in TaxonomyService | 모든 메서드를 모듈 메서드로 호출 가능 |
| `TaxonomyError < StandardError` | `status:` 속성 포함 커스텀 에러 |
| `ContractPatches` prepend | `Projects::CreateContract`, `WorkPackages::CreateContract`에 검증 주입 |
| 버전드 소스 패치 | `patches/openproject/<op-version>/`, `target_sha256` 체크섬 검증 |
| 릴리즈 브랜치 | `release/17.x`, `release/18.x` (OP 메이저 버전별) |

## 빌드 시스템

- `build.sh`: `OP_VERSION` + `ABYZ_VERSION` 인자로 Docker 이미지 빌드
- `Dockerfile`: `ARG OP_VERSION` — FROM 앞뒤 양쪽 선언 (ARG 스코프 규칙)
- 패치 적용: `RUN patch -p1 -d /app` (빌드 중)
- `target_sha256` 검증: 빌드 시 OP 소스 파일 체크섬 확인, 불일치 시 빌드 실패

## OP 플러그인 통합

- `ActsAsOpEngine` — OP 플러그인 등록 믹스인
- `add_api_endpoint` — Grape API 마운트
- `Hook::ViewListener` — `view_layouts_base_html_head`에 assets 주입
- `ContractPatches` — CreateContract에 `prepend` 방식 검증 추가

## 버전 관리

- 배포 태그: `{OP_VERSION}-{ABYZ_VERSION}` (예: `17.5.0-0.2.23`)
- GitHub 원격: `https://github.com/hnabyz-bot/openproject-abyz-taxonomy.git`
- 활성 브랜치: `release/17.x`
- main 브랜치: 최신 개발 / 프로덕션 배포 가능 코드

## 개발 환경 명령

```bash
# 빌드
OP_VERSION=17.5.0 ABYZ_VERSION=0.2.23 ./custom-openproject/build.sh

# 기동 (포트 8087) — 런타임 스택 레포에서 실행
cd ~/workspace/openproject-taxonomy-stack
OP_IMAGE=openproject-abyz-taxonomy:17.5.0-0.2.23 \
docker compose -p openproject-taxonomy up -d

# E2E 실행
NODE_PATH=/tmp/op-taxonomy-playwright-runner/node_modules \
OP_BASE_URL=http://localhost:8087 \
OP_E2E_USER=taxonomy.e2e OP_E2E_PASSWORD=... OP_E2E_API_TOKEN=... \
node scripts/e2e/op_taxonomy_ui_e2e.js
```

## 알려진 제약

- 단위/통합 테스트 없음 (E2E만 존재, `spec/` 디렉터리는 계획 단계)
- 비관리자 권한 미구현 — 현재 관리자 전용
- gemspec version(`0.1.0`)과 배포 버전(`0.2.23`) 불일치
