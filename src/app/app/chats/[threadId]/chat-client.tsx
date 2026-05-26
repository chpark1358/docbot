"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Copy, FileText, Globe, Link2, Loader2, Paperclip, RefreshCw, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

type Source = {
  order: number;
  type?: string;
  id?: string;
  similarity?: number;
  snippet?: string;
  url?: string;
  doc_title?: string;
  section_path?: string[];
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  sources?: Source[];
};

type ToolStatus = {
  tool: string;
  status: "running" | "completed";
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
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null);
  const [docCount, setDocCount] = useState<number | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [sidebarSources, setSidebarSources] = useState<Source[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyMessage = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback: 보안 컨텍스트가 아닐 때
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // ignore
      }
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);
  }, []);

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const scrollToLastUserMessage = useCallback(() => {
    const id = lastUserIdRef.current;
    if (!id) return;
    const container = messagesRef.current;
    const el = document.getElementById(`msg-${id}`);
    if (container && el) {
      const top = el.offsetTop - container.offsetTop - 16;
      container.scrollTo({ top, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => scrollToLastUserMessage(), 0);
    return () => clearTimeout(timer);
  }, [messages.length, scrollToLastUserMessage]);

  const sendMessage = useCallback(
    async (override?: string) => {
      const question = (override ?? input).trim();
      if (!question || isLoading) return;
      setInput("");
      setError(null);
      setIsLoading(true);
      setToolStatus(null);
      setDocCount(null);

      const userId = crypto.randomUUID();
      const streamingId = crypto.randomUUID();

      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: question, created_at: new Date().toISOString() },
        { id: streamingId, role: "assistant", content: "", created_at: new Date().toISOString(), sources: [] },
      ]);
      lastUserIdRef.current = userId;
      scrollToLastUserMessage();

      const updateAssistant = (content: string, sources?: Source[]) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingId
              ? { ...m, content, sources: sources ?? m.sources }
              : m,
          ),
        );
      };

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        let acc = "";
        const res = await fetch("/api/chat?stream=1", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ question, threadId }),
          signal: controller.signal,
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
                } else if (payload.type === "context") {
                  if (typeof payload.docCount === "number") setDocCount(payload.docCount);
                } else if (payload.type === "tool") {
                  setToolStatus({ tool: payload.tool, status: payload.status });
                } else if (payload.type === "done") {
                  const sources: Source[] = Array.isArray(payload.sources) ? payload.sources : [];
                  updateAssistant(acc || payload.answer || "답변을 생성하지 못했습니다.", sources);
                  setSidebarSources(sources.slice(0, 6));
                  setToolStatus(null);
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
          acc = data.answer ?? "답변을 생성하지 못했습니다.";
          const sources: Source[] = data.sources ?? [];
          updateAssistant(acc, sources);
          setSidebarSources(sources.slice(0, 6));
        }
      } catch (err) {
        const aborted = err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message));
        if (aborted) {
          // 중단됐을 때: 지금까지 쌓인 acc가 있으면 메시지에 [중단됨] 표시, 없으면 제거
          setMessages((prev) =>
            prev.flatMap((m) => {
              if (m.id !== streamingId) return [m];
              return m.content ? [{ ...m, content: `${m.content}\n\n_답변이 중단되었습니다._` }] : [];
            }),
          );
        } else {
          setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
          setMessages((prev) => prev.filter((m) => m.id !== streamingId));
        }
      } finally {
        abortRef.current = null;
        setIsLoading(false);
        setToolStatus(null);
      }
    },
    [input, isLoading, threadId, scrollToLastUserMessage],
  );

  const regenerate = useCallback(() => {
    if (isLoading) return;
    // 마지막 user 메시지 찾기
    let lastUserMessage: Message | null = null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") {
        lastUserMessage = messages[i];
        break;
      }
    }
    if (!lastUserMessage) return;
    // 가장 마지막 assistant 메시지 제거 후 재호출
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") return prev.slice(0, -1);
      return prev;
    });
    void sendMessage(lastUserMessage.content);
  }, [isLoading, messages, sendMessage]);

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
        <div className="mx-auto grid h-full w-full max-w-5xl grid-cols-1 gap-6 px-4 pb-64 pt-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
            <div
              ref={messagesRef}
              className="flex-1 overflow-auto pr-1"
              style={{
                scrollBehavior: "smooth",
                paddingBottom: "180px",
                maxHeight: "calc(100vh - 220px)",
              }}
            >
              {messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
                  <div className="text-2xl font-semibold tracking-tight">무엇이든 물어보세요</div>
                  <p className="max-w-md text-sm text-muted-foreground">
                    사내 문서와 웹을 함께 활용해 답변합니다. 필요한 경우 챗봇이 알아서 웹 검색을 호출합니다.
                  </p>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isLastAssistant =
                    m.role === "assistant" && idx === messages.length - 1 && Boolean(m.content);
                  return (
                    <div
                      key={m.id}
                      id={`msg-${m.id}`}
                      className={cn(
                        "group/msg flex",
                        m.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      <div className="flex max-w-[min(720px,100%)] flex-col gap-1">
                        <div
                          className={cn(
                            "rounded-2xl px-5 py-4 text-sm leading-6 shadow-sm",
                            m.role === "user"
                              ? "bg-gradient-to-br from-emerald-600 via-cyan-600 to-sky-600 text-white"
                              : "border bg-card text-foreground",
                          )}
                        >
                          {m.role === "assistant" ? (
                            m.content ? (
                              <Markdown content={m.content} />
                            ) : (
                              <span className="inline-flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> 답변 준비 중...
                              </span>
                            )
                          ) : (
                            <p className="whitespace-pre-wrap">{m.content}</p>
                          )}
                        </div>
                        {m.role === "assistant" && m.content ? (
                          <div
                            className={cn(
                              "flex items-center gap-1 px-1 text-xs text-muted-foreground",
                              "opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100",
                            )}
                          >
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
                              onClick={() => void copyMessage(m.id, m.content)}
                              aria-label="답변 복사"
                            >
                              {copiedId === m.id ? (
                                <>
                                  <Check className="h-3.5 w-3.5" /> 복사됨
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" /> 복사
                                </>
                              )}
                            </button>
                            {isLastAssistant && !isLoading ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
                                onClick={regenerate}
                                aria-label="답변 재생성"
                              >
                                <RefreshCw className="h-3.5 w-3.5" /> 재생성
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {isLoading ? (
              <div className="flex flex-col gap-2">
                {docCount !== null ? (
                  <div className="flex max-w-[min(720px,100%)] items-center gap-2 rounded-xl border bg-card/80 px-3 py-2 text-xs text-muted-foreground">
                    <Search className="h-3.5 w-3.5" />
                    사내 문서 {docCount}건 조회됨
                  </div>
                ) : null}
                {toolStatus?.tool === "web_search" ? (
                  <div className="flex max-w-[min(720px,100%)] items-center gap-2 rounded-xl border bg-card/80 px-3 py-2 text-xs text-muted-foreground">
                    {toolStatus.status === "running" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Globe className="h-3.5 w-3.5" />
                    )}
                    {toolStatus.status === "running" ? "웹 검색 중..." : "웹 검색 완료"}
                  </div>
                ) : null}
                <div className="flex max-w-[min(720px,100%)] items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> 답변 생성 중...
                </div>
              </div>
            ) : null}
          </div>

          {sidebarSources.length ? (
            <aside className="sticky top-6 hidden h-fit rounded-2xl border bg-card/85 p-4 shadow-sm lg:block">
              <div className="text-sm font-semibold text-foreground">출처</div>
              <div className="mt-3 space-y-3">
                {sidebarSources.map((src) => (
                  <div
                    key={`${src.id ?? src.url ?? src.order}`}
                    className="rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {src.url ? <Globe className="h-3 w-3" /> : <FileText className="h-3 w-3" />}#{src.order}
                      </span>
                      {typeof src.similarity === "number" ? (
                        <span className="font-mono">sim {src.similarity.toFixed(2)}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-sm font-medium text-foreground">
                      {src.doc_title ||
                        (src.url
                          ? (() => {
                              try {
                                return new URL(src.url).hostname;
                              } catch {
                                return "출처";
                              }
                            })()
                          : "출처")}
                    </div>
                    {src.section_path && src.section_path.length > 0 ? (
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {src.section_path.join(" › ")}
                      </div>
                    ) : null}
                    {src.url ? (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
                      >
                        <Link2 className="h-3 w-3" /> 열기
                      </a>
                    ) : null}
                    {src.snippet ? (
                      <div className="mt-2 line-clamp-3 text-xs text-foreground/80">{src.snippet}</div>
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
                placeholder="무엇이든 물어보세요. (Enter 전송 / Shift+Enter 줄바꿈)"
                className="min-h-[72px] resize-none border-none bg-transparent p-0 text-sm leading-6 shadow-none focus-visible:ring-0"
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
                </div>

                {isLoading ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-10 w-10 rounded-full shadow-sm"
                    onClick={stopGenerating}
                    aria-label="생성 중단"
                    title="생성 중단"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    className="h-10 w-10 rounded-full shadow-sm"
                    onClick={() => void sendMessage()}
                    disabled={!input.trim()}
                    aria-label="전송"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
