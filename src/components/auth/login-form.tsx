"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type LoginFormProps = {
  message?: string;
};

export function LoginForm({ message }: LoginFormProps) {
  const router = useRouter();
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
    const supabase = createClient();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    const confirmResponse = await fetch("/api/auth/confirm-session", {
      method: "POST"
    });

    if (!confirmResponse.ok) {
      setError("Oturum acildi ama uygulama guvenlik kontrolu tamamlanamadi. Tekrar deneyin.");
      await supabase.auth.signOut();
      setSubmitting(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <div className="auth-header">
        <span className="status-chip">Giris</span>
        <h2>Hesabina Gir</h2>
        <p>
          Admin onayi tamamlanan kullanicilar kampanya ekranlarina erisebilir.
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
