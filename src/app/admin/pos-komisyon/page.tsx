import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { requireAdminAccess } from "@/lib/auth/require-admin";
import { formatPosCurrency, formatPosPercent, resolvePosCommissionSettings } from "@/lib/pos-commission";
import { createAdminClient } from "@/lib/supabase/admin";
import { updatePosCommissionAction } from "./actions";

type AdminPosCommissionPageProps = {
  searchParams?: Promise<{
    message?: string;
    type?: "success" | "error";
  }>;
};

export default async function AdminPosCommissionPage({
  searchParams
}: AdminPosCommissionPageProps) {
  await requireAdminAccess();

  const params = searchParams ? await searchParams : undefined;
  const admin = createAdminClient();
  const { data } = await admin
    .from("pos_commission_settings")
    .select("id, commission_percent, updated_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const settings = resolvePosCommissionSettings(data);
  const sampleAmount = 10000;
  const sampleNetAmount = sampleAmount * (1 - settings.commissionPercent / 100);

  return (
    <main>
      <h1 className="page-title">POS Komisyon Ayari</h1>
      <p className="page-subtitle">
        Tum kullanicilarin gorecegi POS komisyon hesaplayicisindaki oran burada yonetilir.
      </p>

      {params?.message ? (
        <div className={`message-box ${params.type === "error" ? "error-box" : "success-box"}`}>
          {params.message}
        </div>
      ) : null}

      <AdminSectionNav currentPath="/admin/pos-komisyon" />

      <section
        className="guide-card game-brief-card"
        style={{
          display: "grid",
          gap: 18
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16
          }}
        >
          <article
            style={{
              borderRadius: 24,
              padding: "18px 20px",
              background: "rgba(255,255,255,0.9)",
              border: "1px solid rgba(4, 92, 96, 0.16)",
              boxShadow: "0 16px 28px rgba(8, 22, 40, 0.08)",
              display: "grid",
              gap: 6
            }}
          >
            <span style={{ color: "#56708c", fontWeight: 700 }}>Gecerli Komisyon</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>
              {formatPosPercent(settings.commissionPercent)}
            </strong>
            <span style={{ color: "#37516f" }}>Tum hesaplamalarda kullanilan aktif oran.</span>
          </article>

          <article
            style={{
              borderRadius: 24,
              padding: "18px 20px",
              background: "rgba(255,255,255,0.9)",
              border: "1px solid rgba(4, 92, 96, 0.16)",
              boxShadow: "0 16px 28px rgba(8, 22, 40, 0.08)",
              display: "grid",
              gap: 6
            }}
          >
            <span style={{ color: "#56708c", fontWeight: 700 }}>10.000 TL Ornek Net</span>
            <strong style={{ color: "#0b2143", fontSize: "2rem", lineHeight: 1 }}>
              {formatPosCurrency(sampleNetAmount)}
            </strong>
            <span style={{ color: "#37516f" }}>Ornek hesapla guncel etkiyi hizli gorun.</span>
          </article>
        </div>

        <form
          action={updatePosCommissionAction}
          className="admin-form"
          style={{
            display: "grid",
            gap: 16
          }}
        >
          <label className="field">
            <span>Komisyon Orani</span>
            <input
              className="input"
              name="commissionPercent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue={settings.commissionPercent.toString().replace(".", ",")}
              required
            />
          </label>

          <button className="button-primary" type="submit" style={{ justifySelf: "start" }}>
            Komisyonu Kaydet
          </button>
        </form>
      </section>
    </main>
  );
}
