"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/browser";

type AuthMode = "signin" | "signup";

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [{ supabase, initError }] = useState(() => {
    try {
      return { supabase: createClient(), initError: null as string | null };
    } catch (error) {
      return {
        supabase: null,
        initError: error instanceof Error ? error.message : "Supabase 초기화에 실패했습니다.",
      };
    }
  });

  const [mode, setMode] = useState<AuthMode>("signin");
  const [identifier, setIdentifier] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const redirectTo = searchParams.get("redirect") ?? "/app";

  const handleSubmit = (nextMode: AuthMode) => (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    startTransition(async () => {
      if (!supabase) {
        setError(initError ?? "Supabase 설정이 필요합니다.");
        return;
      }

      if (!identifier || !password) {
        setError("아이디(또는 이메일)와 비밀번호를 모두 입력해주세요.");
        return;
      }

      if (nextMode === "signup") {
        if (password.length < 8) {
          setError("비밀번호는 8자 이상이어야 합니다.");
          return;
        }

        if (password !== confirmPassword) {
          setError("비밀번호가 일치하지 않습니다.");
          return;
        }
      }

      const { data, error: authError } =
        nextMode === "signin"
          ? await supabase.auth.signInWithPassword({ email: identifier, password })
          : await supabase.auth.signUp({
              email: identifier,
              password,
              options: { data: { display_name: displayName || identifier } },
            });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (nextMode === "signup") {
        setNotice("가입이 완료되었습니다. 이메일 인증이 필요한 경우 메일을 확인한 후 로그인하세요.");
        setConfirmPassword("");
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
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-10 top-24 h-[360px] w-[360px] rounded-[48%] bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.22),transparent_60%)] blur-2xl" />
        <div className="absolute -right-12 top-10 h-[420px] w-[420px] rounded-[46%] bg-[radial-gradient(circle_at_70%_20%,rgba(34,197,94,0.20),transparent_55%)] blur-2xl" />
        <div className="absolute bottom-[-80px] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-[52%] bg-[radial-gradient(circle_at_50%_50%,rgba(21,128,61,0.18),transparent_60%)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0)_35%,rgba(255,255,255,0.10)_70%)]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-16">
        <section className="w-full max-w-md">
          <div className="mb-6 space-y-2 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur shadow-sm">
              <Sparkles className="h-4 w-4 text-indigo-500 drop-shadow-sm" />
              로그인 / 회원가입
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground drop-shadow-sm">문서 기반 챗봇 시작하기</h1>
            <p className="text-sm text-muted-foreground">필요한 정보만 입력하고 바로 시작하세요.</p>
          </div>

          <div className="group relative overflow-hidden rounded-[24px] border bg-card p-6 shadow-[0_26px_90px_-28px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_30px_110px_-36px_rgba(0,0,0,0.45)]">
            <div className="relative mb-4 space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">계정</h2>
              <p className="text-xs text-muted-foreground">아이디(또는 이메일)와 비밀번호로 로그인/회원가입</p>
            </div>

            <Tabs value={mode} onValueChange={(v) => setMode(v as AuthMode)} className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">로그인</TabsTrigger>
                <TabsTrigger value="signup">회원가입</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="space-y-5">
                <form className="space-y-4" onSubmit={handleSubmit("signin")}>
                  <div className="space-y-2">
                    <Label htmlFor="identifier">아이디 또는 이메일</Label>
                    <Input
                      id="identifier"
                      autoComplete="username"
                      placeholder="admin 또는 you@example.com"
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      disabled={isPending}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">비밀번호</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="비밀번호를 입력하세요"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={isPending}
                        required
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword((prev) => !prev)}
                        disabled={isPending}
                        aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}

                  <Button className="w-full" type="submit" disabled={isPending}>
                    {isPending ? "로그인 중..." : "로그인"}
                  </Button>
                </form>

                <p className="text-center text-xs text-muted-foreground">
                  로그인하면 서비스 이용 약관 및 개인정보 처리방침에 동의한 것으로 간주합니다.
                </p>
              </TabsContent>

              <TabsContent value="signup" className="space-y-5">
                <form className="space-y-4" onSubmit={handleSubmit("signup")}>
                  <div className="space-y-2">
                    <Label htmlFor="identifier_signup">아이디 또는 이메일</Label>
                    <Input
                      id="identifier_signup"
                      autoComplete="username"
                      placeholder="admin 또는 you@example.com"
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      disabled={isPending}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="display_name">이름</Label>
                    <Input
                      id="display_name"
                      autoComplete="name"
                      placeholder="표시할 이름 (예: 홍길동)"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      disabled={isPending}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password_signup">비밀번호</Label>
                    <div className="relative">
                      <Input
                        id="password_signup"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="8자 이상 비밀번호"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={isPending}
                        required
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword((prev) => !prev)}
                        disabled={isPending}
                        aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm_password">비밀번호 확인</Label>
                    <div className="relative">
                      <Input
                        id="confirm_password"
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="비밀번호를 다시 입력하세요"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        disabled={isPending}
                        required
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        disabled={isPending}
                        aria-label={showConfirmPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}

                  <Button className="w-full" type="submit" disabled={isPending}>
                    {isPending ? "생성 중..." : "계정 생성"}
                  </Button>
                </form>

                <p className="text-center text-xs text-muted-foreground">
                  회원가입 후 이메일 인증이 필요할 수 있습니다. 받은 메일을 확인해주세요.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </div>
    </main>
  );
}
