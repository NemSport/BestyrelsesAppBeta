import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateIssue12Fixtures } from "./pdf-fixtures";

async function main() {
  const target = path.resolve(process.argv[2] ?? "tmp/pdfs/issue-12");
  await mkdir(target, { recursive: true });
  const fixtures = await generateIssue12Fixtures();
  for (const [name, bytes] of Object.entries(fixtures)) {
    await writeFile(path.join(target, `${name}.pdf`), bytes);
  }
  console.log(target);
}

void main();
