type MimeKind = "pdf" | "docx" | "txt" | "unknown";

const detectKind = (mimeType: string): MimeKind => {
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("wordprocessingml")) return "docx";
  if (mimeType.startsWith("text/")) return "txt";
  return "unknown";
};

type MammothModule = { extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }> };

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

export const parseBufferToText = async (buffer: Buffer, mimeType: string): Promise<string> => {
  const kind = detectKind(mimeType);

  switch (kind) {
    case "pdf": {
      ensurePdfDomStubs(); // pdf-parse import 시점에 DOM 의존성을 만족시키기 위해 선행
      const parseFn = await loadPdfParse();
      try {
        const result = await parseFn(buffer);
        return result.text ?? "";
      } catch (err) {
        // pdfjs/canvas 의존성 문제 시 실패하지 않고 빈 텍스트로 처리
        console.warn("pdf parse failed, returning empty text", err);
        return "";
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
