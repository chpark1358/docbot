import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

type Mode = "org" | "requester";

type SupportBody = {
  mode?: Mode;
  org?: string;
  requester?: string;
  status?: string; // 예: "status:solved status:closed"
  months?: number; // 최근 N개월
  product_field_id?: number; // 커스텀 필드 ID (문의제품)
  handler_field_id?: number; // 커스텀 필드 ID (티켓처리자)
  label?: string; // 파일명에 쓸 라벨
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

const buildQuery = ({ mode, org, requester, status }: { mode: Mode; org: string; requester: string; status: string }) => {
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

  let body: SupportBody;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const mode: Mode = body.mode === "requester" ? "requester" : "org";
  const org = (body.org ?? "").trim();
  const requester = (body.requester ?? "").trim();
  const status = (body.status ?? "status:solved status:closed").trim();
  const labelRaw = (body.label ?? "").trim();
  const label = labelRaw || (mode === "org" ? org || "all" : requester || "all");
  const safeLabel = label.replace(/[^a-zA-Z0-9가-힣_-]+/g, "_") || "all";

  const months = body.months ?? 6;
  const productFieldEnv = process.env.ZENDESK_PRODUCT_FIELD_ID;
  const productFieldId = body.product_field_id ?? (productFieldEnv ? Number(productFieldEnv) : undefined);
  const handlerFieldEnv = process.env.ZENDESK_HANDLER_FIELD_ID;
  const handlerFieldId = body.handler_field_id ?? (handlerFieldEnv ? Number(handlerFieldEnv) : undefined);

  // 날짜 필터
  const from = new Date();
  from.setMonth(from.getMonth() - months);

  const query = `${buildQuery({ mode, org, requester, status })} updated>=${from.toISOString().slice(0, 10)}`;

  const auth = Buffer.from(`${email}/token:${token}`).toString("base64");

  const fetchJson = async (endpoint: string) => {
    const r = await fetch(`https://${subdomain}.zendesk.com${endpoint}`, {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Zendesk ${endpoint} 실패: ${r.status} ${text.slice(0, 200)}`);
    }
    return r.json();
  };

  try {
    const searchUrl = `https://${subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(query)}&per_page=200`;
    const res = await fetch(searchUrl, {
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

    const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const items = data.results ?? [];

    // 사용자/조직 ID 수집
    const requesterIds = Array.from(new Set(items.map((i) => i.requester_id).filter(Boolean))) as (string | number)[];
    const assigneeIds = Array.from(new Set(items.map((i) => i.assignee_id).filter(Boolean))) as (string | number)[];
    const orgIds = Array.from(new Set(items.map((i) => i.organization_id).filter(Boolean))) as (string | number)[];

    // 사용자/조직 정보 조회
    const [usersMap, orgMap] = await Promise.all([
      (async () => {
        if (requesterIds.length === 0 && assigneeIds.length === 0) return new Map<string | number, { name?: string; phone?: string; email?: string }>();
        const ids = Array.from(new Set([...requesterIds, ...assigneeIds])).join(",");
        try {
          const resUsers = (await fetchJson(`/api/v2/users/show_many.json?ids=${ids}`)) as {
            users?: Array<{ id: number; name?: string; email?: string; phone?: string }>;
          };
          const map = new Map<string | number, { name?: string; phone?: string; email?: string }>();
          resUsers.users?.forEach((u) => map.set(u.id, { name: u.name, phone: u.phone, email: u.email }));
          return map;
        } catch {
          return new Map<string | number, { name?: string; phone?: string; email?: string }>();
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

    const enriched = items.map((r) => {
      const rid = r.requester_id as string | number | undefined;
      const aid = r.assignee_id as string | number | undefined;
      const oid = r.organization_id as string | number | undefined;

      let product = "";
      let handler = "";
      const customFields = Array.isArray((r as any).custom_fields) ? ((r as any).custom_fields as Array<Record<string, unknown>>) : [];
      if (productFieldId && customFields.length) {
        const found = customFields.find((f) => Number((f as any).id) === Number(productFieldId));
        if (found) {
          const val = (found as any).value;
          product = typeof val === "string" ? val : Array.isArray(val) ? val.join(", ") : "";
        }
      }
      if (handlerFieldId && customFields.length) {
        const found = customFields.find((f) => Number((f as any).id) === Number(handlerFieldId));
        if (found) {
          const val = (found as any).value;
          handler = typeof val === "string" ? val : Array.isArray(val) ? val.join(", ") : "";
        }
      }

      const requester = rid ? usersMap.get(rid) : undefined;
      const assignee = aid ? usersMap.get(aid) : undefined;

      return {
        created_at: r.created_at,
        customer: oid ? orgMap.get(oid) ?? oid : "",
        phone: requester?.phone ?? "",
        product,
        subject: r.subject ?? "",
        assignee: handler || assignee?.name || assignee?.email || "",
      };
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Support");

    const headers = [
      { key: "created_at", header: "지원일자", width: 14 },
      { key: "customer", header: "고객사", width: 24 },
      { key: "phone", header: "전화번호", width: 16 },
      { key: "product", header: "제품군", width: 18 },
      { key: "subject", header: "문의 내용", width: 60 },
      { key: "assignee", header: "담당자", width: 16 },
    ];
    ws.columns = headers.map((h) => ({ key: h.key, header: h.header, width: h.width }));

    ws.getRow(1).font = { bold: true, color: { argb: "FF1F2937" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

    enriched.forEach((row) => {
      const created = row.created_at ? new Date(String(row.created_at)).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
      ws.addRow({
        created_at: created,
        customer: row.customer ?? "",
        phone: row.phone ?? "",
        product: row.product ?? "",
        subject: row.subject ?? "",
        assignee: row.assignee ?? "",
      });
    });

    ws.eachRow((r, idx) => {
      r.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      r.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
        if (idx === 1) {
          cell.font = { bold: true, color: { argb: "FF1F2937" } };
        }
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const today = new Date().toISOString().slice(0, 10);
    const baseName = `zendesk_${safeLabel}_${today}_기술지원_이력.xlsx`;
    const encodedName = encodeURIComponent(baseName);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // RFC 5987 방식으로 UTF-8 파일명 전달, ASCII 폴백도 함께 제공
        "Content-Disposition": `attachment; filename="support_history.xlsx"; filename*=UTF-8''${encodedName}`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "알 수 없는 오류" }, { status: 500 });
  }
}
