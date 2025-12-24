"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type FaqItem = {
  id: number;
  faq_question: string | null;
  faq_answer: string | null;
  approved: boolean;
  candidate: boolean;
  reviewer: string | null;
  approved_at: string | null;
  intent_id: number | null;
  created_at?: string | null;
  raw_preview?: string | null;
  ticket_id?: number | null;
};

export default function ZendeskApprovePage() {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zendesk/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "candidate", limit: 100 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `로드 실패: ${res.status}`);
      }
      const data = (await res.json()) as { items?: any[] };
      const mapped: FaqItem[] =
        data.items?.map((i, idx) => ({
          id: Number(i.id ?? idx),
          faq_question: i.faq_question ?? "",
          faq_answer: i.faq_answer ?? "",
          approved: Boolean(i.approved),
          candidate: Boolean(i.candidate),
          reviewer: i.reviewer ?? null,
          approved_at: i.approved_at ?? null,
          intent_id: i.intent_id ?? null,
          created_at: i.created_at ?? null,
        })) ?? [];
      setItems(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로드 중 오류");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleAction = async (faq_id: number, mode: "approve" | "reject") => {
    try {
      const res = await fetch("/api/zendesk/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, faq_id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `처리 실패: ${res.status}`);
      }
      setItems((prev) =>
        prev.map((p) => (p.id === faq_id ? { ...p, approved: mode === "approve", candidate: false } : p)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "처리 중 오류");
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zendesk</div>
        <h1 className="text-2xl font-semibold">FAQ 후보 승인</h1>
        <p className="text-sm text-muted-foreground">자동 생성된 FAQ 후보를 승인 또는 반려합니다.</p>
      </div>

      {error ? <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      <ScrollArea className="h-[760px] rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-6 shadow-2xl">
        {loading ? <div className="text-sm text-muted-foreground">불러오는 중...</div> : null}
        <div className="grid gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-[0_18px_60px_-28px_rgba(0,0,0,0.25)] ring-1 ring-slate-100",
                item.approved ? "border-emerald-200 ring-emerald-100" : "",
              )}
            >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-600">FAQ 후보 #{item.id}</div>
                    <div className="text-base font-semibold text-slate-900 leading-tight">
                      {item.faq_question || "(질문 없음)"}
                    </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleAction(item.id, "reject")}>
                    반려
                  </Button>
                  <Button size="sm" onClick={() => handleAction(item.id, "approve")}>
                    승인
                  </Button>
                </div>
              </div>
              <Separator className="my-3" />
              <div className="text-sm text-slate-700 leading-6 whitespace-pre-wrap">{item.faq_answer || "(답변 없음)"}</div>
              <div className="mt-3 text-xs text-muted-foreground">
                상태: {item.approved ? "승인됨" : item.candidate ? "후보" : "반려됨"}{" "}
                {item.approved_at ? `· ${new Date(item.approved_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : ""}
              </div>
            </div>
          ))}
          {items.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 p-6 text-sm text-muted-foreground">
              후보가 없습니다. 파이프라인을 먼저 실행하세요.
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
