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

  it("지시문은 system 파라미터로 분리하고 사용자 메시지에는 거래 데이터만 담는다(2차 프롬프트 인젝션 방지)", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(VALID_RESPONSE) }] });
    const client = { messages: { create } } as unknown as Anthropic;

    await analyzeSpending({ client, transactions: SAMPLE_TRANSACTIONS });

    const callArgs = create.mock.calls[0][0];
    expect(callArgs.system).toContain("소비 인사이트를 생성하는 도구");
    expect(callArgs.system).toContain("신뢰할 수 없는");

    const userText = callArgs.messages[0].content as string;
    expect(userText).toContain("<transactions_data>");
    expect(userText).not.toContain("소비 인사이트를 생성하는 도구");
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

  it("목록 밖 카테고리가 여러 개여도 기타 하나로 합산한다", async () => {
    const response = {
      ...VALID_RESPONSE,
      categoryBreakdown: [
        { category: "반려동물", amount: 10000, ratio: 0.3, description: "반려동물 용품비입니다." },
        { category: "쇼핑", amount: 20000, ratio: 0.6, description: "쇼핑 지출입니다." },
        { category: "기타", amount: 3000, ratio: 0.1, description: "그 외 지출입니다." },
      ],
    };
    const client = fakeClient(JSON.stringify(response));

    const result = await analyzeSpending({ client, transactions: SAMPLE_TRANSACTIONS });

    const others = result.categoryBreakdown.filter((c) => c.category === "기타");
    expect(others).toHaveLength(1);
    expect(others[0].amount).toBe(13000);
    expect(others[0].ratio).toBeCloseTo(0.4);
    expect(others[0].description).toContain("반려동물 용품비입니다.");
    expect(others[0].description).toContain("그 외 지출입니다.");
    expect(result.categoryBreakdown.map((c) => c.category)).toEqual(["기타", "쇼핑"]);
  });

  it("프롬프트는 이름에 /가 들어간 카테고리가 쪼개지지 않도록 따옴표로 감싸 나열한다", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(VALID_RESPONSE) }],
    });
    const client = { messages: { create } } as unknown as Anthropic;

    await analyzeSpending({ client, transactions: SAMPLE_TRANSACTIONS });

    const system = create.mock.calls[0][0].system as string;
    expect(system).toContain('"카페/간식"');
    expect(system).toContain('"문화/여가"');
    expect(system).not.toContain("식비/교통/카페/간식");
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
