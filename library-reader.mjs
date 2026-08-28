import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function extractPdfText(bytes) {
  const loadingTask = getDocument({ data: new Uint8Array(bytes), disableWorker: true, useSystemFonts: true });
  const document = await loadingTask.promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({ page: pageNumber, text: content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim() });
    }
    return { pageCount: document.numPages, pages, text: pages.map((page) => `[Page ${page.page}]\n${page.text}`).join('\n\n') };
  } finally {
    await loadingTask.destroy();
  }
}
