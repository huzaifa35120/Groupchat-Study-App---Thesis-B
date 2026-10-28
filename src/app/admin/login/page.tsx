"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { api, errorText } from "@/lib/client";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const supabase = supabaseBrowser();

  const submit = async () => {
    if (!supabase) return;
    setBusy(true);
    setErr(null);
    try {
      if (mode === "register") await api("/api/auth/register", { body: { email, password } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace("/admin");
      router.refresh();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-16">
      <p className="text-sm font-medium text-accent">Group chat study</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{mode === "signin" ? "Researcher sign-in" : "Create researcher account"}</h1>
      <p className="mt-1 text-sm text-stone-500">
        {mode === "signin" ? "For the investigator and supervisor only." : "Only emails listed in ADMIN_EMAILS can register."}
      </p>
      {!supabase ? (
        <div className="mt-6"><Notice tone="warning">Supabase isn&apos;t configured for this deployment yet.</Notice></div>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Field label="Email"><Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password" hint={mode === "register" ? "At least 10 characters." : undefined}>
            <Input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {err && <Notice tone="error">{err}</Notice>}
          <Button type="submit" busy={busy} className="w-full">{mode === "signin" ? "Sign in" : "Create account and sign in"}</Button>
          <button type="button" className="w-full text-center text-sm text-stone-500 hover:text-stone-800" onClick={() => { setErr(null); setMode(mode === "signin" ? "register" : "signin"); }}>
            {mode === "signin" ? "First time? Create your account" : "Already have an account? Sign in"}
          </button>
        </form>
      )}
    </main>
  );
}
