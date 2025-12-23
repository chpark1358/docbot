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

const quote = (value: unknown) => {
  const s = value == null ? "" : String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
  const url = `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(query)}&per_page=200`;

  const fetchJson = async (endpoint: string) => {
    const r = await fetch(`https://${subdomain}.zendesk.com${endpoint}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`Zendesk ${endpoint} 실패: ${r.status}`);
    return r.json();
  };

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

    const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
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
        ticket_url: r.id ? `https://${subdomain}.zendesk.com/agent/tickets/${r.id}` : undefined,
      })) ?? [];

    const requesterIds = Array.from(new Set(items.map((i) => i.requester_id).filter(Boolean))) as (string | number)[];
    const assigneeIds = Array.from(new Set(items.map((i) => i.assignee_id).filter(Boolean))) as (string | number)[];
    const orgIds = Array.from(new Set(items.map((i) => i.organization_id).filter(Boolean))) as (string | number)[];

    const [usersMap, orgMap] = await Promise.all([
      (async () => {
        if (requesterIds.length === 0 && assigneeIds.length === 0) return new Map<string | number, string>();
        const ids = Array.from(new Set([...requesterIds, ...assigneeIds])).join(",");
        try {
          const resUsers = (await fetchJson(`/api/v2/users/show_many.json?ids=${ids}`)) as { users?: Array<{ id: number; name?: string; email?: string }> };
          const map = new Map<string | number, string>();
          resUsers.users?.forEach((u) => map.set(u.id, u.name || u.email || String(u.id)));
          return map;
        } catch {
          return new Map<string | number, string>();
        }
      })(),
      (async () => {
        if (orgIds.length === 0) return new Map<string | number, string>();
        const ids = orgIds.join(",");
        try {
          const resOrg = (await fetchJson(`/api/v2/organizations/show_many.json?ids=${ids}`)) as { organizations?: Array<{ id: number; name?: string }> };
          const map = new Map<string | number, string>();
          resOrg.organizations?.forEach((o) => map.set(o.id, o.name || String(o.id)));
          return map;
        } catch {
          return new Map<string | number, string>();
        }
      })(),
    ]);

    const enriched = items
      .map((item) => {
        const rid = item.requester_id as string | number | undefined;
        const aid = item.assignee_id as string | number | undefined;
        const oid = item.organization_id as string | number | undefined;
        return {
          ...item,
          requester_name: rid ? usersMap.get(rid) : undefined,
          assignee_name: aid ? usersMap.get(aid) : undefined,
          organization_name: oid ? orgMap.get(oid) : undefined,
        };
      })
      // 정렬: 생성일 최신순
      .sort((a, b) => {
        const ta = Date.parse(String(a.created_at ?? 0));
        const tb = Date.parse(String(b.created_at ?? 0));
        return Number.isNaN(tb - ta) ? 0 : tb - ta;
      });

    const headers = [
      "id",
      "subject",
      "status",
      "priority",
      "requester_name",
      "requester_id",
      "assignee_name",
      "assignee_id",
      "organization_name",
      "organization_id",
      "created_at",
      "updated_at",
      "ticket_url",
    ];

    const rows = enriched.map((i) => [
      i.id,
      i.subject,
      i.status,
      i.priority,
      i.requester_name,
      i.requester_id,
      i.assignee_name,
      i.assignee_id,
      i.organization_name,
      i.organization_id,
      i.created_at,
      i.updated_at,
      i.ticket_url,
    ]);

    const csv = [
      "\ufeff" + headers.join(","), // BOM 추가로 엑셀 한글 깨짐 방지
      ...rows.map((r) => r.map(quote).join(",")),
    ].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"zendesk_tickets.csv\"",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: `요청 실패: ${message}` }, { status: 500 });
  }
}
