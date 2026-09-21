"use server";
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminAccess } from '@/lib/auth/require-admin';
import { cashPaymentLabels } from '@/lib/cash-register';
import { createAdminClient } from '@/lib/supabase/admin';

export async function updateCashPermission(form: FormData) {
  await requireAdminAccess();
  const { error } = await createAdminClient().from('feature_profile_permissions').upsert({ feature_key: 'kasa-takip', profile_id: String(form.get('profileId')), is_allowed: form.get('allowed') === 'on', can_edit_cash_history: form.get('history') === 'on', updated_at: new Date().toISOString() }, { onConflict: 'feature_key,profile_id' });
  if (error) redirect('/admin/kasa-takip?error=' + encodeURIComponent('Yetki kaydedilemedi.'));
  revalidatePath('/', 'layout');
  redirect('/admin/kasa-takip?message=' + encodeURIComponent('Yetki güncellendi.'));
}
async function saveCategory(form: FormData, editing: boolean) {
  await requireAdminAccess();
  const name = String(form.get('name') || '').trim();
  const kind = String(form.get('kind'));
  if (!name || name.length > 100 || !['income','expense','neutral'].includes(kind)) redirect('/admin/kasa-takip?error=Geçersiz+kategori');
  const allowed = [...new Set(form.getAll('payments').map(String))];
  if (!allowed.length || allowed.some(p=>!Object.hasOwn(cashPaymentLabels,p))) redirect('/admin/kasa-takip?error='+encodeURIComponent('En az bir geçerli tahsilat tipi seçin.'));
  const values = {name,kind,allowed_payments:allowed,allow_assignment:allowed.includes('assignment'),allow_installment:allowed.includes('installment')};
  const table = createAdminClient().from('cash_register_categories');
  const {error} = editing ? await table.update(values).eq('id',String(form.get('id'))) : await table.insert(values);
  if (error) redirect('/admin/kasa-takip?error=' + encodeURIComponent('Kategori kaydedilemedi. Kategori SQL güncellemesini ve aynı isimde kategori olup olmadığını kontrol edin.'));
  revalidatePath('/kasa-takip');
  revalidatePath('/admin/kasa-takip');
  redirect('/admin/kasa-takip?message=Kategori+kaydedildi');
}
export async function toggleCashCategory(form: FormData) {
  await requireAdminAccess();
  const { error } = await createAdminClient().from('cash_register_categories').update({ is_active: form.get('active') === 'true' }).eq('id', String(form.get('id')));
  if (error) redirect('/admin/kasa-takip?error=Kategori+güncellenemedi');
  revalidatePath('/kasa-takip');
  revalidatePath('/admin/kasa-takip');
  redirect('/admin/kasa-takip?message=Kategori+güncellendi');
}

export async function addCashCategory(form: FormData) { await saveCategory(form,false); }
export async function updateCashCategory(form: FormData) { await saveCategory(form,true); }

export async function moveCashCategory(form:FormData) {
  await requireAdminAccess();
  const direction=Number(form.get('direction'));
  if(direction!==-1 && direction!==1) redirect('/admin/kasa-takip?error=Geçersiz+yön');
  const {error}=await createAdminClient().rpc('move_cash_category',{category_id:String(form.get('id')),direction});
  if(error) redirect('/admin/kasa-takip?error='+encodeURIComponent('Sıralama kaydedilemedi. Kategori sıralama SQL güncellemesini uygulayın.'));
  revalidatePath('/kasa-takip');
  revalidatePath('/admin/kasa-takip');
  redirect('/admin/kasa-takip?message=Kategori+sırası+güncellendi');
}
