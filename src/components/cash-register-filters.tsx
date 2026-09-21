"use client";

export function CashRegisterFilters({date,store,today,allStores,stores}: {
  date:string; store:string; today:string; allStores:boolean; stores:{id:string;name:string}[];
}) {
  return <form action="/kasa-takip" method="get" className="cash-toolbar" onChange={event=>event.currentTarget.requestSubmit()}>
    <label>Tarih<input name="date" type="date" required defaultValue={date} max={today}/></label>
    {allStores && <label>Şube<select name="store" defaultValue={store}>
      <option value="">Tüm şubeler</option>
      {stores.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}
    </select></label>}
  </form>;
}
