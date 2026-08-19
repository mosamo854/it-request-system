import { useEffect, useState } from "react";
import { getSignedImageUrl } from "../services/imageService";

interface AttachmentImageProps {
  path: string;
  alt: string;
  className?: string;
}

export default function AttachmentImage({
  path,
  alt,
  className = "",
}: AttachmentImageProps) {
  const [url, setUrl] = useState("");
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setUrl("");
    setHasError(false);

    getSignedImageUrl(path)
      .then((signedUrl) => {
        if (isMounted) setUrl(signedUrl);
      })
      .catch(() => {
        if (isMounted) setHasError(true);
      });

    return () => {
      isMounted = false;
    };
  }, [path]);

  if (hasError) {
    return <span className={`attachment-error ${className}`}>เปิดรูปไม่ได้</span>;
  }

  if (!url) {
    return <span className={`attachment-loading ${className}`} />;
  }

  return (
    <a
      className={`attachment-link ${className}`}
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`เปิดรูป: ${alt}`}
    >
      <img src={url} alt={alt} loading="lazy" />
    </a>
  );
}
