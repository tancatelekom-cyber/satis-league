import { redirect } from "next/navigation";
import { WeeklyWorkScheduleEditor } from "@/components/schedule/weekly-work-schedule-editor";
import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types";
import {
  formatWeekInput,
  formatMinutesAsHours,
  formatScheduleRange,
  getDefaultWeekDay,
  getNetWorkedMinutes,
  getScheduleStatusLabel,
  getWeekDates,
  mergeWeekEntries,
  normalizeWeekStart,
  type WeeklyWorkScheduleRecord,
  type WorkScheduleStatus
} from "@/lib/work-schedules";
import { saveWeeklyWorkScheduleAction } from "./actions";

type StoreRow = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: UserRole;
  approval: string;
  store_id: string | null;
  store: {
    name: string;
  } | null;
};

type PageProps = {
  searchParams?: Promise<{
    week?: string;
    store?: string;
    day?: string;
    profile?: string;
    message?: string;
    type?: string;
  }>;
};

function canViewTeam(role: UserRole) {
  return role === "employee" || role === "manager" || role === "management" || role === "admin";
}

function canEditOwnSchedule(role: UserRole) {
  return role === "employee" || role === "manager";
}

function clampDay(value: string | undefined, weekStart: string) {
  const raw = Number(value ?? getDefaultWeekDay(weekStart));

  if (!Number.isFinite(raw)) {
    return Number(getDefaultWeekDay(weekStart));
  }

  return Math.max(0, Math.min(6, Math.trunc(raw)));
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

function getStatusClass(status: WorkScheduleStatus) {
  if (status === "work") return "schedule-pill-work";
  if (status === "leave") return "schedule-pill-leave";
  return "schedule-pill-off";
}

export default async function WeeklyWorkSchedulePage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, role, approval, store_id, store:stores(name)")
    .eq("id", user.id)
    .single<ProfileRow>();

  if (!profile || profile.approval !== "approved") {
    redirect("/giris");
  }

  const selectedWeek = normalizeWeekStart(params.week);
  const weekDates = getWeekDates(selectedWeek);
  const selectedDay = clampDay(params.day, selectedWeek);
  const canPickStore = profile.role === "management" || profile.role === "admin";
  const teamVisible = canViewTeam(profile.role);
  const ownEditable = canEditOwnSchedule(profile.role);
  const canManageTeamSchedules = profile.role === "manager" || profile.role === "management" || profile.role === "admin";

  const stores = teamVisible
    ? (((await admin.from("stores").select("id, name").eq("is_active", true).order("name")).data as StoreRow[] | null) ?? [])
    : [];

  const selectedStoreId = (() => {
    if (!teamVisible) {
      return profile.store_id ?? "";
    }

    if (profile.role === "manager" || profile.role === "employee") {
      return profile.store_id ?? "";
    }

    const requested = String(params.store ?? "").trim();

    if (requested && stores.some((store) => store.id === requested)) {
      return requested;
    }

    return stores[0]?.id ?? "";
  })();

  const selectedStore = stores.find((store) => store.id === selectedStoreId) ?? null;
  const selectedStoreName = profile.role === "manager" || profile.role === "employee"
    ? profile.store?.name ?? "Magaza atanmamis"
    : selectedStore?.name ?? "Magaza secin";

  const teamProfiles =
    teamVisible && selectedStoreId
      ? (((await admin
          .from("profiles")
          .select("id, full_name, role, approval, store_id, store:stores(name)")
          .eq("approval", "approved")
          .eq("store_id", selectedStoreId)
          .in("role", ["employee", "manager"])
          .order("role", { ascending: false })
          .order("full_name")).data as ProfileRow[] | null) ?? [])
      : [];

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

  const ownScheduleRecords = ownEditable
    ? teamScheduleRecords.filter((item) => item.profile_id === profile.id)
    : [];
  const ownEntries = mergeWeekEntries(ownScheduleRecords);

  const recordsByProfile = new Map<string, WeeklyWorkScheduleRecord[]>();
  teamScheduleRecords.forEach((record) => {
    const current = recordsByProfile.get(record.profile_id) ?? [];
    current.push(record);
    recordsByProfile.set(record.profile_id, current);
  });

  const teamRows = teamProfiles.map((person) => {
    const entries = recordsByProfile.get(person.id) ?? [];
    const selectedEntry = getEntryForDay(entries, selectedDay);
    const weeklyMinutes = getWeeklyMinutes(entries);
    const workingDays = entries.filter((entry) => entry.status === "work").length;

    return {
      id: person.id,
      name: person.full_name ?? "Isimsiz Personel",
      roleLabel: person.role === "manager" ? "Magaza Muduru" : "Personel",
      weeklyMinutes,
      workingDays,
      selectedStatus: (selectedEntry?.status ?? "off") as WorkScheduleStatus,
      selectedRange: formatScheduleRange(selectedEntry?.start_time ?? null, selectedEntry?.end_time ?? null),
      entries
    };
  });

  const selectedDayRows = teamRows.filter((row) => row.selectedStatus === "work");
  const selectedLeaveRows = teamRows.filter((row) => row.selectedStatus === "leave");
  const selectedOffRows = teamRows.filter((row) => row.selectedStatus === "off");
  const selectedDayMinutes = selectedDayRows.reduce((sum, row) => {
    const selectedEntry = getEntryForDay(row.entries, selectedDay);
    return sum + getNetWorkedMinutes(selectedEntry?.start_time ?? null, selectedEntry?.end_time ?? null);
  }, 0);

  const weekLabel = `${weekDates[0]?.shortDate ?? ""} - ${weekDates[6]?.shortDate ?? ""}`;
  const initialEntriesByProfile = Object.fromEntries(
    teamProfiles.map((person) => [person.id, mergeWeekEntries(recordsByProfile.get(person.id) ?? [])])
  );

  return (
    <div className="schedule-shell">
      <section className="schedule-hero">
        <div className="schedule-hero-copy">
          <span className="schedule-kicker">Haftalik Calisma Programi</span>
          <h1>Calisma takvimi ve ekip ozeti</h1>
          <p>
            Pazartesiden pazara kadar haftalik planini olustur. Calisan ekip arkadaslarini gorebilir; mudur, yonetim ve admin ise
            secilen magazanin gunluk durumunu ve haftalik ozetini takip eder.
          </p>
        </div>

        <form className="schedule-filter-form" method="get">
          <label className="schedule-field">
            <span>Hafta secimi</span>
            <input defaultValue={formatWeekInput(selectedWeek)} name="week" type="week" />
            <small className="schedule-field-hint">
              {weekDates[0]?.label} {weekDates[0]?.shortDate} - {weekDates[6]?.label} {weekDates[6]?.shortDate}
            </small>
          </label>

          {canPickStore ? (
            <label className="schedule-field">
              <span>Magaza</span>
              <select defaultValue={selectedStoreId} name="store">
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input name="store" type="hidden" value={selectedStoreId} />
          )}

          <label className="schedule-field">
            <span>Gun ozeti</span>
            <select defaultValue={String(selectedDay)} name="day">
              {weekDates.map((day) => (
                <option key={`day-option-${day.dayOfWeek}`} value={day.dayOfWeek}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>

          <button className="button-secondary" type="submit">
            Haftayi Getir
          </button>
        </form>
      </section>

      {params.message ? (
        <div className={`notice ${params.type === "error" ? "danger" : ""}`} role="alert">
          <strong>{params.type === "error" ? "Islem Tamamlanamadi" : "Islem Tamamlandi"}</strong>
          <span>{params.message}</span>
        </div>
      ) : null}

      <section className="schedule-summary-grid">
        <article className="schedule-summary-card">
          <span>Secili Magaza</span>
          <strong>{selectedStoreName}</strong>
          <p>{weekLabel} haftasi gosteriliyor.</p>
        </article>
        <article className="schedule-summary-card">
          <span>Secili Gun</span>
          <strong>{weekDates[selectedDay]?.label}</strong>
          <p>{weekDates[selectedDay]?.shortDate}</p>
        </article>
        <article className="schedule-summary-card">
          <span>Calisan Kisi</span>
          <strong>{teamVisible ? teamProfiles.length : 1}</strong>
          <p>{teamVisible ? "Secili magazadaki takip edilen personel sayisi." : "Kendi haftalik programin."}</p>
        </article>
        <article className="schedule-summary-card">
          <span>Gunluk Toplam</span>
          <strong>{formatMinutesAsHours(selectedDayMinutes)}</strong>
          <p>Secili gunde planlanan toplam vardiya suresi.</p>
        </article>
      </section>

      {canManageTeamSchedules && teamProfiles.length > 0 ? (
        <section className="schedule-section-card">
          <div className="schedule-section-head">
            <div>
              <span>Toplu Veri Girisi</span>
              <h2>Secilen magazanin haftalik calisma tablosu</h2>
            </div>
            <p>
              Magaza muduru, yonetici ve admin secilen hafta icin tum ekipteki durum ve saatleri bu tablo uzerinden gunceller.
            </p>
          </div>

          <WeeklyWorkScheduleEditor
            initialEntriesByProfile={initialEntriesByProfile}
            profiles={teamProfiles.map((person) => ({
              id: person.id,
              fullName: person.full_name ?? "Isimsiz Personel",
              roleLabel: person.role === "manager" ? "Magaza Muduru" : "Personel"
            }))}
            redirectDay={String(selectedDay)}
            redirectStoreId={selectedStoreId}
            saveAction={saveWeeklyWorkScheduleAction}
            weekDates={weekDates}
            weekStart={selectedWeek}
          />
        </section>
      ) : null}

      {teamVisible ? (
        <>
          <section className="schedule-section-card">
            <div className="schedule-section-head">
              <div>
                <span>Gunluk Ozet</span>
                <h2>{weekDates[selectedDay]?.label} gunu ekip durumu</h2>
              </div>
              <p>Bu alanda secilen gunun tum personel dagilimi ve ekip programi gorunur.</p>
            </div>

            <div className="schedule-status-strip">
              <span className="schedule-pill schedule-pill-work">Calisan: {selectedDayRows.length}</span>
              <span className="schedule-pill schedule-pill-leave">Izinli: {selectedLeaveRows.length}</span>
              <span className="schedule-pill schedule-pill-off">Bos: {selectedOffRows.length}</span>
            </div>

            <div className="schedule-daily-grid">
              {teamRows.map((row) => (
                <article key={`daily-${row.id}`} className="schedule-daily-card">
                  <div className="schedule-daily-card-head">
                    <strong>{row.name}</strong>
                    <span>{row.roleLabel}</span>
                  </div>
                  <span className={`schedule-pill ${getStatusClass(row.selectedStatus)}`}>{getScheduleStatusLabel(row.selectedStatus)}</span>
                  <p>{row.selectedStatus === "work" ? row.selectedRange : row.selectedStatus === "leave" ? "Izinli gun." : "Program girilmedi."}</p>
                  <small>Haftalik toplam: {formatMinutesAsHours(row.weeklyMinutes)}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="schedule-section-card">
            <div className="schedule-section-head">
              <div>
                <span>Haftalik Matris</span>
                <h2>Tum personelin secili hafta ozeti</h2>
              </div>
              <p>Yarim saatlik vardiyalar, izinli gunler ve bos gunler tek tabloda listelenir.</p>
            </div>

            <div className="schedule-table-wrap">
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th>Personel</th>
                    {weekDates.map((day) => (
                      <th key={`head-${day.dayOfWeek}`}>
                        {day.label}
                        <br />
                        <span>{day.shortDate}</span>
                      </th>
                    ))}
                    <th>Haftalik Ozet</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRows.map((row) => (
                    <tr key={`row-${row.id}`}>
                      <td>
                        <strong>{row.name}</strong>
                        <span>{row.roleLabel}</span>
                      </td>
                      {weekDates.map((day) => {
                        const entry = getEntryForDay(row.entries, day.dayOfWeek);
                        const status = (entry?.status ?? "off") as WorkScheduleStatus;

                        return (
                          <td key={`${row.id}-${day.dayOfWeek}`}>
                            <span className={`schedule-pill ${getStatusClass(status)}`}>{getScheduleStatusLabel(status)}</span>
                            <small>{status === "work" ? formatScheduleRange(entry?.start_time ?? null, entry?.end_time ?? null) : "-"}</small>
                          </td>
                        );
                      })}
                      <td>
                        <strong>{formatMinutesAsHours(row.weeklyMinutes)}</strong>
                        <span>{row.workingDays} calisma gunu</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
