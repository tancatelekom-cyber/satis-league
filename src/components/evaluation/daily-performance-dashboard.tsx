"use client";
import { useMemo, useState } from 'react';
import { dailyPerformanceSeries, type DailyPerformanceRow } from '@/lib/daily-performance';
import { goalPeriodLabel } from '@/lib/goal-periods';
import styles from './daily-performance-dashboard.module.css';
const number = (value: number | null) => value === null ? '—' : value.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
type Series = ReturnType<typeof dailyPerformanceSeries>;
export function DailyPerformanceChart({ series: allDays, today, percent = false }: { series: Series; today: number; percent?: boolean }) {
  const series = allDays.filter(point => point.day < today);
  if (!series.length) return <p role="status">Bu ay için henüz geçmiş gün verisi bulunmuyor.</p>;
  const width = Math.max(760, 96 + series.length * 72);
  const right = width - 32;
  const values = series.map(point => percent ? point.percent : point.actual);
  const max = Math.max(percent ? 120 : 1, ...values.map(value => value ?? 0), ...(!percent ? series.map(point => point.target ?? 0) : [])) * 1.1;
  const x = (i: number) => 48 + i * ((right - 48) / Math.max(series.length - 1, 1));
  const y = (value: number) => 220 - value / max * 180;
  return <div className={styles.chart}><svg viewBox={`0 0 ${width} 280`} style={{ minWidth: width }} role="img" aria-label={percent ? 'Günlük hedef gerçekleşme yüzdesi grafiği' : 'Günlük gerçekleşen adet ve hedef grafiği'}>
    {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="48" x2={right} y1={y(max * tick / 4)} y2={y(max * tick / 4)} stroke="#e2e8f0"/><text x="40" y={y(max * tick / 4) + 4} textAnchor="end" fontSize="11" fill="#64748b">{number(max * tick / 4)}{percent ? '%' : ''}</text></g>)}
    {series.map((point, i) => { const value = values[i]; const previous = values[i-1]; return <g key={point.day}>
      {value !== null && previous !== null && previous !== undefined ? <line x1={x(i-1)} x2={x(i)} y1={y(previous)} y2={y(value)} stroke={percent ? '#059669' : '#2563eb'} strokeWidth="3"/> : null}
      {value !== null ? <circle cx={x(i)} cy={y(value)} r="4" fill={percent ? '#059669' : '#2563eb'}><title>{`${point.day}. gün: ${number(value)}${percent ? '%' : ' adet'}`}</title></circle> : null}
      <text x={x(i)} y={value === null ? 207 : y(value) - 12} textAnchor="middle" fontSize="12" fontWeight="700" fill={percent ? '#047857' : '#1d4ed8'} stroke="white" strokeWidth="3" paintOrder="stroke">{number(value)}{percent && value !== null ? '%' : ''}</text>
      <text x={x(i)} y="263" textAnchor="middle" fontSize="11" fill="#64748b">{point.day}</text>
    </g>; })}
    {percent ? <line x1="48" x2={right} y1={y(100)} y2={y(100)} stroke="#d97706" strokeWidth="2" strokeDasharray="6 4"/> : series.map((point, i) => point.target !== null ? <g key={`target-${point.day}`}>
      {i > 0 && series[i-1].target !== null ? <line x1={x(i-1)} x2={x(i)} y1={y(series[i-1].target!)} y2={y(point.target)} stroke="#d97706" strokeWidth="2" strokeDasharray="6 4"/> : null}
      <circle cx={x(i)} cy={y(point.target)} r="3" fill="#d97706"><title>{`${point.day}. gün gerekli hedef: ${number(point.target)}`}</title></circle>
      <text x={x(i)} y={y(point.target) + 17} textAnchor="middle" fontSize="11" fontWeight="600" fill="#92400e" stroke="white" strokeWidth="3" paintOrder="stroke">{number(point.target)}</text>
    </g> : null)}
    <text x={right} y="20" textAnchor="end" fontSize="12" fill="#b45309">{percent ? '%100 gerekli hedef çizgisi' : 'Kesikli çizgi: kalan hedef ÷ kalan gün'}</text>
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
    <p className={styles.note}>Kaynak Sheet ay/yıl içermediği için mevcut ay olarak gösterilir. Günlük gerekli hedef = (personelin aylık hedefi − önceki günlerin toplam gerçekleşeni) ÷ o gün dâhil kalan çalışma günü. Her personelin kalan ihtiyacı ayrı hesaplanıp toplanır. Her tam 7 günlük kalan süre için en az 1 izin günü düşülür; programdaki kayıtlı izinler daha fazlaysa kayıtlı sayı kullanılır. Kayıtlı izin gününde günlük hedef gösterilmez. İzin tarihi bilinmeyen günlerde bu hesap tahminidir. Grafiklerde yalnızca tamamlanmış geçmiş günler gösterilir; bugünün verisi grafiğe dahil edilmez. Özet ve tabloda bugünün verisi gün içinde değişebilir; boş hücreler eksik veri, 0 değerleri sıfır gerçekleşen olarak değerlendirilir.</p>
    {!filtered.length ? <p role="status">Bu filtrelerde günlük performans kaydı bulunamadı.</p> : <>
      <div className={styles.metrics}>{[[`${selectedDay}. gün gerçekleşen`, number(day?.actual ?? null)],['Günlük gerekli hedef', number(day?.target ?? null)],['Günlük hedef gerçekleşme', day?.onLeave ? 'İzinli' : day?.targetMet ? 'Hedef tamamlandı' : day?.percent == null ? '—' : `%${number(day.percent)}`],['Ay içi kayıtlı toplam',number(total)]].map(([label,value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <article className={styles.card}><h3>Günlük seyir · {activeSub || activeCategory}</h3><DailyPerformanceChart series={series} today={today}/></article>
      <article className={styles.card}><h3>Günlük hedef gerçekleşen %</h3>{missingTargets ? <p role="status">Seçimdeki {missingTargets} kaydın mevcut ay hedefi bulunamadı veya tek bir hedefle eşleşmedi. Eksik hedeflerle yanıltıcı yüzde hesaplanmıyor. Hedefi bulunan bir kişi seçebilirsiniz.</p> : <DailyPerformanceChart series={series} today={today} percent/>}</article>
      <details className={styles.card}><summary>Günlük değerler tablosu</summary><div className={styles.table}><table><thead><tr><th>Gün</th><th>Gerçekleşen</th><th>Gün başı kalan hedef</th><th>Kalan çalışma günü</th><th>Günlük gerekli hedef</th><th>Gerçekleşme %</th></tr></thead><tbody>{series.map(point => <tr key={point.day}><th>{point.day}{point.day === today ? ' · bugün' : ''}</th><td>{number(point.actual)}</td><td>{number(point.remainingTarget)}</td><td>{point.remainingWorkDays}</td><td>{number(point.target)}</td><td>{point.onLeave ? 'İzinli' : point.targetMet ? 'Hedef tamamlandı' : point.percent === null ? '—' : `%${number(point.percent)}`}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
