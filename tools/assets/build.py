# ORBIS asset build — run headless:
#   /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup -P tools/assets/build.py -- [textures] [props] [--only name,...]
#
# Two products, both generated entirely in code (no downloaded art):
#   assets/materials/<mat>_{c,n,orm}.webp  tileable PBR surfaces (colour, normal, AO/rough/metal),
#                                          made with spectral (FFT) noise so every one tiles exactly
#   assets/props.glb                       furniture and fixtures, one mesh per variant, modelled with
#                                          bevelled parts; material slots carry LIBRARY NAMES only
#                                          (the game binds them to the shared textures) and UVs are
#                                          box-projected in metres, so a texture's tile size is real.
#
# Prop frame (same as render/building-mesh.js): x along the item [0, len], y up [0, h],
# z from the front (z = 0) to the back (z = dep). Gameplay never sees these meshes: a
# prop is a logical box with a kind; the game fits the variant made for that box.
import bpy, bmesh, mathutils, sys, os, math, random
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MAT_DIR = os.path.join(ROOT, 'assets', 'materials')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
DO_TEX = 'textures' in argv or not any(a in argv for a in ('textures', 'props', 'city', 'items', 'common', 'family', 'capital'))
DO_PROPS = 'props' in argv or not any(a in argv for a in ('textures', 'props', 'city', 'items', 'common', 'family', 'capital'))
DO_CITY = 'city' in argv
DO_ITEMS = 'items' in argv
DO_COMMON = 'common' in argv
DO_FAMILY = 'family' in argv
DO_CAPITAL = 'capital' in argv
ONLY = argv[argv.index('--only') + 1].split(',') if '--only' in argv else None
N = 1024

# ------------------------------------------------------------------ textures
def spectral(n, beta, seed, ax=1.0, ay=1.0, lo=0.0):
    """Tileable fractal noise: white noise shaped by 1/f^beta in the frequency domain.
    ax/ay elongate features along x/y (fibres, brushing); lo removes the lowest frequencies."""
    r = np.random.default_rng(seed)
    f = np.fft.fft2(r.standard_normal((n, n)))
    fy = np.fft.fftfreq(n)[:, None] * n * ay          # ax/ay: how many times longer features are along x / y
    fx = np.fft.fftfreq(n)[None, :] * n * ax
    k = np.sqrt(fx * fx + fy * fy)
    k[0, 0] = 1
    amp = 1.0 / np.power(k, beta)
    if lo: amp *= 1 - np.exp(-(k / lo) ** 2)
    amp[0, 0] = 0
    out = np.real(np.fft.ifft2(f * amp))
    out -= out.min(); out /= max(out.max(), 1e-9)
    return out

def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    nz = np.ones_like(h)
    l = np.sqrt(dx * dx + dy * dy + nz * nz)
    return np.stack([-dx / l, dy / l, nz / l], -1) * 0.5 + 0.5      # OpenGL (+Y) convention, as glTF/three expect

def ao_from_height(h, k=0.6):
    blur = h.copy()
    for s in (2, 4, 8):
        blur = (np.roll(blur, s, 0) + np.roll(blur, -s, 0) + np.roll(blur, s, 1) + np.roll(blur, -s, 1) + blur * 4) / 8
    return np.clip(1 - k * np.maximum(0, blur - h) * 4, 0, 1)

def save(name, rgb, srgb):
    img = bpy.data.images.new(name, N, N, alpha=False)
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones(rgb.shape[:2] + (1,))], -1).astype(np.float32)
    img.pixels.foreach_set(rgba[::-1].ravel())
    img.filepath_raw = os.path.join(MAT_DIR, name + '.webp')
    img.file_format = 'WEBP'
    img.save()
    bpy.data.images.remove(img)

def lerp3(a, b, t): return np.asarray(a)[None, None, :] * (1 - t[..., None]) + np.asarray(b)[None, None, :] * t[..., None]
def srgb(c): return [((v / 255.0)) for v in c]

def mat_wood(seed):     # oak veneer: growth rings (thin dark latewood), cathedral warp, dense fibre streaks along x
    y = np.linspace(0, 1, N, endpoint=False)[:, None] * np.ones((1, N))
    warp = (spectral(N, 2.8, seed, ax=3, ay=1) - 0.5) * 2.2 + (spectral(N, 1.8, seed + 5, ax=8, ay=1) - 0.5) * 0.35
    g = (y * 23 + warp * 3.0) % 1.0                       # position within a year's growth
    var = spectral(N, 2.2, seed + 6, ax=1.5, ay=1)
    wid = 0.05 + 0.12 * var                               # bands vary in width and strength
    late = np.exp(-((g - 0.8) / wid) ** 2) * (0.45 + 0.75 * spectral(N, 2.0, seed + 7, ax=4, ay=1))
    late += 0.35 * np.exp(-((g - 0.5) / (wid * 2.5)) ** 2) * var
    fib = spectral(N, 1.0, seed + 1, ax=90, ay=0.5)
    fib2 = spectral(N, 1.6, seed + 3, ax=25, ay=0.8)
    pores = (spectral(N, 0.3, seed + 2, ax=14, ay=0.5) > 0.74).astype(float) * (0.4 + late)
    tone = spectral(N, 2.5, seed + 4, ax=2, ay=1)
    t = np.clip(0.38 * late + 0.55 * (fib - 0.5) + 0.4 * (fib2 - 0.5) + 0.3 * pores + 0.35 * (tone - 0.5) + 0.33, 0, 1)
    col = lerp3(srgb((205, 168, 122)), srgb((121, 84, 50)), t)
    h = 0.5 * fib + 0.2 * fib2 - 0.6 * pores + 0.15 * late
    rough = 0.4 + 0.15 * fib + 0.25 * pores
    return col, normal_from_height(h, 2.0), ao_from_height(h, 0.25), rough, 0.0

def mat_fabric(seed):   # plain weave + fuzz; neutral (tinted per instance in game). No low frequencies: they'd band at the tile.
    n = 150                                        # threads per tile (tile 0.45 m → 3 mm)
    u = np.linspace(0, n, N, endpoint=False)
    X, Y = np.meshgrid(u, u)
    over = ((np.floor(X) + np.floor(Y)) % 2).astype(float)
    wx = np.sin(np.pi * (X % 1)) ** 0.7; wy = np.sin(np.pi * (Y % 1)) ** 0.7
    h = over * wy + (1 - over) * wx
    fuzz = spectral(N, 0.9, seed, lo=40)
    yarn = spectral(N, 1.2, seed + 3, ax=8, ay=1, lo=30)      # thicker/thinner yarn runs
    t = 0.8 + 0.05 * h + 0.1 * (fuzz - 0.5) + 0.08 * (yarn - 0.5)
    col = np.repeat(np.clip(t, 0, 1)[..., None], 3, -1) * np.array([0.86, 0.85, 0.83])
    return col, normal_from_height(h * 0.5 + fuzz * 0.4, 1.6), ao_from_height(h, 0.3), 0.86 + 0.08 * fuzz, 0.0

def mat_paint(seed):    # powder-coated steel: orange peel, smudges, a few fine scratches
    peel = spectral(N, 1.0, seed, lo=60)
    smudge = spectral(N, 2.2, seed + 1)
    s = np.zeros((N, N))
    r = np.random.default_rng(seed)
    for _ in range(36):         # faint hairlines: at any tint they must read as wear, not cracks
        x0, y0 = r.integers(0, N, 2); ang = r.uniform(0, math.pi); L = r.integers(12, 70)
        for t in range(L):
            s[int(y0 + t * math.sin(ang)) % N, int(x0 + t * math.cos(ang)) % N] = r.uniform(0.3, 1)
    col = np.repeat((0.86 - 0.05 * smudge - 0.05 * s)[..., None], 3, -1)
    h = 0.25 * peel - 0.15 * s
    rough = 0.38 + 0.2 * smudge + 0.1 * s
    return col, normal_from_height(h, 1.6), ao_from_height(h, 0.2), rough, 0.05 * (1 - s)

def mat_metal(seed):    # brushed stainless: streaks along x
    br = spectral(N, 1.0, seed, ax=60, ay=0.4)
    big = spectral(N, 2.4, seed + 1)
    col = np.repeat((0.62 + 0.12 * br + 0.06 * big)[..., None], 3, -1) * np.array([1.0, 1.0, 1.02])
    return col, normal_from_height(br, 0.8), np.ones((N, N)), 0.28 + 0.18 * br + 0.1 * big, np.ones((N, N))

def mat_laminate(seed):  # desk/counter tops: fine speckle
    sp = spectral(N, 0.2, seed); big = spectral(N, 2.0, seed + 1)
    col = lerp3(srgb((214, 210, 202)), srgb((176, 172, 166)), np.clip(sp * 0.6 + big * 0.4, 0, 1))
    return col, normal_from_height(sp, 0.3), np.ones((N, N)), 0.34 + 0.12 * big, 0.0

def mat_stone(seed):     # engineered stone worktop
    a = spectral(N, 0.5, seed); b = spectral(N, 1.6, seed + 1)
    flecks = (spectral(N, 0.2, seed + 2) > 0.8).astype(float)
    col = lerp3(srgb((58, 58, 62)), srgb((112, 110, 108)), np.clip(0.6 * a + 0.3 * b + 0.5 * flecks, 0, 1))
    return col, normal_from_height(a, 0.4), np.ones((N, N)), 0.22 + 0.15 * b, 0.0

def mat_plastic(seed):
    a = spectral(N, 1.4, seed); g = spectral(N, 0.3, seed + 1)
    col = np.repeat((0.16 + 0.04 * a)[..., None], 3, -1)
    return col, normal_from_height(g, 0.6), np.ones((N, N)), 0.48 + 0.12 * a, 0.0

def mat_rubber(seed):
    a = spectral(N, 0.6, seed)
    col = np.repeat((0.06 + 0.03 * a)[..., None], 3, -1)
    return col, normal_from_height(a, 1.0), np.ones((N, N)), 0.88 + 0.08 * a, 0.0

def mat_concrete(seed):
    a = spectral(N, 1.9, seed); b = spectral(N, 0.8, seed + 1)
    pores = (spectral(N, 0.1, seed + 2) > 0.86).astype(float)
    col = np.repeat(np.clip(0.62 + 0.12 * (a - 0.5) + 0.06 * (b - 0.5) - 0.2 * pores, 0, 1)[..., None], 3, -1) * np.array([1.0, 0.99, 0.96])
    h = 0.4 * b - 0.8 * pores + 0.2 * a
    return col, normal_from_height(h, 2.0), ao_from_height(h, 0.5), 0.85 + 0.1 * b, 0.0

def mat_soil(seed):
    a = spectral(N, 1.1, seed); b = spectral(N, 0.3, seed + 1)
    col = lerp3(srgb((52, 38, 28)), srgb((92, 70, 50)), np.clip(0.5 * a + 0.5 * b, 0, 1))
    return col, normal_from_height(a + b, 4.0), ao_from_height(a + b, 0.6), 0.95 * np.ones((N, N)), 0.0

def mat_leaf(seed):
    v = spectral(N, 0.8, seed, ax=0.5, ay=8); a = spectral(N, 1.8, seed + 1)
    col = lerp3(srgb((44, 74, 32)), srgb((92, 128, 58)), np.clip(0.6 * a + 0.4 * v, 0, 1))
    return col, normal_from_height(v, 1.0), np.ones((N, N)), 0.55 + 0.2 * a, 0.0

def mat_cardboard(seed):
    flutes = 0.5 + 0.5 * np.sin(np.linspace(0, 2 * math.pi * 80, N, endpoint=False))[None, :] * np.ones((N, 1))
    a = spectral(N, 1.6, seed); f = spectral(N, 0.5, seed + 1)
    col = lerp3(srgb((168, 128, 86)), srgb((138, 100, 62)), np.clip(0.6 * a + 0.3 * f, 0, 1))
    return col, normal_from_height(flutes * 0.15 + f * 0.3, 0.8), np.ones((N, N)), 0.9 * np.ones((N, N)), 0.0

# ---- town and terrain surfaces (tile sizes match what render/materials.js and terrain.js used)
def grid_cells(nx, ny, seed, offset_rows=False):
    """Per-pixel cell index and distance to the nearest joint (in cells) for an nx × ny grid."""
    y = (np.arange(N)[:, None] + 0.5) / N * ny * np.ones((1, N)); x = (np.arange(N)[None, :] + 0.5) / N * nx * np.ones((N, 1))
    if offset_rows: x = x + 0.5 * (np.floor(y) % 2)
    ix, iy = np.floor(x) % nx, np.floor(y)
    fx, fy = x - np.floor(x), y - np.floor(y)
    edge = np.minimum(np.minimum(fx, 1 - fx) * (N / nx), np.minimum(fy, 1 - fy) * (N / ny))     # px to the nearest joint
    r = np.random.default_rng(seed).random((ny + 1, nx + 1))
    return r[iy.astype(int), ix.astype(int)], edge

def streaks(seed, k=0.6):          # rain streaks: long vertical marks, stronger lower down a tile
    v = spectral(N, 1.2, seed, ax=1, ay=14)          # long along y: they run down the wall
    return np.clip((v - 0.5) * 2.2, 0, 1) * k


def worley(cells, seed):
    """Tileable cellular noise on a jittered cells × cells grid → (F1, F2 in cell units, id of nearest cell 0..1)."""
    r = np.random.default_rng(seed)
    jit = r.random((cells, cells, 2)); ids = r.random((cells, cells))
    u = (np.arange(N) + 0.5) / N * cells
    X, Y = np.meshgrid(u, u)                       # X across (columns), Y down (rows)
    cx, cy = np.floor(X).astype(int), np.floor(Y).astype(int)
    f1 = np.full((N, N), 9.0); f2 = np.full((N, N), 9.0); nid = np.zeros((N, N))
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            gx, gy = cx + dx, cy + dy
            jx, jy = jit[gy % cells, gx % cells, 0], jit[gy % cells, gx % cells, 1]
            d = np.hypot(gx + jx - X, gy + jy - Y)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d)); nid = np.where(closer, ids[gy % cells, gx % cells], nid); f1 = np.where(closer, d, f1)
    return f1, f2, nid

def mat_facade(seed):    # precast concrete panels, 1.6 × 3.2 m: recessed joints, tone per panel, grain, rain streaks
    tone, edge = grid_cells(2, 1, seed)
    joint = np.clip(1 - edge / 5, 0, 1)
    a = spectral(N, 1.8, seed + 1); g = spectral(N, 0.2, seed + 2); st = streaks(seed + 3, 0.5)
    pores = (spectral(N, 0.05, seed + 4) > 0.9).astype(float)
    v = 0.74 + 0.1 * (tone - 0.5) + 0.07 * (a - 0.5) + 0.05 * (g - 0.5) - 0.3 * st - 0.3 * joint - 0.1 * pores
    col = np.repeat(np.clip(v, 0, 1)[..., None], 3, -1) * np.array([1.0, 0.985, 0.955])
    h = 0.15 * g + 0.25 * a - 1.2 * joint - 0.3 * pores
    return col, normal_from_height(h, 3.0), ao_from_height(h, 0.5), 0.82 + 0.1 * g - 0.08 * st, 0.0

def mat_corrugated(seed):   # painted corrugated steel sheet, ribs vertical; dirt and rust run down from the laps
    x = np.arange(N)[None, :] / N * np.ones((N, 1)); y = np.arange(N)[:, None] / N * np.ones((1, N))
    ribs = 0.5 + 0.5 * np.sin(2 * math.pi * 32 * x)
    lap = np.clip(1 - np.abs(y - 0.0) * N / 6, 0, 1) + np.clip(1 - np.abs(y - 1.0) * N / 6, 0, 1)
    st = streaks(seed, 0.7); a = spectral(N, 1.5, seed + 1); rust = np.clip((spectral(N, 1.3, seed + 2) - 0.68) * 5, 0, 1) * (0.4 + 0.6 * st)
    base = np.repeat((0.74 + 0.05 * (a - 0.5) - 0.12 * st)[..., None], 3, -1)
    col = base * (1 - rust[..., None]) + np.array(srgb((120, 66, 38)))[None, None, :] * rust[..., None]
    col *= (0.9 + 0.1 * ribs)[..., None]
    h = ribs * 1.0 - 0.6 * lap + 0.05 * a
    return col, normal_from_height(h, 6.0), ao_from_height(h, 0.25), 0.45 + 0.25 * st + 0.35 * rust, 0.55 * (1 - rust)

def mat_render(seed):    # rendered (stuccoed) wall: fine float texture, trowel arcs, damp at the foot
    a = spectral(N, 0.6, seed); b = spectral(N, 1.7, seed + 1); t = spectral(N, 1.0, seed + 2, ax=3, ay=1); st = streaks(seed + 3, 0.35)
    v = 0.83 + 0.04 * (b - 0.5) + 0.03 * (t - 0.5) - 0.12 * st
    col = np.repeat(np.clip(v, 0, 1)[..., None], 3, -1) * np.array([1.0, 0.975, 0.94])
    h = 0.5 * a + 0.2 * t
    return col, normal_from_height(h, 2.5), ao_from_height(h, 0.4), 0.9 * np.ones((N, N)), 0.0

def mat_floortile(seed):  # 0.5 m ceramic floor tiles (8 × 8 per 4 m tile), grout, slight gloss, per-tile tone
    tone, edge = grid_cells(8, 8, seed)
    grout = np.clip(1 - edge / 3, 0, 1); a = spectral(N, 1.4, seed + 1); sp = spectral(N, 0.2, seed + 2)
    v = 0.8 + 0.06 * (tone - 0.5) + 0.04 * (a - 0.5) + 0.03 * (sp - 0.5)
    col = np.repeat(v[..., None], 3, -1) * (1 - grout[..., None] * 0.45)
    h = -grout + 0.03 * a
    return col, normal_from_height(h, 2.0), ao_from_height(h, 0.3), 0.25 + 0.6 * grout + 0.1 * a, 0.0

def mat_asphalt(seed):    # aggregate set in tar, worn smooth on top; hairline cracks, patches, oil
    f1, f2, nid = worley(180, seed)
    stone = np.clip(1 - f1 * 1.8, 0, 1) * (nid > 0.35)
    fine = spectral(N, 0.4, seed + 1); big = spectral(N, 2.2, seed + 2)
    ridge = 1 - np.abs(spectral(N, 1.6, seed + 3) - 0.5) * 2
    crack = np.clip((ridge - 0.992) * 120, 0, 1) * (big > 0.5)
    patch = np.clip((spectral(N, 2.4, seed + 4) - 0.74) * 8, 0, 1); oil = np.clip((spectral(N, 2.0, seed + 5) - 0.78) * 6, 0, 1)
    v = 0.27 + 0.07 * stone * (0.5 + nid) + 0.03 * (fine - 0.5) + 0.05 * (big - 0.5) - 0.05 * patch - 0.06 * crack - 0.05 * oil
    col = np.repeat(np.clip(v, 0, 1)[..., None], 3, -1) * np.array([1.0, 1.0, 1.02])
    h = 0.35 * stone + 0.15 * fine - 0.6 * crack + 0.1 * patch
    return col, normal_from_height(h, 3.0), ao_from_height(h, 0.5), 0.86 - 0.2 * oil - 0.1 * patch + 0.04 * stone, 0.0

def mat_pavers(seed):     # 0.4 × 0.2 m concrete pavers, running bond (10 × 20 per 4 m tile), chipped arrises
    tone, edge = grid_cells(10, 20, seed, offset_rows=True)
    j = np.clip(1 - edge / 2.2, 0, 1); a = spectral(N, 1.6, seed + 1); g = spectral(N, 0.2, seed + 2); dirt = spectral(N, 2.0, seed + 3)
    v = 0.6 + 0.1 * (tone - 0.5) + 0.05 * (a - 0.5) + 0.04 * (g - 0.5) - 0.08 * dirt
    col = np.repeat(v[..., None], 3, -1) * np.array([1.0, 0.97, 0.93]) * (1 - 0.3 * j[..., None])
    h = -0.8 * j + 0.1 * g + 0.15 * a
    return col, normal_from_height(h, 3.0), ao_from_height(h, 0.6), 0.85 + 0.1 * j, 0.0

def mat_grass(seed):      # short grass seen from above: dense blades, clumps, bare soil between
    blades = spectral(N, 0.15, seed); clump = spectral(N, 1.8, seed + 1); dir_ = spectral(N, 0.5, seed + 2, ax=1, ay=4)
    bare = np.clip((0.35 - clump) * 4, 0, 1)
    green = lerp3(srgb((58, 80, 36)), srgb((120, 132, 62)), np.clip(0.55 * blades + 0.45 * dir_, 0, 1))
    soil = lerp3(srgb((70, 56, 40)), srgb((104, 86, 62)), blades)
    col = green * (1 - bare[..., None]) + soil * bare[..., None]
    h = 0.7 * blades + 0.3 * dir_ + 0.4 * clump
    return col, normal_from_height(h, 3.5), ao_from_height(h, 0.7), 0.92 * np.ones((N, N)), 0.0

def mat_dirt(seed):       # dry ground: dust, small stones, cracked patches
    a = spectral(N, 1.6, seed); f = spectral(N, 0.3, seed + 1); st = np.clip((spectral(N, 0.1, seed + 2) - 0.78) * 6, 0, 1)
    ridge = 1 - np.abs(spectral(N, 1.4, seed + 3) - 0.5) * 2; crack = np.clip((ridge - 0.99) * 80, 0, 1) * (a > 0.55)
    col = lerp3(srgb((118, 98, 72)), srgb((168, 146, 112)), np.clip(0.6 * a + 0.4 * f, 0, 1))
    col = col * (1 - 0.2 * crack[..., None]) * (1 - 0.15 * st[..., None]) + 0.12 * st[..., None]
    h = 0.4 * a + 0.3 * f + 0.6 * st - 0.6 * crack
    return col, normal_from_height(h, 3.0), ao_from_height(h, 0.6), 0.95 * np.ones((N, N)), 0.0

def mat_rock(seed):       # bedded rock: blocky fractured faces, thin joints, strata, lichen
    y = np.arange(N)[:, None] / N * np.ones((1, N))
    warp = spectral(N, 2.0, seed)
    strata = 0.5 + 0.5 * np.sin(2 * math.pi * (y * 7 + warp * 1.4))
    f1, f2, nid = worley(9, seed + 1)
    wob = spectral(N, 1.4, seed + 6)
    joint = np.clip(1 - (f2 - f1 + 0.12 * (wob - 0.5)) * 22, 0, 1) * np.clip((spectral(N, 1.6, seed + 7) - 0.35) * 3, 0, 1)   # hairline cracks that wander and fade out
    a = spectral(N, 1.9, seed + 2); f = spectral(N, 0.5, seed + 3); lichen = np.clip((spectral(N, 1.2, seed + 4) - 0.72) * 5, 0, 1) * (f > 0.55)
    v = 0.4 + 0.04 * (nid - 0.5) + 0.07 * (strata - 0.5) + 0.1 * (a - 0.5) + 0.06 * (f - 0.5) - 0.08 * joint
    col = np.repeat(np.clip(v, 0, 1)[..., None], 3, -1) * np.array([1.0, 0.96, 0.9])
    col = col * (1 - lichen[..., None] * 0.5) + np.array(srgb((122, 126, 90)))[None, None, :] * lichen[..., None] * 0.5
    h = 0.15 * (1 - f1) + 0.5 * a + 0.3 * f + 0.2 * strata - 0.3 * joint
    return col, normal_from_height(h, 6.0), ao_from_height(h, 0.7), 0.88 + 0.08 * f, 0.0

def mat_gravel(seed):     # loose gravel: rounded pebbles of mixed stone, packed fines between
    f1, f2, nid = worley(64, seed)
    peb = np.clip(1 - f1 * 1.5, 0, 1) ** 0.6
    gap = np.clip(1 - (f2 - f1) * 4, 0, 1)
    q = spectral(N, 0.3, seed + 1)
    tone = lerp3(srgb((96, 90, 82)), srgb((178, 170, 156)), np.clip(nid * 0.8 + 0.2 * q, 0, 1))
    col = tone * (1 - 0.45 * gap[..., None])
    h = peb - 0.4 * gap
    return col, normal_from_height(h, 5.0), ao_from_height(h, 0.9), 0.85 + 0.1 * gap, 0.0

def mat_bark(seed):       # tree bark: deep vertical furrows, plates between, moss low down
    f = spectral(N, 1.1, seed, ax=1, ay=10); g = spectral(N, 0.4, seed + 1); m = spectral(N, 1.8, seed + 2)
    furrow = np.clip((0.55 - f) * 4, 0, 1)
    col = lerp3(srgb((92, 74, 58)), srgb((58, 46, 38)), np.clip(0.6 * furrow + 0.4 * g, 0, 1))
    moss = np.clip((m - 0.62) * 4, 0, 1)
    col = col * (1 - moss[..., None] * 0.5) + np.array(srgb((70, 84, 44)))[None, None, :] * moss[..., None] * 0.5
    h = 1 - furrow + 0.2 * g
    return col, normal_from_height(h, 6.0), ao_from_height(h, 0.8), 0.92 * np.ones((N, N)), 0.0

def panel_layout(seed, depth=5):
    """Irregular hull panels: a rectangle split recursively into plates → per-pixel plate id and px to the nearest seam."""
    r = np.random.default_rng(seed); rects = []
    def split(x0, y0, x1, y1, d):
        w, h = x1 - x0, y1 - y0
        if d == 0 or (w < 0.12 and h < 0.12) or (d < 3 and r.random() < 0.25): rects.append((x0, y0, x1, y1)); return
        if (w > h) ^ (r.random() < 0.2):
            t = x0 + w * r.choice([0.25, 0.333, 0.5, 0.667, 0.75]); split(x0, y0, t, y1, d - 1); split(t, y0, x1, y1, d - 1)
        else:
            t = y0 + h * r.choice([0.25, 0.333, 0.5, 0.667, 0.75]); split(x0, y0, x1, t, d - 1); split(x0, t, x1, y1, d - 1)
    split(0, 0, 1, 1, depth)
    pid = np.zeros((N, N)); edge = np.full((N, N), 1e9); rivet = np.zeros((N, N))
    Y, X = np.mgrid[0:N, 0:N]
    for i, (x0, y0, x1, y1) in enumerate(rects):
        a0, a1, b0, b1 = int(x0 * N), int(x1 * N), int(y0 * N), int(y1 * N)
        pid[b0:b1, a0:a1] = r.random()
        xs, ys = X[b0:b1, a0:a1], Y[b0:b1, a0:a1]
        e = np.minimum(np.minimum(xs - a0, a1 - 1 - xs), np.minimum(ys - b0, b1 - 1 - ys))
        edge[b0:b1, a0:a1] = e
        # rivet rows 5 px inside each seam, every 14 px
        on = (np.abs(e - 5) < 1.6) & (((xs + ys) % 14) < 3)
        rivet[b0:b1, a0:a1] = np.maximum(rivet[b0:b1, a0:a1], on.astype(float))
    return pid, edge, rivet

def mat_hull(seed):       # spacecraft hull plating: irregular plates, recessed seams, rivets, grime, worn edges
    pid, edge, rivet = panel_layout(seed)
    seam = np.clip(1 - edge / 2.2, 0, 1)
    a = spectral(N, 1.8, seed + 1); g = spectral(N, 0.3, seed + 2); st = streaks(seed + 3, 0.6)
    wear = np.clip((spectral(N, 0.9, seed + 4) - 0.55) * 4, 0, 1) * np.clip(1 - edge / 9, 0, 1)      # paint worn off near seams
    v = 0.78 + 0.07 * (pid - 0.5) + 0.04 * (a - 0.5) + 0.03 * (g - 0.5) - 0.18 * st - 0.35 * seam
    col = np.repeat(np.clip(v, 0, 1)[..., None], 3, -1)
    bare = np.array([0.55, 0.56, 0.58])
    col = col * (1 - wear[..., None]) + bare[None, None, :] * wear[..., None]
    h = -1.0 * seam + 0.6 * rivet + 0.15 * g + 0.08 * (pid - 0.5)
    rough = 0.45 + 0.15 * g + 0.25 * st - 0.2 * wear
    metal = 0.15 + 0.75 * wear
    return col, normal_from_height(h, 5.0), ao_from_height(h, 0.5), rough, metal

def mat_heatshield(seed): # black ceramic heat-shield tiles, staggered, scorched
    tone, edge = grid_cells(16, 16, seed, offset_rows=True)
    gap = np.clip(1 - edge / 2.0, 0, 1); a = spectral(N, 1.6, seed + 1); sc = spectral(N, 2.2, seed + 2)
    v = 0.12 + 0.05 * (tone - 0.5) + 0.03 * (a - 0.5) + 0.06 * np.clip(sc - 0.6, 0, 1)
    col = np.repeat(v[..., None], 3, -1) * np.array([1.0, 0.98, 0.95]) * (1 - 0.5 * gap[..., None])
    h = -gap + 0.1 * a
    return col, normal_from_height(h, 3.0), ao_from_height(h, 0.5), 0.8 + 0.1 * a, 0.0

def mat_hazard(seed):     # yellow/black hazard stripes, chipped
    x = np.arange(N)[None, :] / N * np.ones((N, 1)); y = np.arange(N)[:, None] / N * np.ones((1, N))
    band = ((x + y) * 8 % 1.0) < 0.5
    chip = np.clip((spectral(N, 0.8, seed) - 0.7) * 6, 0, 1)
    col = np.where(band[..., None], np.array(srgb((214, 168, 32)))[None, None, :], np.array([0.05, 0.05, 0.05])[None, None, :])
    col = col * (1 - chip[..., None]) + np.array([0.5, 0.5, 0.52])[None, None, :] * chip[..., None]
    return col, normal_from_height(-chip * 0.3, 2.0), np.ones((N, N)), 0.6 + 0.2 * chip, 0.6 * chip

