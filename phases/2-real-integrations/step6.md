# Step 6: dashboard-integration

## 배경

Step 3~5에서 업로드/분석/조회 라우트를 전부 실제 구현으로 교체했다. 실제 `/api/analysis/start`
는(step 4) mock과 달리 **요청 바디에 `jobId`가 필요하다** — 그런데 `dashboard/page.tsx`는
아직 phase 1 mock 계약(바디 없이 호출)대로 되어 있다. 이 step은 대시보드 화면을 새 계약에
맞게 연결하고, 로그아웃 버튼을 step 2에서 만든 `/api/auth/logout`에 실제로 연결한다.

**뷰 상태 머신(`DashboardView`)과 전체 레이아웃/CSS는 그대로 유지**한다 — 이 step은 "이미
있는 화면의 API 호출부만 새 계약에 맞게 고치는 것"이지 새 화면 상태를 설계/추가하는 게
아니다(phase 1의 `dashboard-integration`/`billing-integration` step들과 동일한 원칙).

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `phases/2-real-integrations/index.json`의 step 2/3/4 `summary` — `/api/auth/logout`의
  정확한 요청/응답 형태, `/api/upload` 응답(`UploadResponse` — 변경 없음),
  `/api/analysis/start`가 이제 요구하는 요청 바디 형태(`AnalysisStartRequestBody`,
  `{ jobId }`).
- `src/types/api.ts` — `UploadResponse`, `AnalysisStartRequestBody` 정확한 필드명.
- `src/app/dashboard/page.tsx`, `src/app/dashboard/page.module.css`,
  `src/app/dashboard/page.test.tsx` — 현재 구현 전체를 읽는다(아래 "작업" 절에서 언급하는
  함수/JSX의 정확한 현재 줄 번호는 이 파일을 직접 읽고 확인하라).

## 작업

`src/app/dashboard/page.tsx`를 아래 두 부분만 수정한다.

### 1. `handleStartAnalysis`: 업로드 응답의 `jobId`를 분석 시작 요청에 전달

현재 업로드 성공(`uploadResponse.status === 200`) 판정 이후 바로 `setView("analyzing")`으로
넘어가고, `/api/analysis/start`를 바디 없이 호출한다. 이를 아래처럼 바꾼다:

1. 업로드 응답이 200이면 `const uploadResult: UploadResponse = await uploadResponse.json();`로
   `jobId`를 얻는다(응답 파싱 자체가 실패하면 기존 업로드 실패 처리 경로로 보낸다 —
   `DEFAULT_UPLOAD_ERROR_MESSAGE`와 `"upload-error"` 뷰).
2. `setView("analyzing")` 이후, `/api/analysis/start`를
   `fetch("/api/analysis/start", { method: "POST", headers: { "Content-Type":
   "application/json" }, body: JSON.stringify({ jobId: uploadResult.jobId } satisfies
   AnalysisStartRequestBody) })`로 호출한다.
3. 이후 응답 처리 분기(200 → 결과 렌더 + `refreshUsage()`, 402 → `/billing`으로 이동, 그 외 →
   `body?.error` 메시지로 `"analysis-error"` 뷰)는 **그대로 유지**한다 — 서버가 이미
   402/409/404/500 등 어떤 status를 주든 기존 분기 로직이 그대로 처리할 수 있다(추가 분기
   불필요, 새 status 코드가 생겼다고 새 뷰를 만들지 않는다).

### 2. 로그아웃 버튼을 `/api/auth/logout`에 연결

현재 헤더의 `<Link href="/" className={...logoutLink...}>Log out</Link>`(그 위
`// TODO: replace with real Supabase Auth session invalidation` 주석 포함)를 실제 동작으로
바꾼다:

```ts
async function handleLogout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // 로그아웃 실패해도 사용자를 랜딩으로 보낸다 — 세션이 남아있어도 다음 보호 화면
    // 진입 시 미들웨어가 다시 걸러낸다.
  }
  router.push("/");
}
```

`Link`를 `<button type="button" onClick={handleLogout}>`로 바꾸고 기존
`styles.logoutLink`/`text-label-1-normal` 클래스는 그대로 유지한다. `page.module.css`의
`.logoutLink`가 `<a>` 전제로 작성돼 있어 버튼 기본 스타일(테두리/배경)이 새어 나오면, 그
클래스에 `border: none; background: none; cursor: pointer;` 정도만 최소 추가해 기존 모양을
유지한다(그 이상 스타일을 새로 디자인하지 않는다). 위 TODO 주석은 제거한다(이 작업으로
대체됐으므로).

## Acceptance Criteria

```bash
npm run build
npm run lint
npm test
```

`page.test.tsx`에 이미 있는 업로드→분석 성공 테스트를 `/api/analysis/start` 호출에 `jobId`가
포함된 바디로 가는지 검증하도록 갱신한다(`global.fetch` mock 호출 인자 확인). 로그아웃
버튼 클릭 시 `/api/auth/logout`이 POST로 호출되고 `router.push('/')`가 호출되는지 테스트를
하나 추가한다(`next/navigation`의 `useRouter` mock은 기존 테스트 파일에 이미 있다면 그
관례를 따른다).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - `DashboardView` 상태값(`"empty" | "file-selected" | ...`)이 늘어나지 않았는가?
   - `/api/analysis/start` 요청 바디에 `jobId`가 정확히 담기는가?
   - 402/409/기타 실패가 모두 기존 `"analysis-error"`/`/billing` 분기로 자연스럽게
     처리되는가(새 뷰를 추가하지 않았는가)?
3. 결과에 따라 `phases/2-real-integrations/index.json`의 step 6 항목을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 무엇을 바꿨는지 한 줄로 요약.
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`.
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단.

## 금지사항

- `DashboardView`에 새 상태를 추가하거나 기존 뷰의 레이아웃/CSS를 바꾸지 마라. 이유: 이
  step은 API 계약 변경에 맞춘 배선(wiring)만 하는 것이지 화면 재설계가 아니다.
- "Demo: simulate corrupted file", "Demo: preview analysis failure" 데모 버튼을 제거하지
  마라. 이유: phase 1에서 이미 "실제 백엔드로도 재현하기 번거로운 실패 상태를 수동으로
  미리보기 위한 용도"로 의도적으로 남겨둔 버튼들이다 — 계속 유지한다.
- `src/app/api/`, `src/lib/usage.ts`, `src/app/billing/`을 이 step에서 건드리지 마라. 이유:
  API 라우트는 이미 완성됐고(step 2~5), 결제 화면 연동은 별도 step(7) 범위다.
- 기존 테스트를 깨뜨리지 마라.
