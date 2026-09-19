export interface UploadResponse {
  jobId: string;
  fileName: string;
}

export interface AnalysisStartRequestBody {
  jobId: string;
}

export interface AnalysisStartResponseError {
  error: string; // 사용자에게 보여줄 이해 가능한 메시지 (내부 예외 노출 금지, CLAUDE.md CRITICAL 규칙)
}

export interface CheckoutRequestBody {
  simulateFailure?: boolean; // 테스트 전용 훅: true면 결제 실패를 흉내낸다. 실제 Polar에는 없는 개념.
}

export interface CheckoutStartResponse {
  checkoutUrl: string;
}

export interface CancelResponse {
  subscriptionStatus: "cancel_scheduled";
  currentPeriodEnd: string; // 혜택이 유지되는 종료 예정일
}
