# OpenProject Taxonomy 커스텀 확장 — 배포 런북

**대상 버전**: openproject-abyz-taxonomy:17.5.0-0.1.0  
**운영 인스턴스**: `openproject-stack` (raspi5p, plm.abyz-lab.work)  
**관련 SPEC**: SPEC-OP-TAXONOMY-001 v0.2.0  
**관련 이슈**: hnabyz-bot/abyz-lab-pm #56, #57~#63

---

## 원칙 (변경 금지)

1. **운영 OP는 무조건 살아있어야 한다.** 배포 중 downtime이 발생하더라도 수분 이내 복구 가능해야 한다.
2. **롤백 경로가 검증된 후에만 운영 반영한다.** TC-070 통과 없이 Phase 6 진입 금지.
3. **표준 이미지 임시 운영 전환 금지** — taxonomy 기능 소실 시 n8n/Hermes 오작동 유발.
4. **모든 운영 반영은 사용자 명시 승인 후에만 실행한다.**

---

## 0. 전제조건 체크리스트

Phase 6 진입 전 모든 항목 ✅ 확인 필수.

| # | 항목 | 확인 방법 |
|---|---|---|
| 1 | 최신 DB/assets 백업 존재 (24시간 이내) | `ls -la ~/workspace/backups/openproject-$(date +%Y%m%d)*` |
| 2 | Custom image 빌드 성공 | `docker image inspect openproject-abyz-taxonomy:17.5.0-0.1.0` |
| 3 | Staging에서 E2E TC-001~TC-060 전 통과 | `test-results/op-taxonomy/<date>/` 존재 확인 |
| 4 | TC-070 (Rollback Path A) staging 실증 통과 | 아래 Section 3 절차 사전 실행 |
| 5 | TC-080 (Migration additive-only) 통과 | `grep` 출력 없음 확인 (Section 6 참고) |
| 6 | Image 아카이브 생성 완료 | `/backup/op-taxonomy-17.5.0-0.1.0-<date>.tar.gz` 존재 |
| 7 | 사용자 명시 승인 | AskUserQuestion 응답 또는 명시적 "진행" 승인 |

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
| Custom 배포 후 | `openproject-abyz-taxonomy:17.5.0-0.1.0` | 커스텀 이미지, taxonomy 활성 |
| Rollback Path A | `openproject/openproject:17.5.0` | 표준 이미지 복귀 |
| OP 업그레이드 후 | `openproject-abyz-taxonomy:17.6.0-0.1.0` | 새 버전 커스텀 이미지 |

---

## 2. 표준 배포 절차 (Phase 6)

**[HARD] 사용자 명시 승인 없이 절대 실행 금지.**

```bash
# Step 1 — 최신 백업 존재 확인
ls -la ~/workspace/backups/ | grep openproject-$(date +%Y%m%d) || echo "경고: 오늘 백업 없음 — 즉시 수동 백업 실행"

# Step 2 — 현재 실행 이미지 아카이브 보존
BACKUP_DATE=$(date +%Y%m%d)
docker save openproject-abyz-taxonomy:17.5.0-0.1.0 | \
  gzip > ~/workspace/backups/op-taxonomy-17.5.0-0.1.0-${BACKUP_DATE}.tar.gz
echo "이미지 아카이브 완료: op-taxonomy-17.5.0-0.1.0-${BACKUP_DATE}.tar.gz"

# Step 3 — 현재 실행 중인 이미지 기록
docker inspect openproject-stack-openproject-1 --format '{{.Config.Image}}' > \
  ~/workspace/backups/pre-deploy-image-${BACKUP_DATE}.txt
cat ~/workspace/backups/pre-deploy-image-${BACKUP_DATE}.txt

# Step 4 — 스택 중단
cd ~/workspace/openproject-stack
docker compose -p openproject-stack down

# Step 5 — .env 전환
echo "OP_IMAGE=openproject-abyz-taxonomy:17.5.0-0.1.0" > .env
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
# 1. 새 버전 custom image 빌드 (build.sh)
cd ~/workspace/work-github/abyz-lab-pm/custom-openproject
OP_VERSION=17.6.0 ABYZ_VERSION=0.1.0 ./build.sh
# 빌드 실패 시 → Section 6 (patch 실패 임시 운영) 참고

# 2. 새 이미지 staging 검증 완료 후 .env 전환
echo "OP_IMAGE=openproject-abyz-taxonomy:17.6.0-0.1.0" > ~/workspace/openproject-stack/.env

# 3. 이하 표준 배포 절차 (Section 2) 동일
```

---

## 6. OP 업그레이드 Patch 실패 시 임시 운영 (REQ-UPGRADE-007)

**[HARD] Patch 실패 상태에서 표준 `openproject/openproject` 이미지로 임시 전환 금지.**

이유: taxonomy 기능이 소실되면 n8n/Hermes(ra-request-to-op_v6)가 오작동한다.

| 상황 | 처리 |
|---|---|
| Patch 실패로 새 버전 custom image 빌드 불가 | **현재 버전 custom image 유지** — 새 표준 이미지 전환 금지 |
| 현재 버전 custom image 정상 동작 중 | 유지하면서 patch 수정 작업 진행 |
| Patch 수정 완료 후 | 새 버전으로 staging 재검증 → 배포 |

```bash
# 현재 실행 중인 custom image 버전 확인
docker inspect openproject-stack-openproject-1 --format '{{.Config.Image}}'
# 기대값: openproject-abyz-taxonomy:17.5.0-0.1.0 (또는 현재 버전)

# 현재 이미지 상태 확인
docker compose -p openproject-stack config | grep 'image:'
```

---

## 7. Migration Additive-Only 검증 (TC-080)

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

## 8. 이미지 보존 정책 (REQ-DEPLOY-003)

```bash
# 배포 전 현재 custom image 아카이브
docker save openproject-abyz-taxonomy:17.5.0-0.1.0 | \
  gzip > ~/workspace/backups/op-taxonomy-17.5.0-0.1.0-$(date +%Y%m%d).tar.gz

# 아카이브에서 복원 (필요 시)
docker load < ~/workspace/backups/op-taxonomy-17.5.0-0.1.0-YYYYMMDD.tar.gz

# 보관 목록 확인
ls -lh ~/workspace/backups/op-taxonomy-*.tar.gz
```

---

## 9. 변경 이력

| 날짜 | 버전 | 내용 |
|---|---|---|
| 2026-06-19 | 1.0.0 | 최초 작성. SPEC-OP-TAXONOMY-001 v0.2.0 배포 안전 설계 기반. |

---

*이 런북은 SPEC-OP-TAXONOMY-001 REQ-DEPLOY-006 요구사항에 의해 작성되었다.*  
*변경 시 SPEC v0.2.0 Section 5.5 내용과 일치 여부를 확인한다.*
