import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResolvedFeatureAccessForProfile } from "@/lib/feature-menu-permissions";
import {
  fetchWebKontorSheetData,
  formatWebKontorRate,
  getWebKontorRateMultiplier,
  sameWebKontorStore,
  type WebKontorStoreSummary
} from "@/lib/web-kontor";
import type { UserRole } from "@/lib/types";

type WebKontorProfile = {
  role: UserRole;
  approval: string;
  store: {
    name: string;
  } | null;
};

type WebKontorReachedScale = "2. Barem" | "1. Barem" | "Bareme Ulasmadi";

type WorksheetDefinition = {
  name: string;
  rows: Array<Array<string | number>>;
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

function buildWorksheetXml(sheetName: string, rows: WorksheetDefinition["rows"]) {
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

function safeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "web-kontor-akisi"
  );
}

function buildSelectedStoreSummaryRow(
  summary: WebKontorStoreSummary,
  dailyRows: Awaited<ReturnType<typeof fetchWebKontorSheetData>>["dailyRows"],
  scaleRules: Awaited<ReturnType<typeof fetchWebKontorSheetData>>["scaleRules"],
  scaleOneRate: number,
  scaleTwoRate: number
) {
  const scaleRule = scaleRules.find((rule) => sameWebKontorStore(rule.storeName, summary.storeName)) ?? null;
  const scaleOneTarget = scaleRule?.scaleOneTarget ?? null;
  const scaleTwoTarget = scaleRule?.scaleTwoTarget ?? null;
  let firstScaleDayCount = 0;
  let secondScaleDayCount = 0;
  let highestReachedScale: WebKontorReachedScale = "Bareme Ulasmadi";

  const bonusAmount = dailyRows.reduce((sum, row) => {
    const amount = row.storeAmounts.find((item) => sameWebKontorStore(item.storeName, summary.storeName))?.amount ?? 0;
    let rateValue = 0;

    if (scaleTwoTarget !== null && amount >= scaleTwoTarget) {
      rateValue = scaleTwoRate;
      secondScaleDayCount += 1;
      highestReachedScale = "2. Barem";
    } else if (scaleOneTarget !== null && amount >= scaleOneTarget) {
      rateValue = scaleOneRate;
      firstScaleDayCount += 1;
      if (highestReachedScale !== "2. Barem") {
        highestReachedScale = "1. Barem";
      }
    }

    return sum + amount * getWebKontorRateMultiplier(rateValue);
  }, 0);

  return {
    scaleOneTarget,
    scaleTwoTarget,
    highestReachedScale,
    firstScaleDayCount,
    secondScaleDayCount,
    bonusAmount
  };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Giris yapilmadi." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("approval, role, store:stores(name)")
      .eq("id", user.id)
      .single();

    const safeProfile = (profile as WebKontorProfile | null) ?? null;

    if (!safeProfile || safeProfile.approval !== "approved") {
      return NextResponse.json({ error: "Yetkisiz erisim." }, { status: 403 });
    }

    const resolvedFeatureAccess = await getResolvedFeatureAccessForProfile("web-kontor", user.id, safeProfile.role);

    if (!resolvedFeatureAccess.allowed) {
      return NextResponse.json({ error: "Yetkisiz erisim." }, { status: 403 });
    }

    const webKontorData = await fetchWebKontorSheetData();
    const ownStoreName = safeProfile.store?.name?.trim() ?? "";
    const canViewAllStores = safeProfile.role === "admin" || safeProfile.role === "management";
    const accessibleStoreNames = canViewAllStores
      ? webKontorData.storeNames
      : webKontorData.storeNames.filter((storeName) => sameWebKontorStore(storeName, ownStoreName));

    if (!accessibleStoreNames.length) {
      return NextResponse.json({ error: "Uygun sube bulunamadi." }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const requestedStore = searchParams.get("store")?.trim() ?? "";
    const selectedStore =
      accessibleStoreNames.find((storeName) => sameWebKontorStore(storeName, requestedStore)) ?? accessibleStoreNames[0];

    const selectedSummary = webKontorData.storeSummaries.find((summary) =>
      sameWebKontorStore(summary.storeName, selectedStore)
    );

    if (!selectedSummary) {
      return NextResponse.json({ error: "Sube ozeti bulunamadi." }, { status: 404 });
    }

    const selectedScaleSummary = buildSelectedStoreSummaryRow(
      selectedSummary,
      webKontorData.dailyRows,
      webKontorData.scaleRules,
      webKontorData.scaleOneRate,
      webKontorData.scaleTwoRate
    );

    const detailRows = webKontorData.dailyRows.map((row) => {
      const amount = row.storeAmounts.find((item) => sameWebKontorStore(item.storeName, selectedStore))?.amount ?? 0;
      let reachedScale: WebKontorReachedScale = "Bareme Ulasmadi";
      let rateValue = 0;

      if (selectedScaleSummary.scaleTwoTarget !== null && amount >= selectedScaleSummary.scaleTwoTarget) {
        reachedScale = "2. Barem";
        rateValue = webKontorData.scaleTwoRate;
      } else if (selectedScaleSummary.scaleOneTarget !== null && amount >= selectedScaleSummary.scaleOneTarget) {
        reachedScale = "1. Barem";
        rateValue = webKontorData.scaleOneRate;
      }

      return [
        row.dayLabel,
        amount,
        reachedScale,
        formatWebKontorRate(rateValue),
        Math.round(amount * getWebKontorRateMultiplier(rateValue)),
        row.companyTotal ?? 0
      ] as Array<string | number>;
    });

    const workbookXml = buildExcelWorkbookXml([
      {
        name: `${selectedStore} Ozet`,
        rows: [
          ["Sube", "Gerceklesen", "1. Barem", "2. Barem", "1. Barem Gun", "2. Barem Gun", "Ulasilan", "Prim Kazanimi"],
          [
            selectedStore,
            selectedSummary.totalAmount,
            selectedScaleSummary.scaleOneTarget ?? "-",
            selectedScaleSummary.scaleTwoTarget ?? "-",
            selectedScaleSummary.firstScaleDayCount,
            selectedScaleSummary.secondScaleDayCount,
            selectedScaleSummary.highestReachedScale,
            Math.round(selectedScaleSummary.bonusAmount)
          ]
        ]
      },
      {
        name: `${selectedStore} Akis`,
        rows: [
          ["Gun", "Gerceklesen", "Barem", "Prim Orani", "Gunluk Prim", "Firma Toplami"],
          ...detailRows
        ]
      }
    ]);

    const fileName = `${safeFileName(`web-kontor-akisi-${selectedStore}`)}-${new Date().toISOString().slice(0, 10)}.xls`;

    return new NextResponse(workbookXml, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Web kontor excel olusturulamadi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
