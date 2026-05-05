import { createAdminClient } from "@/lib/supabase/admin";
import { AdminCampaign, SeasonRecord } from "@/lib/types";

type ApprovedProfileLite = {
  id: string;
  full_name: string;
  role: string;
  is_on_leave: boolean;
  store_id: string | null;
};

type StoreLite = {
  id: string;
  name: string;
  is_active: boolean;
};

type CampaignSaleLite = {
  campaign_id: string;
  target_profile_id: string | null;
  target_store_id: string | null;
  weighted_score: number;
  created_at: string;
};

type SeasonSaleLite = {
  season_id: string;
  target_profile_id: string | null;
  target_store_id: string | null;
  score: number;
  entry_date: string;
  created_at: string;
};

type RankingRow = {
  rank: number;
  label: string;
  storeName: string;
  score: number;
  firstEntryAt: string;
};

type RankingSeedRow = {
  id: string;
  label: string;
  storeName?: string;
  score: number;
  firstEntryAt: string;
};

type CellValue = string | number;

type WorksheetDefinition = {
  name: string;
  rows: CellValue[][];
};

const INVALID_SHEET_CHARS = /[:\\/?*\[\]]/g;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeSheetName(name: string, usedNames: Set<string>) {
  const baseName = name.replace(INVALID_SHEET_CHARS, " ").replace(/\s+/g, " ").trim() || "Sayfa";
  let candidate = baseName.slice(0, 31);
  let counter = 2;

  while (usedNames.has(candidate)) {
    const suffix = ` ${counter}`;
    candidate = `${baseName.slice(0, Math.max(0, 31 - suffix.length))}${suffix}`;
    counter += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function compareRankingRows(a: RankingSeedRow, b: RankingSeedRow) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  if (a.firstEntryAt && b.firstEntryAt && a.firstEntryAt !== b.firstEntryAt) {
    return a.firstEntryAt.localeCompare(b.firstEntryAt);
  }

  if (a.firstEntryAt && !b.firstEntryAt) {
    return -1;
  }

  if (!a.firstEntryAt && b.firstEntryAt) {
    return 1;
  }

  return a.label.localeCompare(b.label, "tr");
}

function createRankingRows(rows: RankingSeedRow[]) {
  return rows
    .sort(compareRankingRows)
    .map((row, index) => ({
      rank: index + 1,
      label: row.label,
      storeName: row.storeName ?? "-",
      score: row.score,
      firstEntryAt: row.firstEntryAt
    }));
}

function buildCampaignEmployeeRanking(
  campaign: AdminCampaign,
  profiles: ApprovedProfileLite[],
  stores: StoreLite[],
  sales: CampaignSaleLite[]
) {
  const storeMap = new Map(stores.map((store) => [store.id, store.name]));

  return createRankingRows(
    profiles
      .filter((profile) => profile.role === "employee" && !profile.is_on_leave)
      .map((profile) => {
        const relevantSales = sales.filter(
          (sale) => sale.campaign_id === campaign.id && sale.target_profile_id === profile.id
        );

        return {
          id: profile.id,
          label: profile.full_name,
          storeName: storeMap.get(profile.store_id ?? "") ?? "-",
          score: relevantSales.reduce((sum, sale) => sum + Number(sale.weighted_score ?? 0), 0),
          firstEntryAt: relevantSales
            .map((sale) => sale.created_at)
            .sort()[0] ?? ""
        };
      })
  );
}

function buildCampaignStoreRanking(campaign: AdminCampaign, stores: StoreLite[], sales: CampaignSaleLite[]) {
  return createRankingRows(
    stores.map((store) => {
      const relevantSales = sales.filter(
        (sale) => sale.campaign_id === campaign.id && sale.target_store_id === store.id
      );

      return {
        id: store.id,
        label: store.name,
        score: relevantSales.reduce((sum, sale) => sum + Number(sale.weighted_score ?? 0), 0),
        firstEntryAt: relevantSales
          .map((sale) => sale.created_at)
          .sort()[0] ?? ""
      };
    })
  );
}

function buildSeasonEmployeeRanking(
  season: SeasonRecord,
  profiles: ApprovedProfileLite[],
  stores: StoreLite[],
  sales: SeasonSaleLite[]
) {
  const storeMap = new Map(stores.map((store) => [store.id, store.name]));

  return createRankingRows(
    profiles
      .filter((profile) => profile.role === "employee" && !profile.is_on_leave)
      .map((profile) => {
        const relevantSales = sales.filter(
          (sale) => sale.season_id === season.id && sale.target_profile_id === profile.id
        );

        return {
          id: profile.id,
          label: profile.full_name,
          storeName: storeMap.get(profile.store_id ?? "") ?? "-",
          score: relevantSales.reduce((sum, sale) => sum + Number(sale.score ?? 0), 0),
          firstEntryAt: relevantSales
            .map((sale) => sale.entry_date || sale.created_at)
            .sort()[0] ?? ""
        };
      })
  );
}

function buildSeasonStoreRanking(
  season: SeasonRecord,
  profiles: ApprovedProfileLite[],
  stores: StoreLite[],
  sales: SeasonSaleLite[]
) {
  const profileStoreMap = new Map(profiles.map((profile) => [profile.id, profile.store_id]));

  return createRankingRows(
    stores.map((store) => {
      const relevantSales = sales.filter((sale) => {
        if (sale.season_id !== season.id) {
          return false;
        }

        if (sale.target_store_id === store.id) {
          return true;
        }

        const linkedStoreId = sale.target_profile_id
          ? profileStoreMap.get(sale.target_profile_id) ?? null
          : null;

        return linkedStoreId === store.id;
      });

      return {
        id: store.id,
        label: store.name,
        score: relevantSales.reduce((sum, sale) => sum + Number(sale.score ?? 0), 0),
        firstEntryAt: relevantSales
          .map((sale) => sale.entry_date || sale.created_at)
          .sort()[0] ?? ""
      };
    })
  );
}

function buildCampaignSummarySheet(campaigns: AdminCampaign[]) {
  return {
    name: "Kampanya Ozet",
    rows: [
      [
        "Kampanya",
        "Durum",
        "Tur",
        "Olcum",
        "Baslangic",
        "Bitis",
        "Odul Basligi",
        "1. Sira",
        "2. Sira",
        "3. Sira"
      ],
      ...campaigns.map((campaign) => [
        campaign.name,
        campaign.is_active ? "Aktif" : "Pasif",
        campaign.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli",
        campaign.scoring === "points" ? "Puan" : "Adet",
        campaign.start_at,
        campaign.end_at,
        campaign.reward_title ?? "",
        campaign.reward_first ?? "",
        campaign.reward_second ?? "",
        campaign.reward_third ?? ""
      ])
    ]
  } satisfies WorksheetDefinition;
}

function buildSeasonSummarySheet(seasons: SeasonRecord[]) {
  return {
    name: "Sezon Ozet",
    rows: [
      [
        "Sezon",
        "Durum",
        "Tur",
        "Olcum",
        "Baslangic",
        "Bitis",
        "Odul Basligi",
        "1. Sira",
        "2. Sira",
        "3. Sira"
      ],
      ...seasons.map((season) => [
        season.name,
        season.is_active ? "Aktif" : "Pasif",
        season.mode === "employee" ? "Calisan Bazli" : "Magaza Bazli",
        season.scoring === "points" ? "Puan" : "Adet",
        season.start_date,
        season.end_date,
        season.reward_title ?? "",
        season.reward_first ?? "",
        season.reward_second ?? "",
        season.reward_third ?? ""
      ])
    ]
  } satisfies WorksheetDefinition;
}

function buildRankingSheet(
  name: string,
  rows: RankingRow[],
  scoreLabel: string,
  showStoreColumn: boolean
) {
  const headers = showStoreColumn
    ? ["Sira", "Ad Soyad / Magaza", "Magaza", scoreLabel, "Ilk Giris"]
    : ["Sira", "Ad Soyad / Magaza", scoreLabel, "Ilk Giris"];

  return {
    name,
    rows: [
      headers,
      ...rows.map((row) =>
        showStoreColumn
          ? [row.rank, row.label, row.storeName, row.score, row.firstEntryAt || "-"]
          : [row.rank, row.label, row.score, row.firstEntryAt || "-"]
      )
    ]
  } satisfies WorksheetDefinition;
}

function buildWorksheetXml(sheetName: string, rows: CellValue[][]) {
  const tableRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value) => {
          const isNumber = typeof value === "number";
          const type = isNumber ? "Number" : "String";
          const text = isNumber ? String(value) : escapeXml(String(value ?? ""));
          const styleId = rowIndex === 0 ? ' ss:StyleID="Header"' : "";
          return `<Cell${styleId}><Data ss:Type="${type}">${text}</Data></Cell>`;
        })
        .join("");

      return `<Row>${cells}</Row>`;
    })
    .join("");

  return `
    <Worksheet ss:Name="${escapeXml(sheetName)}">
      <Table>
        ${tableRows}
      </Table>
    </Worksheet>
  `;
}

