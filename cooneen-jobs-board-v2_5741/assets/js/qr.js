/*
 * qr.js - QR Code (ISO/IEC 18004, Model 2) byte-mode encoder.
 *
 * An original, dependency-free implementation written from the ISO/IEC 18004
 * specification. It encodes the UTF-8 bytes of a string in byte mode, for
 * versions 1-40 and error-correction levels L/M/Q/H, and returns the module
 * matrix (no quiet zone). It touches no DOM and no Node-only APIs; the only
 * runtime facility it needs is TextEncoder (browsers, Node >= 11).
 *
 * Pipeline (clause numbers refer to ISO/IEC 18004):
 *   1. Data encoding        - mode indicator 0100, character count (8 bits for
 *                             versions 1-9, 16 bits for 10-40), data bytes,
 *                             terminator, byte alignment, pad bytes 0xEC/0x11.
 *   2. Error correction     - Reed-Solomon over GF(256), primitive polynomial
 *                             0x11D, split into blocks per Table 9, then the
 *                             data and EC codewords are interleaved.
 *   3. Module placement     - finder/separator, timing, alignment, format and
 *                             version areas, dark module, then the codeword
 *                             bits in the two-column zig-zag (+ remainder bits).
 *   4. Masking              - all 8 patterns are applied, scored with the four
 *                             penalty rules (N1..N4) and the lowest score wins.
 *   5. Format / version info- BCH(15,5) with XOR mask 0x5412, BCH(18,6).
 *
 * Public API:
 *   encodeQR(text, { ecl, minVersion, maxVersion }) -> { version, ecl, mask, size, modules }
 *   qrToPath(qr, border)                            -> { size, d }
 *   qrCapacity(version, ecl)                        -> max byte-mode bytes
 */

// ---------------------------------------------------------------------------
// Tables (ISO/IEC 18004 Table 9). Index 0 of every array is version 1.
// ---------------------------------------------------------------------------

const ECL_INDEX = { L: 0, M: 1, Q: 2, H: 3 };

// Two-bit error-correction-level indicator used in the format information.
const ECL_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

// Error-correction codewords in EACH block, per level (L, M, Q, H).
const EC_CODEWORDS_PER_BLOCK = [
  [7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
    28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
    26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30,
    28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28,
    30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

// Total number of Reed-Solomon blocks, per level (L, M, Q, H).
const NUM_BLOCKS = [
  [1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
    8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
    17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
    23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
    25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

// ---------------------------------------------------------------------------
// Argument helpers
// ---------------------------------------------------------------------------

function checkEcl(ecl) {
  if (typeof ecl !== 'string' || !Object.prototype.hasOwnProperty.call(ECL_INDEX, ecl)) {
    throw new RangeError("ecl must be one of 'L', 'M', 'Q', 'H'");
  }
  return ECL_INDEX[ecl];
}

function checkVersion(v, name) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 40) {
    throw new RangeError(name + ' must be an integer from 1 to 40');
  }
  return v;
}

// ---------------------------------------------------------------------------
// Capacity maths
// ---------------------------------------------------------------------------

// Number of modules available for data + EC codewords + remainder bits
// (everything that is not a function pattern or format/version area).
function rawDataModules(version) {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (version >= 7) n -= 36; // two 3x6 version-information blocks
  }
  return n;
}

// Total codewords (data + EC) in a symbol of this version.
function totalCodewords(version) {
  return rawDataModules(version) >> 3;
}

// Data codewords available at a version / level (levelIdx 0..3).
function dataCodewords(version, levelIdx) {
  return totalCodewords(version) -
    EC_CODEWORDS_PER_BLOCK[levelIdx][version - 1] * NUM_BLOCKS[levelIdx][version - 1];
}

// Bits in the character-count field for byte mode.
function countBits(version) {
  return version <= 9 ? 8 : 16;
}

// Maximum number of BYTES that fit in byte mode at version/ecl.
export function qrCapacity(version, ecl) {
  checkVersion(version, 'version');
  const level = checkEcl(ecl);
  // 4-bit mode indicator + character count precede the payload.
  const payloadBits = dataCodewords(version, level) * 8 - 4 - countBits(version);
  return payloadBits < 0 ? 0 : payloadBits >> 3;
}

// ---------------------------------------------------------------------------
// Reed-Solomon over GF(256), x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
// ---------------------------------------------------------------------------

const GF_EXP = new Uint8Array(512); // doubled so a log sum needs no modulo
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

const generatorCache = [];

// Coefficients of prod_{i=0}^{degree-1} (x - alpha^i), highest power first,
// with the leading coefficient (always 1) omitted.
function rsGenerator(degree) {
  if (generatorCache[degree]) return generatorCache[degree];
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];                          // * x
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);    // * alpha^i
    }
    poly = next;
  }
  generatorCache[degree] = poly.subarray(1);
  return generatorCache[degree];
}

