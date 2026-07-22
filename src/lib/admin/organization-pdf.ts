import path from "node:path";
import pdfMake from "pdfmake";
import type { OrganizationChartData, OrganizationStore } from "@/lib/admin/organization-chart";

type PdfNode = Record<string, unknown>;

const coordinatorName = "Emre Terzi";

const fontDirectory = path.join(process.cwd(), "node_modules", "pdfmake", "fonts", "Roboto");
const fontPaths = {
  normal: path.join(fontDirectory, "Roboto-Regular.ttf"),
  bold: path.join(fontDirectory, "Roboto-Medium.ttf"),
  italics: path.join(fontDirectory, "Roboto-Italic.ttf"),
  bolditalics: path.join(fontDirectory, "Roboto-MediumItalic.ttf")
};
const allowedFontPaths = new Set(Object.values(fontPaths));

pdfMake.addFonts({ Roboto: fontPaths });
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy((filePath) => allowedFontPaths.has(path.resolve(filePath)));

function personRow(name: string, email: string, accent = false): PdfNode {
  return {
    margin: [0, 0, 0, 5],
    table: {
      widths: ["*"],
      body: [[{
        stack: [
          { text: name, bold: true, fontSize: 8.5, color: "#102347" },
          { text: email, fontSize: 6.7, color: "#58708F", margin: [0, 2, 0, 0] }
        ],
        fillColor: accent ? "#E8F4F3" : "#F7FAFC",
        margin: [7, 5, 7, 5]
      }]]
    },
    layout: {
      hLineColor: () => accent ? "#8FC6C2" : "#D9E4EC",
      vLineColor: () => accent ? "#8FC6C2" : "#D9E4EC"
    }
  };
}

function storeColumn(store: OrganizationStore, width: number): PdfNode {
  const managers = store.managers.length
    ? store.managers.map((manager) => personRow(manager.full_name, manager.email, true))
    : [{ text: "Müdür atanmamış", color: "#8B6B2E", fontSize: 7.5, italics: true, margin: [5, 4, 5, 8] }];
  const employees = store.employees.length
    ? store.employees.map((employee) => personRow(employee.full_name, employee.email))
    : [{ text: "Aktif çalışan yok", color: "#718096", fontSize: 7.5, italics: true, margin: [5, 4, 5, 0] }];

  return {
    width,
    unbreakable: true,
    stack: [
      {
        table: {
          widths: ["*"],
          body: [[{
            stack: [
              { text: store.name, bold: true, fontSize: 10, color: "#FFFFFF" },
              { text: `${store.city ?? "Şube"}  •  ${store.managers.length + store.employees.length} kişi`, fontSize: 7, color: "#DDF4F2", margin: [0, 2, 0, 0] }
            ],
            fillColor: "#205557",
            margin: [8, 7, 8, 7]
          }]]
        },
        layout: "noBorders"
      },
      { text: "MAĞAZA MÜDÜRÜ", bold: true, fontSize: 6.7, color: "#347878", margin: [5, 8, 5, 5] },
      ...managers,
      { text: "ÇALIŞANLAR", bold: true, fontSize: 6.7, color: "#347878", margin: [5, 6, 5, 5] },
      ...employees
    ]
  };
}

export async function createOrganizationPdf(data: OrganizationChartData) {
  const storeCount = Math.max(data.stores.length, 1);
  const storeWidth = 205;
  const columnGap = 12;
  const horizontalMargins = 64;
  const pageWidth = Math.max(842, horizontalMargins + (storeCount * storeWidth) + ((storeCount - 1) * columnGap));
  const tallestStoreRows = Math.max(
    1,
    ...data.stores.map((store) => Math.max(store.managers.length, 1) + Math.max(store.employees.length, 1))
  );
  const unassignedRows = data.unassignedProfiles.length ? Math.ceil(data.unassignedProfiles.length / 4) : 0;
  const pageHeight = Math.max(595, 300 + (tallestStoreRows * 52) + (unassignedRows * 18));
  const contentWidth = pageWidth - horizontalMargins;
  const storeColumns = data.stores.length
    ? data.stores.map((store) => storeColumn(store, storeWidth))
    : [{ width: storeWidth, text: "Aktif şube bulunamadı.", alignment: "center", color: "#718096", margin: [0, 20, 0, 20] }];

  const content: PdfNode[] = [
    { text: "ORGANİZASYON ŞEMASI", bold: true, fontSize: 22, color: "#102347", alignment: "center" },
    { text: "Şube bazlı yönetim ve ekip yapısı", fontSize: 9, color: "#58708F", alignment: "center", margin: [0, 4, 0, 12] },
    {
      columns: [
        { text: `${data.stores.length} Şube`, alignment: "center" },
        { text: `${data.managerCount} Mağaza Müdürü`, alignment: "center" },
        { text: `${data.employeeCount} Çalışan`, alignment: "center" }
      ],
      fontSize: 8,
      bold: true,
      color: "#205557",
      margin: [0, 0, 0, 14]
    },
    {
      columns: [
        { width: "*", text: "" },
        {
          width: 270,
          table: {
            widths: [270],
            body: [[{
              stack: [
                { text: "GENEL KOORDİNATÖR", bold: true, fontSize: 7, color: "#CDE9E6" },
                { text: coordinatorName, bold: true, fontSize: 13, color: "#FFFFFF", margin: [0, 3, 0, 0] },
                { text: data.coordinator?.email ?? "Kullanıcı kaydıyla eşleşmedi", fontSize: 7.5, color: "#DDF4F2", margin: [0, 2, 0, 0] }
              ],
              fillColor: "#1E5557",
              alignment: "center",
              margin: [10, 8, 10, 8]
            }]]
          },
          layout: "noBorders"
        },
        { width: "*", text: "" }
      ]
    },
    {
      canvas: [{ type: "line", x1: contentWidth / 2, y1: 0, x2: contentWidth / 2, y2: 13, lineWidth: 1.2, lineColor: "#6DA6A4" }]
    },
    { text: "Mağaza müdürleri genel koordinatöre bağlıdır", alignment: "center", color: "#58708F", fontSize: 7.5, margin: [0, 0, 0, 8] },
    {
      columns: storeColumns,
      columnGap,
      unbreakable: true
    }
  ];

  if (data.unassignedProfiles.length) {
    content.push({
      text: `ŞUBESİ ATANMAMIŞ: ${data.unassignedProfiles.map((profile) => profile.full_name).join(" • ")}`,
      fontSize: 7,
      color: "#8B6B2E",
      margin: [0, 12, 0, 0]
    });
  }

  return pdfMake.createPdf({
    pageSize: { width: pageWidth, height: pageHeight },
    pageMargins: [32, 26, 32, 24],
    defaultStyle: { font: "Roboto" },
    info: {
      title: "Organizasyon Şeması",
      subject: "Şube bazlı tek sayfalık organizasyon şeması",
      author: "Satış League"
    },
    content
  }).getBuffer();
}
