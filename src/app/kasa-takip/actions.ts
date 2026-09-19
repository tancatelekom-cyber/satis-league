"use server";
import { revalidatePath } from 'next/cache';
import { requireCashAccess } from '@/lib/auth/require-cash-access';
import { createClient } from '@/lib/supabase/server';
import { canEditCashDate, type CashEntry } from '@/lib/cash-register';

export async function saveCashDay(input: { storeId: string; date: string; revision: number; opening: number; invoice: number; web: number; counted: number; receipt: string; note: string; entries: CashEntry[] }) {
  const { profile, allStores, canEditHistory } = await requireCashAccess();
  if (!canEditCashDate(input.date, canEditHistory)) return { error: 'Bu tarihte işlem yapma yetkiniz yok. Gelecek tarihli kayıt girilemez.' };
  if (!allStores && input.storeId !== profile.store_id) return { error: 'Bu şubeye erişiminiz yok.' };
  if (![input.opening, input.invoice, input.web, input.counted].every(n => Number.isFinite(n) && n >= 0 && n <= 999999999999.99)) return { error: 'Tutarları kontrol edin.' };
  if (input.entries.length > 500 || input.note.length > 2000 || input.receipt.length > 100 || input.entries.some(e => !e.staff || e.receipt.length > 100 || e.description.length > 250 || ![e.cash,e.card].every(n => Number.isFinite(n) && n >= 0 && n <= 999999999999.99))) return { error: 'Personel seçimini ve satır tutarlarını kontrol edin.' };
  const db = await createClient();
  const { error } = await db.rpc('save_cash_register_day', {
    p_store: input.storeId, p_date: input.date, p_revision: input.revision, p_opening: input.opening,
    p_cash: 0, p_card: 0, p_transfer: 0, p_expenses: 0, p_deposit: 0,
    p_counted: input.counted, p_note: input.note, p_invoice: input.invoice,
    p_web: input.web, p_receipt: input.receipt, p_entries: input.entries
  });
  if (error) return { error: error.message };
  revalidatePath('/kasa-takip');
  return { error: null };
}