// Remainder of data[start .. start+len) * x^ecLen divided by the generator.
function rsRemainder(data, start, len, ecLen) {
  const gen = rsGenerator(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let k = 0; k < len; k++) {
    const factor = data[start + k] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) rem[j] ^= gfMul(gen[j], factor);
    }
  }
  return rem;
}

// ---------------------------------------------------------------------------
// Data encoding and block interleaving
// ---------------------------------------------------------------------------

// Builds the data codeword sequence for byte mode (before error correction).
function buildDataCodewords(bytes, version, capacityCw) {
  const out = new Uint8Array(capacityCw); // zero filled, so "append 0 bits" is free
  let pos = 0; // bit position
  const put = function (value, len) {
    for (let i = len - 1; i >= 0; i--) {
      if ((value >>> i) & 1) out[pos >> 3] |= 0x80 >> (pos & 7);
      pos++;
    }
  };
  put(0x4, 4);                         // mode indicator: byte mode = 0100
  put(bytes.length, countBits(version));
  for (let i = 0; i < bytes.length; i++) put(bytes[i], 8);
  // Terminator: up to four 0 bits, fewer if the symbol is nearly full.
  pos += Math.min(4, capacityCw * 8 - pos);
  pos = (pos + 7) & ~7;                // pad with 0 bits to a byte boundary
  // Pad codewords alternate 11101100 (0xEC) and 00010001 (0x11).
  for (let i = pos >> 3, pad = 0xEC; i < capacityCw; i++, pad ^= 0xEC ^ 0x11) out[i] = pad;
  return out;
}

// Splits data into blocks, appends EC codewords and interleaves everything.
function buildCodewordStream(data, version, levelIdx) {
  const total = totalCodewords(version);
  const numBlocks = NUM_BLOCKS[levelIdx][version - 1];
  const ecLen = EC_CODEWORDS_PER_BLOCK[levelIdx][version - 1];
  const shortBlocks = numBlocks - (total % numBlocks); // blocks with one fewer data codeword
  const shortDataLen = Math.floor(total / numBlocks) - ecLen;

  const starts = [];
  const lens = [];
  const ecs = [];
  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const len = shortDataLen + (b < shortBlocks ? 0 : 1); // short blocks first, then long
    starts.push(offset);
    lens.push(len);
    ecs.push(rsRemainder(data, offset, len, ecLen));
    offset += len;
  }

  const stream = new Uint8Array(total);
  let n = 0;
  for (let i = 0; i <= shortDataLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < lens[b]) stream[n++] = data[starts[b] + i];
    }
  }
  for (let i = 0; i < ecLen; i++) {
    for (let b = 0; b < numBlocks; b++) stream[n++] = ecs[b][i];
  }
  return stream;
}

// ---------------------------------------------------------------------------
// Function patterns
// ---------------------------------------------------------------------------

// Row/column coordinates of alignment-pattern centres (Annex E).
function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = 17 + 4 * version;
  // Even spacing between the first (6) and last (size-7) centres; version 32 is
  // the one irregular case defined by the standard.
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let k = 0; k < count - 1; k++) positions.splice(1, 0, size - 7 - k * step);
  return positions;
}

// 18-bit version information: 6 version bits + 12 BCH(18,6) check bits.
function versionInfoBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
  return (version << 12) | rem;
}

