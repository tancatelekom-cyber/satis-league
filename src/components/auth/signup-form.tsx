"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { StoreOption, UserRole } from "@/lib/types";

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "employee", label: "Calisan" },
  { value: "manager", label: "Magaza Muduru" },
  { value: "management", label: "Yonetim" }
];

export function SignupForm() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loadingStores, setLoadingStores] = useState(isSupabaseConfigured());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadStores() {
      if (!isSupabaseConfigured()) {
        setLoadingStores(false);
        setError("Once .env.local dosyasina Supabase bilgilerini girmelisiniz.");
        return;
      }

      const supabase = createClient();
      const { data, error: storeError } = await supabase
        .from("stores")
        .select("id, name, city")
        .eq("is_active", true)
        .order("name");

      if (storeError) {
        setError("Magaza listesi cekilemedi. Supabase baglantisini kontrol edin.");
      } else {
        setStores((data as StoreOption[]) ?? []);
      }

      setLoadingStores(false);
    }

    void loadStores();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    if (!isSupabaseConfigured()) {
      setError("Kayit yapmadan once .env.local ve Supabase ayarlarini tamamlayin.");
      setSubmitting(false);
      return;
    }

    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("fullName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const role = String(formData.get("role") ?? "employee") as UserRole;
    const storeId = String(formData.get("storeId") ?? "");
    const supabase = createClient();

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
          role,
          store_id: storeId
        }
      }
    });

    if (signUpError) {
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }

    setSuccess(
      "Kayit tamamlandi. Hesabiniz admin onayina gonderildi. Simdi giris ekranina gecebilirsiniz."
    );
    event.currentTarget.reset();
    setSubmitting(false);
    router.prefetch("/giris");
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <div className="auth-header">
        <span className="status-chip">Yeni Kullanici</span>
        <h2>Kayit Ol</h2>
        <p>
          Kullanici olustuktan sonra hesabiniz otomatik olarak admin onayina duser.
        </p>
      </div>

      <div className="auth-grid">
        <label className="field">
          <span>Adi Soyadi</span>
          <input name="fullName" required placeholder="Ornek: Ayse Demir" />
        </label>

        <label className="field">
          <span>Mail Adresi</span>
          <input name="email" required type="email" placeholder="ornek@firma.com" />
        </label>

        <label className="field">
          <span>Telefon Numarasi</span>
          <input name="phone" required placeholder="05xx xxx xx xx" />
        </label>

        <label className="field">
          <span>Sifre</span>
          <input name="password" required minLength={6} type="password" placeholder="En az 6 karakter" />
        </label>

        <label className="field">
          <span>Gorevi</span>
          <select defaultValue="employee" name="role" required>
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Magazasi</span>
          <select defaultValue="" disabled={loadingStores} name="storeId" required>
            <option value="">{loadingStores ? "Magazalar yukleniyor..." : "Magaza secin"}</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} {store.city ? `- ${store.city}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <div className="message-box error-box">{error}</div> : null}
      {success ? <div className="message-box success-box">{success}</div> : null}

      <div className="auth-actions">
        <button className="button-primary" disabled={submitting || loadingStores} type="submit">
          {submitting ? "Kayit yapiliyor..." : "Kaydi Gonder"}
        </button>
        <Link className="button-secondary" href="/giris">
          Giris Ekranina Git
        </Link>
      </div>
    </form>
  );
}