def mat_water(seed):      # open-water ripples: a broad swell spectrum, tileable; only the normal map is used
    a = spectral(N, 2.6, seed, ax=1.0, ay=1.6); b = spectral(N, 1.6, seed + 1)
    h = a * 0.8 + b * 0.25
    return np.full((N, N, 3), 0.1), normal_from_height(h, 9.0), np.ones((N, N)), 0.05 * np.ones((N, N)), 0.0

def mat_birchbark(seed):  # white papery birch: horizontal dark lenticels, black diamonds, peeling patches
    a = spectral(N, 1.4, seed); l = spectral(N, 0.3, seed + 1, ax=12, ay=1)
    lent = np.clip((l - 0.72) * 6, 0, 1); peel = np.clip((spectral(N, 1.8, seed + 2) - 0.66) * 5, 0, 1)
    col = np.repeat((0.86 + 0.06 * (a - 0.5))[..., None], 3, -1) * np.array([1.0, 0.98, 0.94])
    col = col * (1 - 0.8 * lent[..., None]) * (1 - 0.25 * peel[..., None]) + peel[..., None] * 0.18 * np.array([0.9, 0.6, 0.4])
    h = 0.3 * a - 0.6 * lent + 0.2 * peel
    return col, normal_from_height(h, 3.0), ao_from_height(h, 0.4), 0.7 + 0.2 * lent, 0.0

def mat_smoothbark(seed):  # alien smooth bark: pale grey-violet skin, faint growth rings, a waxy sheen
    a = spectral(N, 1.6, seed); y = np.arange(N)[:, None] / N * np.ones((1, N))
    rings = 0.5 + 0.5 * np.sin(2 * math.pi * (y * 14 + 0.4 * spectral(N, 2.0, seed + 1)))
    col = lerp3(srgb((118, 108, 122)), srgb((160, 150, 158)), np.clip(0.6 * a + 0.25 * rings, 0, 1))
    h = 0.3 * rings + 0.3 * a
    return col, normal_from_height(h, 2.0), ao_from_height(h, 0.3), 0.45 + 0.2 * a, 0.0

def mat_ceramic(seed):    # glazed porcelain: near-white, a faint ripple in the glaze
    a = spectral(N, 2.0, seed)
    col = np.repeat((0.9 + 0.03 * (a - 0.5))[..., None], 3, -1) * np.array([1.0, 1.0, 0.99])
    return col, normal_from_height(a * 0.2, 0.5), np.ones((N, N)), 0.08 + 0.04 * a, 0.0

def mat_mirror(seed):
    a = spectral(N, 1.5, seed)
    return np.full((N, N, 3), 0.95), normal_from_height(a * 0.02, 0.2), np.ones((N, N)), 0.02 + 0.03 * (a > 0.8), 1.0

def mat_books(seed):      # book spines: vertical bands of colour, titles as faint bars, worn tops
    r = np.random.default_rng(seed); x = np.arange(N); col = np.zeros((N, N, 3)); edge = 0
    pal = [(120, 36, 30), (30, 52, 92), (40, 80, 50), (180, 150, 90), (30, 30, 34), (140, 90, 40), (200, 190, 170), (90, 40, 80)]
    while edge < N:
        w = int(r.integers(18, 50)); c = np.array(srgb(pal[r.integers(0, len(pal))])) * r.uniform(0.7, 1.1)
        col[:, edge:edge + w] = c
        t0 = int(r.integers(int(N * 0.15), int(N * 0.5))); col[t0:t0 + 14, edge + 5:edge + w - 5] = np.array([0.85, 0.78, 0.55]) * 0.9
        col[:, edge:edge + 2] *= 0.5; edge += w
    h = spectral(N, 1.2, seed + 1) * 0.3
    return col, normal_from_height(h, 1.0), ao_from_height(h, 0.3), 0.75 * np.ones((N, N)), 0.0

def mat_brick(seed):      # 225 x 75 mm brick courses in running bond: a fired tone per brick, a few burnt ones, weathered mortar
    tone, edge = grid_cells(8, 24, seed, True)
    mort = np.clip(1.25 - edge / 2.6, 0, 1)
    a = spectral(N, 1.6, seed + 1); g = spectral(N, 0.2, seed + 2); st = streaks(seed + 3, 0.35)
    brick = lerp3([0.42, 0.17, 0.11], [0.68, 0.37, 0.25], tone) * (0.82 + 0.36 * a + 0.2 * (g - 0.5))[..., None]
    brick = np.where((tone > 0.92)[..., None], brick * 0.55, brick)
    mortar = (0.5 + 0.2 * (g - 0.5))[..., None] * np.array([1.0, 0.97, 0.9])
    col = np.clip((brick * (1 - mort[..., None]) + mortar * mort[..., None]) * (1 - 0.3 * st)[..., None], 0, 1)
    h = 0.3 * g + 0.25 * a - 1.1 * mort
    return col, normal_from_height(h, 3.2), ao_from_height(h, 0.6), 0.86 + 0.1 * g, 0.0

def mat_limestone(seed):  # pale dressed stone: coursed blocks with thin mortar, each block its own tone, weathered streaks
    tone, edge = grid_cells(5, 8, seed, True)
    a = spectral(N, 1.5, seed + 1); g = spectral(N, 0.25, seed + 2); st = np.clip(spectral(N, 1.1, seed + 3) - 0.45, 0, 1)
    mortar = np.clip(1 - edge / 2.2, 0, 1)
    col = lerp3([0.6, 0.56, 0.48], [0.8, 0.76, 0.67], tone) * (0.86 + 0.26 * a)[..., None] * (1 - 0.45 * mortar - 0.3 * st)[..., None]
    h = 1 - 0.8 * mortar + 0.12 * g + 0.08 * a
    return np.clip(col, 0, 1), normal_from_height(h, 2.4), ao_from_height(h, 0.6), 0.84 + 0.1 * g, 0.0

def mat_rooftile(seed):   # clay tiles in overlapping courses, each course shadowing the one below; moss in the laps
    tone, edge = grid_cells(10, 12, seed, True)
    fy = ((np.arange(N)[:, None] + 0.5) / N * 12 % 1) * np.ones((1, N))
    a = spectral(N, 1.7, seed + 1); g = spectral(N, 0.25, seed + 2); moss = np.clip((spectral(N, 1.9, seed + 3) - 0.62) * 5, 0, 1)
    lap = np.clip(1 - fy / 0.16, 0, 1)
    col = lerp3([0.42, 0.18, 0.11], [0.66, 0.34, 0.2], tone) * (0.8 + 0.4 * a)[..., None] * (1 - 0.62 * lap - 0.5 * np.clip(1 - edge / 3, 0, 1))[..., None]
    col = col * (1 - 0.5 * moss[..., None] * (0.35 + lap[..., None])) + np.array([0.2, 0.26, 0.1]) * 0.5 * moss[..., None] * (0.35 + lap[..., None])
    h = fy * 1.1 - 0.7 * np.clip(1 - edge / 3, 0, 1) + 0.12 * g
    return np.clip(col, 0, 1), normal_from_height(h, 4.0), ao_from_height(h, 0.7), 0.74 + 0.16 * g, 0.0

def mat_slate(seed):      # split slates: dark blue-grey, uneven courses, pale lichen flecks
    tone, edge = grid_cells(12, 16, seed, True)
    fy = ((np.arange(N)[:, None] + 0.5) / N * 16 % 1) * np.ones((1, N))
    a = spectral(N, 1.5, seed + 1); g = spectral(N, 0.15, seed + 2); lich = (spectral(N, 0.9, seed + 3) > 0.84).astype(float)
    lap = np.clip(1 - fy / 0.12, 0, 1)
    col = lerp3([0.11, 0.12, 0.14], [0.27, 0.28, 0.31], tone) * (0.8 + 0.4 * a)[..., None] * (1 - 0.55 * lap - 0.5 * np.clip(1 - edge / 2.2, 0, 1))[..., None] + 0.16 * lich[..., None] * np.array([0.9, 0.9, 0.6])
    h = fy * 0.8 - 0.6 * np.clip(1 - edge / 2.2, 0, 1) + 0.3 * g
    return np.clip(col, 0, 1), normal_from_height(h, 3.6), ao_from_height(h, 0.6), 0.62 + 0.2 * g, 0.0

def mat_thatch(seed):     # bundled reed: long fibres running down the slope, grey with age, darker in the courses
    fib = spectral(N, 0.5, seed, 0.6, 18.0); fib2 = spectral(N, 0.2, seed + 1, 1.0, 40.0); broad = spectral(N, 1.9, seed + 2)
    fy = ((np.arange(N)[:, None] + 0.5) / N * 5 % 1) * np.ones((1, N))
    course = np.clip(1 - fy / 0.2, 0, 1) * 0.45
    col = lerp3([0.22, 0.17, 0.09], [0.66, 0.54, 0.3], np.clip(0.75 * fib + 0.45 * fib2 - 0.1, 0, 1)) * (0.62 + 0.55 * broad)[..., None] * (1 - course)[..., None]
    h = 0.9 * fib + 0.5 * fib2 + 0.5 * fy
    return np.clip(col, 0, 1), normal_from_height(h, 5.0), ao_from_height(h, 0.9), 0.95, 0.0

def mat_plank(seed):      # weatherboard: overlapping horizontal boards, grey-brown, grain along x, shadow under each lap
    tone, edge = grid_cells(1, 12, seed)
    fy = ((np.arange(N)[:, None] + 0.5) / N * 12 % 1) * np.ones((1, N))
    gr = spectral(N, 0.5, seed + 1, 16.0, 0.6); fine = spectral(N, 0.2, seed + 2, 40.0, 1.0); blot = spectral(N, 1.9, seed + 3); st = streaks(seed + 4, 0.4)
    lap = np.clip(1 - fy / 0.1, 0, 1)
    col = lerp3([0.27, 0.21, 0.16], [0.52, 0.44, 0.35], np.clip(0.55 * gr + 0.3 * fine + 0.3 * (tone - 0.3), 0, 1)) * (0.78 + 0.45 * blot)[..., None] * (1 - 0.66 * lap)[..., None] * (1 - 0.3 * st)[..., None]
    h = 0.7 * fy + 0.2 * gr + 0.1 * fine
    return np.clip(col, 0, 1), normal_from_height(h, 3.6), ao_from_height(h, 0.7), 0.82 + 0.1 * gr, 0.0

# ---- the kinds of land: each is detail over the land's own colour, so its shape matters more than its hue
def mat_sand(seed):       # wind-laid sand: long ripples that wander, fine grains, a few darker heavy-mineral streaks
    y = np.arange(N)[:, None] / N * np.ones((1, N)); w = spectral(N, 2.1, seed); g = spectral(N, 0.05, seed + 1); b = spectral(N, 1.8, seed + 2)
    rip = 0.5 + 0.5 * np.sin(2 * math.pi * (y * 26 + w * 5.0))
    rip = rip ** 1.6
    col = lerp3([0.62, 0.53, 0.4], [0.8, 0.71, 0.56], np.clip(0.35 * rip + 0.35 * b + 0.3 * g, 0, 1)) * (1 - 0.1 * (1 - rip))[..., None]
    h = 0.75 * rip + 0.1 * g + 0.15 * b
    return np.clip(col, 0, 1), normal_from_height(h, 3.0), ao_from_height(h, 0.4), 0.96, 0.0

def mat_sandstone(seed):  # bedded sandstone cliff: many thin strata of differing hardness, cross-bedding, vertical joints, wind pits
    y = np.arange(N)[:, None] / N * np.ones((1, N)); w = spectral(N, 2.2, seed); f = spectral(N, 0.5, seed + 1, 6.0, 0.6); a = spectral(N, 1.8, seed + 2)
    beds = sum(np.sin(2 * math.pi * (y * k + w * q + p)) * e for k, q, p, e in ((5, 0.7, 0.1, 0.5), (11, 0.9, 0.37, 0.3), (23, 1.2, 0.61, 0.2), (47, 1.4, 0.83, 0.12)))
    beds = np.clip(0.5 + 0.5 * beds, 0, 1)
    f1, f2, _ = worley(7, seed + 3); wob = spectral(N, 1.4, seed + 4)
    joint = 0.5 * np.clip(1 - (f2 - f1 + 0.3 * (wob - 0.5)) * 42, 0, 1) * np.clip((spectral(N, 1.5, seed + 5) - 0.5) * 4, 0, 1)
    pit = np.clip((spectral(N, 0.7, seed + 6) - 0.74) * 8, 0, 1)
    v = 0.3 + 0.42 * beds + 0.1 * (a - 0.5) + 0.08 * (f - 0.5)
    col = lerp3([0.38, 0.27, 0.2], [0.82, 0.68, 0.53], np.clip(v, 0, 1)) * (1 - 0.55 * joint - 0.3 * pit)[..., None]
    h = 0.8 * beds + 0.35 * f + 0.3 * a - 0.8 * joint - 0.35 * pit
    return np.clip(col, 0, 1), normal_from_height(h, 7.0), ao_from_height(h, 0.8), 0.92, 0.0

def mat_basalt(seed):     # dark volcanic rock: polygon column joints, vesicle pits, a little rust
    f1, f2, nid = worley(11, seed); wob = spectral(N, 1.3, seed + 1); a = spectral(N, 1.7, seed + 2); f = spectral(N, 0.4, seed + 3)
    joint = np.clip(1 - (f2 - f1 + 0.08 * (wob - 0.5)) * 16, 0, 1)
    ves = np.clip((spectral(N, 0.2, seed + 4) - 0.7) * 9, 0, 1); rust = np.clip((spectral(N, 1.9, seed + 5) - 0.64) * 4, 0, 1)
    v = 0.16 + 0.1 * (nid - 0.5) + 0.1 * (a - 0.5) + 0.05 * (f - 0.5)
    col = np.repeat(np.clip(v, 0, 1)[..., None], 3, -1) * np.array([1.0, 0.98, 0.98]) * (1 - 0.7 * joint - 0.4 * ves)[..., None]
    col = col * (1 - 0.35 * rust[..., None]) + np.array([0.22, 0.12, 0.07]) * 0.35 * rust[..., None]
    h = 0.55 * (nid - 0.5) + 0.3 * a + 0.15 * f - 0.9 * joint - 0.3 * ves
    return np.clip(col, 0, 1), normal_from_height(h, 8.0), ao_from_height(h, 0.9), 0.8 + 0.15 * f, 0.0

def mat_granite(seed):    # coarse crystalline rock: salt-and-pepper grain, broad rounded sheets, a few long cracks, crusts of pale lichen
    gr = spectral(N, 0.0, seed); gr2 = spectral(N, 0.25, seed + 1); a = spectral(N, 1.7, seed + 2, lo=2); f1, f2, nid = worley(4, seed + 3); wob = spectral(N, 1.2, seed + 4)
    fade = np.clip((spectral(N, 1.5, seed + 6) - 0.5) * 5, 0, 1)
    crack = np.clip(1 - (f2 - f1 + 0.22 * (wob - 0.5)) * 60, 0, 1) * fade
    dark = np.clip((gr - 0.56) * 9, 0, 1); pale = np.clip((0.44 - gr2) * 9, 0, 1)
    lich = np.clip((spectral(N, 1.0, seed + 5, lo=8) - 0.66) * 7, 0, 1)
    base = lerp3([0.38, 0.36, 0.34], [0.6, 0.57, 0.53], a) * (1 - 0.42 * dark + 0.2 * pale)[..., None] * (1 - 0.7 * crack)[..., None]
    col = base * (1 - 0.45 * lich[..., None]) + np.array([0.62, 0.61, 0.46]) * 0.45 * lich[..., None]
    h = 0.8 * a + 0.2 * (nid - 0.5) + 0.12 * gr - 0.6 * crack + 0.08 * lich
    return np.clip(col, 0, 1), normal_from_height(h, 6.0), ao_from_height(h, 0.7), 0.82 + 0.1 * gr2, 0.0

def mat_pale(seed):       # weathered limestone in the open: pale, solution-pitted, grooves running down it
    a = spectral(N, 1.9, seed); run = spectral(N, 0.9, seed + 1, 1.0, 9.0); pit = np.clip((spectral(N, 0.6, seed + 2) - 0.68) * 7, 0, 1); f1, f2, nid = worley(6, seed + 3); wob = spectral(N, 1.4, seed + 4)
    grike = np.clip(1 - (f2 - f1 + 0.2 * (wob - 0.5)) * 15, 0, 1)
    v = 0.66 + 0.16 * (a - 0.5) + 0.1 * (run - 0.5) + 0.05 * (nid - 0.5)
    col = np.repeat(np.clip(v, 0, 1)[..., None], 3, -1) * np.array([1.0, 0.97, 0.9]) * (1 - 0.65 * grike - 0.35 * pit)[..., None]
    h = 0.5 * a + 0.3 * run - 1.0 * grike - 0.4 * pit
    return np.clip(col, 0, 1), normal_from_height(h, 6.0), ao_from_height(h, 0.8), 0.9, 0.0

def mat_cracked(seed):    # a dried lake bed: curled polygon plates of salt and clay, deep dark cracks
    f1, f2, nid = worley(12, seed); wob = spectral(N, 1.2, seed + 1); g = spectral(N, 0.2, seed + 2); a = spectral(N, 1.8, seed + 3)
    gap = f2 - f1 + 0.09 * (wob - 0.5)
    crack = np.clip(1 - gap * 11, 0, 1) ** 1.3; curl = np.clip(1 - gap * 3.5, 0, 1)
    col = lerp3([0.66, 0.62, 0.55], [0.88, 0.85, 0.78], np.clip(0.4 * nid + 0.4 * a + 0.2 * g, 0, 1)) * (1 - 0.82 * crack)[..., None] * (1 + 0.12 * curl)[..., None]
    h = 0.7 + 0.4 * curl - 1.3 * crack + 0.08 * g + 0.08 * nid
    return np.clip(col, 0, 1), normal_from_height(h, 5.0), ao_from_height(h, 0.9), 0.93, 0.0

def mat_moss(seed):       # cushions of moss: soft domes at two sizes, no outlines, darker in the hollows
    a1, _, id1 = worley(10, seed); a2, _, _ = worley(34, seed + 4); fine = spectral(N, 0.0, seed + 1); g = spectral(N, 0.6, seed + 2); a = spectral(N, 1.5, seed + 3, lo=4)
    d1 = np.clip(1 - a1 * 1.0, 0, 1) ** 0.8; d2 = np.clip(1 - a2 * 1.1, 0, 1) ** 0.7
    t = np.clip(0.42 * d1 + 0.3 * d2 + 0.22 * fine + 0.2 * (g - 0.5) + 0.1, 0, 1)
    col = lerp3([0.14, 0.2, 0.07], [0.5, 0.56, 0.2], t) * (0.86 + 0.28 * a)[..., None]
    h = 0.9 * d1 + 0.5 * d2 + 0.3 * fine
    return np.clip(col, 0, 1), normal_from_height(h, 4.0), ao_from_height(h, 0.9), 0.97, 0.0

def mat_litter(seed):     # a forest floor: thousands of fallen leaves and twigs on dark humus
    r = np.random.default_rng(seed); col = lerp3([0.11, 0.08, 0.05], [0.2, 0.15, 0.09], spectral(N, 0.8, seed + 1)); h = spectral(N, 1.2, seed + 2) * 0.25
    Y, X = np.mgrid[0:N, 0:N]
    for i in range(2600):
        cx, cy = r.integers(0, N, 2); L = r.uniform(9, 26); W = L * r.uniform(0.22, 0.42); a = r.uniform(0, math.pi * 2); ca, sa = math.cos(a), math.sin(a); B = int(L + 2)
        ys = (np.arange(cy - B, cy + B)) % N; xs = (np.arange(cx - B, cx + B)) % N
        gx, gy = np.meshgrid(np.arange(-B, B), np.arange(-B, B))
        u = (gx * ca + gy * sa) / L; v = (-gx * sa + gy * ca) / W
        m = np.abs(v) < np.sqrt(np.clip(1 - u * u, 0, 1)) * (1 - 0.3 * u)
        t = r.random(); c = np.array([0.42, 0.25, 0.1]) * (1 - t) + np.array([0.2, 0.13, 0.07]) * t if t < 0.8 else np.array([0.48, 0.38, 0.16])
        shade = (0.72 + 0.28 * np.clip(1 - np.abs(v), 0, 1)) * (0.75 + 0.5 * r.random()); z = h.max() * 0 + (i / 2600) * 0.5 + 0.35 + 0.08 * u
        sub = np.ix_(ys, xs); colS = col[sub]; hS = h[sub]
        colS[m] = c * shade[m][:, None]; hS[m] = z[m]
        col[sub] = colS; h[sub] = hS
    for i in range(150):       # twigs and needles over the leaves
        cx, cy = r.integers(0, N, 2); L = int(r.uniform(20, 70)); a = r.uniform(0, math.pi * 2)
        for k in range(L):
            x = int(cx + math.cos(a) * k) % N; y = int(cy + math.sin(a) * k) % N; col[y, x] = (0.09, 0.065, 0.045); h[y, x] = 0.95; col[y, (x + 1) % N] = (0.13, 0.09, 0.06)
    return np.clip(col, 0, 1), normal_from_height(h, 5.0), ao_from_height(h, 1.0), 0.93, 0.0

def mat_peat(seed):       # bog: dark waterlogged peat, tussock fibres, glinting wet hollows
    a = spectral(N, 1.2, seed, lo=4); f = spectral(N, 0.45, seed + 1, 5.0, 1.0); f2 = spectral(N, 0.45, seed + 3, 1.0, 5.0); wet = np.clip((spectral(N, 1.4, seed + 2, lo=3) - 0.6) * 9, 0, 1)
    t = np.clip(0.4 * a + 0.3 * f + 0.3 * f2, 0, 1) ** 1.2
    col = lerp3([0.05, 0.04, 0.03], [0.3, 0.23, 0.15], t) * (1 - 0.6 * wet)[..., None]
    h = (0.5 * a + 0.3 * f + 0.3 * f2) * (1 - wet)
    return np.clip(col, 0, 1), normal_from_height(h, 5.0), ao_from_height(h, 0.8), np.clip(0.92 - 0.8 * wet, 0.1, 1), 0.0

def mat_ash(seed):        # cinder ground: loose black clinker and drifts of grey ash
    f1, f2, nid = worley(38, seed); g = spectral(N, 0.05, seed + 1); a = spectral(N, 1.3, seed + 2, lo=5); ash = np.clip((a - 0.48) * 5, 0, 1)
    cl = np.clip(1 - f1 * 1.5, 0, 1) ** 0.8; gap = np.clip(1 - (f2 - f1) * 5, 0, 1)
    col = lerp3([0.06, 0.055, 0.055], [0.22, 0.2, 0.19], np.clip(0.6 * nid + 0.4 * g, 0, 1)) * (1 - 0.5 * gap)[..., None]
    col = col * (1 - 0.55 * ash[..., None]) + lerp3([0.3, 0.28, 0.27], [0.44, 0.42, 0.4], g) * 0.55 * ash[..., None]
    h = cl * (1 - 0.65 * ash) + 0.15 * g - 0.3 * gap
    return np.clip(col, 0, 1), normal_from_height(h, 5.0), ao_from_height(h, 0.8), 0.95, 0.0

def mat_heath(seed):      # low wiry scrub: dark stems, fine tufts, sprays of small pale flowers, patches of bare peat
    st = spectral(N, 0.35, seed, 3.0, 1.0); st2 = spectral(N, 0.35, seed + 1, 1.0, 3.0); fine = spectral(N, 0.0, seed + 2); a = spectral(N, 1.5, seed + 3, lo=4)
    wiry = 1 - np.abs(st - 0.5) * 2; wiry2 = 1 - np.abs(st2 - 0.5) * 2; t = np.clip(0.5 * wiry ** 3 + 0.5 * wiry2 ** 3 + 0.25 * fine, 0, 1)
    fl = np.clip((fine - 0.58) * 14, 0, 1) * np.clip((spectral(N, 1.2, seed + 4, lo=5) - 0.5) * 7, 0, 1)
    col = lerp3([0.09, 0.07, 0.05], [0.42, 0.37, 0.25], t) * (0.8 + 0.4 * a)[..., None]
    col = col * (1 - 0.85 * fl[..., None]) + np.array([0.7, 0.58, 0.68]) * 0.85 * fl[..., None]
    h = t + 0.3 * a
    return np.clip(col, 0, 1), normal_from_height(h, 6.0), ao_from_height(h, 1.0), 0.97, 0.0

def mat_snow(seed):       # wind-packed snow: sastrugi and sparkle in the normal
    a = spectral(N, 2.1, seed, 3.0, 1.0); f = spectral(N, 0.6, seed + 1, 4.0, 1.0); g = spectral(N, 0.0, seed + 2)
    col = np.repeat(np.clip(0.84 + 0.1 * a + 0.03 * f, 0, 1)[..., None], 3, -1) * np.array([0.97, 0.985, 1.0])
    h = 0.8 * a + 0.2 * f + 0.02 * g
    return np.clip(col, 0, 1), normal_from_height(h, 3.0), ao_from_height(h, 0.3), 0.78 + 0.1 * g, 0.0

# ---- animal skins: neutral, tinted by each species' own colours
def mat_hide(seed):       # thick wrinkled hide: creases that wander and fork, pores, broad mottling
    w1 = spectral(N, 1.1, seed, 3.0, 1.0, lo=3); w2 = spectral(N, 1.1, seed + 1, 1.0, 2.0, lo=4); p = np.clip((spectral(N, 0.1, seed + 2) - 0.68) * 8, 0, 1); a = spectral(N, 1.4, seed + 3, lo=3)
    c1 = np.clip(1 - np.abs(w1 - 0.5) * 16, 0, 1); c2 = np.clip(1 - np.abs(w2 - 0.5) * 22, 0, 1); crease = np.clip(c1 + 0.6 * c2, 0, 1)
    v = 0.68 + 0.18 * (a - 0.5) - 0.34 * crease - 0.08 * p
    h = 0.7 * (w1 + w2) - 0.7 * crease - 0.06 * p
    return np.repeat(np.clip(v, 0, 1)[..., None], 3, -1), normal_from_height(h, 7.0), ao_from_height(h, 0.7), 0.74 + 0.1 * a, 0.0

