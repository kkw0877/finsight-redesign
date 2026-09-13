import type { AnalysisResult } from "@/types/analysis";

export const MOCK_ANALYSIS_RESULT: AnalysisResult = {
  summary: { totalAmount: 1847600, periodStart: "2026-08-01", periodEnd: "2026-08-31" },
  categoryBreakdown: [
    {
      category: "식비",
      amount: 612400,
      ratio: 0.33,
      description: "식비 지출이 전체의 33%로 가장 큰 비중을 차지합니다.",
    },
    {
      category: "쇼핑",
      amount: 398200,
      ratio: 0.22,
      description: "온라인 쇼핑 위주로 지난달 대비 지출이 늘었습니다.",
    },
    {
      category: "기타",
      amount: 364800,
      ratio: 0.19,
      description: "분류하기 어려운 소액 결제가 다수 포함되어 있습니다.",
    },
    {
      category: "문화/여가",
      amount: 231000,
      ratio: 0.13,
      description: "영화, 공연 등 여가 활동에 대한 지출입니다.",
    },
    {
      category: "교통",
      amount: 156300,
      ratio: 0.08,
      description: "대중교통 및 택시 이용료입니다.",
    },
    {
      category: "구독/금융",
      amount: 84900,
      ratio: 0.05,
      description: "여러 구독 서비스 결제가 겹쳐 있습니다.",
    },
  ],
  anomalies: [
    {
      relatedTransactions: ["Netflix", "Watcha", "Disney+"],
      reason: "3개의 스트리밍 구독이 동시에 결제되고 있습니다.",
      note: "구독료로만 월 ₩84,900이 지출되고 있습니다.",
    },
    {
      relatedTransactions: ["8/14 쇼핑 ₩79,000", "8/22 쇼핑 ₩132,000"],
      reason: "온라인 쇼핑 지출이 지난달 대비 47% 증가했습니다.",
      note: "두 건의 결제가 이번 달 증가분의 대부분을 차지합니다.",
    },
  ],
  recommendations: [
    {
      text: "중복되는 스트리밍 구독 1개를 해지하면 월 최대 ₩17,000을 절약할 수 있습니다.",
      basis: "Watcha와 Disney+의 콘텐츠가 겹칩니다.",
    },
    {
      text: "월 ₩300,000 쇼핑 예산을 설정해 보세요.",
      basis: "이번 달 쇼핑 지출이 평소보다 47% 높았습니다.",
    },
  ],
  generatedAt: new Date().toISOString(),
};

let latestResult: AnalysisResult | null = null;
let processing = false;

export function getLatestResult(): AnalysisResult | null {
  return latestResult;
}

export function setLatestResult(result: AnalysisResult): void {
  latestResult = result;
}

export function isProcessing(): boolean {
  return processing;
}

export function startProcessing(): void {
  processing = true;
}

export function finishProcessing(): void {
  processing = false;
}

export function __resetForTest(): void {
  latestResult = null;
  processing = false;
}
