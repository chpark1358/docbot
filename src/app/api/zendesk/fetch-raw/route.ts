import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const supabase = createServiceClient();
  const { raw_ids, limit } = (await request.json().catch(() => ({}))) as { raw_ids?: number[]; limit?: number };
  try {
    let query = (supabase.from as any)("zendesk_raw_tickets")
      .select("id, subject, body_json")
      .order("updated_at", { ascending: false });
    if (Array.isArray(raw_ids) && raw_ids.length) {
      query = query.in("id", raw_ids);
    } else if (limit) {
      query = query.limit(limit);
    } else {
      query = query.limit(20);
    }
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "알 수 없는 오류" }, { status: 500 });
  }
}
