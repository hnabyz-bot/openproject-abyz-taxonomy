# OpenProject Taxonomy 커스텀 확장 — 배포 런북

- **대상 버전**: openproject-abyz-taxonomy:17.5.0-0.2.23
- **운영 인스턴스**: `openproject-stack` (raspi5p, plm.abyz-lab.work)
- **관련 SPEC**: SPEC-OP-TAXONOMY-001 v0.4.1
- **관련 교차검증 보고서**: `docs/superpowers/reports/2026-06-22-op-taxonomy-update-safe-doc-crosscheck.md`
- **관련 이슈**: hnabyz-bot/abyz-lab-pm #56, #57~#63

---

## 원칙 (변경 금지)

1. **운영 OP는 무조건 살아있어야 한다.** 배포 중 downtime이 발생하더라도 수분 이내 복구 가능해야 한다.
2. **롤백 경로가 검증된 후에만 운영 반영한다.** TC-070 통과 없이 Phase 6 진입 금지.
3. **표준 이미지 임시 운영 전환 금지** — taxonomy 기능 소실 시 n8n/Hermes 오작동 유발.
4. **모든 운영 반영은 사용자 명시 승인 후에만 실행한다.**
5. **OP 기본 Project list/WP table/Gantt/Project selector 연동은 필수다.** custom field/grouping 또는 별도 화면만 남는 축소 구현은 운영 반영 금지.
6. **지원되지 않는 OP 버전은 배포 금지다.** versioned OP UI adapter manifest, checksum, selector, E2E가 모두 통과해야 한다.

---

## 현재 개발용 검증 상태 (2026-06-21)

| 항목 | 값 |
|---|---|
| 개발 image | `openproject-abyz-taxonomy:17.5.0-0.2.23` |
| 개발 compose project | `openproject-taxonomy` |
| 개발 OP container | `openproject-taxonomy-openproject-taxonomy-1` |
| 개발 access proxy | `openproject-taxonomy-access` |
| 개발 URL | `http://localhost:8087`, `http://10.20.6.187:8087`, `http://100.110.194.101:8087` |
| 운영 OP container | `openproject-stack-openproject-1`, `openproject/openproject:17` |
| 운영 반영 | 미실행 |

최종 검증:

- 전체 E2E: `test-results/op-taxonomy/20260621111705/result.json`
- Project selector 캡처: `test-results/op-taxonomy/final-selector-20260621112030/sample-project-selector.png`
- 활성 프로젝트 목록 캡처: `test-results/op-taxonomy/final-selector-20260621112030/sample-project-list.png`
- 최종 개발 DB: Project 3개, WP 1개, taxonomy node 4개, assignment 4개

---

## 0. 전제조건 체크리스트

Phase 6 진입 전 모든 항목 ✅ 확인 필수.

| # | 항목 | 확인 방법 |
|---|---|---|
| 1 | 최신 DB/assets 백업 존재 (24시간 이내) | `ls -la ~/workspace/backups/openproject-$(date +%Y%m%d)*` |
| 2 | Custom image 빌드 성공 | `docker image inspect openproject-abyz-taxonomy:17.5.0-0.2.23` |
| 3 | Adapter manifest/base checksum/required patch 검증 통과 | `tc-005-adapter-manifest-check.json` 존재 |
| 4 | Staging에서 E2E TC-001~TC-060 전 통과 | `test-results/op-taxonomy/<date>/` 존재 확인 |
| 5 | 목적 보존 E2E 통과 | TC-051: Project list, Project selector, WP table, Gantt 모두 통과 |
| 6 | Adapter 침묵 실패 방지 통과 | TC-052 결과 존재 |
| 7 | TC-070 (Rollback Path A) staging 실증 통과 | 아래 Section 3 절차 사전 실행 |
| 8 | TC-080 (Migration additive-only) 통과 | `grep` 출력 없음 확인 (Section 8 참고) |
| 9 | TC-090 Release quality gate 통과 | 문서 95%, 코드 90%, E2E 95%, 목적 보존 100% |
| 10 | 운영 권한 정책 확인 | admin-only 승인 또는 viewer/manager 권한 분리 E2E 통과 |
| 11 | Image 아카이브 생성 완료 | `/backup/op-taxonomy-17.5.0-0.2.23-<date>.tar.gz` 존재 |
| 12 | 사용자 명시 승인 | AskUserQuestion 응답 또는 명시적 "진행" 승인 |

---

## 1. `.env` 이미지 상태 기준

`openproject-stack/.env` 의 `OP_IMAGE` 값으로 현재 운영 이미지를 결정한다.

```bash
# 현재 상태 확인
cat ~/workspace/openproject-stack/.env
docker compose -p openproject-stack config | grep 'image:'
```

