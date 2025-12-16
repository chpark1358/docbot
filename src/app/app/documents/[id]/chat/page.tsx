import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatClient } from "./chat-client";

type Params = {
  params: {
    id: string;
  };
};

export default async function DocumentChatPage({ params }: Params) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const documentId = params.id;

  const { data: document } = await supabase
    .from("documents")
    .select("id, title, user_id, status")
    .eq("id", documentId)
    .single();

  if (!document || document.user_id !== session.user.id) {
    notFound();
  }

  // 기존 스레드 탐색 or 생성
  const { data: threads } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("document_id", documentId)
    .order("created_at", { ascending: true })
    .limit(1);

  let threadId = threads?.[0]?.id as string | undefined;

  if (!threadId) {
    const { data: inserted } = await supabase
      .from("chat_threads")
      .insert({
        document_id: documentId,
        user_id: session.user.id,
        title: `${document.title.slice(0, 40)} 대화`,
      })
      .select("id")
      .single();
    threadId = inserted?.id;
  }

  if (!threadId) {
    notFound();
  }

  type MessageRow = {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    created_at: string;
    sources: { id: string; order: number; similarity: number }[] | null;
  };

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at, sources")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .returns<MessageRow[] | null>();

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-background px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-muted-foreground">문서</p>
            <h1 className="text-2xl font-semibold">{document.title}</h1>
          </div>
        </div>

        <ChatClient
          documentId={document.id}
          initialThreadId={threadId}
          initialMessages={
            messages?.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              created_at: m.created_at,
              sources: m.sources ?? [],
            })) ?? []
          }
        />
      </div>
    </main>
  );
}
