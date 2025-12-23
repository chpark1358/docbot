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
};

export const parseBufferToText = async (buffer: Buffer, mimeType: string): Promise<string> => {
  const kind = detectKind(mimeType);

  switch (kind) {
    case "pdf": {
      const pdfModule = (await import("pdf-parse")) as unknown as Record<string, unknown>;

      // pdf-parse의 기본 함수만 사용하여 canvas/DOM 의존성을 제거
      const parseFn = pdfModule.default ?? pdfModule;
      if (typeof parseFn !== "function") {
        throw new Error("pdf-parse 기본 함수를 찾을 수 없습니다.");
      }
      ensurePdfDomStubs();
      const result = await (parseFn as (data: Buffer) => Promise<{ text?: string }>)(buffer);
      return result.text ?? "";
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
