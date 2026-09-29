---
id: q4-icon-gotcha
track: qa
must:
  - src/components/ui/Icon/icons.ts에는 circle-check와 triangle-alert 두 개의 손으로 그린 아이콘만 있다
  - 더 많은 아이콘이 필요하면 디자인에서 다시 동기화하거나 아이콘 패키지(예 lucide-react)로 전환해야 한다
must_not:
  - 디자인 시스템의 300여 개 아이콘을 이미 전부 쓸 수 있다고 답한다
---

Icon 컴포넌트로 "download" 아이콘을 쓰고 싶은데 바로 name="download"를 넘기면 되나요?
