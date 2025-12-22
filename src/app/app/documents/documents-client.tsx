"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileText, MessageCircle, MoreHorizontal, Search, X, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { UploadForm } from "../_components/upload-form";

type DocumentRow = {
  id: string;
  title: string;
  status: string;
  size: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
  error_message: string | null;
};

type Props = {
  ownerLabel: string;
  documents: DocumentRow[];
};

const humanSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const formatDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}. ${match[2]}. ${match[3]}.`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}. ${m}. ${d}.`;
};

const getFormat = (mimeType: string) => {
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("word") || mimeType.includes("officedocument")) return "docx";
  if (mimeType.includes("text")) return "txt";
  return "other";
};

const statusChip = (status: string) => {
  switch (status) {
    case "ready":
      return { label: "처리 완료", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
    case "processing":
      return { label: "처리 중", className: "border-amber-200 bg-amber-50 text-amber-700" };
    case "queued":
      return { label: "대기", className: "border-slate-200 bg-slate-50 text-slate-700" };
    case "failed":
      return { label: "실패", className: "border-red-200 bg-red-50 text-red-700" };
    default:
      return { label: status, className: "border-slate-200 bg-slate-50 text-slate-700" };
  }
};

export function DocumentsClient({ ownerLabel, documents }: Props) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return documents.filter((doc) => {
      if (normalizedQuery && !doc.title.toLowerCase().includes(normalizedQuery)) return false;
      if (statusFilter !== "all" && doc.status !== statusFilter) return false;
      if (formatFilter !== "all" && getFormat(doc.mime_type) !== formatFilter) return false;
      return true;
    });
  }, [documents, formatFilter, query, statusFilter]);

  return (
    <div className="h-full overflow-auto px-6 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">문서 라이브러리</h1>
            <p className="text-sm text-muted-foreground">AI가 접근할 수 있도록 회사 문서를 한곳에 모으세요.</p>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" className="gap-2" onClick={() => setUploadOpen(true)}>
              + 업로드
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-background/70 p-4 backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative w-full lg:flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="검색..."
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] bg-background">
                  <SelectValue placeholder="모든 파일" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 파일</SelectItem>
                  <SelectItem value="ready">처리 완료</SelectItem>
                  <SelectItem value="processing">처리 중</SelectItem>
                  <SelectItem value="queued">대기</SelectItem>
                  <SelectItem value="failed">실패</SelectItem>
                </SelectContent>
              </Select>

              <Select value={formatFilter} onValueChange={setFormatFilter}>
                <SelectTrigger className="w-[140px] bg-background">
                  <SelectValue placeholder="모든 형식" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 형식</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="docx">DOCX</SelectItem>
                  <SelectItem value="txt">TXT</SelectItem>
                </SelectContent>
              </Select>

              <Select value="" onValueChange={() => {}} disabled>
                <SelectTrigger className="w-[120px] bg-background">
                  <SelectValue placeholder="라벨" />
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-background">
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr className="[&>th]:px-4 [&>th]:py-3">
                  <th className="w-12">
                    <input
                      type="checkbox"
                      aria-label="전체 선택"
                      className="h-4 w-4 rounded border border-input bg-background"
                      disabled
                    />
                  </th>
                  <th className="text-left font-semibold">이름</th>
                  <th className="text-left font-semibold">소유자</th>
                  <th className="text-left font-semibold">수정일</th>
                  <th className="text-right font-semibold">크기</th>
                  <th className="w-16 text-right">동작</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      표시할 문서가 없습니다. 다른 검색/필터로 다시 시도해보세요.
                    </td>
                  </tr>
                ) : (
                  filtered.map((doc) => {
                    const chip = statusChip(doc.status);
                    const dateLabel = formatDate(doc.updated_at || doc.created_at);
                    const ready = doc.status === "ready";
                    return (
                      <tr key={doc.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 align-middle">
                          <input
                            type="checkbox"
                            aria-label={`${doc.title} 선택`}
                            className="h-4 w-4 rounded border border-input bg-background"
                            disabled
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-medium text-foreground">{doc.title}</span>
                                <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", chip.className)}>
                                  {chip.label}
                                </span>
                              </div>
                              {doc.error_message ? (
                                <div className="mt-1 truncate text-xs text-destructive">에러: {doc.error_message}</div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">{ownerLabel}</td>
                        <td className="px-4 py-3 align-middle">{dateLabel}</td>
                        <td className="px-4 py-3 align-middle text-right">{humanSize(doc.size)}</td>
                        <td className="px-4 py-3 align-middle text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={async () => {
                                  if (busyId) return;
                                  setBusyId(doc.id);
                                  try {
                                    const res = await fetch(`/api/documents/${doc.id}`, { method: "GET" });
                                    const data = await res.json().catch(() => null);
                                    if (!res.ok || !data?.url) {
                                      throw new Error(data?.error ?? "다운로드 URL 생성 실패");
                                    }
                                    window.open(data.url, "_blank", "noopener,noreferrer");
                                  } catch (err) {
                                    alert(err instanceof Error ? err.message : "다운로드에 실패했습니다.");
                                  } finally {
                                    setBusyId(null);
                                  }
                                }}
                              >
                                <Download className="mr-2 h-4 w-4" /> 다운로드
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled={!ready} asChild={ready}>
                                {ready ? (
                                  <Link href={`/app/documents/${doc.id}/chat`} className="flex items-center gap-2">
                                    <MessageCircle className="h-4 w-4" /> 대화하기
                                  </Link>
                                ) : (
                                  <span className="flex items-center gap-2">
                                    <MessageCircle className="h-4 w-4" /> 대화하기
                                  </span>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={async () => {
                                  if (busyId) return;
                                  const ok = confirm("문서를 삭제하시겠습니까? 관련 대화/임베딩도 함께 삭제됩니다.");
                                  if (!ok) return;
                                  setBusyId(doc.id);
                                  try {
                                    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
                                    const data = await res.json().catch(() => null);
                                    if (!res.ok) {
                                      throw new Error(data?.error ?? "삭제에 실패했습니다.");
                                    }
                                    window.location.reload();
                                  } catch (err) {
                                    alert(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
                                  } finally {
                                    setBusyId(null);
                                  }
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> 삭제
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {uploadOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setUploadOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10 h-9 w-9 rounded-full bg-background/80 backdrop-blur hover:bg-background"
              onClick={() => setUploadOpen(false)}
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </Button>
            <UploadForm onSuccess={() => setUploadOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
