---
id: SPEC-OP-TAXONOMY-STACK-001
version: 0.1.0
status: completed
created: 2026-06-23
updated: 2026-06-23
author: drake.lee
priority: high
issue_number: null
---

# SPEC-OP-TAXONOMY-STACK-001 — OpenProject Taxonomy 개발/테스트 런타임 스택 레포 분리

## HISTORY

- 2026-06-23: 최초 작성 (drake.lee). 플러그인 레포 `custom-openproject/`에 혼재된 런타임 인프라(docker-compose, nginx)를 별도 운영 전용 레포 `~/workspace/openproject-taxonomy-stack/`로 분리하는 요구사항 정의. 기존 `openproject-stack` 분리 원칙(런타임 전용 = `docker-compose.yml` + `.env`)을 미러링.

---

## 1. 배경 및 목적 (Background & Goal)

### 1.1 문제 정의

플러그인 레포(`openproject-abyz-taxonomy`)의 `custom-openproject/` 디렉터리는 **빌드 산출물**과 **런타임 인프라**가 혼재되어 있다.

```
custom-openproject/
  Dockerfile                    ← BUILD (유지)
  build.sh                      ← BUILD (유지)
  Gemfile.plugins               ← BUILD (유지)
  DEPLOY_RUNBOOK.md             ← BUILD ops 문서 (유지)
  docker-compose.taxonomy.yml   ← RUNTIME (이동 대상)
  docker-compose.dev-access.yml ← RUNTIME (이동 대상)
  nginx/dev-access.conf         ← RUNTIME (이동 대상)
```

이는 abyz-lab-pm 운영 레포가 따르는 **엄격한 분리 원칙**을 위반한다.

- 플러그인 소스 + 빌드 도구 → `~/workspace/work-github/abyz-lab-pm/plugins/openproject-abyz-taxonomy/`
- 순수 운영 런타임 → `~/workspace/openproject-stack/` (`docker-compose.yml` + `.env`만 허용)

개발/테스트 OP 인스턴스가 현재 플러그인 레포 내부에서 관리되고 있어 이 원칙을 깨고 있다.

### 1.2 목표 상태 (Target State)

`~/workspace/openproject-taxonomy-stack/`를 별도 git 레포 + GitHub 레포(`hnabyz-bot/openproject-taxonomy-stack`)로 생성하여, 기존 `openproject-stack` 패턴을 미러링한다.

```
플러그인 레포 (빌드 전용)              운영 스택 레포 (런타임 전용)
openproject-abyz-taxonomy/            openproject-taxonomy-stack/
  custom-openproject/                   docker-compose.yml
    Dockerfile                          docker-compose.dev-access.yml
    build.sh                            nginx/dev-access.conf
    Gemfile.plugins                     .env.example  (.env은 gitignore)
    DEPLOY_RUNBOOK.md                   CLAUDE.md
                                        README.md
```

---

## 2. 용어 및 환경 (Glossary & Environment)

| 항목 | 값 |
|---|---|
| 신규 로컬 경로 | `~/workspace/openproject-taxonomy-stack/` |
| 신규 GitHub 레포 | `hnabyz-bot/openproject-taxonomy-stack` |
| 플러그인 레포 | `~/workspace/work-github/abyz-lab-pm/plugins/openproject-abyz-taxonomy/` |
| 플러그인 대상 브랜치 | `release/17.x` |
| 미러링 기준 레포 | `~/workspace/openproject-stack/` |
| 실행 중 컨테이너 (OP) | `openproject-taxonomy-openproject-taxonomy-1` (Up 44h) |
| 실행 중 컨테이너 (nginx) | `openproject-taxonomy-access` (Up 2d) |
| 이미지 | `openproject-abyz-taxonomy:17.5.0-0.2.23` |
| 포트 | `127.0.0.1:18087:80` |
| Compose 프로젝트명 | `openproject-taxonomy` |

### 2.1 [CRITICAL] 볼륨 데이터 연속성 사실 (검증 완료)

작업 지시서에 명시된 볼륨명 `op_taxonomy_pgdata17` / `op_taxonomy_assets`는 docker-compose 파일 내 **선언 이름**이며, 실제 실행 중인 컨테이너가 마운트한 **물리 볼륨명**은 Compose 프로젝트 접두어가 붙은 다음과 같다 (`docker inspect`로 검증).

```
openproject-taxonomy_op_taxonomy_pgdata17  -> /var/openproject/pgdata
openproject-taxonomy_op_taxonomy_assets    -> /var/openproject/assets
```

Docker Compose는 볼륨명을 `{프로젝트명}_{선언명}` 형식으로 접두어를 붙인다. 현재 데이터는 프로젝트명 `openproject-taxonomy`로 생성된 볼륨에 존재한다.

