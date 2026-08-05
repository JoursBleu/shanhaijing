/**
 * Extract plain text from an uploaded file for knowledge-base ingest.
 *
 * Every parser is lazy-loaded: a user who only ingests .md should not pay for
 * pdfjs/xlsx/jszip in the initial bundle.
 *
 * Office and epub files are all ZIP containers of XML, so xlsx covers workbooks
 * and jszip plus a tag-stripping pass covers pptx/epub.
 */

export const SUPPORTED_EXTENSIONS = [
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".html",
  ".htm",
  ".xml",
  ".pdf",
  ".docx",
  ".xlsx",
  ".xls",
  ".pptx",
  ".epub",
] as const;

/** `accept` value for a file input covering every supported format. */
export const FILE_ACCEPT = SUPPORTED_EXTENSIONS.join(",");

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf("."));
  switch (ext) {
    case ".pdf":
      return extractPdf(file);
    case ".docx":
      return extractDocx(file);
    case ".xlsx":
    case ".xls":
      return extractSpreadsheet(file);
    case ".pptx":
      return extractPptx(file);
    case ".epub":
      return extractEpub(file);
    case ".html":
    case ".htm":
      return extractHtml(await file.text());
    case ".csv":
    case ".tsv":
      return extractDelimited(await file.text(), ext === ".tsv" ? "\t" : ",");
    default:
      return file.text();
  }
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
    .default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const parts: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parts.push(
        (content.items as any[])
          .map((it) => (typeof it.str === "string" ? it.str : ""))
          .join(" "),
      );
    }
  } finally {
    await loadingTask.destroy();
  }
  return parts.join("\n\n").trim();
}

async function extractDocx(file: File): Promise<string> {
  const mammoth: any = await import("mammoth/mammoth.browser.js");
  const arrayBuffer = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer });
  return String(res?.value ?? "").trim();
}

/**
 * Sheets become Markdown tables: retrieval works on text, and a table keeps the
 * row/column association that a flat dump of a multi-sheet workbook loses.
 */
async function extractSpreadsheet(file: File): Promise<string> {
  const XLSX: any = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const out: string[] = [];
  for (const sheetName of wb.SheetNames as string[]) {
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      blankrows: false,
      defval: "",
    });
    if (rows.length === 0) continue;
    out.push(`## ${sheetName}\n\n${toMarkdownTable(rows)}`);
  }
  return out.join("\n\n").trim();
}

function toMarkdownTable(rows: any[][]): string {
  const cells = rows.map((r) =>
    r.map((c) => String(c ?? "").replace(/\|/g, "\\|")),
  );
  const width = Math.max(...cells.map((r) => r.length));
  const pad = (r: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
  const [head, ...body] = cells;
  if (!head) return "";
  return [
    pad(head),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...body.map(pad),
  ].join("\n");
}

async function extractPptx(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort(bySlideNumber);

  const out: string[] = [];
  for (const path of slides) {
    const xml = await zip.files[path]!.async("string");
    // <a:t> holds the rendered text of every shape and placeholder run.
    const text = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((m) => decodeXmlEntities(m[1]!))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) out.push(`## ${path.replace(/^.*\//, "")}\n\n${text}`);
  }
  return out.join("\n\n").trim();
}

function bySlideNumber(a: string, b: string): number {
  const n = (s: string) => Number(s.match(/(\d+)\.xml$/)?.[1] ?? 0);
  return n(a) - n(b);
}

async function extractEpub(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // Chapter order lives in the OPF spine; fall back to filename order when the
  // container is malformed rather than dropping the book entirely.
  let order: string[] = [];
  const opfPath = Object.keys(zip.files).find((p) => p.endsWith(".opf"));
  if (opfPath) {
    const opf = await zip.files[opfPath]!.async("string");
    const base = opfPath.includes("/")
      ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
      : "";
    const manifest = new Map<string, string>();
    for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
      const id = m[0].match(/\bid="([^"]+)"/)?.[1];
      const href = m[0].match(/\bhref="([^"]+)"/)?.[1];
      if (id && href) manifest.set(id, base + decodeXmlEntities(href));
    }
    order = [...opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/g)]
      .map((m) => manifest.get(m[1]!))
      .filter((p): p is string => !!p && !!zip.files[p]);
  }
  if (order.length === 0) {
    order = Object.keys(zip.files)
      .filter((p) => /\.x?html?$/i.test(p))
      .sort();
  }

  const parts: string[] = [];
  for (const path of order) {
    const html = await zip.files[path]?.async("string");
    if (!html) continue;
    const text = extractHtml(html);
    if (text) parts.push(text);
  }
  return parts.join("\n\n").trim();
}

/** Strip markup via DOMParser, dropping script/style so their source isn't indexed. */
function extractHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  return (doc.body?.textContent ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Rows are rendered as `column: value` records rather than raw delimited lines,
 * so a retrieved chunk carries its column names — a header row hundreds of
 * lines above would not survive chunking.
 */
function extractDelimited(text: string, delim: string): string {
  const rows = parseDelimited(text, delim);
  const [header, ...body] = rows;
  if (!header || body.length === 0) return text;
  return body
    .map((r) =>
      header
        .map((h, i) => (r[i] ? `${h}: ${r[i]}` : ""))
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean)
    .join("\n\n");
}

/** Minimal RFC-4180 reader: handles quoted fields containing delimiters/newlines. */
function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}
