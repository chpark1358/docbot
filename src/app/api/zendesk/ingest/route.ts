import { NextResponse } from "next/server";

type Mode = "org" | "requester";

type IngestBody = {
  status?: string; // 예: "status>solved" 또는 "status:solved status:closed"
  months?: number; // 최근 N개월
  tags?: string[]; // 포함 태그 (옵션)
  exclude_tags?: string[]; // 제외 태그 (옵션)
};

const buildQuery = ({ status, months, tags, exclude_tags }: IngestBody) => {
  const parts: string[] = ["type:ticket"];
  if (status) parts.push(status);
  if (months && months > 0) {
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    parts.push(`updated>=${from.toISOString().slice(0, 10)}`);
  }
  if (tags?.length) {
    tags.forEach((t) => parts.push(`tags:${t}`));
  }
  if (exclude_tags?.length) {
    exclude_tags.forEach((t) => parts.push(`-tags:${t}`));
  }
  return parts.join(" ");
};

export async function POST(request: Request) {
  const subdomain = process.env.ZENDESK_SUBDOMAIN;
  const email = process.env.ZENDESK_EMAIL;
  const token = process.env.ZENDESK_API_TOKEN;

  if (!subdomain || !email || !token) {
    return NextResponse.json(
      { error: "Zendesk 설정이 없습니다. (ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN)" },
      { status: 500 },
    );
  }

  let body: IngestBody;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const query = buildQuery({
    status: body.status ?? "status:solved status:closed",
    months: body.months ?? 6,
    tags: body.tags ?? [],
    exclude_tags: body.exclude_tags ?? [],
  });

  const auth = Buffer.from(`${email}/token:${token}`).toString("base64");
  const url = `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(query)}&per_page=50`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Zendesk 오류: ${res.status} ${res.statusText}`, detail: text.slice(0, 500) },
        { status: res.status },
      );
    }

    const data = (await res.json()) as { results?: Array<Record<string, unknown>>; next_page?: string | null };
    return NextResponse.json({
      query,
      count: data.results?.length ?? 0,
      next_page: data.next_page ?? null,
      items: data.results ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: `요청 실패: ${message}` }, { status: 500 });
  }
}
