import { supabase } from "../lib/supabase";
import type { UploadedAttachment } from "../types/attachment";

const ATTACHMENT_BUCKET = "it-request-images";
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".txt",
  ".csv",
  ".md",
  ".json",
].join(",");

const allowedExtensions = new Set(
  ATTACHMENT_ACCEPT.split(",").map((extension) => extension.slice(1)),
);

const blockedExtensions = new Set([
  "exe",
  "dll",
  "com",
  "bat",
  "cmd",
  "ps1",
  "js",
  "mjs",
  "cjs",
  "vbs",
  "scr",
  "msi",
  "jar",
  "sh",
  "php",
  "asp",
  "aspx",
  "jsp",
  "html",
  "htm",
  "svg",
  "zip",
  "rar",
  "7z",
  "docm",
  "xlsm",
  "pptm",
]);

export function getFileExtension(name: string) {
  return name.trim().toLowerCase().split(".").pop() ?? "";
}

export function isImageAttachment(
  mimeType: string | null,
  nameOrPath: string,
) {
  if (mimeType?.startsWith("image/")) return true;
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(
    getFileExtension(nameOrPath),
  );
}

export function formatAttachmentSize(size: number | null) {
  if (size == null || !Number.isFinite(size)) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function validateAttachment(file: File) {
  const extension = getFileExtension(file.name);
  const nameSegments = file.name.toLowerCase().split(".").slice(1, -1);

  if (!allowedExtensions.has(extension)) {
    throw new Error(
      "รองรับ JPG, PNG, WEBP, GIF, PDF, DOCX, XLSX, PPTX, TXT, CSV, MD และ JSON",
    );
  }
  if (nameSegments.some((segment) => blockedExtensions.has(segment))) {
    throw new Error("ชื่อไฟล์มีนามสกุลซ้อนที่ไม่ปลอดภัย");
  }
  if (file.size === 0) throw new Error("ไม่สามารถอัปโหลดไฟล์ว่างได้");
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error("ไฟล์แนบต้องมีขนาดไม่เกิน 10 MB");
  }
}

async function getFunctionErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "context" in error &&
    error.context instanceof Response
  ) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      // Fall through to the standard error message.
    }
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export async function uploadAttachment(
  file: File,
  area: "requests" | "messages",
): Promise<UploadedAttachment> {
  validateAttachment(file);
  const body = new FormData();
  body.append("file", file);
  body.append("area", area);

  const { data, error } = await supabase.functions.invoke(
    "upload-attachment",
    { body },
  );
  if (error) {
    throw new Error(
      await getFunctionErrorMessage(error, "ตรวจสอบและอัปโหลดไฟล์ไม่สำเร็จ"),
    );
  }
  if (!data?.path) throw new Error("ระบบไม่ได้รับตำแหน่งไฟล์แนบ");

  return {
    path: String(data.path),
    originalName: String(data.originalName ?? file.name),
    mimeType: String(data.mimeType ?? file.type),
    size: Number(data.size ?? file.size),
  };
}

export async function getSignedAttachmentUrl(
  path: string,
  downloadName?: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(
      path,
      60 * 60,
      downloadName ? { download: downloadName } : undefined,
    );

  if (error) throw error;
  return data.signedUrl;
}

export async function removeAttachment(path: string) {
  const { error } = await supabase.functions.invoke("upload-attachment", {
    body: { action: "delete", path },
  });
  if (error) {
    throw new Error(
      await getFunctionErrorMessage(error, "ลบไฟล์ที่อัปโหลดไม่สำเร็จ"),
    );
  }
}