> [HARD] 데이터 손실 방지를 위해, 신규 스택 레포에서 `docker compose up` 실행 시 반드시 **동일한 프로젝트명(`-p openproject-taxonomy`)을 사용**해야 한다. 그래야 새 위치에서 실행해도 동일한 물리 볼륨 `openproject-taxonomy_op_taxonomy_*`에 연결되어 기존 데이터가 보존된다. 프로젝트명이 달라지면 새 빈 볼륨이 생성되어 기존 DB/asset과 분리된다.

---

## 3. 요구사항 (Requirements — EARS)

### REQ-A: 신규 스택 레포 생성

- **REQ-A-01 (Event-Driven)**: **When** 작업자가 스택 분리를 시작하면, the 시스템 **shall** `~/workspace/openproject-taxonomy-stack/` 디렉터리를 생성한다.
- **REQ-A-02 (Event-Driven)**: **When** 신규 디렉터리가 생성되면, the 시스템 **shall** 해당 디렉터리를 git 레포로 초기화하고 GitHub에 `hnabyz-bot/openproject-taxonomy-stack` 원격 레포를 생성한다.
- **REQ-A-03 (Ubiquitous)**: The 스택 레포 **shall** "런타임 파일만 허용(`docker-compose*.yml` + `nginx/` + `.env`)" 규칙을 강제하는 `CLAUDE.md`를 포함한다. 이 규칙은 빌드 코드(Dockerfile, build.sh, Gemfile.plugins)가 스택 레포로 유입되는 것을 금지한다.
- **REQ-A-04 (Ubiquitous)**: The 스택 레포 **shall** 빌드→배포 사용법(이미지 빌드는 플러그인 레포, 실행은 스택 레포)과 `docker compose -p openproject-taxonomy` 실행 명령을 명시한 `README.md`를 포함한다.

### REQ-B: 런타임 파일 이관

- **REQ-B-01 (Event-Driven)**: **When** 런타임 파일이 이관되면, the 시스템 **shall** `custom-openproject/docker-compose.taxonomy.yml`을 스택 레포의 `docker-compose.yml`로 이름 변경 및 경로 이동한다.
- **REQ-B-02 (State-Driven)**: **While** 이관된 `docker-compose.yml`이 작성되는 동안, the 시스템 **shall** 하드코딩된 이미지 태그를 `${OP_IMAGE:-openproject-abyz-taxonomy:17.5.0-0.2.23}` 형식으로 치환하여 이미지 버전 유연성을 확보한다.
- **REQ-B-03 (Event-Driven)**: **When** dev-access 파일이 이관되면, the 시스템 **shall** `docker-compose.dev-access.yml`을 동일 이름으로 스택 레포에 이동하고 nginx 볼륨 경로가 `./nginx/dev-access.conf`를 가리키도록 유지한다.
- **REQ-B-04 (Event-Driven)**: **When** nginx 설정이 이관되면, the 시스템 **shall** `nginx/dev-access.conf`를 스택 레포의 `nginx/dev-access.conf`로 이동한다.
- **REQ-B-05 (Ubiquitous)**: The 스택 레포 **shall** `OPENPROJECT_SECRET_KEY_BASE=` placeholder를 포함한 `.env.example`을 제공한다.
- **REQ-B-06 (Unwanted Behavior / State-Driven)**: **While** 마이그레이션이 진행되는 동안, the 시스템 **shall not** 실행 중인 컨테이너(`openproject-taxonomy-openproject-taxonomy-1`, `openproject-taxonomy-access`)를 중단시킨다. 파일 이동 자체는 실행 중인 컨테이너에 영향을 주지 않으므로 `docker compose down`/`up`을 요구하지 않는다.
- **REQ-B-07 (State-Driven) [CRITICAL]**: **While** 이관된 `docker-compose.yml`이 작성되는 동안, the 시스템 **shall** 볼륨 선언명 `op_taxonomy_pgdata17` / `op_taxonomy_assets`를 보존한다. **If** 향후 동일 위치에서 재기동이 필요하면, **then** 작업자는 반드시 `-p openproject-taxonomy` 프로젝트명으로 실행하여 기존 물리 볼륨 `openproject-taxonomy_op_taxonomy_*`에 연결해야 한다 (2.1절 참조).

### REQ-C: 플러그인 레포 정리

