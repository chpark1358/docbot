import { NextResponse } from "next/server";
// 간단한 키 검사로 오남용 방지(선택)
const CRON_KEY = process.env.CRON_KEY;

async function call(path: string, key: string | null, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      ...(key ? { "X-CRON-KEY": key } : {}),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? `${path} 실패`);
  }
  return data;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  // 간단한 키 검증
  if (CRON_KEY) {
    const key = req.headers.get("x-cron-key");
    if (key !== CRON_KEY) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const origin = base || `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}`;

  try {
    const steps = [] as { step: string; result: unknown }[];

    // 1) Zendesk 티켓 수집 + raw 저장
    steps.push({
      step: "ingest",
      result: await call(`${origin}/api/zendesk/ingest`, CRON_KEY ?? null, {
        status: "status:solved status:closed",
        months: 6,
        persist: true,
      }),
    });

    // 2) 정제/FAQ 후보 생성 (방금 수집한 raw를 우선적으로 처리)
    steps.push({
      step: "process",
      result: await call(`${origin}/api/zendesk/process`, CRON_KEY ?? null, { limit: 50 }),
    });

    return NextResponse.json({ ok: true, steps });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "파이프라인 실패" }, { status: 500 });
  }
}
