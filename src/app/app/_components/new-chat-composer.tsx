"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Loader2, Paperclip, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  readyCount: number;
};

export function NewChatComposer({ readyCount }: Props) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const send = async () => {
    if (isLoading) return;
    setError(null);

    const trimmed = question.trim();
    if (!trimmed) {
      setError("질문을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const createRes = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed.slice(0, 60) }),
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
      <div className="relative overflow-hidden rounded-3xl border bg-card/95 p-6 shadow-[0_28px_90px_-34px_rgba(0,0,0,0.35)]">
        <div className="pointer-events-none absolute inset-x-10 -top-16 h-40 rounded-full bg-gradient-to-r from-emerald-200/40 via-sky-200/40 to-amber-200/30 blur-3xl dark:from-emerald-500/15 dark:via-sky-500/15 dark:to-amber-500/10" />
        <div className="relative flex flex-col gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <Sparkles className="h-4 w-4" /> 사내 문서와 웹을 함께 활용해 답변합니다.
            </div>
            <div className="text-xs text-muted-foreground">
              {readyCount > 0
                ? `현재 ${readyCount}개의 사내 문서가 검색 대상입니다. 필요한 경우 웹 검색을 자동으로 활용합니다.`
                : "아직 사내 문서가 없어도 됩니다. 웹 검색으로 답변할 수 있어요."}
            </div>
          </div>

          <div className="rounded-2xl border bg-background/60 px-4 py-3 shadow-inner">
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
            </div>

            <Button
              type="button"
              size="icon"
              className="h-11 w-11 rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-700"
              onClick={send}
              disabled={isLoading}
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
