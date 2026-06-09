import { NextResponse } from "next/server";
import { buildCsv } from "@/lib/export/csv";
import {
  formatMinutesAsHours,
  formatScheduleRange,
  formatWeekInput,
  getNetWorkedMinutes,
  getScheduleStatusLabel,
  getWeekDates,
  normalizeWeekStart,
  type WeeklyWorkScheduleRecord,
  type WorkScheduleStatus
} from "@/lib/work-schedules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type StoreRow = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string;
  approval: string;
  store_id: string | null;
  store: {
    name: string;
  } | null;
};

function safeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "haftalik-calisma-programi"
  );
}

function getWeeklyMinutes(entries: WeeklyWorkScheduleRecord[]) {
  return entries.reduce((sum, entry) => {
    if (entry.status !== "work") {
      return sum;
    }

    return sum + getNetWorkedMinutes(entry.start_time, entry.end_time);
  }, 0);
}

function getEntryForDay(entries: WeeklyWorkScheduleRecord[], dayOfWeek: number) {
  return entries.find((entry) => entry.day_of_week === dayOfWeek) ?? null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Giris gerekli." }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, role, approval, store_id, store:stores(name)")
    .eq("id", user.id)
    .single<ProfileRow>();

  if (!profile || profile.approval !== "approved" || !["employee", "manager", "management", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Yetkisiz erisim." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const selectedWeek = normalizeWeekStart(String(searchParams.get("week") ?? ""));
  const weekDates = getWeekDates(selectedWeek);

  const stores =
    (((await admin.from("stores").select("id, name").eq("is_active", true).order("name")).data as StoreRow[] | null) ?? []);

  const selectedStoreId = (() => {
    if (profile.role === "manager" || profile.role === "employee") {
      return profile.store_id ?? "";
    }

    const requested = String(searchParams.get("store") ?? "").trim();
    if (requested && stores.some((store) => store.id === requested)) {
      return requested;
    }

    return stores[0]?.id ?? "";
  })();

  if (!selectedStoreId) {
    return NextResponse.json({ error: "Magaza bulunamadi." }, { status: 404 });
  }

  const selectedStore = stores.find((store) => store.id === selectedStoreId) ?? null;

  const teamProfiles =
    (((await admin
      .from("profiles")
      .select("id, full_name, role, approval, store_id")
      .eq("approval", "approved")
      .eq("store_id", selectedStoreId)
      .in("role", ["employee", "manager"])
      .order("role", { ascending: false })
      .order("full_name")).data as ProfileRow[] | null) ?? []);

  const teamProfileIds = teamProfiles.map((item) => item.id);
  const teamScheduleRecords =
    teamProfileIds.length > 0
      ? (((await admin
          .from("weekly_work_schedules")
          .select("id, profile_id, store_id, week_start, day_of_week, status, start_time, end_time, updated_at")
          .eq("week_start", selectedWeek)
          .in("profile_id", teamProfileIds)
          .order("day_of_week")).data as WeeklyWorkScheduleRecord[] | null) ?? [])
      : [];

  const recordsByProfile = new Map<string, WeeklyWorkScheduleRecord[]>();
  teamScheduleRecords.forEach((record) => {
    const current = recordsByProfile.get(record.profile_id) ?? [];
    current.push(record);
    recordsByProfile.set(record.profile_id, current);
  });

  const rows = [
    ["Magaza", selectedStore?.name ?? profile.store?.name ?? ""],
    ["Hafta", `${weekDates[0]?.label} ${weekDates[0]?.shortDate} - ${weekDates[6]?.label} ${weekDates[6]?.shortDate}`],
    [],
    [
      "Personel",
      ...weekDates.map((day) => `${day.label} ${day.shortDate}`),
      "Haftalik Toplam",
      "Calisma Gunu"
    ],
    ...teamProfiles.map((person) => {
      const entries = recordsByProfile.get(person.id) ?? [];
      const weeklyMinutes = getWeeklyMinutes(entries);
      const workingDays = entries.filter((entry) => entry.status === "work").length;

      return [
        `${person.full_name ?? "Isimsiz Personel"}${person.role === "manager" ? " (Magaza Muduru)" : ""}`,
        ...weekDates.map((day) => {
          const entry = getEntryForDay(entries, day.dayOfWeek);
          const status = (entry?.status ?? "off") as WorkScheduleStatus;
          return status === "work"
            ? `${getScheduleStatusLabel(status)} | ${formatScheduleRange(entry?.start_time ?? null, entry?.end_time ?? null)}`
            : getScheduleStatusLabel(status);
        }),
        formatMinutesAsHours(weeklyMinutes),
        `${workingDays} calisma gunu`
      ];
    })
  ];

  const csv = buildCsv(rows);
  const fileName = safeFileName(
    `haftalik-calisma-programi-${selectedStore?.name ?? "magaza"}-${formatWeekInput(selectedWeek)}`
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
