import { getCashData } from '@/lib/cash-register-data';
import { buildCashReports } from '@/lib/cash-register-report';
import { buildCashPdf } from '@/lib/cash-register-pdf';
import { createClient } from '@/lib/supabase/server';
import type { CashCategory } from '@/lib/cash-register';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const {rows,date} = await getCashData(params.get('date') || undefined,params.get('store') || undefined);
  const db = await createClient();
  const {data:categories,error} = await db.from('cash_register_categories').select('*').order('name');
  if(error) return new Response('Kasa kategorileri okunamadı.',{status:503});
  if(!rows.length) return new Response('Kasa kaydı bulunamadı.',{status:404});
  const buffer = await buildCashPdf(rows.flatMap(row=>buildCashReports(row,(categories || []) as CashCategory[])));
  return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="kasa-${date}.pdf"`,'Cache-Control':'private, no-store'}});
}
