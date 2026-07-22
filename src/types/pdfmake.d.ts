declare module "pdfmake" {
  type PdfDocument = {
    getBuffer(): Promise<Buffer>;
  };

  type PdfMake = {
    addFonts(fonts: Record<string, Record<string, string>>): void;
    createPdf(documentDefinition: unknown): PdfDocument;
    setLocalAccessPolicy(callback: (filePath: string) => boolean): void;
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
  };

  const pdfMake: PdfMake;
  export = pdfMake;
}
