import { supabase } from "../lib/supabase";

const IMAGE_BUCKET = "it-request-images";
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function validateImage(file: File) {
  if (!imageExtensions[file.type]) {
    throw new Error("รองรับเฉพาะไฟล์ JPG, PNG, WEBP และ GIF");
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("รูปภาพต้องมีขนาดไม่เกิน 5 MB");
  }
}

export async function uploadImage(
  file: File,
  area: "requests" | "messages",
): Promise<string> {
  validateImage(file);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("กรุณาเข้าสู่ระบบก่อนอัปโหลดรูปภาพ");

  const extension = imageExtensions[file.type];
  const path = `${user.id}/${area}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });

  if (error) throw error;
  return path;
}

export async function getSignedImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error) throw error;
  return data.signedUrl;
}

export async function removeImage(path: string) {
  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([path]);
  if (error) throw error;
}
