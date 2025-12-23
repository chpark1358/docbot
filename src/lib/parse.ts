type MimeKind = "pdf" | "docx" | "txt" | "unknown";

const detectKind = (mimeType: string): MimeKind => {
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("wordprocessingml")) return "docx";
  if (mimeType.startsWith("text/")) return "txt";
  return "unknown";
};

type MammothModule = { extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }> };

let pdfWorkerSetupPromise: Promise<void> | null = null;

const ensurePdfPolyfills = () => {
  // pdfjs가 Node에서 필요로 하는 최소 전역을 스텁으로 정의
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
      // Node 환경에서는 실제 픽셀 조작이 필요 없으므로 빈 스텁
      constructor(_data?: unknown, _w?: number, _h?: number) {}
    } as unknown;
  }
  if (typeof g.CanvasRenderingContext2D === "undefined") {
    g.CanvasRenderingContext2D = class {} as unknown;
  }
  if (typeof g.HTMLCanvasElement === "undefined") {
    g.HTMLCanvasElement = class {} as unknown;
  }
};

const ensurePdfWorkerSetup = async (PDFParse: unknown): Promise<void> => {
  if (pdfWorkerSetupPromise) return pdfWorkerSetupPromise;

  pdfWorkerSetupPromise = (async () => {
    const setWorker = (PDFParse as { setWorker?: (src: string) => void } | null)?.setWorker;
    if (typeof setWorker !== "function") return;

    try {
      // 1차: 번들 상대 경로(Next/Turbopack에서 import.meta.url 기반으로 치환됨)
      const workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
      setWorker(workerSrc);
    } catch {
      try {
        // 2차: node_modules 실제 경로(file://)로 지정
        const { createRequire } = await import("node:module");
        const { pathToFileURL } = await import("node:url");
        const require = createRequire(import.meta.url);
        const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
        setWorker(pathToFileURL(workerPath).toString());
      } catch {
        // worker 경로 지정이 실패해도 기본 동작으로 계속 진행합니다.
      }
    }
  })();

  return pdfWorkerSetupPromise;
};

export const parseBufferToText = async (buffer: Buffer, mimeType: string): Promise<string> => {
  const kind = detectKind(mimeType);

  switch (kind) {
    case "pdf": {
      const pdfModule = (await import("pdf-parse")) as unknown as Record<string, unknown>;

      // Legacy API: default export is a function
      const legacyFn = pdfModule.default ?? pdfModule;
      if (typeof legacyFn === "function") {
        const result = await (legacyFn as (data: Buffer) => Promise<{ text?: string }>)(buffer);
        return result.text ?? "";
      }

      // Current API: named export PDFParse (class)
      const PDFParse = pdfModule.PDFParse;
      if (typeof PDFParse === "function") {
        ensurePdfPolyfills();
        await ensurePdfWorkerSetup(PDFParse);

        const parser = new (PDFParse as new (options: { data: Buffer }) => {
          getText: () => Promise<{ text: string }>;
          destroy?: () => Promise<void> | void;
        })({ data: buffer });

        try {
          const result = await parser.getText();
          return result.text;
        } finally {
          await parser.destroy?.();
        }
      }

      throw new Error("PDF 파서를 초기화할 수 없습니다. (pdf-parse export 형태 확인 필요)");
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
