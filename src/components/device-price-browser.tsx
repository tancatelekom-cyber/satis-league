"use client";
import {useState} from "react";
import styles from "./device-price-browser.module.css";
import type {DevicePriceRow} from "@/lib/device-price-list";
import {filterDevicePrices,groupDevicePrices} from "@/lib/device-price-search";
import {PressCopyField} from "@/components/ui/press-copy-field";
const money=(value:number|null)=>value&&value>0?value.toLocaleString("tr-TR",{maximumFractionDigits:0})+" TL":"-";
const options=(values:string[])=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"tr"));
export function DevicePriceBrowser({rows,canViewCost,initialCategory="",initialBrand="",initialProduct="",error=""}:{rows:DevicePriceRow[];canViewCost:boolean;initialCategory?:string;initialBrand?:string;initialProduct?:string;error?:string}){
 const [query,setQuery]=useState(""),[category,setCategory]=useState(initialCategory),[brand,setBrand]=useState(initialBrand),[product,setProduct]=useState(initialProduct);
 const categoryRows=category?rows.filter(r=>r.category===category):rows;
 const brands=options(categoryRows.map(r=>r.brand));
 const products=options(categoryRows.filter(r=>!brand||r.brand===brand).map(r=>r.productName));
 const groups=groupDevicePrices(filterDevicePrices(rows,{query,category,brand,product}));
 const filterKey=JSON.stringify([query,category,brand,product]);
 return <>
 <section className="guide-card game-brief-card">
 <div className="league-filter-grid">
 <label className="league-filter-item"><span className="league-filter-label">Kategori</span><select className={styles.filterSelect} aria-label="Cihaz kategori seçimi" value={category} onChange={e=>{setCategory(e.target.value);setBrand("");setProduct("");setQuery("");}}><option value="">Tüm Kategoriler</option>{options(rows.map(r=>r.category)).map(c=><option key={c}>{c}</option>)}</select></label>
 <label className="league-filter-item"><span className="league-filter-label">Marka</span><select className={styles.filterSelect} aria-label="Cihaz marka seçimi" value={brand} onChange={e=>{setBrand(e.target.value);setProduct("");setQuery("");}}><option value="">Tüm Markalar</option>{brands.map(b=><option key={b}>{b}</option>)}</select></label>
 <label className="league-filter-item league-filter-item-wide"><span className="league-filter-label">Ürün</span><select className={styles.filterSelect} aria-label="Cihaz ürün seçimi" value={product} onChange={e=>{setProduct(e.target.value);setQuery("");}}><option value="">Tüm Ürünler</option>{products.map(p=><option key={p}>{p}</option>)}</select></label>
 </div>
 <label style={{display:"grid",gap:8,marginTop:18}}><span className="league-filter-label">Serbest arama</span><input type="search" value={query} placeholder="Ürün adı, marka veya kategori içeren metin yazın…" onChange={e=>{setQuery(e.target.value);setCategory("");setBrand("");setProduct("");}} style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1px solid #94a3b8",background:"#fff",color:"#0f172a"}} /></label>
 {error&&<p role="alert">Cihaz listesi okunamadı: {error}</p>}
 <p role="status">{groups.length} ürün bulundu. Taksit detayları için ürüne tıklayın.</p>
 </section>
 <section key={filterKey} style={{display:"grid",marginTop:18,gap:12,minWidth:0}} aria-label="Ürünler ve PK fiyatları">
 {!groups.length&&<div className="device-empty">Aramanıza veya seçiminize uygun ürün bulunamadı.</div>}
 {groups.map(group=><details key={group.key} className="device-card" style={{display:"block"}}>
 <summary style={{cursor:"pointer",padding:8}}><span style={{display:"inline-flex",justifyContent:"space-between",alignItems:"center",gap:16,width:"95%",flexWrap:"wrap"}}><strong>{group.product.productName}</strong><strong>PK: {money(group.price)}</strong></span></summary>
 <p className="device-card-meta">{group.product.brand} · {group.product.category}</p>
 {canViewCost&&group.cash&&<PressCopyField className="device-cash-row" value={money(group.price)} copyText={`${group.product.productName}\nPK: ${money(group.price)}\nBayi Prim Tutarı: ${money(group.cash.dealerBonus)}\nCihaz 0 Noktası: ${money(Math.max((group.price??0)-group.cash.dealerBonus,0))}`}><span>Bayi Prim Tutarı: {money(group.cash.dealerBonus)}</span><span>Cihaz 0 Noktası: {money(Math.max((group.price??0)-group.cash.dealerBonus,0))}</span></PressCopyField>}
 {group.installments.length?<div style={{overflowX:"auto"}}><table className="season-entry-table" style={{width:"100%"}}><thead><tr><th>Taksit</th><th>Aylık Tutar</th><th>Toplam</th>{canViewCost&&<th>Bayi Primi</th>}</tr></thead><tbody>{group.installments.map(row=><tr key={row.id}><td>{row.installmentCount} ay</td><td>{money(row.monthlyInstallment)}</td><td>{money(row.totalPayable)}</td>{canViewCost&&<td>{money(row.dealerBonus)}</td>}</tr>)}</tbody></table></div>:<p>Bu ürün için taksit bilgisi bulunmuyor.</p>}
 </details>)}
 </section></>;
}
