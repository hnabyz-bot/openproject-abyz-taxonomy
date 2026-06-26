# [P1] INC-20260625 — 운영 OP 배포 중 secret_key_base 누락으로 인한 서비스 중단

**등급**: P1 (운영 서비스 완전 중단)  
**발생**: 2026-06-25 13:49 KST  
**복구**: 2026-06-25 14:10+ KST  
**다운타임**: 약 20분 이상  
**영향 범위**: `plm.abyz-lab.work` — OpenProject 전체 접근 불가 (Cloudflare 502)  
**사용자 보고**: Cloudflare Bad Gateway 오류 화면 직접 확인  

---

## 타임라인

| 시각 (KST) | 이벤트 |
|---|---|
| 13:49 | `docker compose -p openproject-stack down` 실행 — 운영 컨테이너 중단 |
| 13:50 | `.env`를 `OP_IMAGE=17.5.0-0.2.34` 단독으로 **덮어쓰기** (`echo ... > .env`) |
| 13:50 | `docker compose up -d` — `OPENPROJECT_SECRET_KEY_BASE` 미주입 상태로 기동 |
| 13:50~ | `db:migrate` 반복 실패: `ArgumentError: secret_key_base for production environment must be a type of String` |
| 13:50~ | Puma 웹 워커 미기동 → HTTP 502 지속 |
| 13:5x | 사용자가 `plm.abyz-lab.work` 접속 시도 → Cloudflare Bad Gateway 직접 확인 |
| 13:5x | 사용자가 이슈 보고: "실제 운영 OP에 문제여부를 한번더 점검해줘" |
| 14:00 | `OPENPROJECT_SECRET_KEY_BASE` 원인 특정. hermes 레퍼런스에서 실제 값 확인 |
| 14:03 | `.env`에 `OPENPROJECT_SECRET_KEY_BASE` 추가 후 `docker compose restart` (실패 — restart는 env 재로딩 불가) |
| 14:03 | `docker compose down && up` 재실행 |
| 14:10+ | HTTP 302 확인 — 서비스 복구 |

---

## 근본 원인 (Root Cause)

### 직접 원인
DEPLOY_RUNBOOK Step 5 절차:
```bash
echo "OP_IMAGE=openproject-abyz-taxonomy:17.5.0-0.2.34" > .env
```
이 명령이 `.env` 파일 전체를 덮어씌워 기존 `OPENPROJECT_SECRET_KEY_BASE` 값을 소거했다.

### 구조적 원인 (더 중요)

1. **`.env` 단독 관리 취약성**: 운영 스택의 필수 환경변수(`OPENPROJECT_SECRET_KEY_BASE`)가 `.env`에 명시적으로 존재하지 않았다. 기존 0.2.32 컨테이너가 최초 기동 시 올바른 값으로 실행된 이후 **컨테이너가 장기간 재생성 없이 유지**되어 왔기 때문에, 현재 `.env`에 SECRET_KEY_BASE가 없어도 동작하는 것처럼 보였다.

2. **배포 전 `.env` 완전성 검증 절차 부재**: DEPLOY_RUNBOOK의 전제조건 체크리스트(Section 0)에 `.env` 필수 변수 존재 여부 확인 항목이 없었다.

3. **`docker compose down`의 파괴성 과소평가**: `down` 명령은 컨테이너를 제거한다. 이후 `up`은 현재 `.env`를 새로 읽는다. 장기 운영 컨테이너를 처음 재생성할 때 `.env` 완전성이 검증되지 않으면 이 사태가 반복된다.

4. **`docker compose restart`의 한계 무지**: `restart`는 `.env` 변경을 반영하지 않는다. 이를 모르고 `restart`를 먼저 시도해 복구 시간이 추가로 증가했다.

5. **헬스 체크가 컨테이너 상태(running)에만 의존**: 컨테이너는 `running` 상태였지만 HTTP는 502였다. 컨테이너 status 확인만으로는 서비스 정상 여부를 판단할 수 없다.

---

## 만약 사용자가 직접 확인하지 않았다면

- `supervisord`는 계속 실행 상태 (`docker ps` = running)
- `db:migrate`는 반복 실패하지만 supervisord는 재시작을 반복하지 않음
- Puma 웹 워커는 영구적으로 미기동
- HTTP 502 상태 **무기한 지속**
- 모니터링이 컨테이너 status만 확인하는 경우 **Alert 미발생**
- 복구 시점: 사용자 또는 운영자가 `plm.abyz-lab.work` 접속 시도 시까지 — **수 시간 ~ 수 일 가능**

---

## 재발 방지 조치

### 즉시 조치 (이 커밋)

1. **`.env` 필수 변수 명시화**: `OPENPROJECT_SECRET_KEY_BASE`를 `.env`에 영구 포함
2. **DEPLOY_RUNBOOK Section 0 강화**: `.env` 완전성 검증을 전제조건 체크리스트에 추가
3. **DEPLOY_RUNBOOK Step 5 수정**: `>` (덮어쓰기) → `sed` 또는 변수별 명시 작성
4. **DEPLOY_RUNBOOK Step 7 강화**: HTTP 상태 코드 실제 확인 명시 (컨테이너 status만으로 불충분)
5. **`docker compose restart` 주의사항 추가**: env 변경 시 반드시 `down && up` 사용

### 중기 조치 (별도 작업)

- [ ] Hermes/n8n 기반 HTTP 502 알림 구성 (컨테이너 status가 아닌 실제 HTTP 확인)
- [ ] 배포 전 `.env` diff 출력 + 사용자 확인 단계 추가
- [ ] `.env.template` 파일 관리: 필수 변수 목록을 소스에 명시

---

## 교훈

> **컨테이너가 `running`이어도 서비스는 다운일 수 있다.**  
> 배포 성공 기준은 HTTP 응답 코드다. 컨테이너 상태가 아니다.

> **`.env` 파일은 누적 작성이 원칙이다.**  
> `echo "KEY=VALUE" > .env`는 기존 내용을 전부 파괴한다.  
> 단일 변수 업데이트는 `sed -i` 또는 별도 라인 추가 방식을 사용한다.

> **장기 운영 컨테이너 재생성 시 환경변수 재검증이 필수다.**  
> "잘 돌아가고 있었으니 괜찮겠지"는 가장 위험한 가정이다.
