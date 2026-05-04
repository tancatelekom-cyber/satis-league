"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function ResetPasswordForm() {
  const router = useRouter();
  const [loadingSession, setLoadingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError("Once .env.local dosyasina Supabase bilgilerini girmelisiniz.");
      setLoadingSession(false);
      return;
    }

    const supabase = createClient();

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      setReady(Boolean(data.session));
      setLoadingSession(false);
    }

    void checkSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setReady(Boolean(session));
      setLoadingSession(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 6) {
      setError("Yeni sifre en az 6 karakter olmali.");
      setSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Iki sifre ayni olmali.");
      setSubmitting(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    setSuccess("Sifreniz guncellendi. Simdi giris yapabilirsiniz.");
    setSubmitting(false);
    event.currentTarget.reset();

    setTimeout(() => {
      router.push("/giris?message=Sifreniz%20guncellendi");
      router.refresh();
    }, 1200);
  }

  if (loadingSession) {
    return (
      <div className="auth-card">
        <div className="auth-header">
          <span className="status-chip">Dogrulaniyor</span>
          <h2>Link kontrol ediliyor</h2>
          <p>Mailden gelen sifre yenileme linkini dogruluyoruz.</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="auth-card">
        <div className="auth-header">
          <span className="status-chip">Link Gecersiz</span>
          <h2>Yeni link isteyin</h2>
          <p>Bu sayfaya mailinizdeki sifre yenileme linki ile gelmelisiniz.</p>
        </div>

        {error ? <div className="message-box error-box">{error}</div> : null}

        <div className="auth-actions">
          <Link className="button-primary" href="/sifremi-unuttum">
            Yeni Link Iste
          </Link>
          <Link className="button-secondary" href="/giris">
            Girise Don
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <div className="auth-header">
        <span className="status-chip">Yeni Sifre</span>
        <h2>Sifrenizi Degistirin</h2>
        <p>Mail dogrulamasindan sonra bu hesaba yeni sifre tanimlayin.</p>
      </div>

      <div className="auth-grid single-column">
        <label className="field">
          <span>Yeni Sifre</span>
          <input name="password" required type="password" placeholder="En az 6 karakter" />
        </label>

        <label className="field">
          <span>Yeni Sifre Tekrar</span>
          <input name="confirmPassword" required type="password" placeholder="Yeni sifreyi tekrar yazin" />
        </label>
      </div>

      {error ? <div className="message-box error-box">{error}</div> : null}
      {success ? <div className="message-box success-box">{success}</div> : null}

      <div className="auth-actions">
        <button className="button-primary" disabled={submitting} type="submit">
          {submitting ? "Sifre guncelleniyor..." : "Sifreyi Guncelle"}
        </button>
        <Link className="button-secondary" href="/giris">
          Girise Don
        </Link>
      </div>
    </form>
  );
}
