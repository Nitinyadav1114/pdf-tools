/**
 * PDF Tools - High-Performance Dedicated Web Worker
 * Offloads heavy pixel manipulation, color inversion, and compression resampling
 * Keeps the main UI thread at 60 FPS
 * 100% Private, Client-Side, Zero Network Transmission
 */

self.onmessage = async function (e) {
  const { id, type, payload } = e.data || {};

  try {
    if (type === 'ping') {
      self.postMessage({
        id,
        success: true,
        pong: true,
        hasOffscreenCanvas: typeof OffscreenCanvas !== 'undefined'
      });
      return;
    }

    if (type === 'invert') {
      const { buffer, width, height, mode, returnJpeg, quality } = payload || {};
      if (!buffer) throw new Error('Missing buffer for invert task');
      const data = new Uint8ClampedArray(buffer);
      applyInvertAlgorithm(data, mode);

      if (returnJpeg && typeof OffscreenCanvas !== 'undefined') {
        const offscreen = new OffscreenCanvas(width, height);
        const ctx = offscreen.getContext('2d');
        const imgData = new ImageData(data, width, height);
        ctx.putImageData(imgData, 0, 0);

        const blob = await offscreen.convertToBlob({
          type: 'image/jpeg',
          quality: quality || 0.92
        });
        const jpegBuffer = await blob.arrayBuffer();
        self.postMessage({ id, success: true, jpegBuffer }, [jpegBuffer]);
      } else {
        self.postMessage({ id, success: true, buffer: data.buffer, width, height }, [data.buffer]);
      }
      return;
    }

    if (type === 'compress-resample') {
      const { buffer, width, height, quality, scale } = payload || {};
      if (!buffer) throw new Error('Missing buffer for compress-resample task');
      if (typeof OffscreenCanvas !== 'undefined') {
        const srcCanvas = new OffscreenCanvas(width, height);
        const srcCtx = srcCanvas.getContext('2d');
        const imgData = new ImageData(new Uint8ClampedArray(buffer), width, height);
        srcCtx.putImageData(imgData, 0, 0);

        let finalCanvas = srcCanvas;
        if (scale && scale !== 1.0) {
          const targetW = Math.max(1, Math.round(width * scale));
          const targetH = Math.max(1, Math.round(height * scale));
          const targetCanvas = new OffscreenCanvas(targetW, targetH);
          const targetCtx = targetCanvas.getContext('2d');
          targetCtx.imageSmoothingEnabled = true;
          targetCtx.imageSmoothingQuality = 'high';
          targetCtx.drawImage(srcCanvas, 0, 0, targetW, targetH);
          finalCanvas = targetCanvas;
        }

        const blob = await finalCanvas.convertToBlob({
          type: 'image/jpeg',
          quality: quality || 0.80
        });
        const jpegBuffer = await blob.arrayBuffer();
        self.postMessage({ id, success: true, jpegBuffer }, [jpegBuffer]);
      } else {
        self.postMessage({ id, success: false, fallback: true, error: 'OffscreenCanvas unsupported in worker' });
      }
      return;
    }

    if (type === 'encode-image') {
      const {
        buffer,
        imageBuffer,
        bitmap,
        width,
        height,
        rotation,
        mimeType,
        quality
      } = payload || {};

      if (typeof OffscreenCanvas === 'undefined') {
        self.postMessage({ id, success: false, fallback: true, error: 'OffscreenCanvas unsupported in worker' });
        return;
      }

      const targetMime = mimeType || 'image/jpeg';
      const targetQuality = targetMime === 'image/png' ? undefined : (quality !== undefined ? quality : 0.92);
      const rot = ((rotation || 0) % 360 + 360) % 360;
      const isQuarterTurn = (rot === 90 || rot === 270);

      let source = null;
      let srcW = width;
      let srcH = height;

      if (bitmap) {
        source = bitmap;
        srcW = bitmap.width;
        srcH = bitmap.height;
      } else if (imageBuffer) {
        const blob = new Blob([imageBuffer]);
        source = await createImageBitmap(blob);
        srcW = source.width;
        srcH = source.height;
      } else if (buffer) {
        if (!width || !height) throw new Error('width and height required for pixel buffer encoding');
        const tempCanvas = new OffscreenCanvas(width, height);
        const tempCtx = tempCanvas.getContext('2d');
        const imgData = new ImageData(new Uint8ClampedArray(buffer), width, height);
        tempCtx.putImageData(imgData, 0, 0);
        source = tempCanvas;
        srcW = width;
        srcH = height;
      } else {
        throw new Error('encode-image requires buffer, imageBuffer, or bitmap');
      }

      const outW = isQuarterTurn ? srcH : srcW;
      const outH = isQuarterTurn ? srcW : srcH;

      const offscreen = new OffscreenCanvas(outW, outH);
      const ctx = offscreen.getContext('2d');

      if (targetMime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outW, outH);
      }

      if (rot !== 0) {
        ctx.save();
        ctx.translate(outW / 2, outH / 2);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(source, -srcW / 2, -srcH / 2);
        ctx.restore();
      } else {
        ctx.drawImage(source, 0, 0);
      }

      if (source && source.close && typeof source.close === 'function') {
        try { source.close(); } catch (e) {}
      }

      const outBlob = await offscreen.convertToBlob({
        type: targetMime,
        quality: targetQuality
      });
      const outputBuffer = await outBlob.arrayBuffer();

      self.postMessage({
        id,
        success: true,
        buffer: outputBuffer,
        width: outW,
        height: outH,
        mimeType: targetMime
      }, [outputBuffer]);
      return;
    }

    throw new Error(`Unknown task type: ${type}`);
  } catch (err) {
    self.postMessage({
      id,
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  }
};

// ==========================================
// PIXEL INVERSION ALGORITHMS
// ==========================================

function invertPixelsNegative(data) {
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
}

function invertPixelsGrayscale(data) {
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    const inv = 255 - gray;
    data[i] = inv;
    data[i + 1] = inv;
    data[i + 2] = inv;
  }
}

function isPageDark(data) {
  let totalLuma = 0;
  let samples = 0;
  const len = data.length;
  for (let i = 0; i < len; i += 16) {
    totalLuma += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    samples++;
  }
  return (totalLuma / (samples || 1)) < 128;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const val = Math.round(l * 255);
    return [val, val, val];
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return [r, g, b];
}

function invertPixelsPreserveHue(data) {
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const [r2, g2, b2] = hslToRgb(h, s, 1 - l);
    data[i] = r2;
    data[i + 1] = g2;
    data[i + 2] = b2;
  }
}

function applyInvertAlgorithm(data, mode) {
  if (mode === 'grayscale-invert') {
    invertPixelsGrayscale(data);
  } else if (mode === 'preserve-hue') {
    invertPixelsPreserveHue(data);
  } else if (mode === 'dark-only') {
    if (isPageDark(data)) {
      invertPixelsNegative(data);
    }
  } else {
    invertPixelsNegative(data);
  }
}
