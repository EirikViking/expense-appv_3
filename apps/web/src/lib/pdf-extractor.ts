import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure PDF.js worker - use locally bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface PdfExtractResult {
  text: string;
  error?: string;
}

export async function extractPdfText(arrayBuffer: ArrayBuffer): Promise<PdfExtractResult> {
  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Group text items by their Y position to reconstruct lines
      const lineMap = new Map<number, { x: number; text: string }[]>();
      const lineHeight = 12; // Approximate line height for grouping

      for (const item of textContent.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const textItem = item as TextItem;

        // Round Y position to group items on same line
        const y = Math.round(textItem.transform[5] / lineHeight) * lineHeight;
        const x = textItem.transform[4];

        if (!lineMap.has(y)) {
          lineMap.set(y, []);
        }
        lineMap.get(y)!.push({ x, text: textItem.str });
      }

      // Sort lines by Y position (descending, since PDF Y is bottom-up)
      const sortedYPositions = Array.from(lineMap.keys()).sort((a, b) => b - a);

      const lines: string[] = [];
      for (const y of sortedYPositions) {
        const lineItems = lineMap.get(y)!;
        // Sort items within line by X position
        lineItems.sort((a, b) => a.x - b.x);

        // Join items with appropriate spacing
        let lineText = '';
        let lastX = 0;
        for (const item of lineItems) {
          // Add space if there's a gap
          if (lineText && item.x - lastX > 10) {
            lineText += ' ';
          }
          lineText += item.text;
          lastX = item.x + (item.text.length * 5); // Approximate character width
        }

        if (lineText.trim()) {
          lines.push(lineText.trim());
        }
      }

      pageTexts.push(lines.join('\n'));
    }

    const fullText = pageTexts.join('\n\n');

    if (!fullText.trim()) {
      return { text: '', error: 'PDF text extraction failed or returned empty content' };
    }

    return { text: fullText };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { text: '', error: `Failed to extract PDF text: ${message}` };
  }
}
