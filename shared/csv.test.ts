import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

interface Row {
  name: string;
  score: number;
  note: string | null;
}

const columns = [
  { header: "Name", value: (r: Row) => r.name },
  { header: "Score", value: (r: Row) => r.score },
  { header: "Note", value: (r: Row) => r.note },
];

describe("toCsv", () => {
  it("renders a header row and one line per row, comma-joined", () => {
    const csv = toCsv<Row>([{ name: "Jane", score: 80, note: "ok" }], columns);
    expect(csv).toBe("Name,Score,Note\r\nJane,80,ok");
  });

  it("emits just the header for an empty row set", () => {
    expect(toCsv<Row>([], columns)).toBe("Name,Score,Note");
  });

  it("quotes a field containing a comma", () => {
    const csv = toCsv<Row>([{ name: "Doe, Jane", score: 1, note: null }], columns);
    expect(csv).toBe('Name,Score,Note\r\n"Doe, Jane",1,');
  });

  it("quotes a field containing a double quote, doubling the internal quote", () => {
    const csv = toCsv<Row>([{ name: `Jane "JJ" Doe`, score: 1, note: null }], columns);
    expect(csv).toBe('Name,Score,Note\r\n"Jane ""JJ"" Doe",1,');
  });

  it("quotes a field containing a newline", () => {
    const csv = toCsv<Row>([{ name: "Jane", score: 1, note: "line one\nline two" }], columns);
    expect(csv).toBe('Name,Score,Note\r\nJane,1,"line one\nline two"');
  });

  it("renders null and undefined values as an empty field, not the literal string", () => {
    const csv = toCsv<Row>([{ name: "Jane", score: 1, note: null }], columns);
    expect(csv).toContain("Jane,1,");
    expect(csv).not.toContain("null");
  });

  it("does not quote a plain numeric or alphanumeric field", () => {
    const csv = toCsv<Row>([{ name: "Jane123", score: 42, note: "fine" }], columns);
    expect(csv).toBe("Name,Score,Note\r\nJane123,42,fine");
  });

  it("renders multiple rows in order, each on its own line", () => {
    const csv = toCsv<Row>(
      [
        { name: "A", score: 1, note: null },
        { name: "B", score: 2, note: null },
      ],
      columns,
    );
    expect(csv.split("\r\n")).toEqual(["Name,Score,Note", "A,1,", "B,2,"]);
  });
});
