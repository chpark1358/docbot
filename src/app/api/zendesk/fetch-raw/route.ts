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
      query = query.limit(50);
    }
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 본문 스니펫 생성 (문자열화 후 앞부분 자르기)
    const items = (data ?? []).map((d: any) => {
      const rawText =
        typeof d.body_json === "string" ? d.body_json : d.body_json ? JSON.stringify(d.body_json) : "";
      const snippet = rawText.replace(/\s+/g, " ").slice(0, 400);
      return { ...d, snippet };
    });

    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "알 수 없는 오류" }, { status: 500 });
  }
}
