import type { DevicePriceRow } from "./device-price-list";
export function normalizeDeviceSearch(value:string){return value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i").replace(/\s+/g," ").trim();}
export function filterDevicePrices(rows:DevicePriceRow[],filters:{query:string;category:string;brand:string;product:string}){
 const query=normalizeDeviceSearch(filters.query);
 return rows.filter(row=>query ? normalizeDeviceSearch([row.productName,row.brand,row.category].join(" ")).includes(query) : (!filters.category||row.category===filters.category)&&(!filters.brand||row.brand===filters.brand)&&(!filters.product||row.productName===filters.product));
}
export function groupDevicePrices(rows:DevicePriceRow[]){
 const groups=new Map<string,DevicePriceRow[]>();for(const row of rows){const key=JSON.stringify([row.category,row.brand,row.productName]);groups.set(key,[...(groups.get(key)??[]),row]);}
 return [...groups.entries()].map(([key,items])=>{const cash=items.find(r=>(r.monthlyInstallment<=0||r.installmentCount<=0)&&r.contractCashPrice&&r.contractCashPrice>0)??items.find(r=>r.contractCashPrice&&r.contractCashPrice>0);return {key,product:items[0],cash,price:cash?.contractCashPrice??null,installments:items.filter(r=>r.monthlyInstallment>0&&r.installmentCount>0).sort((a,b)=>a.installmentCount-b.installmentCount)};}).sort((a,b)=>a.product.productName.localeCompare(b.product.productName,"tr"));
}
