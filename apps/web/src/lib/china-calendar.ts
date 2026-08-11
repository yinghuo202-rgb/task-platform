import chineseDays from "chinese-days/dist/index.min.js";

export type ChinaCalendarKind = "holiday" | "workday" | "solar-term" | "festival";

export type ChinaCalendarEvent = {
  id: string;
  date: string;
  title: string;
  kind: ChinaCalendarKind;
  color: string;
};

const COLORS: Record<ChinaCalendarKind, string> = {
  holiday: "#cb7d73",
  workday: "#8d8c9a",
  "solar-term": "#6f9f86",
  festival: "#b28c59",
};

const FESTIVAL_NAMES = new Map([
  ["春节", "春节"],
  ["元宵节", "元宵节"],
  ["上巳节", "上巳节"],
  ["端午节", "端午节"],
  ["乞巧节", "七夕"],
  ["中秋节", "中秋节"],
  ["重阳节", "重阳节"],
  ["腊八节", "腊八节"],
  ["除夕", "除夕"],
]);

/**
 * 生成内置中国历。所有计算都在本地完成，不依赖 NAS 运行时访问外网。
 * `to` 为开区间，与日历接口的范围语义保持一致。
 */
export function chinaCalendarEvents(from: Date, to: Date): ChinaCalendarEvent[] {
  if (to <= from) return [];
  const first = startOfDay(from);
  const last = addDays(startOfDay(to), -1);
  const firstKey = localDateKey(first);
  const lastKey = localDateKey(last);
  const events: ChinaCalendarEvent[] = [];

  for (let date = first; date <= last; date = addDays(date, 1)) {
    const dateKey = localDateKey(date);
    const detail = chineseDays.getDayDetail(dateKey);
    const holidayName = officialHolidayName(detail.name);
    if (!holidayName) continue;
    events.push(calendarEvent(
      dateKey,
      detail.work ? `调休上班 · ${holidayName}` : `${holidayName}假期`,
      detail.work ? "workday" : "holiday",
    ));
  }

  for (const term of chineseDays.getSolarTerms(firstKey, lastKey)) {
    events.push(calendarEvent(term.date, `${term.name} · 节气`, "solar-term"));
  }

  for (const festival of chineseDays.getLunarFestivals(firstKey, lastKey)) {
    const officialNames = new Set(events
      .filter((event) => event.date === festival.date && event.kind === "holiday")
      .map((event) => normalizeName(event.title)));
    const names = festival.name
      .map((name) => FESTIVAL_NAMES.get(name))
      .filter((name): name is string => Boolean(name))
      .filter((name, index, values) => values.indexOf(name) === index)
      .filter((name) => !officialNames.has(normalizeName(name)));
    for (const name of names) events.push(calendarEvent(festival.date, name, "festival"));
  }

  return events.sort((left, right) => left.date.localeCompare(right.date) || kindOrder(left.kind) - kindOrder(right.kind));
}

function calendarEvent(date: string, title: string, kind: ChinaCalendarKind): ChinaCalendarEvent {
  return { id: `china-calendar-${kind}-${date}-${title}`, date, title, kind, color: COLORS[kind] };
}

function officialHolidayName(rawName: string) {
  const parts = rawName.split(",");
  return parts.length >= 3 ? parts[1]?.trim() || null : null;
}

function normalizeName(value: string) {
  return value.replace(/[·\s]|假期|节/g, "");
}

function kindOrder(kind: ChinaCalendarKind) {
  return { holiday: 0, workday: 1, "solar-term": 2, festival: 3 }[kind];
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, amount: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function localDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
