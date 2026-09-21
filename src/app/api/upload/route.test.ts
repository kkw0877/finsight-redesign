import { describe, expect, it, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const uploadMock = vi.fn();
const removeMock = vi.fn();
const insertMock = vi.fn();

vi.mock("@/services/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

vi.mock("@/services/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: uploadMock,
        remove: removeMock,
      })),
    },
    from: vi.fn(() => ({
      insert: insertMock,
    })),
  })),
}));

import { POST } from "./route";

const TEST_USER = { id: "user-123" };

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
  beforeEach(() => {
    getUserMock.mockReset();
    uploadMock.mockReset();
    removeMock.mockReset();
    insertMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: TEST_USER } });
    uploadMock.mockResolvedValue({ data: { path: "mock-path" }, error: null });
    insertMock.mockResolvedValue({ data: null, error: null });
    removeMock.mockResolvedValue({ data: null, error: null });
  });

  it("returns 401 when not authenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const response = await POST(makeMultipartRequest("statement.csv", 20));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported file extensions with 400", async () => {
    const response = await POST(makeMultipartRequest("statement.txt", 5));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects files larger than 20MB with 400", async () => {
    const response = await POST(makeMultipartRequest("statement.csv", 20 * 1024 * 1024 + 1));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("accepts a valid .csv file, uploads to storage, inserts a pending job, and returns 200", async () => {
    const response = await POST(makeMultipartRequest("statement.csv", 20));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.jobId).toBeTypeOf("string");
    expect(body.fileName).toBe("statement.csv");

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [path, , options] = uploadMock.mock.calls[0];
    expect(path).toBe(`${TEST_USER.id}/${body.jobId}/statement.csv`);
    expect(options.contentType).toBe("text/csv");

    expect(insertMock).toHaveBeenCalledTimes(1);
    const insertedRow = insertMock.mock.calls[0][0];
    expect(insertedRow.id).toBe(body.jobId);
    expect(insertedRow.user_id).toBe(TEST_USER.id);
    expect(insertedRow.status).toBe("pending");
    expect(insertedRow.source_file_path).toBe(path);
    expect(insertedRow.source_file_type).toBe("csv");
    const expiresAt = new Date(insertedRow.file_expires_at).getTime();
    const expectedExpiry = Date.now() + 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(5000);
  });

  it("uses application/pdf content type for .pdf files", async () => {
    const response = await POST(makeMultipartRequest("statement.pdf", 20));
    expect(response.status).toBe(200);
    const [, , options] = uploadMock.mock.calls[0];
    expect(options.contentType).toBe("application/pdf");
    const insertedRow = insertMock.mock.calls[0][0];
    expect(insertedRow.source_file_type).toBe("pdf");
  });

  it("attempts storage cleanup and returns 500 with a generic message when the DB insert fails", async () => {
    insertMock.mockResolvedValue({ data: null, error: { message: "db exploded" } });
    const response = await POST(makeMultipartRequest("statement.csv", 20));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
    expect(body.error).not.toContain("db exploded");
    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 with a generic message when the storage upload fails", async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: "bucket unreachable" } });
    const response = await POST(makeMultipartRequest("statement.csv", 20));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTypeOf("string");
    expect(body.error).not.toContain("bucket unreachable");
    expect(insertMock).not.toHaveBeenCalled();
  });
});
