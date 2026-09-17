import { redirect } from 'next/navigation';
import { requireUser } from './require-user';
import { createAdminClient } from '@/lib/supabase/admin';

export async function canAccessCash(profileId: string, role: string) {
  if (role === 'admin') return true;
  try {
    const { data, error } = await createAdminClient().from('feature_profile_permissions').select('is_allowed').eq('feature_key', 'kasa-takip').eq('profile_id', profileId).maybeSingle();
    return !error && data?.is_allowed === true;
  } catch { return false; }
}
export async function requireCashAccess() {
  const user = await requireUser();
  const { data: profile } = await createAdminClient().from('profiles').select('id,role,approval,store_id').eq('id', user.id).single();
  if (!profile || profile.approval !== 'approved' || !await canAccessCash(user.id, profile.role)) redirect('/');
  return { profile, allStores: ['admin', 'management'].includes(profile.role) };
}
