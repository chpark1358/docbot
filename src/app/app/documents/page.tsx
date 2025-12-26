import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ALL_DOCS_MIME_TYPE, VIRTUAL_CHAT_MIME_TYPE } from "@/lib/constants";
import { DocumentsClient } from "./documents-client";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, status, size, mime_type, created_at, updated_at, error_message, user_id, is_shared")
    .neq("status", "failed")
    .neq("mime_type", VIRTUAL_CHAT_MIME_TYPE)
    .neq("mime_type", ALL_DOCS_MIME_TYPE)
    .order("created_at", { ascending: false });

  const displayName = (user.user_metadata as { display_name?: string } | null)?.display_name;
  const email = user.email ?? "";
  const ownerLabel = displayName || (email ? email.split("@")[0] : "나");

  return <DocumentsClient currentUserId={user.id} ownerLabel={ownerLabel} documents={docs ?? []} />;
}
