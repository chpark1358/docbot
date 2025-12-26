import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

type Mode = "org" | "requester";

type IngestBody = {
  status?: string; // 예: "status>solved" 또는 "status:solved status:closed"
  months?: number; // 최근 N개월
  tags?: string[]; // 포함 태그 (옵션)
  exclude_tags?: string[]; // 제외 태그 (옵션)
  persist?: boolean; // true면 DB에 저장
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
  const url = `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(query)}&per_page=200`;

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
        {
          error: `Zendesk 오류: ${res.status} ${res.statusText}`,
          detail: text.slice(0, 500),
          subdomain,
          email_hint: email.split("@")[0],
          url,
        },
        { status: res.status },
      );
    }

    const data = (await res.json()) as { results?: Array<Record<string, unknown>>; next_page?: string | null };
    const items = data.results ?? [];

    if (body.persist) {
      try {
        const service = createServiceClient();
        const rows = items.map((r) => ({
          id: Number(r.id),
          subject: typeof r.subject === "string" ? r.subject : null,
          requester: typeof r.requester_id === "number" ? String(r.requester_id) : null,
          assignee: typeof r.assignee_id === "number" ? String(r.assignee_id) : null,
          status: typeof r.status === "string" ? r.status : null,
          tags: Array.isArray(r.tags) ? (r.tags as string[]) : null,
          solved_at: r.solved_at ? new Date(String(r.solved_at)).toISOString() : null,
          body_json: r,
        }));
        if (rows.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (service.from as any)("zendesk_raw_tickets").upsert(rows, { onConflict: "id" });
        }
      } catch (err) {
        // DB 저장 실패는 반환 payload에는 포함하되 요청 자체는 성공 처리
        return NextResponse.json(
          {
            query,
            count: items.length,
            next_page: data.next_page ?? null,
            items,
            warning: err instanceof Error ? err.message : "DB 저장 중 오류",
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json({
      query,
      count: items.length,
      next_page: data.next_page ?? null,
      items,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json(
      {
        error: `요청 실패: ${message}`,
        subdomain,
        email_hint: email.split("@")[0],
        url,
      },
      { status: 500 },
    );
  }
}
