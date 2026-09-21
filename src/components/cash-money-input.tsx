"use client";
import { useRef, useState, type InputHTMLAttributes } from 'react';

const displayMoney = (value: number) => value === 0 ? '' : value.toLocaleString('tr-TR', {maximumFractionDigits:2});

/** Keeps the editing string separate from the numeric accounting value. */
export function CashMoneyInput({value,onValueChange,...props}: Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'> & {value:number;onValueChange:(value:number)=>void}) {
  const [draft,setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return <input {...props} ref={input} type="text" inputMode="decimal" className="cash-money-input"
    value={draft ?? displayMoney(value)} placeholder="Tutar"
    onFocus={event=>{setDraft(displayMoney(value));props.onFocus?.(event);}}
    onBlur={event=>{setDraft(null);props.onBlur?.(event);}}
    onKeyDown={event=>{
      if(event.key==='.') {
        event.preventDefault();
        const field=event.currentTarget;
        const start=field.selectionStart ?? field.value.length;
        const end=field.selectionEnd ?? start;
        edit(field.value.slice(0,start)+','+field.value.slice(end),start+1);
      }
      props.onKeyDown?.(event);
    }}
    onChange={event=>edit(event.target.value,event.target.selectionStart ?? event.target.value.length)}/>;
  function edit(raw:string,caret:number) {
      const meaningful=raw.slice(0,caret).replace(/\./g,'').length;
      const clean=raw.replace(/\./g,'').replace(/\s/g,'');
      if(!/^\d*(,\d{0,2})?$/.test(clean)) return;
      const amount=Number(clean.replace(',','.')) || 0;
      if(amount>999999999999.99) return;
      const [whole,fraction]=clean.split(',');
      const formatted=clean==='' ? '' : Number(whole || '0').toLocaleString('tr-TR')+(fraction===undefined?'':','+fraction);
      setDraft(formatted);onValueChange(amount);
      requestAnimationFrame(()=>{
        if(document.activeElement!==input.current) return;
        let pos=0,count=0;
        while(pos<formatted.length&&count<meaningful){if(formatted[pos]!=='.') count++;pos++;}
        input.current?.setSelectionRange(pos,pos);
      });
    }
}
