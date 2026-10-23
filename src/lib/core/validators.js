/**
 * Binary Magic Byte Security Validators
 * 100% Client-side validation ensuring files match their claimed binary signatures.
 */

/**
 * Validate that a file or blob contains genuine PDF magic bytes (%PDF-).
 * Checks up to 1024 bytes per the PDF ISO 32000-1 specification.
 * @param {File|Blob} file
 * @returns {Promise<boolean>}
 */
export async function isValidPdfFile(file) {
  if (!file) return false;
  try {
    let sliceBuffer;
    if (typeof file.slice === 'function') {
      const slice = file.slice(0, 1024);
      sliceBuffer = await slice.arrayBuffer();
    } else if (typeof file.arrayBuffer === 'function') {
      sliceBuffer = await file.arrayBuffer();
    } else {
      return false;
    }
    const bytes = new Uint8Array(sliceBuffer);
    if (bytes.length < 5) return false;

    // Scan up to 1024 bytes for %PDF- (0x25 0x50 0x44 0x46 0x2D)
    const maxScan = Math.min(bytes.length - 4, 1024);
    for (let i = 0; i < maxScan; i++) {
      if (
        bytes[i] === 0x25 && // %
        bytes[i + 1] === 0x50 && // P
        bytes[i + 2] === 0x44 && // D
        bytes[i + 3] === 0x46 && // F
        bytes[i + 4] === 0x2D    // -
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Validate that a file or blob contains genuine Image magic bytes (JPEG, PNG, WebP, GIF, BMP, SVG, AVIF).
 * @param {File|Blob} file
 * @returns {Promise<boolean>}
 */
export async function isValidImageFile(file) {
  if (!file) return false;
  try {
    let sliceBuffer;
    if (typeof file.slice === 'function') {
      const slice = file.slice(0, 64);
      sliceBuffer = await slice.arrayBuffer();
    } else if (typeof file.arrayBuffer === 'function') {
      sliceBuffer = await file.arrayBuffer();
    } else {
      return false;
    }
    const b = new Uint8Array(sliceBuffer);
    if (b.length < 4) return false;

    // JPEG: FF D8 FF
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return true;
    // PNG: 89 50 4E 47
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return true;
    // GIF: 47 49 46 38 ('GIF8')
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true;
    // BMP: 42 4D ('BM')
    if (b[0] === 0x42 && b[1] === 0x4D) return true;
    // WebP: 'RIFF'....'WEBP'
    if (
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
    ) {
      return true;
    }
    // AVIF: bytes 4..7 'ftyp' and 8..11 'avif'/'avis'
    if (
      b.length >= 12 &&
      b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 &&
      b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && (b[11] === 0x66 || b[11] === 0x73)
    ) {
      return true;
    }
    // SVG: check for <?xml or <svg
    if (typeof TextDecoder !== 'undefined') {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(b).trim().toLowerCase();
      if (text.startsWith('<svg') || text.startsWith('<?xml')) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.isValidPdfFile = isValidPdfFile;
  window.isValidImageFile = isValidImageFile;
}
