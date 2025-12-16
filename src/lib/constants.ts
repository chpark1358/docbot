export const STORAGE_BUCKET = "documents";

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export const CHUNK_SIZE = 900;
export const CHUNK_OVERLAP = 150;

export const EMBEDDING_MODEL = "text-embedding-3-small";
