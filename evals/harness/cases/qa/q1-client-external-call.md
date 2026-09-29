---
id: q1-client-external-call
track: qa
must:
  - 외부 서비스(Supabase/Claude/Polar) 호출은 src/app/api/ 라우트 핸들러 또는 그 안에서 부르는 src/services/ 래퍼에서만 한다
  - 클라이언트 컴포넌트에서는 외부 서비스 SDK를 직접 호출하지 않는다
must_not:
  - 클라이언트 컴포넌트에서 SDK를 직접 호출해도 된다고 답한다
---

업로드 화면(클라이언트 컴포넌트)에서 Supabase Storage에 바로 올리는 게 제일 간단할 것 같은데, 그렇게 해도 되나요?
