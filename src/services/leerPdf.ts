/**
 * Extrae los textos de un PDF en el propio navegador (el archivo no se envía a ningún sitio).
 */
import type { Texto } from './horarioSeneca';

export async function textosDelPdf(archivo: ArrayBuffer): Promise<Texto[][]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(archivo) }).promise;
  const paginas: Texto[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const alto = pagina.getViewport({ scale: 1 }).height;
    const contenido = await pagina.getTextContent();
    const textos: Texto[] = [];
    contenido.items.forEach((it) => {
      if (!('str' in it) || !it.str.trim()) return;
      textos.push({ s: it.str, x: it.transform[4], y: alto - it.transform[5], w: it.width });
    });
    paginas.push(textos);
  }
  return paginas;
}
