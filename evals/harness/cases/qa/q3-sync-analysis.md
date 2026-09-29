---
id: q3-sync-analysis
track: qa
must:
  - 거래 추출부터 분석까지 하나의 동기 API 요청 안에서 끝내고 결과를 바로 반환한다
  - Route Handler의 maxDuration을 넉넉하게 설정하며 기준값은 300초다
  - Edge Function이나 별도 job 폴링 인프라를 추가하지 않는다
must_not:
  - 분석을 백그라운드 job과 폴링 방식으로 구현하라고 답한다
---

분석 처리는 어떤 구조로 구현해야 하나요? job 큐에 넣고 프론트에서 상태를 폴링하는 방식인가요?
