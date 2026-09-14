export type AnalysisStatus = "processing" | "completed" | "failed";

export type Category =
  | "식비"
  | "교통"
  | "카페/간식"
  | "쇼핑"
  | "문화/여가"
  | "의료/건강"
  | "주거/관리비"
  | "통신비"
  | "교육"
  | "여행"
  | "구독/금융"
  | "기타";

export interface AnalysisResult {
  summary: { totalAmount: number; periodStart: string; periodEnd: string };
  categoryBreakdown: {
    category: Category;
    amount: number;
    ratio: number;
    description: string;
  }[];
  anomalies: { relatedTransactions: string[]; reason: string; note: string }[];
  recommendations: { text: string; basis: string }[];
  generatedAt: string;
}
