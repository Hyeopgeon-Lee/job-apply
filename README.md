# BigData Job Apply

한국폴리텍대학 서울강서캠퍼스 빅데이터소프트웨어공학과 학생들의 실제 입사지원을 간단히 기록하고 서로의 도전을 확인하는 모바일 우선 웹서비스입니다. 로그인 없이 현황을 보고 등록할 수 있으며, 삭제할 때만 학생별 4자리 PIN을 확인합니다.

구조: **GitHub Pages (HTML/CSS/Vanilla JS) → Google Apps Script Web App → Google Sheets**

## 파일 구조

```text
/
├─ index.html              # 메인 현황
├─ register.html           # 지원 등록
├─ css/style.css           # 모바일 우선 UI
├─ js/app.js               # 메인 화면 로직
├─ js/register.js          # 등록 화면 로직
├─ js/api.js               # Apps Script URL과 API 통신
├─ apps-script/Code.gs     # Apps Script 서버 코드
├─ CNAME                   # apply.k-bigdata.kr
└─ README.md
```

## 1. Google Sheet 준비

1. Google Drive에서 빈 스프레드시트를 만들고 주소의 `/d/`와 `/edit` 사이 값을 복사합니다. 이것이 `SPREADSHEET_ID`입니다.
2. 스프레드시트에서 **확장 프로그램 → Apps Script**를 엽니다.
3. 이 저장소의 `apps-script/Code.gs` 전체를 Apps Script 편집기의 `Code.gs`에 붙여 넣습니다.
4. 코드 첫 줄의 `SPREADSHEET_ID`를 복사한 ID로 바꿉니다.
5. Apps Script 프로젝트 설정에서 시간대를 **(GMT+09:00) 서울**로 지정합니다.
6. 상단 함수 선택에서 `setupSheets`를 골라 한 번 실행하고 권한을 승인합니다.

`setupSheets()`는 다음 시트와 헤더, 초기 학생 13명, 기본 설정을 자동 생성합니다.

### students

| student_id | name | pin | active |
|---|---|---|---|
| 2320110198 | 신동준 | 관리자가 입력 | TRUE |
| 2520110177 | 김동휘 | 관리자가 입력 | TRUE |
| ... | ... | ... | ... |

`pin` 열에 학생마다 서로 다른 **4자리 숫자**를 직접 입력하세요. 셀 서식을 일반 텍스트로 설정하면 `0123` 같은 PIN도 보존됩니다. PIN은 학생 본인에게 개별 전달하고 시트 공유 범위를 제한하세요. 비활성 학생은 `active`를 `FALSE`로 바꾸면 목록과 목표 계산에서 제외됩니다.

### applications

`application_id, student_id, company, position, site, job_url, applied_date, status, created_at, updated_at`

행은 절대로 자동 삭제하지 않습니다. 정상 데이터는 `ACTIVE`, 사용자가 삭제한 데이터는 `DELETED`가 되며 모든 통계는 `ACTIVE`만 집계합니다. 따라서 월이 바뀌어도 원본이 남아 `applied_date` 기준 주간·월간·학기·누적 통계를 확장할 수 있습니다.

### settings

| key | value |
|---|---|
| weekly_goal | 5 |
| semester | 2026-2 |

학과 목표는 `active 학생 수 × weekly_goal`로 매번 계산됩니다.

## 2. Apps Script 웹앱 배포

1. Apps Script 우측 상단 **배포 → 새 배포**를 누릅니다.
2. 유형은 **웹 앱**을 선택합니다.
3. 실행 사용자는 **나**, 액세스 사용자는 **모든 사용자**로 설정합니다.
4. 배포 후 `https://script.google.com/macros/s/.../exec` 형태의 웹앱 URL을 복사합니다.
5. `js/api.js` 첫 줄 `API_URL`의 값을 복사한 URL로 바꾸고 커밋/푸시합니다.

코드를 바꾼 뒤에는 **배포 → 배포 관리 → 수정 → 새 버전 → 배포**가 필요합니다. 단순 저장만 하면 기존 웹앱에 반영되지 않습니다.

## 3. GitHub Pages 활성화

1. GitHub 저장소 **Settings → Pages**로 이동합니다.
2. Build and deployment에서 **Deploy from a branch**를 선택합니다.
3. Branch를 `main`, 폴더를 `/(root)`로 선택하고 저장합니다.
4. 몇 분 뒤 GitHub가 제공하는 Pages 주소에서 화면을 확인합니다.

## 4. `apply.k-bigdata.kr` 연결

저장소의 `CNAME`에는 이미 `apply.k-bigdata.kr`이 들어 있습니다. 도메인의 DNS 관리 화면에서 다음 레코드를 추가합니다.

| 유형 | 호스트 | 값 |
|---|---|---|
| CNAME | apply | hyeopgeon-lee.github.io |

DNS 반영 뒤 GitHub **Settings → Pages → Custom domain**에 `apply.k-bigdata.kr`을 입력하고 DNS 확인이 끝나면 **Enforce HTTPS**를 켭니다. 기존에 같은 호스트의 A/AAAA/CNAME 레코드가 있다면 충돌하지 않게 정리해야 합니다.

## 5. 테스트

### 지원 등록

1. 메인 화면에서 **지원현황 등록하기**를 누릅니다.
2. 학생, 기업, 직무, 사이트, `https://`로 시작하는 URL, 지원일을 입력합니다.
3. 완료 화면의 주간 건수 변화를 확인합니다.
4. 같은 학생과 같은 URL로 다시 등록해 `이미 등록한 채용공고입니다.`가 나오는지 확인합니다.
5. Google Sheet `applications`에 `ACTIVE`, 생성/수정 시간이 저장됐는지 확인합니다.

### 삭제

1. 메인의 최근 지원에서 **삭제**를 누릅니다.
2. 틀린 PIN으로 거절되는지 확인한 뒤 해당 학생의 PIN으로 삭제합니다.
3. 항목과 통계에서 사라졌는지 확인합니다.
4. 시트 행은 남고 `status`만 `DELETED`, `updated_at`은 새 시간으로 바뀌었는지 확인합니다.
5. 삭제한 것과 같은 URL을 다시 등록할 수 있는지 확인합니다.

## 보안과 운영 참고

- PIN은 브라우저로 내려보내지 않으며 삭제 요청 때 Apps Script에서만 검증합니다.
- 등록·중복 검사·삭제는 서버에서 다시 검증하며 동시 요청은 Script Lock으로 보호합니다.
- URL은 `http://` 또는 `https://`만 허용합니다.
- 로그인 없는 공개 서비스이므로 등록 자체의 신원 인증은 하지 않습니다. 시트와 Apps Script 프로젝트의 편집 권한은 관리자만 보유하세요.
- Apps Script 할당량을 초과하면 일시적으로 요청이 실패할 수 있습니다.
