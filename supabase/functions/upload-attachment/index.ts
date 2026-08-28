import { createClient } from "npm:@supabase/supabase-js@2";

const ATTACHMENT_BUCKET = "it-request-images";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_OFFICE_ENTRIES = 500;
const MAX_OFFICE_UNCOMPRESSED_SIZE = 100 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface FileSpec {
  mimeType: string;
  acceptedMimeTypes: string[];
  category: "image" | "pdf" | "office" | "text" | "csv" | "json";
  requiredOfficeEntry?: string;
}

const fileSpecs: Record<string, FileSpec> = {
  jpg: {
    mimeType: "image/jpeg",
    acceptedMimeTypes: ["image/jpeg", "image/pjpeg"],
    category: "image",
  },
  jpeg: {
    mimeType: "image/jpeg",
    acceptedMimeTypes: ["image/jpeg", "image/pjpeg"],
    category: "image",
  },
  png: {
    mimeType: "image/png",
    acceptedMimeTypes: ["image/png"],
    category: "image",
  },
  webp: {
    mimeType: "image/webp",
    acceptedMimeTypes: ["image/webp"],
    category: "image",
  },
  gif: {
    mimeType: "image/gif",
    acceptedMimeTypes: ["image/gif"],
    category: "image",
  },
  pdf: {
    mimeType: "application/pdf",
    acceptedMimeTypes: ["application/pdf"],
    category: "pdf",
  },
  docx: {
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    acceptedMimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    category: "office",
    requiredOfficeEntry: "word/document.xml",
  },
  xlsx: {
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    acceptedMimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    category: "office",
    requiredOfficeEntry: "xl/workbook.xml",
  },
  pptx: {
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    acceptedMimeTypes: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    category: "office",
    requiredOfficeEntry: "ppt/presentation.xml",
  },
  txt: {
    mimeType: "text/plain",
    acceptedMimeTypes: ["text/plain"],
    category: "text",
  },
  md: {
    mimeType: "text/markdown",
    acceptedMimeTypes: ["text/markdown", "text/plain"],
    category: "text",
  },
  csv: {
    mimeType: "text/csv",
    acceptedMimeTypes: [
      "text/csv",
      "text/plain",
      "application/vnd.ms-excel",
    ],
    category: "csv",
  },
  json: {
    mimeType: "application/json",
    acceptedMimeTypes: ["application/json", "text/plain"],
    category: "json",
  },
};

const dangerousExtensionSegments = new Set([
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
  "vbe",
  "wsf",
  "wsh",
  "scr",
  "pif",
  "msi",
  "jar",
  "sh",
  "bash",
  "php",
  "phtml",
  "asp",
  "aspx",
  "jsp",
  "html",
  "htm",
  "svg",
  "xml",
  "xsl",
  "reg",
  "lnk",
  "iso",
  "img",
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "docm",
  "xlsm",
  "pptm",
  "xlam",
]);

class UnsafeFileError extends Error {}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function readUint16LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] << 24) >>> 0) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function hasPrefix(bytes: Uint8Array, prefix: number[]) {
  return prefix.every((value, index) => bytes[index] === value);
}

function lastMeaningfulByte(bytes: Uint8Array) {
  let index = bytes.length - 1;
  while (index >= 0 && [9, 10, 13, 32].includes(bytes[index])) index -= 1;
  return index;
}

function validateImage(bytes: Uint8Array, extension: string) {
  if (extension === "jpg" || extension === "jpeg") {
    if (!hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
      throw new UnsafeFileError("โครงสร้างไฟล์ JPEG ไม่ถูกต้อง");
    }
    const end = lastMeaningfulByte(bytes);
    if (end < 1 || bytes[end - 1] !== 0xff || bytes[end] !== 0xd9) {
      throw new UnsafeFileError("ไฟล์ JPEG มีข้อมูลผิดปกติท้ายไฟล์");
    }
    return;
  }

  if (extension === "png") {
    if (!hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      throw new UnsafeFileError("โครงสร้างไฟล์ PNG ไม่ถูกต้อง");
    }
    let offset = 8;
    let foundEnd = false;
    while (offset + 12 <= bytes.length) {
      const length = readUint32BE(bytes, offset);
      const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
      if (length > bytes.length || offset + 12 + length > bytes.length) {
        throw new UnsafeFileError("โครงสร้าง Chunk ของ PNG ไม่ถูกต้อง");
      }
      offset += length + 12;
      if (type === "IEND") {
        foundEnd = length === 0;
        break;
      }
    }
    if (!foundEnd || offset !== bytes.length) {
      throw new UnsafeFileError("ไฟล์ PNG มีข้อมูลแทรกหรือข้อมูลส่วนเกิน");
    }
    return;
  }

  if (extension === "gif") {
    const header = new TextDecoder().decode(bytes.slice(0, 6));
    if (header !== "GIF87a" && header !== "GIF89a") {
      throw new UnsafeFileError("โครงสร้างไฟล์ GIF ไม่ถูกต้อง");
    }
    if (bytes[lastMeaningfulByte(bytes)] !== 0x3b) {
      throw new UnsafeFileError("ไฟล์ GIF มีข้อมูลผิดปกติท้ายไฟล์");
    }
    return;
  }

  if (
    !hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) ||
    new TextDecoder().decode(bytes.slice(8, 12)) !== "WEBP" ||
    readUint32LE(bytes, 4) + 8 !== bytes.length
  ) {
    throw new UnsafeFileError("โครงสร้างไฟล์ WEBP ไม่ถูกต้อง");
  }
}

