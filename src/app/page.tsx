import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-lg space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Supabase 환경 변수가 필요합니다</h1>
          <p className="text-muted-foreground">
            NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 .env에 추가한 뒤 다시 시도해주세요.
          </p>
        </div>
      </main>
    );
  }

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  redirect(session ? "/app" : "/login");
}
