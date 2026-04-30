export function formatCampaignDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Istanbul"
  }).format(new Date(value));
}

export function daysLeftLabel(endAt: string) {
  const now = Date.now();
  const end = new Date(endAt).getTime();
  const diff = Math.max(0, end - now);
  const totalMinutes = Math.ceil(diff / (1000 * 60));

  if (totalMinutes <= 1) {
    return "son dakika";
  }

  if (totalMinutes < 60) {
    return `${totalMinutes} dk`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return minutes > 0 ? `${hours} sa ${minutes} dk` : `${hours} saat`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours > 0 ? `${days} gun ${remainingHours} sa` : `${days} gun`;
}

export function isSalesWindowOpen(startAt: string, endAt: string) {
  const now = Date.now();
  const start = new Date(startAt).getTime();
  const close = new Date(endAt).getTime() + 10 * 60 * 1000;
  return now >= start && now <= close;
}

export function isPlannedCampaign(startAt: string) {
  return Date.now() < new Date(startAt).getTime();
}

export function isRecentFinishedCampaign(endAt: string) {
  const now = Date.now();
  const end = new Date(endAt).getTime();
  return now > end && now <= end + 12 * 60 * 60 * 1000;
}

export function timeUntilLabel(startAt: string) {
  const now = Date.now();
  const start = new Date(startAt).getTime();
  const diff = Math.max(0, start - now);
  const totalMinutes = Math.ceil(diff / (1000 * 60));

  if (totalMinutes <= 1) {
    return "simdi basliyor";
  }

  if (totalMinutes < 60) {
    return `${totalMinutes} dk sonra`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return minutes > 0 ? `${hours} sa ${minutes} dk sonra` : `${hours} saat sonra`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours > 0 ? `${days} gun ${remainingHours} sa sonra` : `${days} gun sonra`;
}

export function localDateTimeToIso(value: string) {
  if (!value) {
    return "";
  }

  return `${value}:00+03:00`;
}

export function isoToLocalDateTimeInput(value: string) {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Istanbul"
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
