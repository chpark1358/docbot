import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

type Mode = "org" | "requester";

type SearchBody = {
  mode?: Mode;
  org?: string;
  requester?: string;
  status?: string;
  label?: string;
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

const statusLabel = (s: unknown) => {
  switch (String(s || "").toLowerCase()) {
    case "new":
      return "신규";
    case "open":
      return "열림";
    case "pending":
      return "대기";
    case "hold":
      return "보류";
    case "solved":
      return "해결";
    case "closed":
      return "닫힘";
    default:
      return String(s || "");
  }
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
  const labelRaw = (body.label ?? "").trim();
  const label = labelRaw || (mode === "org" ? org || "all" : requester || "all");
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]+/g, "_") || "all";

  const query = buildQuery({ mode, org, requester, status, label });
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
      .sort((a, b) => {
        const ta = Date.parse(String(a.created_at ?? 0));
        const tb = Date.parse(String(b.created_at ?? 0));
        return Number.isNaN(tb - ta) ? 0 : tb - ta;
      });

    // --- XLSX 생성 ---
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tickets");

    const header = [
      { key: "id", header: "티켓ID", width: 12 },
      { key: "subject", header: "제목", width: 40 },
      { key: "status", header: "상태", width: 10 },
      { key: "priority", header: "우선순위", width: 12 },
      { key: "requester_name", header: "요청자", width: 20 },
      { key: "assignee_name", header: "담당자", width: 20 },
      { key: "organization_name", header: "조직", width: 22 },
      { key: "created_at", header: "생성 시각 (KST)", width: 22 },
      { key: "updated_at", header: "업데이트 (KST)", width: 22 },
      { key: "ticket_url", header: "티켓 링크", width: 28 },
    ];

    ws.columns = header.map((h) => ({ key: h.key, header: h.header, width: h.width }));

    ws.getRow(1).font = { bold: true, color: { argb: "FF1F2937" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

    enriched.forEach((row, idx) => {
      const created = row.created_at ? new Date(String(row.created_at)).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
      const updated = row.updated_at ? new Date(String(row.updated_at)).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
      const excelRow = ws.addRow({
        id: row.id,
        subject: row.subject ?? "",
        status: statusLabel(row.status),
        priority: row.priority ?? "",
        requester_name: row.requester_name ?? "",
        assignee_name: row.assignee_name ?? "",
        organization_name: row.organization_name ?? "",
        created_at: created,
        updated_at: updated,
        ticket_url: row.ticket_url ?? "",
      });
      excelRow.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      excelRow.getCell("ticket_url").alignment = { horizontal: "left", vertical: "middle" };
      // 지그재그 배경
      if (idx % 2 === 1) {
        excelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });

    // 링크 스타일 (하이퍼링크)
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cell = row.getCell("ticket_url");
      const link = cell.value ? String(cell.value) : "";
      if (link) {
        cell.value = { text: "열기", hyperlink: link };
        cell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
    });

    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="zendesk_${safeLabel}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: `요청 실패: ${message}` }, { status: 500 });
  }
}
