import { NextResponse } from "next/server";
import { processPending, processTicket } from "@/lib/zendesk/pipeline";

export async function POST(request: Request) {
  try {
    const { raw_ids, limit } = (await request.json().catch(() => ({}))) as { raw_ids?: number[]; limit?: number };

    if (Array.isArray(raw_ids) && raw_ids.length > 0) {
      const results = [];
      for (const id of raw_ids) {
        try {
          const res = await processTicket(id);
          results.push({ raw_id: id, ok: true, res });
        } catch (err) {
          results.push({ raw_id: id, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return NextResponse.json({ mode: "raw_ids", results });
    }

    const results = await processPending(limit ?? 10);
    return NextResponse.json({ mode: "pending", results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
