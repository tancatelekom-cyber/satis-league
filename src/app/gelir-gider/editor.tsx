"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RevenueExpenseRow, RevenueExpenseKind } from "@/lib/revenue-expense";
import { autosaveRevenueExpense } from "./actions";

type Cell = { key: string; store: string; kind: RevenueExpenseKind; category: string; year: number; month: number; row?: RevenueExpenseRow };
function AmountCell({ cell, onBusy, onSaved }: {cell:Cell; onBusy:(key:string,busy:boolean)=>void; onSaved:()=>void}) {
  const [value,setValue]=useState(cell.row ? String(cell.row.amount).replace(".",",") : "");
  const [status,setStatus]=useState(cell.row ? "Kayıtlı" : "Henüz giriş yok");
  const [saving,setSaving]=useState(false);
  const [failed,setFailed]=useState(false);
  const stamp=useRef(cell.row?.updatedAt ?? "");
  const saved=useRef(value), dirty=useRef(false), timer=useRef<ReturnType<typeof setTimeout> | null>(null), inFlight=useRef(false);
  useEffect(()=>{if(!dirty.current){const next=cell.row ? String(cell.row.amount).replace(".",",") : "";saved.current=next;setValue(next);stamp.current=cell.row?.updatedAt ?? "";}},[cell.row?.updatedAt,cell.row?.amount]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  async function save(next:string) {
    if(timer.current)clearTimeout(timer.current);
    if(inFlight.current || !dirty.current)return;
    inFlight.current=true;setSaving(true);setFailed(false);setStatus("Kaydediliyor…");
    const form=new FormData();Object.entries({store:cell.store,kind:cell.kind,category:cell.category,year:cell.year,month:cell.month,amount:next,updatedAt:stamp.current}).forEach(([key,v])=>form.set(key,String(v)));
    try {const result=await autosaveRevenueExpense(form);if(!result.ok){setFailed(true);setStatus(result.message);return;}
      stamp.current=result.row.updated_at;saved.current=next;dirty.current=false;onBusy(cell.key,false);setStatus("Kaydedildi ✓");onSaved();
    }catch{setFailed(true);setStatus("Kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.");}
    finally{inFlight.current=false;setSaving(false);}
  }
  return <div style={{minWidth:180}}>
    <input aria-label={`${cell.store} ${cell.category} ${cell.year}-${cell.month} tutarı`} inputMode="decimal" value={value} disabled={saving}
      style={{width:"100%",textAlign:"right",padding:"10px 12px",border:"1px solid #94a3b8",borderRadius:8,background:"#fff",color:"#0f172a"}}
      placeholder="Tutar girin" onBlur={()=>void save(value)} onChange={event=>{const next=event.target.value;setValue(next);if(timer.current)clearTimeout(timer.current);dirty.current=next!==saved.current;onBusy(cell.key,dirty.current);setFailed(false);setStatus(dirty.current ? "Kaydedilmeyi bekliyor…" : "Kayıtlı");if(dirty.current)timer.current=setTimeout(()=>void save(next),800);}} />
    <small role="status" style={{display:"block",color:failed?"#fecaca":"inherit",marginTop:4}}>{status}</small>
    {failed&&<><button onClick={()=>void save(value)} disabled={saving}>Yeniden dene</button> <button onClick={()=>{setValue(saved.current);dirty.current=false;onBusy(cell.key,false);setFailed(false);setStatus("Değişiklik geri alındı");}}>Geri al</button></>}
  </div>;
}
export function RevenueExpenseEditor({rows,stores}:{rows:RevenueExpenseRow[];stores:string[]}) {
  const router=useRouter();
  const latest=rows.map(r=>r.periodKey).sort().at(-1);
  const [period,setPeriod]=useState(latest ?? new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Istanbul"}).format(new Date()).slice(0,7));
  const [kind,setKind]=useState("all"),[category,setCategory]=useState("all"),[store,setStore]=useState("all");
  const [extra,setExtra]=useState<{kind:RevenueExpenseKind;category:string}[]>([]),[newCategory,setNewCategory]=useState("");
  const [busy,setBusy]=useState<Record<string,boolean>>({});const [revision,setRevision]=useState(0);
  const hasPending=Object.values(busy).some(Boolean);
  const onBusy=(key:string,value:boolean)=>setBusy(old=>({...old,[key]:value}));
  useEffect(()=>{if(!hasPending&&revision){const timer=setTimeout(()=>router.refresh(),150);return()=>clearTimeout(timer);}},[hasPending,revision,router]);
  useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(hasPending){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[hasPending]);
  const templates=[...new Map([...rows.map(r=>({kind:r.kind,category:r.category})),...extra].map(r=>[r.kind+":"+r.category,r])).values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.category.localeCompare(b.category,"tr"));
  const categories=[...new Set(templates.filter(t=>kind==="all"||t.kind===kind).map(t=>t.category))];
  const [year,month]=period.split("-").map(Number);
  const index=new Map(rows.map(r=>[JSON.stringify([r.storeName,r.kind,r.category,r.year,r.month]),r]));
  const cells:Cell[]=stores.filter(s=>store==="all"||store===s).flatMap(s=>templates.filter(t=>(kind==="all"||kind===t.kind)&&(category==="all"||category===t.category)).map(t=>{const key=JSON.stringify([s,t.kind,t.category,year,month]);return {key,store:s,kind:t.kind,category:t.category,year,month,row:index.get(key)};}));
  const field={display:"grid",gap:6};
  return <section className="guide-card" style={{padding:20,marginBottom:24}}>
    <h2>Gelir / gider veri girişi</h2><p>Dönemi seçin, satırın yanındaki tutarı girin. Değişiklikler otomatik kaydedilir. Tutarı kaldırmak için 0 girin.</p>
    <fieldset disabled={hasPending} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,border:0,padding:0,marginBottom:18}}>
      <label style={field}>Dönem<input type="month" min="2000-01" max="2100-12" value={period} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))setPeriod(e.target.value);}} /></label>
      <label style={field}>Gelir / gider<select value={kind} onChange={e=>{setKind(e.target.value);setCategory("all");}}><option value="all">Tümü</option><option value="gelir">Gelir</option><option value="gider">Gider</option></select></label>
      <label style={field}>Kategori<select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Tümü</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      <label style={field}>Mağaza<select value={store} onChange={e=>setStore(e.target.value)}><option value="all">Tümü</option>{stores.map(s=><option key={s}>{s}</option>)}</select></label>
    </fieldset>
    {hasPending&&<p role="status">Kaydedilmemiş değişiklik var. Dönem veya filtre değiştirmeden önce kaydın tamamlanmasını bekleyin.</p>}
    <div style={{overflowX:"auto",maxHeight:650}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th>Mağaza</th><th>Dönem</th><th>Gelir / gider</th><th>Kategori</th><th style={{minWidth:200}}>Tutar (TL)</th></tr></thead><tbody>
      {cells.map(cell=><tr key={cell.key}><td style={{padding:10}}>{cell.store}</td><td>{period}</td><td>{cell.kind==="gelir"?"Gelir":"Gider"}</td><td>{cell.category}</td><td style={{padding:8}}><AmountCell cell={cell} onBusy={onBusy} onSaved={()=>setRevision(r=>r+1)} /></td></tr>)}
      {!cells.length&&<tr><td colSpan={5}>Bu filtrelerde satır bulunamadı.</td></tr>}
    </tbody></table></div>
    <details style={{marginTop:16}}><summary>Yeni kategori tanımla</summary><p>Önce Gelir / gider filtresinden tür seçin. Kategori, ilk tutarı girildiğinde kaydedilir.</p><input aria-label="Yeni kategori" value={newCategory} maxLength={150} disabled={hasPending} onChange={e=>setNewCategory(e.target.value)} /><button disabled={hasPending||kind==="all"||!newCategory.trim()} onClick={()=>{setExtra(old=>[...old,{kind:kind as RevenueExpenseKind,category:newCategory.trim()}]);setCategory(newCategory.trim());setNewCategory("");}}>Kategori satırlarını aç</button></details>
  </section>;
}
