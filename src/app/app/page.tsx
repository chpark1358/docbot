import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ALL_DOCS_MIME_TYPE, VIRTUAL_CHAT_MIME_TYPE } from "@/lib/constants";
import { NewChatComposer } from "./_components/new-chat-composer";

export const dynamic = "force-dynamic";

export default async function ChatHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { count: readyCount } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "ready")
    .neq("mime_type", VIRTUAL_CHAT_MIME_TYPE)
    .neq("mime_type", ALL_DOCS_MIME_TYPE);

  const displayName = (user.user_metadata as { display_name?: string } | null)?.display_name;
  const email = user.email ?? "사용자";
  const name = displayName || email;
  const readyDocs = readyCount ?? 0;

  return (
    <div className="relative h-full overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white via-emerald-50/40 to-white">
          <div className="absolute left-10 top-10 h-64 w-64 rounded-full bg-emerald-200/30 blur-3xl" />
          <div className="absolute right-10 top-24 h-64 w-64 rounded-full bg-amber-200/30 blur-3xl" />
          <div className="absolute left-1/2 top-48 h-80 w-80 -translate-x-1/2 rounded-full bg-sky-200/30 blur-3xl" />
        </div>

      <div className="relative mx-auto flex h-full w-full max-w-5xl flex-col items-center justify-center gap-8 px-6 py-10">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            만나서 반가워요! <span className="text-primary">{name}</span>님
          </h1>
          <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">
            업로드한 모든 문서를 통합해서 답변해요. 웹 검색 모드로 최신 정보도 함께 물어볼 수 있습니다.
          </p>
        </div>

        <div className="w-full">
          <NewChatComposer readyCount={readyDocs} />
        </div>

        {!readyDocs ? (
          <div className="text-center text-sm text-muted-foreground">
            먼저 문서를 업로드하고 처리 완료 후 채팅을 시작하세요.{" "}
            <Link href="/app/documents" className="text-primary underline-offset-4 hover:underline">
              문서 라이브러리로 이동
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