function validatePdf(bytes: Uint8Array) {
  if (!hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    throw new UnsafeFileError("โครงสร้างไฟล์ PDF ไม่ถูกต้อง");
  }

  let text = new TextDecoder("latin1").decode(bytes);
  text = text.replace(/#([0-9a-f]{2})/gi, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );
  const activeTokens = [
    "/JavaScript",
    "/JS",
    "/OpenAction",
    "/AA",
    "/Launch",
    "/EmbeddedFile",
    "/RichMedia",
    "/XFA",
  ];
  if (activeTokens.some((token) => text.toLowerCase().includes(token.toLowerCase()))) {
    throw new UnsafeFileError(
      "PDF มี JavaScript, Action, ไฟล์ฝัง หรือเนื้อหาแบบ Active ที่ไม่อนุญาต",
    );
  }
  if (!text.slice(-4096).includes("%%EOF")) {
    throw new UnsafeFileError("PDF ไม่มีจุดสิ้นสุดไฟล์ที่ถูกต้อง");
  }
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const minimum = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (readUint32LE(bytes, offset) === 0x06054b50) return offset;
  }
  return -1;
}

function validateOfficeFile(
  bytes: Uint8Array,
  requiredEntry: string,
) {
  if (!hasPrefix(bytes, [0x50, 0x4b])) {
    throw new UnsafeFileError("ไฟล์ Office ไม่ใช่โครงสร้าง Open XML ที่ถูกต้อง");
  }

  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) {
    throw new UnsafeFileError("ไม่พบสารบัญภายในไฟล์ Office");
  }
  if (
    readUint16LE(bytes, eocdOffset + 4) !== 0 ||
    readUint16LE(bytes, eocdOffset + 6) !== 0
  ) {
    throw new UnsafeFileError("ไม่รองรับไฟล์ Office แบบแบ่งหลายส่วน");
  }

  const entryCount = readUint16LE(bytes, eocdOffset + 10);
  const centralSize = readUint32LE(bytes, eocdOffset + 12);
  const centralOffset = readUint32LE(bytes, eocdOffset + 16);
  if (
    entryCount === 0 ||
    entryCount > MAX_OFFICE_ENTRIES ||
    centralOffset + centralSize > bytes.length
  ) {
    throw new UnsafeFileError("ไฟล์ Office มีจำนวนรายการหรือขนาดผิดปกติ");
  }

  const names = new Set<string>();
  let offset = centralOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || readUint32LE(bytes, offset) !== 0x02014b50) {
      throw new UnsafeFileError("สารบัญภายในไฟล์ Office เสียหาย");
    }
    const flags = readUint16LE(bytes, offset + 8);
    const method = readUint16LE(bytes, offset + 10);
    const compressedSize = readUint32LE(bytes, offset + 20);
    const uncompressedSize = readUint32LE(bytes, offset + 24);
    const nameLength = readUint16LE(bytes, offset + 28);
    const extraLength = readUint16LE(bytes, offset + 30);
    const commentLength = readUint16LE(bytes, offset + 32);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;

    if (
      nextOffset > bytes.length ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      (flags & 0x1) !== 0 ||
      ![0, 8].includes(method)
    ) {
      throw new UnsafeFileError("ไฟล์ Office ใช้การเข้ารหัสหรือรูปแบบที่ไม่ปลอดภัย");
    }

    const rawName = new TextDecoder().decode(
      bytes.slice(offset + 46, offset + 46 + nameLength),
    );
    const name = rawName.replaceAll("\\", "/").toLowerCase();
    if (
      name.includes("\u0000") ||
      name.startsWith("/") ||
      name.split("/").includes("..")
    ) {
      throw new UnsafeFileError("พบ Path ที่ไม่ปลอดภัยภายในไฟล์ Office");
    }

    const dangerousEntry =
      name.includes("vbaproject.bin") ||
      name.includes("/activex/") ||
      name.includes("/embeddings/") ||
      name.includes("/macros/") ||
      name.includes("/externallinks/") ||
      name.includes("/_xmlsignatures/") ||
      name.endsWith(".exe") ||
      name.endsWith(".dll") ||
      name.endsWith(".js") ||
      name.endsWith(".vbs");
    if (dangerousEntry) {
      throw new UnsafeFileError(
        "ไฟล์ Office มี Macro, ActiveX, Embedded object หรือลิงก์ภายนอก",
      );
    }

    names.add(name);
    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    offset = nextOffset;
  }

  if (
    !names.has("[content_types].xml") ||
    !names.has(requiredEntry.toLowerCase())
  ) {
    throw new UnsafeFileError("นามสกุลไฟล์ Office ไม่ตรงกับเนื้อหาภายใน");
  }
  if (
    totalUncompressed > MAX_OFFICE_UNCOMPRESSED_SIZE ||
    (totalCompressed > 0 &&
      totalUncompressed / totalCompressed > MAX_COMPRESSION_RATIO)
  ) {
    throw new UnsafeFileError("ไฟล์ Office มีลักษณะคล้าย ZIP bomb");
  }
}