def mat_scales(seed):     # real overlapping rounded scales: each row laps over the row below it, each scale its own tone
    R = 24; cell = N / R; r = np.random.default_rng(seed); tones = r.random((R, R)); a = spectral(N, 1.5, seed + 1, lo=3)
    Y, X = np.mgrid[0:N, 0:N]; tone = np.zeros((N, N)); h = np.zeros((N, N)); edge = np.zeros((N, N))
    for row in range(R * 2 + 2):             # top rows are painted last, so they lie over the ones below
        rw = R * 2 + 1 - row; cy = rw * cell * 0.5; off = (rw % 2) * cell * 0.5
        dy = ((Y - cy + N / 2) % N - N / 2) / (cell * 0.72)
        dx = (((X - off + cell / 2) % cell) - cell / 2) / (cell * 0.56)
        d = np.sqrt(dx * dx + np.clip(dy, None, 0) ** 2 * 0.2 + np.clip(dy, 0, None) ** 2)
        m = (d < 1) & (dy > -1.0)
        idx = (((X - off + cell / 2) // cell).astype(int) % R)
        t = tones[(rw // 2) % R][idx]
        tone[m] = t[m]; h[m] = (1 - d[m] ** 2) * 0.7 + (dy[m] + 1) * 0.35; edge[m] = d[m]
    v = (0.42 + 0.34 * tone + 0.14 * (a - 0.5)) * (1 - 0.5 * np.clip((edge - 0.72) * 3.4, 0, 1))
    return np.repeat(np.clip(v, 0, 1)[..., None], 3, -1), normal_from_height(h, 4.0), ao_from_height(h, 0.7), 0.42 + 0.2 * tone, 0.0

def mat_pelt(seed):       # short dense fur, lying one way, in tufts
    fib = spectral(N, 0.3, seed, 1.0, 14.0); fine = spectral(N, 0.05, seed + 1, 1.0, 8.0); tuft = spectral(N, 1.2, seed + 2, 1.0, 3.0); a = spectral(N, 1.9, seed + 3)
    v = 0.28 + 0.62 * np.clip(0.55 * fib + 0.3 * fine + 0.15 * tuft, 0, 1) + 0.08 * (a - 0.5)
    h = 0.6 * fib + 0.3 * fine + 0.5 * tuft
    return np.repeat(np.clip(v, 0, 1)[..., None], 3, -1), normal_from_height(h, 7.0), ao_from_height(h, 0.9), 0.97, 0.0

def mat_chitin(seed):     # smooth banded plate: growth lines, small nicks, a waxy shine
    y = np.arange(N)[:, None] / N * np.ones((1, N)); w = spectral(N, 2.1, seed); g = spectral(N, 0.2, seed + 1); nick = np.clip((spectral(N, 0.6, seed + 2) - 0.78) * 7, 0, 1)
    band = 0.5 + 0.5 * np.sin(2 * math.pi * (y * 12 + w * 1.5))
    v = 0.56 + 0.22 * (band - 0.5) + 0.06 * (g - 0.5) - 0.2 * nick
    h = 0.25 * band + 0.03 * g - 0.3 * nick
    return np.repeat(np.clip(v, 0, 1)[..., None], 3, -1), normal_from_height(h, 2.5), ao_from_height(h, 0.4), 0.3 + 0.2 * nick, 0.0

# ---- more for people's things
def mat_cobble(seed):     # rounded setts in a sandy bed
    f1, f2, nid = worley(16, seed); g = spectral(N, 0.2, seed + 1); a = spectral(N, 1.8, seed + 2)
    dome = np.clip(1 - f1 * 1.1, 0, 1) ** 0.5; gap = np.clip(1 - (f2 - f1) * 6, 0, 1)
    col = lerp3([0.3, 0.29, 0.28], [0.56, 0.53, 0.48], np.clip(0.6 * nid + 0.25 * a + 0.15 * g, 0, 1)) * (1 - 0.72 * gap)[..., None]
    h = dome + 0.08 * g - 0.7 * gap
    return np.clip(col, 0, 1), normal_from_height(h, 5.0), ao_from_height(h, 0.9), 0.72 + 0.2 * gap, 0.0

def mat_adobe(seed):      # hand-smoothed mud wall: straw flecks, patched render, cracks, a damp foot
    a = spectral(N, 1.9, seed); tr = spectral(N, 1.3, seed + 1, 3.0, 1.0); fl = np.clip((spectral(N, 0.0, seed + 2, 3.0, 1.0) - 0.75) * 9, 0, 1); f1, f2, _ = worley(5, seed + 3); wob = spectral(N, 1.2, seed + 4)
    crack = np.clip(1 - (f2 - f1 + 0.2 * (wob - 0.5)) * 40, 0, 1) * np.clip((spectral(N, 1.8, seed + 5) - 0.55) * 4, 0, 1)
    col = lerp3([0.48, 0.36, 0.25], [0.72, 0.58, 0.42], np.clip(0.65 * a + 0.35 * tr, 0, 1)) * (1 - 0.15 * fl - 0.6 * crack)[..., None]
    h = 0.7 * a + 0.4 * tr - 0.7 * crack + 0.05 * fl
    return np.clip(col, 0, 1), normal_from_height(h, 3.5), ao_from_height(h, 0.5), 0.95, 0.0

def mat_rust(seed):       # sheet steel gone to rust: flaking blooms over old grey paint, streaks
    a = spectral(N, 1.5, seed); fine = spectral(N, 0.1, seed + 1); st = streaks(seed + 2, 1.0); flake = np.clip((spectral(N, 0.7, seed + 3) - 0.6) * 6, 0, 1)
    r_ = lerp3([0.2, 0.09, 0.05], [0.56, 0.28, 0.12], np.clip(0.6 * a + 0.4 * fine, 0, 1)); pt = lerp3([0.28, 0.32, 0.33], [0.42, 0.46, 0.46], fine)
    keep = np.clip((a - 0.58) * 6, 0, 1)
    col = r_ * (1 - keep[..., None]) + pt * keep[..., None]; col = col * (1 - 0.3 * st[..., None]) * (1 - 0.3 * flake[..., None])
    h = 0.4 * keep + 0.5 * fine - 0.4 * flake
    return np.clip(col, 0, 1), normal_from_height(h, 4.0), ao_from_height(h, 0.5), 0.86 - 0.3 * keep, 0.2 * keep

def mat_canvas(seed):     # heavy tarpaulin: coarse weave, sun fade, stains, a stitched seam
    x = np.arange(N)[None, :] / N * np.ones((N, 1)); y = np.arange(N)[:, None] / N * np.ones((1, N))
    w = 0.5 + 0.25 * (np.sin(2 * math.pi * x * 170) + np.sin(2 * math.pi * y * 170)); a = spectral(N, 2.0, seed); st = np.clip((spectral(N, 1.7, seed + 1) - 0.65) * 4, 0, 1)
    seam = np.exp(-(((y - 0.5) * 90) ** 2))
    v = (0.56 + 0.22 * (a - 0.5) + 0.1 * (w - 0.5)) * (1 - 0.3 * st) * (1 - 0.3 * seam)
    h = 0.5 * w + 0.3 * a + 0.3 * seam
    return np.repeat(np.clip(v, 0, 1)[..., None], 3, -1) * np.array([1.0, 0.97, 0.88]), normal_from_height(h, 3.0), ao_from_height(h, 0.4), 0.96, 0.0

def mat_carpet(seed):     # looped wool, worn in a path, with a border pattern
    g = spectral(N, 0.0, seed); a = spectral(N, 1.9, seed + 1)
    v = 0.48 + 0.34 * (g - 0.5) + 0.16 * (a - 0.5)
    return np.repeat(np.clip(v, 0, 1)[..., None], 3, -1), normal_from_height(0.9 * g + 0.1 * a, 5.0), ao_from_height(g, 0.8), 0.99, 0.0

def mat_lacquer(seed):    # a dark worn gun or tool finish: fine bead-blast, scratches at the edges
    g = spectral(N, 0.0, seed); a = spectral(N, 1.8, seed + 1); sc = np.clip((spectral(N, 0.2, seed + 2, 24.0, 1.0) - 0.7) * 8, 0, 1) * np.clip((a - 0.5) * 3, 0, 1)
    v = 0.27 + 0.05 * (g - 0.5) + 0.05 * (a - 0.5) + 0.35 * sc
    return np.repeat(np.clip(v, 0, 1)[..., None], 3, -1), normal_from_height(0.2 * g - 0.3 * sc, 1.5), ao_from_height(g, 0.2), 0.42 + 0.14 * g - 0.15 * sc, 0.65 + 0.3 * sc

def mat_leather(seed):    # grip leather: pebbled, worn lighter in the palm
    f1, f2, _ = worley(70, seed); a = spectral(N, 1.9, seed + 1); gap = np.clip(1 - (f2 - f1) * 5, 0, 1)
    col = lerp3([0.16, 0.09, 0.05], [0.36, 0.22, 0.13], a) * (1 - 0.45 * gap)[..., None]
    return np.clip(col, 0, 1), normal_from_height(1 - gap + 0.2 * a, 3.0), ao_from_height(1 - gap, 0.5), 0.6 + 0.15 * a, 0.0

MATERIALS = {   # name: (generator, tile size in metres — read by the game from assets/materials/index.json)
    'sand': (mat_sand, 3.0), 'sandstone': (mat_sandstone, 12.0), 'basalt': (mat_basalt, 7.0), 'granite': (mat_granite, 8.0), 'pale': (mat_pale, 8.0), 'cracked': (mat_cracked, 6.0), 'moss': (mat_moss, 2.4), 'litter': (mat_litter, 3.0), 'peat': (mat_peat, 3.0), 'ash': (mat_ash, 3.0), 'heath': (mat_heath, 3.0), 'snow': (mat_snow, 5.0),
    'hide': (mat_hide, 1.0), 'scales': (mat_scales, 0.5), 'pelt': (mat_pelt, 0.5), 'chitin': (mat_chitin, 0.7),
    'cobble': (mat_cobble, 2.4), 'adobe': (mat_adobe, 3.0), 'rust': (mat_rust, 2.0), 'canvas': (mat_canvas, 1.6), 'carpet': (mat_carpet, 1.0), 'lacquer': (mat_lacquer, 0.5), 'leather': (mat_leather, 0.4),
    'limestone': (mat_limestone, 2.4), 'wood': (mat_wood, 1.2), 'fabric': (mat_fabric, 0.45), 'paint': (mat_paint, 1.0), 'metal': (mat_metal, 0.6),
    'laminate': (mat_laminate, 1.0), 'stone': (mat_stone, 1.0), 'plastic': (mat_plastic, 0.5), 'rubber': (mat_rubber, 0.3),
    'concrete': (mat_concrete, 2.0), 'soil': (mat_soil, 0.5), 'leaf': (mat_leaf, 0.3), 'cardboard': (mat_cardboard, 0.6),
    'facade': (mat_facade, 3.2), 'corrugated': (mat_corrugated, 2.4), 'render': (mat_render, 3.0), 'floortile': (mat_floortile, 4.0),
    'asphalt': (mat_asphalt, 6.0), 'pavers': (mat_pavers, 4.0),
    'brick': (mat_brick, 1.8), 'rooftile': (mat_rooftile, 2.4), 'slate': (mat_slate, 3.0), 'thatch': (mat_thatch, 2.5), 'plank': (mat_plank, 2.4),
    'ceramic': (mat_ceramic, 1.0), 'mirror': (mat_mirror, 1.0), 'books': (mat_books, 0.5), 'water': (mat_water, 24.0), 'hull': (mat_hull, 4.0), 'heatshield': (mat_heatshield, 2.4), 'hazard': (mat_hazard, 1.0), 'bark': (mat_bark, 1.2), 'birchbark': (mat_birchbark, 1.0), 'smoothbark': (mat_smoothbark, 1.5), 'grass': (mat_grass, 3.0), 'dirt': (mat_dirt, 3.0), 'rock': (mat_rock, 8.0), 'gravel': (mat_gravel, 2.0),
}

# ---- foliage atlases (RGBA): a leafy twig and a needle spray, drawn on transparent ground
def save_rgba(name, rgba):
    img = bpy.data.images.new(name, N, N, alpha=True)
    img.colorspace_settings.name = 'sRGB'; img.alpha_mode = 'STRAIGHT'
    img.pixels.foreach_set(np.clip(rgba, 0, 1).astype(np.float32)[::-1].ravel())
    img.filepath_raw = os.path.join(MAT_DIR, name + '.png'); img.file_format = 'PNG'
    img.save(); bpy.data.images.remove(img)

def draw_twig(kind, seed):
    """kind 'leaf': a twig rising up the middle with alternate leaves; 'needle': a frond along x."""
    r = np.random.default_rng(seed)
    col = np.zeros((N, N, 3)); a = np.zeros((N, N))
    Y, X = np.mgrid[0:N, 0:N] / N                   # image rows (y down) and columns
    def stroke(x0, y0, x1, y1, w, c):
        dx, dy = x1 - x0, y1 - y0; L2 = dx * dx + dy * dy
        bx0, bx1 = int(max(0, (min(x0, x1) - w) * N)), int(min(N, (max(x0, x1) + w) * N + 1)); by0, by1 = int(max(0, (min(y0, y1) - w) * N)), int(min(N, (max(y0, y1) + w) * N + 1))
        xs, ys = X[by0:by1, bx0:bx1], Y[by0:by1, bx0:bx1]
        t = np.clip(((xs - x0) * dx + (ys - y0) * dy) / L2, 0, 1)
        d = np.hypot(xs - x0 - t * dx, ys - y0 - t * dy); m = d < w * (1 - 0.6 * t)
        col[by0:by1, bx0:bx1][m] = c; a[by0:by1, bx0:bx1][m] = 1
    def leaf(cx, cy, ang, ln, wd, c):
        bx0, bx1 = int(max(0, (cx - ln) * N)), int(min(N, (cx + ln) * N + 1)); by0, by1 = int(max(0, (cy - ln) * N)), int(min(N, (cy + ln) * N + 1))
        xs, ys = X[by0:by1, bx0:bx1] - cx, Y[by0:by1, bx0:bx1] - cy
        u = (xs * math.cos(ang) + ys * math.sin(ang)) / ln; v = (-xs * math.sin(ang) + ys * math.cos(ang)) / wd
        m = (u > 0) & (u < 1) & (np.abs(v) < np.sin(np.clip(u, 0, 1) * math.pi) ** 0.8)
        shade = 0.82 + 0.18 * np.clip(1 - np.abs(v) * 1.2, 0, 1) - 0.25 * (np.abs(v) < 0.06)        # midrib, darker edges
        sub = col[by0:by1, bx0:bx1]; sub[m] = (np.array(c)[None, :] * shade[m][:, None]); a[by0:by1, bx0:bx1][m] = 1
    if kind == 'leaf':
        # a spray of fine twigs, each with many small leaves: reads as foliage, not as one big leaf
        stroke(0.5, 0.99, 0.5, 0.08, 0.008, srgb((70, 52, 36)))
        for tw in range(7):
            ty = 0.92 - tw * 0.12; side = 1 if tw % 2 else -1
            ex, ey = 0.5 + side * r.uniform(0.25, 0.42), ty - r.uniform(0.12, 0.22)
            stroke(0.5, ty, ex, ey, 0.004, srgb((76, 60, 42)))
            for k in range(11):
                t = (k + 0.5) / 11; px, py = 0.5 + (ex - 0.5) * t, ty + (ey - ty) * t
                for sd in (-1, 1):
                    c = srgb((int(r.uniform(62, 112)), int(r.uniform(100, 150)), int(r.uniform(36, 62))))
                    ang = math.atan2(ey - ty, ex - 0.5) + sd * r.uniform(0.6, 1.1)
                    leaf(px, py, ang, r.uniform(0.055, 0.08), r.uniform(0.022, 0.03), c)
        for k in range(10):                                   # a few at the tip
            c = srgb((int(r.uniform(62, 112)), int(r.uniform(100, 150)), int(r.uniform(36, 62))))
            leaf(0.5, 0.1 + k * 0.012, -math.pi / 2 + r.uniform(-0.9, 0.9), r.uniform(0.06, 0.085), 0.026, c)
    else:
        stroke(0.02, 0.5, 0.98, 0.5, 0.01, srgb((80, 60, 42)))
        for k in range(14):                                   # side shoots
            x0 = 0.06 + 0.86 * k / 14; ln = 0.32 * (1 - 0.6 * x0)
            for side in (-1, 1): stroke(x0, 0.5, x0 + ln * 0.5, 0.5 + side * ln, 0.006, srgb((80, 62, 44)))
        for k in range(1800):                                 # needles
            t = r.random(); x = 0.03 + 0.95 * t; side = r.choice([-1, 1]); spread = 0.36 * (1 - 0.55 * t) * r.random() ** 0.7
            y = 0.5 + side * spread; ang = side * r.uniform(0.6, 1.3) - 0.35
            ln = r.uniform(0.025, 0.045)
            c = srgb((int(r.uniform(30, 55)), int(r.uniform(60, 92)), int(r.uniform(36, 52))))
            stroke(x, y, x + math.cos(ang) * ln, y + math.sin(ang) * ln, 0.0035, c)
    return np.concatenate([col, a[..., None]], -1)

def draw_impostor(kind, seed):
    """A whole tree seen from the side, for the distant stand-in: drawn from the same
    strokes as the foliage atlases (trunk, then foliage within the tree's silhouette)."""
    r = np.random.default_rng(seed)
    col = np.zeros((N, N, 3)); a = np.zeros((N, N))
    Y, X = np.mgrid[0:N, 0:N] / N
    def blob(cx, cy, rad, c):
        bx0, bx1 = int(max(0, (cx - rad) * N)), int(min(N, (cx + rad) * N + 1)); by0, by1 = int(max(0, (cy - rad) * N)), int(min(N, (cy + rad) * N + 1))
        xs, ys = X[by0:by1, bx0:bx1] - cx, Y[by0:by1, bx0:bx1] - cy
        m = xs * xs + ys * ys < rad * rad
        sub = col[by0:by1, bx0:bx1]; sub[m] = c; a[by0:by1, bx0:bx1][m] = 1
    trunk = srgb((74, 56, 42))
    if kind == 'conifer':
        m = (np.abs(X - 0.5) < 0.012) & (Y > 0.05); col[m] = trunk; a[m] = 1
        for k in range(5200):            # needle tufts filling a drooping triangle, darker inside and below
            y = r.uniform(0.02, 0.86); half = 0.47 * (y / 0.86) ** 0.95 * r.uniform(0.75, 1.0)
            x = 0.5 + r.uniform(-1, 1) * half
            shade = 0.55 + 0.45 * (abs(x - 0.5) / max(half, 1e-3)) * (1 - 0.4 * y) * r.uniform(0.7, 1.0)
            blob(x, y + 0.02 * abs(x - 0.5) / max(half, 1e-3), r.uniform(0.006, 0.014), np.array(srgb((40, 74, 46))) * shade * 1.25)
    else:
        m = (np.abs(X - 0.5) < 0.02 * (0.6 + Y)) & (Y > 0.45); col[m] = trunk; a[m] = 1
        for k in range(4200):            # leaf clusters in a rounded crown, lit from above
            ang = r.uniform(0, 2 * math.pi); rad = r.random() ** 0.6
            x = 0.5 + math.cos(ang) * rad * 0.46; y = 0.36 + math.sin(ang) * rad * 0.32
            shade = 0.55 + 0.5 * (1 - (y - 0.04) / 0.64) * r.uniform(0.75, 1.0)
            blob(x, y, r.uniform(0.008, 0.02), np.array(srgb((74, 110, 52))) * shade)
    return np.concatenate([col, a[..., None]], -1)

def draw_frond(seed):
    """A long frond: midrib up the middle, many narrow leaflets angled forward (neutral olive: tinted in game)."""
    r = np.random.default_rng(seed); col = np.zeros((N, N, 3)); a = np.zeros((N, N)); Y, X = np.mgrid[0:N, 0:N] / N
    def seg(x0, y0, x1, y1, w, c):
        dx, dy = x1 - x0, y1 - y0; L2 = dx * dx + dy * dy + 1e-9
        bx0, bx1 = int(max(0, (min(x0, x1) - w) * N)), int(min(N, (max(x0, x1) + w) * N + 1)); by0, by1 = int(max(0, (min(y0, y1) - w) * N)), int(min(N, (max(y0, y1) + w) * N + 1))
        xs, ys = X[by0:by1, bx0:bx1], Y[by0:by1, bx0:bx1]; t = np.clip(((xs - x0) * dx + (ys - y0) * dy) / L2, 0, 1)
        m = np.hypot(xs - x0 - t * dx, ys - y0 - t * dy) < w * (1 - 0.7 * t); col[by0:by1, bx0:bx1][m] = c; a[by0:by1, bx0:bx1][m] = 1
    seg(0.5, 0.99, 0.5, 0.03, 0.008, srgb((120, 120, 90)))
    for k in range(46):
        t = 0.05 + 0.9 * k / 46; y = 0.99 - t * 0.95; L = 0.36 * math.sin(math.pi * min(1, t * 1.15)) + 0.04
        for sgn in (-1, 1):
            c = np.array(srgb((int(r.uniform(150, 190)), int(r.uniform(165, 200)), int(r.uniform(110, 140)))))
            seg(0.5, y, 0.5 + sgn * L, y - L * 0.55, 0.012, c)
    return np.concatenate([col, a[..., None]], -1)

def draw_pads(seed):
    """Rounded fleshy leaves on short stalks around a twig (neutral pale: tinted in game)."""
    r = np.random.default_rng(seed); col = np.zeros((N, N, 3)); a = np.zeros((N, N)); Y, X = np.mgrid[0:N, 0:N] / N
    for k in range(34):
        cx, cy, rad = r.uniform(0.15, 0.85), r.uniform(0.12, 0.92), r.uniform(0.05, 0.11)
        d = np.hypot(X - cx, (Y - cy) * 1.15)
        m = d < rad
        shade = 0.75 + 0.3 * (1 - d / rad) - 0.15 * (np.abs(X - cx) < 0.004)
        c = np.array(srgb((int(r.uniform(175, 215)), int(r.uniform(180, 215)), int(r.uniform(170, 210)))))
        col[m] = (c[None, :] * shade[m][:, None]); a[m] = 1
    return np.concatenate([col, a[..., None]], -1)

def build_foliage():
    for name, kind in (('foliage_leaf', 'leaf'), ('foliage_needle', 'needle')):
        save_rgba(name, draw_twig(kind, 77 if kind == 'leaf' else 91)); print('texture', name)
    # grass blades: tapering, curving strokes rising from the bottom edge, on transparent ground
    r = np.random.default_rng(13); col = np.zeros((N, N, 3)); al = np.zeros((N, N)); Y, X = np.mgrid[0:N, 0:N] / N
    for k in range(260):
        x0 = r.uniform(0.04, 0.96); h = r.uniform(0.45, 0.97); lean = r.uniform(-0.25, 0.25); w = r.uniform(0.006, 0.012)
        c = np.array(srgb((int(r.uniform(70, 125)), int(r.uniform(105, 150)), int(r.uniform(40, 70)))))
        for t in np.linspace(0, 1, 60):
            cx = x0 + lean * t * t; cy = 1 - h * t; rad = w * (1 - t) + 0.0015
            bx0, bx1 = int(max(0, (cx - rad) * N)), int(min(N, (cx + rad) * N + 1)); by0, by1 = int(max(0, (cy - 0.01) * N)), int(min(N, (cy + 0.01) * N + 1))
            m = np.abs(X[by0:by1, bx0:bx1] - cx) < rad
            col[by0:by1, bx0:bx1][m] = c * (0.55 + 0.6 * t); al[by0:by1, bx0:bx1][m] = 1
    save_rgba('grass_blades', np.concatenate([col, al[..., None]], -1)); print('texture grass_blades')
    save_rgba('foliage_frond', draw_frond(41)); save_rgba('foliage_pad', draw_pads(43)); print('texture fronds, pads')
    for kind in ('conifer', 'broadleaf'): save_rgba('impostor_' + kind, draw_impostor(kind, 5 if kind == 'conifer' else 6)); print('texture impostor', kind)

def build_art():
    """16 small paintings in a 4 × 4 atlas: landscapes (layered ridges under a sky) and
    abstract colour fields, with a little canvas grain."""
    r = np.random.default_rng(29); C = N // 4; out = np.zeros((N, N, 3))
    grain = spectral(N, 0.2, 31)
    for k in range(16):
        y = np.arange(C)[:, None] / C * np.ones((1, C)); x = np.arange(C)[None, :] / C * np.ones((C, 1))
        if k % 3 != 2:            # landscape
            top, bot = np.array(srgb(tuple(int(v) for v in r.integers(120, 230, 3)))), np.array(srgb(tuple(int(v) for v in r.integers(150, 250, 3))))
            img = top[None, None, :] * (1 - y[..., None]) + bot[None, None, :] * y[..., None]
            for layer in range(3):
                ridge = 0.45 + 0.13 * layer + 0.08 * np.sin(x[0] * r.uniform(4, 11) + r.uniform(0, 6)) + 0.04 * np.sin(x[0] * r.uniform(15, 30))
                col = np.array(srgb(tuple(int(v) for v in r.integers(30, 120, 3)))) * (1.25 - 0.2 * layer)
                m = y > ridge[None, :]; img[m] = col
            if r.random() < 0.6:  # a sun or moon
                cx, cy = r.uniform(0.2, 0.8), r.uniform(0.15, 0.35); m = (x - cx) ** 2 + (y - cy) ** 2 < 0.004; img[m] = srgb((250, 236, 200))
        else:                     # colour field
            img = np.zeros((C, C, 3)) + np.array(srgb(tuple(int(v) for v in r.integers(60, 230, 3))))[None, None, :]
            for b_ in range(r.integers(2, 5)):
                x0, y0 = r.uniform(0, 0.6), r.uniform(0, 0.6); w_, h_ = r.uniform(0.2, 0.5), r.uniform(0.15, 0.5)
                m = (x > x0) & (x < x0 + w_) & (y > y0) & (y < y0 + h_); img[m] = srgb(tuple(int(v) for v in r.integers(30, 240, 3)))
        i, j = k // 4, k % 4
        out[i * C:(i + 1) * C, j * C:(j + 1) * C] = img
    out *= (0.92 + 0.12 * grain)[..., None]
    save('art_c', out, True); print('texture art')

def build_textures():
    os.makedirs(MAT_DIR, exist_ok=True)
    import json
    ip = os.path.join(MAT_DIR, 'index.json')
    index = json.load(open(ip)) if os.path.exists(ip) else {}
    for i, (name, (gen, tile)) in enumerate(MATERIALS.items()):
        if ONLY and name not in ONLY: continue
        col, nrm, ao, rough, metal = gen(1000 + i * 17)
        rough = np.broadcast_to(np.asarray(rough, dtype=float), (N, N)); metal = np.broadcast_to(np.asarray(metal, dtype=float), (N, N))
        save(name + '_c', col, True)
        save(name + '_n', nrm, False)
        save(name + '_orm', np.stack([ao, np.clip(rough, 0.04, 1), np.clip(metal, 0, 1)], -1), False)
        # mean linear albedo: lets a shader use the texture as detail over a colour of its own (terrain)
        index[name] = {'tile': tile, 'mean': [round(float(np.mean(np.clip(col[..., c], 0, 1) ** 2.2)), 4) for c in range(3)]}
        print('texture', name)
    if not ONLY or 'foliage' in ONLY: build_foliage()
    if not ONLY or 'art' in ONLY: build_art()
    for k, v in MATERIALS.items(): index.setdefault(k, {'tile': v[1]})['tile'] = v[1]
    with open(ip, 'w') as f: json.dump(index, f, indent=1)

# ------------------------------------------------------------------ geometry
SLOTS = ['wood', 'fabric', 'paint', 'metal', 'laminate', 'stone', 'plastic', 'rubber', 'concrete', 'soil', 'leaf', 'cardboard', 'screen', 'glass', 'tint', 'glow', 'visor', 'bark', 'rock', 'leafcard', 'needlecard', 'impconifer', 'impbroadleaf', 'birchbark', 'smoothbark', 'frondcard', 'padcard', 'hull', 'heatshield', 'hazard', 'navred', 'navgreen', 'navwhite', 'ceramic', 'mirror', 'books', 'corrugated', 'lampwarm', 'neonpink', 'neoncyan', 'neonamber', 'neongreen', 'neonviolet', 'render', 'brick', 'rooftile', 'slate', 'thatch', 'plank']
# 'tint' = the item's own colour (fabric/paint tinted per instance); 'screen' glows; 'glass' is clear; 'glow' = thruster light; 'visor' = dark tinted canopy glass

class Part:
    def __init__(self): self.bm = bmesh.new(); self.uvl = self.bm.loops.layers.uv.new('UVMap')
    def _mat(self, faces, m):
        for f in faces: f.material_index = SLOTS.index(m)

def P(x, y, z): return (x, -z, y)          # prop frame → Blender (Z up, glTF exports +Y up and -Y → +Z)

def add_box(part, x0, y0, z0, x1, y1, z1, mat, bevel=0.006, seg=2):
    bm = bmesh.new()
    vs = [bm.verts.new(P(x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    idx = lambda a, b, c: vs[a * 4 + b * 2 + c]
    for q in [((0,0,0),(0,1,0),(0,1,1),(0,0,1)), ((1,0,0),(1,0,1),(1,1,1),(1,1,0)), ((0,0,0),(0,0,1),(1,0,1),(1,0,0)),
              ((0,1,0),(1,1,0),(1,1,1),(0,1,1)), ((0,0,0),(1,0,0),(1,1,0),(0,1,0)), ((0,0,1),(0,1,1),(1,1,1),(1,0,1))]:
        bm.faces.new([idx(*c) for c in q])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    b = min(bevel, (x1 - x0) / 2.2, (y1 - y0) / 2.2, (z1 - z0) / 2.2)
    if b > 0.0005: bmesh.ops.bevel(bm, geom=list(bm.edges), offset=b, segments=seg, profile=0.5, affect='EDGES', clamp_overlap=True)
    merge(part, bm, mat)

def add_cushion(part, x0, y0, z0, x1, y1, z1, mat, puff=0.25, round_=0.35, cuts=10):
    """A stuffed shape: a box subdivided and inflated — faces bulge in the middle, edges
    pinch at the seams. puff: bulge as a fraction of the smallest half-size."""
    bm = bmesh.new()
    cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    hx, hy, hz = (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=cuts, use_grid_fill=True)
    m = min(hx, hy, hz)
    for v in bm.verts:
        u, w, t = v.co                                    # cube in [-1, 1]^3 (Blender x, y, z) → prop x, z, y
        # round the box toward a superellipsoid, then bulge each face's middle
        r = (abs(u) ** 6 + abs(w) ** 6 + abs(t) ** 6) ** (1 / 6)
        k = 1 - round_ + round_ / max(r, 1e-6)
        u, w, t = u * k, w * k, t * k
        bul = puff * m
        px = hx * u + math.copysign(bul * (1 - w * w) * (1 - t * t), u) * (abs(u) > 0.98) * 0.4
        pz = hz * w + math.copysign(bul * (1 - u * u) * (1 - t * t), w) * (abs(w) > 0.98) * 0.4
        py = hy * t + math.copysign(bul * (1 - u * u) * (1 - w * w), t) * (abs(t) > 0.98)
        v.co = P(cx + px, cy + py, cz - pz)
    merge(part, bm, mat)

def add_drape(part, x0, x1, z0, z1, top, drop, mat, thick=0.035, sides=(1, 1, 1, 1), res=0.04, rng=None):
    """A cover laid over a box top (x0..x1, z0..z1 at height top) that falls `drop` over the
    edges listed in sides (front z0, back z1, left x0, right x1), with a soft roll at the edge."""
    bm = bmesh.new()
    ex0 = x0 - (drop if sides[2] else 0); ex1 = x1 + (drop if sides[3] else 0)
    ez0 = z0 - (drop if sides[0] else 0); ez1 = z1 + (drop if sides[1] else 0)
    nx = max(2, int((ex1 - ex0) / res)); nz = max(2, int((ez1 - ez0) / res))
    R = 0.06                                           # radius of the roll over the edge
    def place(x, z, off):
        dx = max(x0 - x, 0, x - x1); dz = max(z0 - z, 0, z - z1)
        d = math.hypot(dx, dz)
        wob = 0.008 * math.sin(x * 23 + z * 7) * math.sin(z * 17 - x * 3) if rng else 0
        if d <= 0: return (x, top + off + wob, z)
        # roll over the edge: arc of radius R, then straight down
        nxv, nzv = (dx / d if x > x1 else -dx / d if x < x0 else 0), (dz / d if z > z1 else -dz / d if z < z0 else 0)
        ex, ez = x - nxv * d, z - nzv * d                  # nearest point on the top's edge
        arc = math.pi / 2 * (R + off)
        if d < arc:
            a = d / (R + off)
            return (ex + nxv * (R + off) * math.sin(a), top - R + (R + off) * math.cos(a) + wob, ez + nzv * (R + off) * math.sin(a))
        return (ex + nxv * (R + off), top - R - (d - arc) + wob, ez + nzv * (R + off))
    grid = []
    for layer, off in ((0, thick), (1, 0.0)):
        rows = []
        for i in range(nx + 1):
            row = []
            for j in range(nz + 1):
                x = ex0 + (ex1 - ex0) * i / nx; z = ez0 + (ez1 - ez0) * j / nz
                row.append(bm.verts.new(P(*place(x, z, off))))
            rows.append(row)
        grid.append(rows)
    for L, flip in ((0, False), (1, True)):
        g = grid[L]
        for i in range(nx):
            for j in range(nz):
                q = [g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]]
                bm.faces.new(q[::-1] if flip else q)
    for i in range(nx):        # close the hem
        for (j, jn) in ((0, 0), (nz, nz)):
            bm.faces.new([grid[0][i][j], grid[1][i][j], grid[1][i + 1][j], grid[0][i + 1][j]])
    for j in range(nz):
        for i in (0, nx):
            bm.faces.new([grid[0][i][j], grid[0][i][j + 1], grid[1][i][j + 1], grid[1][i][j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    merge(part, bm, mat)

def add_cyl(part, cx, cz, y0, y1, r, mat, seg=16, axis='y', r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=(y1 - y0))
    for v in bm.verts:   # created along Blender Z centred at 0; move into place along the chosen axis
        x, y, z = v.co
        if axis == 'y': v.co = P(cx + x, (y0 + y1) / 2 + z, cz + y)
        elif axis == 'x': v.co = P((y0 + y1) / 2 + z, cx + x, cz + y)      # (cx, cz) are (y, z) for an x-axis cylinder
        else: v.co = P(cx + x, cz + y, (y0 + y1) / 2 + z)                  # z-axis: (cx, cz) are (x, y)
    merge(part, bm, mat)

def add_blob(part, cx, cy, cz, r, mat, rng, sub=2, squash=1.0):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        k = 1 + rng.uniform(-0.18, 0.18)
        x, y, z = v.co * k
        v.co = P(cx + x, cy + z * squash, cz + y)
    merge(part, bm, mat)

def merge(part, bm, mat):
    m = bpy.data.meshes.new('tmp'); bm.to_mesh(m); bm.free()
    for p in m.polygons: p.material_index = SLOTS.index(mat)
    part.bm.from_mesh(m); bpy.data.meshes.remove(m)

def finish(part, name):
    bm = part.bm
    uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    cards = {SLOTS.index(k) for k in ('leafcard', 'needlecard', 'impconifer', 'impbroadleaf', 'frondcard', 'padcard')}
    for f in bm.faces:                       # box projection in metres (prop frame), so tiles are true to scale
        if f.material_index in cards: continue          # (foliage cards keep their own 0–1 UVs)
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            x, y, z = l.vert.co             # Blender coords: x, -z_prop, y_prop
            l[uv].uv = (x, z) if ax == 1 else (x, y) if ax == 2 else (-y, z)
        f.smooth = True
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.set_sharp_from_angle(angle=math.radians(40))
    ob = bpy.data.objects.new(name, me)
    for s in SLOTS:
        mat = bpy.data.materials.get(s) or bpy.data.materials.new(s)
        me.materials.append(mat)
    bpy.context.scene.collection.objects.link(ob)
    # drop unused material slots so each variant only carries the primitives it needs
    idx = [p.material_index for p in me.polygons]
    used = sorted(set(idx)); remap = {old: i for i, old in enumerate(used)}
    mats = [me.materials[i] for i in used]
    me.materials.clear()                       # (this resets the polygons' indices, so set them after)
    for m in mats: me.materials.append(m)
    me.polygons.foreach_set('material_index', [remap[i] for i in idx])
    return ob

# ------------------------------------------------------------------ the furniture
def legs4(p, len_, dep, top, inset=0.05, s=0.045, mat='metal', round_=False):
    for lx, lz in [(inset, inset), (len_ - inset - s, inset), (inset, dep - inset - s), (len_ - inset - s, dep - inset - s)]:
        if round_: add_cyl(p, lx + s / 2, lz + s / 2, 0, top, s / 2, mat, 12)
        else: add_box(p, lx, 0, lz, lx + s, top, lz + s, mat, 0.004)

def bed(p, L, D, H, r):
    add_box(p, 0.04, 0.08, 0.04, L - 0.06, 0.3, D - 0.04, 'wood', 0.012)                     # base
    for lx in (0.08, L - 0.2):
        for lz in (0.08, D - 0.2): add_box(p, lx, 0, lz, lx + 0.12, 0.09, lz + 0.12, 'wood', 0.006)
    add_cushion(p, 0.06, 0.3, 0.06, L - 0.08, H - 0.02, D - 0.06, 'fabric', 0.12, 0.25)       # mattress
    # duvet over the foot two-thirds, falling over the foot and both sides, turned back at the top
    add_drape(p, 0.06, L * 0.64, 0.06, D - 0.06, H + 0.0, 0.24, 'tint', 0.04, sides=(1, 1, 1, 0), rng=r)
    add_cushion(p, L * 0.6, H - 0.02, 0.02, L * 0.72, H + 0.07, D - 0.02, 'tint', 0.3, 0.5, 8)  # the fold
    for z0, z1 in ((0.12, D / 2 - 0.03), (D / 2 + 0.03, D - 0.12)):
        add_cushion(p, L - 0.62, H - 0.03, z0, L - 0.14, H + 0.12, z1, 'fabric', 0.45, 0.55)    # pillows
    add_box(p, L - 0.06, 0, 0, L, 1.05, D, 'wood', 0.015, 3)                                  # headboard at the wall end
    add_cushion(p, L - 0.11, 0.48, 0.05, L - 0.05, 1.0, D - 0.05, 'tint', 0.25, 0.35, 8)      # upholstered panel

def sofa(p, L, D, H, r):
    for lx in (0.06, L - 0.1):
        for lz in (0.08, D - 0.12): add_cyl(p, lx + 0.02, lz + 0.02, 0, 0.08, 0.022, 'metal', 10)
    add_box(p, 0, 0.08, 0.04, L, 0.3, D, 'tint', 0.03, 3)                                     # frame
    add_cushion(p, 0, 0.08, D - 0.2, L, H, D, 'tint', 0.1, 0.3)                                # back
    for x0, x1 in ((0, 0.18), (L - 0.18, L)): add_cushion(p, x0, 0.08, 0.04, x1, 0.64, D, 'tint', 0.18, 0.45)   # arms
    n = 3 if L > 1.6 else 2; w = (L - 0.36) / n
    for i in range(n):
        x0 = 0.18 + i * w
        add_cushion(p, x0 + 0.004, 0.29, 0.03, x0 + w - 0.004, 0.46, D - 0.19, 'tint', 0.3, 0.45)          # seat cushions
        add_cushion(p, x0 + 0.01, 0.44, D - 0.38, x0 + w - 0.01, H - 0.02, D - 0.17, 'tint', 0.35, 0.5)    # back cushions

def table(p, L, D, H, r):
    top = 0.035 if H < 0.6 else 0.04
    add_box(p, 0, H - top, 0, L, H, D, 'wood', 0.008, 3)
    if H < 0.6:   # coffee table: chunky legs and a shelf
        legs4(p, L, D, H - top, 0.04, 0.06, 'wood')
        add_box(p, 0.06, 0.1, 0.06, L - 0.06, 0.125, D - 0.06, 'wood', 0.005)
    else:
        add_box(p, 0.05, H - top - 0.08, 0.05, L - 0.05, H - top, D - 0.05, 'metal', 0.004)      # apron
        legs4(p, L, D, H - top - 0.02, 0.07, 0.045, 'metal', True)

def desk(p, L, D, H, r):
    add_box(p, 0, H - 0.03, 0, L, H, D, 'laminate', 0.006, 3)
    for x0 in (0.02, L - 0.06): add_box(p, x0, 0, 0.05, x0 + 0.04, H - 0.03, D - 0.05, 'metal', 0.004)
    add_box(p, 0.06, H - 0.4, D - 0.04, L - 0.06, H - 0.04, D - 0.02, 'metal', 0.003)          # modesty panel
    add_box(p, L - 0.5, 0.05, 0.1, L - 0.08, H - 0.05, D - 0.08, 'paint', 0.006)              # drawer pedestal
    for k in range(3): add_box(p, L - 0.36, 0.12 + k * 0.2, 0.08, L - 0.22, 0.14 + k * 0.2, 0.1, 'metal', 0.004)
    cx = L * 0.5; mz = D * 0.65
    add_box(p, cx - 0.1, H, mz - 0.08, cx + 0.1, H + 0.012, mz + 0.06, 'plastic', 0.004)        # monitor foot
    add_box(p, cx - 0.02, H, mz, cx + 0.02, H + 0.12, mz + 0.03, 'plastic', 0.004)
    add_box(p, cx - 0.3, H + 0.1, mz - 0.02, cx + 0.3, H + 0.45, mz + 0.01, 'plastic', 0.006)
    add_box(p, cx - 0.285, H + 0.115, mz - 0.024, cx + 0.285, H + 0.435, mz - 0.02, 'screen', 0)
    add_box(p, cx - 0.22, H, D * 0.18, cx + 0.22, H + 0.018, D * 0.18 + 0.15, 'plastic', 0.004)  # keyboard

def chair(p, L, D, H, r):
    cx, cz = L / 2, D / 2
    add_cyl(p, cx, cz, 0.06, 0.4, 0.025, 'metal', 12)
    for k in range(5):
        a = k * 2 * math.pi / 5
        ex, ez = cx + math.sin(a) * 0.24, cz + math.cos(a) * 0.24
        add_box(p, min(cx, ex) - 0.015, 0.03, min(cz, ez) - 0.015, max(cx, ex) + 0.015, 0.06, max(cz, ez) + 0.015, 'plastic', 0.005)
        add_cyl(p, ex, ez, 0, 0.03, 0.022, 'rubber', 10)
    add_box(p, 0.04, 0.4, 0.04, L - 0.04, 0.48, D - 0.08, 'tint', 0.03, 3)
    add_box(p, 0.06, 0.52, D - 0.1, L - 0.06, H, D - 0.03, 'tint', 0.03, 3)
    add_box(p, cx - 0.03, 0.42, D - 0.1, cx + 0.03, 0.56, D - 0.06, 'metal', 0.005)

def cabinet(p, L, D, H, r, kind='cabinet'):
    add_box(p, 0, 0.04, 0.0, L, H, D, 'paint' if kind != 'fridge' else 'paint', 0.006)
    add_box(p, 0.02, 0, 0.03, L - 0.02, 0.04, D - 0.02, 'plastic', 0.003)                     # kick plate
    if kind == 'fridge':
        split = H * 0.62
        for y0, y1 in ((0.05, split - 0.01), (split + 0.01, H - 0.01)):
            add_box(p, 0.01, y0, -0.03, L - 0.01, y1, 0.0, 'paint', 0.012, 3)
        add_box(p, L - 0.09, split - 0.45, -0.07, L - 0.06, split - 0.08, -0.03, 'metal', 0.006)
        add_box(p, L - 0.09, split + 0.08, -0.07, L - 0.06, split + 0.4, -0.03, 'metal', 0.006)
        return
    if kind == 'locker':
        n = 2; w = L / n
        for i in range(n):
            add_box(p, i * w + 0.006, 0.06, -0.015, (i + 1) * w - 0.006, H - 0.02, 0.0, 'paint', 0.004)
            for k in range(6): add_box(p, i * w + 0.08, H - 0.25 - k * 0.025, -0.02, (i + 1) * w - 0.08, H - 0.24 - k * 0.025, -0.012, 'plastic', 0)   # vents
            add_box(p, (i + 1) * w - 0.07, H * 0.48, -0.035, (i + 1) * w - 0.05, H * 0.56, -0.015, 'metal', 0.004)
        return
    drawers = H < 1.5 and L <= 1.05            # a filing cabinet
    if drawers:
        n = 4; hh = (H - 0.06) / n
        for k in range(n):
            y0 = 0.05 + k * hh
            add_box(p, 0.008, y0 + 0.005, -0.015, L - 0.008, y0 + hh - 0.005, 0.0, 'paint', 0.004)
            add_box(p, L / 2 - 0.08, y0 + hh * 0.6, -0.035, L / 2 + 0.08, y0 + hh * 0.6 + 0.02, -0.015, 'metal', 0.004)
        return
    n = max(1, round(L / 0.5)); w = L / n
    for i in range(n):
        add_box(p, i * w + 0.005, 0.05, -0.015, (i + 1) * w - 0.005, H - 0.01, 0.0, 'paint', 0.004)
        hx = (i + 1) * w - 0.06 if i % 2 == 0 else i * w + 0.04
        add_box(p, hx, H * 0.45, -0.035, hx + 0.02, H * 0.45 + 0.16, -0.015, 'metal', 0.004)

def counter(p, L, D, H, r):
    reception = H > 1.02; shop = 0.97 < H <= 1.02
    add_box(p, 0, 0.08, 0.03, L, H - 0.035, D, 'wood' if (reception or shop) else 'paint', 0.006)
    add_box(p, 0.02, 0, 0.06, L - 0.02, 0.08, D - 0.02, 'plastic', 0.003)
    add_box(p, -0.015, H - 0.035, -0.02, L + 0.015, H, D, 'stone' if not shop else 'laminate', 0.006, 3)
    if reception:
        add_box(p, -0.01, 0.1, -0.03, L + 0.01, H - 0.06, 0.0, 'tint', 0.01)                    # front panel
        add_box(p, L * 0.3, H, D * 0.5, L * 0.3 + 0.5, H + 0.32, D * 0.5 + 0.03, 'plastic', 0.005)
        add_box(p, L * 0.3 + 0.02, H + 0.02, D * 0.5 - 0.005, L * 0.3 + 0.48, H + 0.3, D * 0.5, 'screen', 0)
        return
    if shop:
        add_box(p, L * 0.65, H, D * 0.3, L * 0.65 + 0.32, H + 0.12, D * 0.3 + 0.3, 'plastic', 0.01)   # register
        add_box(p, L * 0.65 + 0.03, H + 0.12, D * 0.3 + 0.18, L * 0.65 + 0.29, H + 0.32, D * 0.3 + 0.21, 'plastic', 0.005)
        add_box(p, L * 0.65 + 0.045, H + 0.135, D * 0.3 + 0.176, L * 0.65 + 0.275, H + 0.305, D * 0.3 + 0.18, 'screen', 0)
        return
    # kitchen: doors and drawers, a sink and a hob
    n = max(2, round(L / 0.6)); w = L / n
    for i in range(n):
        add_box(p, i * w + 0.004, 0.1, 0.012, (i + 1) * w - 0.004, H - 0.2, 0.03, 'tint', 0.004)
        add_box(p, i * w + 0.004, H - 0.19, 0.012, (i + 1) * w - 0.004, H - 0.045, 0.03, 'tint', 0.004)
        add_box(p, i * w + w / 2 - 0.08, H - 0.13, -0.005, i * w + w / 2 + 0.08, H - 0.115, 0.012, 'metal', 0.003)
    sx = L * 0.25
    add_box(p, sx - 0.25, H - 0.002, D * 0.2, sx + 0.25, H + 0.003, D * 0.2 + 0.4, 'metal', 0.004)   # sink rim
    add_box(p, sx - 0.21, H - 0.16, D * 0.2 + 0.04, sx + 0.21, H - 0.0, D * 0.2 + 0.36, 'metal', 0.01)
    add_cyl(p, sx, D * 0.2 + 0.47, H, H + 0.3, 0.015, 'metal', 10)
    add_box(p, sx - 0.015, H + 0.27, D * 0.2 + 0.25, sx + 0.015, H + 0.3, D * 0.2 + 0.48, 'metal', 0.006)
    if L > 2:
        hx = L * 0.72
        add_box(p, hx - 0.3, H, D * 0.12, hx + 0.3, H + 0.008, D * 0.12 + 0.52, 'glass', 0.003)
        for ox, oz in ((-0.14, 0.13), (0.14, 0.13), (-0.14, 0.38), (0.14, 0.38)):
            add_cyl(p, hx + ox, D * 0.12 + oz, H + 0.006, H + 0.01, 0.09, 'plastic', 24)

def shelf(p, L, D, H, r, kind='shelf'):
    gondola = kind == 'shelf' and D > 0.8
    rack = kind == 'rack'
    post = 'paint' if rack else 'metal'
    for ux in (0, L - 0.06):
        for uz in (0, D - 0.06): add_box(p, ux, 0, uz, ux + 0.06, H, uz + 0.06, post, 0.004)
    if rack:   # pallet racking: braces between the front and back posts
        for ux in (0.0, L - 0.06):
            for k in range(int(H / 0.5)):
                y = 0.2 + k * 0.5
                add_box(p, ux + 0.02, y, 0.06, ux + 0.04, y + 0.03, D - 0.06, 'metal', 0.003)
    levels = 3 if rack else 5 if not gondola else 4
    for i in range(levels):
        y = 0.12 + i * (H - 0.22) / (levels - 1)
        if rack:
            for uz in (0.0, D - 0.06): add_box(p, 0, y, uz, L, y + 0.08, uz + 0.06, 'paint', 0.004)       # beams
            add_box(p, 0.06, y + 0.06, 0.06, L - 0.06, y + 0.08, D - 0.06, 'metal', 0.002)
        else:
            add_box(p, 0.02, y, 0.02, L - 0.02, y + 0.025, D - 0.02, 'metal', 0.004)
        if i == levels - 1: break
        gap = (H - 0.22) / (levels - 1) - 0.06
        x = 0.08
        while x < L - 0.2:     # goods: boxes, tins, bottles — the same arrangement for every copy of this variant
            gw = r.uniform(0.12, 0.42 if rack else 0.3); gh = min(r.uniform(0.1, 0.4 if rack else 0.3), gap)
            gd = D * r.uniform(0.55, 0.9)
            if r.random() < 0.82 and x + gw < L - 0.08:
                if not rack and r.random() < 0.35:
                    for k in range(max(1, int(gw / 0.08))): add_cyl(p, x + 0.04 + k * 0.08, D / 2, y + 0.025, y + 0.025 + gh, 0.032, 'plastic' if r.random() < 0.5 else 'tint', 12)
                else:
                    add_box(p, x, y + 0.025, (D - gd) / 2, x + gw, y + 0.025 + gh, (D + gd) / 2, 'cardboard' if (rack or r.random() < 0.5) else 'tint', 0.006)
            x += gw + r.uniform(0.02, 0.1)
    if not rack and not gondola: add_box(p, 0.02, 0.05, D - 0.03, L - 0.02, H - 0.02, D - 0.015, 'metal', 0.002)   # back panel

def bench(p, L, D, H, r):
    if H < 0.6:   # a seat
        for x0 in (0.12, L - 0.18):
            add_box(p, x0, 0, 0.06, x0 + 0.06, H - 0.05, D - 0.06, 'metal', 0.005)
        for k in range(4):
            z0 = 0.02 + k * (D - 0.04) / 4
            add_box(p, 0, H - 0.05, z0 + 0.006, L, H, z0 + (D - 0.04) / 4 - 0.006, 'wood', 0.008, 3)
        return
    # a workbench: thick top, a lower shelf, a vice, a pegboard of tools on the back
    add_box(p, 0, H - 0.05, 0, L, H, D, 'wood', 0.008, 3)
    legs4(p, L, D, H - 0.05, 0.04, 0.07, 'paint')
    add_box(p, 0.06, 0.15, 0.06, L - 0.06, 0.18, D - 0.06, 'wood', 0.005)
    add_box(p, 0.15, H, 0.0, 0.33, H + 0.12, 0.2, 'paint', 0.01)
    add_box(p, 0.19, H + 0.12, 0.0, 0.29, H + 0.16, 0.24, 'metal', 0.006)
    add_box(p, 0.05, H, D - 0.04, L - 0.05, H + 0.7, D - 0.02, 'paint', 0.004)
    for k in range(int(L / 0.25)):
        x = 0.15 + k * 0.25
        if r.random() < 0.6: add_box(p, x, H + 0.25 + r.uniform(0, 0.2), D - 0.07, x + 0.03, H + 0.5 + r.uniform(0, 0.15), D - 0.04, 'metal' if r.random() < 0.5 else 'tint', 0.004)

def planter(p, L, D, H, r):
    add_box(p, 0, 0, 0, L, 0.5, D, 'concrete', 0.015, 3)
    add_box(p, 0.05, 0.42, 0.05, L - 0.05, 0.47, D - 0.05, 'soil', 0.004)
    add_cyl(p, L / 2, D / 2, 0.45, H * 0.55, 0.025, 'wood', 8)
    for k in range(26):    # a clipped shrub: clustered leaf masses
        a = r.uniform(0, 2 * math.pi); rr = r.uniform(0, min(L, D) * 0.32)
        add_blob(p, L / 2 + math.cos(a) * rr, r.uniform(0.6, H - 0.12), D / 2 + math.sin(a) * rr, r.uniform(0.09, 0.16), 'leaf', r, 1)

def crate(p, L, D, H, r):
    add_box(p, 0.04, 0.05, 0.04, L - 0.04, H - 0.05, D - 0.04, 'tint', 0.01)
    for y0, y1 in ((0, 0.08), (H - 0.08, H)):                      # frame rails
        add_box(p, 0, y0, 0, L, y1, D, 'paint', 0.008, 2)
    for x, z in ((0, 0), (L - 0.07, 0), (0, D - 0.07), (L - 0.07, D - 0.07)):
        add_box(p, x, 0, z, x + 0.07, H, z + 0.07, 'paint', 0.008, 2)
    for k in range(1, int(L / 0.25)):                               # ribs on the faces
        x = k * L / int(L / 0.25)
        add_box(p, x - 0.015, 0.08, 0.025, x + 0.015, H - 0.08, 0.04, 'tint', 0.004)
        add_box(p, x - 0.015, 0.08, D - 0.04, x + 0.015, H - 0.08, D - 0.025, 'tint', 0.004)
    add_box(p, L * 0.3, H * 0.55, 0.02, L * 0.7, H * 0.75, 0.026, 'plastic', 0.002)  # label plate

def machine(p, L, D, H, r):
    if L < 1.0:    # a washing machine
        add_box(p, 0, 0.02, 0, L, H, D, 'paint', 0.02, 3)
        add_box(p, 0.03, H - 0.16, -0.008, L - 0.03, H - 0.03, 0.0, 'plastic', 0.004)
        add_box(p, 0.08, H - 0.12, -0.012, 0.3, H - 0.06, -0.008, 'screen', 0)
        add_cyl(p, L * 0.7, H - 0.095, -0.03, 0.0, 0.03, 'metal', 16, axis='z')
        add_cyl(p, L / 2, H * 0.45, -0.03, 0.0, 0.25, 'plastic', 32, axis='z')
        add_cyl(p, L / 2, H * 0.45, -0.035, -0.02, 0.19, 'glass', 32, axis='z')
        return
    big = H >= 1.9
    add_box(p, 0, 0, 0, L, 0.18, D, 'paint', 0.01)                                      # plinth
    add_box(p, 0.05, 0.18, 0.1, L - 0.05, H * 0.82, D - 0.05, 'tint', 0.012, 3)           # body
    add_box(p, 0.08, H * 0.25, 0.06, L * 0.62, H * 0.75, 0.1, 'glass', 0.006)              # machining window
    add_box(p, 0.06, H * 0.23, 0.05, L * 0.64, H * 0.25, 0.1, 'paint', 0.004)
    add_box(p, L * 0.68, H * 0.45, 0.02, L - 0.08, H * 0.78, 0.1, 'plastic', 0.01)        # control pendant
    add_box(p, L * 0.7, H * 0.6, 0.015, L - 0.1, H * 0.75, 0.02, 'screen', 0)
    for k in range(6): add_cyl(p, L * 0.71 + (k % 3) * 0.06, H * 0.5 + (k // 3) * 0.05, 0.0, 0.03, 0.015, 'plastic', 10, axis='z')
    add_box(p, L * 0.15, H * 0.82, D * 0.3, L * 0.5, H, D * 0.8, 'paint', 0.01)          # spindle head
    if big:
        add_cyl(p, D * 0.5, H * 0.92, 0, L, 0.08, 'metal', 16, axis='x')                   # duct across the top
    add_box(p, L - 0.05, 0.4, D * 0.3, L, 0.8, D * 0.7, 'metal', 0.01)                    # side panel


def add_loft(part, secs, mat, n=28, cap=True, axis='x'):
    """A smooth hull through cross-sections (t, cy, ry, c, r, e): superellipses of exponent
    e (2 = ellipse, higher = squarer) centred at height cy and at c across, radii ry (up)
    and r (across). axis 'x': t runs along x and c, r are in z; axis 'z': the other way."""
    bm = bmesh.new(); rings = []
    for (t, cy, ry, cz, rz, e) in secs:
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n; u, v = math.cos(a), math.sin(a)
            y = cy + ry * math.copysign(abs(v) ** (2 / e), v); w = cz + rz * math.copysign(abs(u) ** (2 / e), u)
            ring.append(bm.verts.new(P(t, y, w) if axis == 'x' else P(w, y, t)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(n): bm.faces.new([r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]])
    if cap:
        for ring, rev in ((rings[0], True), (rings[-1], False)):
            c = bm.verts.new(sum((v.co for v in ring), mathutils.Vector()) / n)
            for k in range(n): bm.faces.new([ring[k], ring[(k + 1) % n], c][::-1] if rev else [ring[k], ring[(k + 1) % n], c])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    merge(part, bm, mat)

def speeder(p, L, D, H, r):
    """A single-seat repulsor bike. Prop frame: x = rear (0) → nose (L), z = across, y = up.
    Rides with its belly ~0.3 m off the ground; the seat top is at ~0.86 m."""
    zc = D / 2
    def S(t): return t * L
    # main hull: tail cone, fat middle under the seat, long tapered nose
    hull = [(S(0.02), 0.62, 0.10, zc, 0.12, 3), (S(0.08), 0.60, 0.17, zc, 0.22, 3), (S(0.22), 0.58, 0.21, zc, 0.30, 3.2), (S(0.40), 0.57, 0.22, zc, 0.30, 3.2),
            (S(0.56), 0.58, 0.21, zc, 0.27, 3), (S(0.70), 0.60, 0.17, zc, 0.21, 2.8), (S(0.84), 0.62, 0.12, zc, 0.14, 2.5), (S(0.96), 0.64, 0.06, zc, 0.07, 2.2), (S(1.0), 0.645, 0.02, zc, 0.02, 2)]
    add_loft(p, hull, 'tint', 32)
    # dark belly pan and the repulsor pads under it (they glow)
    add_loft(p, [(S(0.10), 0.40, 0.04, zc, 0.20, 4), (S(0.25), 0.37, 0.05, zc, 0.27, 4), (S(0.60), 0.38, 0.05, zc, 0.24, 4), (S(0.78), 0.42, 0.04, zc, 0.15, 4)], 'paint', 24)
    for x in (S(0.22), S(0.62)):
        add_cyl(p, x, zc, 0.30, 0.33, 0.13, 'metal', 24)
        add_cyl(p, x, zc, 0.29, 0.30, 0.10, 'glow', 24)
    # twin forward thruster booms with intake rings
    for s_ in (-1, 1):
        z = zc + s_ * 0.30
        add_cyl(p, 0.52, z, S(0.50), S(0.98), 0.07, 'paint', 20, axis='x', r2=0.055)
        add_cyl(p, 0.52, z, S(0.97), S(1.0), 0.062, 'metal', 20, axis='x')
        add_cyl(p, 0.52, z, S(0.50), S(0.53), 0.078, 'metal', 20, axis='x')
        add_box(p, S(0.52), 0.50, min(z, zc) + (0.0 if s_ > 0 else 0.06), S(0.62), 0.56, max(z, zc) - (0.06 if s_ > 0 else 0.0), 'paint', 0.01)   # strut to the hull
        add_box(p, S(0.36), 0.36, z - 0.06, S(0.48), 0.40, z + 0.06, 'rubber', 0.01)    # footrests
    # rear engine: nozzle ring and its glow
    add_cyl(p, 0.62, zc, -0.02, S(0.06), 0.15, 'metal', 28, axis='x', r2=0.12)
    add_cyl(p, 0.62, zc, -0.03, -0.01, 0.11, 'glow', 28, axis='x')
    # saddle
    add_cushion(p, S(0.20), 0.76, zc - 0.17, S(0.47), 0.87, zc + 0.17, 'rubber', puff=0.18, round_=0.5, cuts=8)
    # instrument cowl, windscreen and headlight
    add_loft(p, [(S(0.55), 0.74, 0.04, zc, 0.15, 3), (S(0.63), 0.80, 0.07, zc, 0.17, 3), (S(0.72), 0.78, 0.05, zc, 0.13, 3), (S(0.78), 0.72, 0.02, zc, 0.08, 2.5)], 'paint', 24)
    bm = bmesh.new()
    vs = [bm.verts.new(P(*v)) for v in [(S(0.62), 0.84, zc - 0.15), (S(0.62), 0.84, zc + 0.15), (S(0.56), 1.02, zc + 0.12), (S(0.56), 1.02, zc - 0.12)]]
    bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.006); merge(p, bm, 'glass')
    add_box(p, S(0.58), 0.82, zc - 0.07, S(0.62), 0.86, zc + 0.07, 'screen', 0.004)
    add_cyl(p, 0.66, zc, S(0.95), S(0.975), 0.035, 'glow', 16, axis='x')
    # handlebars: stem, bar, grips
    add_cyl(p, S(0.55), zc, 0.78, 0.94, 0.02, 'metal', 12)
    add_cyl(p, S(0.55), 0.95, zc - 0.32, zc + 0.32, 0.016, 'metal', 12, axis='z')
    for s_ in (-1, 1): add_cyl(p, S(0.55), 0.95, zc + s_ * 0.34 - 0.05, zc + s_ * 0.34 + 0.05, 0.022, 'rubber', 12, axis='z')
    # fins at the tail
    for s_ in (-1, 1):
        bm = bmesh.new()
        vs = [bm.verts.new(P(*v)) for v in [(S(0.05), 0.66, zc + s_ * 0.10), (S(0.20), 0.70, zc + s_ * 0.18), (S(0.16), 0.86, zc + s_ * 0.24), (S(0.02), 0.84, zc + s_ * 0.20)]]
        bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.012); merge(p, bm, 'paint')

# ------------------------------------------------------------------ ships
# Built to the logical layout (assets/ships/<model>.json) the game reads: the interior
# walls, deck, ramp and furniture stand exactly where gameplay puts them; the hull is
# wrapped around that.
import json
def place_in(part, builder, L, D, H, pr, deck):
    """Build a furniture piece in its own frame and set it into the ship where the layout
    puts it (same frame rule as render/building-mesh.js buildProp)."""
    F = [(0, -1), (1, 0), (0, 1), (-1, 0)][pr['face']]
    ez = (-F[0], -F[1]); ex = (ez[1], -ez[0])
    corners = [(pr['x0'], pr['z0']), (pr['x1'], pr['z0']), (pr['x0'], pr['z1']), (pr['x1'], pr['z1'])]
    o = min(corners, key=lambda c: c[0] * (ex[0] + ez[0]) + c[1] * (ex[1] + ez[1]))
    tmp = Part(); builder(tmp, L, D, H, random.Random(pr['kind']))
    soft = pr['kind'] in ('bed', 'chair', 'sofa')
    for f in tmp.bm.faces:
        if f.material_index == SLOTS.index('tint'): f.material_index = SLOTS.index('fabric' if soft else 'paint')
    for v in tmp.bm.verts:
        bx, by, bz = v.co; x, y, z = bx, bz, -by                  # back to the prop frame
        v.co = P(o[0] + ex[0] * x + ez[0] * z, deck + y, o[1] + ex[1] * x + ez[1] * z)
    m = bpy.data.meshes.new('tmp'); tmp.bm.to_mesh(m); tmp.bm.free(); part.bm.from_mesh(m); bpy.data.meshes.remove(m)

def console(p, L, D, H, r):
    add_box(p, 0, 0, 0.1, L, H * 0.62, D, 'paint', 0.02, 3)                                    # body
    bm = bmesh.new()                                                                             # sloped instrument face
    vs = [bm.verts.new(P(*v)) for v in [(0, H * 0.62, 0.1), (L, H * 0.62, 0.1), (L, H, D * 0.75), (0, H, D * 0.75)]]
    bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.04); merge(p, bm, 'plastic')
    for k in range(3):                                                                           # three displays
        x0 = 0.25 + k * (L - 0.5) / 3; x1 = x0 + (L - 0.5) / 3 - 0.08
        bm = bmesh.new()
        vs = [bm.verts.new(P(*v)) for v in [(x0, H * 0.66, 0.16), (x1, H * 0.66, 0.16), (x1, H * 0.97, D * 0.7), (x0, H * 0.97, D * 0.7)]]
        bm.faces.new(vs); bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.022)); merge(p, bm, 'screen')
    add_box(p, L / 2 - 0.25, H * 0.62, -0.25, L / 2 + 0.25, H * 0.66, 0.12, 'plastic', 0.01)   # control yoke shelf
    add_cyl(p, L / 2, H * 0.66, -0.2, 0.0, 0.03, 'metal', 12, axis='z')
    add_box(p, L / 2 - 0.16, H * 0.72, -0.24, L / 2 + 0.16, H * 0.76, -0.2, 'rubber', 0.01)

def shuttle(p, L_, D_, H_, r, model='shuttle'):
    lay = json.load(open(os.path.join(ROOT, 'assets', 'ships', model + '.json')))
    hx0, hz0, hx1, hz1 = lay['hull']; deck = lay['deck']; ceil = lay['ceiling']; xc = (hx0 + hx1) / 2
    # ---- outer hull: open at the stern (the rear bulkhead with the ramp door closes it)
    secs = [(hz0, 2.92, 1.75, xc, 3.3, 2.8), (8.0, 2.95, 1.95, xc, 3.45, 2.7), (13.0, 2.95, 1.95, xc, 3.45, 2.7), (16.0, 2.9, 1.85, xc, 3.35, 2.8),
            (18.6, 2.85, 1.65, xc, 3.0, 2.9), (19.6, 2.7, 1.2, xc, 2.3, 2.6), (20.4, 2.5, 0.6, xc, 1.15, 2.3), (20.85, 2.4, 0.08, xc, 0.15, 2)]
    bm = bmesh.new(); n = 40; rings = []
    for (z, cy, ry, cx, rx, e) in secs:
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n; u, v = math.cos(a), math.sin(a)
            ring.append(bm.verts.new(P(cx + rx * math.copysign(abs(u) ** (2 / e), u), cy + ry * math.copysign(abs(v) ** (2 / e), v), z)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(n): bm.faces.new([r0[k], r1[k], r1[(k + 1) % n], r0[(k + 1) % n]])
    c = bm.verts.new(sum((v.co for v in rings[-1]), mathutils.Vector()) / n)
    for k in range(n): bm.faces.new([rings[-1][k], c, rings[-1][(k + 1) % n]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:                                        # open at the stern, so orient by hand: away from the hull's axis
        cm = f.calc_center_median(); centre = mathutils.Vector(P(xc, 2.9, 13.0))     # inside a convex hull, every face looks away from its middle
        if (cm - centre).dot(f.normal) < 0: f.normal_flip()
    merge(p, bm, 'tint')
    # rear bulkhead around the ramp door, flush with the hull's open end
    d0 = lay['doors'][0]; dx0, dx1 = d0['x'] - d0['width'] / 2, d0['x'] + d0['width'] / 2; dtop = deck + 2.15
    z0s, cy0, ry0, rx0, e0 = secs[0][0], secs[0][1], secs[0][2], secs[0][4], secs[0][5]
    for k in range(70):          # the bulkhead fills the hull's end section, in strips, leaving the door
        y0_, y1_ = cy0 - ry0 + k * 2 * ry0 / 70, cy0 - ry0 + (k + 1) * 2 * ry0 / 70; ym = (y0_ + y1_) / 2
        q = 1 - abs((ym - cy0) / ry0) ** e0
        if q <= 0: continue
        hw = rx0 * q ** (1 / e0)
        if deck < ym < dtop:
            add_box(p, xc - hw, y0_, hz0 - 0.1, dx0, y1_, hz0 + 0.05, 'tint', 0); add_box(p, dx1, y0_, hz0 - 0.1, xc + hw, y1_, hz0 + 0.05, 'tint', 0)
        else: add_box(p, xc - hw, y0_, hz0 - 0.1, xc + hw, y1_, hz0 + 0.05, 'tint', 0)
    for x in (dx0 - 0.08, dx1): add_box(p, x, deck, hz0 - 0.18, x + 0.08, dtop, hz0 - 0.05, 'metal', 0.01)   # door frame
    # ---- the hull surface, for placing things on it: section radii interpolated along z
    def sect(z):
        for (za, *A), (zb, *B) in zip(secs, secs[1:]):
            if za <= z <= zb:
                t = (z - za) / (zb - za); return [a + (b - a) * t for a, b in zip(A, B)]
        return list(secs[-1][1:]) if z > secs[-1][0] else list(secs[0][1:])
    def top_y(x, z):                     # hull top at (x, z)
        cy, ry, cx, rx, e = sect(z); q = 1 - min(1, abs((x - cx) / rx)) ** e
        return cy + ry * max(q, 0) ** (1 / e)
    def side_x(y, z, s_):                # hull side at height y
        cy, ry, cx, rx, e = sect(z); q = 1 - min(1, abs((y - cy) / ry)) ** e
        return cx + s_ * rx * max(q, 0) ** (1 / e)
    # cockpit canopy: a dark visor hump over the cockpit (its underside stays above the ceiling)
    add_loft(p, [(15.4, 4.62, 0.12, xc, 1.6, 2.6), (16.6, 4.72, 0.3, xc, 2.3, 2.6), (18.2, 4.62, 0.26, xc, 2.3, 2.6), (18.75, 4.45, 0.1, xc, 1.9, 2.4)], 'visor', 32, axis='z')
    for z in (16.1, 17.0, 17.9):          # canopy frame ribs
        add_box(p, xc - 2.0, top_y(xc, z) + 0.18, z - 0.04, xc + 2.0, top_y(xc, z) + 0.26, z + 0.04, 'metal', 0.01)
    # windscreen seen from outside: a framed dark band on the nose, built facing out only (so from inside it culls away)
    bm = bmesh.new(); rows = []
    for z in (18.62, 19.0, 19.4):
        cy, ry, cx, rx, e = sect(z); row = []
        for k in range(15):
            a = math.radians(32 + 116 * k / 14); u, v = math.cos(a), math.sin(a)
            row.append(bm.verts.new(P(cx + 1.012 * rx * math.copysign(abs(u) ** (2 / e), u), cy + 1.012 * ry * math.copysign(abs(v) ** (2 / e), v), z)))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(14): bm.faces.new([r0[k], r0[k + 1], r1[k + 1], r1[k]])
    for f in bm.faces:
        cm = f.calc_center_median()
        if (cm - mathutils.Vector(P(xc, 2.9, 13.0))).dot(f.normal) < 0: f.normal_flip()
    merge(p, bm, 'visor')
    # heat-shield belly, dorsal spine, tail fins with hazard tips
    add_loft(p, [(hz0 + 0.05, 1.5, 0.32, xc, 2.6, 2.4), (8.0, 1.36, 0.36, xc, 3.0, 2.4), (15.0, 1.38, 0.36, xc, 2.9, 2.4), (18.8, 1.6, 0.3, xc, 2.2, 2.4), (20.2, 2.05, 0.15, xc, 0.9, 2)], 'heatshield', 32, axis='z')
    add_box(p, xc - 0.5, top_y(xc, 10) - 0.1, hz0 + 0.4, xc + 0.5, top_y(xc, 10) + 0.28, 15.0, 'metal', 0.04, 3)
    for z in range(int(hz0) + 1, 15):     # spine ribs
        add_box(p, xc - 0.56, top_y(xc, 10) + 0.05, z, xc + 0.56, top_y(xc, 10) + 0.3, z + 0.12, 'paint', 0.01)
    for s_ in (-1, 1):
        bm = bmesh.new()
        q = [(xc + s_ * 1.2, 4.55, hz0 + 0.3), (xc + s_ * 1.0, 4.65, hz0 + 3.4), (xc + s_ * 1.9, 6.1, hz0 + 1.5), (xc + s_ * 2.05, 6.15, hz0 + 0.4)]
        bm.faces.new([bm.verts.new(P(*v)) for v in q]); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.12); merge(p, bm, 'tint')
        add_box(p, xc + s_ * 1.9 - 0.12, 5.85, hz0 + 0.35, xc + s_ * 2.05 + 0.08, 6.18, hz0 + 1.45, 'hazard', 0.01)
        add_cyl(p, xc + s_ * 1.98, 6.25, hz0 + 0.8, hz0 + 0.95, 0.06, 'navwhite', 10, axis='z')
    # greebles: plates, boxes and vents scattered over the upper hull, off the spine and the canopy
    for k in range(70):
        z = r.uniform(hz0 + 0.6, 15.0); x = xc + r.choice([-1, 1]) * r.uniform(0.9, 2.6)
        y = top_y(x, z); w, d_, h_ = r.uniform(0.2, 0.9), r.uniform(0.2, 1.4), r.uniform(0.04, 0.22)
        add_box(p, x - w / 2, y - 0.25, z, x + w / 2, y + h_ - 0.05, z + d_, r.choice(['metal', 'paint', 'tint', 'plastic']), 0.012)
    for s_ in (-1, 1):                     # side vents (slatted grilles) and access hatches
        for z0 in (7.0, 11.2):
            x = side_x(3.4, z0 + 0.6, s_)
            for j in range(8): add_box(p, x - 0.08 if s_ > 0 else x - 0.02, 3.0 + j * 0.1, z0, x + 0.02 if s_ > 0 else x + 0.08, 3.05 + j * 0.1, z0 + 1.2, 'metal', 0.004)
        x = side_x(2.6, 14.0, s_)
        add_box(p, x - 0.04, 2.1, 13.4, x + 0.04, 3.2, 14.6, 'tint', 0.02)
        add_box(p, x - 0.07, 2.55, 14.35, x + 0.07, 2.75, 14.5, 'hazard', 0.005)
        for z in (hz0 + 0.5, 18.2):        # RCS thruster blocks at the shoulders: four nozzles each
            y0_ = 3.9; x = side_x(y0_, z, s_)
            add_box(p, x - 0.3, y0_ - 0.25, z - 0.3, x + 0.3, y0_ + 0.25, z + 0.3, 'metal', 0.04, 3)
            for (dy, dz) in ((0.12, 0.12), (-0.12, 0.12), (0.12, -0.12), (-0.12, -0.12)):
                add_cyl(p, x + s_ * 0.3, y0_ + dy, z + dz - 0.06, z + dz + 0.06, 0.05, 'rubber', 10, axis='x') if False else add_box(p, x + s_ * 0.27 - 0.04, y0_ + dy - 0.05, z + dz - 0.05, x + s_ * 0.27 + 0.04, y0_ + dy + 0.05, z + dz + 0.05, 'rubber', 0.005)
    # antenna mast and a small dish on the spine
    add_cyl(p, xc - 0.25, 13.5, top_y(xc, 13.5) + 0.25, top_y(xc, 13.5) + 1.6, 0.025, 'metal', 8)
    add_cyl(p, xc + 0.3, 7.5, top_y(xc, 7.5) + 0.25, top_y(xc, 7.5) + 0.55, 0.06, 'metal', 10)
    add_cyl(p, xc + 0.3, 7.5, top_y(xc, 7.5) + 0.55, top_y(xc, 7.5) + 0.62, 0.35, 'paint', 20, r2=0.42)
    # wings, nav lights, engine pods with proper bells
    for s_ in (-1, 1):
        root = xc + s_ * 3.0; tip = xc + s_ * 5.0
        bm = bmesh.new()
        pts = [(root, 2.35, 6.0), (root, 2.35, 13.5), (tip, 2.55, 9.0), (tip, 2.55, 6.4)]
        top = [bm.verts.new(P(x, y + 0.12, z)) for (x, y, z) in pts]; bot = [bm.verts.new(P(x, y - 0.12, z)) for (x, y, z) in pts]
        bm.faces.new(top); bm.faces.new(bot[::-1])
        for k in range(4): bm.faces.new([top[k], bot[k], bot[(k + 1) % 4], top[(k + 1) % 4]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, 'tint')
        add_box(p, tip - 0.06 if s_ > 0 else tip - 0.02, 2.4, 6.5, tip + 0.02 if s_ > 0 else tip + 0.06, 2.72, 8.9, 'hazard', 0.005)
        add_cyl(p, tip, 2.55, 8.95, 9.15, 0.07, 'navgreen' if s_ > 0 else 'navred', 10, axis='z')
        ex_ = xc + s_ * 4.2
        add_loft(p, [(4.6, 2.5, 0.66, ex_, 0.66, 2), (5.2, 2.5, 0.8, ex_, 0.8, 2), (8.0, 2.5, 0.8, ex_, 0.8, 2), (9.4, 2.5, 0.55, ex_, 0.55, 2), (10.0, 2.5, 0.2, ex_, 0.2, 2)], 'tint', 28, axis='z')
        for z in (5.6, 6.6, 7.6): add_cyl(p, ex_, 2.5, z, z + 0.08, 0.81, 'metal', 28, axis='z')       # pod bands
        add_cyl(p, ex_, 2.5, 9.7, 10.05, 0.32, 'metal', 20, axis='z', r2=0.24)                           # intake lip
        add_cyl(p, ex_, 2.5, 3.7, 4.6, 0.68, 'metal', 28, axis='z', r2=0.5)                               # nozzle bell, flaring aft
        add_cyl(p, ex_, 2.5, 3.85, 4.5, 0.6, 'rubber', 28, axis='z', r2=0.43)                             # sooty throat
        add_cyl(p, ex_, 2.5, 4.35, 4.45, 0.42, 'glow', 28, axis='z')                                     # the burn, deep inside
    # landing gear: struts with pistons, braces, pads
    for gx in (xc - 2.1, xc + 2.1):
        for gz in (6.6, 16.2):
            add_cyl(p, gx, gz, 0.6, 1.5, 0.11, 'paint', 12)                  # upper strut
            add_cyl(p, gx, gz, 0.1, 0.8, 0.065, 'metal', 12)                 # piston
            add_box(p, gx - 0.04, 0.55, gz - 0.12, gx + 0.04, 0.68, gz + 0.12, 'hazard', 0.005)
            add_cyl(p, gx, gz, 0.0, 0.12, 0.38, 'rubber', 20)
            add_cyl(p, gx, gz, 0.1, 0.16, 0.3, 'metal', 20)
            bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.04, radius2=0.04, depth=1.0)
            for v in bm.verts:               # diagonal brace from the pad up into the hull
                x0, y0, z0 = v.co; t = z0 + 0.5
                v.co = P(gx + x0, 0.3 + t * 1.1 + y0 * 0.0, gz + (0.6 if gz < 10 else -0.6) * t + y0)
            merge(p, bm, 'metal')
            add_box(p, gx - 0.3, 1.25, gz - 0.3, gx + 0.3, 1.5, gz + 0.3, 'metal', 0.02)
    # hazard frame round the ramp door
    for x in (dx0 - 0.2, dx1 + 0.08): add_box(p, x, deck, hz0 - 0.16, x + 0.12, dtop, hz0 - 0.1, 'hazard', 0.005)
    ship_interior(p, lay)

def ship_interior(p, lay):
    """Deck, walls, partitions with hatches, windscreen, lights and furniture: exactly the layout."""
    hx0, hz0, hx1, hz1 = lay['hull']; deck = lay['deck']; ceil = lay['ceiling']; xc = (hx0 + hx1) / 2
    d0 = lay['doors'][0]; dx0, dx1 = d0['x'] - d0['width'] / 2, d0['x'] + d0['width'] / 2; dtop = deck + d0.get('height', 2.15)
    T = 0.1
    add_box(p, hx0, deck - 0.2, hz0, hx1, deck, hz1, 'metal', 0.01)                               # deck plate
    add_box(p, hx0, ceil, hz0, hx1, ceil + 0.12, hz1, 'paint', 0.01)                              # ceiling
    for z in range(int(hz0) + 1, int(hz1), 2): add_box(p, xc - 0.6, ceil - 0.025, z, xc + 0.6, ceil, z + 0.12, 'glow', 0)   # light strips
    add_box(p, hx0, deck, hz0, hx0 + T, ceil, hz1, 'paint', 0.01); add_box(p, hx1 - T, deck, hz0, hx1, ceil, hz1, 'paint', 0.01)   # side walls
    wy0, wy1, wx0, wx1 = deck + 1.05, deck + 2.35, max(hx0 + 0.45, xc - 3.2), min(hx1 - 0.45, xc + 3.2)                         # forward bulkhead around the windscreen:
    add_box(p, hx0, deck, hz1 - T, hx1, wy0, hz1, 'paint', 0.01); add_box(p, hx0, wy1, hz1 - T, hx1, ceil, hz1, 'paint', 0.01)
    add_box(p, hx0, wy0, hz1 - T, wx0, wy1, hz1, 'paint', 0.01); add_box(p, wx1, wy0, hz1 - T, hx1, wy1, hz1, 'paint', 0.01)
    for (x0_, x1_, y0_, y1_) in ((wx0 - 0.06, wx1 + 0.06, wy0 - 0.06, wy0), (wx0 - 0.06, wx1 + 0.06, wy1, wy1 + 0.06), (wx0 - 0.06, wx0, wy0, wy1), (wx1, wx1 + 0.06, wy0, wy1), (xc - 0.03, xc + 0.03, wy0, wy1)):
        add_box(p, x0_, y0_, hz1 - T - 0.03, x1_, y1_, hz1 + 0.02, 'metal', 0.005)                  # frame and centre mullion
    # (the hull and canopy beyond are seen from inside, so they cull away: the windscreen looks out)
    add_box(p, hx0, deck, hz0, dx0, ceil, hz0 + T, 'paint', 0.01); add_box(p, dx1, deck, hz0, hx1, ceil, hz0 + T, 'paint', 0.01)
    add_box(p, dx0, dtop, hz0, dx1, ceil, hz0 + T, 'paint', 0.01)
    for part_ in lay['partitions']:
        dd = lay['doors'][part_['door']]; a0, a1 = dd['x'] - dd['width'] / 2, dd['x'] + dd['width'] / 2; z = part_['z']
        add_box(p, hx0, deck, z - T / 2, a0, ceil, z + T / 2, 'paint', 0.01); add_box(p, a1, deck, z - T / 2, hx1, ceil, z + T / 2, 'paint', 0.01)
        add_box(p, a0, deck + 2.1, z - T / 2, a1, ceil, z + T / 2, 'paint', 0.01)
        for x in (a0 - 0.05, a1): add_box(p, x, deck, z - 0.08, x + 0.05, deck + 2.1, z + 0.08, 'metal', 0.005)
    for x0 in (hx0 + T, hx1 - T - 0.04):                                                           # wall ribs
        for z in range(int(hz0) + 1, int(hz1)):
            add_box(p, x0, deck, z, x0 + 0.04, ceil, z + 0.08, 'metal', 0.004)
    B = {'bed': bed, 'counter': counter, 'locker': lambda q, L, D, H, r: cabinet(q, L, D, H, r, 'locker'), 'crate': crate, 'table': table, 'machine': machine,
         'bench': bench, 'sofa': sofa, 'armchair': armchair, 'tvstand': tvstand, 'planter': planter, 'fridge': lambda q, L, D, H, r: cabinet(q, L, D, H, r, 'fridge'),
         'desk': desk, 'cabinet': cabinet,
         'rack': lambda q, L, D, H, r: shelf(q, L, D, H, r, 'rack'), 'chair': chair, 'console': console}
    for pr in lay['props']:                  # each piece built to its own footprint in the layout
        across = pr['face'] in (0, 2)
        L, D = (pr['x1'] - pr['x0'], pr['z1'] - pr['z0']) if across else (pr['z1'] - pr['z0'], pr['x1'] - pr['x0'])
        place_in(p, B[pr['kind']], L, D, pr['h'], pr, deck)


def hull_loft(p, secs, mat, centre, n=48):
    """The outer hull through sections (z, cy, ry, cx, rx, e), open at the stern, capped at the nose,
    every face turned away from `centre` (prop frame)."""
    bm = bmesh.new(); rings = []
    for (z, cy, ry, cx, rx, e) in secs:
        rings.append([bm.verts.new(P(cx + rx * math.copysign(abs(math.cos(a)) ** (2 / e), math.cos(a)), cy + ry * math.copysign(abs(math.sin(a)) ** (2 / e), math.sin(a)), z))
                      for a in (2 * math.pi * k / n for k in range(n))])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(n): bm.faces.new([r0[k], r1[k], r1[(k + 1) % n], r0[(k + 1) % n]])
    c = bm.verts.new(sum((v.co for v in rings[-1]), mathutils.Vector()) / n)
    for k in range(n): bm.faces.new([rings[-1][k], c, rings[-1][(k + 1) % n]])
    cv = mathutils.Vector(P(*centre))
    for f in bm.faces:
        f.normal_update()     # (a new face's normal isn't computed yet: without this the flip below does nothing)
        f.normal_update()
        if (f.calc_center_median() - cv).dot(f.normal) < 0: f.normal_flip()
    merge(p, bm, mat)

def freighter(p, L_, D_, H_, r, model='freighter'):
    lay = json.load(open(os.path.join(ROOT, 'assets', 'ships', model + '.json')))
    hx0, hz0, hx1, hz1 = lay['hull']; deck = lay['deck']; ceil = lay['ceiling']; xc = (hx0 + hx1) / 2
    secs = [(hz0, 4.3, 2.7, xc, 5.75, 4.5), (12.0, 4.35, 2.8, xc, 5.9, 4.5), (24.0, 4.35, 2.8, xc, 5.9, 4.5), (29.0, 4.35, 2.75, xc, 5.85, 4.4),
            (30.4, 4.3, 2.65, xc, 5.7, 4.2), (31.8, 4.0, 2.0, xc, 4.4, 3.4), (33.0, 3.6, 1.1, xc, 2.4, 2.8), (33.7, 3.4, 0.1, xc, 0.2, 2)]
    hull_loft(p, secs, 'tint', (xc, 4.3, 18.0))
    def sect(z):
        for (za, *A), (zb, *B) in zip(secs, secs[1:]):
            if za <= z <= zb: t = (z - za) / (zb - za); return [a + (b - a) * t for a, b in zip(A, B)]
        return list(secs[-1][1:])
    def top_y(x, z):
        cy, ry, cx, rx, e = sect(z); q = 1 - min(1, abs((x - cx) / rx)) ** e; return cy + ry * max(q, 0) ** (1 / e)
    # stern bulkhead in strips round the tall cargo door
    d0 = lay['doors'][0]; dx0, dx1 = d0['x'] - d0['width'] / 2, d0['x'] + d0['width'] / 2; dtop = deck + d0.get('height', 2.15)
    cy0, ry0, rx0, e0 = secs[0][1], secs[0][2], secs[0][4], secs[0][5]
    for k in range(80):
        y0_, y1_ = cy0 - ry0 + k * 2 * ry0 / 80, cy0 - ry0 + (k + 1) * 2 * ry0 / 80; ym = (y0_ + y1_) / 2
        q = 1 - abs((ym - cy0) / ry0) ** e0
        if q <= 0: continue
        hw = rx0 * q ** (1 / e0)
        if deck < ym < dtop:
            add_box(p, xc - hw, y0_, hz0 - 0.1, dx0, y1_, hz0 + 0.05, 'tint', 0); add_box(p, dx1, y0_, hz0 - 0.1, xc + hw, y1_, hz0 + 0.05, 'tint', 0)
        else: add_box(p, xc - hw, y0_, hz0 - 0.1, xc + hw, y1_, hz0 + 0.05, 'tint', 0)
    for x in (dx0 - 0.3, dx1 + 0.1): add_box(p, x, deck, hz0 - 0.18, x + 0.2, dtop, hz0 - 0.1, 'hazard', 0.005)
    add_box(p, dx0 - 0.3, dtop, hz0 - 0.18, dx1 + 0.3, dtop + 0.2, hz0 - 0.1, 'hazard', 0.005)
    for x in (dx0 - 0.6, dx1 + 0.45): add_box(p, x, dtop + 0.3, hz0 - 0.3, x + 0.15, dtop + 0.45, hz0 - 0.1, 'navwhite', 0.005)   # floodlights over the door
    # windscreen band on the nose (outward faces only) and a framed visor hump over the flight deck
    bm = bmesh.new(); rows = []
    for z in (30.5, 31.0, 31.6):
        cy, ry, cx, rx, e = sect(z); rows.append([bm.verts.new(P(cx + 1.012 * rx * math.copysign(abs(math.cos(a)) ** (2 / e), math.cos(a)), cy + 1.012 * ry * math.copysign(abs(math.sin(a)) ** (2 / e), math.sin(a)), z))
                                                for a in (math.radians(30 + 120 * k / 16) for k in range(17))])
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(16): bm.faces.new([r0[k], r0[k + 1], r1[k + 1], r1[k]])
    for f in bm.faces:
        f.normal_update()     # (a new face's normal isn't computed yet: without this the flip below does nothing)
        if (f.calc_center_median() - mathutils.Vector(P(xc, 4.3, 18.0))).dot(f.normal) < 0: f.normal_flip()
    merge(p, bm, 'visor')
    add_loft(p, [(26.6, top_y(xc, 27) - 0.1, 0.15, xc, 2.4, 2.6), (27.8, top_y(xc, 28) + 0.1, 0.35, xc, 2.9, 2.6), (29.6, top_y(xc, 29.6), 0.3, xc, 2.8, 2.6), (30.3, top_y(xc, 30.3) - 0.15, 0.1, xc, 2.2, 2.4)], 'visor', 32, axis='z')
    # heat-shield belly
    add_loft(p, [(hz0 + 0.05, 1.75, 0.25, xc, 4.8, 3.5), (12.0, 1.62, 0.3, xc, 5.3, 3.5), (29.0, 1.65, 0.3, xc, 5.2, 3.5), (32.5, 2.4, 0.2, xc, 2.6, 2.5)], 'heatshield', 32, axis='z')
    # container pods along both flanks, with hazard ends and lights
    for s_ in (-1, 1):
        xo = xc + s_ * 5.9
        for (z0, z1) in ((8.0, 14.6), (15.0, 21.6)):
            add_box(p, min(xo, xo + s_ * 1.3), 2.0, z0, max(xo, xo + s_ * 1.3), 4.9, z1, 'tint', 0.05, 3)
            for z in (z0 + 0.6, (z0 + z1) / 2, z1 - 0.6): add_box(p, min(xo, xo + s_ * 1.38), 1.95, z - 0.08, max(xo, xo + s_ * 1.38), 4.95, z + 0.08, 'metal', 0.01)   # straps
            add_box(p, min(xo, xo + s_ * 1.32), 2.0, z0 - 0.05, max(xo, xo + s_ * 1.32), 4.9, z0 + 0.05, 'hazard', 0.005)
        add_cyl(p, xo + s_ * 1.32, 4.8, 21.6, 21.8, 0.08, 'navgreen' if s_ > 0 else 'navred', 10, axis='z')
    # dorsal radiators and a sensor mast
    for x in (xc - 2.2, xc + 2.2):
        add_box(p, x - 0.04, top_y(x, 14) - 0.1, 10.0, x + 0.04, top_y(x, 14) + 1.4, 19.0, 'metal', 0.01)
        for z in range(10, 19): add_box(p, x - 0.08, top_y(x, 14), z, x + 0.08, top_y(x, 14) + 1.4, z + 0.06, 'paint', 0.005)
    add_cyl(p, xc, 24.5, top_y(xc, 24.5) - 0.2, top_y(xc, 24.5) + 2.4, 0.05, 'metal', 8)
    add_cyl(p, xc, 24.5, top_y(xc, 24.5) + 2.4, top_y(xc, 24.5) + 2.5, 0.12, 'navwhite', 10)
    for k in range(110):                     # greebles on the upper hull
        z = r.uniform(hz0 + 0.6, 26.0); x = xc + r.choice([-1, 1]) * r.uniform(0.5, 4.6)
        if 9.5 < z < 19.5 and abs(abs(x - xc) - 2.2) < 0.5: continue
        y = top_y(x, z); w, d_, h_ = r.uniform(0.3, 1.2), r.uniform(0.3, 1.8), r.uniform(0.05, 0.3)
        add_box(p, x - w / 2, y - 0.3, z, x + w / 2, y + h_ - 0.05, z + d_, r.choice(['metal', 'paint', 'tint', 'plastic']), 0.015)
    # four main engines at the stern corners: pods, bells, burn
    for (ex_, ey) in ((xc - 4.4, 3.0), (xc + 4.4, 3.0), (xc - 3.6, 5.7), (xc + 3.6, 5.7)):
        add_cyl(p, ex_, ey, hz0 - 0.2, hz0 + 3.0, 0.85, 'tint', 28, axis='z')
        add_cyl(p, ex_, ey, hz0 - 1.4, hz0 - 0.2, 0.95, 'metal', 28, axis='z', r2=0.7)
        add_cyl(p, ex_, ey, hz0 - 1.35, hz0 - 0.25, 0.86, 'rubber', 28, axis='z', r2=0.62)
        add_cyl(p, ex_, ey, hz0 - 0.4, hz0 - 0.3, 0.6, 'glow', 28, axis='z')
        for z in (hz0 + 0.5, hz0 + 1.6): add_cyl(p, ex_, ey, z, z + 0.1, 0.87, 'metal', 28, axis='z')
    # six landing legs
    for gx in (xc - 4.0, xc + 4.0):
        for gz in (8.5, 18.0, 27.0):
            add_cyl(p, gx, gz, 0.8, 2.0, 0.16, 'paint', 12); add_cyl(p, gx, gz, 0.12, 1.0, 0.1, 'metal', 12)
            add_box(p, gx - 0.06, 0.7, gz - 0.18, gx + 0.06, 0.88, gz + 0.18, 'hazard', 0.005)
            add_cyl(p, gx, gz, 0.0, 0.14, 0.55, 'rubber', 20); add_cyl(p, gx, gz, 0.12, 0.2, 0.42, 'metal', 20)
            add_box(p, gx - 0.4, 1.7, gz - 0.4, gx + 0.4, 2.0, gz + 0.4, 'metal', 0.03)
    ship_interior(p, lay)

def styled_ship(p, L_, D_, H_, r, model):
    """A hull wrapped round a layout (assets/ships/<model>.json), dressed by its style:
    courier — compact and fast, twin nacelles; patrol — the courier armoured, light bar, chin guns;
    yacht — long and sleek, swept fins, a glowing waist line."""
    fp = os.path.join(ROOT, 'assets', 'ships', model + '.json')
    lay = json.load(open(fp)) if os.path.exists(fp) else SHIPCAT[model]; st = lay['style']; look = lay.get('look', {})
    hx0, hz0, hx1, hz1 = lay['hull']; deck = lay['deck']; ceil = lay['ceiling']; xc = (hx0 + hx1) / 2; D = lay['D']
    bulk = look.get('bulk', 1.0)
    hw = ((hx1 - hx0) / 2 + 0.55) * bulk; cy = (deck - 0.25 + ceil + 0.2) / 2; hh = ((ceil + 0.2 - (deck - 0.25)) / 2 + 0.35) * (0.5 + 0.5 * bulk)
    nose = D - 0.2; noseLen = nose - hz1
    e = 3.4 if st == 'patrol' else 2.7 if st == 'courier' else 2.4
    if st == 'generated': e = {'pointed': 2.5, 'blunt': 3.6, 'hammer': 4.2, 'chisel': 3.0}[look['nose']]
    tip = {'pointed': (0.06, 0.1), 'blunt': (hh * 0.35, hw * 0.4), 'hammer': (hh * 0.25, hw * 0.95), 'chisel': (0.08, hw * 0.55)}.get(look.get('nose'), (0.06, 0.1))
    secs = [(hz0, cy, hh * 0.95, xc, hw * 0.95, e), (hz0 + 1.2, cy, hh, xc, hw, e), (hz1 - 0.6, cy, hh, xc, hw, e),
            (hz1 + noseLen * 0.35, cy - 0.1, hh * 0.85, xc, hw * (0.95 if look.get('nose') == 'hammer' else 0.8), e), (hz1 + noseLen * 0.7, cy - 0.25, hh * 0.5 + tip[0] * 0.5, xc, hw * 0.45 + tip[1] * 0.5, max(2, e - 0.6)), (nose, cy - 0.35, tip[0], xc, tip[1], 2)]
    hull_loft(p, secs, 'tint', (xc, cy, (hz0 + hz1) / 2))
    def sect(z):
        for (za, *A), (zb, *B) in zip(secs, secs[1:]):
            if za <= z <= zb: t = (z - za) / (zb - za); return [a + (b - a) * t for a, b in zip(A, B)]
        return list(secs[-1][1:])
    def top_y(x, z):
        c_, ry, cx, rx, ee = sect(z); q = 1 - min(1, abs((x - cx) / rx)) ** ee; return c_ + ry * max(q, 0) ** (1 / ee)
    # stern bulkhead in strips round the ramp door
    d0 = lay['doors'][0]; dx0, dx1 = d0['x'] - d0['width'] / 2, d0['x'] + d0['width'] / 2; dtop = deck + d0.get('height', 2.15)
    c0, ry0, _, rx0, e0 = secs[0][1:]
    for k in range(60):
        y0_, y1_ = c0 - ry0 + k * 2 * ry0 / 60, c0 - ry0 + (k + 1) * 2 * ry0 / 60; ym = (y0_ + y1_) / 2
        q = 1 - abs((ym - c0) / ry0) ** e0
        if q <= 0: continue
        w_ = rx0 * q ** (1 / e0)
        if deck < ym < dtop: add_box(p, xc - w_, y0_, hz0 - 0.1, dx0, y1_, hz0 + 0.05, 'tint', 0); add_box(p, dx1, y0_, hz0 - 0.1, xc + w_, y1_, hz0 + 0.05, 'tint', 0)
        else: add_box(p, xc - w_, y0_, hz0 - 0.1, xc + w_, y1_, hz0 + 0.05, 'tint', 0)
    for x in (dx0 - 0.16, dx1 + 0.06): add_box(p, x, deck, hz0 - 0.16, x + 0.1, dtop, hz0 - 0.1, 'hazard' if st != 'yacht' else 'metal', 0.005)
    # windscreen: a dark band on the nose in front of the cockpit (outward faces only), and a visor over it
    bm = bmesh.new(); rows = []
    for z in (hz1 + 0.05, hz1 + noseLen * 0.22, hz1 + noseLen * 0.42):
        c_, ry, cx, rx, ee = sect(z); rows.append([bm.verts.new(P(cx + 1.012 * rx * math.copysign(abs(math.cos(a)) ** (2 / ee), math.cos(a)), c_ + 1.012 * ry * math.copysign(abs(math.sin(a)) ** (2 / ee), math.sin(a)), z))
                                                for a in (math.radians(25 + 130 * k / 16) for k in range(17))])
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(16): bm.faces.new([r0[k], r0[k + 1], r1[k + 1], r1[k]])
    for f in bm.faces:
        f.normal_update()     # (a new face's normal isn't computed yet: without this the flip below does nothing)
        if (f.calc_center_median() - mathutils.Vector(P(xc, cy, (hz0 + hz1) / 2))).dot(f.normal) < 0: f.normal_flip()
    merge(p, bm, 'visor')
    # belly
    add_loft(p, [(hz0 + 0.05, cy - hh * 0.85, 0.18, xc, hw * 0.75, 3), (hz1, cy - hh * 0.9, 0.2, xc, hw * 0.8, 3), (hz1 + noseLen * 0.6, cy - hh * 0.55, 0.12, xc, hw * 0.4, 2.5)], 'heatshield', 28, axis='z')
    gear = [(xc - hw * 0.6, hz0 + 1.2), (xc + hw * 0.6, hz0 + 1.2), (xc - hw * 0.5, hz1 - 0.6), (xc + hw * 0.5, hz1 - 0.6)]
    ty = cy + hh * 0.9
    if st in ('courier', 'patrol'):
        for s_ in (-1, 1):                            # twin nacelles on short pylons
            nx = xc + s_ * (hw + 0.55); ny = cy + 0.1
            add_loft(p, [(hz0 - 0.4, ny, 0.42, nx, 0.42, 2), (hz0 + 0.4, ny, 0.55, nx, 0.55, 2), (hz0 + 3.6, ny, 0.55, nx, 0.55, 2), (hz0 + 4.6, ny, 0.3, nx, 0.3, 2), (hz0 + 5.0, ny, 0.08, nx, 0.08, 2)], 'tint', 24, axis='z')
            add_cyl(p, nx, ny, hz0 - 0.9, hz0 - 0.35, 0.5, 'metal', 24, axis='z', r2=0.4); add_cyl(p, nx, ny, hz0 - 0.6, hz0 - 0.55, 0.38, 'glow', 24, axis='z')
            add_box(p, min(nx, xc + s_ * hw * 0.8), ny - 0.08, hz0 + 0.8, max(nx, xc + s_ * hw * 0.8), ny + 0.08, hz0 + 3.0, 'paint', 0.02)
            add_cyl(p, nx, ny + 0.56, hz0 + 4.4, hz0 + 4.55, 0.05, 'navgreen' if s_ > 0 else 'navred', 8, axis='z')
            bm = bmesh.new(); q = [(nx, ny + 0.4, hz0 - 0.2), (nx, ny + 0.4, hz0 + 1.6), (nx + s_ * 0.1, ny + 1.4, hz0 - 0.1), (nx + s_ * 0.1, ny + 1.45, hz0 - 0.6)]
            bm.faces.new([bm.verts.new(P(*v)) for v in q]); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.08); merge(p, bm, 'tint')
    if st == 'patrol':
        add_box(p, xc - 0.7, ty - 0.05, hz1 - 2.2, xc + 0.7, ty + 0.18, hz1 - 1.9, 'metal', 0.02)
        add_box(p, xc - 0.65, ty + 0.18, hz1 - 2.18, xc - 0.02, ty + 0.3, hz1 - 1.92, 'navred', 0.01); add_box(p, xc + 0.02, ty + 0.18, hz1 - 2.18, xc + 0.65, ty + 0.3, hz1 - 1.92, 'glow', 0.01)
        for s_ in (-1, 1):
            gx = xc + s_ * hw * 0.45; gy = cy - hh * 0.85
            add_box(p, gx - 0.15, gy - 0.25, hz1 - 0.5, gx + 0.15, gy, hz1 + 0.6, 'metal', 0.03)
            add_cyl(p, gx, gy - 0.12, hz1 + 0.6, hz1 + 1.6, 0.05, 'metal', 10, axis='z')
        for z in range(int(hz0) + 1, int(hz1) - 1): add_box(p, xc - hw * 0.98, cy - 0.05, z, xc - hw * 0.9, cy + 0.6, z + 0.6, 'metal', 0.02); add_box(p, xc + hw * 0.9, cy - 0.05, z, xc + hw * 0.98, cy + 0.6, z + 0.6, 'metal', 0.02)
    if st == 'yacht':
        for s_ in (-1, 1):                            # swept fins, a long glowing waist line, a fat engine at the tail
            bm = bmesh.new(); q = [(xc + s_ * hw * 0.8, cy, hz0 + 0.5), (xc + s_ * hw * 0.8, cy, hz0 + 7.0), (xc + s_ * (hw + 2.6), cy - 0.4, hz0 + 1.0), (xc + s_ * (hw + 2.8), cy - 0.4, hz0 - 0.4)]
            top = [bm.verts.new(P(x, y + 0.07, z)) for (x, y, z) in q]; bot = [bm.verts.new(P(x, y - 0.07, z)) for (x, y, z) in q]
            bm.faces.new(top); bm.faces.new(bot[::-1])
            for k in range(4): bm.faces.new([top[k], bot[k], bot[(k + 1) % 4], top[(k + 1) % 4]])
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, 'tint')
            add_box(p, xc + s_ * hw * 0.999 - 0.02, cy - 0.05, hz0 + 0.5, xc + s_ * hw * 0.999 + 0.02, cy + 0.02, hz1 + noseLen * 0.3, 'glow', 0.005)
            add_cyl(p, xc + s_ * (hw + 2.75), cy - 0.4, hz0 - 0.3, hz0 - 0.1, 0.06, 'navgreen' if s_ > 0 else 'navred', 8, axis='z')
        bm = bmesh.new(); q = [(xc, ty - 0.1, hz0 + 0.3), (xc, ty - 0.1, hz0 + 5.0), (xc, ty + 1.6, hz0 + 0.2), (xc, ty + 1.7, hz0 - 0.6)]
        bm.faces.new([bm.verts.new(P(*v)) for v in q]); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.12); merge(p, bm, 'tint')
        add_cyl(p, xc, cy, hz0 - 1.0, hz0 - 0.1, hw * 0.75, 'metal', 32, axis='z', r2=hw * 0.62)
        add_cyl(p, xc, cy, hz0 - 0.7, hz0 - 0.6, hw * 0.55, 'glow', 32, axis='z')
    if st == 'generated': dress_generated(p, look, xc, cy, hh, hw, hz0, hz1, noseLen, top_y, r)
    for k in range(int((40 if st != 'yacht' else 12) * look.get('greeble', 1.0))):        # greebles (few on the yacht: it's smooth)
        z = r.uniform(hz0 + 0.4, hz1 - 0.6); x = xc + r.choice([-1, 1]) * r.uniform(0.3, hw * 0.75)
        y = top_y(x, z); w_, d_, h_ = r.uniform(0.15, 0.6), r.uniform(0.2, 1.0), r.uniform(0.04, 0.15)
        add_box(p, x - w_ / 2, y - 0.2, z, x + w_ / 2, y + h_ - 0.05, z + d_, r.choice(['metal', 'paint', 'tint']), 0.01)
    for (gx, gz) in gear:
        add_cyl(p, gx, gz, 0.3, cy - hh * 0.6, 0.08, 'paint', 10); add_cyl(p, gx, gz, 0.05, 0.45, 0.05, 'metal', 10)
        add_cyl(p, gx, gz, 0.0, 0.08, 0.28, 'rubber', 16)
    ship_interior(p, lay)

def dress_generated(p, look, xc, cy, hh, hw, hz0, hz1, noseLen, top_y, r):
    """Engines, fins, wings and markings for a designed ship (tools/gen-ships.mjs 'look')."""
    def nacelle(nx, ny, rad, z0, z1):
        add_loft(p, [(z0 - 0.3, ny, rad * 0.8, nx, rad * 0.8, 2), (z0 + 0.4, ny, rad, nx, rad, 2), (z1 - 0.6, ny, rad, nx, rad, 2), (z1, ny, rad * 0.35, nx, rad * 0.35, 2)], 'tint', 24, axis='z')
        add_cyl(p, nx, ny, z0 - 0.9, z0 - 0.25, rad * 0.95, 'metal', 24, axis='z', r2=rad * 0.75); add_cyl(p, nx, ny, z0 - 0.6, z0 - 0.5, rad * 0.7, 'glow', 24, axis='z')
        for z in (z0 + 0.6, z0 + 1.3): add_cyl(p, nx, ny, z, z + 0.08, rad * 1.02, 'metal', 24, axis='z')
    L_ = hz1 - hz0; E = look['engines']
    if E == 'twin':
        for s_ in (-1, 1): nacelle(xc + s_ * (hw + 0.5), cy, 0.55, hz0, hz0 + L_ * 0.45); add_box(p, min(xc + s_ * hw * 0.8, xc + s_ * (hw + 0.5)), cy - 0.08, hz0 + 0.6, max(xc + s_ * hw * 0.8, xc + s_ * (hw + 0.5)), cy + 0.08, hz0 + L_ * 0.3, 'paint', 0.02)
    elif E == 'quad':
        for s_ in (-1, 1):
            for dy in (-0.55, 0.55): nacelle(xc + s_ * (hw + 0.35), cy + dy, 0.38, hz0, hz0 + L_ * 0.35)
            add_box(p, min(xc + s_ * hw * 0.8, xc + s_ * (hw + 0.35)), cy - 0.6, hz0 + 0.4, max(xc + s_ * hw * 0.8, xc + s_ * (hw + 0.35)), cy + 0.6, hz0 + 0.9, 'paint', 0.02)
    elif E == 'single':
        add_cyl(p, xc, cy, hz0 - 1.3, hz0 - 0.1, hw * 0.7, 'metal', 32, axis='z', r2=hw * 0.55); add_cyl(p, xc, cy, hz0 - 1.0, hz0 - 0.9, hw * 0.5, 'glow', 32, axis='z')
        for a in range(6): ang = a * math.pi / 3; add_box(p, xc + math.cos(ang) * hw * 0.6 - 0.06, cy + math.sin(ang) * hh * 0.6 - 0.06, hz0 - 1.2, xc + math.cos(ang) * hw * 0.6 + 0.06, cy + math.sin(ang) * hh * 0.6 + 0.06, hz0, 'metal', 0.01)
    elif E == 'pods':
        for s_ in (-1, 1):
            px, py = xc + s_ * (hw * 0.75), top_y(xc + s_ * hw * 0.5, hz0 + L_ * 0.3) + 0.6
            nacelle(px, py, 0.5, hz0 + 0.3, hz0 + L_ * 0.4)
            add_box(p, px - 0.08, py - 0.9, hz0 + 1.2, px + 0.08, py - 0.3, hz0 + 2.4, 'paint', 0.02)
    elif E == 'ring':
        for a in range(8):
            ang = a * math.pi / 4; nx, ny = xc + math.cos(ang) * (hw + 0.2), cy + math.sin(ang) * (hh + 0.2)
            add_cyl(p, nx, ny, hz0 - 0.6, hz0 + 0.8, 0.28, 'metal', 14, axis='z'); add_cyl(p, nx, ny, hz0 - 0.7, hz0 - 0.6, 0.2, 'glow', 14, axis='z')
    F = look['fins']; ty = cy + hh * 0.9
    def fin(x, y0, z0, h, sweep, lean=0.0, mat='tint'):
        bm = bmesh.new(); q = [(x, y0, z0), (x, y0, z0 + 2.4), (x + lean, y0 + h, z0 + 2.4 - sweep), (x + lean, y0 + h, z0 - sweep * 0.3)]
        bm.faces.new([bm.verts.new(P(*v)) for v in q]); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.1); merge(p, bm, mat)
    if F == 'twin':
        for s_ in (-1, 1): fin(xc + s_ * hw * 0.45, ty - 0.1, hz0 + 0.2, 1.4, 1.2, s_ * 0.35)
    elif F == 'single': fin(xc, ty - 0.1, hz0 + 0.1, 1.8, 1.6)
    elif F == 'swept':
        for s_ in (-1, 1): fin(xc + s_ * hw * 0.85, cy, hz0 + 0.2, 0.15, 2.0, s_ * 2.0)
    elif F == 'ventral': fin(xc, cy - hh * 0.9, hz0 + 0.3, -1.2, 1.0)
    Wg = look['wings']
    if Wg != 'none':
        span = {'stub': 1.4, 'delta': 3.4, 'forward': 2.6, 'gull': 2.6}[Wg]
        for s_ in (-1, 1):
            root = xc + s_ * hw * 0.9; tip = root + s_ * span; y0 = cy - hh * 0.2; ty_ = y0 + (0.9 if Wg == 'gull' else 0.15)
            if Wg == 'forward': pts = [(root, y0, hz0 + L_ * 0.15), (root, y0, hz0 + L_ * 0.55), (tip, ty_, hz0 + L_ * 0.75), (tip, ty_, hz0 + L_ * 0.6)]
            elif Wg == 'delta': pts = [(root, y0, hz0 + 0.3), (root, y0, hz0 + L_ * 0.75), (tip, ty_, hz0 + 0.6), (tip, ty_, hz0 + 0.1)]
            else: pts = [(root, y0, hz0 + L_ * 0.25), (root, y0, hz0 + L_ * 0.6), (tip, ty_, hz0 + L_ * 0.5), (tip, ty_, hz0 + L_ * 0.3)]
            bm = bmesh.new(); top = [bm.verts.new(P(x, y + 0.1, z)) for (x, y, z) in pts]; bot = [bm.verts.new(P(x, y - 0.1, z)) for (x, y, z) in pts]
            bm.faces.new(top); bm.faces.new(bot[::-1])
            for k in range(4): bm.faces.new([top[k], bot[k], bot[(k + 1) % 4], top[(k + 1) % 4]])
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, 'tint')
            add_cyl(p, tip, ty_, pts[2][2] - 0.1, pts[2][2] + 0.1, 0.07, 'navgreen' if s_ > 0 else 'navred', 8, axis='z')
    S_ = look['stripe']
    if S_ == 'band': add_cyl(p, xc, cy, hz0 + L_ * 0.55, hz0 + L_ * 0.6, hw * 1.01, 'glow', 40, axis='z') if False else add_loft(p, [(hz0 + L_ * 0.55, cy, hh * 1.01, xc, hw * 1.01, 3.0), (hz0 + L_ * 0.6, cy, hh * 1.01, xc, hw * 1.01, 3.0)], 'hazard', 40, axis='z', cap=False)
    elif S_ == 'twin':
        for dx in (-0.45, 0.45): add_box(p, xc + dx - 0.12, top_y(xc + dx, hz0 + L_ * 0.5) - 0.04, hz0 + 0.3, xc + dx + 0.12, top_y(xc + dx, hz0 + L_ * 0.5) + 0.02, hz1 + noseLen * 0.3, 'navwhite', 0.005)
    elif S_ == 'chevron':
        for s_ in (-1, 1): add_box(p, xc + s_ * hw * 0.98 - 0.03, cy - 0.3, hz1 - 1.5, xc + s_ * hw * 0.98 + 0.03, cy + 0.3, hz1 - 0.3, 'hazard', 0.005)
SHIPCAT = json.load(open(os.path.join(ROOT, 'assets', 'ships', 'catalog.json')))
FIGHTERS = json.load(open(os.path.join(ROOT, 'assets', 'ships', 'fighters.json')))
SHIPCAT.update(FIGHTERS)
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ship_kit.py')).read())

def jet(p, L_, D_, H_, r, model):
    """A fighter: a slim fuselage with a bubble canopy over the cockpit (exactly where the
    layout puts it), intakes, wings, tails and nozzles by its 'jet' spec, missiles on pylons."""
    lay = SHIPCAT[model]; J = lay['jet']; W, D = lay['W'], lay['D']; xc = W / 2
    hx0, cz0, hx1, cz1 = lay['hull']; deck = lay['deck']; ceil = lay['ceiling']
    fy = deck + 0.55; fr = 1.05                                                # fuselage centreline height and radius
    wing_y = fy - 0.15
    if J['wing'] == 'flying':      # a flying wing: the whole thing is a blended lifting body
        fuse = [(0.3, fy, 0.25, xc, W * 0.18, 2.6), (D * 0.3, fy + 0.1, 0.55, xc, W * 0.48, 2.8), (D * 0.62, fy + 0.15, 0.7, xc, W * 0.32, 2.6), (D * 0.9, fy, 0.35, xc, W * 0.09, 2.2), (D, fy - 0.1, 0.04, xc, 0.08, 2)]
    else:
        fuse = [(0.0, fy, fr * 0.55, xc, fr * 0.7, 2.4), (D * 0.12, fy, fr * 0.85, xc, fr * 1.05, 2.6), (D * 0.5, fy, fr, xc, fr * 1.1, 2.8),
                (cz1, fy + 0.05, fr * 0.85, xc, fr * 0.85, 2.4), (D * 0.8, fy, fr * 0.56, xc, fr * 0.54, 2.3), (D * 0.9, fy - 0.05, fr * 0.3, xc, fr * 0.28, 2.1), (D, fy - 0.1, 0.015, xc, 0.015, 2)]
    BJ = Body(fuse, 7); add_loft(p, BJ.secs, 'tint', 56, axis='z')
    _plating(p, BJ, D * 0.1, D * 0.86, r, lambda z, ang: not (cz0 - 0.8 < z < cz1 + 1.2 and abs(ang - 90) < 60), 0.8)
    # the cockpit tub around the layout's cockpit, then the bubble canopy over it
    add_loft(p, [(cz0 - 0.3, deck + 0.6, 1.0, xc, 0.95, 2.6), (cz1, deck + 0.6, 1.0, xc, 0.95, 2.6)], 'tint', 40, axis='z', cap=False)
    _sloft(p, [(cz0 - 0.5, ceil - 0.25, 0.05, xc, 0.6, 2.2), (cz0 + 0.4, ceil - 0.05, 0.42, xc, 0.78, 2.2), (cz1 - 0.6, ceil - 0.05, 0.42, xc, 0.78, 2.2), (cz1 + 1.1, ceil - 0.6, 0.05, xc, 0.4, 2)], 'visor', 40, per=7)
    for zb in (cz0 + 0.9, cz1 - 0.9): add_loft(p, [(zb, ceil - 0.05, 0.47, xc, 0.83, 2.2), (zb + 0.07, ceil - 0.05, 0.47, xc, 0.83, 2.2)], 'tint', 40, axis='z', cap=False)     # canopy bows
    ne = J['engines']
    for k in range(ne):              # intakes beside the cockpit, engines and nozzles at the tail
        ex = xc + (0 if ne == 1 else (-0.75 if k == 0 else 0.75))
        if J['wing'] != 'flying':
            for s_ in ((-1, 1) if ne == 1 else ((-1,) if k == 0 else (1,))):
                ix = xc + s_ * (fr + 0.25)
                _sloft(p, [(cz0 - 3.4, fy - 0.1, 0.05, ix - s_ * 0.25, 0.05, 2), (cz0 - 2.0, fy - 0.15, 0.42, ix, 0.32, 3), (cz0 + 0.6, fy - 0.15, 0.45, ix, 0.35, 3)], 'tint', 28, cap=False)
                add_loft(p, [(cz0 + 0.3, fy - 0.15, 0.36, ix, 0.27, 3), (cz0 + 0.6, fy - 0.15, 0.4, ix, 0.3, 3)], 'rubber', 28, axis='z')         # the mouth of the intake, dark
        rr = 0.5 if ne == 2 else 0.64
        _shell(p, ex, fy, [(-0.1, rr * 0.92), (0.5, rr * 1.04), (1.3, rr * 1.0)], 'metal', n=36, per=4); _bell(p, ex, fy, -1.0, 0.0, rr * 0.92, 14)
    def plank(pts, mat='tint', t=0.12): _blade(p, pts[0], pts[1], pts[2], pts[3], t, mat)
    def finplate(pts, mat='tint'): _blade(p, pts[0], pts[1], pts[2], pts[3], 0.08, mat)
    half = W / 2
    for s_ in (-1, 1):
        root = xc + s_ * fr * 0.8; tip = xc + s_ * half
        if J['wing'] == 'delta': pts = [(root, wing_y, D * 0.62), (root, wing_y, D * 0.08), (tip, wing_y, D * 0.06), (tip, wing_y, D * 0.16)]
        elif J['wing'] == 'swept': pts = [(root, wing_y, D * 0.55), (root, wing_y, D * 0.25), (tip, wing_y - 0.1, D * 0.08), (tip, wing_y - 0.1, D * 0.2)]
        elif J['wing'] == 'forward': pts = [(root, wing_y, D * 0.32), (root, wing_y, D * 0.12), (tip, wing_y + 0.1, D * 0.42), (tip, wing_y + 0.1, D * 0.5)]
        elif J['wing'] == 'straight': pts = [(root, wing_y + 0.3, D * 0.55), (root, wing_y + 0.3, D * 0.4), (tip, wing_y + 0.3, D * 0.42), (tip, wing_y + 0.3, D * 0.54)]
        else: pts = None
        if pts:
            _wing(p, root, pts[0][1], pts[0][2], pts[1][2], tip, pts[3][1], pts[3][2], pts[2][2], 0.36, n=8)
            add_cyl(p, tip, pts[3][1], pts[3][2] - 0.2, pts[3][2] + 0.1, 0.06, 'navgreen' if s_ > 0 else 'navred', 8, axis='z')
        # missiles on pylons under the wings
        nm = lay['weapons']['missiles'] // 2
        for m in range(nm):
            mx = root + (tip - root) * (0.3 + 0.55 * (m + 0.5) / max(1, nm)); mz = D * (0.3 if J['wing'] != 'forward' else 0.28)
            if J['wing'] == 'flying': mx = xc + s_ * (1.4 + m * 1.1); mz = D * 0.45
            my = (pts[0][1] if pts else fy) - 0.45
            add_box(p, mx - 0.04, my + 0.12, mz - 0.4, mx + 0.04, my + 0.4, mz + 0.4, 'paint', 0.01)
            add_cyl(p, mx, my, mz - 1.4, mz + 1.4, 0.11, 'navwhite' if False else 'paint', 12, axis='z')
            add_cyl(p, mx, my, mz + 1.4, mz + 1.7, 0.11, 'metal', 12, axis='z', r2=0.01)
            for a in range(4): ang = a * math.pi / 2 + math.pi / 4; add_box(p, mx + math.cos(ang) * 0.12 - 0.01, my + math.sin(ang) * 0.12 - 0.01, mz - 1.4, mx + math.cos(ang) * 0.26 + 0.01, my + math.sin(ang) * 0.26 + 0.01, mz - 1.0, 'paint', 0.002)
        if J['tails'] == 'twin': finplate([(xc + s_ * 0.9, fy + 0.4, 0.2), (xc + s_ * 0.9, fy + 0.4, 3.2), (xc + s_ * 1.5, fy + 2.6, 1.0), (xc + s_ * 1.5, fy + 2.6, -0.2)])
        if J['tails'] in ('twin', 'single', 'boom'):
            plank([(xc + s_ * fr * 0.7, fy, 2.6), (xc + s_ * fr * 0.7, fy, 0.2), (xc + s_ * (fr + 2.4), fy - 0.05, -0.1), (xc + s_ * (fr + 2.4), fy - 0.05, 1.0)])
        if J['tails'] == 'canard': plank([(xc + s_ * fr * 0.7, fy + 0.2, D * 0.82), (xc + s_ * fr * 0.7, fy + 0.2, D * 0.72), (xc + s_ * (fr + 1.5), fy + 0.25, D * 0.7), (xc + s_ * (fr + 1.5), fy + 0.25, D * 0.76)])
        if J['tails'] == 'boom':
            bx = xc + s_ * half * 0.55
            add_loft(p, [(-0.2, wing_y + 0.3, 0.3, bx, 0.3, 2), (D * 0.48, wing_y + 0.3, 0.35, bx, 0.35, 2), (D * 0.56, wing_y + 0.3, 0.1, bx, 0.1, 2)], 'tint', 16, axis='z')
            finplate([(bx, wing_y + 0.5, 0.0), (bx, wing_y + 0.5, 2.2), (bx, wing_y + 2.3, 0.7), (bx, wing_y + 2.3, -0.3)])
    if J['tails'] in ('single', 'canard'): finplate([(xc, fy + 0.6, 0.3), (xc, fy + 0.6, 4.0), (xc, fy + 3.0, 1.2), (xc, fy + 3.0, 0.0)])
    if J['wing'] == 'flying':
        for s_ in (-1, 1): finplate([(xc + s_ * W * 0.36, fy + 0.4, D * 0.18), (xc + s_ * W * 0.36, fy + 0.4, D * 0.4), (xc + s_ * W * 0.4, fy + 1.4, D * 0.22), (xc + s_ * W * 0.4, fy + 1.4, D * 0.12)])
    # guns in the nose / wing roots
    for g in range(lay['weapons']['guns']):
        gx = xc + (g - (lay['weapons']['guns'] - 1) / 2) * 0.5
        add_cyl(p, gx, fy - 0.35, D * 0.78, D * 0.9, 0.05, 'metal', 8, axis='z')
    # landing gear (tricycle), panel lines, hazard by the ladder
    for (gx, gz) in ((xc, D * 0.78), (xc - 1.6, D * 0.32), (xc + 1.6, D * 0.32)): _gear(p, gx, gz, fy - 0.5, 0.075)
    add_box(p, xc - 0.38, deck - 0.15, cz0 - 0.08, xc + 0.38, deck, cz0, 'hazard', 0.005)
    ship_interior(p, lay) if False else None
    # the cockpit inside: a floor, the seat and the console from the layout
    add_box(p, hx0, deck - 0.12, cz0, hx1, deck, cz1, 'metal', 0.01)
    B = {'console': console, 'chair': chair}
    for pr in lay['props']:
        across = pr['face'] in (0, 2); L, Dd = (pr['x1'] - pr['x0'], pr['z1'] - pr['z0']) if across else (pr['z1'] - pr['z0'], pr['x1'] - pr['x0'])
        place_in(p, B[pr['kind']], L, Dd, pr['h'], pr, deck)

def ladder(p, L_, D_, H_, r, model):
    lay = SHIPCAT[model]; rp = lay['ramp']; deck = lay['deck']
    for x in (rp['x0'], rp['x1'] - 0.04):
        bm = bmesh.new(); vs = [bm.verts.new(P(*v)) for v in [(x, 0, rp['z0']), (x, deck, rp['z1']), (x + 0.04, deck, rp['z1']), (x + 0.04, 0, rp['z0'])]]
        bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.04); merge(p, bm, 'metal')
    for k in range(7):
        f = (k + 0.5) / 7; add_box(p, rp['x0'], deck * f - 0.02, rp['z0'] + (rp['z1'] - rp['z0']) * f - 0.03, rp['x1'], deck * f + 0.02, rp['z0'] + (rp['z1'] - rp['z0']) * f + 0.03, 'metal', 0.004)

def shuttle_ramp(p, L_, D_, H_, r, model='shuttle'):
    fp = os.path.join(ROOT, 'assets', 'ships', model + '.json'); lay = json.load(open(fp)) if os.path.exists(fp) else SHIPCAT[model]
    rp = lay['ramp']; deck = lay['deck']
    bm = bmesh.new()      # the plate, hinged at the deck edge (z1, deck), resting on the ground at z0
    t = 0.1
    q = [(rp['x0'], 0, rp['z0']), (rp['x1'], 0, rp['z0']), (rp['x1'], deck, rp['z1']), (rp['x0'], deck, rp['z1'])]
    top = [bm.verts.new(P(*v)) for v in q]; bot = [bm.verts.new(P(x, y - t, z + 0.0)) for (x, y, z) in q]
    bm.faces.new(top); bm.faces.new(bot[::-1])
    for k in range(4): bm.faces.new([top[k], bot[k], bot[(k + 1) % 4], top[(k + 1) % 4]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, 'metal')
    for k in range(9):    # grip ribs
        f = (k + 0.5) / 9; z = rp['z0'] + (rp['z1'] - rp['z0']) * f; y = deck * f
        add_box(p, rp['x0'] + 0.1, y, z - 0.02, rp['x1'] - 0.1, y + 0.025, z + 0.02, 'rubber', 0.004)
    for x in (rp['x0'], rp['x1'] - 0.05):    # side rails
        bm = bmesh.new()
        vs = [bm.verts.new(P(*v)) for v in [(x, 0.0, rp['z0']), (x, deck, rp['z1']), (x, deck + 0.18, rp['z1']), (x, 0.18, rp['z0'])]]
        bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.05); merge(p, bm, 'paint')

def streetlamp(p, L, D, H, r):
    """Street light. Frame: pole at (0.3, 0.3), arm reaching toward +z; the lens ('glow')
    is lit at night by the game's lamp material. Same footprint as the old placeholder."""
    px, pz = 0.3, 0.3
    add_box(p, px - 0.16, 0, pz - 0.16, px + 0.16, 0.5, pz + 0.16, 'concrete', 0.02)                 # footing
    add_cyl(p, px, pz, 0.5, 0.9, 0.12, 'metal', 16, r2=0.1)                                           # base flange with the access door
    add_box(p, px - 0.05, 0.6, pz - 0.115, px + 0.05, 0.8, pz - 0.1, 'metal', 0.003)
    add_cyl(p, px, pz, 0.9, 5.7, 0.085, 'metal', 16, r2=0.055)                                        # tapered shaft
    # arm: a quarter bend out of the top of the pole, then level
    prev = (pz, 5.7); R = 0.45
    for k in range(1, 9):
        a = k / 8 * math.pi / 2
        z, y = pz + R * (1 - math.cos(a)), 5.7 + R * math.sin(a)
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.045, radius2=0.045, depth=1.0)
        dz, dy = z - prev[0], y - prev[1]; ln = math.hypot(dz, dy)
        for v in bm.verts:
            x0, y0, z0 = v.co      # along Blender z, centred
            t = (z0 + 0.5) * ln
            ux, uy = dz / ln, dy / ln
            nz, ny = -uy, ux        # perpendicular in the (z, y) plane
            v.co = P(px + x0, prev[1] + uy * t + ny * y0, prev[0] + ux * t + nz * y0)
        merge(p, bm, 'metal'); prev = (z, y)
    add_cyl(p, px, 6.15, prev[0], 1.3, 0.045, 'metal', 10, axis='z')
    # luminaire head: a low bevelled housing with the lens underneath
    add_box(p, px - 0.2, 6.02, 1.2, px + 0.2, 6.2, 1.85, 'paint', 0.03, 3)
    add_box(p, px - 0.17, 6.0, 1.24, px + 0.17, 6.03, 1.8, 'glow', 0.01)
    add_box(p, px - 0.12, 6.2, 1.35, px + 0.12, 6.24, 1.6, 'paint', 0.01)

def card(part, centre, along, up, w, h, mat, uv_along_x=False):
    """A double-sided quad of foliage: `along` is the twig's direction (texture up, or +x for needles)."""
    c = mathutils.Vector(centre); a = mathutils.Vector(along).normalized(); u = mathutils.Vector(up).normalized()
    side = a.cross(u).normalized()
    if uv_along_x: corners = [c - side * h / 2, c - side * h / 2 + a * w, c + side * h / 2 + a * w, c + side * h / 2]   # base at the trunk
    else: corners = [c - side * w / 2, c + side * w / 2, c + side * w / 2 + a * h, c - side * w / 2 + a * h]
    bm = bmesh.new(); vs = [bm.verts.new(P(v.x, v.y, v.z)) for v in corners]; f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new('UVMap')
    for l, uv in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)] if not uv_along_x else [(0, 0), (1, 0), (1, 1), (0, 1)]): l[uvl].uv = uv
    m = bpy.data.meshes.new('tmp'); bm.to_mesh(m); bm.free()
    for pp in m.polygons: pp.material_index = SLOTS.index(mat)
    m['card'] = 1; part.bm.from_mesh(m); bpy.data.meshes.remove(m)