// 15-bit format information: 2 EC bits + 3 mask bits + 10 BCH(15,5) bits, XOR 0x5412.
function formatInfoBits(ecl, mask) {
  const data = (ECL_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

const templateCache = [];

// Per-version template: the module grid with all function patterns drawn
// (format area reserved but blank) plus a mask marking every function module.
function getTemplate(version) {
  if (templateCache[version]) return templateCache[version];
  const size = 17 + 4 * version;
  const mod = new Uint8Array(size * size);
  const fn = new Uint8Array(size * size);
  const setFn = function (x, y, dark) {
    mod[y * size + x] = dark ? 1 : 0;
    fn[y * size + x] = 1;
  };

  // Timing patterns (row 6 and column 6), dark on even indices.
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  // Finder patterns with their one-module separators (a 9x9 area around the
  // centre, clipped to the symbol): Chebyshev distance 2 and 4 are light.
  const finderCentres = [[3, 3], [size - 4, 3], [3, size - 4]];
  for (let f = 0; f < 3; f++) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = finderCentres[f][0] + dx;
        const y = finderCentres[f][1] + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(x, y, dist !== 2 && dist !== 4);
      }
    }
  }

  // Alignment patterns, skipping the three that would collide with finders.
  const ap = alignmentPositions(version);
  for (let i = 0; i < ap.length; i++) {
    for (let j = 0; j < ap.length; j++) {
      const lastIdx = ap.length - 1;
      if ((i === 0 && j === 0) || (i === 0 && j === lastIdx) || (i === lastIdx && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFn(ap[j] + dx, ap[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve the format information areas (filled in per mask).
  for (let i = 0; i <= 5; i++) setFn(8, i, false);
  setFn(8, 7, false);
  setFn(8, 8, false);
  setFn(7, 8, false);
  for (let i = 9; i < 15; i++) setFn(14 - i, 8, false);
  for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, false);
  for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, false);
  setFn(8, size - 8, true); // the always-dark module

  // Version information (versions 7+): two 6x3 blocks, bit i at
  // (size-11 + i%3, floor(i/3)) and mirrored across the diagonal.
  if (version >= 7) {
    const bits = versionInfoBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(a, b, dark);
      setFn(b, a, dark);
    }
  }

  // Self-check: what is left must equal the arithmetic capacity.
  let free = 0;
  for (let i = 0; i < fn.length; i++) if (!fn[i]) free++;
  if (free !== rawDataModules(version)) throw new Error('internal error: module count mismatch');

  templateCache[version] = { size: size, mod: mod, fn: fn };
  return templateCache[version];
}

// Places codeword bits in the standard zig-zag: two-module-wide columns from
// the right edge, alternating up/down, skipping the vertical timing column.
// Any modules left over after the last bit are the "remainder bits" (light).
function placeCodewords(mod, fn, size, stream) {
  const totalBits = stream.length * 8;
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let v = 0; v < size; v++) {
      const y = upward ? size - 1 - v : v;
      for (let j = 0; j < 2; j++) {
        const i = y * size + right - j;
        if (!fn[i] && bit < totalBits) {
          mod[i] = (stream[bit >> 3] >> (7 - (bit & 7))) & 1;
          bit++;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Masking and scoring
// ---------------------------------------------------------------------------

// dst = src with mask pattern `mask` XORed onto every non-function module.
function applyMask(dst, src, fn, size, mask) {
  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const i = row + x;
      let v = src[i];
      if (fn[i] === 0) {
        let flip;
        switch (mask) {
          case 0: flip = ((y + x) & 1) === 0; break;
          case 1: flip = (y & 1) === 0; break;
          case 2: flip = x % 3 === 0; break;
          case 3: flip = (y + x) % 3 === 0; break;
          case 4: flip = (((y >> 1) + Math.floor(x / 3)) & 1) === 0; break;
          case 5: flip = ((y * x) % 2) + ((y * x) % 3) === 0; break;
          case 6: flip = ((((y * x) % 2) + ((y * x) % 3)) & 1) === 0; break;
          default: flip = ((((y + x) % 2) + ((y * x) % 3)) & 1) === 0; break;
        }
        if (flip) v ^= 1;
      }
      dst[i] = v;
    }
  }
}

// Writes both copies of the 15-bit format information into the grid.
function drawFormat(m, size, ecl, mask) {
  const bits = formatInfoBits(ecl, mask);
  const bit = function (i) { return (bits >>> i) & 1; };
  // Copy 1: around the top-left finder.
  for (let i = 0; i <= 5; i++) m[i * size + 8] = bit(i);
  m[7 * size + 8] = bit(6);
  m[8 * size + 8] = bit(7);
  m[8 * size + 7] = bit(8);
  for (let i = 9; i < 15; i++) m[8 * size + (14 - i)] = bit(i);
  // Copy 2: below the top-right finder and right of the bottom-left finder.
  for (let i = 0; i < 8; i++) m[8 * size + (size - 1 - i)] = bit(i);
  for (let i = 8; i < 15; i++) m[(size - 15 + i) * size + 8] = bit(i);
  m[(size - 8) * size + 8] = 1; // dark module
}

// Penalty score per 7.8.3: N1 runs (3 + extra), N2 2x2 blocks (3), N3 finder-
// like 1:1:3:1:1 patterns with 4 light modules on one side (40), N4 dark balance (10/step).
function penaltyScore(m, size) {
  let score = 0;
  let dark = 0;

  // Rows (dir 0) and columns (dir 1): N1 and N3.
  for (let dir = 0; dir < 2; dir++) {
    for (let a = 0; a < size; a++) {
      let run = 0;
      let prev = -1;
      let window = 0;
      for (let b = 0; b < size; b++) {
        const v = dir === 0 ? m[a * size + b] : m[b * size + a];
        if (v === prev) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          run = 1;
          prev = v;
        }
        // 11-module window: 10111010000 (0x5D0) or 00001011101 (0x05D).
        window = ((window << 1) | v) & 0x7FF;
        if (b >= 10 && (window === 0x5D0 || window === 0x05D)) score += 40;
      }
    }
  }

  // N2 (2x2 blocks of one colour) and the dark-module count for N4.
  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const v = m[row + x];
      dark += v;
      if (x + 1 < size && y + 1 < size &&
          v === m[row + x + 1] && v === m[row + size + x] && v === m[row + size + x + 1]) {
        score += 3;
      }
    }
  }

  // N4: 10 points per full 5% the dark proportion deviates from 50%.
  const total = size * size;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return score;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function encodeQR(text, options) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (options !== undefined && options !== null && typeof options !== 'object') {
    throw new TypeError('options must be an object');
  }
  const opts = options || {};
  const ecl = opts.ecl === undefined ? 'M' : opts.ecl;
  const levelIdx = checkEcl(ecl);
  const minVersion = opts.minVersion === undefined ? 1 : checkVersion(opts.minVersion, 'minVersion');
  const maxVersion = opts.maxVersion === undefined ? 40 : checkVersion(opts.maxVersion, 'maxVersion');
  if (minVersion > maxVersion) throw new RangeError('minVersion must not exceed maxVersion');

  const bytes = new TextEncoder().encode(text);

  // Smallest version in range whose byte-mode capacity holds the data at this level.
  let version = minVersion;
  while (version <= maxVersion && qrCapacity(version, ecl) < bytes.length) version++;
  if (version > maxVersion) {
    throw new RangeError('Data too long: ' + bytes.length + ' bytes does not fit in version ' +
      maxVersion + ' at ECL ' + ecl + ' (capacity ' + qrCapacity(maxVersion, ecl) + ' bytes)');
  }

  const data = buildDataCodewords(bytes, version, dataCodewords(version, levelIdx));
  const stream = buildCodewordStream(data, version, levelIdx);

  const tpl = getTemplate(version);
  const size = tpl.size;
  const base = tpl.mod.slice();
  placeCodewords(base, tpl.fn, size, stream);

  // Try all eight masks; keep the one with the lowest penalty (ties: lowest index).
  const work = new Uint8Array(size * size);
  const best = new Uint8Array(size * size);
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(work, base, tpl.fn, size, mask);
    drawFormat(work, size, ecl, mask);
    const score = penaltyScore(work, size);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      best.set(work);
    }
  }

  return { version: version, ecl: ecl, mask: bestMask, size: size, modules: best };
}

export function qrToPath(qr, border) {
  if (!qr || typeof qr.size !== 'number' || !qr.modules) {
    throw new TypeError('qr must be a result of encodeQR()');
  }
  const b = border === undefined || border === null ? 4 : border;
  if (typeof b !== 'number' || !Number.isInteger(b) || b < 0) {
    throw new RangeError('border must be a non-negative integer');
  }
  const size = qr.size;
  const m = qr.modules;
  const parts = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (m[y * size + x] === 0) { x++; continue; }
      const start = x;
      while (x < size && m[y * size + x] !== 0) x++;
      const w = x - start;
      parts.push('M' + (start + b) + ' ' + (y + b) + 'h' + w + 'v1h-' + w + 'z');
    }
  }
  return { size: size + 2 * b, d: parts.join('') };
}
