import readExcel from "read-excel-file/browser";
import {
  normalizeSponsorName,
  sponsorFields,
  sponsorRow,
  type SponsorField,
  type SponsorRow,
} from "./sponsor-import";

const header = (value: string) =>
  normalizeSponsorName(value).replace(/[^\p{L}\p{N}]/gu, "");
const columns = new Map<string, SponsorField>(
  Object.entries(sponsorFields).map(([key, label]) => [
    header(label),
    key as SponsorField,
  ]),
);
columns.set("virksomhedsnavn", "name");
columns.set("postnummer", "postal_code");
columns.set("cvrnummer", "cvr_number");
columns.set("mail", "email");

export async function readSponsorXlsx(file: File) {
  if (!/\.xlsx$/i.test(file.name) || !file.size || file.size > 5_000_000)
    throw new Error("Vælg en .xlsx-fil på højst 5 MB.");
  const sheets = await readExcel(file);
  const sponsors: SponsorRow[] = [];
  const ignored: string[] = [];
  for (const { sheet, data } of sheets) {
    const head = data.findIndex((row) =>
      row.some((cell) => columns.get(header(String(cell ?? ""))) === "name"),
    );
    if (head < 0) continue;
    const labels = data[head].map((cell) => String(cell ?? "").trim());
    for (const [offset, cells] of data.slice(head + 1).entries()) {
      const row = head + offset + 2;
      const fields: Partial<Record<SponsorField, string>> = {};
      const details: SponsorRow["details"] = [];
      const warnings: string[] = [];
      let contact: string | undefined;
      let owner: string | undefined;
      cells.forEach((cell, index) => {
        const label = labels[index];
        if (!label || cell === null || cell === undefined) return;
        const value = (
          cell instanceof Date
            ? cell.toISOString().slice(0, 10)
            : typeof cell === "boolean"
              ? cell
                ? "Ja"
                : "Nej"
              : String(cell)
        ).trim();
        if (!value || /^(ikke angivet|n\/?a|[-–—])$/i.test(value)) return;
        const key = columns.get(header(label));
        if (key) {
          if (
            key === "email" &&
            !sponsorRow.shape.fields.shape.email.safeParse(value).success
          ) {
            warnings.push("E-mail skal tjekkes");
            details.push([label, value.slice(0, 500)]);
          } else fields[key] = value;
        } else if (header(label) === "kontaktperson") contact = value;
        else if (header(label) === "internklubansvarlig") owner = value;
        else if (details.length < 30)
          details.push([label.slice(0, 150), value.slice(0, 500)]);
      });
      if (!Object.keys(fields).length && !details.length && !contact && !owner)
        continue;
      const result = sponsorRow.safeParse({
        source: sheet,
        row,
        fields,
        contact,
        owner,
        details,
        warnings,
      });
      if (result.success) sponsors.push(result.data);
      else
        ignored.push(
          `${sheet}, række ${row}: ${!fields.name ? "Firmanavn mangler" : "Et felt har en ugyldig værdi"}`,
        );
      if (sponsors.length > 500)
        throw new Error("Importér højst 500 sponsorrækker ad gangen.");
    }
  }
  if (!sponsors.length)
    throw new Error(
      "Filen indeholder ingen læsbare sponsorrækker med kolonnen Firmanavn.",
    );
  return { sponsors, ignored };
}
