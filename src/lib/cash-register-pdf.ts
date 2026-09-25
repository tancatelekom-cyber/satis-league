import path from 'node:path';
import pdfMake from 'pdfmake';
import { reportStyles, type CashReport, type ReportCell } from './cash-register-report';

const directory = path.join(process.cwd(), 'node_modules', 'pdfmake', 'fonts', 'Roboto');
const fonts = { normal: path.join(directory, 'Roboto-Regular.ttf'), bold: path.join(directory, 'Roboto-Medium.ttf'), italics: path.join(directory, 'Roboto-Italic.ttf'), bolditalics: path.join(directory, 'Roboto-MediumItalic.ttf') };
pdfMake.addFonts({ Roboto: fonts });
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(file => Object.values(fonts).includes(path.resolve(file)));

// fontkit is PDFKit's font engine; use the same glyph advances as the PDF renderer.
const fontkit = require('fontkit') as {openSync:(file:string)=>{unitsPerEm:number;layout:(value:string)=>{glyphs:{advanceWidth:number}[]}}};
const fontMetrics = {normal:fontkit.openSync(fonts.normal),bold:fontkit.openSync(fonts.bold)};
const oneLine = (value:string|number) => text(value).replace(/\s+/g,' ').trim();
function fitText(value:string|number,width:number,size=10.5,bold=false) {
  const label=oneLine(value);
  const font=bold?fontMetrics.bold:fontMetrics.normal;
  const measured=font.layout(label).glyphs.reduce((sum,glyph)=>sum+glyph.advanceWidth,0)/font.unitsPerEm*size;
  return {text:label,noWrap:true,bold,fontSize:Math.min(size,size*Math.max(1,width-3)/Math.max(1,measured))};
}
const staffWidth = (value:string) => fontMetrics.normal.layout(value).glyphs.reduce((sum,glyph)=>sum+glyph.advanceWidth,0)/fontMetrics.normal.unitsPerEm*10.5;
const topMargin = 132;
const availableWidth = 841.89 - 48; // A3 portrait, 24pt side margins.
const layout = {hLineWidth:()=>0.4,vLineWidth:()=>0.4,hLineColor:()=>'#a5b2bd',vLineColor:()=>'#a5b2bd',paddingLeft:()=>4,paddingRight:()=>4,paddingTop:()=>4,paddingBottom:()=>4};
const text = (value:string|number) => typeof value === 'number' ? value.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}) : value;
function pdfCell(cell:ReportCell,width:number) {
  const style=reportStyles[cell.style];
  return {...fitText(cell.value,width,cell.style==='header'?9.5:10.5,style.bold),fillColor:style.fill,color:style.color,alignment:style.align};
}