- **REQ-C-01 (Event-Driven)**: **When** 정리가 수행되면, the 시스템 **shall** `git rm`으로 플러그인 레포에서 `custom-openproject/docker-compose.taxonomy.yml`을 제거한다.
- **REQ-C-02 (Event-Driven)**: **When** 정리가 수행되면, the 시스템 **shall** `git rm`으로 플러그인 레포에서 `custom-openproject/docker-compose.dev-access.yml`을 제거한다.
- **REQ-C-03 (Event-Driven)**: **When** 정리가 수행되면, the 시스템 **shall** `git rm -r`로 플러그인 레포에서 `custom-openproject/nginx/`를 제거한다.
- **REQ-C-04 (Ubiquitous)**: After 정리 후, the `custom-openproject/` 디렉터리 **shall** 빌드 전용 파일만 보유한다: `Dockerfile`, `build.sh`, `Gemfile.plugins`, `DEPLOY_RUNBOOK.md`.

### REQ-D: 플러그인 레포 내 참조 갱신

- **REQ-D-01 (Event-Driven)**: **When** 빌드 스크립트가 갱신되면, the 시스템 **shall** `custom-openproject/build.sh`의 최종 echo(배포 안내)를 `~/workspace/openproject-taxonomy-stack/`을 참조하도록 수정한다.
- **REQ-D-02 (Event-Driven)**: **When** 플러그인 레포 문서가 갱신되면, the 시스템 **shall** `CLAUDE.md`의 개발 인스턴스 섹션이 `~/workspace/openproject-taxonomy-stack/`을 참조하도록 수정한다.
- **REQ-D-03 (Event-Driven)**: **When** README가 갱신되면, the 시스템 **shall** `README.md`의 "빌드" 섹션이 신규 스택 레포 경로를 참조하도록 수정한다.

### REQ-E: 커밋 및 푸시

- **REQ-E-01 (Event-Driven)**: **When** 스택 레포 구성이 완료되면, the 시스템 **shall** 초기 커밋을 생성하고 `hnabyz-bot/openproject-taxonomy-stack` GitHub에 푸시한다.
- **REQ-E-02 (Event-Driven)**: **When** 플러그인 레포 정리가 완료되면, the 시스템 **shall** `release/17.x` 브랜치에 정리 커밋을 생성하고 origin에 푸시한다.

---

## 4. 비기능 제약 (Non-Functional Constraints)

- **NFC-01 (운영 안전)**: `.env` 파일은 스택 레포에서 `.gitignore`로 제외되며, `.env.example`만 커밋된다. 실제 시크릿(`OPENPROJECT_SECRET_KEY_BASE`)은 절대 버전 관리에 포함되지 않는다.
- **NFC-02 (untracked 금지)**: abyz-lab-pm CLAUDE.md의 비협상 원칙 — "운영 스택 레포에 절대 untracked 구현 파일을 남기지 말 것"이 신규 `openproject-taxonomy-stack` 레포에도 동일하게 적용된다.
- **NFC-03 (데이터 연속성)**: 마이그레이션 전후로 기존 OP DB/asset 데이터가 100% 보존되어야 한다. 볼륨명·프로젝트명 변경으로 인한 데이터 분리는 절대 발생해서는 안 된다.
- **NFC-04 (단일 출처 원칙)**: 런타임 정의는 스택 레포에만 존재한다. 마이그레이션 완료 후 플러그인 레포에는 런타임 파일이 단 하나도 남지 않아야 한다.
- **NFC-05 (언어)**: 본 SPEC 및 신규 레포 문서는 한국어로 작성한다 (코드 주석은 English, git 커밋 메시지는 한국어 — language.yaml 설정 준수).

---

## 5. Exclusions (What NOT to Build)

본 SPEC은 다음을 **명시적으로 제외**한다.

- **EXC-01**: 운영 OP 스택(`openproject-stack`, `openproject-stack-openproject-1`)에 대한 어떠한 변경도 하지 않는다. 본 작업은 개발/테스트 인스턴스 분리에만 국한된다.
- **EXC-02**: 빌드 시스템(Dockerfile, build.sh의 빌드 로직, Gemfile.plugins, DEPLOY_RUNBOOK.md 내용)의 기능적 변경은 하지 않는다. `build.sh`는 최종 echo 안내 문구만 수정한다 (REQ-D-01).
- **EXC-03**: 컨테이너 재기동(`docker compose down`/`up`/`restart`)을 수행하지 않는다. 파일 이동은 실행 중인 컨테이너에 영향을 주지 않으며, 본 SPEC은 무중단 마이그레이션을 보장한다 (REQ-B-06).
- **EXC-04**: 플러그인 소스 코드(`app/`, `lib/`, `assets/`, `db/migrate/`, `patches/`)에 대한 변경은 하지 않는다.
- **EXC-05**: 이미지 재빌드나 새 이미지 태그 생성을 하지 않는다. 기존 이미지 `openproject-abyz-taxonomy:17.5.0-0.2.23`을 그대로 참조한다.
- **EXC-06**: 포트 매핑(`127.0.0.1:18087:80`), 환경 변수, nginx 프록시 동작의 변경은 하지 않는다. 파일은 위치만 이동하며 내용 의미는 보존된다 (이미지 태그 변수화·nginx 볼륨 경로 제외).
- **EXC-07**: 데이터 마이그레이션·백업·복원 스크립트는 작성하지 않는다. 데이터는 동일 물리 볼륨에 그대로 두며 이동하지 않는다.

