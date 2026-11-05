# Families: the things nearly every inhabited world has, written as one function with parameters
# rather than one model. Each is built once per WAY of building (stone, render, timber, concrete,
# tin, brick, prefab) with its own proportions from its own seed: fam_<family>_<way index>. Which of
# them a planet uses comes from its culture (js/gen/designs.js), so two planets' villages differ.
# Writes assets/family.glb and js/gen/familydata.js (footprints: the game reads those, never the mesh).
# Front is -z, as in every kit. A family function returns its solid footprint (half-x, half-z, height), or None.

from mathutils import Vector

WAYS_F = [
    dict(name='stone',    wall='rock',       base='rock',     trim='plank', frame='plank',  roof='slate',      door='plank',  post='plank', deck='wood',     pitch=(0.55, 0.8), kind='gable'),
    dict(name='render',   wall='render',     base='concrete', trim='paint', frame='paint',  roof='rooftile',   door='tint',  post='render', deck='wood',    pitch=(0.35, 0.55), kind='hip'),
    dict(name='timber',   wall='plank',      base='rock',     trim='plank', frame='plank',  roof='thatch',     door='plank',  post='plank', deck='wood',     pitch=(0.8, 1.05), kind='gable'),
    dict(name='concrete', wall='concrete',   base='concrete', trim='metal', frame='metal',  roof='concrete',   door='paint', post='concrete', deck='concrete', pitch=(0, 0), kind='flat'),
    dict(name='tin',      wall='corrugated', base='concrete', trim='metal', frame='metal',  roof='corrugated', door='paint', post='metal', deck='metal',    pitch=(0.22, 0.38), kind='gable'),
    dict(name='brick',    wall='brick',      base='stone',    trim='stone', frame='paint',  roof='rooftile',   door='tint',  post='brick', deck='wood',     pitch=(0.6, 0.85), kind='gable'),
    dict(name='prefab',   wall='hull',       base='metal',    trim='metal', frame='rubber', roof='hull',       door='hazard', post='metal', deck='metal',   pitch=(0.05, 0.14), kind='vault'),
]

