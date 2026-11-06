import math as m
import random
import time
import bisect
import tkinter as tk
import tkinter.font as tkf

SIZE = 8
FPS = 30
D2R = m.pi / 180

T_ENV_IN = 1.6
T_CUR0 = 1.9
T_CUR1 = 4.1
T_CLICK = 4.55
T_BURN = T_CLICK + 0.12
T_SPREAD = 3.4
T_R0 = T_BURN + 2.3
T_FORM = 3.8
T_GLOW = T_R0 + 1.8
T_FIRE_END = T_BURN + T_SPREAD + 2.2

rng = random.Random(21)

root = tk.Tk()
root.title("For You")
root.resizable(False, False)
root.bind("<Escape>", lambda e: root.destroy())

fams = set(tkf.families())
MONO = next((f for f in ("Cascadia Mono", "Consolas", "Courier New", "DejaVu Sans Mono", "Courier")
             if f in fams), "Courier")
scr_h = root.winfo_screenheight()
fnt = tkf.Font(root=root, family=MONO, size=SIZE, weight="bold")
CH = fnt.metrics("linespace")
CW = fnt.measure("M")
ROWS = int(max(30, min(46, (scr_h - 140) // CH)))
COLS = int(ROWS * CH / CW)
W, H = COLS * CW, ROWS * CH
S = H / 640.0
root.geometry(f"{W}x{H}+{(root.winfo_screenwidth() - W) // 2}+{max(0, (scr_h - H) // 2 - 20)}")

BG = (0.010, 0.007, 0.012)


def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def mix(a, b, k):
    return (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k)


def sc(c, k):
    return (c[0] * k, c[1] * k, c[2] * k)


_hx = {}
LV = 40


def hexc(c):
    k = (int(clamp(c[0]) * (LV - 0.01)), int(clamp(c[1]) * (LV - 0.01)), int(clamp(c[2]) * (LV - 0.01)))
    s = _hx.get(k)
    if s is None:
        s = "#%02x%02x%02x" % tuple(int(v * 255 / (LV - 1)) for v in k)
        _hx[k] = s
    return s


cv = tk.Canvas(root, width=W, height=H, bg=hexc(BG), highlightthickness=0)
cv.pack()

_P = list(range(256))
rng.shuffle(_P)
_N = [rng.uniform(-1, 1) for _ in range(256)]


def vn(x, y):
    xi = int(m.floor(x))
    yi = int(m.floor(y))
    xf = x - xi
    yf = y - yi
    xi &= 255
    yi &= 255
    x1 = (xi + 1) & 255
    y1 = (yi + 1) & 255
    u = xf * xf * (3 - 2 * xf)
    v = yf * yf * (3 - 2 * yf)
    a = _N[_P[(_P[xi] + yi) & 255]]
    b = _N[_P[(_P[x1] + yi) & 255]]
    c = _N[_P[(_P[xi] + y1) & 255]]
    d = _N[_P[(_P[x1] + y1) & 255]]
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v


def nz(t, a=1.0):
    return (m.sin(t * 2.1 * a) + 0.7 * m.sin(t * 3.3 * a + 1.7) + 0.4 * m.sin(t * 5.7 * a + 0.6)) / 2.1


HS = [[rng.random() for _ in range(COLS)] for _ in range(ROWS)]
HS2 = [[rng.random() for _ in range(COLS)] for _ in range(ROWS)]


def ramp_lut(stops, n=64):
    out = []
    for i in range(n):
        v = i / (n - 1)
        for k in range(len(stops) - 1):
            a, ca = stops[k]
            b, cb = stops[k + 1]
            if v <= b:
                out.append(mix(ca, cb, (v - a) / (b - a)))
                break
    return out


FIRE = [
    (0.00, (0.30, 0.01, 0.00)),
    (0.18, (0.78, 0.05, 0.01)),
    (0.38, (1.00, 0.24, 0.02)),
    (0.60, (1.00, 0.52, 0.05)),
    (0.80, (1.00, 0.80, 0.26)),
    (1.00, (1.00, 0.98, 0.82)),
]
LUT = ramp_lut(FIRE)

REDS = [
    (0.00, (0.10, 0.00, 0.02)),
    (0.22, (0.34, 0.01, 0.05)),
    (0.45, (0.66, 0.04, 0.09)),
    (0.68, (0.90, 0.09, 0.15)),
    (0.88, (1.00, 0.24, 0.26)),
    (1.00, (1.00, 0.55, 0.52)),
]
RLUT = ramp_lut(REDS)
RCH = "-=+*#%&@8"
SMOKE_C = (0.50, 0.44, 0.44)

BLUES = [
    (0.00, (0.05, 0.01, 0.02)),
    (0.26, (0.28, 0.02, 0.05)),
    (0.52, (0.68, 0.10, 0.11)),
    (0.78, (0.96, 0.46, 0.20)),
    (1.00, (1.00, 0.90, 0.68)),
]
BLUE = ramp_lut(BLUES)

CX = W / 2.0
EW = 0.76 * W
EH = 0.74 * EW
ECY = 0.55 * H
EX0, EX1 = CX - EW / 2, CX + EW / 2
EY0, EY1 = ECY - EH / 2, ECY + EH / 2
FLAP_H = 0.50 * EH
TIPY = EY0 + FLAP_H
HR = 0.062 * H
HCY = TIPY - 0.25 * HR
XPL, XPR = CX - 0.17 * EW, CX + 0.17 * EW
YPL = EY0 + FLAP_H * (1 - 0.17 * EW / (EW / 2))
IGX, IGY = CX, HCY

GLYPH = {
    "F": ["###", "#..", "##.", "#..", "#.."],
    "O": ["###", "#.#", "#.#", "#.#", "###"],
    "R": ["##.", "#.#", "##.", "#.#", "#.#"],
    "Y": ["#.#", "#.#", ".#.", ".#.", ".#."],
    "U": ["#.#", "#.#", "#.#", "#.#", "###"],
    " ": ["...", "...", "...", "...", "..."],
}
TEXT = "FOR YOU"
TXT = ["", "", "", "", ""]
for _i, _ch in enumerate(TEXT):
    for _k in range(5):
        TXT[_k] += GLYPH[_ch][_k] + ("." if _i < len(TEXT) - 1 else "")
TW = len(TXT[0])
TC0 = int(CX / CW - TW)
TR0 = int((HCY + 1.2 * HR) / CH) + 2


def ink(r, c):
    px = (c - TC0) // 2
    py = r - TR0
    return c >= TC0 and 0 <= px < TW and 0 <= py < 5 and TXT[py][px] == "#"


PAPER = "#%&@8"
FLAPC = (0.91, 0.81, 0.64)
BODYC = (0.85, 0.74, 0.56)
SIDEC = (0.76, 0.64, 0.47)
BOTC = (0.85, 0.74, 0.56)
INK = (0.18, 0.06, 0.05)
INKT = (0.26, 0.06, 0.05)
STRIPE = ((0.78, 0.12, 0.14), (0.92, 0.74, 0.32), (0.32, 0.05, 0.07))


def heart_f(hx, hy, s):
    X = hx / s
    Y = (hy - 0.25) / s + 0.25
    return (X * X + Y * Y - 1) ** 3 - X * X * Y ** 3


def in_seal(x, y):
    hx_ = (x - CX) / HR
    hy_ = (HCY - y) / HR
    return -1.4 < hx_ < 1.4 and -1.3 < hy_ < 1.6 and heart_f(hx_, hy_, 1.0) <= 0


def env_style(r, c, x, y, hs, hs2):
    if x < EX0 or x > EX1 or y < EY0 or y > EY1:
        return None
    hx_ = (x - CX) / HR
    hy_ = (HCY - y) / HR
    if -1.4 < hx_ < 1.4 and -1.3 < hy_ < 1.6 and heart_f(hx_, hy_, 1.0) <= 0:
        k = clamp(0.5 - 0.30 * hx_ + 0.28 * hy_)
        if heart_f(hx_, hy_, 0.88) > 0:
            return ("#", (0.86, 0.64, 0.24))
        if heart_f(hx_, hy_, 0.68) > 0:
            return ("&%#"[int(hs * 3) % 3], mix((0.78, 0.12, 0.14), (0.98, 0.38, 0.26), k))
        if (hx_ + 0.38) ** 2 + (hy_ - 0.58) ** 2 < 0.048:
            return ("*", (1.0, 0.92, 0.68))
        return ("@%"[hs2 > 0.80], mix((0.64, 0.07, 0.09), (0.95, 0.26, 0.22), k))
    if ink(r, c):
        return ("@", INKT)
    if ink(r - 1, c - 1):
        return ("%", (0.58, 0.42, 0.26))
    if abs(y - HCY) < 0.52 * CH and abs(x - CX) > 1.05 * HR and EX0 + 2 * CW < x < EX1 - 2 * CW:
        return ("=", (0.92, 0.74, 0.30) if (c + r) % 3 == 0 else (0.78, 0.12, 0.14))
    fh = FLAP_H * (1 - abs(x - CX) / (EW / 2))
    dfl = EY0 + fh - y
    if abs(dfl) < 0.45 * CH:
        return ("\\" if x < CX else "/", INK)
    side = False
    if dfl < 0:
        if x <= XPL:
            yl = EY1 + (YPL - EY1) * (x - EX0) / (XPL - EX0)
            if abs(y - yl) < 0.45 * CH:
                return ("/", INK)
            side = y < yl
        elif x >= XPR:
            yr = YPL + (EY1 - YPL) * (x - XPR) / (EX1 - XPR)
            if abs(y - yr) < 0.45 * CH:
                return ("\\", INK)
            side = y < yr
    if (x < EX0 + 1.3 * CW or x > EX1 - 1.3 * CW or y < EY0 + 0.9 * CH or y > EY1 - 0.9 * CH):
        return ("+" if (c + r) % 2 == 0 else "*", STRIPE[((c + r) % 6) // 2])
    base = FLAPC if dfl >= 0 else (SIDEC if side else BOTC)
    k = (1.05 - 0.18 * (y - EY0) / EH) * (0.90 + 0.20 * hs2)
    if dfl < 0 and dfl > -1.4 * CH:
        k *= 0.74 + 0.20 * (-dfl) / (1.4 * CH)
    elif 0.45 * CH < dfl < 1.4 * CH:
        k *= 1.06
    return (PAPER[int(hs * len(PAPER)) % len(PAPER)], (base[0] * k, base[1] * k, base[2] * k))


raw = []
SHD = []
for r in range(ROWS):
    y = (r + 0.5) * CH
    for c in range(COLS):
        x = (c + 0.5) * CW
        s_ = env_style(r, c, x, y, HS[r][c], HS2[r][c])
        if s_ is not None:
            raw.append((r, c, s_[0], s_[1], x, y))
        elif EX0 + 0.9 * CW <= x <= EX1 + 1.8 * CW and EY0 + 0.8 * CH <= y <= EY1 + 2.0 * CH:
            SHD.append((r, c, x, y))
MAXD = max(m.hypot(e[4] - IGX, e[5] - IGY) for e in raw)
ENVC = []
SEALC = []
for r, c, ch, col, x, y in raw:
    d = m.hypot(x - IGX, y - IGY)
    nzv = vn(x * 0.035 + 4, y * 0.035 + 9) * 0.5 + 0.5
    tb = T_SPREAD * (d / MAXD) ** 0.92 + 0.6 * nzv * min(1.0, d / (0.12 * H))
    ENVC.append((r, c, ch, col, tb, HS[r][c], HS2[r][c], x, y))
    if in_seal(x, y):
        SEALC.append((r, c))
ENV_SORTED = sorted(ENVC, key=lambda e: e[4])
TBS = [e[4] for e in ENV_SORTED]
SHDC = []
for r, c, x, y in SHD:
    d = m.hypot(x - IGX, y - IGY)
    tb = T_SPREAD * (d / MAXD) ** 0.92
    ex = max(0.0, x - EX1, EX0 - x)
    ey = max(0.0, y - EY1, EY0 - y)
    f = 1 - clamp(m.hypot(ex, ey) / (2.0 * CW))
    SHDC.append((r, c, ":" if f > 0.45 else ".", sc((0.12, 0.08, 0.06), 0.35 + 0.65 * f), tb, HS[r][c]))

BED = []
RB0 = int(EY1 / CH) + 1
for rr_ in (RB0, RB0 + 1):
    if rr_ >= ROWS:
        continue
    for c in range(COLS):
        x = (c + 0.5) * CW
        u = 1 - ((x - CX) / (EW * 0.50)) ** 2
        if u > 0.12:
            BED.append((rr_, c, u ** 0.5, HS[rr_][c], rr_ == RB0))

RX = CX
RR = 0.215 * H
RY = 0.355 * H
UMB_Y = RY + 0.42 * RR
STEM_Y1 = 0.905 * H
HEAD_B = UMB_Y
TOP_Y = RY - 1.28 * RR
STEM_HW = 0.85 * CW

GREEN_D = (0.03, 0.15, 0.06)
GREEN_L = (0.16, 0.48, 0.20)
ANTHER_GOLD = (1.00, 0.78, 0.36)
ANTHER_WARM = (1.00, 0.48, 0.28)


def stem_x(y):
    return RX + 0.015 * H * m.sin((y - UMB_Y) / (0.19 * H))


FLORETS = [
    (-0.46, 0.08, 0.22),
    (-0.24, -0.04, 0.24),
    (0.00, -0.09, 0.25),
    (0.24, -0.04, 0.24),
    (0.46, 0.08, 0.22),
    (-0.14, 0.12, 0.22),
    (0.14, 0.12, 0.22),
]

TEPALS = sorted([
    (0.00, -0.05, 90, 0.56, 0.105, 0.22, 0.0, 2),
    (-0.12, -0.04, 108, 0.62, 0.105, 0.34, 1.2, 2),
    (0.12, -0.04, 72, 0.62, 0.105, -0.34, 2.4, 2),
    (-0.26, 0.00, 128, 0.68, 0.110, 0.42, 0.7, 2),
    (0.26, 0.00, 52, 0.68, 0.110, -0.42, 1.9, 2),
    (-0.38, 0.05, 146, 0.72, 0.110, 0.48, 2.9, 2),
    (0.38, 0.05, 34, 0.72, 0.110, -0.48, 0.5, 2),
    (-0.44, 0.09, 166, 0.78, 0.112, 0.55, 3.1, 1),
    (0.44, 0.09, 14, 0.78, 0.112, -0.55, 0.4, 1),
    (-0.46, 0.14, 185, 0.75, 0.108, 0.52, 2.0, 1),
    (0.46, 0.14, -5, 0.75, 0.108, -0.52, 4.2, 1),
    (-0.22, 0.06, 152, 0.65, 0.102, 0.40, 5.1, 1),
    (0.22, 0.06, 28, 0.65, 0.102, -0.40, 1.5, 1),
    (-0.08, 0.04, 118, 0.58, 0.100, 0.30, 3.8, 1),
    (0.08, 0.04, 62, 0.58, 0.100, -0.30, 2.7, 1),
    (-0.36, 0.16, 206, 0.70, 0.102, 0.46, 0.9, 0),
    (0.36, 0.16, -26, 0.70, 0.102, -0.46, 2.8, 0),
    (-0.22, 0.18, 226, 0.64, 0.098, 0.38, 4.5, 0),
    (0.22, 0.18, -46, 0.64, 0.098, -0.38, 1.1, 0),
    (-0.10, 0.20, 248, 0.56, 0.095, 0.26, 3.3, 0),
    (0.10, 0.20, -68, 0.56, 0.095, -0.26, 5.4, 0),
], key=lambda z: -z[7])

STAMENS_DEF = [
    ((-0.44, 0.06), (-0.98, 0.18), (-1.45, -0.10), (-1.62, -0.56), 2),
    ((-0.40, 0.03), (-0.92, 0.02), (-1.38, -0.32), (-1.50, -0.80), 2),
    ((-0.34, 0.00), (-0.82, -0.14), (-1.24, -0.52), (-1.30, -0.98), 2),
    ((-0.26, -0.03), (-0.68, -0.28), (-1.04, -0.70), (-1.04, -1.12), 2),
    ((-0.18, -0.05), (-0.50, -0.40), (-0.78, -0.82), (-0.74, -1.20), 2),
    ((-0.10, -0.07), (-0.30, -0.48), (-0.48, -0.90), (-0.42, -1.24), 2),
    ((-0.03, -0.08), (-0.12, -0.52), (-0.18, -0.94), (-0.12, -1.26), 2),
    ((0.03, -0.08), (0.12, -0.52), (0.18, -0.94), (0.12, -1.26), 2),
    ((0.10, -0.07), (0.30, -0.48), (0.48, -0.90), (0.42, -1.24), 2),
    ((0.18, -0.05), (0.50, -0.40), (0.78, -0.82), (0.74, -1.20), 2),
    ((0.26, -0.03), (0.68, -0.28), (1.04, -0.70), (1.04, -1.12), 2),
    ((0.34, 0.00), (0.82, -0.14), (1.24, -0.52), (1.30, -0.98), 2),
    ((0.40, 0.03), (0.92, 0.02), (1.38, -0.32), (1.50, -0.80), 2),
    ((0.44, 0.06), (0.98, 0.18), (1.45, -0.10), (1.62, -0.56), 2),
    ((-0.46, 0.10), (-1.00, 0.36), (-1.48, 0.16), (-1.68, -0.26), 2),
    ((0.46, 0.10), (1.00, 0.36), (1.48, 0.16), (1.68, -0.26), 2),
    ((-0.42, 0.14), (-0.94, 0.52), (-1.38, 0.40), (-1.58, 0.04), 1),
    ((0.42, 0.14), (0.94, 0.52), (1.38, 0.40), (1.58, 0.04), 1),
    ((-0.34, 0.16), (-0.78, 0.62), (-1.18, 0.58), (-1.36, 0.28), 0),
    ((0.34, 0.16), (0.78, 0.62), (1.18, 0.58), (1.36, 0.28), 0),
    ((-0.28, 0.08), (-0.68, 0.16), (-1.06, -0.04), (-1.16, -0.44), 1),
    ((0.28, 0.08), (0.68, 0.16), (1.06, -0.04), (1.16, -0.44), 1),
    ((-0.14, 0.06), (-0.38, -0.08), (-0.62, -0.38), (-0.64, -0.76), 1),
    ((0.14, 0.06), (0.38, -0.08), (0.62, -0.38), (0.64, -0.76), 1),
]

STAMEN_PTS = []
for _idx, (_p0, _p1, _p2, _p3, _prio) in enumerate(STAMENS_DEF):
    _pts = []
    for _i in range(55):
        _t = _i / 54.0
        _u = 1.0 - _t
        _bx = (_u**3 * _p0[0] + 3*_u*_u*_t * _p1[0] + 3*_u*_t*_t * _p2[0] + _t**3 * _p3[0]) * RR + RX
        _by = (_u**3 * _p0[1] + 3*_u*_u*_t * _p1[1] + 3*_u*_t*_t * _p2[1] + _t**3 * _p3[1]) * RR + RY
        _tx = 3*_u*_u*(_p1[0]-_p0[0]) + 6*_u*_t*(_p2[0]-_p1[0]) + 3*_t*_t*(_p3[0]-_p2[0])
        _ty = 3*_u*_u*(_p1[1]-_p0[1]) + 6*_u*_t*(_p2[1]-_p1[1]) + 3*_t*_t*(_p3[1]-_p2[1])
        _pts.append((_bx, _by, _t, _tx, _ty, _prio, _idx))
    STAMEN_PTS.append(_pts)


def tepal_hit(x, y, ax, ay, ang, L, Wd, bend, wave_ph):
    ca, sa = m.cos(ang * D2R), m.sin(ang * D2R)
    dx, dy = x - ax, y - ay
    s = (dx * ca - dy * sa) / L
    if s < 0 or s > 1:
        return None
    ruffle = 0.032 * RR * m.sin(s * 16.0 + wave_ph) * (s ** 0.6)
    curve = bend * L * (s ** 1.75) + ruffle
    v = dx * sa + dy * ca - curve
    w = Wd * (m.sin(m.pi * (s ** 0.68)) ** 0.82) * (1 + 0.14 * m.sin(s * 26 + wave_ph))
    if w <= 0.25 or abs(v) > w:
        return None
    return s, v / w


def stamen_hit(x, y):
    best = None
    best_d = 1e9
    for pts in STAMEN_PTS:
        for bx, by, t, tx, ty, prio, idx in pts:
            rx = CW * (0.90 if t > 0.915 else 0.56)
            ry = CH * (0.68 if t > 0.915 else 0.46)
            d = m.hypot((x - bx) / rx, (y - by) / ry)
            if d <= 1.0 and d < best_d:
                best_d = d
                best = (t, d, tx, ty, prio, idx)
    return best


def rose_sample(x, y):
    dx, dy = (x - RX) / RR, (y - RY) / RR
    st_ = stamen_hit(x, y)
    if st_ and st_[4] >= 2:
        return ("stamen", st_[0], st_[1], st_[2], st_[3], st_[5])
    for ax, ay, ang, L, Wd, bend, wph, lay in TEPALS:
        h_ = tepal_hit(x, y, RX + ax * RR, RY + ay * RR, ang, L * RR, Wd * RR, bend, wph)
        if h_:
            return ("tepal", h_[0], h_[1], lay)
    for fx, fy, fr in FLORETS:
        d = m.hypot((dx - fx) / (fr * 1.15), (dy - fy) / (fr * 0.85))
        if d <= 1.0:
            return ("core", d, dx - fx, dy - fy)
    if st_:
        return ("stamen", st_[0], st_[1], st_[2], st_[3], st_[5])
    ux, uy = stem_x(UMB_Y), UMB_Y
    for fx, fy, _ in FLORETS:
        tx, ty = RX + fx * RR, RY + fy * RR + 0.08 * RR
        vx, vy = tx - ux, ty - uy
        L2 = vx * vx + vy * vy + 1e-9
        s = ((x - ux) * vx + (y - uy) * vy) / L2
        if 0 <= s <= 1:
            px, py = ux + s * vx, uy + s * vy
            if abs(x - px) <= 0.65 * CW and abs(y - py) <= 0.55 * CH:
                return ("pedicel", s, (x - px) / (0.65 * CW))
    if abs(y - UMB_Y) <= 0.12 * RR and abs(x - ux) <= 0.16 * RR:
        return ("bract", (x - ux) / (0.16 * RR))
    if UMB_Y <= y <= STEM_Y1:
        sxv = stem_x(y)
        if abs(x - sxv) <= STEM_HW:
            return ("stem", (x - sxv) / STEM_HW, y)
    return None


def rch(I):
    return RCH[int(clamp(0.20 + 0.80 * I) * (len(RCH) - 0.01))]


def contrast(I):
    return clamp(0.52 + (I - 0.45) * 1.45)


def rose_style(smp, hs, hs2):
    kind = smp[0]
    if kind == "stamen":
        _, t, d, tx, ty, _ = smp
        if t > 0.915:
            k = clamp((t - 0.915) / 0.085)
            return ("*" if d < 0.55 else "o"), mix(ANTHER_WARM, ANTHER_GOLD, k * (0.75 + 0.25 * hs))
        ang = m.atan2(ty, tx)
        ca, sa = abs(m.cos(ang)), abs(m.sin(ang))
        ch = "-" if ca > 0.88 else "|" if sa > 0.88 else ("\\" if tx * ty > 0 else "/")
        I = contrast(clamp(0.42 + 0.48 * (t ** 0.85) + 0.12 * (1 - d) + 0.08 * hs))
        col = RLUT[int(I * 63)]
        if t > 0.78:
            col = mix(col, ANTHER_WARM, (t - 0.78) * 1.8)
        return ch, col
    if kind == "tepal":
        _, s, v, lay = smp
        base_i = (0.34, 0.46, 0.58)[lay]
        midrib = m.exp(-((v * 3.2) ** 2))
        edge = abs(v) ** 1.6
        I = base_i + 0.28 * midrib + 0.22 * edge - 0.18 * (s ** 1.4)
        I = contrast(clamp(I * (0.92 + 0.16 * hs)))
        if hs2 > 0.982 and s > 0.35:
            return "*", (1.0, 0.76, 0.64)
        return rch(I), RLUT[int(I * 63)]
    if kind == "core":
        _, d, lx, ly = smp
        I = contrast(clamp((0.28 + 0.42 * (1 - d) - 0.18 * ly + 0.12 * lx) * (0.9 + 0.2 * hs)))
        return rch(I), RLUT[int(I * 63)]
    if kind == "pedicel":
        _, s, v = smp
        return ":", mix(mix(GREEN_D, GREEN_L, clamp(0.6 - 0.4 * v)), (0.52, 0.08, 0.10), clamp(s * 0.75))
    if kind == "bract":
        return "@", mix(GREEN_D, (0.32, 0.22, 0.10), clamp(0.5 - 0.5 * smp[1]))
    if kind == "stem":
        _, v, y = smp
        is_node = abs(((y - UMB_Y) % (0.16 * H)) - 0.08 * H) < 0.45 * CH
        col = mix(GREEN_D, GREEN_L, clamp(0.52 - 0.48 * v + (0.15 if is_node else 0.0)))
        return ("=" if is_node else ("|" if hs < 0.85 else ":")), col
    return "#", RLUT[32]


RAWR = []
for r in range(ROWS):
    y = (r + 0.5) * CH
    for c in range(COLS):
        x = (c + 0.5) * CW
        smp = rose_sample(x, y)
        if smp is not None:
            RAWR.append((r, c, smp, HS[r][c], HS2[r][c], x, y))
ROSEMASK = {(e[0], e[1]) for e in RAWR}
EDGE = set()
HALO = set()
for r_, c_ in ROSEMASK:
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        if (r_ + dr, c_ + dc) not in ROSEMASK:
            EDGE.add((r_, c_))
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            q = (r_ + dr, c_ + dc)
            if q not in ROSEMASK:
                HALO.add(q)

ROSEC = []
for r, c, smp, hs, hs2, x, y in RAWR:
    ch, col = rose_style(smp, hs, hs2)
    key = clamp((y - TOP_Y) / (STEM_Y1 - TOP_Y))
    tk_ = T_R0 + 0.1 + key * T_FORM + rng.random() * 0.40
    ROSEC.append((tk_, r, c, ch, col, x, y, (r, c) in EDGE, hs))

RP = []
for tk_, r, c, ch, col, x, y, ed, hs in ROSEC:
    lim = tk_ - T_BURN - 0.85
    n = bisect.bisect_right(TBS, lim)
    src = ENV_SORTED[rng.randrange(max(1, n))]
    sx_, sy_ = src[7], src[8]
    ts = max(T_BURN + src[4] + 0.1, tk_ - 2.2)
    ts = min(ts, tk_ - 0.75)
    dx_, dy_ = x - sx_, y - sy_
    dd = m.hypot(dx_, dy_) + 1e-6
    RP.append((ts, tk_, sx_, sy_, x, y, -dy_ / dd, dx_ / dd,
               rng.uniform(-0.12, 0.12) * dd, rng.uniform(0.05, 0.13) * H, rng.uniform(0, 6.28)))


def fpos(f, s):
    ts, tk_, sx_, sy_, tx, ty, nx, ny, amp, lift, ph = f
    e = s * s * (3 - 2 * s)
    sn = m.sin(m.pi * s)
    x = sx_ + (tx - sx_) * e + nx * amp * sn + 3.0 * S * m.sin(s * 13 + ph) * (1 - s)
    y = sy_ + (ty - sy_) * e + ny * amp * sn - lift * sn
    return x, y


LX, LY = RX, RY
NB = 720
BGE = []
for r in range(ROWS):
    y = (r + 0.5) * CH
    for c in range(COLS):
        if (r, c) in ROSEMASK:
            continue
        x = (c + 0.5) * CW
        dx_, dy_ = x - LX, y - LY
        a_ = m.atan2(dy_, dx_)
        dn = m.hypot(dx_, dy_) / (0.55 * H)
        ab = int(((a_ + m.pi) / (2 * m.pi)) * NB) % NB
        BGE.append((r, c, ab, dn, (r, c) in HALO))
NCH = 3
BGCH = [BGE[i::NCH] for i in range(NCH)]
BGC = {}
RAYF = [0.0] * NB
RAYM = [0.0] * NB
LIGHTC = (0.55, 0.75, 1.0)
WHITE = (0.95, 0.98, 1.0)
BGRAMP = ".:-=+*#"


def bg_tables(tt):
    for i in range(NB):
        a = -m.pi + (i + 0.5) * (2 * m.pi / NB)
        r1 = (0.5 + 0.5 * m.sin(a * 23 + 1.6 * m.sin(a * 3 + tt * 0.15) + tt * 0.10)) ** 6
        r2 = (0.5 + 0.5 * m.sin(a * 47 - tt * 0.12 + 1.5 * m.sin(a * 5 - tt * 0.10))) ** 9
        r3 = (0.5 + 0.5 * m.sin(a * 11 + tt * 0.08)) ** 4
        RAYF[i] = 0.55 * r1 + 0.50 * r2 + 0.20 * r3
        mn = 0.0
        for k in range(8):
            d = abs((a - k * m.pi / 4 + m.pi) % (2 * m.pi) - m.pi)
            if d < 0.3:
                mn += (1.0 if k % 2 == 0 else 0.65) * m.exp(-(d / 0.045) ** 2) * (0.88 + 0.12 * m.sin(tt * 0.9 + k * 1.3))
        RAYM[i] = mn


def bg_eval(e, tt, gt):
    r, c, ab, dn, halo = e
    core = m.exp(-dn * 2.8)
    glow = m.exp(-dn * 1.3)
    I = (0.95 * core + 0.16 * glow
         + 0.62 * RAYF[ab] * m.exp(-dn * 1.9)
         + 0.85 * RAYM[ab] * m.exp(-dn * 1.05)) * gt
    if halo:
        I *= 0.22
    if I < 0.05:
        return None
    I = min(I, 1.3)
    ch = BGRAMP[min(len(BGRAMP) - 1, int(I * len(BGRAMP) * 0.8))]
    return ch, BLUE[int(clamp(I) * 63)]


MOTES = [[rng.uniform(0, W), rng.uniform(0, H), rng.uniform(0.01, 0.04) * H, rng.uniform(0, 6.28),
          rng.uniform(0.5, 1.0)] for _ in range(46)]
STARS = []
for _ in range(60):
    rr_, cc_ = rng.randrange(ROWS), rng.randrange(COLS)
    if (rr_, cc_) not in ROSEMASK:
        STARS.append((rr_, cc_, rng.uniform(0, 6.28), rng.uniform(0.6, 2.2)))


def draw_ambient(t, dt, gt, new):
    base = 0.20 + 0.80 * gt
    for rr, cc, ph, sp in STARS:
        v = 0.5 + 0.5 * m.sin(t * sp + ph)
        if v > 0.35:
            a = base * (v - 0.35) / 0.65
            ch = "*" if v > 0.9 else "+" if v > 0.7 else "."
            new[(rr, cc)] = (ch, sc(mix((0.70, 0.85, 1.0), WHITE, v), 0.25 + 0.75 * a))
    if gt < 0.02:
        return
    for p in MOTES:
        p[1] -= p[2] * dt
        p[0] += 6 * S * m.sin(t * 0.8 + p[3]) * dt
        if p[1] < -4:
            p[1] = H + 4
            p[0] = rng.uniform(0, W)
        rr, cc = int(p[1] // CH), int(p[0] // CW)
        if 0 <= rr < ROWS and 0 <= cc < COLS and (rr, cc) not in ROSEMASK:
            v = gt * p[4] * (0.5 + 0.5 * m.sin(t * 1.7 + p[3]))
            if v > 0.12:
                new[(rr, cc)] = ("." if v < 0.5 else ":", sc(mix(LIGHTC, WHITE, p[4]), 0.4 + 0.6 * v))


ARW = [(0.0, 0.0), (0.0, 0.86), (0.19, 0.69), (0.31, 0.99), (0.44, 0.93), (0.32, 0.65), (0.58, 0.65)]
PH_ = 0.21 * H
POLY = [(x * PH_, y * PH_) for x, y in ARW]


def _pip(px, py):
    ins = False
    j = len(POLY) - 1
    for i in range(len(POLY)):
        xi, yi = POLY[i]
        xj, yj = POLY[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi:
            ins = not ins
        j = i
    return ins


def _pdist(px, py):
    best = 1e9
    for i in range(len(POLY)):
        ax, ay = POLY[i]
        bx, by = POLY[(i + 1) % len(POLY)]
        vx, vy = bx - ax, by - ay
        L2 = vx * vx + vy * vy + 1e-9
        t_ = clamp(((px - ax) * vx + (py - ay) * vy) / L2)
        d = m.hypot(px - (ax + vx * t_), py - (ay + vy * t_))
        if d < best:
            best = d
    return best


CUR_FILL, CUR_EDGE, CUR_GLOW, CUR_SHAD = [], [], [], []
_occ = set()
_NC, _NR = int(0.58 * PH_ / CW) + 3, int(PH_ / CH) + 3
for j in range(_NR):
    for i in range(_NC):
        cin = core = 0
        for sy in (1 / 6, 3 / 6, 5 / 6):
            for sx in (1 / 6, 3 / 6, 5 / 6):
                px, py = (i + sx) * CW, (j + sy) * CH
                if _pip(px, py):
                    cin += 1
                    if _pdist(px, py) > 0.9 * CW:
                        core += 1
        cxm, cym = (i + 0.5) * CW, (j + 0.5) * CH
        h_ = ((j * 7 + i * 13) % 10) / 10.0
        if core >= 5:
            t_ = clamp((cym / PH_) * 0.85 + (cxm / (0.58 * PH_)) * 0.15)
            col = mix((0.52, 0.22, 0.97), (1.0, 0.42, 0.74), t_)
            bev = _pdist(cxm, cym) < 1.8 * CW
            if bev:
                col = mix(col, (1.0, 0.92, 1.0), 0.20)
            CUR_FILL.append((j, i, "%" if bev else "@", col, h_))
            _occ.add((j, i))
        elif cin >= 3:
            CUR_EDGE.append((j, i, h_))
            _occ.add((j, i))
        else:
            d = _pdist(cxm, cym)
            if d < 1.9 * CW:
                CUR_GLOW.append((j, i, 1 - d / (1.9 * CW), h_))
for (j, i) in list(_occ):
    if (j + 1, i + 1) not in _occ:
        CUR_SHAD.append((j + 1, i + 1))

TGX, TGY = CX - 0.004 * W, HCY - 0.015 * H


def cursor_pos(t):
    s = clamp((t - T_CUR0) / (T_CUR1 - T_CUR0))
    k = 1 - (1 - s) ** 3.5
    p0 = (1.10 * W, 0.04 * H)
    p1 = (0.95 * W, 0.80 * H)
    p2 = (0.64 * W, 0.78 * H)
    p3 = (TGX, TGY)
    u = 1 - k
    x = u ** 3 * p0[0] + 3 * u * u * k * p1[0] + 3 * u * k * k * p2[0] + k ** 3 * p3[0]
    y = u ** 3 * p0[1] + 3 * u * u * k * p1[1] + 3 * u * k * k * p2[1] + k ** 3 * p3[1]
    return x, y


items = {}
prev = {}
sparks = []
smoke = []
bits = []
st = {"burst": False, "click": False, "hot": False}
HEAT = [[0.0] * COLS for _ in range(ROWS + 2)]
FSET = {1: ".'", 2: ":.", 3: "^'", 4: "^*", 5: "*(", 6: "(+)", 7: "%&", 8: "#%", 9: "#@", 10: "@"}
frame = [0]


def bed_k(t):
    a = clamp((t - (T_BURN + 0.25)) / 1.2)
    b = clamp((t - (T_BURN + T_SPREAD + 0.6)) / 1.6)
    return ease(a) * (1 - ease(b))


def fire_step(src, t):
    out = {}
    if not src and not st["hot"]:
        return out
    last = COLS - 1
    rnd = rng.random
    fr = frame[0]
    anyhot = False
    for r in range(ROWS):
        row, b1, b2 = HEAT[r], HEAT[r + 1], HEAT[r + 2]
        for c in range(COLS):
            q = rnd()
            w = c - 1 if q < 0.27 else c + 1 if q > 0.73 else c
            if w < 0:
                w = 0
            elif w > last:
                w = last
            cl = c - 1 if c > 0 else 0
            cr = c + 1 if c < last else last
            v = (b1[w] * 2 + b1[cl] + b1[cr] + b2[c]) * 0.2 - (0.030 + 0.062 * ((q * 7.0) % 1.0))
            row[c] = v if v > 0 else 0.0
    for (r, c), v in src.items():
        if v > HEAT[r][c]:
            HEAT[r][c] = v
    for r in range(ROWS):
        row = HEAT[r]
        for c in range(COLS):
            v = row[c]
            if v > 0.10:
                anyhot = True
                i = min(10, int(v * 10.5))
                s_ = FSET[i]
                out[(r, c)] = (s_[(c * 3 + r * 7 + fr) % len(s_)], LUT[int(clamp(v) * 63)])
            elif v > 0.01:
                anyhot = True
    st["hot"] = anyhot
    return out


def draw_cursor(t, new):
    a = clamp((t - T_CUR0) / 0.3)
    bt = t - T_BURN
    if a <= 0 or bt > 1.1:
        return
    px, py = cursor_pos(t)
    c0, r0 = int(px // CW), int(py // CH)
    press = T_CLICK <= t < T_CLICK + 0.20
    if press:
        c0 += 1
        r0 += 1
    bk = clamp(bt) if bt > 0 else 0.0
    if T_CUR0 < t < T_CUR1 + 0.15:
        for q in range(1, 11):
            tx_, ty_ = cursor_pos(t - 0.05 * q)
            rr, cc = int(ty_ // CH), int(tx_ // CW)
            if 0 <= rr < ROWS and 0 <= cc < COLS:
                v = (1 - q / 11.0) * 0.8
                new[(rr, cc)] = ("+" if q < 4 else ".", (0.58 * v, 0.24 * v, 0.95 * v))
    for j, i in CUR_SHAD:
        rr, cc = r0 + j, c0 + i
        if 0 <= rr < ROWS and 0 <= cc < COLS and bk < 0.5:
            und = new.get((rr, cc))
            ucol = und[1] if und else BG
            new[(rr, cc)] = (":", mix(ucol, (0.03, 0.01, 0.06), 0.65 * a))
    for j, i, g, hh in CUR_GLOW:
        rr, cc = r0 + j, c0 + i
        if 0 <= rr < ROWS and 0 <= cc < COLS and hh < 0.7 and bk < 0.6:
            v = a * g * (1 - bk) * 0.85
            new[(rr, cc)] = (":" if g > 0.5 else ".", (0.55 * v, 0.18 * v, 0.78 * v))
    for j, i, hh in CUR_EDGE:
        if hh < bk:
            continue
        rr, cc = r0 + j, c0 + i
        if 0 <= rr < ROWS and 0 <= cc < COLS:
            col = (0.98, 0.86, 1.0)
            if press:
                col = (1.0, 1.0, 1.0)
            if bk > 0:
                col = mix(col, LUT[int(clamp(0.55 + 0.4 * (1 - hh)) * 63)], clamp(bk * 1.6))
            new[(rr, cc)] = ("#", sc(col, a))
    for j, i, ch, col, hh in CUR_FILL:
        if hh < bk:
            continue
        rr, cc = r0 + j, c0 + i
        if not (0 <= rr < ROWS and 0 <= cc < COLS):
            continue
        if press:
            col = mix(col, (1.0, 0.96, 1.0), 0.55)
        if bk > 0:
            col = mix(col, LUT[int(clamp(0.55 + 0.4 * (1 - hh)) * 63)], clamp(bk * 1.6))
        new[(rr, cc)] = (ch, sc(col, a))


def _ring_cells(cx, cy, pad):
    for rr in range(max(0, int((cy - pad) // CH)), min(ROWS, int((cy + pad) // CH) + 1)):
        y = (rr + 0.5) * CH
        for cc in range(max(0, int((cx - pad) // CW)), min(COLS, int((cx + pad) // CW) + 1)):
            yield rr, cc, (cc + 0.5) * CW, y


def draw_click(t, dt, new):
    a = t - T_CLICK
    if not st["click"] and a >= 0:
        st["click"] = True
        for _ in range(52):
            ang = rng.uniform(0, 2 * m.pi)
            sp = rng.uniform(120, 560) * S
            bits.append([TGX, TGY, m.cos(ang) * sp, m.sin(ang) * sp, 0.0, rng.uniform(0.5, 1.1)])
    if a < 0 or a > 1.2:
        return
    if a < 0.25:
        k = a / 0.25
        rad = 0.03 * H + 0.05 * H * k
        for rr, cc, x, y in _ring_cells(TGX, TGY, rad + CW):
            d = m.hypot(x - TGX, y - TGY)
            if d < rad:
                v = (1 - k) * (1 - d / rad * 0.5)
                und = new.get((rr, cc))
                col = mix((1.0, 0.9, 1.0), (0.85, 0.5, 1.0), k)
                new[(rr, cc)] = ("@" if v > 0.5 else "#", mix(und[1], col, clamp(v * 1.3)) if und else sc(col, v))
    for d0, c0_, c1_ in ((0.0, (0.65, 0.30, 1.0), (1.0, 0.55, 0.9)),
                         (0.13, (0.55, 0.25, 0.95), (1.0, 0.65, 0.95)),
                         (0.26, (0.50, 0.30, 1.0), (1.0, 0.85, 1.0))):
        aa = a - d0
        if aa < 0 or aa > 0.9:
            continue
        k = aa / 0.9
        rad = 0.02 * H + 0.26 * H * (1 - (1 - k) ** 2.2)
        th = (1.7 - 1.0 * k) * CW
        al = (1 - k) ** 1.2
        col = mix(c0_, c1_, k)
        for rr, cc, x, y in _ring_cells(TGX, TGY, rad + th):
            q = abs(m.hypot(x - TGX, y - TGY) - rad) / th
            if q >= 1:
                continue
            v = (1 - q) * al * 1.5
            c2 = sc(col, clamp(v))
            und = new.get((rr, cc))
            if und:
                c2 = mix(und[1], col, clamp(v * 0.85))
            new[(rr, cc)] = ("O" if q < 0.35 else "o" if q < 0.65 else ".", c2)
    if a < 0.55:
        k = a / 0.55
        l0 = 0.03 * H + 0.05 * H * k
        l1 = 0.06 * H + 0.24 * H * (1 - (1 - k) ** 2)
        steps = int((l1 - l0) / (CW * 0.9)) + 1
        for n in range(14):
            ang = n * 2 * m.pi / 14 + 0.2
            ca, sa = m.cos(ang), m.sin(ang)
            chr_ = "-" if abs(ca) > 0.92 else "|" if abs(sa) > 0.92 else ("\\" if ca * sa > 0 else "/")
            for s_ in range(steps):
                f = s_ / steps
                dist = l0 + (l1 - l0) * f
                rr, cc = int((TGY + sa * dist) // CH), int((TGX + ca * dist) // CW)
                if 0 <= rr < ROWS and 0 <= cc < COLS:
                    v = (1 - k) * (1 - 0.6 * f)
                    new[(rr, cc)] = (chr_, sc(mix((1.0, 0.9, 1.0), (0.7, 0.35, 1.0), f), clamp(v * 1.3)))
    alive = []
    for b in bits:
        b[4] += dt
        if b[4] >= b[5]:
            continue
        b[2] *= (1 - 2.0 * dt)
        b[3] = b[3] * (1 - 2.0 * dt) + 60 * S * dt
        b[0] += b[2] * dt
        b[1] += b[3] * dt
        k = b[4] / b[5]
        rr, cc = int(b[1] // CH), int(b[0] // CW)
        if 0 <= rr < ROWS and 0 <= cc < COLS:
            new[(rr, cc)] = ("*" if k < 0.4 else "+" if k < 0.7 else ".",
                             sc(mix((1.0, 0.92, 1.0), (0.62, 0.28, 0.95), k), 1 - 0.5 * k))
        alive.append(b)
    bits[:] = alive


def render(t, dt):
    global prev
    frame[0] += 1
    new = {}
    gt = ease((t - T_GLOW) / 3.6)

    if gt > 0.003:
        if frame[0] % NCH == 0 or BGC == {}:
            bg_tables(t)
        for e in BGCH[frame[0] % NCH]:
            res = bg_eval(e, t, gt)
            if res:
                BGC[(e[0], e[1])] = res
            else:
                BGC.pop((e[0], e[1]), None)
        new.update(BGC)
    draw_ambient(t, dt, gt, new)

    tbn = t - T_BURN
    pin = clamp(t / T_ENV_IN)

    for r, c, ch, col, tb, hs in SHDC:
        if tbn - tb >= 0:
            continue
        vis = pin * 1.3 - hs * 0.5
        if vis > 0:
            new[(r, c)] = (ch, sc(col, min(1.0, vis * 1.6)))

    front = []
    src = {}
    rnd = rng.random
    for r, c, ch, col, tb, hs, hs2, x, y in ENVC:
        tau = tbn - tb
        if tau >= 1.35:
            continue
        if tau < 0:
            vis = pin * 1.3 - hs * 0.5
            if vis <= 0:
                continue
            k = min(1.0, vis * 1.6)
            if tbn > 0 and tau > -0.5:
                w = (tau + 0.5) * 2.0
                col = mix(col, (0.30, 0.10, 0.03), w * 0.75)
                if w > 0.6:
                    col = mix(col, (1.0, 0.38, 0.05), (w - 0.6) * 1.3)
            new[(r, c)] = (ch, (col[0] * k, col[1] * k, col[2] * k))
            continue
        if tau < 0.50:
            src[(r, c)] = 0.72 + 0.28 * rnd()
        elif tau < 0.95:
            src[(r, c)] = (0.45 + 0.15 * rnd()) * (1 - (tau - 0.50) / 0.45)
        if tau < 0.38:
            q = tau / 0.38
            T = clamp(0.98 - 0.62 * q + 0.14 * nz(t * 9 + hs * 20))
            ch2 = ("@#&%" if q < 0.6 else "#%=+")[int(hs2 * 4) % 4]
            new[(r, c)] = (ch2, LUT[int(T * 63)])
            front.append((x, y))
        else:
            a = 1 - (tau - 0.38) / 0.97
            if hs2 > a ** 0.7:
                continue
            if ((hs * 37.0 + t * 1.6) % 1.0) > 0.84 - 0.08 * a:
                new[(r, c)] = ("*", LUT[int(clamp(0.28 + 0.5 * a) * 63)])
            else:
                kk = 0.45 + 0.9 * a
                new[(r, c)] = ("%#="[int(hs * 3) % 3], (0.13 * kk, 0.07 * kk, 0.05 * kk))

    if T_CUR1 - 0.3 <= t < T_BURN + 0.02:
        if t < T_CLICK:
            k = 0.28 * ease((t - (T_CUR1 - 0.3)) / 0.3) * (0.8 + 0.2 * m.sin(t * 9))
            mf = lambda col: mix(col, (1.0, 0.85, 1.0), k)
        elif t < T_CLICK + 0.20:
            mf = lambda col: sc(col, 0.62)
        else:
            k = 0.7 * (1 - clamp((t - T_CLICK - 0.2) / 0.15))
            mf = lambda col: mix(col, (1.0, 0.9, 0.8), k)
        for key in SEALC:
            v = new.get(key)
            if v:
                new[key] = (v[0], mf(v[1]))

    bk = bed_k(t)
    if bk > 0.01:
        for rr, cc, shp, hs, top in BED:
            fl = 0.5 + 0.5 * m.sin(t * 6 + hs * 40)
            T = clamp(bk * shp * (0.25 + 0.45 * fl + 0.2 * hs))
            if T > 0.08:
                new[(rr, cc)] = ("=%#@"[int(hs * 4) % 4], LUT[int(T * 63)])
            if top:
                src[(rr, cc)] = bk * shp * (0.50 + 0.38 * rnd())
        for rr, cc, shp, hs, top in BED:
            if top and rnd() < 0.5 * dt * 10 * bk * shp:
                front.append(((cc + 0.5) * CW, (rr + 0.5) * CH))

    new.update(fire_step(src, t))

    rim = 0.65 * gt
    for tk_, r, c, ch, col, x, y, ed, hs in ROSEC:
        if t < tk_:
            continue
        heat = 1.0 - (t - tk_)
        if heat > 0:
            hh = heat ** 1.4
            col = mix(col, LUT[int(clamp(0.35 + 0.65 * hh) * 63)], clamp(hh * 1.15))
            if hh > 0.5:
                ch = "@"
        elif ed and rim > 0.01:
            col = mix(col, (0.72, 0.88, 1.0), rim)
            if hs > 0.9 and m.sin(t * 3 + hs * 40) > 0.85:
                ch, col = "*", (0.88, 0.96, 1.0)
        new[(r, c)] = (ch, col)

    for f in RP:
        ts, tk_ = f[0], f[1]
        if t < ts or t >= tk_:
            continue
        s = (t - ts) / (tk_ - ts)
        for lag, chh, dim in ((0.0, "*", 1.0), (0.06, "+", 0.8), (0.12, ".", 0.6)):
            ss = s - lag
            if ss < 0:
                break
            x_, y_ = fpos(f, ss)
            rr, cc = int(y_ // CH), int(x_ // CW)
            if 0 <= rr < ROWS and 0 <= cc < COLS:
                T = clamp((0.45 + 0.55 * s) * dim)
                new[(rr, cc)] = (chh, LUT[int(T * 63)])

    if t >= T_BURN and not st["burst"]:
        st["burst"] = True
        for _ in range(150):
            a_ = rng.uniform(-170, -10) * D2R
            sp_ = rng.uniform(100, 560) * S
            sparks.append([IGX, IGY, m.cos(a_) * sp_, m.sin(a_) * sp_, 0.0,
                           rng.uniform(0.6, 1.6), -rng.uniform(20, 120) * S])
    if front and t < T_FIRE_END:
        n = int(380 * dt * min(1.0, len(front) / 50.0) + rng.random())
        for _ in range(n):
            x_, y_ = front[rng.randrange(len(front))]
            a_ = rng.uniform(-125, -55) * D2R
            sp_ = rng.uniform(60, 360) * S
            sparks.append([x_, y_, m.cos(a_) * sp_, m.sin(a_) * sp_, 0.0,
                           rng.uniform(0.7, 1.9), -rng.uniform(25, 140) * S])
        if rng.random() < 22 * dt:
            x_, y_ = front[rng.randrange(len(front))]
            smoke.append([x_, y_ - 0.05 * H, rng.uniform(-6, 6) * S, -rng.uniform(25, 55) * S, 0.0,
                          rng.uniform(1.8, 3.2), rng.uniform(0, 6.28), SMOKE_C])
    if t > T_R0 + T_FORM and gt > 0.2:
        for _ in range(int(6 * dt + rng.random())):
            sparks.append([RX + rng.uniform(-0.9, 0.9) * RR, RY + rng.uniform(-0.6, 0.9) * RR,
                           rng.uniform(-12, 12) * S, -rng.uniform(25, 70) * S, 0.0,
                           rng.uniform(1.2, 2.4), -8 * S])
    if len(sparks) > 1600:
        del sparks[:len(sparks) - 1600]

    alive = []
    for s in sparks:
        s[4] += dt
        if s[4] >= s[5]:
            continue
        s[2] = s[2] * (1 - 1.3 * dt) + 55 * S * m.sin(s[4] * 7 + s[5] * 20) * dt
        s[3] += s[6] * dt
        s[0] += s[2] * dt
        s[1] += s[3] * dt
        k = 1 - s[4] / s[5]
        rr, cc = int(s[1] // CH), int(s[0] // CW)
        if 0 <= rr < ROWS and 0 <= cc < COLS:
            new[(rr, cc)] = ("*" if k > 0.55 else "+" if k > 0.30 else ".",
                             LUT[int(clamp(0.15 + 0.85 * k) * 63)])
        alive.append(s)
    sparks[:] = alive

    alive = []
    for s in smoke:
        s[4] += dt
        if s[4] >= s[5]:
            continue
        k = s[4] / s[5]
        s[0] += (s[2] + 14 * S * m.sin(s[4] * 2.2 + s[6])) * dt
        s[1] += s[3] * dt
        al = m.sin(m.pi * k) * 0.5
        rr, cc = int(s[1] // CH), int(s[0] // CW)
        if al > 0.10 and 0 <= rr < ROWS and 0 <= cc < COLS:
            und = new.get((rr, cc))
            ucol = und[1] if und else BG
            new[(rr, cc)] = (".:;+"[min(3, int(al * 7))], mix(ucol, s[7], al))
        alive.append(s)
    smoke[:] = alive

    draw_click(t, dt, new)
    draw_cursor(t, new)

    out = {k: (v[0], hexc(v[1])) for k, v in new.items()}
    for key, val in out.items():
        if prev.get(key) != val:
            it = items.get(key)
            if it is None:
                items[key] = cv.create_text((key[1] + 0.5) * CW, (key[0] + 0.5) * CH,
                                            text=val[0], fill=val[1], font=fnt, anchor="center")
            else:
                cv.itemconfig(it, text=val[0], fill=val[1])
    for key in prev.keys() - out.keys():
        cv.itemconfig(items[key], text=" ")
    prev = out


state = {"t0": time.perf_counter(), "last": 0.0}


def restart(_=None):
    state["t0"] = time.perf_counter()
    state["last"] = 0.0
    st["burst"] = False
    st["click"] = False
    st["hot"] = False
    sparks.clear()
    smoke.clear()
    bits.clear()
    BGC.clear()
    for row in HEAT:
        for i in range(COLS):
            row[i] = 0.0
    for p in MOTES:
        p[1] = rng.uniform(0, H)


root.bind("r", restart)
root.bind("R", restart)


def tick():
    t0 = time.perf_counter()
    t = t0 - state["t0"]
    dt = clamp(t - state["last"], 0.0, 0.1)
    state["last"] = t
    render(t, dt)
    el = (time.perf_counter() - t0) * 1000
    root.after(max(1, int(1000 / FPS - el)), tick)


root.after(100, tick)
root.mainloop()