# ------------------------------------------------------------------ plants and rocks
# Frame: centred on (L/2, D/2), standing on y = 0; the game scales each to its own size.
def jag_cone(part, cx, cz, y0, y1, r, mat, rng, seg=14, droop=0.25, ragged=0.22):
    """A drooping, ragged skirt of foliage: a cone whose rim hangs and frays."""
    bm = bmesh.new(); tip = bm.verts.new(P(cx + rng.uniform(-0.05, 0.05), y1, cz + rng.uniform(-0.05, 0.05)))
    rim, mid = [], []
    for k in range(seg):
        a = 2 * math.pi * k / seg + rng.uniform(-0.12, 0.12); rr = r * (1 + rng.uniform(-ragged, ragged))
        mid.append(bm.verts.new(P(cx + math.cos(a) * rr * 0.55, y0 + (y1 - y0) * 0.45, cz + math.sin(a) * rr * 0.55)))
        rim.append(bm.verts.new(P(cx + math.cos(a) * rr, y0 - droop * rng.uniform(0.4, 1.0), cz + math.sin(a) * rr)))
    under = bm.verts.new(P(cx, y0 + (y1 - y0) * 0.15, cz))
    for k in range(seg):
        k1 = (k + 1) % seg
        bm.faces.new([tip, mid[k1], mid[k]]); bm.faces.new([mid[k], mid[k1], rim[k1], rim[k]]); bm.faces.new([rim[k], rim[k1], under])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(part, bm, mat)

