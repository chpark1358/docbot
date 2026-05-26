# LLM Wiki Schema (이 프로젝트의 지식 운영 규칙)

## 폴더 의미
- `raw_sources/` : 원본. AI는 읽기만. 절대 수정 금지.
- `wiki/` : AI(Claude Code)가 만들고 갱신하는 마크다운 위키.
- `schema/` : 운영 규칙 문서.

## 페이지 규약
- 한 페이지 = 하나의 엔티티/개념. 파일명은 kebab-case.
- 모든 페이지는 frontmatter에 `created_from:` 으로 출처(raw_sources/<file>) 기록.
- 다른 페이지를 가리킬 때는 `[[페이지명]]` 위키링크.
- 충돌·미확정 정보는 `> [!conflict]` blockquote로 표시.

## AI 동작
- 새 문서가 `raw_sources/`에 추가되면: 읽고 핵심 개념 추출 → 기존 wiki 페이지와 비교 → 신규는 페이지 생성, 기존은 보강.
- 질문이 들어오면: `wiki/`를 먼저 본다. 부족하면 `graphify-out/GRAPH_REPORT.md` → jDocMunch/jCodeMunch 인덱스 → 마지막에 raw_sources.
- 모든 답은 출처(wiki 페이지명 또는 raw_sources 경로) 명시.
