import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileText, Globe, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isVirtualChatDocument } from "@/lib/virtual-chat";
import { ChatClient } from "./chat-client";

export const dynamic = "force-dynamic";

type Params = {
  params: { threadId: string } | Promise<{ threadId: string }>;
};

export default async function ChatThreadPage({ params }: Params) {
  const { threadId } = await Promise.resolve(params);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id, title, document_id, user_id")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .single();

  if (!thread) {
    notFound();
  }

  const { data: document } = await supabase
    .from("documents")
    .select("id, title, status, mime_type")
    .eq("id", thread.document_id)
    .eq("user_id", user.id)
    .single();

  if (!document) {
    notFound();
  }

  const virtualChat = isVirtualChatDocument(document.mime_type);

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at, sources")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              {virtualChat ? <Globe className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              {virtualChat ? "웹 검색" : "문서"}
            </div>
            <div className="truncate text-lg font-semibold">{virtualChat ? thread.title : document.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {virtualChat ? "문서 없이 질문하고, 필요하면 웹 검색 결과를 활용해 답합니다." : thread.title}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/app/documents">
              <Button variant="outline" size="sm" className="gap-2">
                <Library className="h-4 w-4" /> 문서 라이브러리
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ChatClient
          threadId={threadId}
          initialMessages={
            messages?.filter((m) => m.role !== "system").map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              created_at: m.created_at,
              sources: m.sources ?? [],
            })) ?? []
          }
        />
      </div>
    </div>
  );
}
