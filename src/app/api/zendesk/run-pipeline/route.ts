import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// 간단한 키 검사로 오남용 방지(선택)
const CRON_KEY = process.env.CRON_KEY;

async function call(path: string, key: string | null) {
  const res = await fetch(path, {
    method: "POST",
    headers: key ? { "X-CRON-KEY": key } : undefined,
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

    steps.push({ step: "fetch-raw", result: await call(`${origin}/api/zendesk/fetch-raw`, CRON_KEY ?? null) });
    steps.push({ step: "process", result: await call(`${origin}/api/zendesk/process`, CRON_KEY ?? null) });
    steps.push({ step: "ingest", result: await call(`${origin}/api/zendesk/ingest`, CRON_KEY ?? null) });

    return NextResponse.json({ ok: true, steps });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "파이프라인 실패" }, { status: 500 });
  }
}

