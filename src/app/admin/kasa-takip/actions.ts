"use server";
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminAccess } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export async function updateCashPermission(form: FormData) {
  await requireAdminAccess();
  const { error } = await createAdminClient().from('feature_profile_permissions').upsert({ feature_key: 'kasa-takip', profile_id: String(form.get('profileId')), is_allowed: form.get('allowed') === 'on', updated_at: new Date().toISOString() }, { onConflict: 'feature_key,profile_id' });
  if (error) redirect('/admin/kasa-takip?error=' + encodeURIComponent('Yetki kaydedilemedi.'));
  revalidatePath('/', 'layout');
  redirect('/admin/kasa-takip?message=' + encodeURIComponent('Yetki güncellendi.'));
}
export async function addCashCategory(form: FormData) {
  await requireAdminAccess();
  const name = String(form.get('name') || '').trim();
  const kind = String(form.get('kind'));
  if (!name || name.length > 100 || !['income','expense','neutral'].includes(kind)) redirect('/admin/kasa-takip?error=Geçersiz+kategori');
  const { error } = await createAdminClient().from('cash_register_categories').insert({ name, kind, allow_assignment: form.get('assignment') === 'on', allow_installment: form.get('installment') === 'on' });
  if (error) redirect('/admin/kasa-takip?error=' + encodeURIComponent('Kategori eklenemedi. Aynı isimde kategori bulunabilir.'));
  revalidatePath('/kasa-takip');
  revalidatePath('/admin/kasa-takip');
  redirect('/admin/kasa-takip?message=Kategori+eklendi');
}
export async function toggleCashCategory(form: FormData) {
  await requireAdminAccess();
  const { error } = await createAdminClient().from('cash_register_categories').update({ is_active: form.get('active') === 'true' }).eq('id', String(form.get('id')));
  if (error) redirect('/admin/kasa-takip?error=Kategori+güncellenemedi');
  revalidatePath('/kasa-takip');
  revalidatePath('/admin/kasa-takip');
  redirect('/admin/kasa-takip?message=Kategori+güncellendi');
}
