import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

type Body =
  | {
      mode: "approve";
      faq_id: number;
      reviewer?: string;
    }
  | {
      mode: "reject";
      faq_id: number;
      reviewer?: string;
      reason?: string;
    };

export async function POST(request: Request) {
  const supabase = createServiceClient();
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  if (body.mode === "approve") {
    const { error } = await (supabase.from as any)("zendesk_faq").update({
      approved: true,
      candidate: false,
      reviewer: body.reviewer ?? null,
      approved_at: new Date().toISOString(),
    }).eq("id", body.faq_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.mode === "reject") {
    const { error } = await (supabase.from as any)("zendesk_faq").update({
      candidate: false,
      approved: false,
      reviewer: body.reviewer ?? null,
      approved_at: null,
    }).eq("id", body.faq_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "잘못된 mode" }, { status: 400 });
}
