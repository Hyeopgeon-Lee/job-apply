# BigData Job Apply Apps Script 자동배포

`apply.k-bigdata.kr`의 Apps Script 백엔드는 GitHub 저장소의 `apps-script/`를 원본으로 관리합니다.

```text
GitHub main
  -> security regression tests
  -> appsscript.json 검증
  -> clasp push
  -> 기존 Web App deployment 재배포
```

## 필요한 GitHub Repository Secrets

저장소의 `Settings -> Secrets and variables -> Actions -> Repository secrets`에 다음 3개를 등록합니다.

| Secret | 값 |
|---|---|
| `GAS_SCRIPT_ID` | Job Apply Apps Script 프로젝트의 Script ID |
| `GAS_DEPLOYMENT_ID` | 현재 운영 Web App Deployment ID |
| `CLASP_CREDENTIALS_JSON` | `clasp login`으로 생성된 `.clasprc.json` 전체 JSON |

현재 프런트엔드가 사용하는 Web App URL은 다음 deployment를 가리킵니다.

```text
AKfycbzOm0CkN59LybvwRtMXRu0BmOxsPJloLwlPLHL5s_6NCSBeFxVvsH6Q6ObHmgwTrSuDLA
```

따라서 운영 URL을 유지하려면 위 값을 `GAS_DEPLOYMENT_ID`로 사용합니다.

## Script ID 확인

Windows 11 PowerShell에서 이미 clasp 로그인이 되어 있다면 다음으로 프로젝트 목록을 확인할 수 있습니다.

```powershell
clasp.cmd list
```

Job Apply 프로젝트에 해당하는 Script ID를 찾아 `GAS_SCRIPT_ID`에 등록합니다. Apps Script 편집기의 프로젝트 설정에서도 Script ID를 확인할 수 있습니다.

## CLASP_CREDENTIALS_JSON

READY 자동배포에 사용한 것과 같은 Google 계정이라면 동일한 clasp 인증 JSON을 재사용할 수 있습니다. 단, Secret은 저장소별이므로 `job-apply` 저장소에도 별도로 등록해야 합니다.

PowerShell에서 내용을 화면에 노출하지 않고 클립보드에 복사하려면:

```powershell
Get-Content -Raw "$HOME\.clasprc.json" | Set-Clipboard
```

이 값은 채팅이나 저장소 파일에 올리지 않고 GitHub Secret에만 저장합니다.

## 자동배포 동작

`apps-script/**`, `tests/**`, 또는 workflow가 main에서 변경되면 자동 실행됩니다.

1. `node --test tests/security.test.mjs`
2. Apps Script manifest JSON 검증
3. Google 인증 Secret 확인
4. `clasp push --force`
5. 기존 `GAS_DEPLOYMENT_ID`로 새 버전 재배포

Secret이 아직 없으면 테스트까지만 수행하고 실제 GAS 배포 단계는 안전하게 건너뜁니다.

자동배포 실패 시 현재 운영 중인 Web App은 마지막 성공 배포 버전을 계속 사용합니다.