| 상태 | OP_IMAGE 값 | 설명 |
|---|---|---|
| 운영 (기본) | `openproject/openproject:17.5.0` | 표준 이미지, taxonomy 기능 없음 |
| Custom 배포 후 | `openproject-abyz-taxonomy:17.5.0-0.2.23` | 커스텀 이미지, taxonomy 활성 |
| Rollback Path A | `openproject/openproject:17.5.0` | 표준 이미지 복귀 |
| OP 업그레이드 후 | `openproject-abyz-taxonomy:<op-version>-0.2.23` | 새 버전 커스텀 이미지 |

---

## 2. 표준 배포 절차 (Phase 6)

**[HARD] 사용자 명시 승인 없이 절대 실행 금지.**

```bash
# Step 1 — 최신 백업 존재 확인
ls -la ~/workspace/backups/ | grep openproject-$(date +%Y%m%d) || echo "경고: 오늘 백업 없음 — 즉시 수동 백업 실행"

# Step 2 — 현재 실행 이미지 아카이브 보존
BACKUP_DATE=$(date +%Y%m%d)
docker save openproject-abyz-taxonomy:17.5.0-0.2.23 | \
  gzip > ~/workspace/backups/op-taxonomy-17.5.0-0.2.23-${BACKUP_DATE}.tar.gz
echo "이미지 아카이브 완료: op-taxonomy-17.5.0-0.2.23-${BACKUP_DATE}.tar.gz"

# Step 3 — 현재 실행 중인 이미지 기록
docker inspect openproject-stack-openproject-1 --format '{{.Config.Image}}' > \
  ~/workspace/backups/pre-deploy-image-${BACKUP_DATE}.txt
cat ~/workspace/backups/pre-deploy-image-${BACKUP_DATE}.txt

# Step 4 — 스택 중단
cd ~/workspace/openproject-stack
docker compose -p openproject-stack down

# Step 5 — .env 전환
echo "OP_IMAGE=openproject-abyz-taxonomy:17.5.0-0.2.23" > .env
cat .env   # 확인

# Step 6 — 재기동
docker compose -p openproject-stack up -d

# Step 7 — Health 확인 (30초 대기 후)
sleep 30
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  http://localhost:8086/ -H "Host: plm.abyz-lab.work"
# 기대값: HTTP 200

# Step 8 — 기능 확인
curl -s -u "apikey:${OP_API_KEY}" \
  -H "Host: plm.abyz-lab.work" \
  "http://localhost:8086/api/v3/abyz_taxonomy" | python3 -m json.tool | head -20

# Step 9 — 이상 확인 시 즉시 Rollback Path A 실행 (Section 3)
```

---

## 3. Rollback Path A — 이미지 태그 교체 (우선 사용, sub-minute)

**트리거**: 기능 이상, 화면 오류, taxonomy API 응답 없음 등 배포 후 문제 발생 시.  
**조건**: `abyz_taxonomy_*` 테이블의 데이터 손상이 없는 경우 (정상적인 additive migration 후).  
**소요 시간**: 약 1분.

```bash
# 1. .env를 표준 이미지로 되돌리기
cd ~/workspace/openproject-stack
echo "OP_IMAGE=openproject/openproject:17.5.0" > .env
cat .env   # 확인

# 2. 재기동
docker compose -p openproject-stack up -d

# 3. Health 확인
sleep 30
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  http://localhost:8086/ -H "Host: plm.abyz-lab.work"
# 기대값: HTTP 200

# 4. 기존 데이터 확인
curl -s -u "apikey:${OP_API_KEY}" \
  -H "Host: plm.abyz-lab.work" \
  "http://localhost:8086/api/v3/projects?pageSize=3" | python3 -m json.tool | head -20
```

**확인 기준**: 
- HTTP 200 응답
- 기존 Project/WP 데이터 조회 가능
- `abyz_taxonomy_*` 테이블이 남아 있어도 OP 오류 없음 (standard OP는 해당 테이블을 무시)

---

## 4. Rollback Path B — DB 백업 복원 (데이터 손상 시만 사용)

**트리거**: Migration이 additive-only 원칙을 위반하여 OP core 테이블 데이터가 손상된 경우.  
**경고**: 복원 시점 이후 생성된 모든 Project/WP/댓글 데이터가 소실된다.

