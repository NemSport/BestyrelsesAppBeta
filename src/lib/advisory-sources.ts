import type {
  GlobalSearchGroup,
  GlobalSearchResult,
} from "@/lib/global-search";

export const advisoryCategories = [
  "minutes",
  "documents",
  "decisions",
  "tasks",
  "annual_wheel",
] as const;
const commonWords = new Set(
  "hvad hvem hvor hvilke hvilken hvordan hvornår hvorfor nogen tidligere snakket snakke talt talte drøftet omkring henvisning henvisninger relevante møder mødet møderne gerne undersøge udkast vores næste ikke hjælp lav lave kan vil skal har var med det den der dig mig til som fra for også eller".split(
    " ",
  ),
);

export function advisoryTerms(question: string) {
  const words = question.toLocaleLowerCase("da-DK").match(/\p{L}{3,}/gu) ?? [];
  return [...new Set(words.filter((word) => !commonWords.has(word)))].slice(
    0,
    5,
  );
}

export async function advisorySources(
  question: string,
  search: (query: string) => Promise<{ groups: GlobalSearchGroup[] }>,
) {
  const results = await Promise.all(advisoryTerms(question).map(search));
  const sources = new Map<
    string,
    { record: GlobalSearchResult; matches: number }
  >();
  for (const result of results) {
    for (const group of result.groups) {
      if (!advisoryCategories.some((category) => category === group.type))
        continue;
      for (const record of group.results) {
        const key = `${record.type}:${record.id}`;
        const existing = sources.get(key);
        sources.set(key, {
          record: existing?.record ?? record,
          matches: (existing?.matches ?? 0) + 1,
        });
      }
    }
  }
  return [...sources.values()]
    .sort((a, b) => b.matches - a.matches)
    .slice(0, 18)
    .map(({ record }, index) => ({
      id: index + 1,
      title: record.title,
      excerpt: record.description,
      context: record.context,
      date: record.date,
      href: record.href,
    }));
}
