"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ChatAttachment = {
  documentId: string;
  fileName: string;
  size: number;
  mimeType: string;
};

type Props = {
  onAttached: (att: ChatAttachment) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
};

const ACCEPT = ".pdf,.docx,.doc,.txt,.md,.hwp,.hwpx";
const ALLOWED_EXT_REGEX = /\.(pdf|docx|doc|txt|md|hwp|hwpx)$/i;

export function ChatAttachButton({ onAttached, onError, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const reportError = (msg: string) => {
    if (onError) onError(msg);
    else if (typeof window !== "undefined") window.alert(msg);
  };

  const handlePick = () => {
    if (disabled || isUploading) return;
    inputRef.current?.click();
  };

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_EXT_REGEX.test(file.name)) {
      reportError("지원하지 않는 형식입니다. (pdf, docx, txt, md, hwp)");
      return;
    }

    setIsUploading(true);
    try {
      const urlRes = await fetch("/api/documents/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }),
      });
      const urlData = await urlRes.json().catch(() => null);
      if (!urlRes.ok || !urlData?.uploadUrl || !urlData?.path) {
        throw new Error(urlData?.error ?? "업로드 URL 생성에 실패했습니다.");
      }

      const putRes = await fetch(urlData.uploadUrl as string, {
        method: "PUT",
        headers: {
          "Content-Type": (urlData.mimeType as string | undefined) ?? file.type ?? "application/octet-stream",
        },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error("파일 업로드에 실패했습니다.");
      }

      const ingestRes = await fetch("/api/documents/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: urlData.path,
          fileName: file.name,
          mimeType: (urlData.mimeType as string | undefined) ?? file.type ?? "application/octet-stream",
          size: file.size,
          isShared: false,
        }),
      });
      const ingestData = await ingestRes.json().catch(() => null);
      if (!ingestRes.ok || !ingestData?.documentId) {
        throw new Error(ingestData?.error ?? "파일 처리에 실패했습니다.");
      }

      onAttached({
        documentId: ingestData.documentId as string,
        fileName: file.name,
        size: file.size,
        mimeType: (urlData.mimeType as string | undefined) ?? file.type ?? "application/octet-stream",
      });
    } catch (err) {
      reportError(err instanceof Error ? err.message : "첨부 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleChange}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled || isUploading}
        onClick={handlePick}
        aria-label="파일 첨부"
        title={isUploading ? "업로드 + 처리 중..." : "파일 첨부 (pdf, docx, txt, md)"}
      >
        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
      </Button>
    </>
  );
}
