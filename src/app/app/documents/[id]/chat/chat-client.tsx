"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  sources?: { id: string; order: number; similarity: number }[];
};

type Props = {
  documentId: string;
  initialThreadId: string;
  initialMessages: Message[];
};

export function ChatClient({ documentId, initialThreadId, initialMessages }: Props) {
  const [threadId, setThreadId] = useState(initialThreadId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const question = input.trim();
    setInput("");
    setError(null);
    setIsLoading(true);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, documentId, threadId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "질문 처리에 실패했습니다.");
      }

      if (data.threadId && data.threadId !== threadId) {
        setThreadId(data.threadId);
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer ?? "문서에서 확인되지 않음",
        created_at: new Date().toISOString(),
        sources: data.sources ?? [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "오류가 발생했습니다.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 메시지가 없습니다. 질문을 입력해보세요.</p>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={`${msg.id}-${idx}`}
              className={`rounded-lg border p-3 ${msg.role === "assistant" ? "bg-muted/50" : "bg-background"}`}
            >
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                {msg.role === "assistant" ? "Assistant" : "User"}
              </div>
              <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
              {msg.role === "assistant" && msg.sources?.length ? (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="font-semibold">출처</div>
                  <div className="flex flex-wrap gap-2">
                    {msg.sources.map((src) => (
                      <span key={`${src.id}-${src.order}`} className="rounded-full bg-muted px-2 py-1">
                        #{src.order} (sim {src.similarity.toFixed(2)})
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="문서 내용에 대해 질문하세요."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            disabled={isLoading}
          />
          <Button type="button" onClick={sendMessage} disabled={isLoading || !input.trim()}>
            {isLoading ? "전송 중..." : "전송"}
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">
          thread: {threadId} · 컨텍스트 기반 답변, 추측 금지
        </p>
      </div>
    </div>
  );
}
