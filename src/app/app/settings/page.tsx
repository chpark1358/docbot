import { ToolConnectionCard } from "./_tool-card";

export const dynamic = "force-dynamic";

const SLACK_ICON = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
    <path d="M5 15a2 2 0 1 1 0-4h2v4H5zm5 0a2 2 0 1 1-4 0v-5a2 2 0 1 1 4 0v5zm-2-9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 1h5a2 2 0 1 1 0 4H8a2 2 0 0 1 0-4zm11 4a2 2 0 1 1-4 0V6a2 2 0 1 1 4 0v5zm-2 1a2 2 0 1 1 0 4h-2v-4h2zm-5 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5zm2 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
  </svg>
);

const NOTION_ICON = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M4 4.5 7 3l13 1v15.5L17 21 4 20V4.5z" />
    <path d="M7 3v17M9 7l8 .5v9L9 16V7z" />
  </svg>
);

const DRIVE_ICON = (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
    <path d="m7.71 3 8.58 14.85h-5.14L2.57 3h5.14zM14 13.5 9.43 21h8.57l4.57-7.5H14zm-1.86-3.21L9.43 5l-4.57 7.5 2.71 4.71 4.57-7.92z" opacity=".75" />
  </svg>
);

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          외부 도구
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">연결 관리</h1>
        <p className="max-w-2xl text-sm text-muted-foreground leading-6">
          AI 챗봇이 답변할 때 이 도구들을 활용할 수 있도록 연결하세요. 연결된 도구의 데이터에서 검색해 답변에 인용합니다.
          현재는 UI 미리보기 단계로, 실제 토큰 등록과 호출은 추후 지원될 예정입니다.
        </p>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ToolConnectionCard
          name="Slack"
          description="채널 메시지에서 검색해 답변에 활용합니다. (예: 인시던트 채널, 운영팀 채널)"
          icon={SLACK_ICON}
          accent="bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
        />
        <ToolConnectionCard
          name="Notion"
          description="워크스페이스의 페이지와 데이터베이스를 검색합니다. (예: 사내 위키, 회의록)"
          icon={NOTION_ICON}
          accent="bg-slate-200 text-slate-800 dark:bg-slate-500/20 dark:text-slate-200"
        />
        <ToolConnectionCard
          name="Google Drive"
          description="개인 드라이브의 문서를 검색합니다. 본인 계정에 연결됩니다. (Docs, Sheets, PDF)"
          icon={DRIVE_ICON}
          accent="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        />
      </section>

      <div className="mt-10 rounded-2xl border border-dashed bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
        <div className="font-medium text-foreground">곧 추가될 도구</div>
        <p className="mt-1 leading-6">
          Confluence, Jira, GitHub, Linear 등을 사용자 의견에 따라 우선순위대로 추가할 예정입니다.
        </p>
      </div>
    </div>
  );
}
