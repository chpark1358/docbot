import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "이 엔드포인트는 더 이상 사용되지 않습니다. /api/documents/upload-url + /api/documents/ingest를 사용하세요." },
    { status: 410 },
  );
}