function decodeUtf8Text(bytes: Uint8Array) {
  if (bytes.includes(0)) {
    throw new UnsafeFileError("ไฟล์ข้อความมีข้อมูล Binary ที่ไม่อนุญาต");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new UnsafeFileError("ไฟล์ข้อความต้องเข้ารหัสแบบ UTF-8");
  }
}

function validateTextFile(bytes: Uint8Array, category: FileSpec["category"]) {
  const text = decodeUtf8Text(bytes);
  const normalized = text.trimStart().toLowerCase();
  if (
    normalized.startsWith("mz") ||
    normalized.startsWith("#!") ||
    normalized.startsWith("<?php") ||
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    /<script\b|javascript\s*:/i.test(text)
  ) {
    throw new UnsafeFileError("ไฟล์ข้อความมี Script หรือเนื้อหาที่ไม่อนุญาต");
  }

  if (category === "json") {
    try {
      JSON.parse(text);
    } catch {
      throw new UnsafeFileError("โครงสร้างไฟล์ JSON ไม่ถูกต้อง");
    }
  }

  if (
    category === "csv" &&
    /(^|[,;\t])\s*["']?\s*(?:[=+@]|-(?!\d|[.,]\d))/m.test(text)
  ) {
    throw new UnsafeFileError(
      "CSV มีสูตรหรือคำสั่งที่อาจทำงานอัตโนมัติเมื่อเปิดในโปรแกรมตารางคำนวณ",
    );
  }
}

function sanitizeDisplayName(name: string, extension: string) {
  const withoutControlCharacters = Array.from(name, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? "_" : character;
  }).join("");
  const normalized = withoutControlCharacters
    .normalize("NFKC")
    .replace(/[\\/]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 180);
  return normalized || `attachment.${extension}`;
}

function getExtension(name: string) {
  return name.trim().toLowerCase().split(".").pop() ?? "";
}

function validateFileName(name: string, extension: string) {
  const hasControlCharacter = Array.from(name).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!name || name.length > 255 || hasControlCharacter) {
    throw new UnsafeFileError("ชื่อไฟล์ไม่ถูกต้องหรือยาวเกินไป");
  }
  const segments = name.toLowerCase().split(".").slice(1, -1);
  if (segments.some((segment) => dangerousExtensionSegments.has(segment))) {
    throw new UnsafeFileError("ชื่อไฟล์มีนามสกุลซ้อนที่ไม่ปลอดภัย");
  }
  if (!fileSpecs[extension]) {
    throw new UnsafeFileError(
      "รองรับเฉพาะรูป, PDF, DOCX, XLSX, PPTX, TXT, CSV, MD และ JSON",
    );
  }
}

