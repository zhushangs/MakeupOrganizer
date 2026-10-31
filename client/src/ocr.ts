import { createWorker, OEM, type Worker } from 'tesseract.js'

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

export async function recognizeText(file: Blob, onProgress?: (p: number) => void): Promise<string> {
  const worker = await getWorker()
  const canvas = await prepare(file)
  progressCb = onProgress ?? null
  try {
    const { data } = await worker.recognize(canvas)
    return data.text
  } finally {
    progressCb = null
  }
}
