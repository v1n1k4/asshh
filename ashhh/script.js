(() => {
  'use strict';

  // --- Timing Constants (faithful to te_amo.py) ---
  const T_ENV_IN = 1.6;
  const T_CUR0 = 1.9;
  const T_CUR1 = 4.1;
  const T_CLICK = 4.55;
  const T_BURN = T_CLICK + 0.12;
  const T_SPREAD = 3.4;
  const T_R0 = T_BURN + 2.3;
  const T_FORM = 3.8;
  const T_GLOW = T_R0 + 1.8;
  const T_FIRE_END = T_BURN + T_SPREAD + 2.2;
  const D2R = Math.PI / 180;

  // --- Grid Dimensions (High-detail character grid) ---
  const ROWS = 54;
  const COLS = 98;

  // --- Helper Math Functions ---
  const clamp = (v, lo = 0.0, hi = 1.0) => (v < lo ? lo : v > hi ? hi : v);
  const ease = (t) => {
    const c = clamp(t);
    return c * c * (3 - 2 * c);
  };
  const mix = (a, b, k) => [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
  const sc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  // Deterministic PRNG (Seeded)
  function createRNG(seed) {
    let s = seed >>> 0;
    return {
      random() {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      uniform(a, b) {
        return a + (b - a) * this.random();
      },
      randrange(n) {
        return Math.floor(this.random() * n);
      },
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = this.randrange(i + 1);
          const tmp = arr[i];
          arr[i] = arr[j];
          arr[j] = tmp;
        }
      },
    };
  }

  const rng = createRNG(21);

  // Quantized color hex cache (matches te_amo.py LV = 40)
  const LV = 48;
  const hexCache = new Map();
  function hexc(c) {
    const r = Math.floor(clamp(c[0]) * (LV - 0.01));
    const g = Math.floor(clamp(c[1]) * (LV - 0.01));
    const b = Math.floor(clamp(c[2]) * (LV - 0.01));
    const key = (r << 16) | (g << 8) | b;
    let s = hexCache.get(key);
    if (!s) {
      const rr = Math.round((r * 255) / (LV - 1)).toString(16).padStart(2, '0');
      const gg = Math.round((g * 255) / (LV - 1)).toString(16).padStart(2, '0');
      const bb = Math.round((b * 255) / (LV - 1)).toString(16).padStart(2, '0');
      s = `#${rr}${gg}${bb}`;
      hexCache.set(key, s);
    }
    return s;
  }

  // Value Noise & Harmonic Noise
  const _P = Array.from({ length: 256 }, (_, i) => i);
  rng.shuffle(_P);
  const _N = Array.from({ length: 256 }, () => rng.uniform(-1, 1));

  function vn(x, y) {
    let xi = Math.floor(x);
    let yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    xi &= 255;
    yi &= 255;
    const x1 = (xi + 1) & 255;
    const y1 = (yi + 1) & 255;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = _N[_P[(_P[xi] + yi) & 255]];
    const b = _N[_P[(_P[x1] + yi) & 255]];
    const c = _N[_P[(_P[xi] + y1) & 255]];
    const d = _N[_P[(_P[x1] + y1) & 255]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  function nz(t, a = 1.0) {
    return (
      (Math.sin(t * 2.1 * a) +
        0.7 * Math.sin(t * 3.3 * a + 1.7) +
        0.4 * Math.sin(t * 5.7 * a + 0.6)) /
      2.1
    );
  }

  // Static cell hashes
  const HS = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => rng.random())
  );
  const HS2 = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => rng.random())
  );

  // Color Ramp Builder
  function rampLut(stops, n = 64) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = i / (n - 1);
      for (let k = 0; k < stops.length - 1; k++) {
        const [a, ca] = stops[k];
        const [b, cb] = stops[k + 1];
        if (v <= b + 1e-7) {
          out.push(mix(ca, cb, (v - a) / (b - a)));
          break;
        }
      }
    }
    return out;
  }

  // Oriental Fire LUT (Deep Crimson -> Vermilion -> Gold -> Ivory)
  const FIRE = [
    [0.00, [0.32, 0.01, 0.01]],
    [0.18, [0.82, 0.05, 0.02]],
    [0.38, [1.00, 0.22, 0.03]],
    [0.60, [1.00, 0.54, 0.06]],
    [0.80, [1.00, 0.82, 0.28]],
    [1.00, [1.00, 0.98, 0.84]],
  ];
  const LUT = rampLut(FIRE);

  // Red Spider Lily (Higanbana) LUT — Deep Sumi-Crimson to Radiant Scarlet-Vermilion
  const REDS = [
    [0.00, [0.12, 0.00, 0.02]],
    [0.20, [0.38, 0.01, 0.04]],
    [0.44, [0.72, 0.03, 0.07]],
    [0.68, [0.95, 0.08, 0.12]],
    [0.86, [1.00, 0.24, 0.20]],
    [1.00, [1.00, 0.62, 0.48]],
  ];
  const RLUT = rampLut(REDS);

  // Oriental Crimson & Harvest Moon Gold Aura LUT (replaces cold blue background)
  const AURA_STOPS = [
    [0.00, [0.05, 0.01, 0.02]],
    [0.26, [0.28, 0.02, 0.05]],
    [0.52, [0.68, 0.10, 0.11]],
    [0.78, [0.96, 0.46, 0.20]],
    [1.00, [1.00, 0.90, 0.68]],
  ];
  const AURA_LUT = rampLut(AURA_STOPS);

  const BG = [0.028, 0.008, 0.018];
  const RCH = '-=+*#%&@8';
  const SMOKE_C = [0.54, 0.44, 0.42];

  // --- Virtual Coordinate System (Consistent physics across screen sizes) ---
  const CW = 8.0;
  const CH = 14.0;
  const W = COLS * CW;
  const H = ROWS * CH;
  const S = H / 640.0;
  const CX = W / 2.0;

  // --- Oriental Washi Envelope Geometry ---
  const EW = 0.74 * W;
  const EH = 0.70 * EW;
  const ECY = 0.56 * H;
  const EX0 = CX - EW / 2;
  const EX1 = CX + EW / 2;
  const EY0 = ECY - EH / 2;
  const EY1 = ECY + EH / 2;
  const FLAP_H = 0.50 * EH;
  const TIPY = EY0 + FLAP_H;
  const HR = 0.064 * H;
  const HCY = TIPY - 0.25 * HR;
  const XPL = CX - 0.17 * EW;
  const XPR = CX + 0.17 * EW;
  const YPL = EY0 + FLAP_H * (1 - (0.17 * EW) / (EW / 2));
  const IGX = CX;
  const IGY = HCY;

  // Pixel-font "FOR YOU" on the Washi Envelope
  const GLYPH = {
    F: ['###', '#..', '##.', '#..', '#..'],
    O: ['###', '#.#', '#.#', '#.#', '###'],
    R: ['##.', '#.#', '##.', '#.#', '#.#'],
    Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
    U: ['#.#', '#.#', '#.#', '#.#', '###'],
    ' ': ['...', '...', '...', '...', '...'],
  };
  const TEXT_STR = 'FOR YOU';
  const TXT = ['', '', '', '', ''];
  for (let i = 0; i < TEXT_STR.length; i++) {
    const ch = TEXT_STR[i];
    for (let k = 0; k < 5; k++) {
      TXT[k] += GLYPH[ch][k] + (i < TEXT_STR.length - 1 ? '.' : '');
    }
  }
  const TW = TXT[0].length;
  const TC0 = Math.floor(CX / CW - TW);
  const TR0 = Math.floor((HCY + 1.25 * HR) / CH) + 2;

  function ink(r, c) {
    const px = Math.floor((c - TC0) / 2);
    const py = r - TR0;
    return c >= TC0 && px >= 0 && px < TW && py >= 0 && py < 5 && TXT[py][px] === '#';
  }

  // Washi Paper & Crimson/Gold Silk Brocade Palette
  const PAPER = '#%&@8';
  const FLAPC = [0.91, 0.81, 0.64];
  const SIDEC = [0.76, 0.64, 0.47];
  const BOTC = [0.85, 0.74, 0.56];
  const INK = [0.18, 0.06, 0.05];
  const INKT = [0.26, 0.06, 0.05];
  // Oriental Crimson-Gold-Lacquer Silk Border instead of Western airmail stripes
  const BROCADE = [
    [0.78, 0.12, 0.14], // Vermilion silk
    [0.92, 0.74, 0.32], // Imperial Gold thread
    [0.32, 0.05, 0.07], // Dark Urushi Lacquer
  ];

  function heartF(hx, hy, s) {
    const X = hx / s;
    const Y = (hy - 0.25) / s + 0.25;
    return Math.pow(X * X + Y * Y - 1, 3) - X * X * Math.pow(Y, 3);
  }

  function inSeal(x, y) {
    const hx = (x - CX) / HR;
    const hy = (HCY - y) / HR;
    return hx > -1.4 && hx < 1.4 && hy > -1.3 && hy < 1.6 && heartF(hx, hy, 1.0) <= 0;
  }

  function envStyle(r, c, x, y, hs, hs2) {
    if (x < EX0 || x > EX1 || y < EY0 || y > EY1) return null;
    const hx = (x - CX) / HR;
    const hy = (HCY - y) / HR;

    // Cinnabar-Red & Gold Oriental Wax Seal
    if (hx > -1.4 && hx < 1.4 && hy > -1.3 && hy < 1.6 && heartF(hx, hy, 1.0) <= 0) {
      const k = clamp(0.5 - 0.30 * hx + 0.28 * hy);
      if (heartF(hx, hy, 0.88) > 0) {
        return ['#', [0.86, 0.64, 0.24]]; // Gold rim around cinnabar seal
      }
      if (heartF(hx, hy, 0.68) > 0) {
        return ['&%#'[Math.floor(hs * 3) % 3], mix([0.78, 0.12, 0.14], [0.98, 0.38, 0.26], k)];
      }
      if (Math.pow(hx + 0.38, 2) + Math.pow(hy - 0.58, 2) < 0.048) {
        return ['*', [1.0, 0.92, 0.68]];
      }
      return ['@%'[hs2 > 0.80 ? 1 : 0], mix([0.64, 0.07, 0.09], [0.95, 0.26, 0.22], k)];
    }

    // Calligraphy Text "FOR YOU"
    if (ink(r, c)) return ['@', INKT];
    if (ink(r - 1, c - 1)) return ['%', [0.58, 0.42, 0.26]];

    // Mizuhiki (水引) Ceremonial Red & Gold Cord horizontal band passing through seal level
    if (Math.abs(y - HCY) < 0.52 * CH && Math.abs(x - CX) > 1.05 * HR && x > EX0 + 2 * CW && x < EX1 - 2 * CW) {
      const isGold = (c + r) % 3 === 0;
      return ['=', isGold ? [0.92, 0.74, 0.30] : [0.78, 0.12, 0.14]];
    }

    const fh = FLAP_H * (1 - Math.abs(x - CX) / (EW / 2));
    const dfl = EY0 + fh - y;
    if (Math.abs(dfl) < 0.45 * CH) {
      return [x < CX ? '\\' : '/', INK];
    }

    let side = false;
    if (dfl < 0) {
      if (x <= XPL) {
        const yl = EY1 + ((YPL - EY1) * (x - EX0)) / (XPL - EX0);
        if (Math.abs(y - yl) < 0.45 * CH) return ['/', INK];
        side = y < yl;
      } else if (x >= XPR) {
        const yr = YPL + ((EY1 - YPL) * (x - XPR)) / (EX1 - XPR);
        if (Math.abs(y - yr) < 0.45 * CH) return ['\\', INK];
        side = y < yr;
      }
    }

    // Oriental Silk Brocade Border
    if (x < EX0 + 1.4 * CW || x > EX1 - 1.4 * CW || y < EY0 + 0.95 * CH || y > EY1 - 0.95 * CH) {
      const pat = ((c + r) % 6) >> 1;
      const bch = (c + r) % 2 === 0 ? '+' : '*';
      return [bch, BROCADE[pat]];
    }

    const base = dfl >= 0 ? FLAPC : side ? SIDEC : BOTC;
    let k = (1.05 - (0.18 * (y - EY0)) / EH) * (0.90 + 0.20 * hs2);
    if (dfl < 0 && dfl > -1.4 * CH) {
      k *= 0.74 + (0.20 * -dfl) / (1.4 * CH);
    } else if (dfl > 0.45 * CH && dfl < 1.4 * CH) {
      k *= 1.06;
    }
    const ch = PAPER[Math.floor(hs * PAPER.length) % PAPER.length];
    return [ch, [base[0] * k, base[1] * k, base[2] * k]];
  }

  // Precompute Envelope & Shadow Cells
  const rawEnv = [];
  const SHD = [];
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) * CH;
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5) * CW;
      const s = envStyle(r, c, x, y, HS[r][c], HS2[r][c]);
      if (s !== null) {
        rawEnv.push([r, c, s[0], s[1], x, y]);
      } else if (
        x >= EX0 + 0.9 * CW &&
        x <= EX1 + 1.8 * CW &&
        y >= EY0 + 0.8 * CH &&
        y <= EY1 + 2.0 * CH
      ) {
        SHD.push([r, c, x, y]);
      }
    }
  }

  let MAXD = 1;
  for (const e of rawEnv) {
    const d = Math.hypot(e[4] - IGX, e[5] - IGY);
    if (d > MAXD) MAXD = d;
  }

  const ENVC = [];
  const SEALC = [];
  for (const [r, c, ch, col, x, y] of rawEnv) {
    const d = Math.hypot(x - IGX, y - IGY);
    const nzv = vn(x * 0.035 + 4, y * 0.035 + 9) * 0.5 + 0.5;
    const tb =
      T_SPREAD * Math.pow(d / MAXD, 0.92) +
      0.6 * nzv * Math.min(1.0, d / (0.12 * H));
    ENVC.push([r, c, ch, col, tb, HS[r][c], HS2[r][c], x, y]);
    if (inSeal(x, y)) {
      SEALC.push(r * COLS + c);
    }
  }

  const ENV_SORTED = [...ENVC].sort((a, b) => a[4] - b[4]);
  const TBS = ENV_SORTED.map((e) => e[4]);

  const SHDC = [];
  for (const [r, c, x, y] of SHD) {
    const d = Math.hypot(x - IGX, y - IGY);
    const tb = T_SPREAD * Math.pow(d / MAXD, 0.92);
    const ex = Math.max(0.0, x - EX1, EX0 - x);
    const ey = Math.max(0.0, y - EY1, EY0 - y);
    const f = 1 - clamp(Math.hypot(ex, ey) / (2.0 * CW));
    SHDC.push([
      r,
      c,
      f > 0.45 ? ':' : '.',
      sc([0.14, 0.06, 0.06], 0.35 + 0.65 * f),
      tb,
      HS[r][c],
    ]);
  }

  const BED = [];
  const RB0 = Math.floor(EY1 / CH) + 1;
  for (const rr of [RB0, RB0 + 1]) {
    if (rr >= ROWS) continue;
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5) * CW;
      const u = 1 - Math.pow((x - CX) / (EW * 0.50), 2);
      if (u > 0.12) {
        BED.push([rr, c, Math.sqrt(u), HS[rr][c], rr === RB0]);
      }
    }
  }

  // ============================================================================
  // RED SPIDER LILY (LÍRIO-ARANHA VERMELHO / HIGANBANA / LYCORIS RADIATA)
  // ============================================================================
  const RX = CX;
  const RY = 0.355 * H;
  const RR = 0.225 * H;
  const UMB_Y = RY + 0.42 * RR;
  const STEM_Y1 = 0.91 * H;
  const TOP_Y = RY - 1.28 * RR;
  const STEM_HW = 0.88 * CW;

  const GREEN_D = [0.03, 0.15, 0.06];
  const GREEN_L = [0.16, 0.48, 0.20];
  const ANTHER_GOLD = [1.0, 0.78, 0.36];
  const ANTHER_WARM = [1.0, 0.48, 0.28];

  function stemX(y) {
    return RX + 0.015 * H * Math.sin((y - UMB_Y) / (0.19 * H));
  }

  // 7 Floret crowns forming the dense umbel cluster
  const FLORETS = [
    [-0.46, 0.08, 0.22],
    [-0.24, -0.04, 0.24],
    [0.00, -0.09, 0.25],
    [0.24, -0.04, 0.24],
    [0.46, 0.08, 0.22],
    [-0.14, 0.12, 0.22],
    [0.14, 0.12, 0.22],
  ];

  // 21 Strongly Recurved, Crinkled/Ruffled Tepals (Petals) of Lycoris radiata
  // [ax, ay, ang_deg, length_RR, width_RR, bend, wave_ph, layer]
  const TEPALS = [
    // Upper crown recurved tepals
    [0.00, -0.05, 90, 0.56, 0.105, 0.22, 0.0, 2],
    [-0.12, -0.04, 108, 0.62, 0.105, 0.34, 1.2, 2],
    [0.12, -0.04, 72, 0.62, 0.105, -0.34, 2.4, 2],
    [-0.26, 0.00, 128, 0.68, 0.110, 0.42, 0.7, 2],
    [0.26, 0.00, 52, 0.68, 0.110, -0.42, 1.9, 2],
    [-0.38, 0.05, 146, 0.72, 0.110, 0.48, 2.9, 2],
    [0.38, 0.05, 34, 0.72, 0.110, -0.48, 0.5, 2],
    // Mid lateral strongly recurved tepals (curling out & back like claws)
    [-0.44, 0.09, 166, 0.78, 0.112, 0.55, 3.1, 1],
    [0.44, 0.09, 14, 0.78, 0.112, -0.55, 0.4, 1],
    [-0.46, 0.14, 185, 0.75, 0.108, 0.52, 2.0, 1],
    [0.46, 0.14, -5, 0.75, 0.108, -0.52, 4.2, 1],
    [-0.22, 0.06, 152, 0.65, 0.102, 0.40, 5.1, 1],
    [0.22, 0.06, 28, 0.65, 0.102, -0.40, 1.5, 1],
    [-0.08, 0.04, 118, 0.58, 0.100, 0.30, 3.8, 1],
    [0.08, 0.04, 62, 0.58, 0.100, -0.30, 2.7, 1],
    // Lower reflexed tepals (curling back around the pedicels)
    [-0.36, 0.16, 206, 0.70, 0.102, 0.46, 0.9, 0],
    [0.36, 0.16, -26, 0.70, 0.102, -0.46, 2.8, 0],
    [-0.22, 0.18, 226, 0.64, 0.098, 0.38, 4.5, 0],
    [0.22, 0.18, -46, 0.64, 0.098, -0.38, 1.1, 0],
    [-0.10, 0.20, 248, 0.56, 0.095, 0.26, 3.3, 0],
    [0.10, 0.20, -68, 0.56, 0.095, -0.26, 5.4, 0],
  ].sort((a, b) => b[7] - a[7]);

  // 24 Long Sweeping Catenary Spider-Lily Stamens (Cubic Bézier arches in RR units)
  const STAMENS_DEF = [
    // Wide sweeping lateral-upper stamens (left)
    [[-0.44, 0.06], [-0.98, 0.18], [-1.45, -0.10], [-1.62, -0.56], 2],
    [[-0.40, 0.03], [-0.92, 0.02], [-1.38, -0.32], [-1.50, -0.80], 2],
    [[-0.34, 0.00], [-0.82, -0.14], [-1.24, -0.52], [-1.30, -0.98], 2],
    [[-0.26, -0.03], [-0.68, -0.28], [-1.04, -0.70], [-1.04, -1.12], 2],
    [[-0.18, -0.05], [-0.50, -0.40], [-0.78, -0.82], [-0.74, -1.20], 2],
    [[-0.10, -0.07], [-0.30, -0.48], [-0.48, -0.90], [-0.42, -1.24], 2],
    [[-0.03, -0.08], [-0.12, -0.52], [-0.18, -0.94], [-0.12, -1.26], 2],
    // Wide sweeping lateral-upper stamens (right)
    [[0.03, -0.08], [0.12, -0.52], [0.18, -0.94], [0.12, -1.26], 2],
    [[0.10, -0.07], [0.30, -0.48], [0.48, -0.90], [0.42, -1.24], 2],
    [[0.18, -0.05], [0.50, -0.40], [0.78, -0.82], [0.74, -1.20], 2],
    [[0.26, -0.03], [0.68, -0.28], [1.04, -0.70], [1.04, -1.12], 2],
    [[0.34, 0.00], [0.82, -0.14], [1.24, -0.52], [1.30, -0.98], 2],
    [[0.40, 0.03], [0.92, 0.02], [1.38, -0.32], [1.50, -0.80], 2],
    [[0.44, 0.06], [0.98, 0.18], [1.45, -0.10], [1.62, -0.56], 2],
    // Lower catenary spider-leg stamens (dipping down then curving out and up!)
    [[-0.46, 0.10], [-1.00, 0.36], [-1.48, 0.16], [-1.68, -0.26], 2],
    [[0.46, 0.10], [1.00, 0.36], [1.48, 0.16], [1.68, -0.26], 2],
    [[-0.42, 0.14], [-0.94, 0.52], [-1.38, 0.40], [-1.58, 0.04], 1],
    [[0.42, 0.14], [0.94, 0.52], [1.38, 0.40], [1.58, 0.04], 1],
    [[-0.34, 0.16], [-0.78, 0.62], [-1.18, 0.58], [-1.36, 0.28], 0],
    [[0.34, 0.16], [0.78, 0.62], [1.18, 0.58], [1.36, 0.28], 0],
    // Mid-depth foreground filaments arching out
    [[-0.28, 0.08], [-0.68, 0.16], [-1.06, -0.04], [-1.16, -0.44], 1],
    [[0.28, 0.08], [0.68, 0.16], [1.06, -0.04], [1.16, -0.44], 1],
    [[-0.14, 0.06], [-0.38, -0.08], [-0.62, -0.38], [-0.64, -0.76], 1],
    [[0.14, 0.06], [0.38, -0.08], [0.62, -0.38], [0.64, -0.76], 1],
  ];

  // Pre-sample stamen curves for fast & continuous lookup
  const STAMEN_PTS = STAMENS_DEF.map(([p0, p1, p2, p3, prio], idx) => {
    const pts = [];
    const steps = 54;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const bx =
        (u * u * u * p0[0] +
          3 * u * u * t * p1[0] +
          3 * u * t * t * p2[0] +
          t * t * t * p3[0]) *
          RR +
        RX;
      const by =
        (u * u * u * p0[1] +
          3 * u * u * t * p1[1] +
          3 * u * t * t * p2[1] +
          t * t * t * p3[1]) *
          RR +
        RY;
      const tx =
        3 * u * u * (p1[0] - p0[0]) +
        6 * u * t * (p2[0] - p1[0]) +
        3 * t * t * (p3[0] - p2[0]);
      const ty =
        3 * u * u * (p1[1] - p0[1]) +
        6 * u * t * (p2[1] - p1[1]) +
        3 * t * t * (p3[1] - p2[1]);
      pts.push({ bx, by, t, tx, ty, prio, idx });
    }
    return pts;
  });

  function tepalHit(x, y, ax, ay, ang, L, Wd, bend, wavePh) {
    const ca = Math.cos(ang * D2R);
    const sa = Math.sin(ang * D2R);
    const dx = x - ax;
    const dy = y - ay;
    const s = (dx * ca - dy * sa) / L;
    if (s < 0 || s > 1) return null;
    const ruffle = 0.032 * RR * Math.sin(s * 16.0 + wavePh) * Math.pow(s, 0.6);
    const curve = bend * L * Math.pow(s, 1.75) + ruffle;
    const v = dx * sa + dy * ca - curve;
    const w =
      Wd *
      Math.pow(Math.sin(Math.PI * Math.pow(s, 0.68)), 0.82) *
      (1 + 0.14 * Math.sin(s * 26 + wavePh));
    if (w <= 0.25 || Math.abs(v) > w) return null;
    return [s, v / w];
  }

  function stamenHit(x, y) {
    let best = null;
    let bestD = 1e9;
    for (const pts of STAMEN_PTS) {
      for (const pt of pts) {
        const isAnther = pt.t > 0.915;
        const rx = CW * (isAnther ? 0.90 : 0.56);
        const ry = CH * (isAnther ? 0.68 : 0.46);
        const d = Math.hypot((x - pt.bx) / rx, (y - pt.by) / ry);
        if (d <= 1.0 && d < bestD) {
          bestD = d;
          best = [pt.t, d, pt.tx, pt.ty, pt.prio, pt.idx];
        }
      }
    }
    return best;
  }

  function lilySample(x, y) {
    const dx = (x - RX) / RR;
    const dy = (y - RY) / RR;

    // Foreground sweeping stamens
    const st = stamenHit(x, y);
    if (st && st[4] >= 2) {
      return ['stamen', st[0], st[1], st[2], st[3], st[5]];
    }

    // Recurved ruffled tepals
    for (const [ax, ay, ang, L, Wd, bend, wph, lay] of TEPALS) {
      const h = tepalHit(
        x,
        y,
        RX + ax * RR,
        RY + ay * RR,
        ang,
        L * RR,
        Wd * RR,
        bend,
        wph
      );
      if (h) {
        return ['tepal', h[0], h[1], lay, ax];
      }
    }

    // Umbel core (floret throats cluster)
    for (const [fx, fy, fr] of FLORETS) {
      const d = Math.hypot((dx - fx) / (fr * 1.15), (dy - fy) / (fr * 0.85));
      if (d <= 1.0) {
        return ['core', d, dx - fx, dy - fy];
      }
    }

    // Mid/Background stamens
    if (st) {
      return ['stamen', st[0], st[1], st[2], st[3], st[5]];
    }

    // Pedicels connecting stem crown (UMB_Y) to each floret
    const ux = stemX(UMB_Y);
    const uy = UMB_Y;
    for (const [fx, fy] of FLORETS) {
      const tx = RX + fx * RR;
      const ty = RY + fy * RR + 0.08 * RR;
      const vx = tx - ux;
      const vy = ty - uy;
      const L2 = vx * vx + vy * vy + 1e-9;
      const s = ((x - ux) * vx + (y - uy) * vy) / L2;
      if (s >= 0 && s <= 1) {
        const px = ux + s * vx;
        const py = uy + s * vy;
        if (Math.abs(x - px) <= 0.65 * CW && Math.abs(y - py) <= 0.55 * CH) {
          return ['pedicel', s, (x - px) / (0.65 * CW)];
        }
      }
    }

    // Involucre bracts at top of stem
    if (Math.abs(y - UMB_Y) <= 0.12 * RR && Math.abs(x - ux) <= 0.16 * RR) {
      return ['bract', (x - ux) / (0.16 * RR), (y - UMB_Y) / (0.12 * RR)];
    }

    // Main naked scape (stem)
    if (y >= UMB_Y && y <= STEM_Y1) {
      const sxv = stemX(y);
      if (Math.abs(x - sxv) <= STEM_HW) {
        return ['stem', (x - sxv) / STEM_HW, y];
      }
    }

    return null;
  }

  function rch(I) {
    return RCH[Math.floor(clamp(0.20 + 0.80 * I) * (RCH.length - 0.01))];
  }

  function contrast(I) {
    return clamp(0.52 + (I - 0.45) * 1.45);
  }

  function lilyStyle(smp, hs, hs2) {
    const kind = smp[0];

    if (kind === 'stamen') {
      const [, t, d, tx, ty] = smp;
      // Golden-vermilion anther tip
      if (t > 0.915) {
        const k = clamp((t - 0.915) / 0.085);
        const col = mix(ANTHER_WARM, ANTHER_GOLD, k * (0.75 + 0.25 * hs));
        return [d < 0.55 ? '*' : 'o', col];
      }
      // Slender crimson filament sweeping outward and upward
      const ang = Math.atan2(ty, tx);
      const ca = Math.abs(Math.cos(ang));
      const sa = Math.abs(Math.sin(ang));
      const ch = ca > 0.88 ? '-' : sa > 0.88 ? '|' : tx * ty > 0 ? '\\' : '/';
      const I = clamp(0.42 + 0.48 * Math.pow(t, 0.85) + 0.12 * (1 - d) + 0.08 * hs);
      let col = RLUT[Math.floor(contrast(I) * 63)];
      if (t > 0.78) {
        col = mix(col, ANTHER_WARM, (t - 0.78) * 1.8);
      }
      return [ch, col];
    }

    if (kind === 'tepal') {
      const [, s, v, lay] = smp;
      const baseI = [0.34, 0.46, 0.58][lay] || 0.45;
      // Bright midrib & ruffled edges
      const midrib = Math.exp(-Math.pow(v * 3.2, 2));
      const edge = Math.pow(Math.abs(v), 1.6);
      let I = baseI + 0.28 * midrib + 0.22 * edge - 0.18 * Math.pow(s, 1.4);
      I = contrast(clamp(I * (0.92 + 0.16 * hs)));
      if (hs2 > 0.982 && s > 0.35) {
        return ['*', [1.0, 0.76, 0.64]];
      }
      return [rch(I), RLUT[Math.floor(I * 63)]];
    }

    if (kind === 'core') {
      const [, d, lx, ly] = smp;
      const I = contrast(clamp((0.28 + 0.42 * (1 - d) - 0.18 * ly + 0.12 * lx) * (0.9 + 0.2 * hs)));
      return [rch(I), RLUT[Math.floor(I * 63)]];
    }

    if (kind === 'pedicel') {
      const [, s, v] = smp;
      const col = mix(
        mix(GREEN_D, GREEN_L, clamp(0.6 - 0.4 * v)),
        [0.52, 0.08, 0.10],
        clamp(s * 0.75)
      );
      return [':', col];
    }

    if (kind === 'bract') {
      const [, vx] = smp;
      return ['@', mix(GREEN_D, [0.32, 0.22, 0.10], clamp(0.5 - 0.5 * vx))];
    }

    if (kind === 'stem') {
      const [, v, y] = smp;
      // Subtle stem node rings for Oriental bamboo/scape feel
      const isNode = Math.abs(((y - UMB_Y) % (0.16 * H)) - 0.08 * H) < 0.45 * CH;
      const col = mix(GREEN_D, GREEN_L, clamp(0.52 - 0.48 * v + (isNode ? 0.15 : 0)));
      return [isNode ? '=' : hs < 0.85 ? '|' : ':', col];
    }

    return ['#', RLUT[32]];
  }

  // Precompute Red Spider Lily cells & masks
  const RAWR = [];
  const ROSEMASK = new Set();
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) * CH;
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5) * CW;
      const smp = lilySample(x, y);
      if (smp !== null) {
        RAWR.push([r, c, smp, HS[r][c], HS2[r][c], x, y]);
        ROSEMASK.add(r * COLS + c);
      }
    }
  }

  const EDGE = new Set();
  const HALO = new Set();
  for (const key of ROSEMASK) {
    const r = Math.floor(key / COLS);
    const c = key % COLS;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !ROSEMASK.has(nr * COLS + nc)) {
        EDGE.add(key);
      }
    }
    for (const dr of [-1, 0, 1]) {
      for (const dc of [-1, 0, 1]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
          const q = nr * COLS + nc;
          if (!ROSEMASK.has(q)) HALO.add(q);
        }
      }
    }
  }

  const ROSEC = [];
  for (const [r, c, smp, hs, hs2, x, y] of RAWR) {
    const [ch, col] = lilyStyle(smp, hs, hs2);
    const key = clamp((y - TOP_Y) / (STEM_Y1 - TOP_Y));
    const tk = T_R0 + 0.1 + key * T_FORM + rng.random() * 0.40;
    const isAnther = smp[0] === 'stamen' && smp[1] > 0.915;
    ROSEC.push([tk, r, c, ch, col, x, y, EDGE.has(r * COLS + c), hs, isAnther]);
  }

  // Bisect right helper
  function bisectRight(arr, x) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (x < arr[mid]) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  // Fire-to-Lily Ember Trajectories (RP)
  const RP = [];
  for (const [tk, r, c, ch, col, x, y, ed, hs] of ROSEC) {
    const lim = tk - T_BURN - 0.85;
    const n = bisectRight(TBS, lim);
    const src = ENV_SORTED[rng.randrange(Math.max(1, n))];
    const sx = src[7];
    const sy = src[8];
    let ts = Math.max(T_BURN + src[4] + 0.1, tk - 2.2);
    ts = Math.min(ts, tk - 0.75);
    const dx = x - sx;
    const dy = y - sy;
    const dd = Math.hypot(dx, dy) + 1e-6;
    RP.push([
      ts,
      tk,
      sx,
      sy,
      x,
      y,
      -dy / dd,
      dx / dd,
      rng.uniform(-0.12, 0.12) * dd,
      rng.uniform(0.05, 0.13) * H,
      rng.uniform(0, 6.28),
    ]);
  }

  function fpos(f, s) {
    const [, , sx, sy, tx, ty, nx, ny, amp, lift, ph] = f;
    const e = s * s * (3 - 2 * s);
    const sn = Math.sin(Math.PI * s);
    const x =
      sx +
      (tx - sx) * e +
      nx * amp * sn +
      3.0 * S * Math.sin(s * 13 + ph) * (1 - s);
    const y = sy + (ty - sy) * e + ny * amp * sn - lift * sn;
    return [x, y];
  }

  // --- Oriental Moon & Crimson Radiant Background ---
  const LX = RX;
  const LY = RY - 0.05 * RR;
  const NB = 720;
  const BGE = [];
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) * CH;
    for (let c = 0; c < COLS; c++) {
      const key = r * COLS + c;
      if (ROSEMASK.has(key)) continue;
      const x = (c + 0.5) * CW;
      const dx = x - LX;
      const dy = y - LY;
      const a = Math.atan2(dy, dx);
      const dn = Math.hypot(dx, dy) / (0.55 * H);
      const ab = Math.floor(((a + Math.PI) / (2 * Math.PI)) * NB) % NB;
      BGE.push([r, c, ab, dn, HALO.has(key)]);
    }
  }

  const NCH = 3;
  const BGCH = Array.from({ length: NCH }, (_, i) =>
    BGE.filter((__, idx) => idx % NCH === i)
  );
  const BGC = new Map();
  const RAYF = new Float32Array(NB);
  const RAYM = new Float32Array(NB);
  const BGRAMP = '.:-=+*#';

  function bgTables(tt) {
    for (let i = 0; i < NB; i++) {
      const a = -Math.PI + (i + 0.5) * ((2 * Math.PI) / NB);
      const r1 = Math.pow(
        0.5 + 0.5 * Math.sin(a * 23 + 1.6 * Math.sin(a * 3 + tt * 0.15) + tt * 0.10),
        6
      );
      const r2 = Math.pow(
        0.5 + 0.5 * Math.sin(a * 47 - tt * 0.12 + 1.5 * Math.sin(a * 5 - tt * 0.10)),
        9
      );
      const r3 = Math.pow(0.5 + 0.5 * Math.sin(a * 11 + tt * 0.08), 4);
      RAYF[i] = 0.55 * r1 + 0.50 * r2 + 0.20 * r3;
      let mn = 0.0;
      for (let k = 0; k < 8; k++) {
        const raw = ((a - (k * Math.PI) / 4 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        const d = Math.abs(raw);
        if (d < 0.3) {
          mn +=
            (k % 2 === 0 ? 1.0 : 0.65) *
            Math.exp(-Math.pow(d / 0.045, 2)) *
            (0.88 + 0.12 * Math.sin(tt * 0.9 + k * 1.3));
        }
      }
      RAYM[i] = mn;
    }
  }

  function bgEval(e, tt, gt) {
    const [, , ab, dn, halo] = e;
    const core = Math.exp(-dn * 2.8);
    const glow = Math.exp(-dn * 1.3);
    // Subtle Oriental Full Moon ring at dn ~ 0.42
    const moonRing = 0.38 * Math.exp(-Math.pow((dn - 0.42) / 0.045, 2));
    let I =
      (0.95 * core +
        0.16 * glow +
        moonRing +
        0.60 * RAYF[ab] * Math.exp(-dn * 1.9) +
        0.82 * RAYM[ab] * Math.exp(-dn * 1.05)) *
      gt;
    if (halo) I *= 0.22;
    if (I < 0.05) return null;
    I = Math.min(I, 1.3);
    const ch = BGRAMP[Math.min(BGRAMP.length - 1, Math.floor(I * BGRAMP.length * 0.8))];
    return [ch, AURA_LUT[Math.floor(clamp(I) * 63)]];
  }

  // Floating Spirit Motes & Night Stars
  const MOTES = Array.from({ length: 50 }, () => [
    rng.uniform(0, W),
    rng.uniform(0, H),
    rng.uniform(0.01, 0.04) * H,
    rng.uniform(0, 6.28),
    rng.uniform(0.5, 1.0),
  ]);

  const STARS = [];
  for (let i = 0; i < 65; i++) {
    const rr = rng.randrange(ROWS);
    const cc = rng.randrange(COLS);
    if (!ROSEMASK.has(rr * COLS + cc)) {
      STARS.push([rr, cc, rng.uniform(0, 6.28), rng.uniform(0.6, 2.2)]);
    }
  }

  const GOLD_LIGHT = [1.0, 0.72, 0.36];
  const CRIMSON_MOTE = [0.96, 0.24, 0.22];
  const WARM_WHITE = [1.0, 0.95, 0.86];

  function drawAmbient(t, dt, gt, newGrid) {
    const base = 0.22 + 0.78 * gt;
    for (const [rr, cc, ph, sp] of STARS) {
      const v = 0.5 + 0.5 * Math.sin(t * sp + ph);
      if (v > 0.35) {
        const a = (base * (v - 0.35)) / 0.65;
        const ch = v > 0.9 ? '*' : v > 0.7 ? '+' : '.';
        newGrid.set(
          rr * COLS + cc,
          [ch, sc(mix(GOLD_LIGHT, WARM_WHITE, v), 0.25 + 0.75 * a)]
        );
      }
    }
    if (gt < 0.02) return;
    for (const p of MOTES) {
      p[1] -= p[2] * dt;
      p[0] += 6 * S * Math.sin(t * 0.8 + p[3]) * dt;
      if (p[1] < -4) {
        p[1] = H + 4;
        p[0] = rng.uniform(0, W);
      }
      const rr = Math.floor(p[1] / CH);
      const cc = Math.floor(p[0] / CW);
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && !ROSEMASK.has(rr * COLS + cc)) {
        const v = gt * p[4] * (0.5 + 0.5 * Math.sin(t * 1.7 + p[3]));
        if (v > 0.12) {
          const moteCol = p[4] > 0.75 ? mix(GOLD_LIGHT, WARM_WHITE, 0.5) : mix(CRIMSON_MOTE, GOLD_LIGHT, p[4]);
          newGrid.set(rr * COLS + cc, [
            v < 0.45 ? '.' : v < 0.75 ? ':' : '*',
            sc(moteCol, 0.4 + 0.6 * v),
          ]);
        }
      }
    }
  }

  // --- Oriental Spirit-Fire Cursor Geometry ---
  const ARW = [
    [0.0, 0.0],
    [0.0, 0.86],
    [0.19, 0.69],
    [0.31, 0.99],
    [0.44, 0.93],
    [0.32, 0.65],
    [0.58, 0.65],
  ];
  const PH_ = 0.21 * H;
  const POLY = ARW.map(([x, y]) => [x * PH_, y * PH_]);

  function pip(px, py) {
    let ins = false;
    let j = POLY.length - 1;
    for (let i = 0; i < POLY.length; i++) {
      const [xi, yi] = POLY[i];
      const [xj, yj] = POLY[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi) {
        ins = !ins;
      }
      j = i;
    }
    return ins;
  }

  function pdist(px, py) {
    let best = 1e9;
    for (let i = 0; i < POLY.length; i++) {
      const [ax, ay] = POLY[i];
      const [bx, by] = POLY[(i + 1) % POLY.length];
      const vx = bx - ax;
      const vy = by - ay;
      const L2 = vx * vx + vy * vy + 1e-9;
      const t = clamp(((px - ax) * vx + (py - ay) * vy) / L2);
      const d = Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
      if (d < best) best = d;
    }
    return best;
  }

  const CUR_FILL = [];
  const CUR_EDGE = [];
  const CUR_GLOW = [];
  const CUR_SHAD = [];
  const occSet = new Set();
  const NC = Math.floor((0.58 * PH_) / CW) + 3;
  const NR = Math.floor(PH_ / CH) + 3;

  for (let j = 0; j < NR; j++) {
    for (let i = 0; i < NC; i++) {
      let cin = 0;
      let core = 0;
      for (const sy of [1 / 6, 3 / 6, 5 / 6]) {
        for (const sx of [1 / 6, 3 / 6, 5 / 6]) {
          const px = (i + sx) * CW;
          const py = (j + sy) * CH;
          if (pip(px, py)) {
            cin++;
            if (pdist(px, py) > 0.9 * CW) core++;
          }
        }
      }
      const cxm = (i + 0.5) * CW;
      const cym = (j + 0.5) * CH;
      const h = ((j * 7 + i * 13) % 10) / 10.0;
      if (core >= 5) {
        const t = clamp((cym / PH_) * 0.85 + (cxm / (0.58 * PH_)) * 0.15);
        // Vermilion & Gold spirit cursor palette
        let col = mix([0.85, 0.12, 0.16], [1.0, 0.68, 0.24], t);
        const bev = pdist(cxm, cym) < 1.8 * CW;
        if (bev) col = mix(col, [1.0, 0.95, 0.85], 0.25);
        CUR_FILL.push([j, i, bev ? '%' : '@', col, h]);
        occSet.add(`${j},${i}`);
      } else if (cin >= 3) {
        CUR_EDGE.push([j, i, h]);
        occSet.add(`${j},${i}`);
      } else {
        const d = pdist(cxm, cym);
        if (d < 1.9 * CW) {
          CUR_GLOW.push([j, i, 1 - d / (1.9 * CW), h]);
        }
      }
    }
  }
  for (const item of occSet) {
    const [j, i] = item.split(',').map(Number);
    if (!occSet.has(`${j + 1},${i + 1}`)) {
      CUR_SHAD.push([j + 1, i + 1]);
    }
  }

  const TGX = CX - 0.004 * W;
  const TGY = HCY - 0.015 * H;

  function cursorPos(t) {
    const s = clamp((t - T_CUR0) / (T_CUR1 - T_CUR0));
    const k = 1 - Math.pow(1 - s, 3.5);
    const p0 = [1.10 * W, 0.04 * H];
    const p1 = [0.95 * W, 0.80 * H];
    const p2 = [0.64 * W, 0.78 * H];
    const p3 = [TGX, TGY];
    const u = 1 - k;
    const x =
      u * u * u * p0[0] +
      3 * u * u * k * p1[0] +
      3 * u * k * k * p2[0] +
      k * k * k * p3[0];
    const y =
      u * u * u * p0[1] +
      3 * u * u * k * p1[1] +
      3 * u * k * k * p2[1] +
      k * k * k * p3[1];
    return [x, y];
  }

  // --- Dynamic Simulation State ---
  let sparks = [];
  let smoke = [];
  let bits = [];
  const st = { burst: false, click: false, hot: false, lilyChime: false };
  const HEAT = Array.from({ length: ROWS + 2 }, () => new Float32Array(COLS));
  const FSET = {
    1: ".'",
    2: ':.',
    3: "^'",
    4: '^*',
    5: '*(',
    6: '(+)',
    7: '%&',
    8: '#%',
    9: '#@',
    10: '@',
  };
  let frameCount = 0;

  function bedK(t) {
    const a = clamp((t - (T_BURN + 0.25)) / 1.2);
    const b = clamp((t - (T_BURN + T_SPREAD + 0.6)) / 1.6);
    return ease(a) * (1 - ease(b));
  }

  function fireStep(src, newGrid) {
    if (src.size === 0 && !st.hot) return;
    const last = COLS - 1;
    let anyhot = false;

    for (let r = 0; r < ROWS; r++) {
      const row = HEAT[r];
      const b1 = HEAT[r + 1];
      const b2 = HEAT[r + 2];
      for (let c = 0; c < COLS; c++) {
        const q = rng.random();
        let w = q < 0.27 ? c - 1 : q > 0.73 ? c + 1 : c;
        if (w < 0) w = 0;
        else if (w > last) w = last;
        const cl = c > 0 ? c - 1 : 0;
        const cr = c < last ? c + 1 : last;
        const v =
          (b1[w] * 2 + b1[cl] + b1[cr] + b2[c]) * 0.2 -
          (0.030 + 0.062 * ((q * 7.0) % 1.0));
        row[c] = v > 0 ? v : 0.0;
      }
    }

    for (const [key, v] of src.entries()) {
      const r = Math.floor(key / COLS);
      const c = key % COLS;
      if (v > HEAT[r][c]) HEAT[r][c] = v;
    }

    for (let r = 0; r < ROWS; r++) {
      const row = HEAT[r];
      for (let c = 0; c < COLS; c++) {
        const v = row[c];
        if (v > 0.10) {
          anyhot = true;
          const idx = Math.min(10, Math.floor(v * 10.5));
          const s = FSET[idx];
          const ch = s[(c * 3 + r * 7 + frameCount) % s.length];
          newGrid.set(r * COLS + c, [ch, LUT[Math.floor(clamp(v) * 63)]]);
        } else if (v > 0.01) {
          anyhot = true;
        }
      }
    }
    st.hot = anyhot;
  }

  function drawCursor(t, newGrid) {
    const a = clamp((t - T_CUR0) / 0.3);
    const bt = t - T_BURN;
    if (a <= 0 || bt > 1.1) return;
    const [px, py] = cursorPos(t);
    let c0 = Math.floor(px / CW);
    let r0 = Math.floor(py / CH);
    const press = t >= T_CLICK && t < T_CLICK + 0.20;
    if (press) {
      c0 += 1;
      r0 += 1;
    }
    const bk = bt > 0 ? clamp(bt) : 0.0;

    if (t > T_CUR0 && t < T_CUR1 + 0.15) {
      for (let q = 1; q < 11; q++) {
        const [tx, ty] = cursorPos(t - 0.05 * q);
        const rr = Math.floor(ty / CH);
        const cc = Math.floor(tx / CW);
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const v = (1 - q / 11.0) * 0.85;
          newGrid.set(rr * COLS + cc, [
            q < 4 ? '+' : '.',
            [0.95 * v, 0.42 * v, 0.18 * v],
          ]);
        }
      }
    }

    for (const [j, i] of CUR_SHAD) {
      const rr = r0 + j;
      const cc = c0 + i;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && bk < 0.5) {
        const key = rr * COLS + cc;
        const und = newGrid.get(key);
        const ucol = und ? und[1] : BG;
        newGrid.set(key, [':', mix(ucol, [0.05, 0.01, 0.02], 0.65 * a)]);
      }
    }

    for (const [j, i, g, hh] of CUR_GLOW) {
      const rr = r0 + j;
      const cc = c0 + i;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && hh < 0.7 && bk < 0.6) {
        const v = a * g * (1 - bk) * 0.85;
        newGrid.set(rr * COLS + cc, [
          g > 0.5 ? ':' : '.',
          [0.88 * v, 0.28 * v, 0.16 * v],
        ]);
      }
    }

    for (const [j, i, hh] of CUR_EDGE) {
      if (hh < bk) continue;
      const rr = r0 + j;
      const cc = c0 + i;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
        let col = [1.0, 0.90, 0.72];
        if (press) col = [1.0, 1.0, 1.0];
        if (bk > 0) {
          col = mix(col, LUT[Math.floor(clamp(0.55 + 0.4 * (1 - hh)) * 63)], clamp(bk * 1.6));
        }
        newGrid.set(rr * COLS + cc, ['#', sc(col, a)]);
      }
    }

    for (const [j, i, ch, baseCol, hh] of CUR_FILL) {
      if (hh < bk) continue;
      const rr = r0 + j;
      const cc = c0 + i;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
      let col = baseCol;
      if (press) col = mix(col, [1.0, 0.96, 0.88], 0.55);
      if (bk > 0) {
        col = mix(col, LUT[Math.floor(clamp(0.55 + 0.4 * (1 - hh)) * 63)], clamp(bk * 1.6));
      }
      newGrid.set(rr * COLS + cc, [ch, sc(col, a)]);
    }
  }

  function* ringCells(cx, cy, pad) {
    const rMin = Math.max(0, Math.floor((cy - pad) / CH));
    const rMax = Math.min(ROWS, Math.floor((cy + pad) / CH) + 1);
    const cMin = Math.max(0, Math.floor((cx - pad) / CW));
    const cMax = Math.min(COLS, Math.floor((cx + pad) / CW) + 1);
    for (let rr = rMin; rr < rMax; rr++) {
      const y = (rr + 0.5) * CH;
      for (let cc = cMin; cc < cMax; cc++) {
        yield [rr, cc, (cc + 0.5) * CW, y];
      }
    }
  }

  function drawClick(t, dt, newGrid) {
    const a = t - T_CLICK;
    if (!st.click && a >= 0) {
      st.click = true;
      soundEngine.playSealIgnite();
      updateHintBanner('O selo queima... das brasas nasce o Lírio-Aranha Vermelho (彼岸花)');
      for (let i = 0; i < 52; i++) {
        const ang = rng.uniform(0, 2 * Math.PI);
        const sp = rng.uniform(120, 560) * S;
        bits.push([TGX, TGY, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.0, rng.uniform(0.5, 1.1)]);
      }
    }
    if (a < 0 || a > 1.2) return;

    if (a < 0.25) {
      const k = a / 0.25;
      const rad = 0.03 * H + 0.05 * H * k;
      for (const [rr, cc, x, y] of ringCells(TGX, TGY, rad + CW)) {
        const d = Math.hypot(x - TGX, y - TGY);
        if (d < rad) {
          const v = (1 - k) * (1 - (d / rad) * 0.5);
          const key = rr * COLS + cc;
          const und = newGrid.get(key);
          const col = mix([1.0, 0.95, 0.80], [1.0, 0.38, 0.18], k);
          newGrid.set(key, [
            v > 0.5 ? '@' : '#',
            und ? mix(und[1], col, clamp(v * 1.3)) : sc(col, v),
          ]);
        }
      }
    }

    const shockwaves = [
      [0.0, [0.95, 0.24, 0.16], [1.0, 0.75, 0.35]],
      [0.13, [0.85, 0.16, 0.14], [1.0, 0.65, 0.30]],
      [0.26, [0.92, 0.36, 0.18], [1.0, 0.90, 0.68]],
    ];
    for (const [d0, c0, c1] of shockwaves) {
      const aa = a - d0;
      if (aa < 0 || aa > 0.9) continue;
      const k = aa / 0.9;
      const rad = 0.02 * H + 0.26 * H * (1 - Math.pow(1 - k, 2.2));
      const th = (1.7 - 1.0 * k) * CW;
      const al = Math.pow(1 - k, 1.2);
      const col = mix(c0, c1, k);
      for (const [rr, cc, x, y] of ringCells(TGX, TGY, rad + th)) {
        const q = Math.abs(Math.hypot(x - TGX, y - TGY) - rad) / th;
        if (q >= 1) continue;
        const v = (1 - q) * al * 1.5;
        const key = rr * COLS + cc;
        let c2 = sc(col, clamp(v));
        const und = newGrid.get(key);
        if (und) c2 = mix(und[1], col, clamp(v * 0.85));
        newGrid.set(key, [q < 0.35 ? 'O' : q < 0.65 ? 'o' : '.', c2]);
      }
    }

    if (a < 0.55) {
      const k = a / 0.55;
      const l0 = 0.03 * H + 0.05 * H * k;
      const l1 = 0.06 * H + 0.24 * H * (1 - Math.pow(1 - k, 2));
      const steps = Math.floor((l1 - l0) / (CW * 0.9)) + 1;
      for (let n = 0; n < 14; n++) {
        const ang = (n * 2 * Math.PI) / 14 + 0.2;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const chr =
          Math.abs(ca) > 0.92 ? '-' : Math.abs(sa) > 0.92 ? '|' : ca * sa > 0 ? '\\' : '/';
        for (let s = 0; s < steps; s++) {
          const f = s / steps;
          const dist = l0 + (l1 - l0) * f;
          const rr = Math.floor((TGY + sa * dist) / CH);
          const cc = Math.floor((TGX + ca * dist) / CW);
          if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
            const v = (1 - k) * (1 - 0.6 * f);
            newGrid.set(rr * COLS + cc, [
              chr,
              sc(mix([1.0, 0.92, 0.75], [0.95, 0.25, 0.15], f), clamp(v * 1.3)),
            ]);
          }
        }
      }
    }

    const alive = [];
    for (const b of bits) {
      b[4] += dt;
      if (b[4] >= b[5]) continue;
      b[2] *= 1 - 2.0 * dt;
      b[3] = b[3] * (1 - 2.0 * dt) + 60 * S * dt;
      b[0] += b[2] * dt;
      b[1] += b[3] * dt;
      const k = b[4] / b[5];
      const rr = Math.floor(b[1] / CH);
      const cc = Math.floor(b[0] / CW);
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
        newGrid.set(rr * COLS + cc, [
          k < 0.4 ? '*' : k < 0.7 ? '+' : '.',
          sc(mix([1.0, 0.92, 0.75], [0.95, 0.22, 0.14], k), 1 - 0.5 * k),
        ]);
      }
      alive.push(b);
    }
    bits = alive;
  }

  // --- Main Frame Evaluation ---
  function evaluateFrame(t, dt) {
    frameCount++;
    const newGrid = new Map();
    const gt = ease((t - T_GLOW) / 3.6);

    if (gt > 0.003) {
      if (!st.lilyChime && gt > 0.15) {
        st.lilyChime = true;
        soundEngine.playBloomChord();
        updateHintBanner('彼岸花 — Lírio-Aranha Vermelho • Pressione R para renascer');
      }
      if (frameCount % NCH === 0 || BGC.size === 0) {
        bgTables(t);
      }
      for (const e of BGCH[frameCount % NCH]) {
        const res = bgEval(e, t, gt);
        const key = e[0] * COLS + e[1];
        if (res) BGC.set(key, res);
        else BGC.delete(key);
      }
      for (const [k, v] of BGC.entries()) {
        newGrid.set(k, v);
      }
    }

    drawAmbient(t, dt, gt, newGrid);

    const tbn = t - T_BURN;
    const pin = clamp(t / T_ENV_IN);

    for (const [r, c, ch, col, tb, hs] of SHDC) {
      if (tbn - tb >= 0) continue;
      const vis = pin * 1.3 - hs * 0.5;
      if (vis > 0) {
        newGrid.set(r * COLS + c, [ch, sc(col, Math.min(1.0, vis * 1.6))]);
      }
    }

    const front = [];
    const src = new Map();

    for (const [r, c, ch, baseCol, tb, hs, hs2, x, y] of ENVC) {
      const tau = tbn - tb;
      if (tau >= 1.35) continue;
      const key = r * COLS + c;
      if (tau < 0) {
        const vis = pin * 1.3 - hs * 0.5;
        if (vis <= 0) continue;
        const k = Math.min(1.0, vis * 1.6);
        let col = baseCol;
        if (tbn > 0 && tau > -0.5) {
          const w = (tau + 0.5) * 2.0;
          col = mix(col, [0.30, 0.10, 0.03], w * 0.75);
          if (w > 0.6) {
            col = mix(col, [1.0, 0.38, 0.05], (w - 0.6) * 1.3);
          }
        }
        newGrid.set(key, [ch, [col[0] * k, col[1] * k, col[2] * k]]);
        continue;
      }

      if (tau < 0.50) {
        src.set(key, 0.72 + 0.28 * rng.random());
      } else if (tau < 0.95) {
        src.set(key, (0.45 + 0.15 * rng.random()) * (1 - (tau - 0.50) / 0.45));
      }

      if (tau < 0.38) {
        const q = tau / 0.38;
        const T = clamp(0.98 - 0.62 * q + 0.14 * nz(t * 9 + hs * 20));
        const charset = q < 0.6 ? '@#&%' : '#%=+';
        const ch2 = charset[Math.floor(hs2 * 4) % 4];
        newGrid.set(key, [ch2, LUT[Math.floor(T * 63)]]);
        front.push([x, y]);
      } else {
        const a = 1 - (tau - 0.38) / 0.97;
        if (hs2 > Math.pow(a, 0.7)) continue;
        if ((hs * 37.0 + t * 1.6) % 1.0 > 0.84 - 0.08 * a) {
          newGrid.set(key, ['*', LUT[Math.floor(clamp(0.28 + 0.5 * a) * 63)]]);
        } else {
          const kk = 0.45 + 0.9 * a;
          newGrid.set(key, [
            '%#='[Math.floor(hs * 3) % 3],
            [0.13 * kk, 0.07 * kk, 0.05 * kk],
          ]);
        }
      }
    }

    if (t >= T_CUR1 - 0.3 && t < T_BURN + 0.02) {
      let mf;
      if (t < T_CLICK) {
        const k = 0.32 * ease((t - (T_CUR1 - 0.3)) / 0.3) * (0.8 + 0.2 * Math.sin(t * 9));
        mf = (col) => mix(col, [1.0, 0.88, 0.68], k);
      } else if (t < T_CLICK + 0.20) {
        mf = (col) => sc(col, 0.62);
      } else {
        const k = 0.7 * (1 - clamp((t - T_CLICK - 0.2) / 0.15));
        mf = (col) => mix(col, [1.0, 0.9, 0.8], k);
      }
      for (const key of SEALC) {
        const v = newGrid.get(key);
        if (v) newGrid.set(key, [v[0], mf(v[1])]);
      }
    }

    const bk = bedK(t);
    if (bk > 0.01) {
      for (const [rr, cc, shp, hs, top] of BED) {
        const fl = 0.5 + 0.5 * Math.sin(t * 6 + hs * 40);
        const T = clamp(bk * shp * (0.25 + 0.45 * fl + 0.2 * hs));
        const key = rr * COLS + cc;
        if (T > 0.08) {
          newGrid.set(key, ['=%#@'[Math.floor(hs * 4) % 4], LUT[Math.floor(T * 63)]]);
        }
        if (top) {
          src.set(key, bk * shp * (0.50 + 0.38 * rng.random()));
        }
      }
      for (const [rr, cc, shp, , top] of BED) {
        if (top && rng.random() < 0.5 * dt * 10 * bk * shp) {
          front.push([(cc + 0.5) * CW, (rr + 0.5) * CH]);
        }
      }
    }

    fireStep(src, newGrid);

    // Render Red Spider Lily cells as they materialize from embers
    const rim = 0.58 * gt;
    for (const [tk, r, c, baseCh, baseCol, , , ed, hs, isAnther] of ROSEC) {
      if (t < tk) continue;
      let ch = baseCh;
      let col = baseCol;
      const heat = 1.0 - (t - tk);
      if (heat > 0) {
        const hh = Math.pow(heat, 1.4);
        col = mix(col, LUT[Math.floor(clamp(0.35 + 0.65 * hh) * 63)], clamp(hh * 1.15));
        if (hh > 0.5) ch = '@';
      } else if (isAnther && gt > 0.05) {
        // Golden pollen shimmer at the tips of the spider lily stamens
        const pulse = 0.5 + 0.5 * Math.sin(t * 3.4 + hs * 25);
        col = mix(col, [1.0, 0.94, 0.72], 0.35 * pulse * gt);
        if (pulse > 0.82) ch = '*';
      } else if (ed && rim > 0.01) {
        col = mix(col, [1.0, 0.64, 0.38], rim * 0.65);
        if (hs > 0.9 && Math.sin(t * 3 + hs * 40) > 0.85) {
          ch = '*';
          col = [1.0, 0.92, 0.76];
        }
      }
      newGrid.set(r * COLS + c, [ch, col]);
    }

    // Flying Fire Embers forming the Red Spider Lily
    for (const f of RP) {
      const ts = f[0];
      const tk = f[1];
      if (t < ts || t >= tk) continue;
      const s = (t - ts) / (tk - ts);
      for (const [lag, chh, dim] of [
        [0.0, '*', 1.0],
        [0.06, '+', 0.8],
        [0.12, '.', 0.6],
      ]) {
        const ss = s - lag;
        if (ss < 0) break;
        const [x, y] = fpos(f, ss);
        const rr = Math.floor(y / CH);
        const cc = Math.floor(x / CW);
        if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
          const T = clamp((0.45 + 0.55 * s) * dim);
          newGrid.set(rr * COLS + cc, [chh, LUT[Math.floor(T * 63)]]);
        }
      }
    }

    if (t >= T_BURN && !st.burst) {
      st.burst = true;
      for (let i = 0; i < 150; i++) {
        const a = rng.uniform(-170, -10) * D2R;
        const sp = rng.uniform(100, 560) * S;
        sparks.push([
          IGX,
          IGY,
          Math.cos(a) * sp,
          Math.sin(a) * sp,
          0.0,
          rng.uniform(0.6, 1.6),
          -rng.uniform(20, 120) * S,
        ]);
      }
    }

    if (front.length > 0 && t < T_FIRE_END) {
      const n = Math.floor(380 * dt * Math.min(1.0, front.length / 50.0) + rng.random());
      for (let i = 0; i < n; i++) {
        const [x, y] = front[rng.randrange(front.length)];
        const a = rng.uniform(-125, -55) * D2R;
        const sp = rng.uniform(60, 360) * S;
        sparks.push([
          x,
          y,
          Math.cos(a) * sp,
          Math.sin(a) * sp,
          0.0,
          rng.uniform(0.7, 1.9),
          -rng.uniform(25, 140) * S,
        ]);
      }
      if (rng.random() < 22 * dt) {
        const [x, y] = front[rng.randrange(front.length)];
        smoke.push([
          x,
          y - 0.05 * H,
          rng.uniform(-6, 6) * S,
          -rng.uniform(25, 55) * S,
          0.0,
          rng.uniform(1.8, 3.2),
          rng.uniform(0, 6.28),
          SMOKE_C,
        ]);
      }
    }

    if (t > T_R0 + T_FORM && gt > 0.2) {
      const n = Math.floor(7 * dt + rng.random());
      for (let i = 0; i < n; i++) {
        sparks.push([
          RX + rng.uniform(-1.3, 1.3) * RR,
          RY + rng.uniform(-0.9, 0.6) * RR,
          rng.uniform(-14, 14) * S,
          -rng.uniform(22, 65) * S,
          0.0,
          rng.uniform(1.2, 2.4),
          -8 * S,
        ]);
      }
    }

    if (sparks.length > 1600) {
      sparks.splice(0, sparks.length - 1600);
    }

    const aliveSparks = [];
    for (const s of sparks) {
      s[4] += dt;
      if (s[4] >= s[5]) continue;
      s[2] = s[2] * (1 - 1.3 * dt) + 55 * S * Math.sin(s[4] * 7 + s[5] * 20) * dt;
      s[3] += s[6] * dt;
      s[0] += s[2] * dt;
      s[1] += s[3] * dt;
      const k = 1 - s[4] / s[5];
      const rr = Math.floor(s[1] / CH);
      const cc = Math.floor(s[0] / CW);
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
        newGrid.set(rr * COLS + cc, [
          k > 0.55 ? '*' : k > 0.30 ? '+' : '.',
          LUT[Math.floor(clamp(0.15 + 0.85 * k) * 63)],
        ]);
      }
      aliveSparks.push(s);
    }
    sparks = aliveSparks;

    const aliveSmoke = [];
    for (const s of smoke) {
      s[4] += dt;
      if (s[4] >= s[5]) continue;
      const k = s[4] / s[5];
      s[0] += (s[2] + 14 * S * Math.sin(s[4] * 2.2 + s[6])) * dt;
      s[1] += s[3] * dt;
      const al = Math.sin(Math.PI * k) * 0.5;
      const rr = Math.floor(s[1] / CH);
      const cc = Math.floor(s[0] / CW);
      if (al > 0.10 && rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
        const key = rr * COLS + cc;
        const und = newGrid.get(key);
        const ucol = und ? und[1] : BG;
        newGrid.set(key, ['.:;+'[Math.min(3, Math.floor(al * 7))], mix(ucol, s[7], al)]);
      }
      aliveSmoke.push(s);
    }
    smoke = aliveSmoke;

    drawClick(t, dt, newGrid);
    drawCursor(t, newGrid);

    return newGrid;
  }

  // --- Canvas Setup & Responsive Sizing ---
  const canvas = document.getElementById('ascii-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const hintBanner = document.getElementById('hint-banner');
  const hintText = document.getElementById('hint-text');

  let renderCW = 8;
  let renderCH = 14;
  let fontSize = 11;
  let dpr = 1;

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const maxW = window.innerWidth - 48;
    const maxH = window.innerHeight - 135;

    // Maintain square-like aspect ratio of the original art
    const targetH = Math.max(320, Math.min(maxH, maxW * 0.96, 780));
    renderCH = targetH / ROWS;
    renderCW = renderCH * (CW / CH);

    const cssW = Math.round(COLS * renderCW);
    const cssH = Math.round(ROWS * renderCH);

    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    fontSize = Math.max(7, Math.round(renderCH * 0.82 * dpr));
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function drawGridToCanvas(grid) {
    ctx.fillStyle = hexc(BG);
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = `700 ${fontSize}px "JetBrains Mono", "Cascadia Mono", Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cellW = renderCW * dpr;
    const cellH = renderCH * dpr;

    for (const [key, val] of grid.entries()) {
      const r = Math.floor(key / COLS);
      const c = key % COLS;
      ctx.fillStyle = hexc(val[1]);
      ctx.fillText(val[0], (c + 0.5) * cellW, (r + 0.5) * cellH);
    }
  }

  // --- Synthesized Oriental Koto / Chime Web Audio Engine (Zero external assets) ---
  const soundEngine = {
    ctx: null,
    enabled: false,
    loopTimer: null,
    // Japanese In-sen Pentatonic Scale (D4, Eb4, G4, A4, C5, D5, Eb5, G5)
    scale: [293.66, 311.13, 392.00, 440.00, 523.25, 587.33, 622.25, 783.99],

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    },

    pluckKoto(freq, delay = 0, gainVal = 0.08, duration = 2.4) {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc2.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      // Slight pitch bend at pluck attack like a real Koto string
      osc.frequency.exponentialRampToValueAtTime(freq * 1.012, now + 0.02);
      osc.frequency.exponentialRampToValueAtTime(freq, now + 0.14);

      osc2.frequency.setValueAtTime(freq * 2, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 4.5, now);
      filter.frequency.exponentialRampToValueAtTime(freq * 1.2, now + duration);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainVal, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc2.start(now);
      osc.stop(now + duration);
      osc2.stop(now + duration);
    },

    playSealIgnite() {
      if (!this.enabled) return;
      this.init();
      // Rising dramatic koto arpeggio on seal click
      [293.66, 311.13, 392.00, 587.33, 622.25].forEach((f, idx) => {
        this.pluckKoto(f, idx * 0.09, 0.07, 2.2);
      });
    },

    playBloomChord() {
      if (!this.enabled) return;
      this.init();
      // Ethereal Higanbana bloom arpeggio
      [293.66, 440.00, 587.33, 622.25, 783.99, 1174.66].forEach((f, idx) => {
        this.pluckKoto(f, idx * 0.16, 0.06, 3.2);
      });
    },

    toggle() {
      this.enabled = !this.enabled;
      if (this.enabled) {
        this.init();
        this.pluckKoto(587.33, 0, 0.07, 1.8);
        this.pluckKoto(622.25, 0.18, 0.06, 2.0);
        this.loopTimer = setInterval(() => {
          if (!this.enabled) return;
          const note = this.scale[Math.floor(Math.random() * this.scale.length)];
          this.pluckKoto(note, 0, 0.045, 2.8);
        }, 1600);
      } else if (this.loopTimer) {
        clearInterval(this.loopTimer);
        this.loopTimer = null;
      }
      return this.enabled;
    },
  };

  function updateHintBanner(msg) {
    if (!hintText) return;
    hintText.textContent = msg;
  }

  // --- Animation Loop & Interactive Controls ---
  const animState = {
    t0: performance.now() / 1000,
    last: 0.0,
    timeOffset: 0.0,
  };

  function getElapsed() {
    return performance.now() / 1000 - animState.t0 + animState.timeOffset;
  }

  function restartAnimation() {
    animState.t0 = performance.now() / 1000;
    animState.timeOffset = 0.0;
    animState.last = 0.0;
    st.burst = false;
    st.click = false;
    st.hot = false;
    st.lilyChime = false;
    sparks.length = 0;
    smoke.length = 0;
    bits.length = 0;
    BGC.clear();
    for (let r = 0; r < ROWS + 2; r++) {
      HEAT[r].fill(0.0);
    }
    for (const p of MOTES) {
      p[1] = rng.uniform(0, H);
    }
    updateHintBanner('Toque no selo escarlate ou aguarde o espírito de fogo');
  }

  function igniteNow() {
    const t = getElapsed();
    if (t < T_CLICK - 0.05) {
      animState.timeOffset += T_CLICK - t;
    } else if (t > T_R0 + T_FORM + 2.0) {
      restartAnimation();
    }
  }

  // Event Listeners
  document.getElementById('btn-restart').addEventListener('click', (e) => {
    e.stopPropagation();
    restartAnimation();
  });

  document.getElementById('btn-ignite').addEventListener('click', (e) => {
    e.stopPropagation();
    igniteNow();
  });

  const btnSound = document.getElementById('btn-sound');
  const soundLabel = document.getElementById('sound-label');
  btnSound.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = soundEngine.toggle();
    btnSound.setAttribute('aria-pressed', String(on));
    soundLabel.textContent = on ? 'Koto: On' : 'Som: Off';
  });

  document.getElementById('canvas-container').addEventListener('click', () => {
    const t = getElapsed();
    if (t < T_CLICK - 0.05) {
      igniteNow();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
      restartAnimation();
    } else if (e.key === ' ') {
      e.preventDefault();
      igniteNow();
    }
  });

  // Main RequestAnimationFrame Loop (capped delta for smooth physics)
  let accTime = 0;
  const STEP_DT = 1 / 30;
  let currentGrid = new Map();

  function loop() {
    const t = getElapsed();
    const rawDt = clamp(t - animState.last, 0.0, 0.1);
    animState.last = t;
    accTime += rawDt;

    if (accTime >= STEP_DT || currentGrid.size === 0) {
      const dt = Math.min(accTime, 0.08);
      accTime = 0;
      currentGrid = evaluateFrame(t, dt);
      drawGridToCanvas(currentGrid);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
