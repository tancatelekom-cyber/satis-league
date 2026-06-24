import { NextResponse } from "next/server";
import { buildCsv } from "@/lib/export/csv";
import { fetchGoalActualRows, fetchGoalDayStats, type GoalActualRow } from "@/lib/goal-actuals";
import { createClient } from "@/lib/supabase/server";

type EmployeeSummary = {
  name: string;
  totalTarget: number;
  totalActual: number;
  actual: number;
  actualPercent: number | null;
  remaining: number | null;
  projectedActual: number;
  projectedPercent: number | null;
  hasTarget: boolean;
  showProjection: boolean;
};

function safeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "canli-primler-siralamasi"
  );
}

function normalizeCategoryKey(value: string) {
  return value
    .toLocaleUpperCase("tr-TR")
    .replace(/\u0130/g, "I")
    .replace(/\u011E/g, "G")
    .replace(/\u00DC/g, "U")
    .replace(/\u015E/g, "S")
    .replace(/\u00D6/g, "O")
    .replace(/\u00C7/g, "C");
}

function isAggregateCategoryLabel(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR");

  return normalized === "tum kategoriler" || normalized === "tÃ¼m kategoriler";
}

function isLivePrimeCategory(title: string | null | undefined) {
  const normalized = normalizeCategoryKey(String(title ?? ""));
  return normalized.includes("CANLI PRIM");
}

function buildEmployeeSummary(rows: GoalActualRow[], workedDays: number, totalDays: number): EmployeeSummary {
  const totalTarget = rows.reduce((sum, row) => sum + (row.target ?? 0), 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  const projectedActual = workedDays > 0 ? Math.floor((totalActual / workedDays) * totalDays) : totalActual;
  const hasTarget = totalTarget > 0;

  return {
    name: rows[0]?.employeeName ?? "-",
    totalTarget,
    totalActual,
    actual: totalActual,
    actualPercent: hasTarget ? (totalActual / totalTarget) * 100 : null,
    remaining: hasTarget ? Math.max(totalTarget - totalActual, 0) : null,
    projectedActual,
    projectedPercent: hasTarget ? (projectedActual / totalTarget) * 100 : null,
    hasTarget,
    showProjection: true
  };
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Giris gerekli." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("approval, role").eq("id", user.id).single();

  if (!profile || profile.approval !== "approved" || !["employee", "manager", "management", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Yetkisiz erisim." }, { status: 403 });
  }

  try {
    const [employeeRows, dayStats] = await Promise.all([fetchGoalActualRows(), fetchGoalDayStats()]);
    const scopedEmployeeRows =
      profile.role === "employee" ? employeeRows.filter((row) => row.personnelId && row.personnelId === user.id) : employeeRows;

    const employeeLivePrimeMap = new Map<string, GoalActualRow[]>();

    scopedEmployeeRows
      .filter((row) => !isAggregateCategoryLabel(row.mainCategory) && isLivePrimeCategory(row.mainCategory))
      .forEach((row) => {
        const current = employeeLivePrimeMap.get(row.employeeName) ?? [];
        current.push(row);
        employeeLivePrimeMap.set(row.employeeName, current);
      });

    const rankingRows = Array.from(employeeLivePrimeMap.entries())
      .map(([, rows]) => buildEmployeeSummary(rows, dayStats.workedDays, dayStats.totalDays))
      .sort((a, b) => {
        if (a.hasTarget && b.hasTarget) {
          return (b.projectedPercent ?? 0) - (a.projectedPercent ?? 0) || b.totalActual - a.totalActual;
        }

        if (a.hasTarget !== b.hasTarget) {
          return a.hasTarget ? -1 : 1;
        }

        return b.projectedActual - a.projectedActual || b.totalActual - a.totalActual;
      });

    const csv = buildCsv([
      ["Sira", "Calisan", "Gerceklesen"],
      ...rankingRows.map((row, index) => [String(index + 1), row.name, formatNumber(row.actual)])
    ]);

    const fileName = safeFileName(`canli-primler-siralamasi-${new Date().toISOString().slice(0, 10)}`);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Canli primler excel olusturulamadi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
