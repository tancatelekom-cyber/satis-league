import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getResolvedFeatureAccessForProfile } from "@/lib/feature-menu-permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import {
  fetchDocumentIssueRows,
  formatDocumentIssueDate,
  formatDocumentIssueDays,
  resolveDocumentIssueUserLabel,
  sameDocumentIssueProfileId,
  sameDocumentIssueStore,
  type DocumentIssueProfileMapRow
} from "@/lib/document-issues";

type MissingDocsProfile = {
  id: string;
  role: UserRole;
  approval: string;
  full_name: string | null;
  store: {
    name: string;
  } | null;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EksikEvrakPage() {
  const user = await requireUser();

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, approval, full_name, store:stores(name)")
    .eq("id", user.id)
    .single();

  const safeProfile = (profile as MissingDocsProfile | null) ?? null;

  if (!safeProfile || safeProfile.approval !== "approved") {
    redirect("/hesabim");
  }

  const resolvedFeatureAccess = await getResolvedFeatureAccessForProfile("eksik-evrak", user.id, safeProfile.role);
  if (!resolvedFeatureAccess.allowed) {
    redirect("/");
  }

  const ownStoreName = safeProfile.store?.name?.trim() ?? "";
  const canViewAllStores = safeProfile.role === "admin" || safeProfile.role === "management";
  const canViewOwnStore = safeProfile.role === "manager";

  let rows = [] as Awaited<ReturnType<typeof fetchDocumentIssueRows>>;
  let sheetError = "";

  try {
    rows = await fetchDocumentIssueRows();
  } catch (error) {
    sheetError = error instanceof Error ? error.message : "Eksik evrak verisi okunamadi.";
  }

  const admin = createAdminClient();
  const profilesResult = await admin
    .from("profiles")
    .select("id, full_name, store:stores(name)")
    .eq("approval", "approved")
    .in("role", ["employee", "manager"]);

  const profileRows = ((profilesResult.data as DocumentIssueProfileMapRow[] | null) ?? []).filter((item) => item.id);

  const visibleRows = rows.filter((row) => {
    if (canViewAllStores) {
      return true;
    }

    if (canViewOwnStore) {
      return ownStoreName ? sameDocumentIssueStore(row.storeName, ownStoreName) : false;
    }

    return sameDocumentIssueProfileId(row.personnelId, safeProfile.id);
  });

  const sortedRows = [...visibleRows].sort((left, right) => {
    const sourceDiff = left.source.localeCompare(right.source, "tr");
    if (sourceDiff !== 0) {
      return sourceDiff;
    }

    const dayDiff = (right.daysSinceActivation ?? -1) - (left.daysSinceActivation ?? -1);
    if (dayDiff !== 0) {
      return dayDiff;
    }

    const storeDiff = left.storeName.localeCompare(right.storeName, "tr");
    if (storeDiff !== 0) {
      return storeDiff;
    }

    return left.customerName.localeCompare(right.customerName, "tr");
  });

  const unreachableCount = sortedRows.filter((row) => row.source === "Ulasmayan Evrak").length;
  const missingCount = sortedRows.filter((row) => row.source === "Eksik Evrak").length;
  const categorizedRows = [
    {
      key: "Ulasmayan Evrak" as const,
      label: "Ulasmayan Evrak",
      count: unreachableCount,
      rows: sortedRows.filter((row) => row.source === "Ulasmayan Evrak")
    },
    {
      key: "Eksik Evrak" as const,
      label: "Eksik Evrak",
      count: missingCount,
      rows: sortedRows.filter((row) => row.source === "Eksik Evrak")
    }
  ].filter((group) => group.count > 0);

  return (
    <main>
      <h1 className="page-title">Eksik Evrak</h1>
      <p className="page-subtitle">
        Ulasmayan ve eksik evrak kayitlarini tek tabloda takip edin.
      </p>

      {sheetError ? (
        <section className="guide-card">
          <strong>Veri su an acilamadi.</strong>
          <p className="subtle">{sheetError}</p>
        </section>
      ) : null}

      <section className="goal-summary-strip">
        <article className="goal-summary-card">
          <span>Toplam Kayit</span>
          <strong>{sortedRows.length.toLocaleString("tr-TR")}</strong>
        </article>
        <article className="goal-summary-card">
          <span>Ulasmayan Evrak</span>
          <strong>{unreachableCount.toLocaleString("tr-TR")}</strong>
        </article>
        <article className="goal-summary-card">
          <span>Eksik Evrak</span>
          <strong>{missingCount.toLocaleString("tr-TR")}</strong>
        </article>
      </section>

      <section className="campaign-section-card" style={{ display: "grid", gap: 16 }}>
        <div className="goal-section-head">
          <h2>
            {canViewAllStores
              ? "Firma Geneli Evrak Listesi"
              : canViewOwnStore
                ? `${ownStoreName || "Magaza"} Evrak Listesi`
                : "Kendi Evraklarim"}
          </h2>
          <span>Ulasmayan ve eksik evraklar ayri tablo bloklari halinde listelenir</span>
        </div>

        {sortedRows.length ? (
          <div className="document-issues-table-stack">
            {categorizedRows.map((group) => {
              const isMissingGroup = group.key === "Eksik Evrak";

              return (
                <section key={group.key} className="document-issues-table-section">
                  <div className="document-issues-category-head document-issues-category-head-block">
                    <strong className={isMissingGroup ? "document-issues-category-bad" : "document-issues-category-neutral"}>
                      {group.label}
                    </strong>
                    <span>{group.count.toLocaleString("tr-TR")} kayit</span>
                  </div>

                  <div className="goal-company-trend-table-wrap">
                    <table className="goal-company-trend-table document-issues-table">
                      <thead>
                        <tr>
                          <th>Durum</th>
                          <th>Kullanici</th>
                          <th>Sube</th>
                          <th>Musteri GSM</th>
                          <th>Musteri Adi</th>
                          <th>Islem Tipi</th>
                          <th>Eksik Evrak</th>
                          <th>Aktivasyon Tarihi</th>
                          <th>Kac Gun Oldu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row, index) => (
                          <tr key={`${group.key}-${row.personnelId}-${row.customerGsm}-${index}`}>
                            <td className="document-issues-status-cell">{row.source}</td>
                            <td>{resolveDocumentIssueUserLabel(row.personnelId, profileRows)}</td>
                            <td>{row.storeName || "-"}</td>
                            <td>{row.customerGsm || "-"}</td>
                            <td>{row.customerName || "-"}</td>
                            <td>{row.transactionType || "-"}</td>
                            <td>{row.documentDetail || "-"}</td>
                            <td>{formatDocumentIssueDate(row.activationDate)}</td>
                            <td>{formatDocumentIssueDays(row.daysSinceActivation)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="goal-company-trend-table-wrap">
            <table className="goal-company-trend-table document-issues-table">
              <thead>
                <tr>
                  <th>Durum</th>
                  <th>Kullanici</th>
                  <th>Sube</th>
                  <th>Musteri GSM</th>
                  <th>Musteri Adi</th>
                  <th>Islem Tipi</th>
                  <th>Eksik Evrak</th>
                  <th>Aktivasyon Tarihi</th>
                  <th>Kac Gun Oldu</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={9}>Gosterilecek eksik veya ulasmayan evrak kaydi bulunamadi.</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
