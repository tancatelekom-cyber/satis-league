import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fetchGoalActualRows, getIstanbulPeriodMonth } from "@/lib/goal-actuals";
import { attachPerformanceTargets, fetchDailyPerformance } from "@/lib/daily-performance";
import { DailyPerformanceDashboard } from "@/components/evaluation/daily-performance-dashboard";

export default async function DailyPerformancePage({ searchParams }: { searchParams: Promise<{ employee?: string }> }) {
  const user = await requireUser();
  const client = await createClient();
  const { data: profile } = await client.from('profiles').select('role,approval').eq('id', user.id).single();
  if (!profile || profile.approval !== 'approved') redirect('/hesabim');
  const canViewAll = ['admin', 'management', 'manager'].includes(profile.role);
  const period = getIstanbulPeriodMonth();
  const params = await searchParams;
  let rows: Awaited<ReturnType<typeof fetchDailyPerformance>> = [];
  let error = '', targetWarning = '';
  try {
    const [daily, targets] = await Promise.all([fetchDailyPerformance(), fetchGoalActualRows(period).catch(() => { targetWarning = 'Aylık hedefler okunamadı. Adet grafikleri gösteriliyor; yüzde grafikleri hedefler geldiğinde açılacak.'; return []; })]);
    rows = attachPerformanceTargets(daily.filter(row => canViewAll || row.personnelId === user.id), targets);
  } catch { error = 'Günlük performans verisi şu anda alınamıyor. Sayfayı yenileyerek tekrar deneyin.'; }
  if (rows.length) {
    try {
      const start = new Date(`${period}-01T00:00:00Z`);
      start.setUTCDate(start.getUTCDate() - 6);
      const { data, error: scheduleError } = await createAdminClient().from('weekly_work_schedules')
        .select('profile_id,week_start,day_of_week').eq('status', 'leave')
        .in('profile_id', [...new Set(rows.map(row => row.personnelId))])
        .gte('week_start', start.toISOString().slice(0,10)).lt('week_start', new Date(Date.UTC(Number(period.slice(0,4)), Number(period.slice(5)), 1)).toISOString().slice(0,10));
      if (scheduleError) throw scheduleError;
      rows = rows.map(row => ({ ...row, leaveDays: (data ?? []).filter(entry => entry.profile_id === row.personnelId).flatMap(entry => {
        const date = new Date(`${entry.week_start}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + Number(entry.day_of_week));
        return date.toISOString().startsWith(period) ? [date.getUTCDate()] : [];
      }) }));
    } catch { targetWarning += ' Çalışma programı okunamadı; haftada bir gün izin varsayımı kullanılıyor.'; }
  }
  const today = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', day: 'numeric' }).format(new Date()));
  const daysInMonth = new Date(Number(period.slice(0,4)), Number(period.slice(5)), 0).getDate();
  return <main className="goal-page">
    <h1 className="page-title">Günlük Performanslar</h1>
    <div className="goal-mode-row"><Link className="goal-mode-button" href="/hedef-gerceklesen?view=employee">Personel Hedef Gerçekleşen</Link><span className="goal-mode-button goal-mode-button-active">Günlük Performanslar</span></div>
    {error ? <section className="guide-card" role="alert">{error}</section> : <>
      {targetWarning ? <p role="status">{targetWarning}</p> : null}
      <DailyPerformanceDashboard rows={rows} period={period} daysInMonth={daysInMonth} today={today} initialEmployee={params.employee ?? ''} />
    </>}
  </main>;
}
