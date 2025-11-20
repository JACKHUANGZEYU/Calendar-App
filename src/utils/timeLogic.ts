import { getLogicalId, type TaskBlock } from "../types";

export const HOURS_START = 0;
export const HOURS_END = 24;
export const MINUTES_PER_UNIT = 30;
export const UNITS_PER_HOUR = 60 / MINUTES_PER_UNIT; // 2
export const TOTAL_UNITS = (HOURS_END - HOURS_START) * UNITS_PER_HOUR;

export const COLORS = [
  "bg-sky-400", "bg-blue-500", "bg-emerald-400", "bg-lime-400",
  "bg-amber-400", "bg-orange-500", "bg-rose-400", "bg-violet-400",
];

export function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDateKey(key: string): Date {
  const [y, m, day] = key.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function addDaysToKey(key: string, offset: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + offset);
  return formatDateKey(d);
}

export function getDayLabelFromKey(key: string): { date: string; label: string } {
  const d = parseDateKey(key);
  const label = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return { date: key, label };
}

export function buildMonthGrid(monthStart: Date): (Date | null)[][] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay(); 
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function unitToTime(unit: number): { hour: number; minute: number } {
  const totalMinutes = HOURS_START * 60 + unit * MINUTES_PER_UNIT;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return { hour, minute };
}

export function formatTimeLabel(unit: number): string {
  const { hour, minute } = unitToTime(unit);
  const hh = hour.toString().padStart(2, "0");
  const mm = minute === 0 ? "00" : "30";
  return `${hh}:${mm}`;
}

export function timeStringToUnit(time: string): number {
  if (!time) return 0;
  const [hhStr, mmStr] = time.split(":");
  const hh = Number(hhStr);
  const mm = Number(mmStr);
  const minutesFromStart = (hh - HOURS_START) * 60 + (isNaN(mm) ? 0 : mm);
  return Math.round(minutesFromStart / MINUTES_PER_UNIT);
}

export function splitTaskAcrossDays(
  baseTask: TaskBlock,
  globalStartUnit: number, 
  totalDuration: number
): TaskBlock[] {
  const results: TaskBlock[] = [];
  let remainingDuration = totalDuration;
  let currentStart = globalStartUnit;
  let currentDate = baseTask.date;
  let partIndex = 0;

  while (remainingDuration > 0) {
    while (currentStart >= TOTAL_UNITS) {
      currentStart -= TOTAL_UNITS;
      currentDate = addDaysToKey(currentDate, 1);
    }
    while (currentStart < 0) {
      currentStart += TOTAL_UNITS;
      currentDate = addDaysToKey(currentDate, -1);
    }

    const spaceInDay = TOTAL_UNITS - currentStart;
    const chunkDuration = Math.min(remainingDuration, spaceInDay);
    const isFirst = partIndex === 0;
    const newId = isFirst ? getLogicalId(baseTask.id) : `${getLogicalId(baseTask.id)}-split-${partIndex}`;

    results.push({
      ...baseTask,
      id: newId,
      date: currentDate,
      startHour: currentStart,
      endHour: currentStart + chunkDuration,
    });

    remainingDuration -= chunkDuration;
    currentStart = 0;
    currentDate = addDaysToKey(currentDate, 1);
    partIndex++;
  }
  return results;
}