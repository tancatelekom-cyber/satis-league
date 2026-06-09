export const WORK_SCHEDULE_DAY_LABELS = [
  "Pazartesi",
  "Sali",
  "Carsamba",
  "Persembe",
  "Cuma",
  "Cumartesi",
  "Pazar"
] as const;

export const WORK_SCHEDULE_STATUS_OPTIONS = [
  { value: "work", label: "Calisiyor" },
  { value: "training", label: "Egitimde" },
  { value: "leave", label: "Izinli" },
  { value: "off", label: "Bos" }
] as const;

export type WorkScheduleStatus = (typeof WORK_SCHEDULE_STATUS_OPTIONS)[number]["value"];

export type WorkScheduleDayEntry = {
  dayOfWeek: number;
  status: WorkScheduleStatus;
  startTime: string | null;
  endTime: string | null;
};

export type WeeklyWorkScheduleRecord = {
  id: string;
  profile_id: string;
  store_id: string;
  week_start: string;
  day_of_week: number;
  status: WorkScheduleStatus;
  start_time: string | null;
  end_time: string | null;
  updated_at: string;
};

export function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function startOfWeek(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function parseWeekInput(value: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const week = Number(match[2]);

  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) {
    return null;
  }

  const januaryFourth = new Date(year, 0, 4);
  const firstWeekStart = startOfWeek(januaryFourth);
  const monday = new Date(firstWeekStart);
  monday.setDate(firstWeekStart.getDate() + (week - 1) * 7);

  return monday;
}

export function normalizeWeekStart(input?: string | null) {
  const weekInput = input ? parseWeekInput(input) : null;
  const source = weekInput ?? (input ? new Date(`${input}T00:00:00`) : new Date());
  const normalized = Number.isNaN(source.getTime()) ? new Date() : source;
  return toIsoDate(startOfWeek(normalized));
}

export function formatWeekInput(weekStart: string) {
  const normalized = new Date(`${normalizeWeekStart(weekStart)}T00:00:00`);
  const thursday = new Date(normalized);
  thursday.setDate(normalized.getDate() + 3);

  const isoYear = thursday.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const firstWeekStart = startOfWeek(firstThursday);
  const diff = thursday.getTime() - firstWeekStart.getTime();
  const weekNumber = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;

  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}

export function getWeekDates(weekStart: string) {
  const base = new Date(`${normalizeWeekStart(weekStart)}T00:00:00`);

  return WORK_SCHEDULE_DAY_LABELS.map((label, index) => {
    const next = new Date(base);
    next.setDate(base.getDate() + index);

    return {
      label,
      dayOfWeek: index,
      isoDate: toIsoDate(next),
      shortDate: next.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "2-digit"
      })
    };
  });
}

export function getDefaultWeekDay(weekStart: string) {
  const normalized = normalizeWeekStart(weekStart);
  const dates = getWeekDates(normalized);
  const today = toIsoDate(new Date());
  const current = dates.find((item) => item.isoDate === today);
  return String(current?.dayOfWeek ?? 0);
}

export function buildHalfHourOptions() {
  const values: string[] = [];

  for (let hour = 8; hour <= 23; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === 23 && minute === 30) {
        continue;
      }

      values.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    }
  }

  return values;
}

export const WORK_SCHEDULE_TIME_OPTIONS = buildHalfHourOptions();

export function buildEmptyWeekEntries(): WorkScheduleDayEntry[] {
  return WORK_SCHEDULE_DAY_LABELS.map((_, index) => ({
    dayOfWeek: index,
    status: "off",
    startTime: null,
    endTime: null
  }));
}

export function mergeWeekEntries(records: WeeklyWorkScheduleRecord[] | null | undefined) {
  const byDay = new Map<number, WeeklyWorkScheduleRecord>();

  (records ?? []).forEach((record) => {
    byDay.set(record.day_of_week, record);
  });

  return buildEmptyWeekEntries().map((entry) => {
    const record = byDay.get(entry.dayOfWeek);

    return {
      dayOfWeek: entry.dayOfWeek,
      status: record?.status ?? entry.status,
      startTime: record?.start_time?.slice(0, 5) ?? null,
      endTime: record?.end_time?.slice(0, 5) ?? null
    } satisfies WorkScheduleDayEntry;
  });
}

export function formatScheduleRange(startTime: string | null, endTime: string | null) {
  if (!startTime || !endTime) {
    return "-";
  }

  return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}

export function getScheduleStatusLabel(status: WorkScheduleStatus) {
  return WORK_SCHEDULE_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? "Bos";
}

export function parseTimeToMinutes(value: string | null | undefined) {
  if (!value || !/^\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    return null;
  }

  const [hour, minute] = value.split(":").slice(0, 2).map(Number);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

export function getNetWorkedMinutes(startTime: string | null | undefined, endTime: string | null | undefined) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);

  if (start === null || end === null || end <= start) {
    return 0;
  }

  return Math.max(0, end - start - 60);
}

export function formatMinutesAsHours(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return "0 saat";
  }

  const hours = totalMinutes / 60;

  return `${hours.toLocaleString("tr-TR", {
    minimumFractionDigits: Number.isInteger(hours) ? 0 : 1,
    maximumFractionDigits: 1
  })} saat`;
}
