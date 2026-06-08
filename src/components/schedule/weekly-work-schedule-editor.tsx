"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  WORK_SCHEDULE_STATUS_OPTIONS,
  WORK_SCHEDULE_TIME_OPTIONS,
  type WorkScheduleDayEntry
} from "@/lib/work-schedules";

type WeekDate = {
  dayOfWeek: number;
  label: string;
  shortDate: string;
};

type WeeklyWorkScheduleEditorProps = {
  entries: WorkScheduleDayEntry[];
  redirectDay: string;
  redirectStoreId: string;
  saveAction: (formData: FormData) => void | Promise<void>;
  weekDates: WeekDate[];
  weekStart: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button-primary" type="submit" disabled={pending}>
      {pending ? "Kaydediliyor..." : "Programi Kaydet"}
    </button>
  );
}

export function WeeklyWorkScheduleEditor({
  entries,
  redirectDay,
  redirectStoreId,
  saveAction,
  weekDates,
  weekStart
}: WeeklyWorkScheduleEditorProps) {
  const [draft, setDraft] = useState(entries);

  const rows = useMemo(
    () =>
      weekDates.map((day) => ({
        ...day,
        entry: draft.find((item) => item.dayOfWeek === day.dayOfWeek) ?? {
          dayOfWeek: day.dayOfWeek,
          status: "off" as const,
          startTime: null,
          endTime: null
        }
      })),
    [draft, weekDates]
  );

  function updateRow(dayOfWeek: number, patch: Partial<WorkScheduleDayEntry>) {
    setDraft((current) =>
      current.map((entry) => {
        if (entry.dayOfWeek !== dayOfWeek) {
          return entry;
        }

        const next = { ...entry, ...patch };

        if (patch.status && patch.status !== "work") {
          next.startTime = null;
          next.endTime = null;
        }

        return next;
      })
    );
  }

  return (
    <form action={saveAction} className="schedule-editor-card">
      <input type="hidden" name="weekStart" value={weekStart} />
      <input type="hidden" name="redirectStoreId" value={redirectStoreId} />
      <input type="hidden" name="redirectDay" value={redirectDay} />

      <div className="schedule-editor-grid">
        {rows.map(({ dayOfWeek, label, shortDate, entry }) => {
          const isWorking = entry.status === "work";

          return (
            <section key={`editor-${dayOfWeek}`} className="schedule-day-card">
              <div className="schedule-day-card-head">
                <strong>{label}</strong>
                <span>{shortDate}</span>
              </div>

              <label className="schedule-field">
                <span>Durum</span>
                <select
                  name={`day_${dayOfWeek}_status`}
                  value={entry.status}
                  onChange={(event) => updateRow(dayOfWeek, { status: event.target.value as WorkScheduleDayEntry["status"] })}
                >
                  {WORK_SCHEDULE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="schedule-time-grid">
                <label className="schedule-field">
                  <span>Baslangic</span>
                  <select
                    disabled={!isWorking}
                    name={`day_${dayOfWeek}_start`}
                    value={entry.startTime ?? ""}
                    onChange={(event) => updateRow(dayOfWeek, { startTime: event.target.value || null })}
                  >
                    <option value="">Sec</option>
                    {WORK_SCHEDULE_TIME_OPTIONS.map((option) => (
                      <option key={`start-${dayOfWeek}-${option}`} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="schedule-field">
                  <span>Bitis</span>
                  <select
                    disabled={!isWorking}
                    name={`day_${dayOfWeek}_end`}
                    value={entry.endTime ?? ""}
                    onChange={(event) => updateRow(dayOfWeek, { endTime: event.target.value || null })}
                  >
                    <option value="">Sec</option>
                    {WORK_SCHEDULE_TIME_OPTIONS.map((option) => (
                      <option key={`end-${dayOfWeek}-${option}`} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="schedule-day-card-note">
                {entry.status === "leave"
                  ? "Bu gun izinli olarak isaretlenecek."
                  : entry.status === "off"
                    ? "Bu gun icin vardiya girilmeyecek."
                    : "Yarim saatlik vardiya araligini sec."}
              </p>
            </section>
          );
        })}
      </div>

      <div className="schedule-editor-actions">
        <SubmitButton />
      </div>
    </form>
  );
}
