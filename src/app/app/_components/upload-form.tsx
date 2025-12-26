"use client";

import type React from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/constants";

type Props = {
  onSuccess?: () => void;
};

type UploadResult = {
  fileName: string;
  status: "ready" | "queued" | "failed" | "unknown";
  message?: string;
  error?: string;
  documentId?: string;
};

const MAX_FILES = 5;
const ALLOWED_EXT_REGEX = /\.(pdf|docx?|txt)$/i;

const humanSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const statusLabel = (status: UploadResult["status"]) => {
  switch (status) {
    case "ready":
      return { label: "처리 완료", className: "text-emerald-600" };
    case "queued":
      return { label: "대기", className: "text-slate-600" };
    case "failed":
      return { label: "실패", className: "text-destructive" };
    default:
      return { label: status, className: "text-slate-600" };
  }
};

export function UploadForm({ onSuccess }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

  const requestUploadUrl = async (file: File) => {
    const res = await fetch("/api/documents/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.uploadUrl || !data?.path) {
      throw new Error(data?.error ?? "업로드 URL 생성에 실패했습니다.");
    }
    return { uploadUrl: data.uploadUrl as string, path: data.path as string, mimeType: data.mimeType as string };
  };

  const ingestAfterUpload = async (file: File, path: string, mimeType: string) => {
    const res = await fetch("/api/documents/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storagePath: path,
        fileName: file.name,
        mimeType: mimeType || file.type || "application/octet-stream",
        size: file.size,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error ?? "처리에 실패했습니다.");
    }
    return data as UploadResult & { documentId?: string };
  };

  const addFiles = (incoming: FileList | File[]): number => {
    setError(null);
    setSuccess(null);
    setResults([]);

    const incomingFiles = Array.from(incoming);
    if (!incomingFiles.length) return 0;

    const filtered: File[] = [];
    const errors: string[] = [];

    for (const file of incomingFiles) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`${file.name}: ${(file.size / (1024 * 1024)).toFixed(1)}MB (최대 ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB)`);
        continue;
      }
      const mime = file.type || "";
      const allowedMime = ALLOWED_MIME_TYPES.some((t) => mime === t || (mime && mime.startsWith(t.split("/")[0] + "/")));
      const allowedExt = ALLOWED_EXT_REGEX.test(file.name);
      const allowed = allowedMime || allowedExt || !mime; // mime이 비어도 확장자면 허용
      if (!allowed) {
        errors.push(`${file.name}: 지원하지 않는 형식`);
        continue;
      }
      filtered.push(file);
    }

    const limited = filtered.slice(0, MAX_FILES);
    setFiles(limited);

    if (errors.length) {
      setError(`제외된 파일: ${errors.join("; ")}`);
    }
    if (limited.length === 0) {
      setError(errors.length ? "선택한 파일이 모두 제외되었습니다." : "추가된 파일이 없습니다.");
    } else {
      setSuccess(`${limited.length}개 파일이 추가되었습니다.`);
    }

    return limited.length;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;

    setError(null);
    setSuccess(null);
    setResults([]);
    setProgress(null);

    if (files.length === 0) {
      setError("파일을 선택해주세요.");
      return;
    }

    if (files.length > MAX_FILES) {
      setError(`최대 ${MAX_FILES}개까지 업로드할 수 있습니다.`);
      return;
    }

    setIsLoading(true);

    try {
      const uploadResults: UploadResult[] = [];

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setProgress({ current: i + 1, total: files.length });

        try {
          const { uploadUrl, path, mimeType } = await requestUploadUrl(file);
          const put = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": mimeType || file.type || "application/octet-stream" },
            body: file,
          });
          if (!put.ok) {
            throw new Error("파일 업로드에 실패했습니다.");
          }
          const ingestResult = await ingestAfterUpload(file, path, mimeType);
          const status: UploadResult["status"] =
            ingestResult?.status === "ready" || ingestResult?.status === "queued" || ingestResult?.status === "failed"
              ? ingestResult.status
              : "unknown";

          uploadResults.push({
            fileName: file.name,
            status,
            message: ingestResult?.message,
            documentId: ingestResult?.documentId,
            error: ingestResult?.error,
          });
        } catch (err) {
          uploadResults.push({
            fileName: file.name,
            status: "failed",
            error: err instanceof Error ? err.message : "오류가 발생했습니다.",
          });
        }
      }

      setResults(uploadResults);

      const failedCount = uploadResults.filter((r) => r.status === "failed").length;
      const okCount = uploadResults.length - failedCount;

      router.refresh();

      if (failedCount === 0) {
        setSuccess(`업로드 완료: ${okCount}개`);
        setFiles([]);
        if (inputRef.current) inputRef.current.value = "";
        onSuccess?.();
      } else {
        setSuccess(okCount > 0 ? `업로드 완료: 성공 ${okCount}개` : null);
        setError(`일부 파일 업로드에 실패했습니다. (성공 ${okCount}개 / 실패 ${failedCount}개)`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      router.refresh();
    } finally {
      setIsLoading(false);
      setIsDragging(false);
      setProgress(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>문서 업로드</CardTitle>
        <CardDescription>pdf, docx, txt 형식을 최대 {MAX_FILES}개까지 드래그&드롭 또는 선택하면 자동으로 처리합니다. (파일당 최대 30MB)</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label
            htmlFor="file"
            className={cn(
              "flex cursor-pointer items-center justify-between rounded-lg border border-dashed p-4 transition",
              isDragging ? "border-primary bg-primary/5" : "hover:border-primary",
              isLoading ? "pointer-events-none opacity-70" : null,
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              if (isLoading) return;
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (isLoading) return;
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (isLoading) return;
              setIsDragging(false);
              if (event.dataTransfer?.files?.length) {
                addFiles(event.dataTransfer.files);
              }
            }}
          >
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{files.length ? `${files.length}개 파일 선택됨` : "파일 선택"}</p>
                <p className="text-sm text-muted-foreground">
                  {files.length ? "업로드할 파일이 준비되었습니다." : `최대 ${MAX_FILES}개, 각 30MB, pdf/docx/txt`}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={(event) => {
                event.preventDefault();
                inputRef.current?.click();
              }}
              disabled={isLoading}
            >
              찾아보기
            </Button>
          </label>
          <input
            ref={inputRef}
            id="file"
            name="file"
            type="file"
            accept="" // 필터는 코드에서 처리하므로 비워서 선택 제한을 최소화
            className="hidden"
            multiple
            onChange={(event) => {
              if (isLoading) return;
              const list = event.currentTarget.files;
              if (list?.length) {
                const added = addFiles(list);
                if (added === 0) {
                  // 동일 파일 재선택 시 안내
                  setError("추가된 파일이 없습니다. 다른 파일을 선택하거나 새로 업로드를 시도하세요.");
                }
              } else {
                setError("파일을 선택하지 않았습니다.");
              }
              event.currentTarget.value = "";
            }}
          />
          {files.length ? (
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="mb-2 text-sm font-medium text-foreground">선택된 파일</div>
              <div className="grid gap-2">
                {files.map((file, idx) => (
                  <div key={fileKey(file)} className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="truncate text-sm font-medium">{file.name}</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{humanSize(file.size)}</div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.preventDefault();
                        if (isLoading) return;
                        setFiles((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      aria-label={`${file.name} 제거`}
                      title="제거"
                      disabled={isLoading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={isLoading || files.length === 0}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 업로드 중...
                {progress ? ` (${progress.current}/${progress.total})` : null}
              </>
            ) : (
              "업로드"
            )}
          </Button>
          {progress ? (
            <p className="text-sm text-muted-foreground">
              진행: {progress.current}/{progress.total}
            </p>
          ) : null}
          {results.length ? (
            <div className="rounded-lg border bg-background p-3">
              <div className="text-sm font-medium">업로드 결과</div>
              <div className="mt-2 grid gap-1">
                {results.map((r, idx) => {
                  const chip = statusLabel(r.status);
                  return (
                    <div
                      key={`${r.fileName}-${r.documentId ?? String(idx)}`}
                      className="flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 text-sm">
                        <div className="truncate">{r.fileName}</div>
                        {r.error ? <div className="truncate text-xs text-destructive">에러: {r.error}</div> : null}
                      </div>
                      <div className={cn("shrink-0 text-xs font-medium", chip.className)}>{chip.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
