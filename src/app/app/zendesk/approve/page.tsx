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

type RawPreview = {
  id: number;
  subject?: string | null;
  body_json?: unknown;
};

const renderAnswer = (text: string | null) => {
  if (!text) return <span className="text-muted-foreground">(답변 없음)</span>;

  const sections = [
    { label: "원인", key: /원인[:：]/i },
    { label: "확인 방법", key: /확인[ ]?방법[:：]/i },
    { label: "조치 사항", key: /조치[ ]?사항[:：]/i },
  ];

  // 섹션별로 분리
  const chunks: { label: string; body: string }[] = [];
  let remaining = text;
  for (const { label, key } of sections) {
    const match = remaining.match(key);
    if (match) {
      const start = match.index ?? 0;
      const before = remaining.slice(0, start).trim();
      if (before) {
        // 이전 누락 구간을 일반 텍스트로 추가
        chunks.push({ label: "기타", body: before });
      }
      const after = remaining.slice(start + match[0].length).trim();
      // 다음 키워드 위치 찾기
      let nextPos = after.length;
      for (const { key: nextKey } of sections) {
        const m = after.match(nextKey);
        if (m && m.index !== undefined && m.index < nextPos) nextPos = m.index;
      }
      const body = after.slice(0, nextPos).trim();
      chunks.push({ label, body });
      remaining = after.slice(nextPos);
    }
  }
  if (remaining.trim()) {
    chunks.push({ label: "기타", body: remaining.trim() });
  }

  if (!chunks.length) {
    chunks.push({ label: "내용", body: text });
  }

  return (
    <div className="grid gap-2">
      {chunks.map((c, idx) => (
        <div key={`${c.label}-${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs font-semibold text-slate-700">[{c.label}]</div>
          <div className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{c.body}</div>
        </div>
      ))}
    </div>
  );
};

export default function ZendeskApprovePage() {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [raws, setRaws] = useState<Record<number, RawPreview>>({});
  const [loading, setLoading] = useState(false);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [processLoading, setProcessLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"candidate" | "approved">("candidate");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zendesk/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusFilter, limit: 100 }),
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
      // 원본 미리보기 가져오기 (id 매칭)
      const rawRes = await fetch("/api/zendesk/fetch-raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      const rawJson = await rawRes.json().catch(() => ({ items: [] as RawPreview[] }));
      const map: Record<number, RawPreview> = {};
      for (const r of rawJson.items ?? []) {
        if (typeof r.id === "number") map[r.id] = r;
      }
      setRaws(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로드 중 오류");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  const handlePipeline = async () => {
    if (pipelineLoading) return;
    setPipelineLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zendesk/run-pipeline", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? `파이프라인 실패: ${res.status}`);
      }
      alert("파이프라인 실행 완료: 티켓 수집 → 정제 → 후보 적재가 완료되었습니다. 다시 불러와 주세요.");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "파이프라인 실행 중 오류");
    } finally {
      setPipelineLoading(false);
    }
  };

  const handleIngestOnly = async () => {
    if (ingestLoading) return;
    setIngestLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zendesk/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "status:solved status:closed",
          months: 6,
          persist: true,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `ingest 실패: ${res.status}`);
      alert(`ingest 완료: ${data.count ?? 0}건`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ingest 실행 중 오류");
    } finally {
      setIngestLoading(false);
    }
  };

  const handleProcessOnly = async () => {
    if (processLoading) return;
    setProcessLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/zendesk/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50 }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `process 실패: ${res.status}`);
      alert(`process 완료: ${(data.results ?? []).length ?? 0}건`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "process 실행 중 오류");
    } finally {
      setProcessLoading(false);
    }
  };

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
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleIngestOnly} disabled={ingestLoading}>
              {ingestLoading ? "ingest 실행 중..." : "1) 티켓 수집(ingest)"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleProcessOnly} disabled={processLoading}>
              {processLoading ? "process 실행 중..." : "2) 정제/후보 생성(process)"}
            </Button>
            <Button variant="outline" size="sm" onClick={handlePipeline} disabled={pipelineLoading}>
              {pipelineLoading ? "파이프라인 실행 중..." : "원클릭 실행(ingest→process)"}
            </Button>
          </div>
          <span>※ ZENDESK_SUBDOMAIN / ZENDESK_EMAIL / ZENDESK_API_TOKEN / SUPABASE_SERVICE_ROLE_KEY 필요</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant={statusFilter === "candidate" ? "secondary" : "ghost"} size="sm" onClick={() => setStatusFilter("candidate")}>
          후보
        </Button>
        <Button variant={statusFilter === "approved" ? "secondary" : "ghost"} size="sm" onClick={() => setStatusFilter("approved")}>
          승인됨
        </Button>
      </div>

      {error ? <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      <ScrollArea className="h-[760px] rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-6 shadow-2xl">
        {loading ? <div className="text-sm text-muted-foreground">불러오는 중...</div> : null}
        <div className="grid gap-3">
          {items.map((item) => {
            const raw = item.intent_id ? raws[item.intent_id] : undefined;
            return (
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
              <div className="text-sm text-slate-700 leading-6">{renderAnswer(item.faq_answer)}</div>
              {raw ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <div className="font-semibold text-slate-800">원본 티켓 #{raw.id}</div>
                  <div className="mt-1 text-slate-700">{raw.subject ?? "(제목 없음)"}</div>
                  <div className="mt-1 line-clamp-3 text-slate-600">
                    {typeof raw.body_json === "string" ? raw.body_json.slice(0, 400) : JSON.stringify(raw.body_json)?.slice(0, 400)}
                  </div>
                </div>
              ) : null}
              <div className="mt-3 text-xs text-muted-foreground">
                상태: {item.approved ? "승인됨" : item.candidate ? "후보" : "반려됨"}{" "}
                {item.approved_at ? `· ${new Date(item.approved_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : ""}
              </div>
            </div>
            );
          })}
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
