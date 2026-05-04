"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function ForgotPasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    if (!isSupabaseConfigured()) {
      setError("Once .env.local dosyasina Supabase bilgilerini girmelisiniz.");
      setSubmitting(false);
      return;
    }

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/sifre-yenile`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (resetError) {
      setError(resetError.message);
      setSubmitting(false);
      return;
    }

    setSuccess("Sifre yenileme linki tanimli mail adresinize gonderildi.");
    setSubmitting(false);
    event.currentTarget.reset();
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <div className="auth-header">
        <span className="status-chip">Sifre Destegi</span>
        <h2>Sifremi Unuttum</h2>
        <p>Mail adresinizi yazin, yeni sifre belirlemeniz icin dogrulama linki gelsin.</p>
      </div>

      <div className="auth-grid single-column">
        <label className="field">
          <span>Mail Adresi</span>
          <input name="email" required type="email" placeholder="ornek@firma.com" />
        </label>
      </div>

      {error ? <div className="message-box error-box">{error}</div> : null}
      {success ? <div className="message-box success-box">{success}</div> : null}

      <div className="auth-actions">
        <button className="button-primary" disabled={submitting} type="submit">
          {submitting ? "Mail gonderiliyor..." : "Sifre Linki Gonder"}
        </button>
        <Link className="button-secondary" href="/giris">
          Girise Don
        </Link>
      </div>
    </form>
  );
}
