# BigData Job Apply

한국폴리텍대학 서울강서캠퍼스 빅데이터소프트웨어공학과 학생들의 실제 입사지원을 기록하고 주간 지원 현황을 확인하는 내부 웹서비스입니다. 지원 현황 대시보드는 로그인 없이 확인할 수 있고, 지원 등록·삭제 같은 변경 작업에서만 학번+4자리 PIN으로 본인을 확인합니다.

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
4. Apps Script **프로젝트 설정 → 스크립트 속성**에 `SPREADSHEET_ID`와 `PIN_SALT`를 저장합니다. `PIN_SALT`는 32바이트 이상 임의 문자열을 사용하세요.
5. Apps Script 프로젝트 설정에서 시간대를 **(GMT+09:00) 서울**로 지정합니다.
6. 상단 함수 선택에서 `setupSheets`를 골라 한 번 실행하고 권한을 승인합니다.

`setupSheets()`는 다음 시트와 헤더, 기본 설정을 생성합니다. 학생 명단은 저장소에 넣지 않고 운영 Google Sheet의 `students` 시트에서 직접 관리합니다.

### students

| student_id | name | pin | active |
|---|---|---|---|


`pin` 열에 학생마다 서로 다른 **4자리 숫자**를 입력한 뒤 `migrateStudentPins()`를 한 번 실행해 salted SHA-256 해시로 전환합니다. 마이그레이션 전의 4자리 평문도 임시 호환하지만 운영 전에는 반드시 해시 전환을 완료하세요. 비활성 학생은 `active`를 `FALSE`로 바꾸면 목록과 목표 계산에서 제외됩니다.

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

### 공개 대시보드 전환 배포 순서

지원 현황 조회는 공개이고 등록·삭제만 PIN 인증을 사용하므로, **Apps Script를 먼저 새 버전으로 배포한 뒤 GitHub Pages를 확인**해야 합니다.

1. Script Properties에 `SPREADSHEET_ID`, `PIN_SALT`를 설정합니다.
2. 저장소의 최신 `apps-script/Code.gs`를 Apps Script에 반영합니다.
3. **배포 → 배포 관리 → 수정 → 새 버전 → 배포**로 기존 Web App URL을 새 버전으로 갱신합니다.
4. 대시보드가 로그인 없이 열리는지 확인합니다.
5. 지원 등록과 삭제 시 학번+4자리 PIN 검증이 정상 동작하는지 확인합니다.

## Apps Script 자동배포

GitHub의 `apps-script/`를 Apps Script 원본 소스로 사용하며, GAS 관련 변경이 `main`에 반영되면 GitHub Actions가 테스트 후 clasp로 기존 Web App 배포를 갱신할 수 있습니다.

최초 1회 GitHub Actions Secret 3개 설정이 필요합니다. 자세한 절차는 [GAS_AUTO_DEPLOY](docs/GAS_AUTO_DEPLOY.md)를 참고합니다.

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
3. 등록 화면에서 학번과 4자리 PIN을 입력해 본인 확인 후 등록되는지 확인합니다.
4. 완료 화면의 주간 건수 변화를 확인합니다.
5. 같은 학생과 같은 URL로 다시 등록해 `이미 등록한 채용공고입니다.`가 나오는지 확인합니다.
6. Google Sheet `applications`에 `ACTIVE`, 생성/수정 시간이 저장됐는지 확인합니다.

### 조회·등록·삭제

1. 메인 지원 현황이 로그인 없이 표시되는지 확인합니다.
2. 잘못된 학번/PIN으로 지원 등록이 거절되는지 확인합니다.
3. 삭제 시 본인 학번/PIN이 맞지 않으면 거절되는지 확인합니다.
4. 다른 학생의 application ID를 임의로 요청해도 서버에서 거절되는지 확인합니다.
5. 본인 지원내역 삭제 후 항목과 통계에서 사라졌는지 확인합니다.
6. 시트 행은 남고 `status`만 `DELETED`, `updated_at`은 새 시간으로 바뀌었는지 확인합니다.

## 보안과 운영 참고