async function runOptionalMalwareScanner(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
) {
  const scanUrl = Deno.env.get("MALWARE_SCAN_URL");
  if (!scanUrl) return;

  const scanToken = Deno.env.get("MALWARE_SCAN_TOKEN");
  const response = await fetch(scanUrl, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
      "X-File-Name": encodeURIComponent(fileName),
      ...(scanToken ? { Authorization: `Bearer ${scanToken}` } : {}),
    },
    body: bytes,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error("บริการ Antivirus ไม่ตอบกลับ จึงหยุดการอัปโหลดเพื่อความปลอดภัย");
  }
  const result = await response.json().catch(() => null) as {
    safe?: boolean;
    threat?: string;
  } | null;
  if (result?.safe !== true) {
    throw new UnsafeFileError(
      result?.threat
        ? `Antivirus ตรวจพบไฟล์อันตราย: ${result.threat}`
        : "Antivirus ไม่อนุญาตไฟล์นี้",
    );
  }
}

function isOwnedTemporaryPath(path: string, userId: string) {
  const extensions = Object.keys(fileSpecs).join("|");
  const pattern = new RegExp(
    `^${userId}/(?:requests|messages)/\\d{4}-\\d{2}/[0-9a-f-]{36}\\.(?:${extensions})$`,
    "i",
  );
  return pattern.test(path);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.replace(/^Bearer\s+/i, "");
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ error: "กรุณาเข้าสู่ระบบใหม่" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const contentType = request.headers.get("Content-Type") ?? "";

    if (contentType.includes("application/json")) {
      const payload = await request.json().catch(() => ({})) as {
        action?: unknown;
        path?: unknown;
      };
      const path = typeof payload.path === "string" ? payload.path : "";
      if (payload.action !== "delete" || !isOwnedTemporaryPath(path, user.id)) {
        return jsonResponse({ error: "คำขอลบไฟล์ไม่ถูกต้อง" }, 400);
      }

      const [{ data: requestReference, error: requestReferenceError }, {
        data: messageReference,
        error: messageReferenceError,
      }] = await Promise.all([
        adminClient.from("it_requests").select("id").eq("image_path", path)
          .limit(1).maybeSingle(),
        adminClient.from("it_request_messages").select("id").eq(
          "image_path",
          path,
        ).limit(1).maybeSingle(),
      ]);
      if (requestReferenceError || messageReferenceError) {
        throw requestReferenceError ?? messageReferenceError;
      }
      if (requestReference || messageReference) {
        return jsonResponse({ error: "ไฟล์นี้ถูกผูกกับคำขอแล้ว จึงลบไม่ได้" }, 409);
      }

      const { error: removeError } = await adminClient.storage
        .from(ATTACHMENT_BUCKET)
        .remove([path]);
      if (removeError) throw removeError;
      return jsonResponse({ deleted: true });
    }

    if (!contentType.includes("multipart/form-data")) {
      return jsonResponse({ error: "รูปแบบข้อมูลอัปโหลดไม่ถูกต้อง" }, 415);
    }

    const form = await request.formData();
    const file = form.get("file");
    const area = String(form.get("area") ?? "");
    if (!(file instanceof File) || !["requests", "messages"].includes(area)) {
      return jsonResponse({ error: "กรุณาเลือกไฟล์และพื้นที่จัดเก็บให้ถูกต้อง" }, 400);
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return jsonResponse({ error: "ไฟล์ต้องมีขนาด 1 byte ถึง 10 MB" }, 413);
    }

    const extension = getExtension(file.name);
    validateFileName(file.name, extension);
    const spec = fileSpecs[extension];
    if (file.type && !spec.acceptedMimeTypes.includes(file.type.toLowerCase())) {
      throw new UnsafeFileError("MIME type ไม่ตรงกับนามสกุลไฟล์");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (spec.category === "image") validateImage(bytes, extension);
    else if (spec.category === "pdf") validatePdf(bytes);
    else if (spec.category === "office") {
      validateOfficeFile(bytes, spec.requiredOfficeEntry ?? "");
    } else validateTextFile(bytes, spec.category);

    const safeName = sanitizeDisplayName(file.name, extension);
    await runOptionalMalwareScanner(bytes, safeName, spec.mimeType);

    const month = new Date().toISOString().slice(0, 7);
    const path = `${user.id}/${area}/${month}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await adminClient.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, bytes, {
        cacheControl: "3600",
        contentType: spec.mimeType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    return jsonResponse({
      path,
      originalName: safeName,
      mimeType: spec.mimeType,
      size: file.size,
      scan: Deno.env.get("MALWARE_SCAN_URL")
        ? "structure-and-antivirus"
        : "structure",
    }, 201);
  } catch (error) {
    if (error instanceof UnsafeFileError) {
      return jsonResponse({ error: error.message }, 400);
    }
    const message = error instanceof Error ? error.message : "อัปโหลดไฟล์ไม่สำเร็จ";
    return jsonResponse({ error: message }, 500);
  }
});
