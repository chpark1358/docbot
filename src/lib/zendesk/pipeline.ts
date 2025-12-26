import { createServiceClient } from "@/lib/supabase/service";
import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const maskPII = (text: string) =>
  text
    // 이메일 마스킹
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
    // 전화번호 마스킹 (단순 패턴)
    .replace(/\b\d{2,3}-\d{3,4}-\d{4}\b/g, "[PHONE]");

const systemClean = `
다음 Zendesk 티켓의 본문에서 불필요한 인사, 감정 표현을 제거하고 질문/답변을 분리하세요.
반환 형식:
{
  "clean_question": "...",
  "clean_answer": "...",
  "environment_info": "..."
}
불확실하면 비워 둡니다.
반드시 JSON 문자열로만 답하세요. JSON 외 다른 텍스트는 포함하지 마세요.
`.trim();

const systemIntent = `
질문/답변을 의도/조건/문제 핵심으로 구조화하세요.
반환 형식:
{
  "intent_category": "...",
  "core_problem": "...",
  "condition": "...",
  "suspected_cause": "..."
}
반드시 JSON 문자열로만 답하세요. JSON 외 다른 텍스트는 포함하지 마세요.
`.trim();

const systemSolution = `
답변을 회사 기준의 절차형 단계로 정리하세요.
반환 형식:
{
  "solution_steps": ["1. ...", "2. ..."]
}
반드시 JSON 문자열로만 답하세요. JSON 외 다른 텍스트는 포함하지 마세요.
`.trim();

const systemFAQ = `
FAQ 후보를 생성하세요.
반환 형식:
{
  "faq_question": "...",
  "faq_answer": "원인, 확인 방법, 조치 사항 순서로 작성"
}
반드시 JSON 문자열로만 답하세요. JSON 외 다른 텍스트는 포함하지 마세요.
`.trim();

const model = process.env.CHAT_MODEL || "gpt-4o-mini";

// JSON 포맷 강제 추출용 래퍼 (Chat Completions)
const callJSON = async (messages: { role: "system" | "user"; content: string }[]) => {
  const res = await openai.chat.completions.create({
    model,
    messages,
    temperature: 0,
    response_format: { type: "json_object" },
  });
  return res.choices[0]?.message?.content ?? "{}";
};

export async function processTicket(rawId: number) {
  const supabase = createServiceClient();
  const { data: raw, error } = await (supabase.from as any)("zendesk_raw_tickets").select("*").eq("id", rawId).maybeSingle();
  if (error || !raw) throw new Error(error?.message ?? "raw ticket not found");

  const bodyText = JSON.stringify((raw as { body_json?: unknown }).body_json ?? {});
  const masked = maskPII(bodyText);

  // 1) 정제
  const cleanJson = JSON.parse(
    await callJSON([
      { role: "system", content: systemClean },
      { role: "user", content: masked },
    ]),
  ) as {
    clean_question?: string;
    clean_answer?: string;
    environment_info?: string;
  };

  const { data: cleanRow, error: cleanErr } = await (supabase.from as any)("zendesk_clean")
    .upsert(
      {
        raw_id: raw.id,
        clean_question: cleanJson.clean_question ?? "",
        clean_answer: cleanJson.clean_answer ?? "",
        environment_info: cleanJson.environment_info ?? "",
      },
      { onConflict: "raw_id" },
    )
    .select()
    .maybeSingle();

  if (cleanErr) throw new Error(`failed to upsert zendesk_clean: ${cleanErr.message}`);
  if (!cleanRow) throw new Error("failed to upsert zendesk_clean: no row returned");

  // 2) 의도
  const intentJson = JSON.parse(
    await callJSON([
      { role: "system", content: systemIntent },
      { role: "user", content: JSON.stringify(cleanRow) },
    ]),
  ) as {
    intent_category?: string;
    core_problem?: string;
    condition?: string;
    suspected_cause?: string;
  };

  const { data: intentRow, error: intentErr } = await (supabase.from as any)("zendesk_intent")
    .upsert(
      {
        clean_id: cleanRow.id,
        intent_category: intentJson.intent_category ?? "",
        core_problem: intentJson.core_problem ?? "",
        condition: intentJson.condition ?? "",
        suspected_cause: intentJson.suspected_cause ?? "",
      },
      { onConflict: "clean_id" },
    )
    .select()
    .maybeSingle();
  if (intentErr) throw new Error(`failed to upsert zendesk_intent: ${intentErr.message}`);
  if (!intentRow) throw new Error("failed to upsert zendesk_intent: no row returned");

  // 3) 솔루션
  const solJson = JSON.parse(
    await callJSON([
      { role: "system", content: systemSolution },
      { role: "user", content: JSON.stringify(intentRow) },
    ]),
  ) as { solution_steps?: string[] };

  const { data: solRow, error: solErr } = await (supabase.from as any)("zendesk_solution")
    .upsert(
      {
        intent_id: intentRow.id,
        solution_steps: solJson.solution_steps ?? [],
      },
      { onConflict: "intent_id" },
    )
    .select()
    .maybeSingle();
  if (solErr) throw new Error(`failed to upsert zendesk_solution: ${solErr.message}`);
  if (!solRow) throw new Error("failed to upsert zendesk_solution: no row returned");

  // 4) FAQ 후보
  const faqJson = JSON.parse(
    await callJSON([
      { role: "system", content: systemFAQ },
      { role: "user", content: JSON.stringify({ ...intentRow, solution_steps: solJson.solution_steps ?? [] }) },
    ]),
  ) as { faq_question?: string; faq_answer?: string };

  const { error: faqErr } = await (supabase.from as any)("zendesk_faq").upsert(
    {
      intent_id: intentRow.id,
      faq_question: faqJson.faq_question ?? "",
      faq_answer: faqJson.faq_answer ?? "",
      candidate: true,
      approved: false,
    },
    { onConflict: "intent_id" },
  );
  if (faqErr) throw new Error(`failed to upsert zendesk_faq: ${faqErr.message}`);

  return { raw_id: raw.id, clean_id: cleanRow.id, intent_id: intentRow.id, solution_id: solRow.id };
}

export async function processPending(limit = 20) {
  const supabase = createServiceClient();
  const { data: raws } = await (supabase.from as any)("zendesk_raw_tickets")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(limit);
  const results = [];
  for (const r of raws ?? []) {
    try {
      const res = await processTicket(r.id);
      results.push({ raw_id: r.id, ok: true, res });
    } catch (err) {
      results.push({ raw_id: r.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
