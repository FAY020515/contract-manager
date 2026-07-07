// 生成合同管理系统托盘图标（16x16 蓝色方块）
const fs = require('fs');
const zlib = require('zlib');

const size = 16;
const width = size;
const height = size;

// PNG 签名
const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// IHDR chunk
const ihdrData = Buffer.alloc(13);
ihdrData.writeUInt32BE(width, 0);
ihdrData.writeUInt32BE(height, 4);
ihdrData[8] = 8;  // bit depth
ihdrData[9] = 2;  // color type: RGB
ihdrData[10] = 0; // compression
ihdrData[11] = 0; // filter
ihdrData[12] = 0; // interlace

const ihdrType = Buffer.from('IHDR');
const ihdrCrc = crc32(Buffer.concat([ihdrType, ihdrData]));
const ihdrLength = Buffer.alloc(4);
ihdrLength.writeUInt32BE(ihdrData.length, 0);
const ihdrChunk = Buffer.concat([ihdrLength, ihdrType, ihdrData, ihdrCrc]);

// IDAT chunk - 图像数据
const rawData = Buffer.alloc(height * (width * 3 + 1));
for (let y = 0; y < height; y++) {
  rawData[y * (width * 3 + 1)] = 0; // filter byte: None
  for (let x = 0; x < width; x++) {
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    // 蓝色 #1677FF
    rawData[offset] = 22;     // R
    rawData[offset + 1] = 119; // G
    rawData[offset + 2] = 255; // B
  }
}

const compressed = zlib.deflateSync(rawData);
const idatType = Buffer.from('IDAT');
const idatCrc = crc32(Buffer.concat([idatType, compressed]));
const idatLength = Buffer.alloc(4);
idatLength.writeUInt32BE(compressed.length, 0);
const idatChunk = Buffer.concat([idatLength, idatType, compressed, idatCrc]);

// IEND chunk
const iendType = Buffer.from('IEND');
const iendCrc = crc32(iendType);
const iendLength = Buffer.alloc(4);
iendLength.writeUInt32BE(0, 0);
const iendChunk = Buffer.concat([iendLength, iendType, iendCrc]);

const png = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
fs.writeFileSync(__dirname + '/tray-icon.png', png);
console.log('托盘图标已生成: tray-icon.png (' + png.length + ' bytes)');

// CRC32 实现
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = makeCrcTable();
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  const result = Buffer.alloc(4);
  result.writeUInt32BE(crc ^ 0xFFFFFFFF, 0);
  return result;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
}