```bash
# 1. 사용할 백업 파일 확인
ls -la ~/workspace/backups/openproject-*/
# 배포 직전 백업 날짜/시간 확인

# 2. 스택 완전 중단
cd ~/workspace/openproject-stack
docker compose -p openproject-stack down -v   # 볼륨 포함 삭제

# 3. DB 복원 (백업 파일 경로 확인 후 실행)
BACKUP_DIR="~/workspace/backups/openproject-YYYYMMDD_HHMM"
docker run --rm \
  -v openproject-stack_op_pgdata17:/var/lib/postgresql/data \
  -v ${BACKUP_DIR}:/backup \
  postgres:13 \
  bash -c "psql -U openproject -d openproject < /backup/openproject-YYYYMMDD_HHMM.sql"

# 4. 표준 이미지로 .env 설정 후 재기동
echo "OP_IMAGE=openproject/openproject:17.5.0" > .env
docker compose -p openproject-stack up -d

# 5. Health + 데이터 확인
sleep 60
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  http://localhost:8086/ -H "Host: plm.abyz-lab.work"
```

**실제 복원 절차는 `scripts/restore.sh` 및 `MIGRATION_CHECKLIST.md` 참고.**

---

## 5. OP 업그레이드 + 새 Custom Image 배포

새 OP 버전(예: 17.6.0)으로 업그레이드 시:

```bash
# 1. 새 OP 버전 adapter manifest 준비
ls ~/workspace/work-github/abyz-lab-pm/patches/openproject/17.6.0/manifest.yml

# 2. 새 버전 custom image 빌드 (build.sh)
cd ~/workspace/work-github/abyz-lab-pm/custom-openproject
OP_VERSION=17.6.0 ABYZ_VERSION=0.2.23 ./build.sh
# 빌드 실패 시 → Section 6 (patch/adapter 실패 임시 운영) 참고

# 3. 필수 검증 산출물 확인
ls test-results/op-taxonomy/*/tc-005-adapter-manifest-check.json
ls test-results/op-taxonomy/*/quality-gate.json

# 4. 새 이미지 staging 검증 완료 후 .env 전환
echo "OP_IMAGE=openproject-abyz-taxonomy:17.6.0-0.2.23" > ~/workspace/openproject-stack/.env

# 5. 이하 표준 배포 절차 (Section 2) 동일
```

업그레이드 성공 조건:

- `Dockerfile`이 실제로 `OP_VERSION=17.6.0` base image를 사용한다.
- adapter manifest의 `op_base_image`와 빌드 base image가 일치한다.
- base image target checksum 검증이 통과한다.
- required source patch가 모두 적용된다.
- Project list, Project selector, WP table, Gantt 목적 보존 E2E가 모두 통과한다.
- TC-070/080/090이 모두 통과한다.

---

## 6. OP 업그레이드 Patch/Adapter 실패 시 임시 운영 (REQ-UPGRADE-007)

**[HARD] Patch/adapter/E2E 실패 상태에서 표준 `openproject/openproject` 이미지로 임시 전환 금지.**

이유: taxonomy 기능이 소실되면 n8n/Hermes(ra-request-to-op_v6)가 오작동한다.

| 상황 | 처리 |
|---|---|
| Patch/adapter 실패로 새 버전 custom image 빌드 불가 | **현재 버전 custom image 유지** — 새 표준 이미지 전환 금지 |
| Adapter selector 또는 목적 보존 E2E 실패 | **현재 버전 custom image 유지** — adapter 수정 후 재검증 |
| custom field/grouping만 남고 title/section row가 사라짐 | 실패 처리 — 목적 미달, 운영 반영 금지 |
| 현재 버전 custom image 정상 동작 중 | 유지하면서 patch/adapter 수정 작업 진행 |
| Patch/adapter 수정 완료 후 | TC-005/050/051/052와 전체 staging E2E 재검증 → 배포 |

```bash
# 현재 실행 중인 custom image 버전 확인
docker inspect openproject-stack-openproject-1 --format '{{.Config.Image}}'
# 기대값: openproject-abyz-taxonomy:17.5.0-0.2.23 (또는 현재 버전)

# 현재 이미지 상태 확인
docker compose -p openproject-stack config | grep 'image:'
```

---

## 7. Build/Adapter 검증 (TC-005/050/051/052)

Phase 6 진입 전 필수 실행. 새 OP 버전뿐 아니라 현재 OP 버전 재빌드에도 적용한다.

```bash
cd ~/workspace/work-github/abyz-lab-pm/custom-openproject
OP_VERSION=17.5.0 ABYZ_VERSION=0.2.23 ./build.sh
```

필수 확인:

| 항목 | 기대 |
|---|---|
| Dockerfile base | `OP_VERSION` 값이 실제 `FROM openproject/openproject:${OP_VERSION}`에 반영됨 |
| manifest 존재 | `patches/openproject/${OP_VERSION}/manifest.yml` 존재 |
| base checksum | manifest의 required source patch target checksum과 base image `/app` 파일 checksum 일치 |
| required patch | dry-run + Docker build apply 모두 성공 |
| DOM selector contract | Project list, Project selector, WP table, Gantt selector smoke 통과 |
| 목적 보존 E2E | 기본 OP 화면 안 title/section row 연동 모두 통과 |
| console error | taxonomy adapter uncaught error 0건 |

