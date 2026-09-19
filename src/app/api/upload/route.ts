import type { UploadResponse } from "@/types/api";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const UNSUPPORTED_FORMAT_MESSAGE =
  "CSV 또는 PDF 파일만 업로드할 수 있습니다 (최대 20MB). 파일 형식과 용량을 확인한 뒤 다시 시도해 주세요.";
const GENERIC_ERROR_MESSAGE = "업로드 처리 중 문제가 발생했습니다";
const STORAGE_BUCKET = "card-statements";
const FILE_TTL_MS = 24 * 60 * 60 * 1000;

function hasSupportedExtension(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return lowerName.endsWith(".csv") || lowerName.endsWith(".pdf");
}

function resolveFileMeta(fileName: string): { fileType: "csv" | "pdf"; contentType: string } {
  return fileName.toLowerCase().endsWith(".pdf")
    ? { fileType: "pdf", contentType: "application/pdf" }
    : { fileType: "csv", contentType: "text/csv" };
}

interface UploadedFile {
  name: string;
  size: number;
}

function isUploadedFile(value: FormDataEntryValue | null): value is UploadedFile & File {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "size" in value &&
    typeof (value as UploadedFile).name === "string" &&
    typeof (value as UploadedFile).size === "number"
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!isUploadedFile(file) || !hasSupportedExtension(file.name)) {
      return Response.json({ error: UNSUPPORTED_FORMAT_MESSAGE }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return Response.json({ error: UNSUPPORTED_FORMAT_MESSAGE }, { status: 400 });
    }

    const jobId = crypto.randomUUID();
    const { fileType, contentType } = resolveFileMeta(file.name);
    const storagePath = `${user.id}/${jobId}/${file.name}`;

    const admin = createAdminSupabaseClient();

    const { error: uploadError } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, { contentType });

    if (uploadError) {
      return Response.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
    }

    const fileExpiresAt = new Date(Date.now() + FILE_TTL_MS).toISOString();

    const { error: insertError } = await admin.from("analysis_jobs").insert({
      id: jobId,
      user_id: user.id,
      status: "pending",
      source_file_path: storagePath,
      source_file_type: fileType,
      file_expires_at: fileExpiresAt,
    });

    if (insertError) {
      try {
        await admin.storage.from(STORAGE_BUCKET).remove([storagePath]);
      } catch {
        // best-effort cleanup; ignore failures and still report the original error below
      }
      return Response.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
    }

    const response: UploadResponse = {
      jobId,
      fileName: file.name,
    };
    return Response.json(response, { status: 200 });
  } catch {
    return Response.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }
}
