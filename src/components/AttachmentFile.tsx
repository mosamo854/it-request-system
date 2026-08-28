import { useEffect, useMemo, useState } from "react";
import {
  formatAttachmentSize,
  getFileExtension,
  getSignedAttachmentUrl,
  isImageAttachment,
} from "../services/attachmentService";

interface AttachmentFileProps {
  path: string;
  name: string | null;
  mimeType: string | null;
  size: number | null;
  className?: string;
}

const typeLabels: Record<string, string> = {
  pdf: "PDF",
  docx: "WORD",
  xlsx: "EXCEL",
  pptx: "POWERPOINT",
  txt: "TEXT",
  csv: "CSV",
  md: "MARKDOWN",
  json: "JSON",
};

export default function AttachmentFile({
  path,
  name,
  mimeType,
  size,
  className = "",
}: AttachmentFileProps) {
  const [url, setUrl] = useState("");
  const [hasError, setHasError] = useState(false);
  const displayName = name || path.split("/").pop() || "ไฟล์แนบ";
  const isImage = isImageAttachment(mimeType, displayName || path);
  const extension = getFileExtension(displayName || path);

  useEffect(() => {
    let isMounted = true;
    setUrl("");
    setHasError(false);

    getSignedAttachmentUrl(path, isImage ? undefined : displayName)
      .then((signedUrl) => {
        if (isMounted) setUrl(signedUrl);
      })
      .catch(() => {
        if (isMounted) setHasError(true);
      });

    return () => {
      isMounted = false;
    };
  }, [displayName, isImage, path]);

  const sizeLabel = useMemo(() => formatAttachmentSize(size), [size]);

  if (hasError) {
    return <span className={`attachment-error ${className}`}>เปิดไฟล์ไม่ได้</span>;
  }
  if (!url) return <span className={`attachment-loading ${className}`} />;

  if (isImage) {
    return (
      <a
        className={`attachment-link ${className}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={`เปิดรูป: ${displayName}`}
      >
        <img src={url} alt={displayName} loading="lazy" />
      </a>
    );
  }

  return (
    <a
      className={`attachment-file-card ${className}`}
      href={url}
      download={displayName}
      rel="noreferrer"
    >
      <span>{typeLabels[extension] ?? extension.toUpperCase()}</span>
      <span>
        <strong>{displayName}</strong>
        <small>
          {[typeLabels[extension] ?? "FILE", sizeLabel]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </span>
      <i>ดาวน์โหลด</i>
    </a>
  );
}
