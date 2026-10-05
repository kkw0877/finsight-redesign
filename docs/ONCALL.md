# oncall 1차 방어선 — 설정 런북 (ADR-018)

흐름: PostHog alert → `POST /api/webhooks/posthog`(시크릿 검증·멱등·dispatch) → `Oncall Alert Triage` 워크플로우(판정·분석) → 신호면 GitHub Issue.

## 1. 시크릿/변수 (아직 설정 안 됨)
| 위치 | 이름 | 용도 |
|---|---|---|
| Vercel env | `POSTHOG_ALERT_WEBHOOK_SECRET` | 임의의 긴 랜덤 값. PostHog destination 헤더와 동일 |
| Vercel env | `GITHUB_DISPATCH_TOKEN` | fine-grained PAT, 이 레포 한정, **Contents: write**(repository_dispatch 요구) 외 권한 없음 |
| Vercel env | `ONCALL_GITHUB_REPO` | `kkw0877/finsight-redesign` |
| GitHub secret | `POSTHOG_PERSONAL_API_KEY` | 읽기 전용(query:read) 개인 API 키 — 없으면 통계 없이 동작(확신도↓) |
| GitHub var | `POSTHOG_PROJECT_ID`, `POSTHOG_HOST`, `ONCALL_ASSIGNEE` | 앱이 쓰는 PostHog 프로젝트(MCP와 다를 수 있음 — UI에서 확인), 호스트, 깨울 사람(기본: 레포 owner) |

## 2. PostHog alert destination (Webhook, 트리거 3개 각각)
`$error_tracking_issue_created`, `$error_tracking_issue_reopened`, `$error_tracking_issue_spiking` 각각에 Webhook destination:
- URL: `https://<prod 도메인>/api/webhooks/posthog`, POST
- Header: `Authorization: Bearer <POSTHOG_ALERT_WEBHOOK_SECRET>`
- Body(JSON): 
```json
{"event_id":"{event.uuid}","event":"{event.event}","issue_id":"{event.distinct_id}",
 "name":"{event.properties.name}","description":"{event.properties.description}",
 "fingerprint":"{event.properties.fingerprint}","timestamp":"{event.properties.exception_timestamp}",
 "current_bucket_value":"{event.properties.current_bucket_value}","computed_baseline":"{event.properties.computed_baseline}"}
```
템플릿 치환 문법은 PostHog UI의 Test 발사로 확인할 것. `_spiking`은 프로젝트의 spike detection 설정이 켜져 있어야 발화한다.

## 3. 검증
- 웹훅: 잘못된 시크릿 → 401, 같은 `event_id` 2회 → 두 번째는 `duplicate`.
- CI: Actions → Oncall Alert Triage → Run workflow에 alert JSON 입력(`{"event":"$error_tracking_issue_spiking","issueId":"test-1","name":"Test","description":"","fingerprint":null,"timestamp":null,"currentBucketValue":40,"computedBaseline":2,"url":null}`) → 이슈 생성 확인, 같은 JSON 재실행 → 코멘트로 dedup 확인.
- 노이즈 기준은 `.claude/skills/oncall-triage/SKILL.md`. 사람이 "노이즈였다"고 닫은 패턴은 거기에 추가한다.
