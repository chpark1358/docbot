"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Mode = "org" | "requester";

export default function ZendeskPage() {
  const [mode, setMode] = useState<Mode>("org");
  const [org, setOrg] = useState("");
  const [requester, setRequester] = useState("");
  const [status, setStatus] = useState("status<closed");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [items, setItems] = useState<
    Array<{
      id: number | string;
      subject?: unknown;
      status?: unknown;
      priority?: unknown;
      created_at?: unknown;
      updated_at?: unknown;
      assignee_id?: unknown;
      requester_id?: unknown;
      organization_id?: unknown;
      requester_name?: unknown;
      assignee_name?: unknown;
      organization_name?: unknown;
      ticket_url?: unknown;
    }>
  >([]);

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    setItems([]);

    try {
      const res = await fetch("/api/zendesk/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, org, requester, status }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `요청 실패: ${res.status}`);
      }

      const data = (await res.json()) as { count: number; query: string; items: typeof items };
      setItems(data.items);
      setMessage(`검색 완료 (${data.count}건). 쿼리: ${data.query}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [mode, org, requester, status]);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const label = mode === "org" ? org || "all" : requester || "all";
      const res = await fetch("/api/zendesk/export-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, org, requester, status, label }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `CSV 다운로드 실패: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `zendesk_${label}_${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV 생성 중 오류가 발생했습니다.");
    } finally {
      setDownloading(false);
    }
  }, [downloading, mode, org, requester, status]);

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zendesk</p>
        <h1 className="text-2xl font-semibold tracking-tight">티켓 요약/내보내기 (프리셋)</h1>
        <p className="text-sm text-muted-foreground">
          조직 또는 요청자 기준으로 티켓을 조회하고 요약/CSV 내보내기를 실행할 수 있는 메뉴입니다. Zendesk API와 연동되어
          검색 결과를 바로 확인할 수 있습니다.
        </p>
      </div>

      <div className="grid w-full gap-3 rounded-2xl border bg-card/50 p-4 shadow-sm">
        <div className="grid gap-2">
          <Label>조회 기준</Label>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" value="org" checked={mode === "org"} onChange={() => setMode("org")} />
              조직 기준
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                value="requester"
                checked={mode === "requester"}
                onChange={() => setMode("requester")}
              />
              요청자 기준
            </label>
          </div>
        </div>

        {mode === "org" ? (
          <div className="grid gap-2">
            <Label htmlFor="org">조직명 (부분 매치는 * 사용)</Label>
            <Input
              id="org"
              placeholder="예: MyOrg 또는 MyOrg*"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">미입력 시 조직 필터 없이 조회합니다.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="requester">요청자 (이메일 또는 이름)</Label>
            <Input
              id="requester"
              placeholder="예: user@example.com 또는 홍길동"
              value={requester}
              onChange={(e) => setRequester(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">미입력 시 요청자 필터 없이 조회합니다.</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">상태 필터</Label>
        <select
          id="status"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">전체</option>
          <option value="status<closed">미해결 (닫힘 제외)</option>
          <option value="status<solved">진행중/대기 (해결/닫힘 제외)</option>
          <option value="status:open">열림만</option>
          <option value="status:pending">보류만</option>
          <option value="status:solved">해결됨</option>
          <option value="status:closed">닫힘</option>
        </select>
        <p className="text-xs text-muted-foreground">필요하면 검색 후 상태를 추가로 수정해 사용하세요.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleSubmit}>요약 요청</Button>
        <Button variant="secondary" onClick={handleDownload} disabled={downloading}>
          CSV 다운로드
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setOrg("");
            setRequester("");
            setStatus("status<closed");
            setMessage(null);
            setItems([]);
            setError(null);
          }}
        >
          초기화
        </Button>
        {loading ? <span className="text-sm text-muted-foreground">불러오는 중...</span> : null}
        {downloading ? <span className="text-sm text-muted-foreground">CSV 생성 중...</span> : null}
      </div>

      {message ? (
        <div className="rounded-lg border bg-card p-4 text-sm leading-6 text-muted-foreground whitespace-pre-wrap">{message}</div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-destructive/60 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      ) : null}

      {items.length > 0 ? (
        <ScrollArea className="h-[760px] rounded-2xl border bg-gradient-to-br from-white via-slate-50 to-slate-100 p-5 shadow-xl">
          <div className="grid gap-3">
            {items.map((item) => {
              const created =
                new Date(String(item.created_at ?? "")).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) || "-";
              const updated =
                new Date(String(item.updated_at ?? "")).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) || "-";
              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm shadow-lg ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-xl",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 items-center rounded-full bg-indigo-50 px-3 text-xs font-semibold text-indigo-700">
                          #{item.id}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {String(item.status ?? "-")}
                        </span>
                      </div>
                      <div className="mt-1 text-base font-semibold text-slate-900">
                        {String(item.subject ?? "(제목 없음)")}
                      </div>
                    </div>
                    {item.ticket_url ? (
                      <a
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 underline-offset-4 hover:bg-indigo-100 hover:underline"
                        href={String(item.ticket_url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        티켓 열기 ↗
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                    <div>요청자: {String(item.requester_name ?? "-")}</div>
                    <div>담당자: {String(item.assignee_name ?? "-")}</div>
                    <div>조직: {String(item.organization_name ?? "-")}</div>
                    <div>
                      생성: {created} / 업데이트: {updated} / 우선순위: {String(item.priority ?? "-")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      ) : null}
    </div>
  );
}
