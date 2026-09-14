import { describe, expect, it } from "vitest";
import { POST } from "./route";

// jsdom's FormData/File classes aren't recognized by Node's (undici) Request
// constructor, which silently drops the filename when serializing a jsdom
// FormData. Building the multipart body directly avoids that mismatch.
function makeMultipartRequest(fileName: string, byteLength: number): Request {
  const boundary = "----testboundary";
  const content = "x".repeat(byteLength);
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--\r\n`;
  return new Request("http://localhost/api/upload", {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

describe("POST /api/upload", () => {
  it("rejects unsupported file extensions with 400", async () => {
    const response = await POST(makeMultipartRequest("statement.txt", 5));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
  });

  it("rejects files larger than 20MB with 400", async () => {
    const response = await POST(makeMultipartRequest("statement.csv", 20 * 1024 * 1024 + 1));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
  });

  it("accepts a valid .csv file and returns a jobId", async () => {
    const response = await POST(makeMultipartRequest("statement.csv", 20));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.jobId).toBeTypeOf("string");
    expect(body.fileName).toBe("statement.csv");
  });
});
