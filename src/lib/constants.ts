export const STORAGE_BUCKET = "documents";

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024; // 30MB

export const CHUNK_SIZE = 900;
export const CHUNK_OVERLAP = 150;

export const EMBEDDING_MODEL = "text-embedding-3-small";

// Chat
export const CHAT_MODEL = "gpt-4o-mini";
export const WEB_SEARCH_CONTEXT_SIZE: "low" | "medium" | "high" = "low";

// 문서 없이도 대화(웹 검색/일반 챗)할 수 있도록, 내부적으로 사용하는 가상 문서 MIME 타입
export const VIRTUAL_CHAT_MIME_TYPE = "application/x-virtual-chat";
// 모든 업로드 문서를 대상으로 검색하는 가상 문서 MIME 타입
export const ALL_DOCS_MIME_TYPE = "application/x-all-docs";
