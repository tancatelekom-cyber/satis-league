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

type TeamProfile = {
  id: string;
  fullName: string;
  roleLabel: string;
};

type WeeklyWorkScheduleEditorProps = {
  profiles: TeamProfile[];
  redirectDay: string;
  redirectStoreId: string;
  saveAction: (formData: FormData) => void | Promise<void>;
  weekDates: WeekDate[];
  weekStart: string;
  initialEntriesByProfile: Record<string, WorkScheduleDayEntry[]>;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button-primary" type="submit" disabled={pending}>
      {pending ? "Kaydediliyor..." : "Tum Programi Kaydet"}
    </button>
  );
}

function buildFallbackEntries(weekDates: WeekDate[]) {
  return weekDates.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    status: "off" as const,
    startTime: null,
    endTime: null
  }));
}

function getAvailableEndTimes(startTime: string | null) {
  if (!startTime) {
    return WORK_SCHEDULE_TIME_OPTIONS;
  }

  return WORK_SCHEDULE_TIME_OPTIONS.filter((option) => option > startTime);
}

function getStatusSelectClass(status: WorkScheduleDayEntry["status"]) {
  if (status === "work") return "schedule-status-select schedule-status-select-work";
  if (status === "training") return "schedule-status-select schedule-status-select-training";
  if (status === "sick") return "schedule-status-select schedule-status-select-sick";
  if (status === "leave") return "schedule-status-select schedule-status-select-leave";
  return "schedule-status-select schedule-status-select-off";
}

export function WeeklyWorkScheduleEditor({
  profiles,
  redirectDay,
  redirectStoreId,
  saveAction,
  weekDates,
  weekStart,
  initialEntriesByProfile
}: WeeklyWorkScheduleEditorProps) {
  const [draft, setDraft] = useState<Record<string, WorkScheduleDayEntry[]>>(initialEntriesByProfile);
  const [isEditing, setIsEditing] = useState(false);

  const fallbackEntries = useMemo(() => buildFallbackEntries(weekDates), [weekDates]);

  function getEntry(profileId: string, dayOfWeek: number) {
    const entries = draft[profileId] ?? fallbackEntries;

    return (
      entries.find((item) => item.dayOfWeek === dayOfWeek) ?? {
        dayOfWeek,
        status: "off" as const,
        startTime: null,
        endTime: null
      }
    );
  }

  function updateRow(profileId: string, dayOfWeek: number, patch: Partial<WorkScheduleDayEntry>) {
    setDraft((current) => {
      const nextEntries = [...(current[profileId] ?? fallbackEntries)].map((entry) => {
        if (entry.dayOfWeek !== dayOfWeek) {
          return entry;
        }

        const next = { ...entry, ...patch };

        if (patch.status && patch.status !== "work") {
          next.startTime = null;
          next.endTime = null;
        }

        if (patch.startTime && next.endTime && next.endTime <= patch.startTime) {
          next.endTime = null;
        }

        return next;
      });

      return {
        ...current,
        [profileId]: nextEntries
      };
    });
  }

  return (
    <div className="schedule-editor-card">
      <div className="schedule-editor-toggle-row">
        <button
          className="button-schedule-edit"
          type="button"
          onClick={() => setIsEditing((current) => !current)}
        >
          {isEditing ? "Duzenlemeyi Gizle" : "Duzenle"}
        </button>
      </div>

      {isEditing ? (
        <form action={saveAction}>
          <input type="hidden" name="weekStart" value={weekStart} />
          <input type="hidden" name="redirectStoreId" value={redirectStoreId} />
          <input type="hidden" name="redirectDay" value={redirectDay} />
          <input type="hidden" name="profileIds" value={profiles.map((profile) => profile.id).join(",")} />

          <div className="schedule-bulk-table-wrap">
            <table className="schedule-bulk-table">
              <thead>
                <tr>
                  <th>Personel</th>
                  {weekDates.map((day) => (
                    <th key={`bulk-head-${day.dayOfWeek}`}>
                      {day.label}
                      <span>{day.shortDate}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={`bulk-row-${profile.id}`}>
                    <td className="schedule-bulk-person-cell">
                      <strong>{profile.fullName}</strong>
                      <span>{profile.roleLabel}</span>
                    </td>
                    {weekDates.map((day) => {
                      const entry = getEntry(profile.id, day.dayOfWeek);
                      const isWorking = entry.status === "work";
                      const availableEndTimes = getAvailableEndTimes(entry.startTime);

                      return (
                        <td key={`bulk-cell-${profile.id}-${day.dayOfWeek}`}>
                          <div className="schedule-bulk-cell">
                            <select
                              className={getStatusSelectClass(entry.status)}
                              name={`${profile.id}_${day.dayOfWeek}_status`}
                              value={entry.status}
                              onChange={(event) =>
                                updateRow(profile.id, day.dayOfWeek, {
                                  status: event.target.value as WorkScheduleDayEntry["status"]
                                })
                              }
                            >
                              {WORK_SCHEDULE_STATUS_OPTIONS.map((option) => (
                                <option key={`${profile.id}-${day.dayOfWeek}-${option.value}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>

                            <div className="schedule-bulk-time-grid">
                              <select
                                disabled={!isWorking}
                                name={`${profile.id}_${day.dayOfWeek}_start`}
                                value={entry.startTime ?? ""}
                                onChange={(event) =>
                                  updateRow(profile.id, day.dayOfWeek, {
                                    startTime: event.target.value || null
                                  })
                                }
                              >
                                <option value="">Basla</option>
                                {WORK_SCHEDULE_TIME_OPTIONS.map((option) => (
                                  <option key={`${profile.id}-${day.dayOfWeek}-start-${option}`} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>

                              <select
                                disabled={!isWorking}
                                name={`${profile.id}_${day.dayOfWeek}_end`}
                                value={entry.endTime ?? ""}
                                onChange={(event) =>
                                  updateRow(profile.id, day.dayOfWeek, {
                                    endTime: event.target.value || null
                                  })
                                }
                              >
                                <option value="">Bitir</option>
                                {availableEndTimes.map((option) => (
                                  <option key={`${profile.id}-${day.dayOfWeek}-end-${option}`} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="schedule-editor-actions">
            <SubmitButton />
          </div>
        </form>
      ) : null}
    </div>
  );
}
