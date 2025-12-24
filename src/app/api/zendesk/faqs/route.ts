import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const supabase = createServiceClient();
  const { status, limit } = (await request.json().catch(() => ({}))) as { status?: "candidate" | "approved"; limit?: number };
  try {
    const q = (supabase.from as any)("zendesk_faq").select("*").order("created_at", { ascending: false });
    if (status === "candidate") q.eq("candidate", true).eq("approved", false);
    if (status === "approved") q.eq("approved", true);
    if (limit) q.limit(limit);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "알 수 없는 오류" }, { status: 500 });
  }
}
