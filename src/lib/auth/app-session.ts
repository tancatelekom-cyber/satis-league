export const APP_SESSION_COOKIE = "tanca_session";
export const APP_SESSION_DURATION_SECONDS = 60 * 60;
export const APP_SESSION_DURATION_MS = APP_SESSION_DURATION_SECONDS * 1000;

export function createAppSessionValue(now = Date.now()) {
  return String(now);
}

export function isAppSessionActive(rawValue: string | null | undefined, now = Date.now()) {
  if (!rawValue) {
    return false;
  }

  const issuedAt = Number(rawValue);

  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  if (issuedAt > now) {
    return false;
  }

  return now - issuedAt < APP_SESSION_DURATION_MS;
}
