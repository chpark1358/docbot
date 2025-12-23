"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Globe, Link2, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Source = {
  order: number;
  type?: string;
  id?: string;
  similarity?: number;
  snippet?: string;
  url?: string;
  doc_title?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  sources?: Source[];
};

type Props = {
  threadId: string;
  initialMessages: Message[];
};

export function ChatClient({ threadId, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [sidebarSources, setSidebarSources] = useState<Source[]>([]);

  const scrollToBottom = useCallback(() => {
    const target = messagesRef.current;
    if (!target) return;
    target.scrollTo({ top: target.scrollHeight, behavior: "smooth" });
  }, []);

  const renderContent = (text: string) => {
    const lines = text.split(/\n+/).filter((l) => l.trim() !== "");
    return (
      <div className="space-y-2">
        {lines.map((line, idx) => {
          if (line.startsWith("## ")) {
            return (
              <div key={idx} className="mt-1 text-base font-semibold text-slate-900">
                {line.slice(3)}
              </div>
            );
          }
          if (line.startsWith("### ")) {
            return (
              <div key={idx} className="text-sm font-semibold text-slate-800">
                {line.slice(4)}
              </div>
            );
          }
          if (line.startsWith("* ")) {
            return (
              <div key={idx} className="flex items-start gap-2 text-sm text-slate-800">
                <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span className="leading-6">{line.slice(2)}</span>
              </div>
            );
          }
          return (
            <p key={idx} className="text-sm text-slate-800 leading-6">
              {line}
            </p>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    const timer = setTimeout(() => scrollToBottom(), 0);
    return () => clearTimeout(timer);
  }, [messages.length, scrollToBottom]);

  const sendMessage = useCallback(
    async (override?: string) => {
      const question = (override ?? input).trim();
      if (!question || isLoading) return;
      setInput("");
      setError(null);
      setIsLoading(true);

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: question, created_at: new Date().toISOString() },
      ]);

      // streaming
      let acc = "";
      const streamingId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: streamingId, role: "assistant", content: "", created_at: new Date().toISOString(), sources: [] },
      ]);
      scrollToBottom();

      const updateAssistant = (content: string, sources?: Source[]) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingId
              ? { ...m, content, sources: sources ?? m.sources }
              : m,
          ),
        );
        requestAnimationFrame(scrollToBottom);
      };

      try {
        const res = await fetch("/api/chat?stream=1", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ question, threadId }),
        });

        const contentType = res.headers.get("content-type") ?? "";
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "질문 처리에 실패했습니다.");
        }

        if (contentType.includes("text/event-stream") && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx;
            while ((idx = buffer.indexOf("\n\n")) >= 0) {
              const chunk = buffer.slice(0, idx).trim();
              buffer = buffer.slice(idx + 2);
              if (!chunk.startsWith("data:")) continue;
              try {
                const payload = JSON.parse(chunk.replace(/^data:\s*/, ""));
                if (payload.type === "chunk" && typeof payload.text === "string") {
                  acc += payload.text;
                  updateAssistant(acc);
                } else if (payload.type === "done") {
                  const sources: Source[] = Array.isArray(payload.sources) ? payload.sources : [];
                  updateAssistant(acc || payload.answer || "문서에서 확인되지 않음", sources);
                  setSidebarSources(sources.slice(0, 5));
                } else if (payload.type === "error") {
                  throw new Error(payload.message || "스트리밍 오류가 발생했습니다.");
                }
              } catch {
                // ignore malformed
              }
            }
          }
        } else {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error || "질문 처리에 실패했습니다.");
          }
          acc = data.answer ?? "문서에서 확인되지 않음";
          const sources: Source[] = data.sources ?? [];
          updateAssistant(acc, sources);
          setSidebarSources(sources.slice(0, 5));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
        // 실패 시 스트리밍 메시지 제거
        setMessages((prev) => prev.filter((m) => m.id !== streamingId));
      } finally {
        setIsLoading(false);
      }
    },
    [input, isLoading, threadId],
  );

  useEffect(() => {
    try {
      const key = `pending_question:${threadId}`;
      const pending = sessionStorage.getItem(key);
      if (!pending) return;
      sessionStorage.removeItem(key);
      void sendMessage(pending);
    } catch {
      // ignore
    }
  }, [sendMessage, threadId]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-hidden">
        <div className="mx-auto grid h-full w-full max-w-5xl grid-cols-1 gap-6 px-4 pb-48 pt-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
            <div ref={messagesRef} className="flex-1 overflow-auto pr-1">
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
                <div className="text-2xl font-semibold tracking-tight">무엇이든 물어보세요</div>
                <p className="max-w-md text-sm text-muted-foreground">
                  답변은 문서 내용을 기반으로만 생성되며, 문서에서 확인되지 않는 정보는 추측하지 않습니다.
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[min(720px,100%)] rounded-2xl px-5 py-4 text-sm leading-6 shadow-sm",
                      m.role === "user"
                        ? "bg-gradient-to-br from-emerald-600 via-cyan-600 to-sky-600 text-white"
                        : "border bg-card",
                    )}
                  >
                    {m.role === "assistant" ? renderContent(m.content) : <p className="whitespace-pre-wrap">{m.content}</p>}
                  </div>
                </div>
              ))
            )}
            </div>

            {isLoading ? (
              <div className="flex justify-start">
                <div className="flex max-w-[min(720px,100%)] items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> 답변 생성 중...
                </div>
              </div>
            ) : null}
          </div>

          {sidebarSources.length ? (
            <aside className="sticky top-6 hidden h-fit rounded-2xl border bg-card/85 p-4 shadow-sm lg:block">
              <div className="text-sm font-semibold text-slate-900">출처</div>
              <div className="mt-3 space-y-3">
                {sidebarSources.map((src) => (
                  <div key={`${src.id ?? src.url ?? src.order}`} className="rounded-lg border bg-background px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>#{src.order}</span>
                      {typeof src.similarity === "number" ? <span>sim {src.similarity.toFixed(2)}</span> : null}
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-900 truncate">
                      {src.doc_title || (src.url ? (() => { try { return new URL(src.url).hostname; } catch { return "출처"; } })() : "출처")}
                    </div>
                    {src.url ? (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 underline-offset-4 hover:underline"
                      >
                        <Link2 className="h-3 w-3" /> 열기
                      </a>
                    ) : null}
                    {src.snippet ? (
                      <div className="mt-2 text-xs text-slate-700 line-clamp-3">{src.snippet}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-28 bg-gradient-to-t from-background to-transparent" />

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-transparent">
        <div className="pointer-events-auto mx-auto w-full max-w-3xl px-4 py-3 sm:py-4">
          <div className="relative">
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-emerald-500/15 via-cyan-400/10 to-amber-400/15 blur-2xl" />
            <div className="relative rounded-3xl border bg-background/95 p-3 shadow-[0_18px_60px_-24px_rgba(0,0,0,0.35)]">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="문서 내용에 대해 질문하세요. (Enter 전송 / Shift+Enter 줄바꿈)"
                className="min-h-[84px] resize-none border-none bg-transparent p-0 text-sm leading-6 shadow-none focus-visible:ring-0"
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
              />

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Button type="button" size="icon" variant="ghost" disabled title="추후 지원 예정">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" disabled title="추후 지원 예정">
                    <FileText className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" disabled title="추후 지원 예정">
                    <Globe className="h-4 w-4" />
                  </Button>
                </div>

                <Button
                  type="button"
                  size="icon"
                  className="h-10 w-10 rounded-full shadow-sm"
                  onClick={() => void sendMessage()}
                  disabled={isLoading || !input.trim()}
                  aria-label="전송"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </Button>
              </div>

              {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
