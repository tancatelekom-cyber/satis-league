const LOGIN_DAY_KEY = "portal_login_day";
const LOGIN_COUNT_KEY = "portal_login_count";

export function getIstanbulDateKey(value: Date | string = new Date()) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return year && month && day ? `${year}-${month}-${day}` : "";
}

export function buildNextLoginMetadata(appMetadata: Record<string, unknown> | null | undefined) {
  const today = getIstanbulDateKey();
  const recordedDay = String(appMetadata?.[LOGIN_DAY_KEY] ?? "");
  const recordedCount = Number(appMetadata?.[LOGIN_COUNT_KEY] ?? 0);
  const nextCount = recordedDay === today && Number.isFinite(recordedCount)
    ? Math.max(0, Math.trunc(recordedCount)) + 1
    : 1;

  return {
    ...(appMetadata ?? {}),
    [LOGIN_DAY_KEY]: today,
    [LOGIN_COUNT_KEY]: nextCount
  };
}

export function getTodayLoginCount(
  appMetadata: Record<string, unknown> | null | undefined,
  lastSignInAt?: string | null
) {
  const today = getIstanbulDateKey();
  const recordedDay = String(appMetadata?.[LOGIN_DAY_KEY] ?? "");
  const recordedCount = Number(appMetadata?.[LOGIN_COUNT_KEY] ?? 0);

  if (recordedDay === today && Number.isFinite(recordedCount)) {
    return Math.max(0, Math.trunc(recordedCount));
  }

  return lastSignInAt && getIstanbulDateKey(lastSignInAt) === today ? 1 : 0;
}
