/**
 * RFC 4180-ish CSV serialization — the one place any export in this app turns
 * rows into a downloadable file. A field is quoted only when it actually
 * needs to be (contains a comma, a quote, or a newline); quoting everything
 * would be valid but unnecessarily noisy in a spreadsheet. `\r\n` line
 * endings, since that's what RFC 4180 (and Excel) expect.
 */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCsvField(column.header)).join(",");
  const lines = rows.map((row) => columns.map((column) => escapeCsvField(column.value(row))).join(","));
  return [header, ...lines].join("\r\n");
}
