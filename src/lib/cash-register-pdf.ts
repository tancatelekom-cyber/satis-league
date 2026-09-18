import path from 'node:path';
import pdfMake from 'pdfmake';
import { reportStyles, type CashReport } from './cash-register-report';

const directory = path.join(process.cwd(), 'node_modules', 'pdfmake', 'fonts', 'Roboto');
const fonts = { normal: path.join(directory, 'Roboto-Regular.ttf'), bold: path.join(directory, 'Roboto-Medium.ttf'), italics: path.join(directory, 'Roboto-Italic.ttf'), bolditalics: path.join(directory, 'Roboto-MediumItalic.ttf') };
pdfMake.addFonts({ Roboto: fonts });
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(file => Object.values(fonts).includes(path.resolve(file)));

export function buildCashPdf(reports: CashReport[]): Promise<Buffer> {
  const content = reports.map((report, index) => {
    const body: Record<string, unknown>[][] = report.heights.map(() => Array.from({length: report.columns}, () => ({text:'',border:[false,false,false,false]})));
    for (const cell of report.cells) {
      const style = reportStyles[cell.style];
      body[cell.row][cell.col] = {
        text: typeof cell.value === 'number' ? cell.value.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}) : cell.row === 1 ? cell.value.replace(/ · Sayfa \d+\/\d+/, '') : cell.value,
        colSpan: cell.span, fillColor: style.fill, color: style.color, bold: style.bold,
        alignment: style.align, fontSize: Math.max(7, style.size * 0.7),
        border: [style.border,style.border,style.border,style.border]
      };
      for(let offset=1;offset<cell.span;offset++) body[cell.row][cell.col+offset]={};
    }
    return {
      ...(index ? {pageBreak:'before'} : {}),
      table: {widths:Array(report.columns).fill('*'),body,dontBreakRows:true},
      layout: {hLineWidth:()=>0.4,vLineWidth:()=>0.4,hLineColor:()=>'#929ca5',vLineColor:()=>'#929ca5',paddingLeft:()=>2,paddingRight:()=>2,paddingTop:()=>3,paddingBottom:()=>3}
    };
  });
  return pdfMake.createPdf({pageSize:'A3',pageOrientation:'landscape',pageMargins:[24,24,24,28],defaultStyle:{font:'Roboto',fontSize:8},content,
    footer:(page:number,pages:number)=>({text:`${page} / ${pages}`,alignment:'right',fontSize:8,margin:[24,0,24,0]})
  }).getBuffer();
}
