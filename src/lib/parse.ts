type MimeKind = "pdf" | "docx" | "txt" | "unknown";

const detectKind = (mimeType: string): MimeKind => {
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("wordprocessingml")) return "docx";
  if (mimeType.includes("haansoft")) return "docx";
  if (mimeType.startsWith("text/")) return "txt";
  return "unknown";
};

type MammothModule = { extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }> };

// 선택적 캔버스 로더(@napi-rs/canvas가 있을 때만 사용)
type CanvasModule = {
  createCanvas: (w: number, h: number) => { getContext: (type: "2d") => unknown; toDataURL: () => string; width: number; height: number };
};

const loadCanvasModule = (): CanvasModule | null => {
  try {
    // turbopack 번들 회피
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const req = eval("require") as NodeRequire;
    const mod = req("@napi-rs/canvas") as Partial<CanvasModule>;
    if (mod && typeof mod.createCanvas === "function") return mod as CanvasModule;
  } catch {
    // optional
  }
  return null;
};

// pdfjs로 첫 페이지를 렌더링해 PNG data URL을 만든다(캔버스 모듈이 있을 때만)
const renderFirstPageToPng = async (buffer: Buffer): Promise<string | null> => {
  const canvasMod = loadCanvasModule();
  if (!canvasMod) return null;

  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjs as any).GlobalWorkerOptions.workerSrc = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(buffer) }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = canvasMod.createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    // pdf.js가 요구하는 canvasFactory 구현
    const canvasFactory = {
      create: (width: number, height: number) => {
        const c = canvasMod.createCanvas(width, height);
        const ctx = c.getContext("2d");
        return { canvas: c, context: ctx };
      },
      reset: (c: { canvas: { width: number; height: number }; context: unknown }, width: number, height: number) => {
        if (c?.canvas) {
          c.canvas.width = width;
          c.canvas.height = height;
        }
      },
      destroy: (c: { canvas?: { width: number; height: number }; context?: unknown }) => {
        if (c?.canvas) {
          c.canvas.width = 0;
          c.canvas.height = 0;
        }
      },
    };

    await page.render({ canvasContext: context as unknown, viewport, canvasFactory }).promise;
    return canvas.toDataURL();
  } catch (err) {
    console.warn("renderFirstPageToPng failed", err);
    return null;
  }
};

// Vision OCR: 텍스트가 거의 없을 때만, 첫 페이지 PNG를 사용해 gpt-4o-mini 비전 호출
const ocrPdfWithVision = async (buffer: Buffer): Promise<string> => {
  if (!process.env.OPENAI_API_KEY) return "";

  try {
    const pngDataUrl = await renderFirstPageToPng(buffer);
    if (!pngDataUrl) return "";

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "이미지에서 텍스트만 추출하세요. 요약/변환 없이 원문 그대로, 줄바꿈은 유지해 주세요.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "이 이미지에서 글자를 그대로 추출해 주세요." },
            { type: "image_url", image_url: { url: pngDataUrl } },
          ],
        },
      ],
      temperature: 0,
    });

    const out = res.choices?.[0]?.message?.content;
    return typeof out === "string" ? out : "";
  } catch (err) {
    console.warn("Vision OCR fallback failed", err);
    return "";
  }
};

// pdf-parse 내부에서 pdfjs-dist를 거치며 DOMMatrix 등이 참조될 수 있어 최소 스텁을 보강
const ensurePdfDomStubs = () => {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    g.DOMMatrix = class {
      constructor(_init?: unknown) {}
    } as unknown;
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = class {
      constructor(_path?: string) {}
    } as unknown;
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = class {
      constructor(_data?: unknown, _w?: number, _h?: number) {}
    } as unknown;
  }
  if (typeof g.CanvasRenderingContext2D === "undefined") {
    g.CanvasRenderingContext2D = class {} as unknown;
  }
  if (typeof g.HTMLCanvasElement === "undefined") {
    g.HTMLCanvasElement = class {} as unknown;
  }
  if (typeof g.Image === "undefined") {
    g.Image = class {} as unknown;
  }
  // @napi-rs/canvas가 있으면 연결
  try {
    // turbopack에서 번들링을 피하기 위해 eval 사용
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const req = eval("require") as NodeRequire;
    const mod = req("@napi-rs/canvas");
    const Canvas = (mod as { Canvas?: unknown }).Canvas;
    const Image = (mod as { Image?: unknown }).Image;
    if (!g.CanvasRenderingContext2D && Canvas) {
      g.CanvasRenderingContext2D = (Canvas as { prototype?: unknown }).prototype as unknown;
    }
    if (!g.Image && Image) {
      g.Image = Image as unknown;
    }
  } catch {
    // optional, ignore
  }
};

