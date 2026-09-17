import { reportStyles, reportLines, type CashReport } from './cash-register-report';

export function drawCashReport(report: CashReport) {
  const canvas = document.createElement('canvas');
  const scale=2, margin=20, width=report.columns*report.columnWidth;
  const height=report.heights.reduce((s,h)=>s+h,0);
  canvas.width=(width+margin*2)*scale;canvas.height=(height+margin*2)*scale;
  const ctx=canvas.getContext('2d');if(!ctx) throw new Error('Görsel oluşturulamadı.');
  ctx.scale(scale,scale);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width+margin*2,height+margin*2);
  const offsets:number[]=[];let top=margin;report.heights.forEach(h=>{offsets.push(top);top+=h;});
  for(const cell of report.cells) {
    const style=reportStyles[cell.style];
    const x=margin+cell.col*report.columnWidth,y=offsets[cell.row],w=cell.span*report.columnWidth,h=report.heights[cell.row];
    ctx.fillStyle=style.fill;ctx.fillRect(x,y,w,h);
    if(style.border) {ctx.strokeStyle='#89929c';ctx.lineWidth=cell.style==='section'?1.5:0.6;ctx.strokeRect(x,y,w,h);}
    ctx.fillStyle=style.color;ctx.font=`${style.bold?'bold ':''}${style.size}px Arial`;ctx.textAlign=style.align;ctx.textBaseline='middle';
    const lines=reportLines(cell.value,w,style.size),lineHeight=style.size+3;
    lines.forEach((line,i)=>ctx.fillText(line,style.align==='right'?x+w-6:style.align==='center'?x+w/2:x+6,y+(h-lines.length*lineHeight)/2+(i+0.5)*lineHeight,w-12));
  }
  return canvas;
}
