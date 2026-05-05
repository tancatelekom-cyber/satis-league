export type CsvCell = string | number | null | undefined;

export function buildCsv(rows: CsvCell[][]) {
  const content = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? "" : String(cell);
          const escaped = value.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(";")
    )
    .join("\r\n");

  return `\uFEFF${content}`;
}
