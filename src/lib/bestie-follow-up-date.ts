import { validBestieDate } from "./bestie";
import { DANISH_TIME_ZONE, formatDanishDateKey } from "./date-format";

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

const weekdays = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

function shiftDate(date: string, days: number) {
  const day = new Date(date + "T12:00:00Z");
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

const clockRequest = /(?:^|[.!?;\n]\s*)(?:(?:kan|vil) du\s+)?(?:(?:sæt|set|det|lav)\s+(?:en\s+)?)?(?:følg(?:e)?\s+op|opfølgning(?:en|sdato)?|mind\s+mig|påmindelse(?:n)?|remind(?:er| me))\s+(?:(?:til|på|den)\s+)*/giu;
const clockTime = /\s+(?:kl(?:okken)?\.?\s*)?(\d{1,2})(?:[:.](\d{2}))?(?![\d:.])(?=\s*(?:[.!?;]|$))/u;

export function explicitBestieFollowUpTime(message: string, now: Date) {
  const today = formatDanishDateKey(now);
  const proposals = new Set<string>();
  let invalid = false;
  const matches = [...message.matchAll(clockRequest)];
  const requests = matches.map((match) => message.slice(match.index + match[0].length));
  if (!requests.length && /^(?:i dag|i morgen|overmorgen|om\s+\d+\s+minutter?)\b/iu.test(message.trim()))
    requests.push(message.trim());
  for (const request of requests) {
    const rest = request.toLowerCase();
    const minutes = /^om\s+(\d{1,3})\s+minutter?(?=\s*[.!?;]?(?:\s|$))/u.exec(rest);
    if (minutes && !/\b(?:eller|måske)\b/u.test(rest)) {
      const target = new Date(Math.ceil(now.getTime() / 60_000) * 60_000 + Number(minutes[1]) * 60_000);
      if (Number(minutes[1]) > 0) proposals.add(target.toISOString());
      else invalid = true;
      continue;
    }
    const clock = clockTime.exec(rest);
    // A bare day of the month or year is still a date, not a time.
    if (!clock || (!/kl/u.test(clock[0]) && !clock[2])) {
      if (/\bkl(?:okken)?[.\s]/u.test(rest)) invalid = true;
      continue;
    }
    const dateText = rest.slice(0, clock.index).trim();
    const relative = /^(i dag|i morgen|overmorgen)$/u.exec(dateText);
    const weekday = weekdays.indexOf(dateText.replace(/^næste\s+/u, ""));
    let date: string | null;
    if (relative) {
      date = shiftDate(today, relative[1] === "i dag" ? 0 : relative[1] === "i morgen" ? 1 : 2);
    } else if (weekday !== -1) {
      const todayWeekday = new Date(today + "T12:00:00Z").getUTCDay();
      date = shiftDate(today, ((weekday - todayWeekday + 6) % 7) + 1);
    } else {
      date = explicitBestieFollowUpDate("Følg op " + (dateText || today), today);
    }
    const hour = Number(clock[1]);
    const minute = Number(clock[2] ?? 0);
    if (!date || hour > 23 || minute > 59 || /\b(?:eller|måske)\b/u.test(rest)) {
      invalid = true;
      continue;
    }
    const wallTime = date + " " + String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
    const approximate = Date.parse(wallTime.replace(" ", "T") + "Z");
    const formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: DANISH_TIME_ZONE,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      hourCycle: "h23",
    });
    // Copenhagen uses UTC+1 or UTC+2. Reject nonexistent or ambiguous local times at DST transitions.
    const matches = [1, 2]
      .map((offset) => new Date(approximate - offset * 3_600_000))
      .filter((candidate) => formatter.format(candidate) === wallTime);
    if (matches.length !== 1 || matches[0] <= now) invalid = true;
    else proposals.add(matches[0].toISOString());
  }
  return {
    at: !invalid && proposals.size === 1 ? [...proposals][0] : null,
    needsClarification: invalid || proposals.size > 1,
    precedingText: matches[0]?.index
      ? message.slice(0, matches[0].index + 1).trim()
      : null,
  };
}