export function buildCashPdf(reports: CashReport[]): Promise<Buffer> {
  const content=reports.map((report,index)=>{
    const cellsAt=(row:number)=>report.cells.filter(c=>c.row===row).sort((a,b)=>a.col-b.col);
    const valueAt=(row:number,col:number)=>report.cells.find(c=>c.row===row&&c.col===col)?.value ?? '';
    const sections=report.cells.filter(c=>c.style==='section');
    const summaryRow=sections.find(c=>c.value==='KASA ÖZETİ · GÜN TOPLAMI')!.row;
    const blocks:Record<string,unknown>[]=[];
    for(let block=0;block<sections.length;block++) {
      const section=sections[block];
      if(section.row===summaryRow) break;
      const end=sections[block+1]?.row ?? summaryRow;
      const headers=cellsAt(section.row+1);
      const rows:ReportCell[][]=[];
      for(let row=section.row+2;row<end;row++) {
        const cells=cellsAt(row);
        if(cells.length) rows.push(cells);
      }
      // Size real columns from their text, rather than stretching a 53-column Excel grid.
      const widths=headers.map((header,column)=>{
        const max=column===1?240:column===2?190:column===0?65:86;
        const min=column===1?65:column===2?80:column===0?36:48;
        const lengths=[text(header.value),...rows.map(row=>text(row[column]?.value ?? ''))].map(value=>Math.max(...value.split('\n').map(line=>line.length))*5.3);
        return column===1 ? Math.min(240,Math.max(65,...rows.map(row=>staffWidth(oneLine(row[1]?.value ?? ''))+6))) : Math.max(min,Math.min(max,Math.max(...lengths)));
      });
      const budget=availableWidth-headers.length*8-(headers.length+1)*0.4;
      const scale=Math.min(1,(budget-widths[1])/widths.reduce((sum,width,index)=>sum+(index===1?0:width),0));
      const fittedWidths=widths.map((width,index)=>index===1?width:width*scale);
      const sectionWidth=fittedWidths.reduce((sum,width)=>sum+width,0);
      blocks.push({id:`cash-block-${index}-${block}`,margin:[0,0,0,12],
        table:{widths:fittedWidths,headerRows:2,keepWithHeaderRows:rows.length?1:0,dontBreakRows:true,
          body:[[{...pdfCell(section,sectionWidth),colSpan:headers.length},...headers.slice(1).map(()=>({}))],headers.map((cell,column)=>pdfCell(cell,fittedWidths[column])),...rows.map(row=>row.map((cell,column)=>pdfCell(cell,fittedWidths[column])))]},layout});
    }
    const summary=report.cells.filter(c=>c.row>summaryRow&&c.style!=='note');
    const summaryRows=[...new Set(summary.map(c=>c.row))].map(row=>cellsAt(row).map((cell,index)=>({...pdfCell(cell,index===0?195:90),alignment:index===0?'right':'left'})));
    blocks.push({id:`cash-block-${index}-summary`,margin:[0,0,0,12],table:{widths:[195,90],dontBreakRows:true,
      body:[[{...fitText('KASA ÖZETİ · GÜN TOPLAMI',285,11,true),colSpan:2,fillColor:'#dbe3eb'},{}],...summaryRows]},layout});
    blocks.push({stack:report.cells.filter(c=>c.row>summaryRow&&c.style==='note').map(c=>({...fitText(c.value,availableWidth,9),color:'#526777',margin:[0,0,0,4]}))});
    const warning=report.cells.find(c=>c.row===3&&c.style==='warning');
    return {section:blocks,pageSize:'A3',pageOrientation:'portrait',pageMargins:[24,topMargin,24,28],header:()=>({margin:[24,20,24,0],stack:[
      {...fitText(`ŞUBE: ${report.name} · ${valueAt(2,30)}`,availableWidth,14,true),color:'#123849'},
      {...fitText('GÜNLÜK KASA TAKİP VE GİRİŞ FORMU',availableWidth,13,true),margin:[0,2,0,6]},
      {...fitText(text(valueAt(1,0)).replace(/ · Sayfa \d+\/\d+/,''),availableWidth,9),color:'#526777',margin:[0,0,0,6]},
      {table:{widths:['auto',90,'auto',65,'auto',75],body:[[
        {...fitText('KASA BAŞLANGIÇ (DEVİR)',140,9)},{...fitText(valueAt(2,7),90,10,true),alignment:'right',fillColor:'#fff2cc'},
        {...fitText('FİŞ BAŞLANGIÇ',95,9)},{...fitText(valueAt(2,21),65,10),fillColor:'#fff2cc'},
        {...fitText('TARİH',40,9)},{...fitText(valueAt(2,30),75,10),fillColor:'#fff2cc'}]]},layout,fontSize:10},
      ...(warning?[{...fitText(warning.value,availableWidth,10,true),color:'#b91c1c',margin:[0,5,0,0]}]:[])
    ]})};
  });
  return pdfMake.createPdf({pageSize:'A3',pageOrientation:'portrait',pageMargins:[24,topMargin,24,28],defaultStyle:{font:'Roboto',fontSize:10.5},content,
    footer:(page:number,pages:number)=>({text:`${page} / ${pages}`,alignment:'right',fontSize:9,margin:[24,0,24,0]}),
    pageBreakBefore:(node:{id?:string;pageNumbers:number[];startPosition?:{top:number}})=>
      Boolean(node.id?.startsWith('cash-block-')&&node.pageNumbers.length>1&&(node.startPosition?.top??topMargin)>topMargin+1)
  }).getBuffer();
}

