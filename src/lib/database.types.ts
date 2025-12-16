/**
 * Supabase Database 타입은 향후 supabase 타입 생성기로 대체 예정.
 * 스키마가 확정되기 전까지는 좁은 범위의 any를 사용한다.
 */
export type Database = Record<string, unknown>;
