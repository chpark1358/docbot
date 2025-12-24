import { NextResponse } from "next/server";
import { embedFaq } from "@/lib/zendesk/embedding";

export async function POST(request: Request) {
  try {
    const { faq_ids, limit } = (await request.json().catch(() => ({}))) as { faq_ids?: number[]; limit?: number };

    if (Array.isArray(faq_ids) && faq_ids.length > 0) {
      const results = [];
      for (const id of faq_ids) {
        try {
          const res = await embedFaq(id);
          results.push({ faq_id: id, ok: true, res });
        } catch (err) {
          results.push({ faq_id: id, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return NextResponse.json({ mode: "faq_ids", results });
    }

    // 승인된 FAQ 중 아직 임베딩 없는 것 일부 처리 (옵션)
    // 단, 현재는 단순히 limit만큼 시도; 실제로는 join으로 미삽입만 대상으로 하는 뷰/쿼리 권장
    const n = limit ?? 10;
    return NextResponse.json({ warning: "faq_ids가 없으면 처리할 대상이 지정되지 않았습니다. faq_ids로 호출하세요.", limit: n });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
