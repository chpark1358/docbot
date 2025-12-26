"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Globe, Loader2, Paperclip, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  readyCount: number;
};

export function NewChatComposer({ readyCount }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"document" | "web">(() => (readyCount > 0 ? "document" : "web"));
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const send = async () => {
    if (isLoading) return;
    setError(null);

    const trimmed = question.trim();

    if (mode === "document" && readyCount === 0) {
      setError("처리 완료된 문서가 없습니다. 먼저 문서를 업로드하고 처리 완료를 기다려주세요.");
      return;
    }

    if (!trimmed) {
      setError("질문을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const createRes = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "web" ? { mode: "web", title: trimmed.slice(0, 60) } : { mode: "document", title: trimmed.slice(0, 60) }),
      });
      const createData = await createRes.json().catch(() => null);
      if (!createRes.ok) {
        throw new Error(createData?.error ?? "대화를 시작할 수 없습니다.");
      }

      const threadId: string | undefined = createData?.threadId;
      if (!threadId) {
        throw new Error("스레드 생성 응답이 올바르지 않습니다.");
      }

      try {
        sessionStorage.setItem(`pending_question:${threadId}`, trimmed);
      } catch {
        // ignore
      }

      setQuestion("");
      router.push(`/app/chats/${threadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-[0_28px_90px_-34px_rgba(0,0,0,0.35)]">
        <div className="pointer-events-none absolute inset-x-10 -top-16 h-40 rounded-full bg-gradient-to-r from-emerald-200/40 via-sky-200/40 to-amber-200/30 blur-3xl" />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <Sparkles className="h-4 w-4" /> 내 문서와 공유 문서를 한 번에 검색합니다.
              </div>
              <div className="text-xs text-slate-500">
                {readyCount > 0 ? `현재 ${readyCount}개 문서가 검색 대상입니다.` : "먼저 문서를 업로드하거나 공유 문서를 확인하세요."}
              </div>
            </div>
            <div className="inline-flex overflow-hidden rounded-full border border-slate-200 bg-slate-50">
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  mode === "document" ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-white"
                }`}
                disabled={isLoading || readyCount === 0}
                onClick={() => {
                  setError(null);
                  if (readyCount === 0) return;
                  setMode("document");
                }}
              >
                문서 전체
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-semibold transition ${
                  mode === "web" ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-white"
                }`}
                disabled={isLoading}
                onClick={() => {
                  setError(null);
                  setMode("web");
                }}
              >
                웹 검색
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-inner">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="무엇이든 물어보세요"
              className="min-h-[96px] resize-none border-none bg-transparent p-0 text-base leading-7 shadow-none focus-visible:ring-0"
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Button type="button" size="icon" variant="ghost" disabled title="추후 지원 예정">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "web" ? "secondary" : "outline"}
                className="gap-2"
                onClick={() => {
                  setError(null);
                  setMode((prev) => (prev === "web" ? "document" : "web"));
                }}
                disabled={isLoading || (mode === "document" && readyCount === 0)}
              >
                <Globe className="h-4 w-4" /> {mode === "web" ? "웹 검색 중" : "웹 검색으로"}
              </Button>
            </div>

            <Button
              type="button"
              size="icon"
              className="h-11 w-11 rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-700"
              onClick={send}
              disabled={isLoading || (mode === "document" && readyCount === 0)}
              aria-label="전송"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
