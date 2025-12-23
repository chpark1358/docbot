import { NextResponse } from "next/server";

type Mode = "org" | "requester";

type SearchBody = {
  mode?: Mode;
  org?: string;
  requester?: string;
  status?: string;
};

const buildQuery = ({ mode, org, requester, status }: Required<SearchBody>): string => {
  const parts: string[] = ["type:ticket"];
  if (status) parts.push(status);
  if (mode === "org" && org) {
    parts.push(`organization:${org.includes("*") ? org : `"${org}"`}`);
  }
  if (mode === "requester" && requester) {
    parts.push(`requester:${requester.includes("@") ? `"${requester}"` : requester}`);
  }
  return parts.join(" ");
};

export async function POST(request: Request) {
  const subdomain = process.env.ZENDESK_SUBDOMAIN;
  const email = process.env.ZENDESK_EMAIL;
  const token = process.env.ZENDESK_API_TOKEN;

  if (!subdomain || !email || !token) {
    return NextResponse.json({ error: "Zendesk 설정이 없습니다. (ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN)" }, { status: 500 });
  }

  let body: SearchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const mode: Mode = body.mode === "requester" ? "requester" : "org";
  const org = (body.org ?? "").trim();
  const requester = (body.requester ?? "").trim();
  const status = (body.status ?? "").trim();

  const query = buildQuery({ mode, org, requester, status });

  const auth = Buffer.from(`${email}/token:${token}`).toString("base64");
  const url = `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(query)}&per_page=20`;

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
      return NextResponse.json({ error: `Zendesk 오류: ${res.status} ${res.statusText}`, detail: text.slice(0, 500) }, { status: res.status });
    }

    const data = (await res.json()) as {
      results?: Array<Record<string, unknown>>;
      count?: number;
    };

    const items =
      data.results?.map((r) => ({
        id: r.id,
        subject: r.subject,
        status: r.status,
        priority: r.priority,
        created_at: r.created_at,
        updated_at: r.updated_at,
        assignee_id: r.assignee_id,
        requester_id: r.requester_id,
        organization_id: r.organization_id,
        tags: r.tags,
      })) ?? [];

    return NextResponse.json({ count: data.count ?? items.length, query, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: `요청 실패: ${message}` }, { status: 500 });
  }
}