출력 산출물:

- `test-results/op-taxonomy/<date>/tc-005-adapter-manifest-check.json`
- `test-results/op-taxonomy/<date>/tc-050-upgrade-rehearsal.log`
- `test-results/op-taxonomy/<date>/tc-051-purpose-preservation.json`
- `test-results/op-taxonomy/<date>/tc-052-adapter-failfast.json`

### 7-1. 현재 구현 기준 배포 차단 항목 (2026-06-22 재교차검증)

아래 항목은 실제 파일 기준으로 확인된 미충족 사항이다. 해결 전 Phase 6 진입 금지.

| 항목 | 실제 상태 | 필요한 조치 |
|---|---|---|
| Dockerfile base | `FROM openproject/openproject:17.5.0` hardcoded | `ARG OP_VERSION` 기반으로 전환 |
| Dockerfile patch | 17.5.0 `project-title-row-component.patch` 직접 COPY/RUN | manifest 기반 required patch 적용으로 전환 |
| manifest schema | `patches`, `checksum`, `severity` v0.3 schema | v0.4 adapter manifest schema로 전환 |
| build.sh patch 검증 | repo target 없으면 skip, checksum 미검증 | base image `/app` 추출 checksum + dry-run 검증 |
| TS patch | `apply_in_docker: false`인데 `severity: required` | archived/experimental 처리 또는 frontend rebuild stage 구현 |
| JS adapter fail-fast | tree load 실패를 catch 후 침묵 처리 | adapter 대상 화면에서는 visible error + E2E fail |
| E2E console gate | console/pageerror 수집만 하고 fail 조건 아님 | taxonomy adapter error budget 0건 gate 추가 |
| release artifact | `result.json`/`trace.zip`/PNG만 생성 | TC-005/050/051/052/090 산출물 생성 |
| plugin asset packaging | Dockerfile이 assets를 직접 public path로 COPY, gemspec에는 `assets/**/*` 없음 | Dockerfile 의존 명시 또는 gem packaging 보완 |
| 권한 모델 | UI/API 모두 admin-only | admin-only 운영 승인 또는 viewer/manager 권한 분리 구현 |

---

## 8. Migration Additive-Only 검증 (TC-080)

Phase 6 진입 전 필수 실행. 출력이 없어야 통과.

```bash
grep -n "ALTER TABLE\|DROP COLUMN\|RENAME COLUMN\|DROP TABLE" \
  ~/workspace/work-github/abyz-lab-pm/plugins/openproject-abyz-taxonomy/db/migrate/*.rb
# 기대값: 출력 없음

# 만약 출력이 있다면:
# - 대상이 abyz_taxonomy_* 신규 테이블인지 확인
# - OP core 테이블(work_packages, projects, users 등)이 포함되어 있으면 즉시 수정
```

---

## 9. 이미지 보존 정책 (REQ-DEPLOY-003)

```bash
# 배포 전 현재 custom image 아카이브
docker save openproject-abyz-taxonomy:17.5.0-0.2.23 | \
  gzip > ~/workspace/backups/op-taxonomy-17.5.0-0.2.23-$(date +%Y%m%d).tar.gz

# 아카이브에서 복원 (필요 시)
docker load < ~/workspace/backups/op-taxonomy-17.5.0-0.2.23-YYYYMMDD.tar.gz

# 보관 목록 확인
ls -lh ~/workspace/backups/op-taxonomy-*.tar.gz
```

---

## 10. 변경 이력

| 날짜 | 버전 | 내용 |
|---|---|---|
| 2026-06-19 | 1.0.0 | 최초 작성. SPEC-OP-TAXONOMY-001 v0.2.0 배포 안전 설계 기반. |
| 2026-06-20 | 1.0.1 | SPEC 참조 v0.2.0 → v0.3.0 갱신. |
| 2026-06-22 | 1.0.2 | 목적 보존형 업데이트 구조 반영. OP 기본 Project list/WP table/Gantt/Project selector 연동을 필수 gate로 명시하고 Build/Adapter 검증 섹션 추가. |
| 2026-06-22 | 1.0.3 | 구현-문서 재교차검증 결과 반영. 현행 Dockerfile/build/manifest/E2E/권한/packaging 배포 차단 항목 추가. |

---

*이 런북은 SPEC-OP-TAXONOMY-001 REQ-DEPLOY-006 요구사항에 의해 작성되었다.*  
*변경 시 SPEC-OP-TAXONOMY-001 v0.4.1의 업데이트 절차, release readiness quality contract, 롤백 설계와 일치 여부를 확인한다.*
