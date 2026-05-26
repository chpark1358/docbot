"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  name: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
};

export function ToolConnectionCard({ name, description, icon, accent }: Props) {
  const [notice, setNotice] = useState<string | null>(null);

  const handleConnect = () => {
    setNotice(`${name} 연결은 추후 지원 예정입니다.`);
    setTimeout(() => setNotice(null), 2500);
  };

  return (
    <div className="relative flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{name}</div>
          <div className="text-xs text-muted-foreground">미연결</div>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground leading-6">{description}</p>

      <div className="mt-5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          UI 미리보기
        </span>
        <Button size="sm" variant="outline" onClick={handleConnect}>
          연결
        </Button>
      </div>

      {notice ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-500/10 dark:text-amber-300">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
