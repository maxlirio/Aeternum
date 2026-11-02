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
DO_TEX = 'textures' in argv or not any(a in argv for a in ('textures', 'props'))
DO_PROPS = 'props' in argv or not any(a in argv for a in ('textures', 'props'))
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
    joint = np.clip(1 - (f2 - f1) * 14, 0, 1)                  # thin dark cracks between blocks
    a = spectral(N, 1.9, seed + 2); f = spectral(N, 0.5, seed + 3); lichen = np.clip((spectral(N, 1.2, seed + 4) - 0.72) * 5, 0, 1) * (f > 0.55)
    v = 0.4 + 0.08 * (nid - 0.5) + 0.07 * (strata - 0.5) + 0.08 * (a - 0.5) + 0.06 * (f - 0.5) - 0.2 * joint
    col = np.repeat(np.clip(v, 0, 1)[..., None], 3, -1) * np.array([1.0, 0.96, 0.9])
    col = col * (1 - lichen[..., None] * 0.5) + np.array(srgb((122, 126, 90)))[None, None, :] * lichen[..., None] * 0.5
    h = 0.6 * (1 - f1) * 0.6 + 0.4 * a + 0.25 * f + 0.2 * strata - 0.9 * joint
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

MATERIALS = {   # name: (generator, tile size in metres — read by the game from assets/materials/index.json)
    'wood': (mat_wood, 1.2), 'fabric': (mat_fabric, 0.45), 'paint': (mat_paint, 1.0), 'metal': (mat_metal, 0.6),
    'laminate': (mat_laminate, 1.0), 'stone': (mat_stone, 1.0), 'plastic': (mat_plastic, 0.5), 'rubber': (mat_rubber, 0.3),
    'concrete': (mat_concrete, 2.0), 'soil': (mat_soil, 0.5), 'leaf': (mat_leaf, 0.3), 'cardboard': (mat_cardboard, 0.6),
    'facade': (mat_facade, 3.2), 'corrugated': (mat_corrugated, 2.4), 'render': (mat_render, 3.0), 'floortile': (mat_floortile, 4.0),
    'asphalt': (mat_asphalt, 6.0), 'pavers': (mat_pavers, 4.0),
    'grass': (mat_grass, 3.0), 'dirt': (mat_dirt, 3.0), 'rock': (mat_rock, 8.0), 'gravel': (mat_gravel, 2.0),
}

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
    for k, v in MATERIALS.items(): index.setdefault(k, {'tile': v[1]})['tile'] = v[1]
    with open(ip, 'w') as f: json.dump(index, f, indent=1)

