import { requireCashAccess } from '@/lib/auth/require-cash-access';
import { createClient } from '@/lib/supabase/server';
import { cashToday, validCashDate, previousCashDate, type CashDay, type CashRow } from './cash-register';

export async function getCashData(requestedDate?: string, requestedStore?: string) {
  const access = await requireCashAccess();
  const date = requestedDate || cashToday();
  if (!validCashDate(date) || date > cashToday()) throw new Error('Geçerli bir tarih seçin.');
  const db = await createClient();
  let storesQuery = db.from('stores').select('id,name').order('name');
  if (!access.allStores) storesQuery = storesQuery.eq('id', access.profile.store_id || '00000000-0000-0000-0000-000000000000');
  const { data: stores, error: storesError } = await storesQuery;
  if (storesError) throw new Error('Şubeler okunamadı.');
  const selected = (stores || []).filter(s => !requestedStore || s.id === requestedStore);
  const rows: CashRow[] = [];
  for (const store of selected) {
    const { data, error } = await db.from('cash_register_days').select('*').eq('store_id', store.id).lte('entry_date', date).order('entry_date', { ascending: false }).limit(2);
    if (error) throw new Error('Kasa verileri okunamadı. Kasa veritabanı kurulumunu kontrol edin.');
    const days = (data || []) as CashDay[];
    const current = days.find(d => d.entry_date === date);
    const prior = days.find(d => d.entry_date < date);
    const opening = Number(prior?.closing || 0);
    const previousClosing = prior?.entry_date === previousCashDate(date) ? Number(prior.closing) : null;
    rows.push({ ...(current || { store_id: store.id, entry_date: date, opening, closing: opening, cash_in: 0, card_in: 0, transfer_in: 0, expenses: 0, bank_deposit: 0, counted: 0, note: '', revision: 0, invoice_cash: 0, web_cash: 0, receipt_start: '', entries: [] }), name: store.name, saved: !!current, hasPrior: !!prior, previousClosing });
  }
  return { ...access, date, stores: stores || [], rows };
}

/** RLS and the selected branch constrain the history used for suggestions. */
export async function getCashDescriptionSuggestions(storeId:string,date:string) {
  const db=await createClient();
  const {data}=await db.from('cash_register_days').select('entries').eq('store_id',storeId).lte('entry_date',date).order('entry_date',{ascending:false}).limit(180);
  const groups:Record<string,string[]>={};
  for(const day of data || []) for(const entry of Array.isArray(day.entries) ? day.entries : []) {
    if(typeof entry?.category_id!=='string' || typeof entry?.description!=='string') continue;
    const description=entry.description.trim();
    if(!description) continue;
    const options=groups[entry.category_id] ||= [];
    if(options.length<100 && !options.some(value=>value.toLocaleLowerCase('tr-TR')===description.toLocaleLowerCase('tr-TR'))) options.push(description);
  }
  return groups;
}
