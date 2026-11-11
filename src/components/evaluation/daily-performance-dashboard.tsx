"use client";
import { useMemo, useState } from 'react';
import { dailyPerformanceSeries, type DailyPerformanceRow } from '@/lib/daily-performance';
import { goalPeriodLabel } from '@/lib/goal-periods';
import styles from './daily-performance-dashboard.module.css';
const number = (value: number | null) => value === null ? '—' : value.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
type Series = ReturnType<typeof dailyPerformanceSeries>;
function Chart({ series, percent = false }: { series: Series; percent?: boolean }) {
  const values = series.map(point => percent ? point.percent : point.actual);
  const max = Math.max(percent ? 120 : 1, ...values.map(value => value ?? 0), ...(!percent ? series.map(point => point.target ?? 0) : [])) * 1.1;
  const x = (i: number) => 48 + i * (680 / Math.max(series.length - 1, 1));
  const y = (value: number) => 220 - value / max * 180;
  return <div className={styles.chart}><svg viewBox="0 0 760 260" role="img" aria-label={percent ? 'Günlük hedef gerçekleşme yüzdesi grafiği' : 'Günlük gerçekleşen adet ve hedef grafiği'}>
    {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="48" x2="728" y1={y(max * tick / 4)} y2={y(max * tick / 4)} stroke="#e2e8f0"/><text x="40" y={y(max * tick / 4) + 4} textAnchor="end" fontSize="11" fill="#64748b">{number(max * tick / 4)}{percent ? '%' : ''}</text></g>)}
    {series.map((point, i) => { const value = values[i]; const previous = values[i-1]; return <g key={point.day}>
      {value !== null && previous !== null && previous !== undefined ? <line x1={x(i-1)} x2={x(i)} y1={y(previous)} y2={y(value)} stroke={percent ? '#059669' : '#2563eb'} strokeWidth="3"/> : null}
      {value !== null ? <circle cx={x(i)} cy={y(value)} r="4" fill={percent ? '#059669' : '#2563eb'}><title>{point.day}. gün: {number(value)}{percent ? '%' : ' adet'}</title></circle> : null}
      <text x={x(i)} y="243" textAnchor="middle" fontSize="11" fill="#64748b">{point.day}</text>
    </g>; })}
    {percent || series[0]?.target !== null ? <><line x1="48" x2="728" y1={y(percent ? 100 : series[0]?.target ?? 0)} y2={y(percent ? 100 : series[0]?.target ?? 0)} stroke="#d97706" strokeWidth="2" strokeDasharray="6 4"/><text x="728" y="20" textAnchor="end" fontSize="12" fill="#b45309">{percent ? '%100 hedef çizgisi' : 'Kesikli çizgi: günlük hedef'}</text></> : null}
  </svg></div>;
}
export function DailyPerformanceDashboard({ rows, period, daysInMonth, today, initialEmployee }: { rows: DailyPerformanceRow[]; period: string; daysInMonth: number; today: number; initialEmployee: string }) {
  const [store, setStore] = useState('');
  const [person, setPerson] = useState(rows.find(row => row.name === initialEmployee)?.personnelId ?? '');
  const [category, setCategory] = useState(rows[0]?.category ?? '');
  const [sub, setSub] = useState('');
  const [selectedDay, setSelectedDay] = useState(Math.max(1, today - 1));
  const stores = [...new Set(rows.map(row => row.store))].sort((a,b) => a.localeCompare(b,'tr'));
  const people = [...new Map(rows.filter(row => !store || row.store === store).map(row => [row.personnelId, row.name])).entries()].sort((a,b) => a[1].localeCompare(b[1],'tr'));
  const scoped = rows.filter(row => (!store || row.store === store) && (!person || row.personnelId === person));
  const categories = [...new Set(scoped.map(row => row.category))];
  const activeCategory = categories.includes(category) ? category : categories[0] ?? '';
  const subs = [...new Set(scoped.filter(row => row.category === activeCategory).map(row => row.subCategory))];
  const activeSub = subs.includes(sub) ? sub : subs[0] ?? '';
  const filtered = scoped.filter(row => row.category === activeCategory && row.subCategory === activeSub);
  const series = useMemo(() => dailyPerformanceSeries(filtered, daysInMonth, today), [filtered, daysInMonth, today]);
  const day = series.find(point => point.day === selectedDay);
  const missingTargets = filtered.filter(row => row.monthlyTarget === null).length;
  const total = series.reduce((sum, point) => sum + (point.actual ?? 0), 0);
  return <section className={styles.shell}>
    <header className={styles.header}><div><span>PERSONEL PERFORMANSI</span><h2>{goalPeriodLabel(period)}</h2><p>Gün gün gerçekleşen adetler ve hedefe ulaşma oranı</p></div><span className={styles.badge}>{new Set(filtered.map(row => row.personnelId)).size} personel</span></header>
    <div className={styles.filters}>
      <label>Şube<select value={store} onChange={event => { setStore(event.target.value); setPerson(''); }}><option value="">Tüm şubeler</option>{stores.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Kişi<select value={person} onChange={event => setPerson(event.target.value)}><option value="">Tüm kişiler</option>{people.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Kategori<select value={activeCategory} onChange={event => { setCategory(event.target.value); setSub(''); }}>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Alt kategori<select value={activeSub} onChange={event => setSub(event.target.value)}>{subs.map(value => <option key={value} value={value}>{value || 'Genel'}</option>)}</select></label>
      <label>Özet günü<select value={selectedDay} onChange={event => setSelectedDay(Number(event.target.value))}>{series.map(point => <option key={point.day} value={point.day}>{point.day}. gün{point.day === today ? ' (bugün)' : ''}</option>)}</select></label>
    </div>
    <p className={styles.note}>Kaynak Sheet ay/yıl içermediği için mevcut ay olarak gösterilir. Günlük hedef = personel aylık hedefi ÷ {daysInMonth} takvim günü. Bugünün verisi gün içinde değişebilir; boş hücreler eksik veri, 0 değerleri sıfır gerçekleşen olarak değerlendirilir.</p>
    {!filtered.length ? <p role="status">Bu filtrelerde günlük performans kaydı bulunamadı.</p> : <>
      <div className={styles.metrics}>{[[`${selectedDay}. gün gerçekleşen`, number(day?.actual ?? null)],['Günlük hedef', number(day?.target ?? null)],['Günlük hedef gerçekleşme', day?.percent == null ? '—' : `%${number(day.percent)}`],['Ay içi kayıtlı toplam',number(total)]].map(([label,value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <article className={styles.card}><h3>Günlük seyir · {activeSub || activeCategory}</h3><Chart series={series}/></article>
      <article className={styles.card}><h3>Günlük hedef gerçekleşen %</h3>{missingTargets ? <p role="status">Seçimdeki {missingTargets} kaydın mevcut ay hedefi bulunamadı veya tek bir hedefle eşleşmedi. Eksik hedeflerle yanıltıcı yüzde hesaplanmıyor. Hedefi bulunan bir kişi seçebilirsiniz.</p> : <Chart series={series} percent/>}</article>
      <details className={styles.card}><summary>Günlük değerler tablosu</summary><div className={styles.table}><table><thead><tr><th>Gün</th><th>Gerçekleşen</th><th>Günlük hedef</th><th>Gerçekleşme %</th></tr></thead><tbody>{series.map(point => <tr key={point.day}><th>{point.day}{point.day === today ? ' · bugün' : ''}</th><td>{number(point.actual)}</td><td>{number(point.target)}</td><td>{point.percent === null ? '—' : `%${number(point.percent)}`}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
