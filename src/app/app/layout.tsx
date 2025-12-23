import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "./_components/app-sidebar";
import { UserMenu } from "./_components/user-menu";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: threads } = await supabase
    .from("chat_threads")
    .select("id, title, document_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const displayName = (user.user_metadata as { display_name?: string } | null)?.display_name;
  const email = user.email ?? "사용자";
  const name = displayName || email;

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <AppSidebar userEmail={name} threads={threads ?? []} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
          <div className="flex h-14 items-center justify-between px-6">
            <div className="font-semibold tracking-tight">Document Agent</div>
            <UserMenu email={name} />
          </div>
        </header>

        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
