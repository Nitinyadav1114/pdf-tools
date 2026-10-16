/**
 * In-Browser Zero-Dependency PKZIP Generator
 * Generates valid .zip binary archives adhering to PKZIP 2.0 specs.
 */

/**
 * Creates an uncompressed (Store, method 0) PKZIP archive from an array of files.
 * @param {Array<{ name: string, data: Uint8Array }>} files
 * @returns {Blob}
 */
export function createZipArchive(files) {
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
  }

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xFF];
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const parts = [];
  const centralEntries = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const dataBytes = file.data;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + name length)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true);         // version needed (2.0)
    lv.setUint16(6, 0, true);          // flags
    lv.setUint16(8, 0, true);          // compression (0 = Store)
    lv.setUint16(10, 0, true);         // time
    lv.setUint16(12, 0, true);         // date
    lv.setUint32(14, crc, true);       // crc32
    lv.setUint32(18, size, true);      // compressed size
    lv.setUint32(22, size, true);      // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);         // extra field length
    localHeader.set(nameBytes, 30);

    parts.push(localHeader);
    parts.push(dataBytes);

    // Central directory entry (46 bytes + name length)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true);         // version made by
    cv.setUint16(6, 20, true);         // version needed
    cv.setUint16(8, 0, true);          // flags
    cv.setUint16(10, 0, true);         // compression (Store)
    cv.setUint16(12, 0, true);         // time
    cv.setUint16(14, 0, true);         // date
    cv.setUint32(16, crc, true);       // crc32
    cv.setUint32(20, size, true);      // compressed size
    cv.setUint32(24, size, true);      // uncompressed size
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);         // extra field length
    cv.setUint16(32, 0, true);         // comment length
    cv.setUint16(34, 0, true);         // disk start
    cv.setUint16(36, 0, true);         // internal attributes
    cv.setUint32(38, 0, true);         // external attributes
    cv.setUint32(42, offset, true);    // local header offset
    centralHeader.set(nameBytes, 46);

    centralEntries.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const ch of centralEntries) {
    parts.push(ch);
    centralSize += ch.length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);     // signature
  ev.setUint16(4, 0, true);              // disk number
  ev.setUint16(6, 0, true);              // disk with central dir
  ev.setUint16(8, files.length, true);   // records on this disk
  ev.setUint16(10, files.length, true);  // total records
  ev.setUint32(12, centralSize, true);   // central dir size
  ev.setUint32(16, centralOffset, true); // central dir offset
  ev.setUint16(20, 0, true);             // comment length
  parts.push(eocd);

  let totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(totalLen);
  let ptr = 0;
  for (const p of parts) {
    out.set(p, ptr);
    ptr += p.length;
  }

  return new Blob([out], { type: 'application/zip' });
}

if (typeof window !== 'undefined') {
  window.createZipArchive = createZipArchive;
}