# ------------------------------------------------------------------ geometry
SLOTS = ['wood', 'fabric', 'paint', 'metal', 'laminate', 'stone', 'plastic', 'rubber', 'concrete', 'soil', 'leaf', 'cardboard', 'screen', 'glass', 'tint', 'glow', 'visor']
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
    for f in bm.faces:                       # box projection in metres (prop frame), so tiles are true to scale
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
        cm = f.calc_center_median(); axis = mathutils.Vector((xc, cm.y, 2.9))
        if (cm - axis).dot(f.normal) < 0: f.normal_flip()
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
            add_box(p, xc - hw, y0_, hz0 - 0.1, dx0, y1_, hz0 + 0.05, 'paint', 0); add_box(p, dx1, y0_, hz0 - 0.1, xc + hw, y1_, hz0 + 0.05, 'paint', 0)
        else: add_box(p, xc - hw, y0_, hz0 - 0.1, xc + hw, y1_, hz0 + 0.05, 'paint', 0)
    for x in (dx0 - 0.08, dx1): add_box(p, x, deck, hz0 - 0.18, x + 0.08, dtop, hz0 - 0.05, 'metal', 0.01)   # door frame
    # cockpit canopy: tinted glass over the nose, above the cockpit
    add_loft(p, [(15.4, 4.3, 0.3, xc, 1.7, 2.6), (16.6, 4.38, 0.48, xc, 2.5, 2.6), (18.4, 4.05, 0.6, xc, 2.6, 2.6), (19.7, 3.4, 0.5, xc, 1.9, 2.4), (20.55, 2.8, 0.12, xc, 0.8, 2)], 'visor', 32, axis='z')
    # dark belly, a pale dorsal stripe, twin tail fins
    add_loft(p, [(hz0 + 0.05, 1.5, 0.32, xc, 2.6, 2.4), (8.0, 1.36, 0.36, xc, 3.0, 2.4), (15.0, 1.38, 0.36, xc, 2.9, 2.4), (18.8, 1.6, 0.3, xc, 2.2, 2.4), (20.2, 2.05, 0.15, xc, 0.9, 2)], 'plastic', 32, axis='z')
    add_loft(p, [(hz0 + 0.05, 4.62, 0.08, xc, 0.55, 2.2), (9.0, 4.85, 0.1, xc, 0.6, 2.2), (14.8, 4.82, 0.1, xc, 0.55, 2.2), (15.5, 4.7, 0.05, xc, 0.3, 2)], 'paint', 20, axis='z')
    for s_ in (-1, 1):
        bm = bmesh.new()
        q = [(xc + s_ * 1.2, 4.55, hz0 + 0.3), (xc + s_ * 1.0, 4.65, hz0 + 3.4), (xc + s_ * 1.9, 6.1, hz0 + 1.5), (xc + s_ * 2.05, 6.15, hz0 + 0.4)]
        bm.faces.new([bm.verts.new(P(*v)) for v in q]); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.1); merge(p, bm, 'paint')
    # wings and engines
    for s_ in (-1, 1):
        root = xc + s_ * 3.0; tip = xc + s_ * 5.0
        bm = bmesh.new()
        pts = [(root, 2.35, 6.0), (root, 2.35, 13.5), (tip, 2.55, 9.0), (tip, 2.55, 6.4)]
        top = [bm.verts.new(P(x, y + 0.12, z)) for (x, y, z) in pts]; bot = [bm.verts.new(P(x, y - 0.12, z)) for (x, y, z) in pts]
        bm.faces.new(top); bm.faces.new(bot[::-1])
        for k in range(4): bm.faces.new([top[k], bot[k], bot[(k + 1) % 4], top[(k + 1) % 4]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, 'paint')
        ex_ = xc + s_ * 4.2
        add_loft(p, [(4.4, 2.5, 0.62, ex_, 0.62, 2), (5.0, 2.5, 0.78, ex_, 0.78, 2), (8.0, 2.5, 0.78, ex_, 0.78, 2), (9.4, 2.5, 0.55, ex_, 0.55, 2), (10.0, 2.5, 0.2, ex_, 0.2, 2)], 'paint', 24, axis='z')
        add_cyl(p, ex_, 2.5, 4.3, 4.42, 0.58, 'glow', 24, axis='z')
        add_cyl(p, ex_, 2.5, 4.25, 4.45, 0.66, 'metal', 24, axis='z', r2=0.64)
    # landing gear: four legs with pads
    for gx in (xc - 2.1, xc + 2.1):
        for gz in (6.6, 16.2):
            add_cyl(p, gx, gz, 0.12, 1.5, 0.09, 'metal', 12)
            add_cyl(p, gx, gz, 0.0, 0.12, 0.38, 'rubber', 20)
            add_box(p, gx - 0.25, 1.25, gz - 0.25, gx + 0.25, 1.45, gz + 0.25, 'paint', 0.02)
    # ---- the interior, exactly the layout
    T = 0.1
    add_box(p, hx0, deck - 0.2, hz0, hx1, deck, hz1, 'metal', 0.01)                               # deck plate
    add_box(p, hx0, ceil, hz0, hx1, ceil + 0.12, hz1, 'paint', 0.01)                              # ceiling
    for z in range(int(hz0) + 1, int(hz1), 2): add_box(p, xc - 0.6, ceil - 0.025, z, xc + 0.6, ceil, z + 0.12, 'glow', 0)   # light strips
    add_box(p, hx0, deck, hz0, hx0 + T, ceil, hz1, 'paint', 0.01); add_box(p, hx1 - T, deck, hz0, hx1, ceil, hz1, 'paint', 0.01)   # side walls
    add_box(p, hx0, deck, hz1 - T, hx1, ceil, hz1, 'paint', 0.01)                                 # forward bulkhead…
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
    B = {'bed': (bed, 2.1, 1.5, 0.55), 'counter': (counter, 1.8, 0.65, 0.92), 'locker': (lambda q, L, D, H, r: cabinet(q, L, D, H, r, 'locker'), 0.9, 0.55, 2.0),
         'crate': (crate, 1.2, 1.2, 1.0), 'rack': (lambda q, L, D, H, r: shelf(q, L, D, H, r, 'rack'), 2.4, 0.8, 2.2), 'chair': (chair, 0.5, 0.5, 0.9), 'console': (console, 3.4, 0.7, 1.0)}
    for pr in lay['props']:
        fn, L, D, H = B[pr['kind']]
        place_in(p, fn, L, D, H, pr, deck)

def shuttle_ramp(p, L_, D_, H_, r, model='shuttle'):
    lay = json.load(open(os.path.join(ROOT, 'assets', 'ships', model + '.json')))
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
        ('speeder', speeder, 2.6, 1.0, 1.05),
        ('streetlamp', streetlamp, 0.6, 1.9, 6.3),
        ('shuttle', shuttle, 10, 21, 5.4), ('shuttle_ramp', shuttle_ramp, 10, 21, 5.4),
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
    out = os.path.join(ROOT, 'assets', 'props.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in made: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_materials='EXPORT',
                              export_extras=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True)
    print('wrote', out, os.path.getsize(out) // 1024, 'KB')

if DO_TEX: build_textures()
if DO_PROPS: build_props()
