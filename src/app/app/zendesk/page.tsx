"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Mode = "org" | "requester";

export default function ZendeskPage() {
  const [mode, setMode] = useState<Mode>("org");
  const [org, setOrg] = useState("");
  const [requester, setRequester] = useState("");
  const [status, setStatus] = useState("status<closed");
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = () => {
    const payload =
      mode === "org"
        ? `조직: ${org || "(미입력)"}, 상태: ${status || "전체"}`
        : `요청자: ${requester || "(미입력)"}, 상태: ${status || "전체"}`;
    setMessage(`요청이 준비되었습니다. (샘플) ${payload}\n※ 실제 Zendesk API 연동은 이후 추가가 필요합니다.`);
  };

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-6 px-6 py-8">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Zendesk</p>
        <h1 className="text-2xl font-semibold tracking-tight">티켓 요약/내보내기 (프리셋)</h1>
        <p className="text-sm text-muted-foreground">
          조직 또는 요청자 기준으로 티켓을 조회하고 요약/CSV 내보내기를 실행할 수 있는 메뉴입니다. 현재는 UI만 제공하며,
          실제 Zendesk API 연동은 이후 연결합니다.
        </p>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="org">조직 기준</TabsTrigger>
          <TabsTrigger value="requester">요청자 기준</TabsTrigger>
        </TabsList>

        <TabsContent value="org" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org">조직명 (부분 매치는 * 사용)</Label>
            <Input
              id="org"
              placeholder="예: MyOrg 또는 MyOrg*"
              value={org}
              onChange={(e) => setOrg(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">미입력 시 조직 필터 없이 조회합니다.</p>
          </div>
        </TabsContent>

        <TabsContent value="requester" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="requester">요청자 (이메일 또는 이름)</Label>
            <Input
              id="requester"
              placeholder="예: user@example.com 또는 홍길동"
              value={requester}
              onChange={(e) => setRequester(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">미입력 시 요청자 필터 없이 조회합니다.</p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="space-y-2">
        <Label htmlFor="status">상태 필터</Label>
        <Input
          id="status"
          placeholder="예: status<closed (비우면 전체)"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Zendesk Search 쿼리 형식 사용. 비워두면 전체 상태를 조회합니다.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleSubmit}>요약 요청</Button>
        <Button variant="outline" onClick={() => { setOrg(""); setRequester(""); setStatus("status<closed"); setMessage(null); }}>
          초기화
        </Button>
      </div>

      {message ? (
        <div className="rounded-lg border bg-card p-4 text-sm leading-6 text-muted-foreground whitespace-pre-wrap">
          {message}
        </div>
      ) : null}
    </div>
  );
}