def lathe(p, cx, cz, prof, mat, seg=24):
    """A solid of revolution round the y axis through (cx, cz). prof: [(radius, y)...] bottom to top."""
    bm = bmesh.new(); rings = []; a0 = 0.7854 if seg == 4 else 0     # four sides square up with the world
    for r, y in prof:
        if r < 1e-4: rings.append([bm.verts.new(P(cx, y, cz))])
        else: rings.append([bm.verts.new(P(cx + r * math.cos(a0 + k * 6.28318 / seg), y, cz + r * math.sin(a0 + k * 6.28318 / seg))) for k in range(seg)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1: continue
        if len(a) == 1:
            for k in range(seg): bm.faces.new((a[0], b[k], b[(k + 1) % seg]))
        elif len(b) == 1:
            for k in range(seg): bm.faces.new((a[k], a[(k + 1) % seg], b[0]))
        else:
            for k in range(seg): bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    if len(rings[0]) > 1: bm.faces.new(rings[0])
    if len(rings[-1]) > 1: bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    merge(p, bm, mat)

def prism(p, pts, a0, a1, mat, axis='x'):
    """A closed outline extruded. axis 'x': pts are (z, y), run from x=a0 to a1. axis 'z': pts are (x, y), z=a0 to a1."""
    bm = bmesh.new()
    mk = (lambda u, y, a: P(a, y, u)) if axis == 'x' else (lambda u, y, a: P(u, y, a))
    A = [bm.verts.new(mk(u, y, a0)) for u, y in pts]; B = [bm.verts.new(mk(u, y, a1)) for u, y in pts]; n = len(pts)
    bm.faces.new(A); bm.faces.new(B[::-1])
    for k in range(n): bm.faces.new((A[k], A[(k + 1) % n], B[(k + 1) % n], B[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    merge(p, bm, mat)

def slab(p, a, b, x0, x1, t, mat):
    """A plank from (z, y) a to b, t thick (hanging below that line), running x0..x1."""
    dz, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dz, dy) or 1; nz, ny = -dy / L * t, dz / L * t
    if ny > 0: nz, ny = -nz, -ny                  # thickness always hangs downward
    prism(p, [a, b, (b[0] + nz, b[1] + ny), (a[0] + nz, a[1] + ny)], x0, x1, mat, 'x')

def beam(p, x0, y0, z0, x1, y1, z1, r, mat, seg=6):
    """A round bar between two points."""
    tube(p, [Vector((x0, y0, z0)), Vector((x1, y1, z1))], [r, r], mat, seg)

def Fb(p, x, y, z, u, h, v, mat, n='z', bev=0.0):       # a box whose u runs along the wall (n is the wall's normal)
    bx(p, x, y, z, u if n == 'z' else v, h, v if n == 'z' else u, mat, bev)

def win(p, x, z, n, y, w, h, W, side=1):
    """A window on a wall plane: glass, frame, one bar, a sill on the outside (side = which way out is)."""
    ax, az = (0, side * 0.03) if n == 'z' else (side * 0.03, 0)
    Fb(p, x, y, z, w, h, 0.05, 'visor', n)
    for dy in (0, h): Fb(p, x + ax, y + dy - 0.03, z + az, w + 0.1, 0.06, 0.06, W['frame'], n)
    for s in (-1, 1):
        dx, dz = (s * w / 2, 0) if n == 'z' else (0, s * w / 2)
        Fb(p, x + ax + dx, y, z + az + dz, 0.06, h, 0.06, W['frame'], n)
    Fb(p, x + ax, y, z + az, 0.035, h, 0.05, W['frame'], n)
    Fb(p, x + ax * 2.5, y - 0.09, z + az * 2.5, w + 0.2, 0.06, 0.15, W['trim'], n)

def door(p, x, z, n, w, h, W, side=-1):
    ax, az = (0, side * 0.04) if n == 'z' else (side * 0.04, 0)
    Fb(p, x + ax, 0.3, z + az, w, h, 0.05, W['door'], n, 0.006)
    for s in (-1, 1):
        dx, dz = (s * (w / 2 + 0.05), 0) if n == 'z' else (0, s * (w / 2 + 0.05))
        Fb(p, x + ax + dx, 0.3, z + az + dz, 0.1, h + 0.05, 0.1, W['frame'], n)
    Fb(p, x + ax, 0.3 + h, z + az, w + 0.25, 0.1, 0.12, W['frame'], n)
    hx, hz = (w * 0.38, 0) if n == 'z' else (0, w * 0.38)
    ball(p, x + ax * 2 + hx, 1.3, z + az * 2 + hz, 0.03, 'metal')
    Fb(p, x + ax * 8, 0, z + az * 8, w + 0.5, 0.3, 0.7, W['base'], n, 0.015)   # the step

def walls(p, w, h, d, W):
    bx(p, 0, -3.2, 0, w + 0.2, 3.55, d + 0.2, W['base'], 0.02)      # footing: runs into the ground, so a slope doesn't show daylight
    bx(p, 0, 0.3, 0, w, h - 0.3, d, W['wall'], 0.012)
    if W['wall'] in ('plank', 'corrugated', 'hull'):                # corner boards
        for sx in (-1, 1):
            for sz in (-1, 1): bx(p, sx * w / 2, 0.3, sz * d / 2, 0.14, h - 0.3, 0.14, W['trim'])

def roof(p, w, d, y, r, W, over=0.35, rake=0.3):
    """The roof: ridge along x (so a texture's courses run true). → the height of the top."""
    k = W['kind']
    if k == 'flat':
        bx(p, 0, y, 0, w + 0.3, 0.2, d + 0.3, W['roof'], 0.015)
        for s in (-1, 1):
            bx(p, 0, y + 0.2, s * (d / 2 + 0.07), w + 0.3, 0.35, 0.16, W['roof'])
            bx(p, s * (w / 2 + 0.07), y + 0.2, 0, 0.16, 0.35, d + 0.3, W['roof'])
        bx(p, w * 0.2, y + 0.2, d * 0.1, 0.9, 0.5, 0.7, 'metal', 0.015)   # a vent box
        return y + 0.55
    pitch = r.uniform(*W['pitch']); rise = d / 2 * pitch
    if k == 'hip':
        ov, rd = over, max(0.0, (w - d) / 2)
        bm = bmesh.new(); hw, hd = w / 2 + ov, d / 2 + ov; yy = y - ov * pitch; top = y + rise
        c = [bm.verts.new(P(sx * hw, yy, sz * hd)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]; a = bm.verts.new(P(-rd, top, 0)); b = bm.verts.new(P(rd, top, 0))
        bm.faces.new(c); bm.faces.new((c[0], c[1], b, a)); bm.faces.new((c[2], c[3], a, b)); bm.faces.new((c[1], c[2], b)); bm.faces.new((c[3], c[0], a))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, W['roof'])
        return top
    if k == 'vault':                                                 # a low curved shell
        n = 6; pts = [(-d / 2 - over + (d + 2 * over) * i / n, y + 4 * rise * (i / n) * (1 - i / n)) for i in range(n + 1)]
        for a, b in zip(pts, pts[1:]): slab(p, a, b, -w / 2 - rake, w / 2 + rake, 0.14, W['roof'])
        prism(p, [(q[0] * d / (d + 2 * over), q[1]) for q in pts], -w / 2, w / 2, W['wall'], 'x')
        return y + rise
    prism(p, [(-d / 2, y), (d / 2, y), (0, y + rise)], -w / 2, w / 2, W['wall'], 'x')    # the gable ends
    t = 0.32 if W['roof'] == 'thatch' else 0.11
    lift = t * 0.6                                                   # roof sits on the attic, not through it
    for s in (-1, 1):
        slab(p, (0, y + rise + lift), (s * (d / 2 + over), y - over * pitch + lift), -w / 2 - rake, w / 2 + rake, t, W['roof'])
    if W['roof'] != 'thatch':
        for s in (-1, 1):                                            # barge boards at the gables
            for q in (-1, 1): slab(p, (0, y + rise + lift * 0.7), (q * (d / 2 + over), y - over * pitch + lift * 0.7), s * (w / 2 + rake) - 0.03, s * (w / 2 + rake) + 0.03, 0.2, W['trim'])
        rod_x(p, -w / 2 - rake, w / 2 + rake, y + rise + lift, 0, 0.07, W['trim'], 8)
    return y + rise + lift

def chimney(p, x, z, y, W):
    m = 'brick' if W['wall'] in ('brick', 'render') else 'rock' if W['wall'] in ('rock', 'plank') else 'metal'
    if m == 'metal': cy(p, x, z, y - 1.5, y + 0.9, 0.11, 'metal', 10); cy(p, x, z, y + 0.9, y + 1.05, 0.19, 'metal', 10, r2=0.02)
    else: bx(p, x, y - 1.8, z, 0.55, 2.6, 0.55, m, 0.02); bx(p, x, y + 0.8, z, 0.65, 0.1, 0.65, 'stone', 0.01); cy(p, x, z, y + 0.9, y + 1.15, 0.1, 'ceramic', 8)

# ------------------------------------------------------------------ dwellings
def fam_cottage(p, r, W):
    w, d = r.uniform(6.2, 9.5), r.uniform(4.6, 6.2); up = r.random() < 0.3; h = r.uniform(2.6, 3.0) * (1.75 if up else 1)
    walls(p, w, h, d, W); top = roof(p, w, d, h, r, W)
    dx = r.choice((0, -w * 0.2, w * 0.2)); door(p, dx, -d / 2, 'z', 0.95, 2.05, W)
    n = max(2, int(w / 2.4))
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        if abs(x - dx) > 0.95: win(p, x, -d / 2, 'z', 1.0, 0.95, 1.15, W, -1)
        win(p, x, d / 2, 'z', 1.0, 0.8, 1.05, W, 1)
        if up: win(p, x, -d / 2, 'z', h * 0.56 + 0.55, 0.85, 1.0, W, -1)
    for s in (-1, 1): win(p, s * w / 2, 0, 'x', 1.0, 0.8, 1.05, W, s)
    if r.random() < 0.6:                                             # a porch over the door
        y = 2.5; bx(p, dx, y, -d / 2 - 0.65, 1.9, 0.09, 1.4, W['roof'] if W['roof'] != 'thatch' else 'wood', 0.008)
        for s in (-1, 1): cy(p, dx + s * 0.85, -d / 2 - 1.2, 0, y, 0.05, W['post'] if W['post'] != 'render' else 'plank', 8)
    if W['kind'] != 'flat': chimney(p, r.choice((-1, 1)) * w * 0.28, d * 0.12, top, W)
    else: cy(p, -w * 0.3, 0, h, h + 1.2, 0.08, 'metal', 8)
    if W['wall'] != 'plank': cy(p, w / 2 + 0.04, -d / 2 - 0.04, 0.1, h - 0.05, 0.035, 'metal', 8)
    if r.random() < 0.55:                                            # a window box somebody looks after
        bx(p, -w / 2 + 0.5 * w / n, 0.72, -d / 2 - 0.12, 0.95, 0.16, 0.18, 'wood', 0.005); [add_blob(p, -w / 2 + 0.5 * w / n + r.uniform(-0.38, 0.38), 0.93, -d / 2 - 0.12, 0.09, 'leaf', r, 1, 0.9) for q in range(6)]
    return (w / 2, d / 2, h)

def fam_hut(p, r, W):
    R, h = r.uniform(2.2, 3.4), r.uniform(2.1, 2.5); seg = 18
    wm = W['wall'] if W['wall'] not in ('corrugated', 'hull') else ('corrugated' if W['wall'] == 'corrugated' else 'hull')
    lathe(p, 0, 0, [(R + 0.12, -3.2), (R + 0.12, 0.3), (R, 0.32), (R * 0.98, h)], wm, seg)
    if W['kind'] in ('flat', 'vault'):
        prof = [(R * 1.05, h - 0.05)] + [(R * 1.05 * math.cos(a * 0.3), h + R * 0.72 * math.sin(a * 0.3)) for a in range(1, 6)] + [(0, h + R * 0.72)]
        lathe(p, 0, 0, prof, W['roof'], seg); bx(p, 0, h + R * 0.72 - 0.03, 0, 0.4, 0.14, 0.4, 'metal', 0.01); top = h + R * 0.72
    else:
        top = h + R * r.uniform(0.75, 1.0); lathe(p, 0, 0, [(R + 0.55, h - 0.28), (R + 0.5, h - 0.14), (0.14, top), (0, top + 0.05)], W['roof'], seg)
    door(p, 0, -R + 0.02, 'z', 0.9, 1.9, W)
    for s in (-1, 1): win(p, s * R * 0.985, 0, 'x', 1.0, 0.45, 0.6, W, s)
    win(p, 0, R * 0.985, 'z', 1.0, 0.45, 0.6, W, 1)
    return (R, R, h)

def fam_shed(p, r, W):
    w, d, h = r.uniform(3, 5.5), r.uniform(2.4, 3.6), r.uniform(2.1, 2.5)
    walls(p, w, h, d, W); roof(p, w, d, h, r, W, 0.22, 0.2)
    for s in (-0.5, 0.5): door(p, s, -d / 2, 'z', 0.95, 1.8, dict(W, door='plank' if W['wall'] in ('rock', 'plank') else W['door'] if W['door'] != 'tint' else 'paint'))
    win(p, w / 2, 0, 'x', 1.1, 0.6, 0.6, W, 1)
    if r.random() < 0.6: bx(p, -w / 2 - 0.45, 0, 0, 0.7, 1.0, d * 0.8, 'wood', 0.008); [bx(p, -w / 2 - 0.45, 1.0 + 0.0, z, 0.72, 0.03, 0.3, 'corrugated') for z in (-0.4, 0, 0.4)]
    return (w / 2, d / 2, h)

def fam_longhouse(p, r, W):
    w, d, h = r.uniform(13, 19), r.uniform(6.5, 8.5), r.uniform(3.4, 4.2)
    walls(p, w, h, d, W); top = roof(p, w, d, h, r, W, 0.4, 0.4)
    n = int(w / 3.6)
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        if i % 3 == 1: door(p, x, -d / 2, 'z', 2.3, 2.7, dict(W, door='plank' if W['door'] == 'tint' else W['door']))
        else: win(p, x, -d / 2, 'z', 1.5, 1.2, 1.2, W, -1)
        win(p, x, d / 2, 'z', 1.7, 1.0, 1.0, W, 1)
    for x in (-w * 0.25, w * 0.25):
        if W['kind'] != 'flat': bx(p, x, top - 0.1, 0, 1.1, 0.45, 0.8, W['trim'], 0.01); bx(p, x, top + 0.35, 0, 1.4, 0.08, 1.1, W['roof'] if W['roof'] != 'thatch' else 'wood', 0.005)
    return (w / 2, d / 2, h)

def fam_shop(p, r, W):
    w, d, h = r.uniform(6.5, 10), r.uniform(6, 8), r.uniform(3.3, 3.8)
    walls(p, w, h, d, W)
    wT = dict(W, kind='flat' if W['kind'] == 'gable' and r.random() < 0.4 else W['kind']); roof(p, w, d, h, r, wT)
    door(p, 0, -d / 2, 'z', 1.15, 2.15, W)
    for s in (-1, 1):
        x = s * (w / 4 + 0.35); gw = w / 2 - 1.6
        Fb(p, x, 0.55, -d / 2, gw, 1.85, 0.05, 'visor'); [Fb(p, x + q * gw / 2, 0.55, -d / 2 - 0.03, 0.08, 1.85, 0.07, W['frame']) for q in (-1, 0, 1)]
        for y in (0.55, 2.4): Fb(p, x, y - 0.04, -d / 2 - 0.03, gw + 0.1, 0.08, 0.07, W['frame'])
        Fb(p, x, 0.3, -d / 2 - 0.02, gw + 0.1, 0.25, 0.05, W['trim'])
    bx(p, 0, 2.85, -d / 2 - 0.06, w * 0.82, 0.55, 0.08, 'tint', 0.01)     # the signboard
    z0, y0 = -d / 2, 2.72
    prism(p, [(z0, y0), (z0 - 1.5, y0 - 0.5), (z0 - 1.5, y0 - 0.58), (z0, y0 - 0.1)], -w * 0.42, w * 0.42, 'tint', 'x')     # awning
    bx(p, -w * 0.3, 0, -d / 2 - 0.7, 0.7, 0.8, 0.5, 'wood', 0.01)
    return (w / 2, d / 2, h)

# ------------------------------------------------------------------ the common ground
def fam_shrine(p, r, W):
    R = r.uniform(2.4, 3.8); n = r.choice((4, 6, 8)); h = r.uniform(3.0, 4.2); m = W['post'] if W['post'] not in ('corrugated',) else 'metal'; sm = 'stone' if W['base'] in ('rock', 'stone') else W['base']
    for i in range(3): lathe(p, 0, 0, [(R + 1.1 - i * 0.4, -1.2 + (i and 1.2 + (i - 1) * 0.28)), (R + 1.1 - i * 0.4, (i + 1) * 0.28)], sm, n * 2 if n > 4 else 8)
    y0 = 0.84
    for k in range(n):
        a = (k + 0.5) * 6.28318 / n; x, z = R * math.cos(a), R * math.sin(a)
        lathe(p, x, z, [(0.26, y0), (0.26, y0 + 0.18), (0.17, y0 + 0.3), (0.14, y0 + h - 0.3), (0.24, y0 + h - 0.08), (0.24, y0 + h)], m, 10)
    y = y0 + h
    lathe(p, 0, 0, [(R + 0.5, y), (R + 0.5, y + 0.28)], W['trim'] if W['trim'] != 'paint' else 'stone', n * 2 if n > 4 else 8)
    if W['kind'] in ('flat', 'vault'): lathe(p, 0, 0, [(R + 0.4, y + 0.28)] + [(R * math.cos(q * 0.26) + 0.1, y + 0.28 + R * 0.8 * math.sin(q * 0.26)) for q in range(1, 7)] + [(0, y + 0.28 + R * 0.8)], W['roof'], 24)
    else: lathe(p, 0, 0, [(R + 0.75, y + 0.2), (0.1, y + R * 0.95), (0, y + R)], W['roof'], n * 2 if n > 4 else 4)
    lathe(p, 0, 0, [(0.5, y0), (0.5, y0 + 0.9), (0.62, y0 + 1.0), (0, y0 + 1.02)], 'stone', 16)    # an altar, or a plinth for what they keep on it
    k = r.randrange(3)
    if k == 0: ball(p, 0, y0 + 1.3, 0, 0.3, 'metal', 3)
    elif k == 1: bx(p, 0, y0 + 1.02, 0, 0.2, 0.9, 0.12, 'tint', 0.01)
    else: lathe(p, 0, 0, [(0.2, y0 + 1.02), (0.08, y0 + 1.2), (0.26, y0 + 1.5), (0.22, y0 + 1.5)], 'ceramic', 14)
    return (R + 1, R + 1, 0.8)

def fam_monument(p, r, W, i=0):
    sm = W['wall'] if W['wall'] in ('rock', 'concrete', 'brick') else 'stone'
    for q in range(3): bx(p, 0, -1.2 if q == 0 else (q * 0.35 - 0.35), 0, 7 - q * 1.5, (1.55 if q == 0 else 0.35), 7 - q * 1.5, 'stone' if q % 2 else sm, 0.015)
    y = 0.7; k = [w['name'] for w in WAYS_F].index(W['name']) % 5
    if k == 0:
        h = r.uniform(10, 18); lathe(p, 0, 0, [(1.05, y), (0.5, y + h), (0, y + h + 0.9)], sm, 4)
    elif k == 1:
        h = r.uniform(5, 8); s = r.uniform(1.8, 2.6)
        for q in (-1, 1): bx(p, q * s, y, 0, 1.1, h, 1.3, sm, 0.02)
        pts = [(s * math.cos(a * 0.31416), y + h + s * 0.8 * math.sin(a * 0.31416)) for a in range(11)]
        for a, b in zip(pts, pts[1:]): prism(p, [a, b, (b[0] * 1.5, b[1] + 0.8), (a[0] * 1.5, a[1] + 0.8)], -0.65, 0.65, sm, 'z')
    elif k == 2:
        h = r.uniform(4, 7); lathe(p, 0, 0, [(0.9, y), (0.65, y + 0.5), (0.5, y + h), (0.8, y + h + 0.2)], sm, 18); ball(p, 0, y + h + 1.2, 0, 1.05, 'metal', 3)
    elif k == 3:
        R = r.uniform(3, 4.5); n = 24
        for q in range(n):
            a0, a1 = q * 6.28318 / n, (q + 1) * 6.28318 / n
            prism(p, [(R * math.cos(a0), y + R + R * math.sin(a0)), (R * math.cos(a1), y + R + R * math.sin(a1)), (R * 0.82 * math.cos(a1), y + R + R * 0.82 * math.sin(a1)), (R * 0.82 * math.cos(a0), y + R + R * 0.82 * math.sin(a0))], -0.3, 0.3, 'metal', 'z')
    else:
        for q in range(5):
            a = q * 1.2566; h = r.uniform(4, 9); bx(p, 1.1 * math.cos(a), y, 1.1 * math.sin(a), 0.7, h, 0.7, sm if q % 2 else 'stone', 0.02)
    return (3.5, 3.5, 0.7)

def fam_fountain(p, r, W):
    R = r.uniform(2.2, 3.6); seg = r.choice((8, 12, 28)); m = W['base'] if W['base'] != 'metal' else 'stone'
    lathe(p, 0, 0, [(R + 0.05, -1), (R + 0.05, 0.5), (R + 0.18, 0.56), (R - 0.22, 0.56), (R - 0.3, 0.18), (0, 0.18)], m, seg)
    lathe(p, 0, 0, [(R - 0.28, 0.4), (0, 0.4)], 'visor', seg)                    # the water
    h = r.uniform(1.4, 2.4); lathe(p, 0, 0, [(0.45, 0.35), (0.25, 0.7), (0.18, h)], m, 16)
    R2 = R * r.uniform(0.35, 0.5); lathe(p, 0, 0, [(0.18, h), (R2, h + 0.3), (R2 + 0.05, h + 0.38), (R2 - 0.1, h + 0.38), (0, h + 0.24)], m, 20); lathe(p, 0, 0, [(R2 - 0.1, h + 0.33), (0, h + 0.33)], 'visor', 20)
    if r.random() < 0.6: lathe(p, 0, 0, [(0.14, h + 0.3), (0.09, h + 0.9), (0.2, h + 1.1), (0.06, h + 1.3), (0, h + 1.4)], 'metal', 12)
    return (R, R, 0.56)

def fam_villagewell(p, r, W):
    m = W['wall'] if W['wall'] in ('rock', 'brick', 'concrete') else 'rock'; R = r.uniform(0.75, 1.0)
    lathe(p, 0, 0, [(R, -1), (R, 0.82), (R - 0.18, 0.82), (R - 0.18, 0.2), (0, 0.2)], m, 16); lathe(p, 0, 0, [(R - 0.17, 0.22), (0, 0.22)], 'visor', 16)
    wm = 'wood' if W['post'] in ('plank', 'render', 'brick', 'concrete') else 'metal'; h = r.uniform(2.1, 2.5)
    for s in (-1, 1): bx(p, s * (R + 0.08), 0, 0, 0.14, h, 0.14, wm, 0.006)
    rod_x(p, -R - 0.05, R + 0.05, 1.7, 0, 0.055, wm, 10); cy(p, 0, 0, 0.9, 1.7, 0.008, 'rubber', 6); lathe(p, 0, 0, [(0.12, 0.72), (0.15, 0.95), (0.135, 0.95), (0.11, 0.75)], 'metal', 10)
    for s in (-1, 1): slab(p, (0, h + 0.5), (s * (R + 0.45), h - 0.08), -R - 0.25, R + 0.25, 0.07, 'wood' if W['roof'] == 'thatch' else W['roof'])
    return (R, R, 1)

def fam_watertower(p, r, W):
    h = r.uniform(8, 15); R = r.uniform(1.8, 3.2); n = r.choice((3, 4, 6)); m = 'wood' if W['post'] == 'plank' else 'metal'
    for k in range(n):
        a = (k + 0.5) * 6.28318 / n; c, s = math.cos(a), math.sin(a)
        beam(p, c * R * 1.3, 0, s * R * 1.3, c * R * 0.82, h, s * R * 0.82, 0.09, m, 8); bx(p, c * R * 1.3, -0.7, s * R * 1.3, 0.7, 0.9, 0.7, 'concrete', 0.01)
        c2, s2 = math.cos(a + 6.28318 / n), math.sin(a + 6.28318 / n)
        for f in (0.33, 0.66):
            q = R * (1.3 - 0.48 * f); beam(p, c * q, h * f, s * q, c2 * q, h * f, s2 * q, 0.035, m, 6)
    cy(p, 0, 0, 0, h, 0.14, 'metal', 10)
    k = W['name']
    if k in ('stone', 'timber'):
        lathe(p, 0, 0, [(R, h), (R * 1.03, h + R * 0.75), (R, h + R * 1.5), (R * 1.08, h + R * 1.52), (0.08, h + R * 2.05), (0, h + R * 2.1)], 'plank', 18)
        for y in (0.3, 0.75, 1.2): lathe(p, 0, 0, [(R * 1.05, h + R * y), (R * 1.05, h + R * y + 0.07)], 'metal', 18)
    elif k in ('render', 'prefab'):
        pts = [(R * 1.1 * math.sin(a * 0.3142), h + R * 1.0 - R * 1.0 * math.cos(a * 0.3142)) for a in range(11)]; lathe(p, 0, 0, [(0, pts[0][1])] + pts[1:-1] + [(0, pts[-1][1])], 'paint', 22)
    else:
        lathe(p, 0, 0, [(0.2, h - 0.1), (R, h + R * 0.45), (R, h + R * 1.4), (R * 0.15, h + R * 1.75), (0, h + R * 1.8)], 'tint' if k == 'brick' else 'concrete' if k == 'concrete' else 'corrugated', 20)
    for i in range(int(h / 0.45)): bx(p, 0, i * 0.45, -0.3, 0.42, 0.03, 0.03, 'metal')
    for s in (-0.21, 0.21): bx(p, s, 0, -0.3, 0.04, h, 0.04, 'metal')
    return (R * 1.3, R * 1.3, 8)

def fam_windpump(p, r, W):
    h = r.uniform(8, 13); m = 'wood' if W['post'] == 'plank' else 'metal'; lattice(p, h, r.uniform(1.0, 1.5), m, 2.2)
    R = r.uniform(1.3, 2.0); n = r.choice((8, 12, 18)); y = h + 0.5; z = -0.5
    bx(p, 0, h - 0.08, 0, 0.5, 0.8, 0.7, 'metal', 0.015)
    rod_z(p, z, 0.2, 0, y, 0.05, 'metal', 8)
    for k in range(n):
        a = k * 6.28318 / n; c, s = math.cos(a), math.sin(a); a2 = a + 0.28; c2, s2 = math.cos(a2), math.sin(a2)
        prism(p, [(c * R * 0.3, y + s * R * 0.3), (c * R, y + s * R), (c2 * R, y + s2 * R)], z - 0.012, z + 0.012, 'paint' if k % 2 else 'metal', 'z')
    bx(p, 0, y - 0.02, 1.1, 0.02, 0.05, 1.8, 'metal'); prism(p, [(1.4, y - 0.05), (2.3, y - 0.42), (2.3, y + 0.42), (1.4, y + 0.05)], -0.012, 0.012, 'tint', 'x')
    bx(p, 0.75, 0, -0.75, 1.0, 0.8, 1.0, 'concrete', 0.015); lathe(p, 1.9, 0.9, [(0.95, -0.5), (0.95, 0.95), (0.88, 0.95), (0.88, 0.2), (0, 0.2)], 'metal', 20)
    return (1.5, 1.5, 6)

def fam_footbridge(p, r, W):
    L, B = r.uniform(9, 15), r.uniform(1.6, 2.6); rise = r.uniform(0.7, 1.8); n = 12; deck = W['deck']
    y = lambda x: rise * (1 - (2 * x / L) ** 2)
    for i in range(n):
        x0, x1 = -L / 2 + i * L / n, -L / 2 + (i + 1) * L / n
        prism(p, [(x0, y(x0)), (x1, y(x1)), (x1, y(x1) - 0.14), (x0, y(x0) - 0.14)], -B / 2, B / 2, deck, 'z')
    for s in (-1, 1):
        for i in range(n):
            x0, x1 = -L / 2 + i * L / n, -L / 2 + (i + 1) * L / n
            prism(p, [(x0, y(x0) - 0.14), (x1, y(x1) - 0.14), (x1, y(x1) - 0.42), (x0, y(x0) - 0.42)], s * B * 0.42 - 0.07, s * B * 0.42 + 0.07, 'metal' if deck != 'wood' else 'wood', 'z')
            beam(p, x0, y(x0) + 1.0, s * B / 2, x1, y(x1) + 1.0, s * B / 2, 0.035, 'metal' if deck != 'wood' else 'wood', 6)
            cy(p, x0, s * B / 2, y(x0) - 0.05, y(x0) + 1.0, 0.03, 'metal' if deck != 'wood' else 'wood', 6)
        cy(p, L / 2, s * B / 2, y(L / 2) - 0.05, y(L / 2) + 1.0, 0.03, 'metal' if deck != 'wood' else 'wood', 6)
    for s in (-1, 1): bx(p, s * L / 2, -1.5, 0, 1.2, 1.5, B + 0.8, W['base'], 0.02)
    return None

def fam_jetty(p, r, W):
    L, B = r.uniform(12, 24), r.uniform(1.8, 3.0); deck = W['deck'] if W['deck'] != 'metal' else 'wood'
    for i in range(int(L / 0.32)): bx(p, 0, 1.2, -L / 2 + (i + 0.5) * 0.32, B, 0.07, 0.29, deck if deck != 'concrete' else 'concrete')
    for s in (-1, 1):
        bx(p, s * B * 0.42, 1.03, 0, 0.14, 0.17, L, 'wood' if deck != 'concrete' else 'metal')
        for i in range(int(L / 3.2) + 1):
            z = -L / 2 + i * 3.2; cy(p, s * B * 0.5, z, -3.5, 1.75, 0.13, 'wood' if deck != 'concrete' else 'concrete', 10)
    for s in (-1, 1): cy(p, s * B * 0.42, L * 0.45, 1.27, 1.55, 0.09, 'metal', 10); lathe(p, s * B * 0.42, L * 0.45, [(0.09, 1.55), (0.14, 1.6), (0, 1.63)], 'metal', 10)
    if r.random() < 0.6: cy(p, B * 0.45, -L * 0.2, 1.2, 4.2, 0.05, 'metal', 8); ball(p, B * 0.45, 4.3, -L * 0.2, 0.15, 'lampwarm')
    for k in range(3): add_cyl(p, -B * 0.25 + k * 0.5, L * 0.3 + (k % 2) * 0.5, 1.27, 1.85, 0.27, 'tint' if k == 1 else 'wood', seg=14)
    return None

def beam_at(B, t): return B / 2 * (math.sin(min(1, t * 1.25 + 0.02) * 1.5708) ** 0.75) * (1 - 0.18 * max(0, t - 0.7))   # half width of a hull, t from bow to stern
def hull_(p, L, B, D, mat, flat=0.25):
    """A boat's skin: lofted sections, open at the top; bow at -z."""
    n = 10; sec = []
    bm = bmesh.new()
    for i in range(n + 1):
        t = i / n; z = -L / 2 + L * t; bw = beam_at(B, t); rise = D * (0.16 * (1 - t) ** 3 * 5)
        sec.append([bm.verts.new(P(x * bw, y * D + rise * (1 if y > 0.9 else 0.6), z + (0.25 * L * (1 - t) ** 3 * (1 - y)))) for x, y in ((-1, 1), (-0.82, 0.55), (-0.32, 0.08), (0, 0), (0.32, 0.08), (0.82, 0.55), (1, 1))])
    for a, b in zip(sec, sec[1:]):
        for k in range(6): bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
    bm.faces.new(sec[0]); bm.faces.new(sec[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def fam_boat(p, r, W):
    big = r.random() < 0.55; L, B, D = (r.uniform(8, 12), r.uniform(2.6, 3.4), r.uniform(1.2, 1.6)) if big else (r.uniform(3.8, 5.6), r.uniform(1.3, 1.7), r.uniform(0.5, 0.7))
    hm = 'plank' if W['deck'] == 'wood' else 'paint' if W['name'] == 'concrete' else 'hull'
    hull_(p, L, B, D, hm)
    ts = [0.2 + 0.78 * q / 8 for q in range(9)]; bm = bmesh.new()       # the deck, inside the hull at that height
    edge = [(beam_at(B, t) * 0.88, -L / 2 + L * t) for t in ts]
    top = [bm.verts.new(P(s * x, D * 0.8, z)) for s, seq in ((-1, edge), (1, edge[::-1])) for x, z in seq]
    bm.faces.new(top); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, 'wood' if hm == 'plank' else 'metal')
    if big:
        c = r.uniform(0.05, 0.22) * L; w, d, h = B * 0.6, L * 0.24, 1.7
        bx(p, 0, D * 0.8, c, w, h, d, 'paint', 0.03); bx(p, 0, D * 0.8 + h, c, w + 0.25, 0.09, d + 0.35, W['trim'] if W['trim'] != 'wood' else 'wood', 0.01)
        for s in (-1, 1): Fb(p, 0, D * 0.8 + 1.0, c + s * d / 2, w * 0.82, 0.5, 0.04, 'visor')
        cy(p, 0, -L * 0.1, D * 0.8, D + 5.0, 0.06, 'wood' if hm == 'plank' else 'metal', 8); rod_z(p, -L * 0.1 - 0.02, L * 0.08, 0, D + 3.4, 0.04, 'metal', 6)
        beam(p, 0, D + 5, -L * 0.1, 0, D * 1.0, -L * 0.42, 0.012, 'rubber', 5); lumps(p, 5, B * 0.2, D * 0.82, 0.3, ['tint', 'rubber'], 'net%d' % r.randrange(9), 0.5)
        for s in (-1, 1): add_cyl(p, s * B * 0.5, c * 0.5, D * 0.52, D * 0.86, 0.09, 'rubber', seg=10)
    else:
        for q in (-0.2, 0.05, 0.3): bx(p, 0, D * 0.62, q * L, B * 0.82, 0.04, 0.22, 'wood')
        for s in (-1, 1): beam(p, s * 0.1, D * 0.68, 0.05 * L, s * B * 0.62, D * 0.25, 0.28 * L, 0.018, 'wood', 6)
    return None

def fam_graves(p, r, W):
    n = r.randrange(8, 15); wm = W['wall'] if W['wall'] in ('rock', 'brick', 'concrete') else 'stone'; style = r.randrange(3)
    for i in range(n):
        x, z = (i % 4 - 1.5) * 2.4 + r.uniform(-0.1, 0.1), (i // 4 - 1.5) * 3.2 + r.uniform(-0.15, 0.15); tilt = r.uniform(0.75, 1.1)
        if style == 0: bx(p, x, -0.2, z, 0.55, 1.0 * tilt, 0.13, 'stone', 0.03); lathe(p, x, z, [(0.27, 0.8 * tilt - 0.01), (0, 0.8 * tilt + 0.26)], 'stone', 10)
        elif style == 1: bx(p, x, -0.2, z, 0.1, 1.4 * tilt, 0.1, wm, 0.006); bx(p, x, 0.75 * tilt, z, 0.62, 0.1, 0.09, wm, 0.006)
        else: add_cyl(p, x, z, -0.2, 1.1 * tilt, 0.17, 'stone', seg=6, r2=0.06)
        bx(p, x, -0.1, z + 0.9, 0.85, 0.2, 1.6, 'soil', 0.05)
    for s in (-1, 1):
        for q in range(5): bx(p, s * 5.8, 0, -5 + q * 2.5, 0.12, 1.05, 0.12, W['post'] if W['post'] not in ('render', 'brick') else 'metal', 0.005)
        bx(p, s * 5.8, 0.82, 0, 0.06, 0.06, 10, 'metal'); bx(p, s * 5.8, 0.4, 0, 0.06, 0.06, 10, 'metal')
    bx(p, 0, 0.82, 5, 11.6, 0.06, 0.06, 'metal'); bx(p, 0, 0.4, 5, 11.6, 0.06, 0.06, 'metal')
    return None

def fam_pavilion(p, r, W):
    R, h = r.uniform(3.0, 5.0), r.uniform(2.6, 3.2); n = r.choice((6, 8)); m = 'wood' if W['post'] in ('plank', 'render', 'brick') else W['post'] if W['post'] != 'concrete' else 'metal'
    lathe(p, 0, 0, [(R + 0.3, -1.2), (R + 0.3, 0.4)], W['base'], n); lathe(p, 0, 0, [(R + 0.15, 0.4), (R + 0.15, 0.46)], W['deck'] if W['deck'] != 'concrete' else 'concrete', n)
    pt = [(R * math.cos(k * 6.28318 / n), R * math.sin(k * 6.28318 / n)) for k in range(n)]
    for k, (x, z) in enumerate(pt):
        cy(p, x, z, 0.46, h + 0.46, 0.09, m, 10); x2, z2 = pt[(k + 1) % n]
        if k != 0: beam(p, x, 1.25, z, x2, 1.25, z2, 0.035, m, 6); [cy(p, x + (x2 - x) * f, z + (z2 - z) * f, 0.46, 1.25, 0.014, m, 5) for f in (0.2, 0.4, 0.6, 0.8)]
        beam(p, x, h + 0.42, z, x2, h + 0.42, z2, 0.05, m, 6)
    rf = W['roof'] if W['kind'] != 'flat' else 'metal'
    lathe(p, 0, 0, [(R + 0.7, h + 0.4), (R + 0.7, h + 0.47), (0.15, h + 0.47 + R * 0.5), (0, h + 0.47 + R * 0.56)], rf, n)
    return (R, R, 0.46)

def fam_picnic(p, r, W):
    m = W['deck'] if W['deck'] != 'metal' else 'plastic'; L = r.uniform(1.6, 2.4)
    for q in range(4): bx(p, 0, 0.74, -0.42 + q * 0.28, L, 0.05, 0.25, m, 0.006)
    for s in (-1, 1): bx(p, 0, 0.42, s * 0.95, L, 0.05, 0.32, m, 0.006)
    for s in (-1, 1):
        beam(p, s * L * 0.35, 0, -0.8, s * L * 0.35, 0.74, 0.2, 0.035, 'metal' if m != 'wood' else 'wood', 6); beam(p, s * L * 0.35, 0, 0.8, s * L * 0.35, 0.74, -0.2, 0.035, 'metal' if m != 'wood' else 'wood', 6)
        bx(p, s * L * 0.35, 0.38, 0, 0.06, 0.05, 2.1, 'metal' if m != 'wood' else 'wood')
    return None

def fam_swings(p, r, W):
    L = r.uniform(3.2, 4.8); h = r.uniform(2.3, 2.7); m = 'wood' if W['post'] == 'plank' else 'metal'
    for s in (-1, 1):
        for q in (-1, 1): beam(p, s * L / 2, 0, q * 0.9, s * L / 2, h, 0, 0.05, m, 8)
    rod_x(p, -L / 2 - 0.1, L / 2 + 0.1, h, 0, 0.05, m, 8)
    for x in (-L * 0.25, L * 0.25):
        for s in (-1, 1): cy(p, x + s * 0.22, 0, 0.5, h, 0.008, 'rubber', 5)
        bx(p, x, 0.48, 0, 0.5, 0.03, 0.18, 'tint', 0.006)
    x = L / 2 + 1.8                                                  # a slide
    for i in range(6): bx(p, x, 0.25 + i * 0.28, -0.7, 0.42, 0.03, 0.05, 'metal')
    for s in (-1, 1): beam(p, x + s * 0.22, 0, -0.75, x + s * 0.22, 1.8, -0.55, 0.03, 'metal', 6)
    bx(p, x, 1.6, -0.2, 0.6, 0.05, 0.7, 'tint', 0.006)
    prism(p, [(0.15, 1.65), (2.6, 0.2), (2.6, 0.15), (0.15, 1.6)], x - 0.24, x + 0.24, 'metal', 'x')
    for s in (-1, 1): prism(p, [(0.15, 1.8), (2.6, 0.32), (2.6, 0.15), (0.15, 1.6)], x + s * 0.24 - 0.012, x + s * 0.24 + 0.012, 'tint', 'x')
    for s in (-1, 1): beam(p, x + s * 0.3, 0, 0.05, x + s * 0.3, 1.6, 0.05, 0.03, 'metal', 6)
    return None

def fam_gate(p, r, W):
    S = r.uniform(4.2, 7); h = r.uniform(3.6, 5.2); m = W['post']
    for s in (-1, 1):
        if m in ('plank', 'metal'): cy(p, s * S / 2, 0, -0.8, h, r.uniform(0.17, 0.22), m, 12); bx(p, s * S / 2, -0.8, 0, 0.8, 1.0, 0.8, 'rock' if m == 'plank' else 'concrete', 0.015)
        else: bx(p, s * S / 2, -0.8, 0, 0.75, h + 0.8, 0.75, m if m != 'render' else 'stone', 0.015); lathe(p, s * S / 2, 0, [(0.5, h), (0.5, h + 0.12), (0, h + 0.5)], W['trim'] if W['trim'] != 'paint' else 'stone', 4)
    if m in ('plank', 'metal'): rod_x(p, -S / 2 - 0.9, S / 2 + 0.9, h - 0.25, 0, 0.15, m, 10); rod_x(p, -S / 2 - 0.2, S / 2 + 0.2, h - 1.05, 0, 0.09, m, 8); bx(p, 0, h - 1.0, 0, 0.14, 0.75, 0.12, m, 0.006)
    else:
        y = h - 0.6; bx(p, 0, y, 0, S, 0.42, 0.55, m if m != 'render' else 'stone', 0.012); bx(p, 0, y + 0.42, 0, S + 0.2, 0.12, 0.7, W['trim'] if W['trim'] != 'paint' else 'stone', 0.01)
    bx(p, 0, h - 0.9 if m not in ('plank', 'metal') else h - 0.85, -0.2, S * 0.3, 0.32, 0.05, 'tint', 0.006)
    return None

def fam_cart(p, r, W):
    L, B = r.uniform(2.2, 3.4), r.uniform(1.2, 1.6); m = 'wood' if W['deck'] == 'wood' else 'metal'; Rw = r.uniform(0.34, 0.55)
    y = Rw + 0.08
    bx(p, 0, y, 0, B, 0.07, L, m, 0.006)
    for s in (-1, 1): bx(p, s * B / 2, y, 0, 0.05, 0.42, L, m, 0.004); [bx(p, s * B / 2, y, q, 0.07, 0.48, 0.07, m, 0.004) for q in (-L * 0.45, 0, L * 0.45)]
    for s in (-1, 1): bx(p, 0, y, s * L / 2, B, 0.42, 0.05, m, 0.004)
    for s in (-1, 1):
        rod_x(p, s * (B / 2 + 0.05), s * (B / 2 + 0.18), Rw, L * 0.1, Rw, 'wood' if m == 'wood' else 'rubber', 18); rod_x(p, s * (B / 2 + 0.03), s * (B / 2 + 0.2), Rw, L * 0.1, Rw * 0.25, 'metal', 10)
        beam(p, s * B * 0.35, y, -L * 0.45, s * 0.1, y * 0.85, -L * 0.45 - 1.4, 0.04, m, 6)
    rod_x(p, -B / 2, B / 2, Rw, L * 0.1, 0.04, 'metal', 8)
    lumps(p, 5, B * 0.3, y + 0.12, 0.2, [r.choice(('cardboard', 'tint', 'soil'))], 'load%d' % r.randrange(9), 0.75)
    return None

def fam_lamp(p, r, W):
    h = r.uniform(3, 4.6); m = 'wood' if W['post'] == 'plank' else 'metal'
    if m == 'wood': cy(p, 0, 0, 0, h, 0.07, 'wood', 10)
    else: lathe(p, 0, 0, [(0.16, 0), (0.16, 0.2), (0.07, 0.5), (0.045, h)], 'metal', 10)
    k = r.randrange(3); a = r.uniform(0.3, 0.7)
    if k == 0: bx(p, 0, h - 0.16, -a / 2, 0.05, 0.05, a, m); lathe(p, 0, -a, [(0.17, h - 0.33), (0.2, h - 0.25), (0.06, h - 0.14), (0, h - 0.13)], 'metal', 10); ball(p, 0, h - 0.3, -a, 0.08, 'lampwarm')
    elif k == 1: lathe(p, 0, 0, [(0.05, h), (0.2, h + 0.1), (0.2, h + 0.42), (0.26, h + 0.44), (0, h + 0.62)], 'metal', 4); ball(p, 0, h + 0.27, 0, 0.11, 'lampwarm')
    else: cy(p, 0, 0, h, h + 0.32, 0.1, 'lampwarm', 10); lathe(p, 0, 0, [(0.2, h + 0.32), (0.02, h + 0.48), (0, h + 0.5)], 'metal', 10)
    return None

def fam_bench(p, r, W):
    L = r.uniform(1.4, 2.2); m = W['deck'] if W['deck'] != 'metal' else 'plastic'
    if W['name'] in ('stone', 'concrete'):
        sm = 'stone' if W['name'] == 'stone' else 'concrete'; bx(p, 0, 0.36, 0, L, 0.1, 0.48, sm, 0.02)
        for s in (-1, 1): bx(p, s * L * 0.36, 0, 0, 0.18, 0.38, 0.42, sm, 0.012)
        return None
    for q in range(3): bx(p, 0, 0.42, -0.14 + q * 0.14, L, 0.035, 0.12, m, 0.005)
    for q in range(2): bx(p, 0, 0.62 + q * 0.15, 0.27 + q * 0.02, L, 0.1, 0.03, m, 0.005)
    for s in (-1, 1): bx(p, s * L * 0.4, 0, -0.1, 0.05, 0.42, 0.05, 'metal' if m != 'wood' else 'wood', 0.004); beam(p, s * L * 0.4, 0, 0.22, s * L * 0.4, 0.86, 0.3, 0.025, 'metal' if m != 'wood' else 'wood', 6)
    return None

# ------------------------------------------------------------------ what industry builds, wherever it is
def fam_coolingtower(p, r, W):
    R, h = r.uniform(11, 18), r.uniform(34, 52); w = r.uniform(0.62, 0.74)
    prof = [(R, 3.2)] + [(R * (w + (1 - w) * ((y - 0.72) / 0.72) ** 2), 3.2 + (h - 3.2) * y) for y in [q / 9 for q in range(1, 10)]]
    lathe(p, 0, 0, prof + [(a * 0.96, b) for a, b in reversed(prof)], 'concrete', 40)
    for k in range(20):
        a = k * 0.31416; c, s = math.cos(a), math.sin(a); c2, s2 = math.cos(a + 0.16), math.sin(a + 0.16)
        beam(p, c * R * 1.02, 0, s * R * 1.02, c2 * R * 0.98, 3.3, s2 * R * 0.98, 0.25, 'concrete', 6)
        beam(p, c2 * R * 1.02, 0, s2 * R * 1.02, c * R * 0.98, 3.3, s * R * 0.98, 0.25, 'concrete', 6)
    lathe(p, 0, 0, [(R * 0.95, 0.15), (0, 0.15)], 'visor', 32)
    return (R, R, 12)

def fam_column(p, r, W):
    h, R = r.uniform(18, 34), r.uniform(1.1, 2.0)
    lathe(p, 0, 0, [(R + 0.5, 0), (R + 0.5, 0.8), (R, 1.0), (R, h), (R * 0.9, h + R * 0.4), (0.25, h + R * 0.8), (0.25, h + R * 1.4)], 'tint' if W['name'] in ('brick', 'render') else 'metal', 18)
    for y in range(4, int(h), 5):
        lathe(p, 0, 0, [(R + 0.6, y), (R + 0.6, y + 0.04)], 'metal', 18)
        lathe(p, 0, 0, [(R + 0.06, y - 0.5), (R + 0.06, y + 0.1)], 'metal', 18)
    for i in range(int(h / 0.45)): bx(p, 0, i * 0.45, -R - 0.3, 0.42, 0.03, 0.03, 'metal')
    for s in (-0.21, 0.21): bx(p, s, 0, -R - 0.3, 0.04, h, 0.04, 'metal')
    for y in (h * 0.3, h * 0.65):
        tube(p, [Vector(q) for q in ((R, y, 0), (R + 1.5, y, 0), (R + 1.5, 1.2, 0), (R + 5, 1.2, 0))], [0.22, 0.22, 0.22, 0.22], 'metal', 8)
    bx(p, R + 5.3, 0, 0, 1.2, 1.6, 2.2, 'paint', 0.02); cy(p, R + 1.5, 0, 0, 1.2, 0.14, 'metal', 8)
    return (R + 0.5, R + 0.5, 12)

def fam_spheretank(p, r, W):
    R = r.uniform(4.5, 8); yc = R * 1.45; pts = [(R * math.sin(a * 0.2618), yc - R * math.cos(a * 0.2618)) for a in range(13)]
    lathe(p, 0, 0, [(0, pts[0][1])] + pts[1:-1] + [(0, pts[-1][1])], 'paint' if W['name'] in ('render', 'stone') else 'tint' if W['name'] == 'brick' else 'metal', 26)
    n = 8
    for k in range(n):
        a = k * 6.28318 / n; c, s = math.cos(a), math.sin(a); cy(p, c * R * 0.82, s * R * 0.82, 0, yc, 0.2, 'metal', 10); bx(p, c * R * 0.82, -0.6, s * R * 0.82, 0.8, 0.8, 0.8, 'concrete', 0.012)
        a2 = a + 6.28318 / n; beam(p, c * R * 0.82, 0.3, s * R * 0.82, math.cos(a2) * R * 0.82, yc * 0.72, math.sin(a2) * R * 0.82, 0.05, 'metal', 6)
    lathe(p, 0, 0, [(R * 1.02, yc - 0.1), (R * 1.02, yc + 0.1)], 'metal', 26)
    lathe(p, 0, 0, [(1.1, yc + R - 0.1), (1.1, yc + R + 0.45)], 'metal', 16); [cy(p, 1.1 * math.cos(k * 0.785), 1.1 * math.sin(k * 0.785), yc + R + 0.45, yc + R + 1.3, 0.025, 'metal', 5) for k in range(8)]
    return (R * 0.95, R * 0.95, 8)

# ------------------------------------------------------------------ food, livestock, water, and the edges of a place
def fam_crop(p, r, W):
    """One plant of a field's crop, which differs by way, so a planet farms its own. The game plants them in rows on the land."""
    k = [w['name'] for w in WAYS_F].index(W['name']); h = r.uniform(0.85, 1.1)
    if k in (0, 5):                                              # grain: a tuft of stalks with heavy heads
        for q in range(7):
            x, z = r.uniform(-0.22, 0.22), r.uniform(-0.22, 0.22); tx, tz = x + r.uniform(-0.14, 0.14), z + r.uniform(-0.14, 0.14); beam(p, x, 0, z, tx, 0.95 * h, tz, 0.009, 'thatch', 3); add_blob(p, tx, 1.0 * h, tz, 0.035, 'thatch', r, 1, 2.2)
    elif k in (1, 6):                                            # leaf crop: a head of leaves
        add_blob(p, 0, 0.17, 0, 0.24, 'leaf', r, 1, 0.8); add_blob(p, 0.12, 0.1, 0.1, 0.13, 'leaf', r, 1, 0.7); add_blob(p, -0.13, 0.1, -0.05, 0.12, 'leaf', r, 1, 0.7)
    elif k == 2:                                                 # staked vine, with fruit
        cy(p, 0, 0, 0, 1.55, 0.018, 'wood', 4); add_blob(p, 0, 0.95, 0, 0.25, 'leaf', r, 1, 2.1); add_blob(p, 0.08, 0.52, 0.1, 0.17, 'leaf', r, 1, 1.2); [ball(p, 0.17 * math.cos(q * 2.1), 0.7 + q * 0.17, 0.17 * math.sin(q * 2.1), 0.035, 'tint') for q in range(3)]
    elif k == 3:                                                 # tall stems with a seed head
        for q in range(2): x = q * 0.14 - 0.07; cy(p, x, 0, 0, 1.9 * h, 0.018, 'leaf', 4); add_blob(p, x, 1.95 * h, 0, 0.11, 'tint', r, 1, 1.3); add_blob(p, x, 0.9, 0, 0.12, 'leaf', r, 1, 0.45)
    else:                                                        # a low round bush
        add_blob(p, 0, 0.36 * h, 0, 0.4 * h, 'leaf', r, 1, 0.95)
    return None

def fam_scarecrow(p, r, W):
    m = W['post'] if W['post'] == 'metal' else 'wood'; cy(p, 0, 0, 0, 1.8, 0.03, m, 6); rod_x(p, -0.6, 0.6, 1.42, 0, 0.022, m, 6)
    add_cushion(p, -0.19, 0.95, -0.09, 0.19, 1.48, 0.09, 'fabric', 0.2, 0.4, 3); add_blob(p, 0, 1.68, 0, 0.14, 'cardboard', r, 2, 1.1)
    lathe(p, 0, 0, [(0.26, 1.76), (0.11, 1.8), (0.09, 1.96), (0, 1.97)], 'thatch', 10)
    for s in (-1, 1): bx(p, s * 0.42, 1.25, 0, 0.26, 0.22, 0.06, 'tint', 0)
    return None

def fam_beehives(p, r, W):
    for i in range(r.randrange(3, 6)):
        x = i * 0.95 - 1.7; bx(p, x, 0, 0, 0.62, 0.36, 0.62, 'wood', 0.006)
        if W['name'] in ('stone', 'timber'): lathe(p, x, 0, [(0.26, 0.36), (0.27, 0.56), (0.2, 0.78), (0.1, 0.9), (0, 0.94)], 'thatch', 10)
        else:
            for q in range(3): bx(p, x, 0.36 + q * 0.22, 0, 0.5, 0.205, 0.5, 'paint' if q else 'tint', 0.005)
            bx(p, x, 1.02, 0, 0.58, 0.05, 0.58, 'metal', 0.004)
    return None

def fam_trough(p, r, W):
    m = 'wood' if W['deck'] == 'wood' else 'metal' if W['deck'] == 'metal' else 'concrete'; L = r.uniform(1.8, 3)
    bx(p, 0, 0.15, -0.3, L, 0.5, 0.05, m, 0.004); bx(p, 0, 0.15, 0.3, L, 0.5, 0.05, m, 0.004); bx(p, -L / 2, 0.15, 0, 0.05, 0.5, 0.65, m, 0.004); bx(p, L / 2, 0.15, 0, 0.05, 0.5, 0.65, m, 0.004); bx(p, 0, 0.13, 0, L, 0.05, 0.65, m, 0.004)
    bx(p, 0, 0.5, 0, L - 0.06, 0.02, 0.56, 'visor', 0)
    for s in (-1, 1): bx(p, s * L * 0.4, 0, 0, 0.1, 0.16, 0.7, m, 0.004)
    return None

def fam_stable(p, r, W):
    w, d, h = r.uniform(9, 13), r.uniform(5, 6.5), r.uniform(2.6, 3.0); walls(p, w, h, d, W); roof(p, w, d, h, r, dict(W, kind='gable' if W['kind'] == 'flat' else W['kind'], pitch=W['pitch'] if W['kind'] != 'flat' else (0.2, 0.3), roof=W['roof']), 1.1, 0.3)
    n = int(w / 2.4)
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n; Fb(p, x, 0.3, -d / 2, 1.5, 2.0, 0.04, 'visor'); Fb(p, x, 0.3, -d / 2 - 0.04, 1.5, 1.05, 0.05, W['door'] if W['door'] != 'tint' else 'plank', 'z', 0.004)
        for s in (-1, 1): Fb(p, x + s * 0.78, 0.3, -d / 2 - 0.03, 0.08, 2.05, 0.07, W['frame'])
        Fb(p, x, 2.3, -d / 2 - 0.03, 1.64, 0.08, 0.07, W['frame'])
    for i in range(n + 1): cy(p, -w / 2 + i * w / n, -d / 2 - 1.05, 0, h - 0.25, 0.06, 'wood' if W['post'] in ('plank', 'render', 'brick') else 'metal', 8)
    return (w / 2, d / 2, h)

def fam_pumphouse(p, r, W):
    w, d, h = r.uniform(3.4, 5), r.uniform(3, 4), r.uniform(2.6, 3.1); walls(p, w, h, d, W); roof(p, w, d, h, r, W, 0.25, 0.2)
    door(p, -w * 0.18, -d / 2, 'z', 0.9, 2.0, W); win(p, w / 2, 0, 'x', 1.35, 0.7, 0.6, W, 1)
    V = mathutils.Vector
    tube(p, [V((w / 2 + 0.3, 0.35, 0.8)), V((w / 2 + 1.5, 0.35, 0.8)), V((w / 2 + 1.5, 0.35, 4.8))], [0.17] * 3, 'metal', 10)
    for z in (1.6, 3.2): bx(p, w / 2 + 1.5, 0, z, 0.5, 0.3, 0.3, 'concrete', 0.012)
    lathe(p, w / 2 + 1.5, 0.8, [(0.27, 0.15), (0.27, 0.55)], 'tint', 12); lathe(p, w / 2 + 1.5, 0.8, [(0.05, 0.55), (0.05, 0.9)], 'metal', 8); rod_x(p, w / 2 + 1.25, w / 2 + 1.75, 0.92, 0.8, 0.018, 'metal', 6)
    return (w / 2, d / 2, h)

def fam_dam(p, r, W):
    """A weir: a low wall across a stream, sluices and a walkway."""
    L, h = r.uniform(18, 30), r.uniform(3.5, 6); m = W['wall'] if W['wall'] in ('rock', 'concrete', 'brick') else 'concrete'
    prism(p, [(-2.4, -2), (2.4, -2), (0.9, h), (-0.9, h)], -L / 2, L / 2, m, 'x')
    n = int(L / 5)
    for i in range(n):
        x = -L / 2 + (i + 0.5) * L / n; bx(p, x, 0.4, -1.9 + 0.12 * h, 1.6, h * 0.5, 0.2, 'metal', 0.01); [cy(p, x + q * 0.55, -0.6, h - 0.1, h + 1.1, 0.04, 'metal', 6) for q in (-1, 1)]; bx(p, x, h + 1.1, -0.6, 1.3, 0.08, 0.1, 'metal')
    bx(p, 0, h, 0, L + 0.5, 0.15, 2.0, 'concrete', 0.01)
    for s in (-1, 1): [cy(p, -L / 2 + i * 2.5, s * 1, h + 0.15, h + 1.15, 0.02, 'metal', 5) for i in range(int(L / 2.5) + 1)]; rod_x(p, -L / 2, L / 2, h + 1.15, s, 0.022, 'metal', 5)
    return (L / 2, 1.5, h)

def fam_marketcross(p, r, W):
    """The stones or post at a crossroads: where a place's name and its notices go."""
    m = W['wall'] if W['wall'] in ('rock', 'concrete', 'brick') else 'stone'; h = r.uniform(2.6, 4.5)
    for q in range(3): bx(p, 0, -0.8 if q == 0 else q * 0.22 - 0.22, 0, 2.5 - q * 0.65, (1.02 if q == 0 else 0.22), 2.5 - q * 0.65, m, 0.012)
    lathe(p, 0, 0, [(0.26, 0.44), (0.18, 0.75), (0.13, h), (0.22, h + 0.14), (0, h + 0.4)], m if m != 'brick' else 'stone', 8 if W['name'] != 'prefab' else 16)
    bx(p, 0, 1.2, -0.22, 0.8, 1.0, 0.04, 'wood' if W['deck'] == 'wood' else 'metal', 0.004)
    for i in range(r.randrange(2, 5)): bx(p, -0.25 + i * 0.17, 1.42 + (i % 2) * 0.28, -0.246, 0.13, 0.2, 0.004, 'cardboard', 0)
    return (0.9, 0.9, 0.6)

def fam_bandstall(p, r, W):
    """A roadside table under a roof: every place has someone selling what they grew."""
    w, d = r.uniform(2.4, 3.4), r.uniform(1.4, 1.9); h = r.uniform(2.1, 2.4); m = 'wood' if W['post'] in ('plank', 'render', 'brick') else 'metal'
    for sx in (-1, 1):
        for sz in (-1, 1): cy(p, sx * w / 2, sz * d / 2, 0, h + (0.3 if sz > 0 else 0), 0.035, m, 6)
    rm = W['roof'] if W['roof'] in ('corrugated', 'thatch', 'hull') else 'tint'
    prism(p, [(-d / 2 - 0.3, h - 0.1), (d / 2 + 0.2, h + 0.32), (d / 2 + 0.2, h + 0.38), (-d / 2 - 0.3, h - 0.04)], -w / 2 - 0.2, w / 2 + 0.2, rm, 'x')
    bx(p, 0, 0.82, -d * 0.15, w, 0.05, d * 0.6, m, 0.005); bx(p, 0, 0.3, -d * 0.15, w - 0.1, 0.52, 0.03, m, 0)
    for i in range(int(w / 0.5)):
        x = -w / 2 + 0.3 + i * 0.5; bx(p, x, 0.87, -d * 0.15, 0.4, 0.13, 0.36, 'wood', 0.004); gm = r.choice(('tint', 'leaf', 'soil')); [add_blob(p, x + r.uniform(-0.12, 0.12), 1.02 + r.uniform(0, 0.05), -d * 0.15 + r.uniform(-0.1, 0.1), 0.06, gm, r, 1, 0.85) for q in range(4)]
    return None

def fam_stockfence(p, r, W):
    """A length of field boundary, in what they have to hand. Laid end to end round a field."""
    L = 6.0; k = W['name']
    if k in ('stone',):
        rng = random.Random('wall%d' % r.randrange(9))
        for i in range(34): add_blob(p, rng.uniform(-L / 2, L / 2), rng.uniform(0.1, 0.85), rng.uniform(-0.2, 0.2), rng.uniform(0.17, 0.25), 'rock', rng, 1, 0.75)
    elif k == 'brick':
        bx(p, 0, -0.2, 0, L, 1.3, 0.24, 'brick', 0.005); bx(p, 0, 1.1, 0, L + 0.05, 0.06, 0.32, 'stone', 0.005)
    elif k == 'concrete':
        for x in (-L / 2, 0, L / 2): bx(p, x, -0.2, 0, 0.16, 1.3, 0.16, 'concrete', 0.006)
        for y in (0.35, 0.8): bx(p, 0, y, 0, L, 0.14, 0.07, 'concrete', 0.003)
    else:
        m = 'wood' if k in ('timber', 'render') else 'metal'
        for x in (-L / 2, 0, L / 2): cy(p, x, 0, -0.2, 1.35, 0.055 if m == 'wood' else 0.03, m, 7)
        if m == 'wood':
            for y in (0.45, 0.85, 1.22): rod_x(p, -L / 2, L / 2, y + r.uniform(-0.03, 0.03), 0.05, 0.034, m, 5)
        else:
            for y in (0.3, 0.55, 0.8, 1.05, 1.3): rod_x(p, -L / 2, L / 2, y, 0.03, 0.004, 'metal', 3)
    return None

# ------------------------------------------------------------------ what a settled place builds in common
def bay_front(p, w, d, y, W, n, door_at=None, wh=1.2, ww=1.0):
    """A row of windows along the front at height y, leaving room at door_at."""
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        if door_at is None or abs(x - door_at) > 1.2: win(p, x, -d / 2, 'z', y, ww, wh, W, -1)

def sign(p, x, y, z, w, h=0.5):
    bx(p, x, y, z, w, h, 0.07, 'tint', 0.008)

def fam_hall(p, r, W):
    """The meeting hall: tall, plain, a broad door up steps. Every place has somewhere to argue."""
    w, d, h = r.uniform(12, 17), r.uniform(9, 12), r.uniform(5.2, 6.5)
    walls(p, w, h, d, W); top = roof(p, w, d, h, r, W, 0.4, 0.3)
    n = int(w / 2.6)
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        if abs(x) > 1.8: win(p, x, -d / 2, 'z', 1.5, 1.05, 2.8, W, -1)
        win(p, x, d / 2, 'z', 1.5, 1.05, 2.8, W, 1)
    for s_ in (-1, 1): [win(p, s_ * w / 2, -d / 2 + (i + 0.5) * d / 3, 'x', 1.5, 1.05, 2.8, W, s_) for i in range(3)]
    door(p, 0, -d / 2, 'z', 2.1, 2.9, W)
    for q in range(3): bx(p, 0, q * 0.12, -d / 2 - 1.0 - (2 - q) * 0.3, 4.6 - q * 0.5, 0.12, 0.3 + q * 0.05, W['base'], 0.008)
    for s_ in (-1, 1): lathe(p, s_ * 1.9, -d / 2 - 1.1, [(0.26, 0.3), (0.18, 0.5), (0.15, h - 0.5), (0.26, h - 0.25), (0.28, h)], W['post'] if W['post'] != 'plank' else 'wood', 10)
    bx(p, 0, h - 0.25, -d / 2 - 0.95, 4.6, 0.3, 1.9, W['trim'] if W['trim'] != 'paint' else 'stone', 0.012); sign(p, 0, 3.55, -d / 2 - 0.08, 3.6, 0.55)
    return (w / 2, d / 2, h)

def fam_school(p, r, W):
    """Long, low, big windows to the south, and a yard with a fence."""
    w, d, h = r.uniform(15, 22), r.uniform(7, 9), r.uniform(3.3, 3.7)
    walls(p, w, h, d, W); roof(p, w, d, h, r, W, 0.5, 0.3)
    n = int(w / 2.0)
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        if i not in (n // 2, n // 2 - 1) and i % 4 != 3: Fb(p, x, 1.0, -d / 2, 1.5, 1.8, 0.05, 'visor'); Fb(p, x, 0.95, -d / 2 - 0.05, 1.7, 0.08, 0.14, W['trim']); Fb(p, x, 2.8, -d / 2 - 0.03, 1.7, 0.08, 0.07, W['frame']); Fb(p, x - 0.8, 1.0, -d / 2 - 0.03, 0.08, 1.8, 0.07, W['frame']); Fb(p, x, 1.0, -d / 2 - 0.03, 0.05, 1.8, 0.06, W['frame'])
    door(p, -0.5, -d / 2, 'z', 1.0, 2.1, W); door(p, 0.7, -d / 2, 'z', 1.0, 2.1, W)
    prism(p, [(-d / 2, 2.9), (-d / 2 - 1.6, 2.75), (-d / 2 - 1.6, 2.68), (-d / 2, 2.82)], -2.2, 2.2, 'metal', 'x')
    cy(p, w * 0.42, -d / 2 - 3, 0, 7.5, 0.04, 'metal', 6); bx(p, w * 0.42 + 0.46, 6.6, -d / 2 - 3, 0.9, 0.55, 0.01, 'tint', 0)        # the flag
    for i in range(int(w / 3) + 1): cy(p, -w / 2 + i * 3, -d / 2 - 7, 0, 1.2, 0.03, 'metal', 5)
    rod_x(p, -w / 2, w / 2, 1.15, -d / 2 - 7, 0.018, 'metal', 5); rod_x(p, -w / 2, w / 2, 0.55, -d / 2 - 7, 0.018, 'metal', 5)
    for q in (-1, 1): cy(p, q * w * 0.3, -d / 2 - 4, 0, 3.0, 0.04, 'metal', 6)
    rod_x(p, -w * 0.3 - 0.05, -w * 0.3 + 0.5, 3.0, -d / 2 - 4, 0.02, 'metal', 5)
    return (w / 2, d / 2, h)

def fam_clinic(p, r, W):
    """Clean, a covered door an ambulance can reach, a light over it that's on all night."""
    w, d, h = r.uniform(9, 14), r.uniform(7, 9), r.uniform(3.2, 3.6)
    walls(p, w, h, d, dict(W, wall='render' if W['wall'] in ('rock', 'plank') else W['wall'])); roof(p, w, d, h, r, dict(W, kind='flat' if W['kind'] == 'vault' else W['kind']))
    bay_front(p, w, d, 1.0, W, int(w / 2.2), 0, 1.25, 1.1); door(p, 0, -d / 2, 'z', 1.9, 2.15, W)
    for s_ in (-1, 1): cy(p, s_ * 1.8, -d / 2 - 2.6, 0, 2.9, 0.07, 'metal', 8); win(p, s_ * w / 2, 0, 'x', 1.0, 0.9, 1.1, W, s_)
    bx(p, 0, 2.9, -d / 2 - 1.4, 4.2, 0.14, 2.9, 'metal', 0.01); ball(p, 0, 2.82, -d / 2 - 1.3, 0.1, 'lampwarm')
    bx(p, 0, 3.05, -d / 2 - 0.05, 1.0, 0.8, 0.07, 'ceramic', 0.006); bx(p, 0, 3.37, -d / 2 - 0.09, 0.62, 0.17, 0.01, 'navgreen', 0); bx(p, 0, 3.145, -d / 2 - 0.09, 0.17, 0.62, 0.01, 'navgreen', 0)
    return (w / 2, d / 2, h)

def fam_inn(p, r, W):
    """Two floors, a sign out on a bracket, a bench by the door, and a lit window."""
    w, d = r.uniform(10, 14), r.uniform(7, 9); h = r.uniform(5.6, 6.4); walls(p, w, h, d, W); top = roof(p, w, d, h, r, W)
    n = int(w / 2.3); dx = 0
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        if abs(x - dx) > 1.1: win(p, x, -d / 2, 'z', 1.0, 1.05, 1.15, W, -1)
        win(p, x, -d / 2, 'z', 3.8, 0.9, 1.15, W, -1); win(p, x, d / 2, 'z', 3.8, 0.9, 1.15, W, 1)
    bx(p, 0, h * 0.5 - 0.02, -d / 2 - 0.03, w, 0.1, 0.07, W['trim'])
    door(p, dx, -d / 2, 'z', 1.15, 2.15, W)
    rod_z(p, -d / 2 - 1.0, -d / 2, w * 0.3, 3.2, 0.025, 'metal', 5); [cy(p, w * 0.3, -d / 2 - 0.25 - q * 0.5, 2.7, 3.2, 0.006, 'metal', 4) for q in (0, 1)]; Fb(p, w * 0.3, 2.1, -d / 2 - 0.5, 0.05, 0.62, 0.8, 'tint', 'z', 0.004)
    for s_ in (-1, 1): bx(p, s_ * 2.0, 0, -d / 2 - 0.4, 1.5, 0.42, 0.4, 'wood', 0.005)
    bx(p, -w * 0.42, 0, -d / 2 - 0.5, 0.5, 0.75, 0.5, 'wood', 0.005)
    if W['kind'] != 'flat': chimney(p, w * 0.3, d * 0.1, top, W); chimney(p, -w * 0.3, -d * 0.1, top, W)
    return (w / 2, d / 2, h)

def fam_warehouse(p, r, W):
    w, d, h = r.uniform(18, 28), r.uniform(11, 15), r.uniform(5.5, 7)
    wW = dict(W, wall='corrugated' if W['wall'] in ('plank', 'render') else W['wall'], kind='gable' if W['kind'] == 'hip' else W['kind'], pitch=(0.18, 0.28) if W['kind'] == 'hip' else W['pitch'], roof='corrugated' if W['roof'] in ('thatch', 'rooftile', 'slate') else W['roof'])
    walls(p, w, h, d, wW); roof(p, w, d, h, r, wW, 0.4, 0.3)
    n = int(w / 7)
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n; Fb(p, x, 0.3, -d / 2 - 0.03, 3.6, 3.9, 0.05, 'paint', 'z', 0.004)
        for q in range(9): Fb(p, x, 0.45 + q * 0.42, -d / 2 - 0.06, 3.5, 0.03, 0.02, 'metal')
        for s_ in (-1, 1): Fb(p, x + s_ * 1.9, 0.3, -d / 2 - 0.05, 0.14, 4.1, 0.1, 'hazard')
        Fb(p, x, 4.4, -d / 2 - 0.05, 3.9, 0.14, 0.1, 'metal'); bx(p, x, 0.3, -d / 2 - 1.3, 3.6, 0.03, 2.5, 'concrete', 0)
    for i in range(int(w / 5)): Fb(p, -w / 2 + (i + 0.5) * 5, h - 1.1, d / 2, 2.8, 0.55, 0.05, 'visor')
    bx(p, 0, 0, -d / 2 - 0.05, w, 0.3, 0.1, 'concrete', 0)
    return (w / 2, d / 2, h)

def fam_garage(p, r, W):
    """A vehicle bay with a pit of oil stains and a yard of what's waiting to be fixed."""
    w, d, h = r.uniform(9, 13), r.uniform(7, 9), r.uniform(4, 4.6); wW = dict(W, kind='flat' if W['kind'] in ('hip', 'vault') else W['kind']); walls(p, w, h, d, wW); roof(p, w, d, h, r, wW, 0.3, 0.2)
    for s_ in (-1, 1):
        x = s_ * w * 0.22; Fb(p, x, 0.3, -d / 2, 3.2, 3.2, 0.05, 'visor'); Fb(p, x, 0.3, -d / 2 - 0.03, 3.2, 1.9, 0.05, 'paint', 'z', 0.003); [Fb(p, x, 0.5 + q * 0.3, -d / 2 - 0.06, 3.1, 0.025, 0.02, 'metal') for q in range(6)]
        for e in (-1, 1): Fb(p, x + e * 1.65, 0.3, -d / 2 - 0.04, 0.12, 3.3, 0.1, W['frame'])
    sign(p, 0, 3.6, -d / 2 - 0.05, w * 0.7, 0.6); win(p, w / 2, 0, 'x', 1.4, 1.2, 1.0, W, 1)
    bx(p, 0, 0.3, -d / 2 - 2.5, w, 0.02, 4.8, 'concrete', 0)
    for q in range(3): add_cyl(p, -w * 0.45 + q * 0.1, -d / 2 - 0.75, 0.3 + q * 0.2, 0.5 + q * 0.2, 0.34, 'rubber', seg=14)
    add_cyl(p, w * 0.45, -d / 2 - 0.7, 0.3, 1.2, 0.29, 'tint', seg=12)
    return (w / 2, d / 2, h)

def fam_temple(p, r, W):
    """The tallest roof in a place that isn't a tower: long nave, a raised crown or spire, a door at one end."""
    w, d, h = r.uniform(8, 11), r.uniform(15, 22), r.uniform(5, 7); wm = W['wall'] if W['wall'] in ('rock', 'brick', 'concrete', 'render', 'hull') else 'render'; wW = dict(W, wall=wm)
    bx(p, 0, -3.2, 0, w + 0.3, 3.55, d + 0.3, W['base'], 0.02); bx(p, 0, 0.3, 0, w, h - 0.3, d, wm, 0.012)
    pitch = 0.9 if W['kind'] != 'vault' else 0.45; rise = w / 2 * pitch                     # ridge along the nave (z)
    prism(p, [(-w / 2, h), (w / 2, h), (0, h + rise)], -d / 2, d / 2, wm, 'z')
    rf = W['roof'] if W['kind'] != 'flat' else 'metal'
    for s_ in (-1, 1): prism(p, [(0, h + rise + 0.1), (s_ * (w / 2 + 0.4), h - 0.28), (s_ * (w / 2 + 0.4), h - 0.42), (0, h + rise - 0.05)], -d / 2 - 0.3, d / 2 + 0.3, rf, 'z')
    n = int(d / 3.2)
    for i in range(n):
        z = -d / 2 + (i + 0.5) * d / n
        for s_ in (-1, 1): Fb(p, s_ * w / 2, 1.6, z, 1.1, 3.0, 0.05, 'visor', 'x'); Fb(p, s_ * (w / 2 + 0.03), 1.55, z, 1.3, 0.1, 0.1, W['trim'] if W['trim'] != 'paint' else 'stone', 'x'); Fb(p, s_ * (w / 2 + 0.03), 4.6, z, 1.3, 0.1, 0.1, W['trim'] if W['trim'] != 'paint' else 'stone', 'x'); Fb(p, s_ * (w / 2 + 0.1), 0.3, z + d / n / 2, 0.8, h * 0.72, 0.35, wm, 'x', 0.01)
    door(p, 0, -d / 2, 'z', 1.7, 3.2, W); lathe(p, 0, -d / 2 - 0.03, [(1.3, h + 0.4), (1.3, h + 0.5)], 'stone' if W['name'] != 'prefab' else 'metal', 18)
    Fb(p, 0, h - 0.5, -d / 2 - 0.02, 1.5, 1.5, 0.03, 'tint' if W['name'] != 'concrete' else 'visor')
    k = [q['name'] for q in WAYS_F].index(W['name']) % 3; top = h + rise; zc = -d * 0.28
    if k == 0: bx(p, 0, top - 2.5, zc, 3.4, 5.0, 3.4, wm, 0.02); lathe(p, 0, zc, [(2.6, top + 2.5), (0.1, top + 12), (0, top + 12.5)], rf, 4)
    elif k == 1: lathe(p, 0, zc, [(2.7, top - 1.5), (2.7, top + 1.5)], wm, 16); lathe(p, 0, zc, [(2.9, top + 1.5)] + [(2.9 * math.cos(q * 0.262), top + 1.5 + 2.9 * math.sin(q * 0.262)) for q in range(1, 7)], 'tint' if W['name'] != 'prefab' else 'metal', 18); cy(p, 0, zc, top + 4.3, top + 6.2, 0.05, 'metal', 6)
    else: bx(p, 0, top - 2.5, zc, 2.2, 8, 2.2, wm, 0.02); [Fb(p, 0, top + 3.8, zc + q * 1.1, 1.0, 1.4, 0.03, 'visor') for q in (-1, 1)]; bx(p, 0, top + 5.5, zc, 2.7, 0.2, 2.7, W['trim'] if W['trim'] != 'paint' else 'stone', 0.01); lathe(p, 0, zc, [(1.4, top + 5.7), (0, top + 7)], rf, 4)
    return (w / 2, d / 2, h)

def fam_tenement(p, r, W):
    """Where a settlement goes up instead of out: four or five floors of the same window."""
    F = r.randrange(3, 6); fh = 3.0; w, d, h = r.uniform(13, 20), r.uniform(8, 11), F * fh; wW = dict(W, kind='flat' if W['kind'] in ('hip', 'vault') else W['kind']); walls(p, w, h, d, wW); roof(p, w, d, h, r, wW)
    n = int(w / 2.5)
    for k in range(F):
        y = 0.95 + k * fh
        for i in range(n):
            x = -w / 2 + (i + 0.5) * w / n
            if not (k == 0 and abs(x) < 1.4): win(p, x, -d / 2, 'z', y, 1.0, 1.35, W, -1)
            win(p, x, d / 2, 'z', y, 1.0, 1.35, W, 1)
            if k and (i + k) % 5 == 0: bx(p, x, y - 0.25, -d / 2 - 0.45, 1.6, 0.08, 0.9, 'concrete', 0.005); [bx(p, x + q * 0.8, y - 0.17, -d / 2 - 0.45, 0.04, 0.95, 0.9, 'metal', 0) for q in (-1, 1)]; bx(p, x, y + 0.75, -d / 2 - 0.88, 1.6, 0.04, 0.04, 'metal', 0)
        if k: bx(p, 0, k * fh - 0.07, -d / 2 - 0.02, w, 0.14, 0.06, W['trim'])
    door(p, 0, -d / 2, 'z', 1.4, 2.2, W)
    return (w / 2, d / 2, h)

def fam_markethall(p, r, W):
    """A roof on legs, open at the sides: a town's covered market."""
    w, d, h = r.uniform(16, 26), r.uniform(9, 13), r.uniform(4.2, 5.2); m = W['post'] if W['post'] != 'plank' else 'wood'; nx = int(w / 4.2)
    bx(p, 0, -1.0, 0, w + 0.8, 1.15, d + 0.8, W['base'], 0.02)
    for i in range(nx + 1):
        x = -w / 2 + i * w / nx
        for s_ in (-1, 1): lathe(p, x, s_ * d / 2, [(0.28, 0.15), (0.2, 0.4), (0.15, h - 0.3), (0.3, h)], m, 8) if m in ('wood', 'metal', 'concrete') else bx(p, x, 0.15, s_ * d / 2, 0.55, h - 0.15, 0.55, m, 0.012)
        beam(p, x, h, -d / 2, x, h, d / 2, 0.08, 'wood' if m == 'wood' else 'metal', 6)
    rW = dict(W, kind='gable' if W['kind'] == 'flat' else W['kind'], pitch=(0.3, 0.42) if W['kind'] == 'flat' else W['pitch'], roof='metal' if W['roof'] == 'concrete' else W['roof'])
    if rW['kind'] == 'hip': roof(p, w, d, h, r, rW, 0.7)
    else:
        pitch = r.uniform(*rW['pitch']); rise = d / 2 * pitch; t = 0.32 if rW['roof'] == 'thatch' else 0.11
        for s_ in (-1, 1): slab(p, (0, h + rise), (s_ * (d / 2 + 0.7), h - 0.7 * pitch), -w / 2 - 0.5, w / 2 + 0.5, t, rW['roof'])
    for i in range(nx):
        x = -w / 2 + (i + 0.5) * w / nx
        for s_ in (-1, 1):
            bx(p, x, 0.15, s_ * d * 0.28, 2.4, 0.8, 0.9, 'wood', 0.008)
            for q in range(3): add_blob(p, x + (q - 1) * 0.7, 1.02, s_ * d * 0.28, 0.17, r.choice(('tint', 'leaf', 'soil', 'cardboard')), r, 1, 0.8)
    return None

def fam_smithy(p, r, W):
    """A forge: a small hot room with a wide-open side, a big chimney, a stack of stock."""
    w, d, h = r.uniform(6, 8.5), r.uniform(5, 6.5), r.uniform(3, 3.5); fW = dict(W, kind='gable' if W['kind'] in ('flat', 'vault') else W['kind'], pitch=W['pitch'] if W['kind'] not in ('flat', 'vault') else (0.3, 0.4)); walls(p, w, h, d, fW); top = roof(p, w, d, h, r, fW, 1.2, 0.2)
    Fb(p, 0, 0.3, -d / 2 - 0.01, w * 0.68, 2.3, 0.04, 'visor'); [cy(p, q * w * 0.36, -d / 2 - 1.2, 0, h - 0.2, 0.09, 'wood' if W['post'] in ('plank', 'render') else 'metal', 8) for q in (-1, 1)]
    bx(p, w / 2 + 0.28, 0, d * 0.2, 1.0, top + 1.5, 1.0, 'brick' if W['wall'] != 'rock' else 'rock', 0.02); bx(p, w / 2 + 0.28, top + 1.5, d * 0.2, 1.15, 0.14, 1.15, 'stone', 0.01)
    bx(p, -w * 0.25, 0, -d / 2 - 1.1, 0.34, 0.5, 0.34, 'wood', 0.006); bx(p, -w * 0.25, 0.5, -d / 2 - 1.1, 0.62, 0.22, 0.22, 'metal', 0.01)
    for q in range(5): rod_x(p, w * 0.08, w * 0.08 + 1.8, 0.15 + (q % 2) * 0.1, -d / 2 - 1.1 - q * 0.12, 0.035, 'metal', 6)
    add_cyl(p, -w * 0.42, -d / 2 - 0.7, 0, 0.7, 0.3, 'wood', seg=12); lathe(p, -w * 0.42, -d / 2 - 0.7, [(0.27, 0.71), (0, 0.71)], 'visor', 12)
    return (w / 2, d / 2, h)

def fam_sawmill(p, r, W):
    """An open shed with a blade, logs waiting, boards stacked to dry."""
    w, d, h = r.uniform(12, 16), r.uniform(6, 8), r.uniform(3.6, 4.2); m = 'wood' if W['post'] != 'metal' else 'metal'
    for sx in (-1, 0, 1):
        for sz in (-1, 1): bx(p, sx * w / 2, 0, sz * d / 2, 0.22, h, 0.22, m, 0.006)
    rfm = W['roof'] if W['roof'] != 'concrete' else 'corrugated'
    for s_ in (-1, 1): slab(p, (0, h + d * 0.18), (s_ * (d / 2 + 0.5), h - 0.08), -w / 2 - 0.3, w / 2 + 0.3, 0.1, rfm)
    bx(p, 0, 0, 0, w * 0.8, 0.85, 1.0, 'wood', 0.01)
    add_cyl(p, 0, 0.85, -0.03, 0.03, 0.55, 'metal', seg=22, axis='z'); bx(p, 0, 0.85, 0.75, 0.7, 0.6, 0.5, 'tint', 0.012)
    for q in range(9):
        rr = r.uniform(0.17, 0.27); add_cyl(p, 0.27 + (q // 3) * 0.44, d * 0.9 + (q % 3 - 1) * 0.55 + (q // 3) * 0.22, -3.2, 2.2, rr, 'bark', seg=10, axis='x')
    for q in range(6):
        for k in range(3): bx(p, -w * 0.28 + k * 0.42, 0.1 + q * 0.09, -d * 0.95, 0.36, 0.05, 3.4, 'plank', 0)
    return (w / 2, d / 2, 2.2)

# ------------------------------------------------------------------ small things along a road
def fam_busstop(p, r, W):
    L = r.uniform(3, 4.6); m = W['post'] if W['post'] in ('metal',) else 'wood' if W['post'] == 'plank' else 'metal'
    for s_ in (-1, 1):
        for z in (-0.5, 0.5): cy(p, s_ * L / 2, z, 0, 2.5, 0.04, m, 6)
    rm = W['roof'] if W['roof'] in ('corrugated', 'hull', 'thatch', 'rooftile', 'slate') else 'metal'
    prism(p, [(-0.9, 2.42), (0.75, 2.62), (0.75, 2.7), (-0.9, 2.5)], -L / 2 - 0.15, L / 2 + 0.15, rm, 'x')
    Fb(p, 0, 0.55, 0.5, L, 1.7, 0.03, 'glass' if W['name'] in ('prefab', 'concrete', 'tin') else 'plank'); bx(p, 0, 0.44, 0.22, L * 0.7, 0.05, 0.36, 'wood', 0.004)
    for s_ in (-1, 1): bx(p, s_ * L * 0.28, 0, 0.22, 0.05, 0.44, 0.3, 'metal')
    cy(p, L / 2 + 0.6, -0.3, 0, 2.6, 0.03, 'metal', 6); bx(p, L / 2 + 0.6, 2.2, -0.33, 0.4, 0.4, 0.02, 'tint', 0)
    return None

def fam_noticeboard(p, r, W):
    w = r.uniform(1.4, 2.4); m = 'wood' if W['deck'] == 'wood' else 'metal'
    for s_ in (-1, 1): cy(p, s_ * w / 2, 0, 0, 2.1, 0.05, m, 6)
    bx(p, 0, 0.9, 0, w, 1.05, 0.04, 'cardboard' if m == 'wood' else 'paint', 0.004); prism(p, [(-0.28, 2.0), (0.28, 2.0), (0, 2.22)], -w / 2 - 0.1, w / 2 + 0.1, W['roof'] if W['roof'] in ('slate', 'rooftile', 'corrugated', 'thatch') else 'metal', 'x')
    for i in range(r.randrange(4, 9)): bx(p, r.uniform(-w * 0.42, w * 0.42), r.uniform(1.0, 1.72), -0.023, r.uniform(0.15, 0.28), r.uniform(0.18, 0.3), 0.003, r.choice(('ceramic', 'tint', 'cardboard')), 0)
    return None

def fam_poweredge(p, r, W):
    """The pole that brings power to the last house, transformer and all."""
    h = r.uniform(7.5, 9.5); cy(p, 0, 0, -0.5, h, 0.11, 'wood' if W['post'] in ('plank', 'render', 'brick') else 'concrete' if W['post'] == 'concrete' else 'metal', 8, r2=0.08)
    for y in (h - 0.2, h - 0.9): bx(p, 0, y, 0, 1.6, 0.09, 0.09, 'wood' if W['post'] == 'plank' else 'metal', 0); [cy(p, s_ * 0.7, 0, y + 0.09, y + 0.26, 0.04, 'ceramic', 7) for s_ in (-1, 1)]
    add_cyl(p, 0, -0.3, h - 2.8, h - 1.7, 0.26, 'paint', seg=12); [cy(p, q * 0.13, -0.3, h - 1.7, h - 1.45, 0.025, 'ceramic', 6) for q in (-1, 1)]; bx(p, 0, 2.2, -0.14, 0.32, 0.45, 0.08, 'metal', 0.004)
    return None

def fam_culvert(p, r, W):
    """Where a track crosses a ditch."""
    L = r.uniform(3, 5); m = 'concrete' if W['wall'] not in ('rock', 'brick') else W['wall']
    for s_ in (-1, 1): bx(p, 0, -0.6, s_ * L / 2, 3.4, 1.15, 0.3, m, 0.012)
    for x in (-0.65, 0.65): add_cyl(p, x, -0.1, -L / 2 - 0.02, L / 2 + 0.02, 0.42, 'visor', seg=16, axis='z')
    bx(p, 0, 0.55, 0, 3.4, 0.05, L, 'soil', 0.01)
    return None

def fam_shelterhut(p, r, W):
    """A refuge on a high road: four walls, a stove pipe, a door that isn't locked."""
    w, d, h = r.uniform(3.5, 5), r.uniform(3, 4), r.uniform(2.3, 2.6); walls(p, w, h, d, W); top = roof(p, w, d, h, r, W, 0.3, 0.2)
    door(p, 0, -d / 2, 'z', 0.85, 1.85, W); win(p, w / 2, 0, 'x', 1.1, 0.5, 0.5, W, 1); cy(p, -w * 0.28, d * 0.15, h, top + 0.6, 0.07, 'metal', 8); cy(p, -w * 0.28, d * 0.15, top + 0.6, top + 0.72, 0.13, 'metal', 8, r2=0.02)
    for q in range(3):
        for k in range(3 - q): add_cyl(p, 0.15 + q * 0.26, -d / 2 - 0.5 + k * 0.28 + q * 0.14, w * 0.2, w * 0.2 + 1.3, 0.12, 'bark', seg=8, axis='x')
    return (w / 2, d / 2, h)

FAMILIES = 'poweredge culvert windpump dam footbridge jetty boat graves picnic swings cart crop scarecrow beehives trough stockfence coolingtower column spheretank'.split()

def build_family():
    import json
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)
    made, foot, tris = [], {}, 0
    for fam in FAMILIES:
        for i, W in enumerate(WAYS_F):
            name = 'fam_%s_%d' % (fam, i)
            if ONLY and fam not in ONLY and name not in ONLY: continue
            p = Part(); f = globals()['fam_' + fam](p, random.Random('family:%s:%d' % (fam, i)), W); ob = finish(p, name); ob['kind'] = name
            made.append(ob); foot[name] = [round(float(q), 2) for q in f] if f else 0; tris += sum(max(0, len(q.vertices) - 2) for q in ob.data.polygons)
    out = os.path.join(ROOT, 'assets', 'family.glb'); bpy.ops.object.select_all(action='DESELECT')
    for ob in made: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_materials='EXPORT', export_extras=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True)
    if not ONLY:
        with open(os.path.join(ROOT, 'js', 'gen', 'familydata.js'), 'w') as fh:
            fh.write('// Written by tools/assets/family_kit.py: each family model\'s solid footprint [half x, half z, height], or 0 if you can walk through it.\n// The game reads these; it never looks at a mesh.\nexport const FOOT = ' + json.dumps(foot, separators=(',', ':')) + ';\nexport const WAY_NAMES = ' + json.dumps([w['name'] for w in WAYS_F]) + ';\nexport const FAMILIES = ' + json.dumps(FAMILIES) + ';\n')
    print('family:', len(made), 'models', tris, 'tris, wrote', out, os.path.getsize(out) // 1024, 'KB')