const loadPdfParse = async () => {
  // 1) CJS require 우선 시도
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const req = eval("require") as NodeRequire;
    const mod = req("pdf-parse");
    if (typeof mod === "function") return mod as (data: Buffer) => Promise<{ text?: string }>;
    if (typeof (mod as { default?: unknown }).default === "function") {
      return (mod as { default: (data: Buffer) => Promise<{ text?: string }> }).default;
    }
    if (typeof (mod as { parse?: unknown }).parse === "function") {
      return (mod as { parse: (data: Buffer) => Promise<{ text?: string }> }).parse;
    }
  } catch {
    // ignore and fall through
  }

  // 2) ESM import fallback
  try {
    const mod = (await import("pdf-parse")) as unknown as Record<string, unknown>;
    const fn = (mod as { default?: unknown }).default ?? (mod as { parse?: unknown }).parse ?? mod;
    if (typeof fn === "function") return fn as (data: Buffer) => Promise<{ text?: string }>;
  } catch {
    // ignore
  }

  // 3) 최종 fallback: 빈 텍스트를 반환해 전체 파이프라인이 중단되지 않도록
  return async (_data: Buffer) => ({ text: "" });
};

const fallbackPdfText = async (buffer: Buffer): Promise<string> => {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // 워커 없이 동기 모드
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjs as any).GlobalWorkerOptions.workerSrc = undefined;
    // pdf.js는 ArrayBuffer/TypedArray 입력이 가장 안정적
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(buffer) }).promise;
    const texts: string[] = [];
    // 매우 큰 PDF에서 시간 초과를 피하기 위해 상한 적용(필요시 상향)
    const pageCount = Math.min(doc.numPages ?? 0, 200);
    for (let p = 1; p <= pageCount; p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pageText = (content.items ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((it: any) => (typeof it.str === "string" ? it.str : ""))
        .join(" ");
      texts.push(pageText);
    }
    return texts.join("\n").trim();
  } catch (err) {
    console.warn("pdfjs fallback failed", err);
    return "";
  }
};

export const parseBufferToText = async (buffer: Buffer, mimeType: string): Promise<string> => {
  const kind = detectKind(mimeType);

  switch (kind) {
    case "pdf": {
      ensurePdfDomStubs(); // pdf-parse import 시점에 DOM 의존성을 만족시키기 위해 선행
      const parseFn = await loadPdfParse();
      try {
        const result = await parseFn(buffer);
        const text = result.text ?? "";
        if (text.trim().length > 20) return text;
        // 텍스트가 거의 없으면 pdfjs 재시도 → 그래도 없으면 Vision OCR
        const fb = await fallbackPdfText(buffer);
        if (fb.trim().length > 0) return fb;
        const ocr = await ocrPdfWithVision(buffer);
        return ocr || text;
      } catch (err) {
        // pdfjs/canvas 의존성 문제 시 실패하지 않고 빈 텍스트로 처리
        console.warn("pdf parse failed, returning empty text", err);
        const fb = await fallbackPdfText(buffer);
        if (fb.trim().length > 0) return fb;
        const ocr = await ocrPdfWithVision(buffer);
        return ocr || "";
      }
    }
    case "docx": {
      const mammothModule = (await import("mammoth")) as unknown as { default?: MammothModule } & MammothModule;
      const mammoth: MammothModule = mammothModule.default ?? mammothModule;
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "txt": {
      return buffer.toString("utf-8");
    }
    default:
      throw new Error(`지원하지 않는 파일 형식입니다: ${mimeType}`);
  }
};
