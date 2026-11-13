import { validBestieDate } from "./bestie";

const months = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

export function explicitBestieFollowUpDate(message: string, today: string) {
  const request = /(?:^|[.!?;\n]\s*)(?:kan du\s+|vil du\s+|sæt\s+(?:en\s+)?|lav\s+en\s+)?(?:følg(?:e)?\s+op|opfølgning(?:en|sdato)?|mind\s+mig|påmindelse(?:n)?)\s+(?:(?:til|på|den)\s+)*/giu;
  const dates = new Set<string>();
  for (const match of message.matchAll(request)) {
    const rest = message.slice(match.index + match[0].length).toLowerCase();
    if (/\b(?:eller|måske)\b/u.test(rest)) return null;
    const relative = /^om\s+(\d{1,3})\s+(dag(?:e)?|uge(?:r)?)\b/u.exec(rest);
    if (relative) {
      const date = new Date(`${today}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + Number(relative[1]) * (relative[2].startsWith("uge") ? 7 : 1));
      dates.add(date.toISOString().slice(0, 10));
      continue;
    }
    const iso = /^(\d{4}-\d{2}-\d{2})(?![\d-])/u.exec(rest);
    if (iso) {
      dates.add(iso[1]);
      continue;
    }
    const numeric = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?(?![\d/])/u.exec(rest);
    const named = /^(\d{1,2})\.?\s+([a-zæøå]+)(?:\s+(\d{4}))?\b/u.exec(rest);
    const month = numeric ? Number(numeric[2]) : months.indexOf(named?.[2] ?? "") + 1;
    const day = numeric?.[1] ?? named?.[1];
    if (!day || month < 1 || month > 12) continue;
    const year = numeric?.[3] ?? named?.[3];
    const suffix = `-${String(month).padStart(2, "0")}-${day.padStart(2, "0")}`;
    const currentYear = today.slice(0, 4);
    const candidate = currentYear + suffix;
    dates.add(year ? year + suffix : candidate < today ? String(Number(currentYear) + 1) + suffix : candidate);
  }
  const [date] = dates;
  return dates.size === 1 ? validBestieDate(date, today) : null;
}
