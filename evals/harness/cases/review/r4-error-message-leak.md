---
id: r4-error-message-leak
track: review
expect: violation
rule: error-message-leak
---

```ts
// src/app/api/analysis/start/route.ts (일부)
import { analyzeSpending } from "@/services/claude/analyzeSpending";

export async function POST(request: Request) {
  try {
    const { transactions } = await request.json();
    const result = await analyzeSpending(transactions);
    return Response.json(result, { status: 200 });
  } catch (err) {
    const e = err as Error;
    return Response.json({ error: e.message, detail: e.stack }, { status: 500 });
  }
}
```
