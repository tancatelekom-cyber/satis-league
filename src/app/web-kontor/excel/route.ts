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

type ZipEntry = {
  name: string;
  data: Buffer;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getColumnName(index: number) {
  let value = index + 1;
  let label = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function buildSheetXml(rows: WorksheetDefinition["rows"]) {
  const maxColumnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const dimensionRef = `${getColumnName(0)}1:${getColumnName(Math.max(0, maxColumnCount - 1))}${Math.max(1, rows.length)}`;

  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, cellIndex) => {
          const cellRef = `${getColumnName(cellIndex)}${rowIndex + 1}`;
          const styleAttr = rowIndex === 0 ? ' s="1"' : "";

          if (typeof value === "number") {
            return `<c r="${cellRef}"${styleAttr}><v>${value}</v></c>`;
          }

          return `<c r="${cellRef}" t="inlineStr"${styleAttr}><is><t>${escapeXml(String(value ?? ""))}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimensionRef}"/>
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

function buildWorkbookXml(sheetNames: string[]) {
  const sheetsXml = sheetNames
    .map(
      (name, index) =>
        `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetsXml}</sheets>
</workbook>`;
}

function buildWorkbookRelsXml(sheetCount: number) {
  const sheetRelationships = Array.from({ length: sheetCount }, (_, index) => {
    return `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelationships}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font>
      <sz val="11"/>
      <color rgb="FF111827"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <color rgb="FFFFFFFF"/>
      <name val="Calibri"/>
      <family val="2"/>
    </font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill>
      <patternFill patternType="solid">
        <fgColor rgb="FF1F3C88"/>
        <bgColor indexed="64"/>
      </patternFill>
    </fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
}

function buildContentTypesXml(sheetCount: number) {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, index) => {
    return `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${sheetOverrides}
</Types>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildCoreXml(nowIso: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:dcmitype="http://purl.org/dc/dcmitype/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Tanca+</dc:creator>
  <cp:lastModifiedBy>Tanca+</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${nowIso}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppXml(sheetNames: string[]) {
  const titles = sheetNames.map((name) => `<vt:lpstr>${escapeXml(name)}</vt:lpstr>`).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Excel</Application>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>${sheetNames.length}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="${sheetNames.length}" baseType="lpstr">
      ${titles}
    </vt:vector>
  </TitlesOfParts>
</Properties>`;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
})();

function computeCrc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;

  return { dosDate, dosTime };
}

function createStoredZip(entries: ZipEntry[]) {
  const now = getDosDateTime(new Date());
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const dataBuffer = entry.data;
    const crc32 = computeCrc32(dataBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(now.dosTime, 10);
    localHeader.writeUInt16LE(now.dosDate, 12);
    localHeader.writeUInt32LE(crc32, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(now.dosTime, 12);
    centralHeader.writeUInt16LE(now.dosDate, 14);
    centralHeader.writeUInt32LE(crc32, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const localDirectory = Buffer.concat(localParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localDirectory.length, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([localDirectory, centralDirectory, endRecord]);
}

function buildXlsxBuffer(worksheets: WorksheetDefinition[]) {
  const usedNames = new Set<string>();
  const normalizedWorksheets = worksheets.map((worksheet) => ({
    name: normalizeSheetName(worksheet.name, usedNames),
    rows: worksheet.rows
  }));
  const nowIso = new Date().toISOString();
  const entries: ZipEntry[] = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(buildContentTypesXml(normalizedWorksheets.length), "utf8")
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(buildRootRelsXml(), "utf8")
    },
    {
      name: "docProps/core.xml",
      data: Buffer.from(buildCoreXml(nowIso), "utf8")
    },
    {
      name: "docProps/app.xml",
      data: Buffer.from(buildAppXml(normalizedWorksheets.map((worksheet) => worksheet.name)), "utf8")
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(buildWorkbookXml(normalizedWorksheets.map((worksheet) => worksheet.name)), "utf8")
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(buildWorkbookRelsXml(normalizedWorksheets.length), "utf8")
    },
    {
      name: "xl/styles.xml",
      data: Buffer.from(buildStylesXml(), "utf8")
    },
    ...normalizedWorksheets.map((worksheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: Buffer.from(buildSheetXml(worksheet.rows), "utf8")
    }))
  ];

  return createStoredZip(entries);
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

    const workbookBuffer = buildXlsxBuffer([
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

    const fileName = `${safeFileName(`web-kontor-akisi-${selectedStore}`)}-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(workbookBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Web kontor excel olusturulamadi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
