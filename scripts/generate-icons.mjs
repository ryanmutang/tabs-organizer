import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deflateSync } from "node:zlib";

const ICONS = [
  ["icons/icon16.png", 16],
  ["icons/icon32.png", 32],
  ["icons/icon48.png", 48],
  ["icons/icon128.png", 128],
];

const SAMPLE_SCALE = 4;

for (const [filePath, size] of ICONS) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, createIconPng(size));
}

console.log(`Generated ${ICONS.length} icon files.`);

function createIconPng(size) {
  const highSize = size * SAMPLE_SCALE;
  const highPixels = Buffer.alloc(highSize * highSize * 4);

  drawIcon(highPixels, highSize);
  return encodePng(size, size, downsample(highPixels, highSize, SAMPLE_SCALE));
}

function drawIcon(pixels, size) {
  const radius = size * 0.22;

  drawRoundedRect(pixels, size, {
    x: 0,
    y: 0,
    width: size,
    height: size,
    radius,
    fill: (x, y) => {
      const t = (x + y) / (size * 2);
      return mixColor([28, 111, 235, 255], [38, 78, 190, 255], t);
    },
  });

  drawRoundedRect(pixels, size, {
    x: size * 0.16,
    y: size * 0.15,
    width: size * 0.14,
    height: size * 0.7,
    radius: size * 0.045,
    fill: [226, 238, 255, 235],
  });

  const rows = [
    { y: 0.19, width: 0.48, alpha: 255, accent: [94, 234, 212, 255] },
    { y: 0.39, width: 0.56, alpha: 235, accent: [255, 214, 102, 255] },
    { y: 0.59, width: 0.44, alpha: 215, accent: [255, 139, 148, 255] },
  ];

  for (const row of rows) {
    drawTabRow(pixels, size, row);
  }

  drawLinkMark(pixels, size);
}

function drawTabRow(pixels, size, row) {
  const x = size * 0.36;
  const y = size * row.y;
  const height = size * 0.13;
  const width = size * row.width;

  drawRoundedRect(pixels, size, {
    x,
    y,
    width,
    height,
    radius: height * 0.45,
    fill: [255, 255, 255, row.alpha],
  });

  drawRoundedRect(pixels, size, {
    x: x + height * 0.28,
    y: y + height * 0.28,
    width: height * 0.44,
    height: height * 0.44,
    radius: height * 0.22,
    fill: row.accent,
  });
}

function drawLinkMark(pixels, size) {
  const centerX = size * 0.68;
  const centerY = size * 0.77;
  const radius = size * 0.09;

  drawCircle(pixels, size, centerX - radius * 0.62, centerY, radius, [
    255,
    255,
    255,
    245,
  ]);
  drawCircle(pixels, size, centerX + radius * 0.62, centerY, radius, [
    255,
    255,
    255,
    245,
  ]);
  drawCircle(pixels, size, centerX - radius * 0.62, centerY, radius * 0.52, [
    34,
    92,
    205,
    255,
  ]);
  drawCircle(pixels, size, centerX + radius * 0.62, centerY, radius * 0.52, [
    34,
    92,
    205,
    255,
  ]);
  drawRoundedRect(pixels, size, {
    x: centerX - radius * 0.78,
    y: centerY - radius * 0.28,
    width: radius * 1.56,
    height: radius * 0.56,
    radius: radius * 0.28,
    fill: [255, 255, 255, 245],
  });
}

function drawRoundedRect(pixels, canvasSize, rect) {
  const minX = Math.max(0, Math.floor(rect.x));
  const minY = Math.max(0, Math.floor(rect.y));
  const maxX = Math.min(canvasSize, Math.ceil(rect.x + rect.width));
  const maxY = Math.min(canvasSize, Math.ceil(rect.y + rect.height));

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      if (!isInsideRoundedRect(x + 0.5, y + 0.5, rect)) {
        continue;
      }

      const color =
        typeof rect.fill === "function" ? rect.fill(x, y) : rect.fill;
      blendPixel(pixels, canvasSize, x, y, color);
    }
  }
}

function drawCircle(pixels, canvasSize, centerX, centerY, radius, color) {
  const minX = Math.max(0, Math.floor(centerX - radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxX = Math.min(canvasSize, Math.ceil(centerX + radius));
  const maxY = Math.min(canvasSize, Math.ceil(centerY + radius));
  const radiusSq = radius * radius;

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const dx = x + 0.5 - centerX;
      const dy = y + 0.5 - centerY;

      if (dx * dx + dy * dy <= radiusSq) {
        blendPixel(pixels, canvasSize, x, y, color);
      }
    }
  }
}

function isInsideRoundedRect(x, y, rect) {
  const maxX = rect.x + rect.width;
  const maxY = rect.y + rect.height;
  const cornerX = clamp(x, rect.x + rect.radius, maxX - rect.radius);
  const cornerY = clamp(y, rect.y + rect.radius, maxY - rect.radius);
  const dx = x - cornerX;
  const dy = y - cornerY;
  return dx * dx + dy * dy <= rect.radius * rect.radius;
}

function blendPixel(pixels, size, x, y, color) {
  const index = (y * size + x) * 4;
  const sourceAlpha = color[3] / 255;
  const targetAlpha = pixels[index + 3] / 255;
  const outAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);

  if (outAlpha === 0) {
    return;
  }

  for (let channel = 0; channel < 3; channel += 1) {
    const source = color[channel] * sourceAlpha;
    const target = pixels[index + channel] * targetAlpha * (1 - sourceAlpha);
    pixels[index + channel] = Math.round((source + target) / outAlpha);
  }

  pixels[index + 3] = Math.round(outAlpha * 255);
}

function downsample(source, highSize, scale) {
  const size = highSize / scale;
  const output = Buffer.alloc(size * size * 4);
  const samples = scale * scale;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];

      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const index = ((y * scale + sy) * highSize + x * scale + sx) * 4;
          totals[0] += source[index];
          totals[1] += source[index + 1];
          totals[2] += source[index + 2];
          totals[3] += source[index + 3];
        }
      }

      const outputIndex = (y * size + x) * 4;
      output[outputIndex] = Math.round(totals[0] / samples);
      output[outputIndex + 1] = Math.round(totals[1] / samples);
      output[outputIndex + 2] = Math.round(totals[2] / samples);
      output[outputIndex + 3] = Math.round(totals[3] / samples);
    }
  }

  return output;
}

function mixColor(from, to, amount) {
  return [
    Math.round(from[0] + (to[0] - from[0]) * amount),
    Math.round(from[1] + (to[1] - from[1]) * amount),
    Math.round(from[2] + (to[2] - from[2]) * amount),
    Math.round(from[3] + (to[3] - from[3]) * amount),
  ];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const raw = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (width * 4 + 1);
    const rgbaOffset = y * width * 4;
    raw[rawOffset] = 0;
    rgba.copy(raw, rawOffset + 1, rgbaOffset, rgbaOffset + width * 4);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", createIhdr(width, height)),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createIhdr(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return ihdr;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}
