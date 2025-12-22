import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Params = {
  params: { id: string } | Promise<{ id: string }>;
};

export default async function DocumentChatPage({ params }: Params) {
  const { id: documentId } = await Promise.resolve(params);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: document } = await supabase
    .from("documents")
    .select("id, title, user_id, status")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .single();

  if (!document) {
    notFound();
  }

  // 기존 스레드 탐색 or 생성 후 스레드 기반 페이지로 이동
  const { data: threads } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("document_id", documentId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  let threadId = threads?.[0]?.id as string | undefined;

  if (!threadId) {
    const { data: inserted } = await supabase
      .from("chat_threads")
      .insert({
        document_id: documentId,
        user_id: user.id,
        title: `${document.title.slice(0, 40)} 대화`,
      })
      .select("id")
      .single();
    threadId = inserted?.id;
  }

  if (!threadId) {
    notFound();
  }

  redirect(`/app/chats/${threadId}`);
}
