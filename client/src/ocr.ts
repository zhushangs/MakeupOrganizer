import { createWorker, OEM, type Worker } from 'tesseract.js'
import type Tesseract from 'tesseract.js'

/**
 * Free, on-device text recognition (tesseract.js). The engine and English data are served
 * from our own /ocr folder, so it works without any API key or CDN.
 */

let workerPromise: Promise<Worker> | null = null
let progressCb: ((p: number) => void) | null = null

function getWorker() {
  workerPromise ??= createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: `${location.origin}/ocr/worker.min.js`,
    corePath: `${location.origin}/ocr`,
    langPath: `${location.origin}/ocr`,
    gzip: true,
    logger: m => {
      if (m.status === 'recognizing text') progressCb?.(m.progress)
    },
  }).catch(e => { workerPromise = null; throw e })
  return workerPromise
}

/**
 * Prepare a screenshot for OCR: grayscale, flip dark-mode screenshots to dark-on-light,
 * and upscale small images (tesseract likes ~30px tall text).
 */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file)
  const scale = bmp.width < 900 ? 2 : bmp.width > 2400 ? 2400 / bmp.width : 1
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = g
    sum += g
  }
  if (sum / (d.length / 4) < 110) for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i]
  ctx.putImageData(img, 0, 0)
  return c
}

const ANCHOR = /^(ITEM\b|\$\s?\d|colou?r:?$|colou?r:|shade:|size:?$|size:|qty)/i

/**
 * Shopping apps put a product photo to the left of each item's text, and OCR turns the photo into
 * junk words ("Fs EADEM", "( ) Soft Pop…"). Find the left edge of the text column from lines that
 * clearly belong to it (ITEM / $price / Color: / Size:) and drop words that sit left of it.
 */
function textColumnLines(lines: Tesseract.Line[], width: number): string[] {
  const starts: number[] = []
  for (const l of lines) {
    const w = l.words.find(w => ANCHOR.test(w.text))
    if (w) starts.push(w.bbox.x0)
  }
  starts.sort((a, b) => a - b)
  const colX = starts.length >= 2 ? starts[Math.floor((starts.length - 1) / 2)] : 0
  if (colX <= width * 0.12) return lines.map(l => l.text.trim()).filter(Boolean)

  const cut = colX - width * 0.03
  const gap = width * 0.025
  const out: string[] = []
  for (const l of lines) {
    const words = [...l.words].sort((a, b) => a.bbox.x0 - b.bbox.x0)
    const first = words.findIndex(w => w.bbox.x0 >= cut)
    if (first < 0) {
      // entirely left of the text column: photo junk is short or low-confidence; keep real headers
      const text = words.map(w => w.text).join(' ').trim()
      if ((text.length >= 8 && l.confidence >= 70) || /\$\s?\d/.test(text)) out.push(text)
      continue
    }
    // Drop the left part only when there's a clear gap (photo, then text) and the text starts at the column.
    // Otherwise it's one line, e.g. a header, or "Subtotal ……… $52.60" with the amount pushed far right.
    const keepFrom = first > 0 && words[first].bbox.x0 - words[first - 1].bbox.x1 > gap
      && words[first].bbox.x0 <= colX + gap * 2 ? first : 0
    const text = words.slice(keepFrom).map(w => w.text).join(' ').trim()
    if (text) out.push(text)
  }
  return out
}

/**
 * Returns the recognized text one line per row with photo junk removed (`text`),
 * plus the unfiltered text (`raw`, used to spot the store name).
 */
export async function recognizeText(file: Blob, onProgress?: (p: number) => void): Promise<{ text: string; raw: string }> {
  const worker = await getWorker()
  const canvas = await prepare(file)
  progressCb = onProgress ?? null
  try {
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true })
    const lines = (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines))
    if (!lines.length) return { text: data.text, raw: data.text }
    // keep reading order top-to-bottom
    lines.sort((a, b) => a.bbox.y0 - b.bbox.y0)
    return { text: textColumnLines(lines, canvas.width).join('\n'), raw: data.text }
  } finally {
    progressCb = null
  }
}