def conifer(p, L, D, H, r):
    cx, cz = L / 2, D / 2
    add_cyl(p, cx, cz, 0, H * 0.92, H * 0.032, 'bark', 10, r2=H * 0.006)
    for i in range(16):                      # whorls of drooping needle fronds, shorter toward the top
        f = i / 16; y = H * (0.16 + 0.8 * f); reach = (L / 2) * (1 - f) ** 0.85 + 0.3
        for k in range(7):
            a = 2 * math.pi * (k / 7) + i * 0.9 + r.uniform(-0.2, 0.2)
            out = mathutils.Vector((math.cos(a), -0.35 - 0.2 * r.random(), math.sin(a)))
            card(p, (cx, y, cz), out, (0, 1, 0), reach * 1.05, reach * 0.75, 'needlecard', uv_along_x=True)

def broadleaf(p, L, D, H, r):
    cx, cz = L / 2, D / 2
    add_cyl(p, cx, cz, 0, H * 0.5, H * 0.045, 'bark', 12, r2=H * 0.03)
    tips = []
    for k in range(5):                        # main limbs, each ending in a clump
        a = k * 2 * math.pi / 5 + r.uniform(-0.4, 0.4); L1 = H * 0.3
        x1, z1, y1 = cx + math.cos(a) * L1 * 0.75, cz + math.sin(a) * L1 * 0.75, H * r.uniform(0.62, 0.74)
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=H * 0.022, radius2=H * 0.008, depth=1.0)
        d = mathutils.Vector((x1 - cx, y1 - H * 0.42, z1 - cz)); ln = d.length; d.normalize(); rot = d.to_track_quat('Z', 'Y')
        for v in bm.verts:
            q = mathutils.Vector((v.co.x, v.co.y, (v.co.z + 0.5) * ln)); q.rotate(rot); v.co = P(cx + q.x, H * 0.42 + q.y, cz + q.z)
        merge(p, bm, 'bark'); tips.append((x1, y1, z1))
    tips.append((cx, H * 0.8, cz))
    for (tx, ty, tz) in tips:                # leafy twigs radiating from each clump centre
        for k in range(95):
            d = mathutils.Vector((r.uniform(-1, 1), r.uniform(-0.5, 1), r.uniform(-1, 1))).normalized()
            rr = r.uniform(0.3, 1.0)                 # fill the clump, not just its shell
            c = (tx + d.x * L * 0.2 * rr, ty + d.y * H * 0.11 * rr, tz + d.z * L * 0.2 * rr)
            card(p, c, d, (r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1)), H * 0.1, H * 0.13, 'leafcard')

