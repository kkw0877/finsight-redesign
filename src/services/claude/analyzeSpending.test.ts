import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { analyzeSpending } from "./analyzeSpending";
import type { ExtractedTransaction } from "./extractTransactions";

function fakeClient(responseText: string): Anthropic {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: responseText }],
  });
  return { messages: { create } } as unknown as Anthropic;
}

const SAMPLE_TRANSACTIONS: ExtractedTransaction[] = [
  { date: "2026-08-01", merchant: "스타벅스", amount: 4500, transactionType: "일시불" },
  { date: "2026-08-02", merchant: "쿠팡", amount: 32000, transactionType: "일시불" },
];

const VALID_RESPONSE = {
  summary: { totalAmount: 36500, periodStart: "2026-08-01", periodEnd: "2026-08-02" },
  categoryBreakdown: [
    { category: "카페/간식", amount: 4500, ratio: 0.12, description: "카페 지출입니다." },
    { category: "쇼핑", amount: 32000, ratio: 0.88, description: "쇼핑 지출입니다." },
  ],
  anomalies: [],
  recommendations: [{ text: "쇼핑 예산을 설정해 보세요.", basis: "쇼핑 비중이 높습니다." }],
};

describe("analyzeSpending", () => {
  it("정상 응답을 AnalysisResult 형태(생성 시각 제외)로 반환한다", async () => {
    const client = fakeClient(JSON.stringify(VALID_RESPONSE));

    const result = await analyzeSpending({ client, transactions: SAMPLE_TRANSACTIONS });

    expect(result.summary).toEqual(VALID_RESPONSE.summary);
    expect(result.categoryBreakdown).toEqual(VALID_RESPONSE.categoryBreakdown);
    expect(result.anomalies).toEqual([]);
    expect(result.recommendations).toEqual(VALID_RESPONSE.recommendations);
    expect(result).not.toHaveProperty("generatedAt");
  });

  it("거래 내역을 프롬프트에 포함시켜 요청한다", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(VALID_RESPONSE) }] });
    const client = { messages: { create } } as unknown as Anthropic;

    await analyzeSpending({ client, transactions: SAMPLE_TRANSACTIONS });

    const callArgs = create.mock.calls[0][0];
    const text = callArgs.messages[0].content as string;
    expect(text).toContain("스타벅스");
    expect(text).toContain("쿠팡");
  });

  it("고정 12개 밖의 카테고리는 기타로 귀속시킨다", async () => {
    const response = {
      ...VALID_RESPONSE,
      categoryBreakdown: [
        { category: "반려동물", amount: 10000, ratio: 1, description: "반려동물 용품비입니다." },
      ],
    };
    const client = fakeClient(JSON.stringify(response));

    const result = await analyzeSpending({ client, transactions: SAMPLE_TRANSACTIONS });

    expect(result.categoryBreakdown[0].category).toBe("기타");
  });

  it("응답이 코드펜스로 감싸져 있어도 파싱한다", async () => {
    const client = fakeClient("```json\n" + JSON.stringify(VALID_RESPONSE) + "\n```");

    const result = await analyzeSpending({ client, transactions: SAMPLE_TRANSACTIONS });

    expect(result.summary.totalAmount).toBe(36500);
  });

  it("JSON으로 파싱할 수 없는 응답이면 에러를 던진다", async () => {
    const client = fakeClient("이건 JSON이 아닙니다");

    await expect(analyzeSpending({ client, transactions: SAMPLE_TRANSACTIONS })).rejects.toThrow();
  });

  it("summary 필드가 없으면 에러를 던진다", async () => {
    const client = fakeClient(JSON.stringify({ categoryBreakdown: [], anomalies: [], recommendations: [] }));

    await expect(analyzeSpending({ client, transactions: SAMPLE_TRANSACTIONS })).rejects.toThrow();
  });
});