- 지원 현황 대시보드는 로그인 없이 조회할 수 있습니다.
- 학번+PIN 검증은 Apps Script에서 수행하며 PIN은 저장된 해시와 비교합니다.
- 지원 등록과 삭제는 매 요청마다 학번+PIN을 검증합니다.
- 등록 시 학생 ID는 인증에 성공한 학생 정보와 일치해야 합니다.
- 삭제는 인증한 학생 본인의 지원 건만 허용합니다.
- `noindex`와 `robots.txt`는 검색 노출 억제용이며 인증 기능을 대신하지 않습니다.
- URL은 `http://` 또는 `https://`만 허용하고, 등록·삭제는 Script Lock으로 보호합니다.
- Apps Script 할당량을 초과하면 일시적으로 요청이 실패할 수 있습니다.

## 취업지원 일일 이메일

`apps-script/DailyReport.gs`는 같은 Google Sheet를 직접 집계하여 월요일~금요일 오전 8시 전후에 담당자에게 HTML 현황 메일을 보냅니다. 외부 API나 AI 서비스는 사용하지 않으며 `ACTIVE` 지원과 `active=TRUE` 학생만 집계합니다. 주간 실적은 `applied_date`, 전일 신규 등록은 `created_at` 기준입니다.

Apps Script 편집기에서 새 스크립트 파일 `DailyReport.gs`를 만들고 저장소의 동명 파일 전체를 붙여 넣습니다. 다음으로 `setupDailyReportSettings()`를 한 번 실행하면 `settings` 시트에 아래 항목이 추가됩니다.

| key | value |
|---|---|
| report_enabled | TRUE |
| report_email | 담당 교수 이메일 주소 |
| report_subject_prefix | 취업지원현황 |

메일 주소는 코드에 넣지 말고 `report_email` 셀에 입력합니다. `report_enabled`가 `FALSE`이거나 이메일이 비어 있으면 자동 발송하지 않고 실행 로그에 이유를 남깁니다.

### 테스트 메일과 권한 승인

1. `report_email`을 입력합니다.
2. Apps Script에서 `sendWeekdayReportTest()`를 실행하면 월~목 템플릿을 즉시 발송합니다.
3. `sendFridayReportTest()`를 실행하면 금요일 최종점검 템플릿을 즉시 발송합니다.
4. `sendDailyJobReportTest()`는 현재 요일에 맞는 템플릿을 발송합니다.
5. 최초 실행 시 Google 계정의 메일 발송 권한 요청을 검토하고 허용합니다.

테스트 제목에는 `[TEST]`가 붙으며 같은 날에도 반복 실행할 수 있습니다. 운영 메일은 `PropertiesService`의 `LAST_DAILY_REPORT_DATE`로 같은 날짜의 중복 발송을 방지합니다.

### 평일 오전 자동 발송

Apps Script에서 `createDailyReportTrigger()`를 최초 한 번 실행하고 트리거 생성 권한을 승인합니다. 기존 동일 트리거를 제거한 뒤 하나만 생성하므로 중복 트리거가 생기지 않습니다. 트리거는 매일 실행되지만 `sendDailyJobReport()`가 토요일과 일요일에는 즉시 종료합니다.

Google Apps Script 시간 기반 트리거는 일반 cron과 달리 정확한 `08:00:00`을 보장하지 않으며 **Asia/Seoul 오전 8시 전후**에 실행됩니다. 트리거를 제거하려면 `deleteDailyReportTriggers()`를 실행합니다.

월~목 메일은 진행관리용으로 관리 필요 학생, 전일 신규 등록, 전체 학생 주간 현황을 보여줍니다. 금요일 메일은 면담·독려 우선 학생을 강조하고 목표 달성 학생과 주간 요약을 함께 제공합니다.

수신 주소를 변경하려면 `settings` 시트의 `report_email`만 수정합니다. 메일 기능은 기존 웹 API와 독립적이므로 발송 실패가 지원 등록에 영향을 주지 않습니다. `DailyReport.gs`를 추가하는 작업만으로는 웹앱 URL이 바뀌지 않으며, 기존 API 코드까지 변경하지 않았다면 웹앱 재배포는 필수가 아닙니다.
