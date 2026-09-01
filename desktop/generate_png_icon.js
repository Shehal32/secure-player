const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create a valid 512x512 PNG icon with FonixEdu brand colors (Orange shield on dark slate background)
function generateFonixPng(filePath) {
  const width = 512;
  const height = 512;

  // Uncompressed RGBA image buffer (height * (1 filter byte + width * 4 bytes))
  const rawData = Buffer.alloc(height * (1 + width * 4));

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type: None

    for (let x = 0; x < width; x++) {
      const dx = x - 256;
      const dy = y - 256;
      const distSq = dx * dx + dy * dy;

      // Outer rounded rect border
      const isCorner = (x < 64 || x > 448) && (y < 64 || y > 448);
      const inCanvas = !isCorner || Math.hypot(Math.min(Math.abs(x - 64), Math.abs(x - 448)), Math.min(Math.abs(y - 64), Math.abs(y - 448))) < 64;

      // Shield region
      const inShield = y > 90 && y < 430 && Math.abs(dx) < 180 * (1 - Math.max(0, y - 240) / 220);

      // Play triangle region
      const inPlay = x > 210 && x < 330 && Math.abs(dy) < (x - 210) * 0.7;

      if (inPlay) {
        // Pure White Play Button
        rawData[offset++] = 255;
        rawData[offset++] = 255;
        rawData[offset++] = 255;
        rawData[offset++] = 255;
      } else if (inShield) {
        // Vibrant Orange Gradient Shield (#ea580c -> #f97316)
        const factor = y / 512;
        rawData[offset++] = Math.round(234 + factor * 15);
        rawData[offset++] = Math.round(88 + factor * 27);
        rawData[offset++] = Math.round(12 + factor * 10);
        rawData[offset++] = 255;
      } else if (inCanvas) {
        // Dark Slate Background (#0f172a)
        rawData[offset++] = 15;
        rawData[offset++] = 23;
        rawData[offset++] = 42;
        rawData[offset++] = 255;
      } else {
        // Transparent outside rounded icon
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  const pngBuffer = Buffer.concat([pngSig, ihdrChunk, idatChunk, iendChunk]);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, pngBuffer);
  console.log(`Generated 512x512 PNG icon at ${filePath} (${pngBuffer.length} bytes)`);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = calculateCrc(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// CRC32 implementation
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function calculateCrc(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

generateFonixPng(path.join(__dirname, 'assets', 'icon.png'));
