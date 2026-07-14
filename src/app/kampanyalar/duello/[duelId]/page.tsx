import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CampaignSummaryMatrix } from "@/components/campaign/campaign-summary-matrix";
import { DuelEntryCard } from "@/components/duel/duel-entry-card";
import { DuelScoreArena } from "@/components/duel/duel-score-arena";
import { daysLeftLabel, formatCampaignDateTime, isSalesWindowOpen } from "@/lib/campaign-utils";
import { getDuelDashboardData } from "@/lib/duel/get-duel-dashboard-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DuelDetailPageProps = {
  params: Promise<{
    duelId: string;
  }>;
  searchParams?: Promise<{
    view?: "leaderboard" | "sales" | "details";
  }>;
};

function scoreLabel(value: number, scoring: "points" | "quantity") {
  return `${value.toFixed(0)} ${scoring === "points" ? "puan" : "adet"}`;
}

export default async function DuelDetailPage({ params, searchParams }: DuelDetailPageProps) {
  const routeParams = await params;
  const pageParams = searchParams ? await searchParams : undefined;
  const view =
    pageParams?.view === "sales"
      ? "sales"
      : pageParams?.view === "details"
        ? "details"
        : "leaderboard";
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const dashboard = await getDuelDashboardData(user.id);

  if (!dashboard) {
    redirect("/hesabim");
  }

  if (dashboard.profile.approval !== "approved") {
    redirect("/hesabim");
  }

  const duel =
    dashboard.activeDuels.find((item) => item.id === routeParams.duelId) ??
    dashboard.finishedDuels.find((item) => item.id === routeParams.duelId) ??
    dashboard.plannedDuels.find((item) => item.id === routeParams.duelId) ??
    null;

  if (!duel) {
    notFound();
  }

  const isActiveDuel = isSalesWindowOpen(duel.start_at, duel.end_at);
  const admin = createAdminClient();
  const initialQuantityMap: Record<string, number> = {};

  const { data: duelEntries } = await admin
    .from("duel_entries")
    .select("participant_id, product_id, quantity")
    .eq("duel_id", duel.id);

  ((duelEntries as Array<{
    participant_id: string;
    product_id: string;
    quantity: number;
  }> | null) ?? []).forEach((entry) => {
    const key = `${entry.participant_id}__${entry.product_id}`;
    initialQuantityMap[key] = Number(initialQuantityMap[key] ?? 0) + Number(entry.quantity ?? 0);
  });

  const matrixColumns = duel.participants.map((participant) => ({
    id: participant.id,
    label: participant.label
  }));
  const menuItems = [
    {
      href: `/kampanyalar/duello/${duel.id}?view=leaderboard`,
      title: "Duello Siralama",
      active: view === "leaderboard"
    },
    {
      href: `/kampanyalar/duello/${duel.id}?view=details`,
      title: "Duello Detay",
      active: view === "details"
    }
  ];

  if (isActiveDuel && duel.can_submit) {
    menuItems.push({
      href: `/kampanyalar/duello/${duel.id}?view=sales`,
      title: "Duello Girisi",
      active: view === "sales"
    });
  }

  return (
    <main>
      <div className="detail-page-head">
        <div>
          <Link className="back-link" href="/kampanyalar">
            Kampanyalara Don
          </Link>
          <h1 className="page-title compact-page-title">{duel.name}</h1>
        </div>
      </div>

      <section className="compact-top-strip">
        <span className="mission-pill">Katilimci: {duel.participants.length}</span>
        <span className="mission-pill">
          {duel.scoring === "points" ? "Puan bazli" : "Adet bazli"}
        </span>
        <span className="mission-pill">
          {isActiveDuel ? `Kalan: ${daysLeftLabel(duel.end_at)}` : "Durum: Pasif"}
        </span>
        <span className="mission-pill">Bitis: {formatCampaignDateTime(duel.end_at)}</span>
      </section>

      <section className="detail-switch-grid compact-switch-grid">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            className={`detail-switch-card compact-switch-card ${item.active ? "admin-shortcut-card-active" : ""}`}
            href={item.href}
          >
            <strong>{item.title}</strong>
          </Link>
        ))}
      </section>

      {view === "details" ? (
        <section className="guide-card">
          <div className="step-list">
            <div className="step-item">
              <strong>Duello Aciklamasi</strong>
              <span>{duel.description ?? "Bu duello icin aciklama girilmedi."}</span>
            </div>
            <div className="step-item">
              <strong>Tarih Araligi</strong>
              <span>
                {formatCampaignDateTime(duel.start_at)} - {formatCampaignDateTime(duel.end_at)}
              </span>
            </div>
            <div className="step-item">
              <strong>Katilimcilar</strong>
              <span>
                {duel.participants
                  .map((participant) =>
                    participant.participantMode === "group"
                      ? `${participant.label} (${participant.memberLabels.join(", ")})`
                      : participant.label
                  )
                  .join(" | ")}
              </span>
            </div>
            <div className="step-item">
              <strong>Urunler ve Puanlar</strong>
              <span>
                {duel.products
                  .map((product) => `${product.name} (${Number(product.base_points ?? 0).toFixed(0)} ${product.unit_label})`)
                  .join(", ")}
              </span>
            </div>
          </div>
        </section>
      ) : !isActiveDuel || view === "leaderboard" || !duel.can_submit ? (
        <section className="guide-card">
          {isActiveDuel && !duel.can_submit ? (
            <div className="message-box error-box">
              Bu duelloda giris yapma yetkisi sadece adminin sectigi profillerdedir.
            </div>
          ) : null}

          {duel.matchups.length ? (
            <div className="duel-matchup-board">
              <div className="section-title compact-title">
                <div>
                  <h2>Karsilastirmali Duello Tablosu</h2>
                  <p>Kim kiminle kapisiyorsa karsilikli anlik puanlari burada gorunur.</p>
                </div>
              </div>

              <DuelScoreArena matchups={duel.matchups} scoring={duel.scoring} title={duel.name} />
            </div>
          ) : null}

          <div className="leaderboard-list">
            {duel.leaderboard.map((participant, index) => (
              <div key={participant.id} className="leaderboard-row">
                <div className={`leaderboard-rank ${participant.score <= 0 ? "leaderboard-rank-empty" : ""}`}>
                  {index + 1}
                </div>
                <div>
                  <h4>{participant.label}</h4>
                  <p className="subtle">
                    {participant.participantMode === "group"
                      ? participant.memberLabels.join(", ")
                      : "Kisi bazli toplam skor"}
                  </p>
                  <p className="duel-leaderboard-outcome">
                    {participant.currentResult === "draw"
                      ? "Mevcut durum: Berabere"
                      : `${participant.currentResult === "winning" ? "Mevcut durum: Kazaniyor" : "Mevcut durum: Kaybediyor"}${
                          participant.currentDescription ? ` - ${participant.currentDescription}` : ""
                        }`}
                  </p>
                </div>
                <div className="score">
                  <strong>{scoreLabel(participant.score, duel.scoring)}</strong>
                  <span className="subtle">toplam skor</span>
                </div>
              </div>
            ))}
          </div>

          <CampaignSummaryMatrix
            columns={matrixColumns}
            rows={duel.productMatrix}
            subtitle="Her katilimci veya grup icin urun bazli anlik ozet"
            title="Duello Urun Ozetleri"
          />
        </section>
      ) : (
        <section className="guide-card">
          <div className="section-title compact-title">
            <div>
              <h2>Duello Girisi</h2>
              <p>Hedef kisi veya grubu secip urun bazli sonucu guncelleyin.</p>
            </div>
          </div>

          <DuelEntryCard
            defaultParticipantId={duel.default_participant_id}
            duelId={duel.id}
            initialQuantities={initialQuantityMap}
            participants={duel.participants}
            products={duel.products}
            scoring={duel.scoring}
          />
        </section>
      )}
    </main>
  );
}