def shrub(p, L, D, H, r):
    cx, cz = L / 2, D / 2
    for k in range(40):
        d = mathutils.Vector((r.uniform(-1, 1), r.uniform(0.25, 1), r.uniform(-1, 1))).normalized()
        card(p, (cx + d.x * L * 0.18, H * r.uniform(0.0, 0.25), cz + d.z * L * 0.18), d, (r.uniform(-1, 1), 0.2, r.uniform(-1, 1)), L * 0.32, H * 0.7, 'leafcard')

def boulder(p, L, D, H, r):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    w = [(r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(0.1, 0.3)) for _ in range(6)]
    for v in bm.verts:
        x, y, z = v.co; k = 1.0
        for (a, b, c, s) in w: k += s * max(0, x * a + y * b + z * c) ** 2 * (1 if s > 0.2 else -1)   # broad facets
        k += 0.04 * math.sin(x * 9 + y * 5) * math.sin(z * 7)
        x, y, z = x * k, y * k, z * k
        v.co = P(L / 2 + x * L / 2, max(-0.2 * H, (z * 0.5 + 0.35) * H), D / 2 + y * D / 2)
    merge(p, bm, 'rock')

def impostor(p, L, D, H, mat):
    """Three crossed upright cards carrying the side-on picture of the tree."""
    for k in range(3):
        a = k * math.pi / 3
        card(p, (L / 2, 0, D / 2), (0, 1, 0), (math.cos(a), 0, math.sin(a)), L, H, mat)

