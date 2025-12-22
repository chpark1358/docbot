"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle, Plus, Search, Library, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type ThreadItem = {
  id: string;
  title: string;
  document_id: string;
  created_at: string;
};

type Props = {
  userEmail: string;
  threads: ThreadItem[];
};

const formatThreadDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}. ${match[2]}. ${match[3]}.`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}. ${m}. ${d}.`;
};

export function AppSidebar({ userEmail, threads }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ThreadItem[]>(threads);

  useEffect(() => {
    setItems(threads);
  }, [threads]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) => (t.title || "").toLowerCase().includes(q));
  }, [items, query]);

  const handleDelete = async (threadId: string) => {
    const ok = window.confirm("이 채팅을 삭제하시겠습니까?");
    if (!ok) return;
    try {
      const res = await fetch(`/api/chat/threads/${threadId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "삭제에 실패했습니다.");
      }
      setItems((prev) => prev.filter((t) => t.id !== threadId));
      if (pathname === `/app/chats/${threadId}`) {
        router.push("/app");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
    }
  };

  return (
    <aside className="hidden w-[320px] shrink-0 border-r bg-background/70 backdrop-blur-xl lg:flex lg:flex-col">
      <div className="flex h-14 items-center gap-2 px-6">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-cyan-500 text-white shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Enterprise</div>
          <div className="text-xs text-muted-foreground">문서 기반 챗봇</div>
        </div>
      </div>

      <div className="px-6 pb-4 pt-2">
        <div className="grid gap-2">
          <Link href="/app">
            <Button variant="secondary" className="w-full justify-start gap-2">
              <Plus className="h-4 w-4" /> 새 채팅
            </Button>
          </Link>
          <Link href="/app/documents">
            <Button variant="ghost" className="w-full justify-start gap-2">
              <Library className="h-4 w-4" /> 문서 라이브러리
            </Button>
          </Link>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="채팅 제목 검색"
              className="pl-8"
            />
          </div>
        </div>
      </div>

      <Separator />

      <div className="px-6 py-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chats</div>
      </div>

      <ScrollArea className="flex-1 px-3 pb-4">
        <div className="grid gap-1 px-3">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-background/60 p-4 text-sm text-muted-foreground">
              {items.length === 0 ? (
                <>
                  아직 대화가 없습니다.
                  <div className="mt-2">
                    <Link href="/app" className="text-primary underline-offset-4 hover:underline">
                      새 채팅 시작하기
                    </Link>
                  </div>
                </>
              ) : (
                "검색 결과가 없습니다."
              )}
            </div>
          ) : (
            filtered.map((t) => {
              const href = `/app/chats/${t.id}`;
              const active = pathname === href;
              return (
                <div
                  key={t.id}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition hover:bg-muted/60",
                    active ? "border-primary/30 bg-muted/70 shadow-sm" : "border-transparent",
                  )}
                >
                  <Link
                    href={href}
                    className="flex flex-1 items-center gap-3"
                  >
                    <div
                      className={cn(
                        "grid h-9 w-9 place-items-center rounded-xl border bg-background/60 text-muted-foreground shadow-sm transition group-hover:text-foreground",
                        active ? "border-primary/30 text-primary" : "border-border/60",
                      )}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate font-medium", active ? "text-foreground" : "text-foreground/90")}>
                        {t.title || "새 대화"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {formatThreadDate(t.created_at)}
                      </div>
                    </div>
                  </Link>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-destructive/40 text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDelete(t.id);
                    }}
                    title="채팅 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      <Separator />

      <div className="px-6 py-4">
        <div className="text-xs text-muted-foreground">로그인: {userEmail}</div>
      </div>
    </aside>
  );
}
