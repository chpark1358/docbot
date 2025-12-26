import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { embedFaq } from "@/lib/zendesk/embedding";

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
    const { error } = await (supabase.from as any)("zendesk_faq")
      .update({
        approved: true,
        candidate: false,
        reviewer: body.reviewer ?? null,
        approved_at: new Date().toISOString(),
      })
      .eq("id", body.faq_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 승인 시 자동 임베딩 시도 (실패해도 승인 유지)
    let embedWarn: string | null = null;
    try {
      await embedFaq(body.faq_id);
    } catch (err) {
      embedWarn = err instanceof Error ? err.message : "임베딩 중 오류";
    }

    return NextResponse.json({ ok: true, embedWarn });
  }

  if (body.mode === "reject") {
    const { error } = await (supabase.from as any)("zendesk_faq")
      .update({
        candidate: false,
        approved: false,
        reviewer: body.reviewer ?? null,
        approved_at: null,
        // 이유 저장을 위해 metadata에 적재하는 것도 가능. 여기서는 reviewer 필드만 사용.
      })
      .eq("id", body.faq_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "잘못된 mode" }, { status: 400 });
}
