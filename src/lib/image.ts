// Rasterize any image (an SVG path/data URL or a raster data URL) to a PNG data
// URL so it can be embedded in a jsPDF document (jsPDF's addImage needs raster
// formats, not SVG). Returns null on failure so callers can skip the logo.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export interface RasterImage {
  dataUrl: string
  width: number
  height: number
}

export async function imageToPng(src: string, box = 128): Promise<RasterImage | null> {
  try {
    const img = await loadImage(src)
    // SVGs without intrinsic size report 0 — fall back to a square box.
    const nw = img.naturalWidth || box
    const nh = img.naturalHeight || box
    const scale = Math.min(box / nw, box / nh) || 1
    const w = Math.max(1, Math.round(nw * scale))
    const h = Math.max(1, Math.round(nh * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h }
  } catch {
    return null
  }
}
