import type Anthropic from "@anthropic-ai/sdk";
import type { AnalysisResult, Category } from "@/types/analysis";
import type { ExtractedTransaction } from "./extractTransactions";

const CATEGORIES: readonly Category[] = [
  "식비",
  "교통",
  "카페/간식",
  "쇼핑",
  "문화/여가",
  "의료/건강",
  "주거/관리비",
  "통신비",
  "교육",
  "여행",
  "구독/금융",
  "기타",
];

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

const ANALYSIS_INSTRUCTIONS = `당신은 카드 거래 내역을 분석해 소비 인사이트를 생성하는 도구입니다.
주어진 거래 내역(JSON 배열, 각 항목은 date/merchant/amount/transactionType)을 분석해 아래 JSON 형태로만 응답하세요.

{
  "summary": { "totalAmount": 전체 지출 합계(정수), "periodStart": "YYYY-MM-DD", "periodEnd": "YYYY-MM-DD" },
  "categoryBreakdown": [
    { "category": "다음 12개 중 하나 — 식비/교통/카페/간식/쇼핑/문화/여가/의료/건강/주거/관리비/통신비/교육/여행/구독/금융/기타", "amount": 카테고리 합계, "ratio": 전체 대비 비중(0~1), "description": "이해하기 쉬운 한국어 설명" }
  ],
  "anomalies": [
    { "relatedTransactions": ["관련 거래 설명"], "reason": "이상 판단 근거", "note": "주의 수준/관리 필요성 설명" }
  ],
  "recommendations": [
    { "text": "실행 가능한 절약/관리 추천 문장", "basis": "근거가 된 지출 패턴" }
  ]
}

규칙:
- category는 반드시 위 12개 중 하나만 사용하세요. 그 외 값은 절대 쓰지 마세요.
- 이상 지출이 없으면 anomalies는 빈 배열로 두세요.
- recommendations는 최소 1개 이상 포함하세요.
- 다른 설명이나 마크다운 없이 JSON 객체만 출력하세요.`;

export type AnalysisPayload = Omit<AnalysisResult, "generatedAt">;

function extractResponseText(response: Anthropic.Message): string {
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("소비 분석 응답에 텍스트 블록이 없습니다");
  }
  return textBlock.text;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

function parseAnalysisResponse(text: string): AnalysisPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    throw new Error("소비 분석 응답 파싱에 실패했습니다");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("소비 분석 응답 형식이 올바르지 않습니다");
  }
  const record = parsed as Record<string, unknown>;

  const summary = record.summary as Record<string, unknown> | undefined;
  if (
    !summary ||
    typeof summary.totalAmount !== "number" ||
    typeof summary.periodStart !== "string" ||
    typeof summary.periodEnd !== "string"
  ) {
    throw new Error("소비 분석 응답의 summary 형식이 올바르지 않습니다");
  }

  const rawCategoryBreakdown = Array.isArray(record.categoryBreakdown) ? record.categoryBreakdown : [];
  const categoryBreakdown = rawCategoryBreakdown.map((item) => {
    const entry = item as Record<string, unknown>;
    if (
      typeof entry.amount !== "number" ||
      typeof entry.ratio !== "number" ||
      typeof entry.description !== "string"
    ) {
      throw new Error("소비 분석 응답의 categoryBreakdown 형식이 올바르지 않습니다");
    }
    return {
      category: isCategory(entry.category) ? entry.category : ("기타" as Category),
      amount: entry.amount,
      ratio: entry.ratio,
      description: entry.description,
    };
  });

  const rawAnomalies = Array.isArray(record.anomalies) ? record.anomalies : [];
  const anomalies = rawAnomalies.map((item) => {
    const entry = item as Record<string, unknown>;
    if (
      !Array.isArray(entry.relatedTransactions) ||
      typeof entry.reason !== "string" ||
      typeof entry.note !== "string"
    ) {
      throw new Error("소비 분석 응답의 anomalies 형식이 올바르지 않습니다");
    }
    return {
      relatedTransactions: entry.relatedTransactions as string[],
      reason: entry.reason,
      note: entry.note,
    };
  });

  const rawRecommendations = Array.isArray(record.recommendations) ? record.recommendations : [];
  const recommendations = rawRecommendations.map((item) => {
    const entry = item as Record<string, unknown>;
    if (typeof entry.text !== "string" || typeof entry.basis !== "string") {
      throw new Error("소비 분석 응답의 recommendations 형식이 올바르지 않습니다");
    }
    return { text: entry.text, basis: entry.basis };
  });

  return {
    summary: {
      totalAmount: summary.totalAmount,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
    },
    categoryBreakdown,
    anomalies,
    recommendations,
  };
}

export async function analyzeSpending(params: {
  client: Anthropic;
  transactions: ExtractedTransaction[];
}): Promise<AnalysisPayload> {
  const { client, transactions } = params;

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: `${ANALYSIS_INSTRUCTIONS}\n\n거래 내역(JSON):\n${JSON.stringify(transactions)}`,
      },
    ],
  });

  return parseAnalysisResponse(extractResponseText(response));
}
