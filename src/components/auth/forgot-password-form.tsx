"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
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
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLocaleLowerCase("tr-TR");

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const result = (await response.json().catch(() => ({ message: "Bilinmeyen hata olustu." }))) as {
      message?: string;
    };

    if (!response.ok) {
      setError(result.message ?? "Sifre sifirlama maili gonderilemedi.");
      setSubmitting(false);
      return;
    }

    setSuccess(result.message ?? "Sifre yenileme linki tanimli mail adresinize gonderildi.");
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