def conifer_far(p, L, D, H, r): impostor(p, L, D, H, 'impconifer')
def broadleaf_far(p, L, D, H, r): impostor(p, L, D, H, 'impbroadleaf')

# ------------------------------------------------------------------ grown trees
# A tree is grown, not modelled: a trunk polyline that bends and tapers, children sprouting
# from it at angles, recursively, as tapered tubes; leaf cards at the twigs. One species is a
# dict of growth rules. Frame: base at (L/2, 0, D/2), +y up, metres.
def tube(part, pts, radii, mat, sides=8):
    bm = bmesh.new(); rings = []; n_prev = None
    for i, (pnt, rad) in enumerate(zip(pts, radii)):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if n_prev is None: n_prev = t.orthogonal().normalized()
        n = (n_prev - t * n_prev.dot(t)).normalized(); b = t.cross(n); n_prev = n          # parallel transport
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides; v = pnt + (n * math.cos(a) + b * math.sin(a)) * rad
            ring.append(bm.verts.new(P(v.x, v.y, v.z)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(sides): bm.faces.new([r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]])
    tip = bm.verts.new(P(*(pts[-1] + (pts[-1] - pts[-2]).normalized() * radii[-1])))
    for k in range(sides): bm.faces.new([rings[-1][k], rings[-1][(k + 1) % sides], tip])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(part, bm, mat)

def grow_branch(part, sp, r, base, d, length, radius, depth, leaves, twist=0.0):
    V = mathutils.Vector
    segs = max(3, int(length / sp.get('seg', 0.7)))
    pts, rad = [base.copy()], [radius]
    for i in range(1, segs + 1):
        f = i / segs
        d = (d + V((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1))) * sp['wiggle'] + V((0, 1, 0)) * sp['up'][depth] - V((0, 1, 0)) * sp['droop'][depth] * f).normalized()
        if twist: d = mathutils.Matrix.Rotation(twist / segs, 3, 'Y') @ d
        pts.append(pts[-1] + d * length / segs); rad.append(radius * (1 - f * sp['taper']) + 0.006)
    tube(part, pts, rad, sp['bark'], max(4, sp['sides'] - 2 * (sp['levels'] - depth)))
    if depth == 0:
        for j in range(max(1, segs // 2), segs + 1): leaves.append((pts[j], (pts[j] - pts[j - 1]).normalized()))
        return
    kids = sp['kids'][depth]; spin = r.uniform(0, 2 * math.pi)
    for k in range(kids):
        t = sp['start'][depth] + (1 - sp['start'][depth]) * ((k + r.random() * 0.8) / kids if not sp.get('fork') else 1.0)
        idx = min(len(pts) - 1, max(1, int(t * segs)))
        az = sp['phi'] * k + r.uniform(-0.4, 0.4) if not sp.get('fork') else 2 * math.pi * k / kids + spin + r.uniform(-0.25, 0.25)
        tilt = math.radians(sp['angle'][depth] * r.uniform(0.8, 1.2))
        perp = d.orthogonal().normalized(); perp = mathutils.Matrix.Rotation(az, 3, d) @ perp
        cd = (d * math.cos(tilt) + perp * math.sin(tilt)).normalized()
        cl = length * sp['ratio'][depth] * (1.3 * (1.04 - t) ** 0.9 if sp.get('cone') else 1.0) * r.uniform(0.85, 1.12)
        grow_branch(part, sp, r, pts[idx], cd, cl, rad[idx] * sp['child_r'], depth - 1, leaves, twist * 0.5)

def grow_tree(part, L, D, H, r, sp):
    V = mathutils.Vector
    leaves = []
    trunk_len = H * sp['trunk']
    if sp.get('bottle'):   # a swollen trunk: a fat tube under the real one
        rr = [sp['radius'] * (1.0 + 2.2 * math.sin(math.pi * min(1, i / 8 * 1.05)) ** 1.5) for i in range(9)]
        tube(part, [V((L / 2, trunk_len * i / 8 * 0.95, D / 2)) for i in range(9)], rr, sp['bark'], 14)
    grow_branch(part, sp, r, V((L / 2, -0.15, D / 2)), V((0, 1, 0)), trunk_len, sp['radius'], sp['levels'], leaves, sp.get('twist', 0.0))
    # leaves: cards at the twigs, facing out from the crown's middle
    crown = sum((p for p, _ in leaves), V((0, 0, 0))) / max(1, len(leaves))
    for p_, d_ in leaves:
        for k in range(sp['per_twig']):
            out = (p_ - crown); out.y *= 0.5; out = (out.normalized() + d_ + V((r.uniform(-.6, .6), r.uniform(-.3, .6), r.uniform(-.6, .6)))).normalized()
            if sp.get('hang'): out = (out * 0.4 + V((0, -1, 0))).normalized()
            card(part, (p_.x, p_.y, p_.z), out, (r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1)), sp['leaf'][0], sp['leaf'][1], sp['card'], uv_along_x=sp.get('along_x', False))

TREES = {
    'oak':     dict(trunk=0.45, radius=0.36, levels=3, kids={3: 7, 2: 5, 1: 4}, start={3: 0.45, 2: 0.25, 1: 0.25}, angle={3: 58, 2: 42, 1: 38}, ratio={3: 0.95, 2: 0.6, 1: 0.55},
                   up={3: 0.06, 2: 0.04, 1: 0.03, 0: 0.02}, droop={3: 0, 2: 0.04, 1: 0.06, 0: 0.08}, wiggle=0.16, taper=0.7, child_r=0.62, phi=2.4, sides=10,
                   bark='bark', card='leafcard', leaf=(1.0, 1.15), per_twig=5),
    'birch':   dict(trunk=0.95, radius=0.15, levels=3, kids={3: 9, 2: 3, 1: 2}, start={3: 0.35, 2: 0.3, 1: 0.3}, angle={3: 38, 2: 40, 1: 35}, ratio={3: 0.33, 2: 0.6, 1: 0.6},
                   up={3: 0.05, 2: 0.01, 1: 0.0, 0: 0.0}, droop={3: 0, 2: 0.07, 1: 0.12, 0: 0.15}, wiggle=0.12, taper=0.8, child_r=0.5, phi=2.4, sides=8, cone=True,
                   bark='birchbark', card='leafcard', leaf=(0.65, 0.8), per_twig=5),
    'spruce':  dict(trunk=1.0, radius=0.24, levels=2, kids={2: 42, 1: 3}, start={2: 0.1, 1: 0.25}, angle={2: 84, 1: 50}, ratio={2: 0.32, 1: 0.4},
                   up={2: 0.05, 1: 0.0, 0: 0.0}, droop={2: 0, 1: 0.14, 0: 0.16}, wiggle=0.03, taper=0.97, child_r=0.3, phi=2.4, sides=8, cone=True, seg=0.45,
                   bark='bark', card='needlecard', leaf=(0.75, 0.55), per_twig=3, along_x=True),
    'pine':    dict(trunk=1.0, radius=0.26, levels=3, kids={3: 9, 2: 3, 1: 3}, start={3: 0.55, 2: 0.4, 1: 0.4}, angle={3: 62, 2: 40, 1: 35}, ratio={3: 0.38, 2: 0.6, 1: 0.55},
                   up={3: 0.06, 2: 0.08, 1: 0.1, 0: 0.1}, droop={3: 0, 2: 0, 1: 0, 0: 0}, wiggle=0.12, taper=0.85, child_r=0.5, phi=2.4, sides=10,
                   bark='bark', card='needlecard', leaf=(1.1, 0.8), per_twig=4, along_x=True),
    'parasol': dict(trunk=0.5, radius=0.42, levels=5, fork=True, kids={5: 3, 4: 2, 3: 2, 2: 2, 1: 2}, start={5: 1, 4: 1, 3: 1, 2: 1, 1: 1}, angle={5: 58, 4: 42, 3: 36, 2: 30, 1: 26}, ratio={5: 0.36, 4: 0.75, 3: 0.75, 2: 0.72, 1: 0.7},
                   up={5: 0.0, 4: 0.0, 3: 0.0, 2: 0.0, 1: 0.0, 0: 0.0}, droop={5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0}, wiggle=0.05, taper=0.4, child_r=0.72, phi=2.4, sides=12,
                   bark='smoothbark', card='frondcard', leaf=(0.9, 1.4), per_twig=9),
    'spiral':  dict(trunk=0.8, radius=0.24, levels=2, twist=2.8, kids={2: 12, 1: 4}, start={2: 0.35, 1: 0.4}, angle={2: 65, 1: 40}, ratio={2: 0.4, 1: 0.6},
                   up={2: 0.04, 1: 0.0, 0: 0.0}, droop={2: 0.0, 1: 0.2, 0: 0.25}, wiggle=0.08, taper=0.8, child_r=0.55, phi=2.4, sides=10,
                   bark='smoothbark', card='padcard', leaf=(0.9, 1.15), per_twig=5, hang=True),
    'bottle':  dict(trunk=0.6, radius=0.34, levels=2, kids={2: 5, 1: 3}, start={2: 0.9, 1: 0.4}, angle={2: 48, 1: 40}, ratio={2: 0.55, 1: 0.6},
                   up={2: 0.1, 1: 0.05, 0: 0.05}, droop={2: 0, 1: 0, 0: 0}, wiggle=0.12, taper=0.75, child_r=0.45, phi=2.4, sides=10, bottle=True,
                   bark='bark', card='leafcard', leaf=(0.7, 0.85), per_twig=3),
}
def tree_builder(name): return lambda p, L, D, H, r: grow_tree(p, L, D, H, random.Random(name), TREES[name])

def fern(p, L, D, H, r):
    """Undergrowth fern: fronds arching out from a crown, cards of the frond atlas."""
    cx, cz = L / 2, D / 2
    for k in range(16):
        a = 2 * math.pi * k / 16 + r.uniform(-0.15, 0.15); up = r.uniform(0.45, 1.0)
        d = mathutils.Vector((math.cos(a) * (1.1 - up * 0.5), up, math.sin(a) * (1.1 - up * 0.5))).normalized()
        card(p, (cx, 0.02, cz), d, (-math.sin(a), 0, math.cos(a)), L * 0.32, H * 1.05, 'frondcard')

# ------------------------------------------------------------------ home fittings (front of the piece is z = 0)
def toilet(p, L, D, H, r):
    cx = L / 2
    add_cushion(p, cx - 0.18, 0, 0.1, cx + 0.18, 0.4, D - 0.18, 'ceramic', 0.15, 0.6, 8)      # pedestal and bowl
    add_cushion(p, cx - 0.2, 0.38, 0.02, cx + 0.2, 0.43, D - 0.2, 'ceramic', 0.2, 0.7, 8)     # seat
    add_box(p, cx - 0.21, 0.4, D - 0.2, cx + 0.21, H, D - 0.02, 'ceramic', 0.03, 3)            # cistern
    add_box(p, cx - 0.04, H, D - 0.14, cx + 0.04, H + 0.012, D - 0.08, 'metal', 0.004)        # flush button

def basin(p, L, D, H, r):
    add_box(p, 0.05, 0, 0.12, L - 0.05, H - 0.12, D, 'tint', 0.01, 3)                          # vanity unit
    add_cushion(p, 0, H - 0.14, 0, L, H, D, 'ceramic', 0.1, 0.45, 8)                            # the basin
    add_box(p, L / 2 - 0.16, H - 0.03, D * 0.25, L / 2 + 0.16, H + 0.002, D * 0.65, 'rubber', 0.02)   # the hollow (dark)
    add_cyl(p, L / 2, D - 0.06, H, H + 0.18, 0.016, 'metal', 10)                               # tap
    add_box(p, L / 2 - 0.015, H + 0.16, D - 0.2, L / 2 + 0.015, H + 0.18, D - 0.05, 'metal', 0.005)
    add_box(p, 0.02, H + 0.25, D - 0.03, L - 0.02, H + 0.95, D, 'mirror', 0.01)                 # mirror on the wall
    add_box(p, 0.0, H + 0.23, D - 0.04, L, H + 0.25, D, 'metal', 0.004)

def shower(p, L, D, H, r):
    add_box(p, 0, 0, 0, L, 0.08, D, 'ceramic', 0.01, 3)                                        # tray
    add_box(p, L / 2 - 0.05, 0.081, D / 2 - 0.05, L / 2 + 0.05, 0.083, D / 2 + 0.05, 'metal', 0)   # drain
    for (x0, z0, x1, z1) in ((0, 0, 0.02, D), (0, 0, L * 0.45, 0.02)):                          # glass screen and a fixed panel
        add_box(p, x0, 0.08, z0, x1, H, z1, 'glass', 0.002)
    add_box(p, 0, H - 0.02, 0, L, H, 0.02, 'metal', 0.004); add_box(p, 0, H - 0.02, 0, 0.02, H, D, 'metal', 0.004)
    add_box(p, L - 0.02, 0.08, 0.05, L, H, D - 0.05, 'ceramic', 0.002)                          # tiled back
    add_cyl(p, L - 0.08, D / 2, 1.2, 1.95, 0.012, 'metal', 8)                                   # riser and head
    add_cyl(p, L - 0.2, D / 2, 1.93, 1.96, 0.1, 'metal', 16)

def tvstand(p, L, D, H, r):
    add_box(p, 0, 0.06, 0, L, H, D, 'wood', 0.01, 3)
    for x in (0.03, L - 0.07): add_box(p, x, 0, 0.05, x + 0.04, 0.06, D - 0.05, 'metal', 0.004)
    add_box(p, 0.04, 0.12, -0.002, L / 2 - 0.02, H - 0.05, 0.0, 'paint', 0.004)                # doors
    add_box(p, L / 2 + 0.02, 0.12, -0.002, L - 0.04, H - 0.05, 0.0, 'paint', 0.004)
    tw = min(1.3, L * 0.85)
    add_box(p, L / 2 - 0.12, H, D * 0.4, L / 2 + 0.12, H + 0.02, D * 0.75, 'plastic', 0.004)   # TV foot and stem
    add_box(p, L / 2 - 0.025, H, D * 0.6, L / 2 + 0.025, H + 0.12, D * 0.65, 'plastic', 0.004)
    add_box(p, L / 2 - tw / 2, H + 0.1, D * 0.58, L / 2 + tw / 2, H + 0.1 + tw * 0.58, D * 0.62, 'plastic', 0.008)
    add_box(p, L / 2 - tw / 2 + 0.015, H + 0.115, D * 0.578, L / 2 + tw / 2 - 0.015, H + 0.085 + tw * 0.58, D * 0.58, 'screen', 0)

def bookshelf(p, L, D, H, r):
    add_box(p, 0, 0, 0, 0.025, H, D, 'wood', 0.004); add_box(p, L - 0.025, 0, 0, L, H, D, 'wood', 0.004)
    add_box(p, 0, 0, D - 0.015, L, H, D, 'wood', 0.002)
    n = 5
    for i in range(n + 1):
        y = 0.04 + i * (H - 0.06) / n
        add_box(p, 0.025, y - 0.02, 0, L - 0.025, y, D - 0.015, 'wood', 0.003)
        if i == n: break
        x = 0.04
        while x < L - 0.1:                                       # books: varied heights and widths, a gap now and then
            w = r.uniform(0.02, 0.05); h = (H - 0.06) / n * r.uniform(0.6, 0.88)
            if r.random() < 0.08: x += r.uniform(0.05, 0.15); continue
            add_box(p, x, y, r.uniform(0.02, 0.06), x + w, y + h, D - 0.03, 'books', 0.002); x += w + 0.002
            if r.random() < 0.04 and x < L - 0.3:                # a short lean
                add_box(p, x, y, 0.05, x + 0.15, y + 0.04, D - 0.04, 'books', 0.002); x += 0.17

def armchair(p, L, D, H, r):
    for lx in (0.08, L - 0.12):
        for lz in (0.08, D - 0.12): add_cyl(p, lx + 0.02, lz + 0.02, 0, 0.1, 0.02, 'wood', 8)
    add_box(p, 0.02, 0.1, 0.04, L - 0.02, 0.3, D, 'tint', 0.03, 3)
    add_cushion(p, 0.02, 0.1, D - 0.22, L - 0.02, H, D, 'tint', 0.12, 0.35)                     # back
    for x0, x1 in ((0.0, 0.16), (L - 0.16, L)): add_cushion(p, x0, 0.1, 0.04, x1, 0.62, D, 'tint', 0.2, 0.45)
    add_cushion(p, 0.17, 0.29, 0.03, L - 0.17, 0.46, D - 0.2, 'tint', 0.3, 0.45)                # seat

# ------------------------------------------------------------------ small things on surfaces (origin: the surface, front z = 0)
def vase(p, L, D, H, r):
    cx, cz = L / 2, D / 2
    add_cyl(p, cx, cz, 0, H * 0.45, L * 0.32, 'ceramic', 20, r2=L * 0.22); add_cyl(p, cx, cz, H * 0.45, H * 0.55, L * 0.22, 'ceramic', 20, r2=L * 0.28)
    for k in range(9):                                     # stems and flower heads
        a = k * 2.4; x1, z1 = cx + math.cos(a) * L * 0.35 * r.random(), cz + math.sin(a) * D * 0.35 * r.random(); y1 = H * r.uniform(0.85, 1.0)
        bm = bmesh.new(); vs = [bm.verts.new(P(cx, H * 0.5, cz)), bm.verts.new(P(x1, y1, z1)), bm.verts.new(P(x1 + 0.006, y1, z1))]; bm.faces.new(vs); merge(p, bm, 'leaf')
        add_blob(p, x1, y1, z1, 0.028, 'tint', r, sub=1)
def kettle(p, L, D, H, r):
    add_cyl(p, L / 2, D / 2, 0, H * 0.08, L * 0.42, 'plastic', 20)
    add_cyl(p, L / 2, D / 2, H * 0.08, H * 0.85, L * 0.4, 'metal', 20, r2=L * 0.3)
    add_box(p, L * 0.82, H * 0.3, D * 0.42, L * 0.95, H * 0.8, D * 0.58, 'plastic', 0.01)
    add_cyl(p, L / 2, D / 2, H * 0.85, H, L * 0.1, 'plastic', 12)
def books(p, L, D, H, r):
    y = 0
    while y < H - 0.02:
        t = r.uniform(0.02, 0.04); w = L * r.uniform(0.75, 1.0); d = D * r.uniform(0.75, 1.0)
        add_box(p, (L - w) / 2, y, (D - d) / 2, (L + w) / 2, y + t, (D + d) / 2, 'books', 0.003); y += t
def lamp(p, L, D, H, r):
    add_cyl(p, L / 2, D / 2, 0, 0.03, L * 0.35, 'metal', 20)
    add_cyl(p, L / 2, D / 2, 0.03, H * 0.62, 0.012, 'metal', 8)
    add_cyl(p, L / 2, D / 2, H * 0.58, H, L * 0.48, 'fabric', 24, r2=L * 0.32)
def bowl(p, L, D, H, r):
    add_cyl(p, L / 2, D / 2, 0, H * 0.6, L * 0.48, 'ceramic', 24, r2=L * 0.3) if False else add_cyl(p, L / 2, D / 2, 0, H * 0.6, L * 0.3, 'ceramic', 24, r2=L * 0.48)
    for k in range(6): add_blob(p, L / 2 + r.uniform(-L * 0.2, L * 0.2), H * 0.7, D / 2 + r.uniform(-D * 0.2, D * 0.2), L * 0.11, 'tint', r, sub=2)
def mugs(p, L, D, H, r):
    for k in range(2):
        cx = L * (0.27 + 0.46 * k); add_cyl(p, cx, D / 2, 0, H, L * 0.2, 'tint', 16)
        add_box(p, cx + L * 0.19, H * 0.3, D / 2 - 0.006, cx + L * 0.25, H * 0.75, D / 2 + 0.006, 'tint', 0.004)
def potplant(p, L, D, H, r):
    add_cyl(p, L / 2, D / 2, 0, H * 0.35, L * 0.3, 'ceramic', 16, r2=L * 0.38)
    for k in range(10):
        d = mathutils.Vector((r.uniform(-1, 1), r.uniform(0.5, 1), r.uniform(-1, 1))).normalized()
        card(p, (L / 2, H * 0.3, D / 2), d, (r.uniform(-1, 1), 0.2, r.uniform(-1, 1)), L * 0.35, H * 0.75, 'leafcard')

# ------------------------------------------------------------------ the vehicle catalogue (assets/vehicles.json)
# Frame like the speeder: x rear (0) → nose (L), z across (0..W), y up; hovering, so the
# body floats ~0.35 m up over four glowing repulsor pods.
def vehicle_from(v):
    b = v.get('body', {}); k = v['kind']
    def build(p, L, W, H, r):
        if k == 'bike':
            speeder(p, L, W, H, r)
            if b.get('rack'):
                for i in range(2): add_box(p, 0.05 + i * 0.42, 0.72, W / 2 - 0.3, 0.42 + i * 0.42, 1.05, W / 2 + 0.3, 'cardboard', 0.01)
                add_box(p, 0.0, 0.68, W / 2 - 0.35, 0.9, 0.72, W / 2 + 0.35, 'metal', 0.005)
            if b.get('sleek'): add_loft(p, [(L * 0.55, 0.78, 0.02, W / 2, 0.12, 2), (L * 0.8, 0.72, 0.1, W / 2, 0.18, 2.5), (L * 0.98, 0.64, 0.02, W / 2, 0.04, 2)], 'tint', 20)
            return
        zc = W / 2; belly = 0.38; rr = b.get('round', 3)
        def S(t): return t * L
        if k == 'truck':
            cab = b.get('cab', 0.3); cx0 = L * (1 - cab)
            add_box(p, 0.15, belly, 0.1, L - 0.1, belly + 0.35, W - 0.1, 'paint', 0.03)                        # chassis
            add_loft(p, [(cx0, belly + 0.9, 0.9, zc, W / 2, rr), (L - 0.4, belly + 0.9, 0.9, zc, W / 2, rr), (L - 0.05, belly + 0.75, 0.6, zc, W / 2 - 0.15, rr)], 'tint', 28)
            add_loft(p, [(cx0 + 0.3, belly + 1.85, 0.32, zc, W / 2 - 0.05, rr), (L - 0.55, belly + 1.85, 0.32, zc, W / 2 - 0.05, rr), (L - 0.2, belly + 1.55, 0.05, zc, W / 2 - 0.3, rr)], 'visor', 28)
            add_loft(p, [(cx0, belly + 2.12, 0.08, zc, W / 2, rr), (L - 0.5, belly + 2.12, 0.08, zc, W / 2, rr)], 'tint', 24)
            if b.get('box'): add_box(p, 0.1, belly + 0.35, 0.05, cx0 - 0.15, H, W - 0.05, 'corrugated', 0.03); add_box(p, 0.05, belly + 0.4, 0.15, 0.1, H - 0.1, W - 0.15, 'metal', 0.01)
            if b.get('tank'):
                add_cyl(p, H * 0.5 + 0.3, W / 2, 0.2, cx0 - 0.2, W * 0.45, 'metal', 28, axis='x')
                for x in (0.5, (cx0 - 0.2) / 2, cx0 - 0.6): add_cyl(p, H * 0.5 + 0.3, W / 2, x, x + 0.1, W * 0.47, 'paint', 28, axis='x')
                add_box(p, 0.3, H - 0.1, W / 2 - 0.3, cx0 - 0.4, H - 0.05, W / 2 + 0.3, 'hazard', 0.005)
            if b.get('bed'):
                add_box(p, 0.15, belly + 0.35, 0.1, cx0 - 0.1, belly + 0.85, 0.2, 'tint', 0.01); add_box(p, 0.15, belly + 0.35, W - 0.2, cx0 - 0.1, belly + 0.85, W - 0.1, 'tint', 0.01)
                add_box(p, 0.1, belly + 0.35, 0.1, 0.2, belly + 0.85, W - 0.1, 'tint', 0.01)
                for i in range(int(r.uniform(1, 4))): x0 = 0.3 + i * 0.75; add_box(p, x0, belly + 0.36, 0.4 + r.uniform(0, 0.5), x0 + 0.6, belly + 0.36 + r.uniform(0.3, 0.6), 1.2 + r.uniform(0, 0.4), 'cardboard', 0.01)
            for x in (S(0.15), S(0.85)):
                for zz in (0.35, W - 0.35): add_cyl(p, x, zz, belly - 0.1, belly, 0.3, 'metal', 16); add_cyl(p, x, zz, belly - 0.12, belly - 0.1, 0.22, 'glow', 16)
            for zz in (0.3, W - 0.3): add_box(p, L - 0.08, belly + 0.6, zz - 0.15, L - 0.02, belly + 0.75, zz + 0.15, 'navwhite', 0.01); add_box(p, 0.02, belly + 0.5, zz - 0.15, 0.08, belly + 0.65, zz + 0.15, 'navred', 0.01)
            return
        nose, tail, cab, roof = b.get('nose', 0.3), b.get('tail', 0.2), b.get('cabin', 0.45), b.get('roof', 0.9)
        bodyH = (H - belly) * (0.5 if k == 'car' and not b.get('box') and not b.get('windows') else 0.55)
        top = belly + bodyH
        lw = W / 2
        wedge = b.get('wedge')
        secs = [(0.0, belly + bodyH * 0.55, bodyH * 0.45, zc, lw * 0.85, rr), (S(tail * 0.6 + 0.05), belly + bodyH / 2, bodyH / 2, zc, lw, rr), (S(1 - nose), belly + bodyH / 2, bodyH / 2, zc, lw, rr),
                (S(1 - nose * 0.35), belly + bodyH * (0.32 if wedge else 0.42), bodyH * (0.28 if wedge else 0.38), zc, lw * 0.95, rr), (L, belly + bodyH * 0.3, 0.05, zc, lw * 0.6, 2)]
        tall = b.get('box') or b.get('windows')
        if tall:                                   # van / minibus: one tall body from the belly to the roof, sloping into the nose
            hb = (H - belly) / 2
            secs = [(0.0, belly + hb, hb * 0.96, zc, lw * 0.95, rr), (0.25, belly + hb, hb, zc, lw, rr), (S(1 - nose) - 0.4, belly + hb, hb, zc, lw, rr),
                    (S(1 - nose * 0.35), belly + hb * 0.75, hb * 0.72, zc, lw * 0.96, rr), (L, belly + bodyH * 0.35, 0.05, zc, lw * 0.6, 2)]
        add_loft(p, smooth_secs(secs, 6), 'tint', 44)
        if tall:
            add_loft(p, [(S(1 - nose) - 0.9, top + (H - top) * 0.45, (H - top) * 0.3, zc, lw * 0.99, rr), (S(1 - nose * 0.4), top + 0.05, 0.12, zc, lw * 0.92, rr)], 'visor', 28)
            if b.get('windows'): add_box(p, S(0.08), top + (H - top) * 0.35, -0.005, S(1 - nose) - 1.0, top + (H - top) * 0.75, W + 0.005, 'visor', 0.02)
            else:
                add_box(p, S(0.2), top + 0.2, -0.004, S(0.75), H - 0.25, 0.0, 'paint', 0.01)
                for zz in (0, W): add_box(p, S(0.25), top + 0.5, zz - 0.006, S(0.7), top + 0.65, zz + 0.006, 'glow', 0.002)
        elif not b.get('open'):                    # car: a glass cabin and a roof over it
            c0, c1 = S(tail + (1 - tail - nose - cab) / 2), S(tail + (1 - tail - nose - cab) / 2 + cab)
            ch = (H - top) * roof
            add_loft(p, [(c0 - 0.35, top, 0.02, zc, lw * 0.88, rr), (c0 + 0.15, top + ch * 0.55, ch * 0.55, zc, lw * 0.82, rr), (c1 - 0.15, top + ch * 0.55, ch * 0.55, zc, lw * 0.82, rr), (c1 + 0.55, top, 0.02, zc, lw * 0.9, rr)], 'visor', 28)
            add_loft(p, [(c0 + 0.1, top + ch * 1.04, 0.05, zc, lw * 0.76, rr), (c1 - 0.15, top + ch * 1.04, 0.05, zc, lw * 0.76, rr)], 'tint', 24)
            if b.get('taxi'): add_box(p, (c0 + c1) / 2 - 0.25, top + ch * 1.09, zc - 0.12, (c0 + c1) / 2 + 0.25, top + ch * 1.09 + 0.16, zc + 0.12, 'navwhite', 0.02)
        else:                                      # open buggy: seats and a roll cage
            for zz in (zc - 0.45, zc + 0.45): add_cushion(p, S(0.35), top - 0.05, zz - 0.25, S(0.5), top + 0.45, zz + 0.25, 'rubber', 0.2, 0.5, 6)
            if b.get('cage'):
                for x in (S(0.3), S(0.62)):
                    for zz in (0.25, W - 0.25): add_cyl(p, x, zz, top, H, 0.03, 'metal', 8)
                    add_cyl(p, x, H, 0.25, W - 0.25, 0.03, 'metal', 8, axis='z')
                for zz in (0.25, W - 0.25): add_cyl(p, H, zz, S(0.3), S(0.62), 0.03, 'metal', 8, axis='x')
        if b.get('wing'): add_box(p, 0.0, top + 0.25, 0.15, 0.3, top + 0.3, W - 0.15, 'tint', 0.01); [add_box(p, 0.08, top, zz - 0.03, 0.14, top + 0.25, zz + 0.03, 'tint', 0.005) for zz in (0.4, W - 0.4)]
        if b.get('chrome'): add_box(p, S(0.05), belly + bodyH * 0.55, -0.01, S(0.95), belly + bodyH * 0.6, W + 0.01, 'metal', 0.004)
        # lights, pods, a line of trim
        for zz in (lw * 0.45, W - lw * 0.45):
            add_box(p, L * (1 - nose * 0.25) - 0.04, belly + bodyH * 0.35, zz - 0.18, L * (1 - nose * 0.25) + 0.02, belly + bodyH * 0.48, zz + 0.18, 'navwhite', 0.01)
            add_box(p, 0.0, belly + bodyH * 0.5, zz - 0.2, 0.05, belly + bodyH * 0.62, zz + 0.2, 'navred', 0.01)
        add_box(p, S(0.12), belly + bodyH * 0.2, -0.008, S(0.9), belly + bodyH * 0.24, W + 0.008, 'metal', 0.003)
        # lift pods: a housing, a ring, the fan's vanes over the glow, not a disc
        for x in (S(0.18), S(0.82)):
            for zz in (lw * 0.5, W - lw * 0.5):
                add_cyl(p, x, zz, belly - 0.04, belly + 0.05, 0.33, 'rubber', 24); add_cyl(p, x, zz, belly - 0.12, belly - 0.04, 0.27, 'metal', 24, r2=0.31); add_cyl(p, x, zz, belly - 0.135, belly - 0.12, 0.2, 'glow', 20)
                for q in range(6):
                    a_ = q * math.pi / 3; add_box(p, x + math.cos(a_) * 0.11 - 0.012, belly - 0.145, zz + math.sin(a_) * 0.11 - 0.012, x + math.cos(a_) * 0.11 + 0.012, belly - 0.12, zz + math.sin(a_) * 0.11 + 0.012, 'metal', 0)
                add_cyl(p, x, zz, belly - 0.15, belly - 0.12, 0.05, 'metal', 10)
        # a vehicle is made of panels: a sill, doors with their gaps and handles, a grille, a plate, an undertray, lights in housings
        add_box(p, S(0.1), belly - 0.03, 0.14, S(0.9), belly + 0.03, W - 0.14, 'rubber', 0)
        doors = [S(0.56), S(0.62) if tall else S(tail + (1 - tail - nose) * 0.46), S(0.3 if tall else tail + 0.02)]
        for zz, s in ((0.0, -1), (W, 1)):
            zo = zz + s * 0.006
            for x in doors:
                add_box(p, x - 0.008, belly + bodyH * 0.12, min(zz, zo), x + 0.008, top - 0.02, max(zz, zo), 'rubber', 0)
            add_box(p, doors[2], top - 0.05, min(zz, zo), doors[0], top - 0.03, max(zz, zo), 'rubber', 0)
            for x in doors[:2]:
                add_box(p, x - 0.2, top - 0.2, min(zz, zo + s * 0.012), x - 0.05, top - 0.17, max(zz, zo + s * 0.012), 'metal', 0.002)
            add_box(p, S(0.14), belly + 0.02, min(zz, zo), S(0.86), belly + 0.09, max(zz, zo), 'rubber', 0)
            if not b.get('open'):
                mx = S(1 - nose) - 0.08; mz = zz + s * 0.08
                add_box(p, mx - 0.02, top - 0.02, min(zz, mz), mx + 0.02, top + 0.02, max(zz, mz), 'rubber', 0); add_box(p, mx - 0.03, top - 0.02, min(mz, mz + s * 0.11), mx + 0.03, top + 0.11, max(mz, mz + s * 0.11), 'tint', 0.008)
        add_box(p, L * (1 - nose * 0.2) - 0.04, belly + bodyH * 0.14, zc - lw * 0.42, L * (1 - nose * 0.2) + 0.004, belly + bodyH * 0.3, zc + lw * 0.42, 'rubber', 0)
        for q in range(4): add_box(p, L * (1 - nose * 0.2) - 0.02, belly + bodyH * (0.16 + q * 0.035), zc - lw * 0.4, L * (1 - nose * 0.2) + 0.012, belly + bodyH * (0.17 + q * 0.035), zc + lw * 0.4, 'metal', 0)
        add_box(p, -0.012, belly + bodyH * 0.24, zc - 0.2, 0.01, belly + bodyH * 0.36, zc + 0.2, 'paint', 0.003)
        for zz in (lw * 0.45, W - lw * 0.45):
            add_box(p, L * (1 - nose * 0.25) - 0.05, belly + bodyH * 0.33, zz - 0.21, L * (1 - nose * 0.25) + 0.008, belly + bodyH * 0.5, zz + 0.21, 'metal', 0.006); add_box(p, -0.008, belly + bodyH * 0.48, zz - 0.23, 0.04, belly + bodyH * 0.64, zz + 0.23, 'rubber', 0)
    return build
VEH = json.load(open(os.path.join(ROOT, 'assets', 'vehicles.json')))['types']

def variants():
    """(name, builder, len, dep, h, kind) for every furniture size the floor plans use (gen/building.js)."""
    V = [
        ('bed', bed, 2.1, 1.5, 0.55), ('sofa', sofa, 2.0, 0.9, 0.8),
        ('table', table, 1.2, 0.8, 0.45), ('table', table, 1.4, 0.9, 0.75), ('table', table, 1.0, 0.8, 0.75), ('table', table, 3.0, 1.2, 0.75),
        ('desk', desk, 1.5, 0.75, 0.75), ('chair', chair, 0.5, 0.5, 0.9),
        ('cabinet', cabinet, 1.2, 0.45, 1.8), ('cabinet', cabinet, 1.0, 0.5, 1.4), ('cabinet', cabinet, 1.6, 0.45, 0.9),
        ('locker', lambda p, L, D, H, r: cabinet(p, L, D, H, r, 'locker'), 0.9, 0.55, 2.0),
        ('fridge', lambda p, L, D, H, r: cabinet(p, L, D, H, r, 'fridge'), 0.8, 0.7, 1.9),
        ('counter', counter, 1.8, 0.65, 0.92), ('counter', counter, 2.6, 0.65, 0.92), ('counter', counter, 2.8, 0.7, 1.05), ('counter', counter, 2.2, 0.7, 1.0),
        ('shelf', shelf, 2.4, 0.6, 1.9), ('shelf', shelf, 2.4, 0.9, 1.5),
        ('rack', lambda p, L, D, H, r: shelf(p, L, D, H, r, 'rack'), 2.0, 0.6, 2.0), ('rack', lambda p, L, D, H, r: shelf(p, L, D, H, r, 'rack'), 2.4, 0.8, 2.2),
        ('rack', lambda p, L, D, H, r: shelf(p, L, D, H, r, 'rack'), 3.0, 0.9, 2.6),
        ('bench', bench, 1.8, 0.5, 0.45), ('bench', bench, 2.6, 0.9, 0.95), ('bench', bench, 2.4, 1.0, 0.95),
        ('planter', planter, 0.7, 0.7, 1.1), ('planter', planter, 0.8, 0.8, 1.0),
        ('crate', crate, 1.2, 1.2, 1.0), ('crate', crate, 1.0, 1.0, 0.8), ('crate', crate, 1.6, 1.6, 1.4),
        ('machine', machine, 0.7, 0.7, 0.95), ('machine', machine, 1.8, 1.4, 1.7), ('machine', machine, 2.2, 1.6, 2.0),
        *[('veh_' + v['id'], vehicle_from(v), v['L'], v['W'], v['H']) for v in VEH],
        ('speeder', speeder, 2.6, 1.0, 1.05),
        ('streetlamp', streetlamp, 0.6, 1.9, 6.3),
        ('conifer', conifer, 4.5, 4.5, 10), ('broadleaf', broadleaf, 7, 7, 10),
        *[(f'tree_{k}', tree_builder(k), 8, 8, 10) for k in TREES], ('toilet', toilet, 0.45, 0.7, 0.8), ('basin', basin, 0.6, 0.45, 0.9), ('shower', shower, 0.9, 0.9, 2.1),
        ('tvstand', tvstand, 1.6, 0.45, 0.55), ('bookshelf', bookshelf, 1.0, 0.35, 2.0), ('armchair', armchair, 0.85, 0.85, 0.95),
        ('vase', vase, 0.18, 0.18, 0.5), ('kettle', kettle, 0.24, 0.18, 0.26), ('books', books, 0.26, 0.19, 0.14), ('lamp', lamp, 0.28, 0.28, 0.5),
        ('bowl', bowl, 0.32, 0.32, 0.13), ('mugs', mugs, 0.24, 0.12, 0.11), ('potplant', potplant, 0.3, 0.3, 0.45),
        ('shrub', shrub, 1.8, 1.8, 1.0), ('fern', fern, 1.6, 1.6, 0.9), ('boulder', boulder, 1.6, 1.4, 1.0),
        ('conifer_far', conifer_far, 4.5, 4.5, 10), ('broadleaf_far', broadleaf_far, 7, 7, 10),
        ('shuttle', shuttle, 10, 21, 5.4), ('shuttle_ramp', shuttle_ramp, 10, 21, 5.4),
        ('courier', lambda p, L, D, H, r: styled_ship(p, L, D, H, r, 'courier'), 7, 13, 3.9), ('courier_ramp', lambda p, L, D, H, r: shuttle_ramp(p, L, D, H, r, 'courier'), 7, 13, 3.9),
        ('patrol', lambda p, L, D, H, r: styled_ship(p, L, D, H, r, 'patrol'), 7, 13, 3.9), ('patrol_ramp', lambda p, L, D, H, r: shuttle_ramp(p, L, D, H, r, 'patrol'), 7, 13, 3.9),
        ('yacht', lambda p, L, D, H, r: styled_ship(p, L, D, H, r, 'yacht'), 9, 27, 5.0), ('yacht_ramp', lambda p, L, D, H, r: shuttle_ramp(p, L, D, H, r, 'yacht'), 9, 27, 5.0),
        *[x for k, d in FIGHTERS.items() for x in ((k, (lambda kk: lambda p, L, D, H, r: jet(p, L, D, H, r, kk))(k), d['W'], d['D'], d['H']), (k + '_ramp', (lambda kk: lambda p, L, D, H, r: ladder(p, L, D, H, r, kk))(k), d['W'], d['D'], d['H']))],
        *[x for k, d in SHIPCAT.items() if k not in FIGHTERS for x in ((k, (lambda kk: lambda p, L, D, H, r: designed_ship(p, L, D, H, r, kk))(k), d['W'], d['D'], d['H']), (k + '_ramp', (lambda kk: lambda p, L, D, H, r: shuttle_ramp(p, L, D, H, r, kk))(k), d['W'], d['D'], d['H']))],
        ('freighter', freighter, 16, 34, 8.4), ('freighter_ramp', lambda p, L, D, H, r: shuttle_ramp(p, L, D, H, r, 'freighter'), 16, 34, 8.4),
    ]
    return [(f'{k}_{L:g}x{D:g}x{H:g}', fn, L, D, H, k) for k, fn, L, D, H in V]

def build_props():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)
    made = []
    for name, fn, L, D, H, kind in variants():
        if ONLY and name not in ONLY and kind not in ONLY: continue
        p = Part(); fn(p, L, D, H, random.Random(name)); ob = finish(p, name)
        ob['kind'] = kind; ob['dims'] = [L, D, H]
        made.append(ob); print('prop', name, len(ob.data.polygons), 'faces')
    # two files: furniture, plants and fittings; and the big things — ships and vehicles
    big = lambda ob: ob['kind'].startswith('veh_') or ob['kind'].endswith('_ramp') or ob['kind'] in SHIPKINDS
    for fname, sel in (('props.glb', lambda ob: not big(ob)), ('craft.glb', big)):
        group = [ob for ob in made if sel(ob)]
        if not group: continue
        out = os.path.join(ROOT, 'assets', fname)
        if ONLY: out = os.path.join(ROOT, 'out', 'partial-' + fname)      # (a partial build is for looking at: tools/shipbooth.html)
        bpy.ops.object.select_all(action='DESELECT')
        for ob in group: ob.select_set(True)
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_materials='EXPORT',
                                  export_extras=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True)
        print('wrote', out, os.path.getsize(out) // 1024, 'KB')

SHIPKINDS = {'shuttle', 'freighter', 'courier', 'patrol', 'yacht', 'speeder', *SHIPCAT.keys()}
if DO_TEX: build_textures()
if DO_CAPITAL:
    exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'capital_kit.py')).read())
    build_capital()
if DO_PROPS: build_props()
if DO_CITY or DO_ITEMS or DO_COMMON or DO_FAMILY:
    exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'city_kit.py')).read())
if DO_CITY: build_city()
if DO_ITEMS:
    exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'items_kit.py')).read())
    build_items()
if DO_COMMON:
    exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'items_kit.py')).read())
    exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'common_kit.py')).read())
    build_common()
if DO_FAMILY:
    for f in ('items_kit.py', 'common_kit.py', 'family_kit.py'): exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), f)).read())
    build_family()
