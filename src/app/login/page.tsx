"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/browser";

type AuthMode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const redirectTo = searchParams.get("redirect") ?? "/app";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    startTransition(async () => {
      if (!email || !password) {
        setError("이메일과 비밀번호를 모두 입력해주세요.");
        return;
      }

      if (mode === "signup" && password.length < 8) {
        setError("비밀번호는 8자 이상이어야 합니다.");
        return;
      }

      const { data, error: authError } =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (mode === "signup") {
        setNotice("가입이 완료되었습니다. 받은 메일을 확인한 후 로그인하세요.");
        setMode("signin");
        return;
      }

      if (data.session) {
        router.replace(redirectTo);
        router.refresh();
      }
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold">문서 챗봇 로그인</h1>
          <p className="text-sm text-muted-foreground">
            업로드한 문서로 질의응답을 사용하려면 이메일로 로그인하세요.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              {mode === "signin" ? "로그인" : "회원가입"}
            </CardTitle>
            <CardDescription>
              {mode === "signin"
                ? "등록된 이메일과 비밀번호로 로그인하세요."
                : "새로운 계정을 생성합니다."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder="8자 이상 비밀번호"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              {notice ? (
                <p className="text-sm text-primary">{notice}</p>
              ) : null}
              <Button className="w-full" type="submit" disabled={isPending}>
                {isPending
                  ? "처리 중..."
                  : mode === "signin"
                    ? "로그인"
                    : "회원가입"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {mode === "signin" ? (
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => setMode("signup")}
                  disabled={isPending}
                >
                  계정이 없다면 회원가입
                </button>
              ) : (
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => setMode("signin")}
                  disabled={isPending}
                >
                  이미 계정이 있습니다
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
