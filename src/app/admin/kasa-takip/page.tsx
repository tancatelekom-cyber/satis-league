import Link from 'next/link';
import { requireAdminAccess } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminSectionNav } from '@/components/admin/admin-section-nav';
import { addCashCategory, toggleCashCategory, updateCashPermission } from './actions';
import '../../kasa-takip/cash.css';

export default async function CashAdmin({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  await requireAdminAccess();
  const params = await searchParams;
  const db = createAdminClient();
  const [people, permissions, categories] = await Promise.all([
    db.from('profiles').select('id,full_name,role,store_id').eq('approval','approved').order('full_name'),
    db.from('feature_profile_permissions').select('profile_id,is_allowed').eq('feature_key','kasa-takip'),
    db.from('cash_register_categories').select('*').order('name')
  ]);
  return <main className="cash-page"><AdminSectionNav currentPath="/admin/kasa-takip" />
    <header className="cash-hero"><div><small>YÖNETİM / OPERASYON</small><h1>Kasa takip yönetimi</h1><p>Menüyü kullanacak kişileri ve işlem kategorilerini belirleyin.</p></div><Link href="/kasa-takip">Kasaları aç →</Link></header>
    {(params.error || params.message) && <p role="status">{params.error || params.message}</p>}
    {(people.error || permissions.error || categories.error) && <p role="alert">Veriler okunamadı. Kasa SQL migration dosyasının uygulandığını kontrol edin.</p>}
    <section className="cash-panel"><h2>Kategoriler</h2><p>Kaldırılan kategoriler eski kayıtlarda korunur. Nötr kategoriler kasa toplamlarını etkilemez.</p>
      <form action={addCashCategory} className="cash-toolbar"><label>Kategori adı<input name="name" required maxLength={100} /></label><label>Tür<select name="kind"><option value="income">Gelir (+)</option><option value="expense">Gider (−)</option><option value="neutral">Nötr / İşlem adedi</option></select></label><label className="cash-check"><input type="checkbox" name="assignment"/>Temlikli satış</label><label className="cash-check"><input type="checkbox" name="installment"/>Sepete taksit</label><button>Kategori ekle</button></form>
      <div className="cash-category-list">{categories.data?.map(c => <form action={toggleCashCategory} key={c.id}><input type="hidden" name="id" value={c.id}/><input type="hidden" name="active" value={String(!c.is_active)}/><span><strong>{c.name}</strong> · {c.kind === 'income' ? 'Gelir' : c.kind === 'expense' ? 'Gider' : 'Nötr'} · {c.is_active ? 'Aktif' : 'Kaldırılmış'}</span><button>{c.is_active ? 'Kaldır' : 'Yeniden aç'}</button></form>)}</div>
    </section>
    <section className="cash-panel"><h2>Kişi bazlı erişim</h2><p>Adminler her zaman erişebilir. İzin verilen yönetim kullanıcıları tüm şubeleri, diğer kişiler yalnızca kendi şubelerini görür.</p>
      <div className="cash-category-list">{people.data?.map(p => <form key={p.id} action={updateCashPermission}><input type="hidden" name="profileId" value={p.id}/><span><strong>{p.full_name}</strong> · {p.role === 'admin' ? 'Admin' : p.role === 'management' ? 'Yönetim' : p.role === 'manager' ? 'Mağaza müdürü' : 'Personel'}</span>{p.role === 'admin' ? <span>Her zaman açık</span> : <><label className="cash-check"><input type="checkbox" name="allowed" defaultChecked={permissions.data?.some(x => x.profile_id === p.id && x.is_allowed)}/>Erişim açık</label><button>Kaydet</button></>}</form>)}</div>
    </section>
  </main>;
}