function buildExcelWorkbookXml(worksheets: WorksheetDefinition[]) {
  const usedNames = new Set<string>();
  const worksheetXml = worksheets
    .map((worksheet) => buildWorksheetXml(normalizeSheetName(worksheet.name, usedNames), worksheet.rows))
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#111827"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1F3C88" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  ${worksheetXml}
</Workbook>`;
}

export async function buildRankingExportWorkbook() {
  const admin = createAdminClient();
  const [{ data: campaigns }, { data: seasons }, { data: profiles }, { data: stores }, { data: campaignSales }, { data: seasonSales }] =
    await Promise.all([
      admin
        .from("campaigns")
        .select(
          "id, name, description, mode, scoring, start_date, end_date, start_at, end_at, reward_title, reward_details, reward_first, reward_second, reward_third, is_active, created_at"
        )
        .order("created_at", { ascending: false }),
      admin
        .from("seasons")
        .select(
          "id, name, description, start_date, end_date, mode, scoring, season_products, reward_title, reward_details, reward_first, reward_second, reward_third, is_active, created_at"
        )
        .order("created_at", { ascending: false }),
      admin
        .from("profiles")
        .select("id, full_name, role, is_on_leave, store_id, approval")
        .eq("approval", "approved"),
      admin.from("stores").select("id, name, is_active").eq("is_active", true),
      admin
        .from("sales_entries")
        .select("campaign_id, target_profile_id, target_store_id, weighted_score, created_at"),
      admin
        .from("season_sales_entries")
        .select("season_id, target_profile_id, target_store_id, score, entry_date, created_at")
    ]);

  const safeCampaigns = (campaigns as AdminCampaign[] | null) ?? [];
  const safeSeasons = (seasons as SeasonRecord[] | null) ?? [];
  const safeProfiles = ((profiles as ApprovedProfileLite[] | null) ?? []).filter(
    (profile) => profile.role === "employee" || profile.role === "manager"
  );
  const safeStores = (stores as StoreLite[] | null) ?? [];
  const safeCampaignSales = (campaignSales as CampaignSaleLite[] | null) ?? [];
  const safeSeasonSales = (seasonSales as SeasonSaleLite[] | null) ?? [];

  const worksheets: WorksheetDefinition[] = [
    buildCampaignSummarySheet(safeCampaigns),
    buildSeasonSummarySheet(safeSeasons)
  ];

  safeCampaigns.forEach((campaign) => {
    const leaderboard =
      campaign.mode === "employee"
        ? buildCampaignEmployeeRanking(campaign, safeProfiles, safeStores, safeCampaignSales)
        : buildCampaignStoreRanking(campaign, safeStores, safeCampaignSales);

    worksheets.push(
      buildRankingSheet(
        `K-${campaign.name}`,
        leaderboard,
        campaign.scoring === "points" ? "Toplam Puan" : "Toplam Adet",
        campaign.mode === "employee"
      )
    );
  });

  safeSeasons.forEach((season) => {
    const employeeLeague = buildSeasonEmployeeRanking(season, safeProfiles, safeStores, safeSeasonSales);
    const storeLeague = buildSeasonStoreRanking(season, safeProfiles, safeStores, safeSeasonSales);

    worksheets.push(
      buildRankingSheet(
        `S-${season.name}-Calisan`,
        employeeLeague,
        season.scoring === "points" ? "Toplam Puan" : "Toplam Adet",
        true
      )
    );
    worksheets.push(
      buildRankingSheet(
        `S-${season.name}-Magaza`,
        storeLeague,
        season.scoring === "points" ? "Toplam Puan" : "Toplam Adet",
        false
      )
    );
  });

  return buildExcelWorkbookXml(worksheets);
}
