import Link from 'next/link';
import { requireAdminAccess } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { moveCashCategory, addCashCategory, updateCashCategory, toggleCashCategory, updateCashPermission } from './actions';
import '../../kasa-takip/cash.css';
import { sortCashCategories, cashPaymentLabels, categoryPayments, type CashCategory } from '@/lib/cash-register';

function PaymentChoices({selected}: {selected: string[]}) { return <fieldset className="cash-payment-choices"><legend>İzin verilen tahsilat tipleri</legend>{Object.entries(cashPaymentLabels).map(([value,label])=><label className="cash-check" key={value}><input type="checkbox" name="payments" value={value} defaultChecked={selected.includes(value)}/>{label}</label>)}</fieldset>; }


export default async function CashAdmin({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  await requireAdminAccess();
  const params = await searchParams;
  const db = createAdminClient();
  const [people, permissions, categories] = await Promise.all([
    db.from('profiles').select('id,full_name,role,store_id').eq('approval','approved').order('full_name'),
    db.from('feature_profile_permissions').select('profile_id,is_allowed,can_edit_cash_history').eq('feature_key','kasa-takip'),
    db.from('cash_register_categories').select('*').order('name')
  ]);
  const orderedCategories=sortCashCategories(categories.data || []);
  return <main className="cash-page"><AdminSectionNav currentPath="/admin/kasa-takip" />
    <header className="cash-hero"><div><small>YÖNETİM / OPERASYON</small><h1>Kasa takip yönetimi</h1><p>Menüyü kullanacak kişileri ve işlem kategorilerini belirleyin.</p></div><Link href="/kasa-takip">Kasaları aç →</Link></header>
    {(params.error || params.message) && <p role="status">{params.error || params.message}</p>}
    {(people.error || permissions.error || categories.error) && <p role="alert">Veriler okunamadı. Kasa SQL migration dosyasının uygulandığını kontrol edin.</p>}
    <section className="cash-panel"><h2>Kategoriler</h2><p>Kaldırılan kategoriler eski kayıtlarda korunur. Nötr kategoriler kasa toplamlarını etkilemez.</p>
      <form action={addCashCategory} className="cash-toolbar"><label>Kategori adı<input name="name" required maxLength={100} /></label><label>Tür<select name="kind"><option value="income">Gelir (+)</option><option value="expense">Gider (−)</option><option value="neutral">Nötr / İşlem adedi</option></select></label><PaymentChoices selected={['cash','card','qr','free']}/><button>Kategori ekle</button></form>
      <div className="cash-category-list">{orderedCategories.map((c,index) => <article className="cash-category-card" key={c.id}><form action={toggleCashCategory}><input type="hidden" name="id" value={c.id}/><input type="hidden" name="active" value={String(!c.is_active)}/><span><strong>{c.name}</strong> · {c.kind === 'income' ? 'Gelir' : c.kind === 'expense' ? 'Gider' : 'Nötr'} · {c.is_active ? 'Aktif' : 'Kaldırılmış'}</span><button>{c.is_active ? 'Kaldır' : 'Yeniden aç'}</button></form><div className="cash-category-order">{[[-1,'↑ Yukarı'],[1,'↓ Aşağı']].map(([direction,label])=><form key={direction} action={moveCashCategory}><input type="hidden" name="id" value={c.id}/><input type="hidden" name="direction" value={direction}/><button disabled={direction===-1 ? index===0 : index===orderedCategories.length-1} aria-label={`${c.name}: ${label}`}>{label}</button></form>)}</div><details><summary>Düzenle</summary><form action={updateCashCategory}><input type="hidden" name="id" value={c.id}/><label>Kategori adı<input name="name" required maxLength={100} defaultValue={c.name}/></label><label>Tür<select name="kind" defaultValue={c.kind}><option value="income">Gelir (+)</option><option value="expense">Gider (−)</option><option value="neutral">Nötr / İşlem adedi</option></select></label><PaymentChoices selected={categoryPayments(c as CashCategory)}/><button>Değişiklikleri kaydet</button></form></details></article>)}</div>
    </section>
    <section className="cash-panel"><h2>Kişi bazlı erişim</h2><p>Adminler her zaman erişebilir. İzin verilen yönetim kullanıcıları tüm şubeleri, diğer kişiler yalnızca kendi şubelerini görür. Geçmiş işlem yetkisi ayrıca açılmalıdır ve yalnızca kasa erişimi açıkken kullanılabilir. Gelecek tarihli kayıt girilemez.</p>
      <div className="cash-category-list">{people.data?.map(p => <form key={p.id} action={updateCashPermission} style={{flexWrap:'wrap'}}><input type="hidden" name="profileId" value={p.id}/><span><strong>{p.full_name}</strong> · {p.role === 'admin' ? 'Admin' : p.role === 'management' ? 'Yönetim' : p.role === 'manager' ? 'Mağaza müdürü' : 'Personel'}</span>{p.role === 'admin' ? <><span className="cash-badge">Yetki açık · Admin</span><input type="hidden" name="allowed" value="on"/></> : <><span className="cash-badge">{permissions.data?.some(x => x.profile_id === p.id && x.is_allowed) ? 'Yetki açık' : 'Yetki kapalı'}</span><label className="cash-check"><input type="checkbox" name="allowed" defaultChecked={permissions.data?.some(x => x.profile_id === p.id && x.is_allowed)}/>Erişim açık</label></>}<span className="cash-badge">{permissions.data?.some(x => x.profile_id === p.id && x.can_edit_cash_history) ? 'Geçmiş işlem yetkisi açık' : 'Geçmiş işlem yetkisi kapalı'}</span><label className="cash-check"><input type="checkbox" name="history" defaultChecked={permissions.data?.some(x => x.profile_id === p.id && x.can_edit_cash_history)}/>Geçmiş tarihli kayıt ekleme ve değiştirme</label><button disabled={!!permissions.error}>Kaydet</button></form>)}</div>
    </section>
  </main>;
}
