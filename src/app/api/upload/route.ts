import type { UploadResponse } from "@/types/api";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const UNSUPPORTED_FORMAT_MESSAGE =
  "CSV 또는 PDF 파일만 업로드할 수 있습니다 (최대 20MB). 파일 형식과 용량을 확인한 뒤 다시 시도해 주세요.";

function hasSupportedExtension(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return lowerName.endsWith(".csv") || lowerName.endsWith(".pdf");
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
    const formData = await request.formData();
    const file = formData.get("file");

    if (!isUploadedFile(file) || !hasSupportedExtension(file.name)) {
      return Response.json({ error: UNSUPPORTED_FORMAT_MESSAGE }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return Response.json({ error: UNSUPPORTED_FORMAT_MESSAGE }, { status: 400 });
    }

    const response: UploadResponse = {
      jobId: crypto.randomUUID(),
      fileName: file.name,
    };
    return Response.json(response, { status: 200 });
  } catch {
    return Response.json({ error: "업로드 처리 중 문제가 발생했습니다" }, { status: 500 });
  }
}
