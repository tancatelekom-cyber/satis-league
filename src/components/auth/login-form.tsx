"use client";

import Link from "next/link";
import { withAuthTimeout } from "@/lib/auth/with-auth-timeout";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type LoginFormProps = {
  message?: string;
};

export function LoginForm({ message }: LoginFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    if (!isSupabaseConfigured()) {
      setError("Once .env.local dosyasina Supabase bilgilerini girmelisiniz.");
      setSubmitting(false);
      return;
    }

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    try {
      const supabase = createClient();

      const { data: signInData, error: signInError } = await withAuthTimeout(supabase.auth.signInWithPassword({
        email,
        password
      }));

      if (signInError) {
        setError(signInError.message);
        setSubmitting(false);
        return;
      }

      const accessToken = signInData.session?.access_token ?? "";

      const confirmResponse = await withAuthTimeout(fetch("/api/auth/confirm-session", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          accessToken
        })
      }));

      if (!confirmResponse.ok) {
        setError("Oturum acildi ama uygulama guvenlik kontrolu tamamlanamadi. Tekrar deneyin.");
        await withAuthTimeout(supabase.auth.signOut());
        setSubmitting(false);
        return;
      }

      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Giriş tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.");
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <div className="auth-header">
        <span className="status-chip">Giris</span>
        <h2>Hesabina Gir</h2>
        <p>
          Admin onayi tamamlanan kullanicilar erisim saglayabilir.
        </p>
      </div>

      {message ? <div className="message-box success-box">{message}</div> : null}

      <div className="auth-grid single-column">
        <label className="field">
          <span>Mail Adresi</span>
          <input name="email" required type="email" placeholder="ornek@firma.com" />
        </label>

        <label className="field">
          <span>Sifre</span>
          <input name="password" required type="password" placeholder="Sifreniz" />
        </label>
      </div>

      {error ? <div className="message-box error-box">{error}</div> : null}

      <div className="auth-actions">
        <button className="button-primary" disabled={submitting} type="submit">
          {submitting ? "Giris yapiliyor..." : "Giris Yap"}
        </button>
        <Link className="button-secondary" href="/kayit">
          Yeni Hesap Olustur
        </Link>
      </div>

      <div className="auth-footer-links">
        <Link className="auth-inline-link" href="/sifremi-unuttum">
          Sifremi Unuttum
        </Link>
      </div>
    </form>
  );
}
