import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, FileText, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadForm } from "./_components/upload-form";
import { createClient } from "@/lib/supabase/server";

type DocumentRow = {
  id: string;
  title: string;
  status: string;
  size: number;
  mime_type: string;
  created_at: string;
  error_message: string | null;
};

const humanSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const statusColor = (status: string) => {
  switch (status) {
    case "ready":
      return "text-emerald-600";
    case "processing":
      return "text-amber-600";
    case "failed":
      return "text-red-600";
    default:
      return "text-muted-foreground";
  }
};

export default async function AppHome() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, status, size, mime_type, created_at, error_message")
    .order("created_at", { ascending: false })
    .returns<DocumentRow[] | null>();

  const email = session.user.email ?? "익명";

  return (
    <main className="flex min-h-screen flex-col gap-8 bg-background px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">로그인된 이메일</p>
            <p className="text-lg font-semibold">{email}</p>
          </div>
          <form action={logout}>
            <Button variant="outline" type="submit" className="gap-2">
              <LogOut className="h-4 w-4" /> 로그아웃
            </Button>
          </form>
        </header>

        <UploadForm />

        <Card>
          <CardHeader>
            <CardTitle>내 문서</CardTitle>
          </CardHeader>
          <CardContent>
            {!docs?.length ? (
              <p className="text-sm text-muted-foreground">업로드된 문서가 없습니다. 위에서 업로드를 시작하세요.</p>
            ) : (
              <div className="divide-y">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                  <div>
                    <p className="font-medium">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleString()} · {doc.mime_type} · {humanSize(doc.size)}
                    </p>
                        {doc.error_message ? (
                          <p className="text-xs text-destructive">에러: {doc.error_message}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-semibold ${statusColor(doc.status)}`}>
                        {doc.status === "ready"
                          ? "처리 완료"
                          : doc.status === "processing"
                            ? "처리 중"
                            : doc.status === "failed"
                              ? "실패"
                              : "대기"}
                      </span>
                      {doc.status === "ready" ? (
                        <Link href={`/app/documents/${doc.id}/chat`}>
                          <Button size="sm" variant="outline" className="gap-2">
                            <MessageCircle className="h-4 w-4" /> 대화하기
                          </Button>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

async function logout() {
  "use server";

  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
