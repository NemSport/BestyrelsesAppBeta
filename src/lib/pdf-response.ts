export function pdfFileSlug(value: string, fallback: string) {
  return (
    value
      .toLocaleLowerCase("da-DK")
      .replace(/æ/g, "ae")
      .replace(/ø/g, "oe")
      .replace(/å/g, "aa")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback
  );
}

export function pdfContentDisposition(fileName: string) {
  const normalized = fileName.normalize("NFC").replace(/[\r\n"\\/]/g, "-");
  const asciiFallback = normalized
    .replace(/æ/gi, (value) => (value === "Æ" ? "AE" : "ae"))
    .replace(/ø/gi, (value) => (value === "Ø" ? "OE" : "oe"))
    .replace(/å/gi, (value) => (value === "Å" ? "AA" : "aa"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "-");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(normalized)}`;
}
