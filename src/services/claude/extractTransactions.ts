import type Anthropic from "@anthropic-ai/sdk";

/**
 * ADR-004: 거래일/가맹점명/금액/거래 유형만 담는다 — 카드번호·계좌번호 등 결제수단
 * 식별자는 절대 포함하지 않는다(데이터 최소화).
 */
export interface ExtractedTransaction {
  date: string;
  merchant: string;
  amount: number;
  transactionType: string;
}

const EXTRACTION_INSTRUCTIONS = `당신은 카드 내역서에서 거래 내역을 추출하는 도구입니다.
첨부된 카드 내역서(텍스트 또는 이미지)에서 실제 거래만 추출하세요.

각 거래는 다음 형태의 객체입니다:
{ "date": "YYYY-MM-DD", "merchant": "가맹점명", "amount": 금액(원, 양의 정수), "transactionType": "거래 유형(예: 일시불, 할부, 취소 등)" }

규칙:
- 카드번호, 계좌번호 등 결제수단을 식별할 수 있는 정보는 절대 추출하지 마세요.
- 거래로 볼 수 있는 항목이 없으면 빈 배열 []을 반환하세요.
- 다른 설명이나 마크다운 없이 JSON 배열만 출력하세요.`;

function decodeCsvText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

function extractResponseText(response: Anthropic.Message): string {
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("거래 내역 추출 응답에 텍스트 블록이 없습니다");
  }
  return textBlock.text;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

function isValidTransaction(value: unknown): value is ExtractedTransaction {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.date === "string" &&
    typeof record.merchant === "string" &&
    typeof record.amount === "number" &&
    typeof record.transactionType === "string"
  );
}

function parseTransactionsResponse(text: string): ExtractedTransaction[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    throw new Error("거래 내역 추출 응답 파싱에 실패했습니다");
  }
  if (!Array.isArray(parsed) || !parsed.every(isValidTransaction)) {
    throw new Error("거래 내역 추출 응답 형식이 올바르지 않습니다");
  }
  return parsed.map(({ date, merchant, amount, transactionType }) => ({
    date,
    merchant,
    amount,
    transactionType,
  }));
}

export async function extractTransactions(params: {
  client: Anthropic;
  signedUrl: string;
  fileType: "csv" | "pdf";
}): Promise<ExtractedTransaction[]> {
  const { client, signedUrl, fileType } = params;

  const fileResponse = await fetch(signedUrl);
  if (!fileResponse.ok) {
    throw new Error("업로드된 파일을 가져오지 못했습니다");
  }
  const arrayBuffer = await fileResponse.arrayBuffer();

  const content: Anthropic.MessageParam["content"] =
    fileType === "pdf"
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: Buffer.from(arrayBuffer).toString("base64"),
            },
          },
          { type: "text", text: EXTRACTION_INSTRUCTIONS },
        ]
      : [
          {
            type: "text",
            text: `${EXTRACTION_INSTRUCTIONS}\n\n다음은 CSV 파일 내용입니다:\n\n${decodeCsvText(arrayBuffer)}`,
          },
        ];

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    messages: [{ role: "user", content }],
  });

  return parseTransactionsResponse(extractResponseText(response));
}
