import { NextResponse } from "next/server";
// Deprecated: 파일 본문을 직접 받지 않음. 사전 서명 URL + /api/documents/ingest 조합을 사용하세요.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "이 엔드포인트는 더 이상 사용되지 않습니다. /api/documents/upload-url + /api/documents/ingest를 사용하세요." },
    { status: 410 },
  );
}
