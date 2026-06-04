import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

function createPNG(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const ihdrChunk = chunk('IHDR', ihdr);

  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const off = y * (1 + size * 3);
    raw[off] = 0;
    for (let x = 0; x < size; x++) {
      const p = off + 1 + x * 3;
      raw[p] = r; raw[p+1] = g; raw[p+2] = b;
    }
  }
  const idatChunk = chunk('IDAT', deflateSync(raw));
  const iendChunk = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([t, data]);
  let c = 0xFFFFFFFF;
  for (let i = 0; i < crcData.length; i++) {
    c ^= crcData[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  c = (c ^ 0xFFFFFFFF) >>> 0;
  const crc = Buffer.alloc(4); crc.writeUInt32BE(c, 0);
  return Buffer.concat([len, t, data, crc]);
}

const dir = new URL('../static', import.meta.url).pathname;
writeFileSync(dir + '/icon-192.png', createPNG(192, 255, 36, 66));
writeFileSync(dir + '/icon-512.png', createPNG(512, 255, 36, 66));
console.log('✅ 图标已生成');
