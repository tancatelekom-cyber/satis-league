import path from 'node:path';
import pdfMake from 'pdfmake';
import { reportStyles, type CashReport } from './cash-register-report';

const directory = path.join(process.cwd(), 'node_modules', 'pdfmake', 'fonts', 'Roboto');
const fonts = { normal: path.join(directory, 'Roboto-Regular.ttf'), bold: path.join(directory, 'Roboto-Medium.ttf'), italics: path.join(directory, 'Roboto-Italic.ttf'), bolditalics: path.join(directory, 'Roboto-MediumItalic.ttf') };
pdfMake.addFonts({ Roboto: fonts });
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(file => Object.values(fonts).includes(path.resolve(file)));

export function buildCashPdf(reports: CashReport[]): Promise<Buffer> {
  const content = reports.flatMap((report, index) => {
    const reportDate = report.cells.find(cell => cell.row === 2 && cell.col === 30)?.value ?? '';
    const branchLabel = `ŞUBE: ${report.name} · ${reportDate}`;
    const body: Record<string, unknown>[][] = report.heights.map(() => Array.from({length: report.columns}, () => ({text:'',border:[false,false,false,false]})));
    const summaryRow = report.cells.find(cell => cell.value === 'KASA ÖZETİ · GÜN TOPLAMI')?.row ?? Infinity;
    for (const cell of report.cells) {
      const compactSummary = cell.row >= summaryRow && cell.style !== 'note';
      const style = reportStyles[cell.style];
      body[cell.row][cell.col] = {
        text: cell.style === 'title' ? `${branchLabel}\n${cell.value}`
          : cell.style === 'section' ? `${cell.value} · ${branchLabel}`
          : typeof cell.value === 'number' ? cell.value.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}) : cell.row === 1 ? cell.value.replace(/ · Sayfa \d+\/\d+/, '') : cell.value,
        colSpan: cell.span, fillColor: style.fill, color: style.color, bold: style.bold,
        alignment: compactSummary && cell.style !== 'section' ? (cell.col === 0 ? 'right' : 'left') : style.align, fontSize: compactSummary ? 10 : Math.max(7, style.size * 0.7),
        border: [style.border,style.border,style.border,style.border]
      };
      for(let offset=1;offset<cell.span;offset++) body[cell.row][cell.col+offset]={};
    }
    const starts = [0, ...report.cells.filter(cell => cell.style === 'section').map(cell => cell.row)];
    return starts.map((start, block) => {
      let end = starts[block + 1] ?? body.length;
      // Keep spacing outside the category so a trailing blank row cannot force a page break.
      while (end > start && !report.cells.some(cell => cell.row === end - 1)) end--;
      const category = start > 0 && start < summaryRow;
      return {
        id: `cash-block-${index}-${block}`,
        ...(index && block === 0 ? {pageBreak:'before'} : {}),
        margin: [0, 0, 0, 8],
        table: {widths:Array(report.columns).fill('*'),body:body.slice(start,end),dontBreakRows:true,
          ...(category ? {headerRows:2,keepWithHeaderRows:end-start>2 ? 1 : 0} : {})},
        layout: {hLineWidth:()=>0.4,vLineWidth:()=>0.4,hLineColor:()=>'#929ca5',vLineColor:()=>'#929ca5',paddingLeft:()=>2,paddingRight:()=>2,paddingTop:()=>3,paddingBottom:()=>3}
      };
    });
  });
  return pdfMake.createPdf({pageSize:'A3',pageOrientation:'landscape',pageMargins:[24,24,24,28],defaultStyle:{font:'Roboto',fontSize:8},content,
    footer:(page:number,pages:number)=>({text:`${page} / ${pages}`,alignment:'right',fontSize:8,margin:[24,0,24,0]}),
    // Use actual laid-out heights, including wrapped text. Oversized categories may
    // continue after moving to a fresh page; their two header rows repeat there.
    pageBreakBefore:(node:{id?:string;pageNumbers:number[];startPosition?:{top:number}})=>
      Boolean(node.id?.startsWith('cash-block-') && node.pageNumbers.length>1 && (node.startPosition?.top ?? 24)>25)
  }).getBuffer();
}
