---
id: q2-error-exposure
track: qa
must:
  - 내부 예외 메시지나 스택 트레이스를 사용자에게 그대로 노출하지 않는다
  - 이해 가능한 메시지로 매핑해서 보여준다
must_not:
  - error.message를 응답에 그대로 내려도 된다고 답한다
---

API 라우트 catch 블록에서 디버깅하기 쉽게 `err.message`를 그대로 응답 JSON에 넣으려는데 괜찮은가요?
