// One-off placeholder .ico generator (no external deps). Produces a multi-size
// solid-color ICO (16/32/48/256 px) so electron-builder has a valid Windows icon
// to package until a real app icon is supplied.
const fs = require('fs');
const path = require('path');

function makeBmpImage(size, r, g, b) {
  const rowSize = size * 4;
  const pixels = Buffer.alloc(rowSize * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = y * rowSize + x * 4;
      pixels[o] = b; pixels[o + 1] = g; pixels[o + 2] = r; pixels[o + 3] = 255; // BGRA
    }
  }
  const andMask = Buffer.alloc(Math.ceil(size / 32) * 4 * size, 0);
  const header = Buffer.alloc(40);
  header.writeInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // height doubled (XOR+AND) per ICO convention
  header.writeInt16LE(1, 12);
  header.writeInt16LE(32, 14);
  header.writeInt32LE(0, 16);
  header.writeInt32LE(pixels.length + andMask.length, 20);
  return Buffer.concat([header, pixels, andMask]);
}

const sizes = [16, 32, 48, 256];
const images = sizes.map((s) => makeBmpImage(s, 0x22, 0x34, 0x5c)); // navy from app palette

const dirHeader = Buffer.alloc(6);
dirHeader.writeInt16LE(0, 0);
dirHeader.writeInt16LE(1, 2);
dirHeader.writeInt16LE(sizes.length, 4);

let offset = 6 + 16 * sizes.length;
const entries = [];
sizes.forEach((s, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(s === 256 ? 0 : s, 0);
  entry.writeUInt8(s === 256 ? 0 : s, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(images[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += images[i].length;
  entries.push(entry);
});

const ico = Buffer.concat([dirHeader, ...entries, ...images]);
const outPath = path.join(__dirname, '..', 'assets', 'icons', 'icon.ico');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, ico);
console.log('Wrote', outPath, ico.length, 'bytes');
