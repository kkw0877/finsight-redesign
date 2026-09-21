import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { extractTransactions } from "./extractTransactions";

function fakeClient(responseText: string): Anthropic {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: "text", text: responseText }],
  });
  return { messages: { create } } as unknown as Anthropic;
}

function stubFetchOk(body: ArrayBuffer, contentType = "text/csv"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => body,
      headers: new Headers({ "content-type": contentType }),
    }),
  );
}

describe("extractTransactions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("CSV(UTF-8) 응답을 파싱해 거래 배열을 반환한다", async () => {
    const csvBytes = new TextEncoder().encode("날짜,가맹점,금액\n2026-08-01,스타벅스,4500").buffer;
    stubFetchOk(csvBytes);
    const client = fakeClient(
      JSON.stringify([{ date: "2026-08-01", merchant: "스타벅스", amount: 4500, transactionType: "일시불" }]),
    );

    const result = await extractTransactions({
      client,
      signedUrl: "https://example.com/signed",
      fileType: "csv",
    });

    expect(result).toEqual([
      { date: "2026-08-01", merchant: "스타벅스", amount: 4500, transactionType: "일시불" },
    ]);
  });

  it("CSV가 EUC-KR로 인코딩되어 있어도 디코딩해 프롬프트에 포함시킨다", async () => {
    // "가" in EUC-KR (KS X 1001) is the byte sequence 0xB0 0xA1 — invalid as UTF-8.
    const eucKrBytes = new Uint8Array([0xb0, 0xa1]).buffer;
    stubFetchOk(eucKrBytes);
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "[]" }] });
    const client = { messages: { create } } as unknown as Anthropic;

    await extractTransactions({ client, signedUrl: "https://example.com/signed", fileType: "csv" });

    const callArgs = create.mock.calls[0][0];
    const textContent = callArgs.messages[0].content[0].text as string;
    expect(textContent).toContain("가");
  });

  it("PDF는 document 블록으로 base64 데이터를 전달한다", async () => {
    const pdfBytes = new TextEncoder().encode("%PDF-1.4 fake").buffer;
    stubFetchOk(pdfBytes, "application/pdf");
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "[]" }] });
    const client = { messages: { create } } as unknown as Anthropic;

    await extractTransactions({ client, signedUrl: "https://example.com/signed", fileType: "pdf" });

    const callArgs = create.mock.calls[0][0];
    const blocks = callArgs.messages[0].content;
    expect(blocks[0].type).toBe("document");
    expect(blocks[0].source.type).toBe("base64");
    expect(blocks[0].source.media_type).toBe("application/pdf");
    expect(blocks[1].type).toBe("text");
  });

  it("응답이 코드펜스로 감싸져 있어도 파싱한다", async () => {
    stubFetchOk(new ArrayBuffer(0));
    const client = fakeClient(
      "```json\n" +
        JSON.stringify([{ date: "2026-08-01", merchant: "A", amount: 1000, transactionType: "일시불" }]) +
        "\n```",
    );

    const result = await extractTransactions({
      client,
      signedUrl: "https://example.com/signed",
      fileType: "csv",
    });

    expect(result).toHaveLength(1);
  });

  it("거래가 없으면 빈 배열을 반환한다", async () => {
    stubFetchOk(new ArrayBuffer(0));
    const client = fakeClient("[]");

    const result = await extractTransactions({
      client,
      signedUrl: "https://example.com/signed",
      fileType: "csv",
    });

    expect(result).toEqual([]);
  });

  it("JSON으로 파싱할 수 없는 응답이면 에러를 던진다", async () => {
    stubFetchOk(new ArrayBuffer(0));
    const client = fakeClient("이건 JSON이 아닙니다");

    await expect(
      extractTransactions({ client, signedUrl: "https://example.com/signed", fileType: "csv" }),
    ).rejects.toThrow();
  });

  it("배열 항목의 필드가 기대한 형태가 아니면 에러를 던진다", async () => {
    stubFetchOk(new ArrayBuffer(0));
    const client = fakeClient(JSON.stringify([{ date: "2026-08-01", merchant: "A" }]));

    await expect(
      extractTransactions({ client, signedUrl: "https://example.com/signed", fileType: "csv" }),
    ).rejects.toThrow();
  });

  it("결제수단 식별자(카드번호 등) 필드는 응답 스키마에 존재하지 않는다", async () => {
    stubFetchOk(new ArrayBuffer(0));
    const client = fakeClient(
      JSON.stringify([{ date: "2026-08-01", merchant: "A", amount: 1000, transactionType: "일시불" }]),
    );

    const result = await extractTransactions({
      client,
      signedUrl: "https://example.com/signed",
      fileType: "csv",
    });

    expect(Object.keys(result[0]).sort()).toEqual(["amount", "date", "merchant", "transactionType"]);
  });

  it("파일 다운로드에 실패하면 에러를 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const client = fakeClient("[]");

    await expect(
      extractTransactions({ client, signedUrl: "https://example.com/signed", fileType: "csv" }),
    ).rejects.toThrow();
  });
});