---

## 6. 수용 기준 (Acceptance Criteria by Group)

> 상세 Given-When-Then 시나리오는 `acceptance.md` 참조. 본 절은 요구사항 그룹별 핵심 수용 기준 요약.

### REQ-A 수용 기준
- `~/workspace/openproject-taxonomy-stack/`가 존재하고 git 레포로 초기화되어 있다.
- `hnabyz-bot/openproject-taxonomy-stack` GitHub 레포가 조회 가능하다 (`gh repo view`).
- 스택 레포에 `CLAUDE.md`(런타임 전용 규칙 포함), `README.md`(빌드→배포 사용법 포함)가 존재한다.

### REQ-B 수용 기준
- 스택 레포에 `docker-compose.yml`, `docker-compose.dev-access.yml`, `nginx/dev-access.conf`, `.env.example`가 존재한다.
- `docker-compose.yml`의 image 라인이 `${OP_IMAGE:-openproject-abyz-taxonomy:17.5.0-0.2.23}` 형식이다.
- 볼륨 선언명 `op_taxonomy_pgdata17` / `op_taxonomy_assets`가 보존되어 있다.
- 두 컨테이너가 마이그레이션 중에도 계속 `Up` 상태이다 (`docker ps`).

### REQ-C 수용 기준
- `git ls-files custom-openproject/`에 `docker-compose.taxonomy.yml`, `docker-compose.dev-access.yml`, `nginx/`가 더 이상 나타나지 않는다.
- `custom-openproject/`에 `Dockerfile`, `build.sh`, `Gemfile.plugins`, `DEPLOY_RUNBOOK.md`만 남아있다.

### REQ-D 수용 기준
- `build.sh` 최종 echo가 `~/workspace/openproject-taxonomy-stack/`을 참조한다 (`docker-compose.taxonomy.yml` 직접 참조 문구 제거).
- 플러그인 `CLAUDE.md` 개발 인스턴스 섹션, `README.md` 빌드 섹션이 신규 스택 레포 경로를 참조한다.

### REQ-E 수용 기준
- 스택 레포 초기 커밋이 GitHub에 푸시되어 있다.
- 플러그인 레포 정리 커밋이 `release/17.x`에서 origin에 푸시되어 있다.
- 스택 레포에 untracked 구현 파일이 없다 (`git status --porcelain` 깨끗, `.env` 제외).

---

## 7. 위험 및 가정 (Risks & Assumptions)

| 항목 | 내용 | 대응 |
|---|---|---|
| RISK-01 | Compose 프로젝트명이 달라지면 새 빈 볼륨이 생성되어 기존 데이터와 분리 | 스택 레포에서 항상 `-p openproject-taxonomy` 사용 강제 (README/CLAUDE.md 명시). 또는 external 볼륨 선언 검토 |
| RISK-02 | 플러그인 레포에서 런타임 파일 제거 후, 과거 문서/스크립트가 옛 경로(`custom-openproject/docker-compose.taxonomy.yml`)를 참조하면 깨짐 | REQ-D에서 build.sh·CLAUDE.md·README.md 참조 전수 갱신 |
| RISK-03 | `.env` 시크릿이 신규 레포로 실수로 커밋될 위험 | `.gitignore`에 `.env` 등록, `.env.example`만 커밋 (NFC-01) |
| ASSUME-01 | 작업 지시서의 볼륨명 표기(`op_taxonomy_*`)는 선언명이며, 실제 물리 볼륨은 `openproject-taxonomy_` 접두어를 가진다 (검증 완료) | 2.1절에 명시, REQ-B-07로 강제 |
| ASSUME-02 | `hnabyz-bot/openproject-taxonomy-stack` 레포는 아직 존재하지 않음 (검증: `gh repo view` 실패) | REQ-A-02에서 신규 생성 |

---

## 8. 관련 문서 (References)

- 미러링 기준: `~/workspace/openproject-stack/` (CLAUDE.md, README.md, .env.example, .gitignore 구조)
- 플러그인 레포 빌드 가이드: `custom-openproject/DEPLOY_RUNBOOK.md`
- abyz-lab-pm 레포 구조 원칙: `~/workspace/work-github/abyz-lab-pm/CLAUDE.md` ([CRITICAL] 레포 구조 — 혼동 금지)
- 선행 SPEC: `SPEC-OP-TAXONOMY-001` (빌드 시스템), `SPEC-OP-TAXONOMY-TEST-001` (테스트)
