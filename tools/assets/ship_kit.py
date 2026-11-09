# Designed ships: every class has its own silhouette and its own reason for looking that way.
# A hull is lofted round the layout's interior (the rooms the game walks through never change); what's
# bolted to it says what the ship is for. Frame as everywhere: x across [0, W], y up, z from stern (0) to
# nose (D). All original shapes. Exec'd by build.py.
#
# Nothing here is a shape painted to look like parts. Curves are curves (splines through the stations, never straight runs between them),
# wings are real aerofoils with their flaps as separate pieces, panels are separate sheets lying on the hull, the canopy has a frame.

def _fit_ry(a, b, rx, e):
    """How tall a superellipse of half-width rx must be to hold the interior's corner (a, b)."""
    q = 1 - min(0.92, (a / rx) ** e)
    return b / q ** (1 / e)

def _pchip(u, ys, x):
    """A smooth curve through points that never overshoots them: what lets a hull curve without bulging out of its stations or into its rooms."""
    n = len(u); i = 0
    if x <= u[0]: return ys[0]
    if x >= u[-1]: return ys[-1]
    while i < n - 2 and x > u[i + 1]: i += 1
    h = [max(1e-9, u[k + 1] - u[k]) for k in range(n - 1)]; d = [(ys[k + 1] - ys[k]) / h[k] for k in range(n - 1)]
    m = [d[0]] + [0.0] * (n - 2) + [d[-1]]
    for k in range(1, n - 1):
        if d[k - 1] * d[k] > 0:
            w1, w2 = 2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]; m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k])
    t = (x - u[i]) / h[i]; t2 = t * t; t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1]

def smooth_secs(secs, per=6):
    """Stations → many stations along a smooth curve through them (each column its own curve, over the distance along the first)."""
    cols = list(zip(*secs)); u = [0.0]
    for a, b in zip(cols[0], cols[0][1:]): u.append(u[-1] + abs(b - a) + 1e-6)
    out = []
    for k in range(len(u) - 1):
        for j in range(per):
            x = u[k] + (u[k + 1] - u[k]) * j / per; out.append(tuple(_pchip(u, c, x) for c in cols))
    out.append(tuple(c[-1] for c in cols)); return out

def _sloft(p, secs, mat, n=28, cap=True, axis='z', per=5): add_loft(p, smooth_secs(secs, per), mat, n, cap, axis)

class Body:
    """A hull as a surface you can ask about: where is the skin at this station and this angle (90 is the top, 0 the +x side)."""
    def __init__(s, secs, per=6): s.secs = smooth_secs(secs, per)
    def sect(s, z):
        S = s.secs
        if z <= S[0][0]: return list(S[0][1:])
        for (za, *A), (zb, *B) in zip(S, S[1:]):
            if za <= z <= zb: t = (z - za) / max(1e-6, zb - za); return [q + (w - q) * t for q, w in zip(A, B)]
        return list(S[-1][1:])
    def at(s, z, ang, lift=0.0):
        cy, ry, cx, rx, e = s.sect(z); a = math.radians(ang); c_, s_ = math.cos(a), math.sin(a)
        return (cx + (rx + lift) * math.copysign(abs(c_) ** (2 / e), c_), cy + (ry + lift) * math.copysign(abs(s_) ** (2 / e), s_), z)

def _outward(B, bm):
    for f in bm.faces:
        f.normal_update(); c = f.calc_center_median(); z = -c.y; cy, ry, cx, rx, e = B.sect(z)
        if (c - mathutils.Vector(P(cx, cy, z))).dot(f.normal) < 0: f.normal_flip()

def _grid(p, B, rows, mat):
    bm = bmesh.new(); V = [[bm.verts.new(P(*q)) for q in r_] for r_ in rows]
    for r0, r1 in zip(V, V[1:]):
        for j in range(len(r0) - 1): bm.faces.new([r0[j], r0[j + 1], r1[j + 1], r1[j]])
    _outward(B, bm); merge(p, bm, mat)

def _skin(p, B, z0, z1, a0, a1, lift=0.025, mat='tint', nz=4, na=4):
    """A separate sheet lying on the hull, its edges turned down to meet it: a panel, a hatch, an armour plate."""
    if any(_glazed(z_, a_) for z_ in (z0, (z0 + z1) / 2, z1) for a_ in (a0, (a0 + a1) / 2, a1)): return
    pts = lambda L: [[B.at(z0 + (z1 - z0) * i / nz, a0 + (a1 - a0) * j / na, L) for j in range(na + 1)] for i in range(nz + 1)]
    top, low = pts(lift), pts(-0.01); bm = bmesh.new(); T = [[bm.verts.new(P(*q)) for q in r_] for r_ in top]
    for r0, r1 in zip(T, T[1:]):
        for j in range(na): bm.faces.new([r0[j], r0[j + 1], r1[j + 1], r1[j]])
    edge = [(i, 0) for i in range(nz + 1)] + [(nz, j) for j in range(1, na + 1)] + [(i, na) for i in range(nz - 1, -1, -1)] + [(0, j) for j in range(na - 1, 0, -1)]
    L_ = [bm.verts.new(P(*low[i][j])) for (i, j) in edge]
    for k, (i, j) in enumerate(edge):
        (i2, j2) = edge[(k + 1) % len(edge)]; bm.faces.new([T[i][j], T[i2][j2], L_[(k + 1) % len(edge)], L_[k]])
    _outward(B, bm); merge(p, bm, mat)

_GLASS = [None]          # (while a ship is built: is this spot of skin under its canopy? nothing is fitted there, you'd see it from the seat)
def _glazed(z, a): return bool(_GLASS[0]) and _GLASS[0](z, a % 360 if a % 360 < 270 else a % 360 - 360)

def _seam_long(p, B, z0, z1, a, w=0.026, mat='rubber', lift=0.006):
    """A gap between plates, running along the hull (broken where the glass is)."""
    n = max(2, int(abs(z1 - z0) / 0.5)); rows = []
    for i in range(n + 1):
        z = z0 + (z1 - z0) * i / n; _, ry, _, rx, _ = B.sect(z); d = math.degrees(w / 2 / max(0.06, (rx + ry) / 2))
        if _glazed(z, a):
            if len(rows) > 1: _grid(p, B, rows, mat)
            rows = []; continue
        rows.append([B.at(z, a - d, lift), B.at(z, a + d, lift)])
    if len(rows) > 1: _grid(p, B, rows, mat)

def _seam_ring(p, B, z, a0, a1, w=0.026, mat='rubber', lift=0.006):
    """A gap between plates, running round it."""
    n = max(2, int(abs(a1 - a0) / 5)); _grid(p, B, [[B.at(z, a0 + (a1 - a0) * j / n, lift) for j in range(n + 1)], [B.at(z + w, a0 + (a1 - a0) * j / n, lift) for j in range(n + 1)]][::1], mat)

def _plating(p, B, z0, z1, r, keep=lambda z, a: True, dense=1.0):
    """How a hull is really made: plates. Frames round it every metre or two, stringers along it, each run broken where plates overlap; a hatch here and there, a vent, a thruster block."""
    z = z0
    while z < z1:
        a = r.uniform(0, 30); end = a + 360
        while a < end:
            b = min(end, a + r.uniform(50, 130))
            if keep(z, (a + b) / 2): _seam_ring(p, B, z, a, b)
            a = b + r.uniform(0, 8)
        z += r.uniform(1.1, 2.2) / dense
    for a in (22, 58, 122, 158, 200, 340):
        z = z0
        while z < z1:
            e_ = min(z1, z + r.uniform(1.6, 3.6))
            if keep((z + e_) / 2, a) and r.random() < 0.85: _seam_long(p, B, z, e_, a + r.uniform(-3, 3))
            z = e_ + r.uniform(0.1, 0.6)
    # raised sheets: doublers and access hatches, each a piece
    for _ in range(int((z1 - z0) * 1.4 * dense)):
        zz = r.uniform(z0, z1 - 0.6); aa = r.choice([r.uniform(25, 155), r.uniform(-20, 20), r.uniform(160, 200)]); ln = r.uniform(0.35, 1.2); wd = r.uniform(5, 16)
        if keep(zz + ln / 2, aa): _skin(p, B, zz, zz + ln, aa, aa + wd, r.uniform(0.012, 0.03), 'tint', 3, 2)

def _vent(p, B, z, a, ln=0.7, wd=14, slats=5):
    """A louvred vent: a dark recess and bars across it."""
    _skin(p, B, z, z + ln, a, a + wd, 0.012, 'rubber', 2, 2)
    for k in range(slats):
        zk = z + ln * (k + 0.5) / slats; _skin(p, B, zk - ln * 0.035, zk + ln * 0.035, a + wd * 0.04, a + wd * 0.96, 0.03, 'metal', 1, 2)

def _rcs(p, B, z, a):
    """Attitude thrusters: a block on the skin, a little nozzle out of each face."""
    if any(_glazed(z_, a_) for z_ in (z - 0.3, z + 0.3) for a_ in (a - 8, a + 8)): return
    x, y, _ = B.at(z, a, 0.05); _skin(p, B, z - 0.16, z + 0.16, a - 6, a + 6, 0.05, 'metal', 2, 2)
    add_cyl(p, x, y, z + 0.1, z + 0.28, 0.035, 'rubber', 10, axis='z', r2=0.055); add_cyl(p, x, y, z - 0.28, z - 0.1, 0.055, 'rubber', 10, axis='z', r2=0.035)

def _canopy(p, B, z0, z1, half, bulge, k=2.2, bows=(0.34, 0.62), top=90, frame='tint', mat='visor', edge=None):
    """Glass that stands up from the hull, in a real frame: a rail round it, bows across, a bar down the middle."""
    def shape(t):
        if edge: return (1 - max(0.0, 1 - t / 0.3) ** k) ** (1 / k)          # (drawn from the cockpit: rounded behind the head, running out to the nose in front)
        m = max(0.0, 1 - abs(2 * t ** 0.72 - 1) ** k); return m ** (1 / k)
    def pt(t, u, ex=0.0):
        m = shape(t); fr = min(1.0, (1 - t) / 0.2) ** 0.6 if edge else 1.0
        a = top + (edge(z0 + (z1 - z0) * t) if edge else half) * m * u; L = bulge * fr * (m ** 0.75) * max(0.0, 1 - abs(u) ** 2.6) ** 0.5 + 0.012 + ex
        return B.at(z0 + (z1 - z0) * t, a, L)
    nz, na = (60, 22) if edge else (20, 14); _grid(p, B, [[pt(i / nz, -1 + 2 * j / na) for j in range(na + 1)] for i in range(nz + 1)], mat)
    W = 0.05 / max(0.5, z1 - z0)
    for t in bows: _grid(p, B, [[pt(t - W, -1 + 2 * j / na, 0.012) for j in range(na + 1)], [pt(t + W, -1 + 2 * j / na, 0.012) for j in range(na + 1)]], frame)
    for u in (-0.97, 0.97): _grid(p, B, [[pt(i / nz, u - 0.03, 0.01), pt(i / nz, u + 0.03, 0.01)] for i in range(1, nz)], frame)
    _grid(p, B, [[pt(i / nz, -0.012, 0.012), pt(i / nz, 0.012, 0.012)] for i in range(0, int(nz * max(bows)) + 1)], frame)

def _naca(t):
    """The thickness of a wing section at t along its chord, 1 at the thickest."""
    t = max(0.0, min(1.0, t)); return (0.2969 * t ** 0.5 - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4) / 0.1
def _aero(p, st, c0=0.0, c1=1.0, mat='tint', nc=10, cap=True):
    """A lifting surface through spanwise stations (x, y, leading z, trailing z, thickness), only the part of the chord from c0 to c1: thick rounded front, drawn out to a thin edge."""
    bm = bmesh.new(); rings = []
    tv = [c0 + (c1 - c0) * (1 - math.cos(math.pi * k / nc)) / 2 for k in range(nc + 1)]
    for i, (x, y, zl, zt, th) in enumerate(st):
        a_, b_ = st[max(0, i - 1)], st[min(len(st) - 1, i + 1)]; dx, dy = b_[0] - a_[0], b_[1] - a_[1]; L = math.hypot(dx, dy) or 1; nx, ny = -dy / L, dx / L
        if ny < 0: nx, ny = -nx, -ny
        if abs(ny) < 0.3 and nx < 0: nx, ny = -nx, -ny
        low = tv[::-1]; low = low[1:] if c1 >= 1 else low; low = low[:-1] if c0 <= 0 else low; R = [(t, 1) for t in tv] + [(t, -1) for t in low]
        rings.append([bm.verts.new(P(x + nx * sgn * th / 2 * _naca(t), y + ny * sgn * th / 2 * _naca(t), zl + (zt - zl) * t)) for (t, sgn) in R])
    n = len(rings[0])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(n): bm.faces.new([r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]])
    if cap:
        bm.faces.new(rings[0]); bm.faces.new(rings[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def _span(x0, y0, zl0, zt0, x1, y1, zl1, zt1, th, n=10, curve=1.0, thin=0.22, a=0.0, b=1.0):
    """Stations along a wing, from root to tip. curve bends the leading edge; a, b take a piece of the span."""
    out = []
    for k in range(n + 1):
        t = a + (b - a) * k / n; out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, zl0 + (zl1 - zl0) * t ** curve, zt0 + (zt1 - zt0) * t, th * (1 - (1 - thin) * t)))
    return out

def _wing(p, x0, y0, zl0, zt0, x1, y1, zl1, zt1, th, flap=(0.2, 0.86), split=0.7, curve=1.0, mat='tint', n=10, thin=0.22, light=None):
    """A wing as it is built: the main surface, fixed trailing edge either side, a flap hung behind on its own, hinge fairings under it, a wingtip lens."""
    P_ = (x0, y0, zl0, zt0, x1, y1, zl1, zt1, th); A, B_ = flap
    _aero(p, _span(*P_, n, curve, thin), 0.0, split, mat)
    for (a, b) in ((0.0, A), (B_, 1.0)): _aero(p, _span(*P_, max(2, int(n * (b - a)) + 1), curve, thin, a, b), split, 1.0, mat, 5)
    _aero(p, _span(*P_, max(2, int(n * (B_ - A)) + 1), curve, thin, A + 0.006, B_ - 0.006), split + 0.012, 1.0, mat, 5)
    st = _span(*P_, 4, curve, thin, A + (B_ - A) * 0.12, B_ - (B_ - A) * 0.12)
    for (x, y, zl, zt, h) in st[::1]:
        zh = zl + (zt - zl) * (split - 0.08); _sloft(p, [(zh, y - h * 0.3, 0.012, x, 0.012, 2), (zh - (zt - zl) * 0.12, y - h * 0.34, h * 0.32 + 0.02, x, 0.03, 2), (zh - (zt - zl) * 0.38, y - h * 0.3, 0.012, x, 0.012, 2)], 'metal', 8, per=3) if abs(zt - zl) > 0.5 else None
    if light: add_cyl(p, x1, y1, zl1 + (zt1 - zl1) * 0.42, zl1 + (zt1 - zl1) * 0.5, 0.045, light, 10, axis='z')

def _blade(p, a, b, c, d, t=0.1, mat='tint', n=5):
    """A fin from its corners: a, b along the root and d, c along the tip (either way round). Rounded in front, thin behind, thinner to the tip."""
    (ra, rb), (ta, tb) = (a, b), (d, c)
    rl, rt = (ra, rb) if ra[2] > rb[2] else (rb, ra); tl, tt = (ta, tb) if ta[2] > tb[2] else (tb, ta)
    ch = abs(rl[2] - rt[2]); st = []
    for k in range(n + 1):
        f = k / n; x, y = (rl[0] + rt[0]) / 2, (rl[1] + rt[1]) / 2; X, Y = (tl[0] + tt[0]) / 2, (tl[1] + tt[1]) / 2
        st.append((x + (X - x) * f, y + (Y - y) * f, rl[2] + (tl[2] - rl[2]) * f, rt[2] + (tt[2] - rt[2]) * f, max(t * 1.2, ch * 0.075) * (1 - 0.72 * f)))
    _aero(p, st, 0.0, 1.0, mat, 8)

def _fin(p, pts, mat='tint', t=0.1): _blade(p, pts[0], pts[1], pts[2], pts[3], t, mat)

def _plate(p, pts, mat='tint', t=0.1):
    """A flat sheet: radiators and decks, not wings."""
    bm = bmesh.new(); top = [bm.verts.new(P(x, y + t / 2, z)) for (x, y, z) in pts]; bot = [bm.verts.new(P(x, y - t / 2, z)) for (x, y, z) in pts]
    bm.faces.new(top); bm.faces.new(bot[::-1])
    for k in range(len(pts)): bm.faces.new([top[k], bot[k], bot[(k + 1) % len(pts)], top[(k + 1) % len(pts)]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def _beam(p, a, b, w, mat='rubber'):
    """A strut from a to b: a tube, faceted only where it's too thin to see."""
    bm = bmesh.new(); d = mathutils.Vector(b) - mathutils.Vector(a); L = d.length
    if L < 1e-4: bm.free(); return
    d = d / L; up = mathutils.Vector((0, 1, 0)) if abs(d.y) < 0.9 else mathutils.Vector((1, 0, 0)); s = d.cross(up).normalized() * w / 2; u = s.cross(d).normalized() * w / 2
    A, B = mathutils.Vector(a), mathutils.Vector(b); n = 5 if w < 0.05 else 8 if w < 0.12 else 14; ang = [2 * math.pi * k / n for k in range(n)]
    rs = [[bm.verts.new(P(*(c + math.cos(q) * s + math.sin(q) * u))) for q in ang] for c in (A, B)]
    for k in range(n): bm.faces.new([rs[0][k], rs[0][(k + 1) % n], rs[1][(k + 1) % n], rs[1][k]])
    bm.faces.new(rs[0][::-1]); bm.faces.new(rs[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def _shell(p, x, y, pts, mat, inward=False, n=32, per=0):
    """An open surface of revolution about the z axis through (z, r) points: no caps, so you can see into it."""
    if per: pts = smooth_secs(pts, per)
    bm = bmesh.new(); rings = [[bm.verts.new(P(x + r_ * math.cos(2 * math.pi * k / n), y + r_ * math.sin(2 * math.pi * k / n), z)) for k in range(n)] for (z, r_) in pts]
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(n): bm.faces.new([r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]])
    for f in bm.faces:
        f.normal_update(); c = f.calc_center_median()
        pz = -c.y; radial = mathutils.Vector(P(x, y, pz)); out = (c - radial).dot(f.normal) > 0
        if out == inward: f.normal_flip()
    merge(p, bm, mat)

def _bell(p, x, y, z0, z1, r, ribs=12):
    """A rocket nozzle, built as one: open at the aft end (z0). Outer skin, a dark inside you can look down, a hot throat deep in it, a lip, cooling ribs, and the mount that joins it to the ship."""
    L = z1 - z0
    _shell(p, x, y, [(z0, r), (z0 + L * 0.3, r * 0.84), (z0 + L * 0.7, r * 0.62), (z1, r * 0.5)], 'metal', n=40, per=4)
    _shell(p, x, y, [(z0 + 0.01, r * 0.97), (z0 + L * 0.3, r * 0.8), (z0 + L * 0.6, r * 0.56), (z0 + L * 0.72, r * 0.42)], 'rubber', inward=True, n=40, per=4)
    add_cyl(p, x, y, z0 + L * 0.72, z0 + L * 0.74, r * 0.42, 'glow', 24, axis='z')
    _shell(p, x, y, [(z0 - 0.02 - r * 0.02, r * 0.96), (z0 - 0.02 - r * 0.02, r * 1.03), (z0 + r * 0.06, r * 1.03), (z0 + r * 0.06, r * 0.96)], 'paint', n=40)
    for k in range(ribs):
        a = 2 * math.pi * k / ribs; c, s_ = math.cos(a), math.sin(a)
        _beam(p, (x + c * r * 1.0, y + s_ * r * 1.0, z0 + r * 0.05), (x + c * r * 0.52, y + s_ * r * 0.52, z1), max(0.025, r * 0.035), 'rubber')
    add_cyl(p, x, y, z1 - 0.02, z1 + r * 0.5, r * 0.46, 'paint', 24, axis='z', r2=r * 0.62)

def _nacelle(p, x, y, z0, z1, r, mat='tint'):
    """An engine pod, hollow: a rolled intake lip, a duct you can look down to the fan, service bands and doors on the barrel, a bell aft."""
    L = z1 - z0
    _shell(p, x, y, [(z1 - L * 0.06, r * 0.74), (z1 - 0.01, r * 0.76), (z1 + r * 0.03, r * 0.84), (z1 - r * 0.04, r * 0.97), (z1 - L * 0.16, r), (z0 + L * 0.5, r * 1.02), (z0 + L * 0.16, r * 0.92), (z0 + 0.02, r * 0.66)], mat, n=36, per=4)
    _shell(p, x, y, [(z1 - L * 0.26, r * 0.7), (z1 - 0.005, r * 0.76)], 'rubber', inward=True, n=36)
    fz = z1 - L * 0.24; add_cyl(p, x, y, fz - 0.03, fz, r * 0.7, 'rubber', 28, axis='z')
    _sloft(p, [(fz, y, r * 0.2, x, r * 0.2, 2), (fz + r * 0.28, y, r * 0.15, x, r * 0.15, 2), (fz + r * 0.42, y, 0.006, x, 0.006, 2)], 'metal', 16, per=3)
    for k in range(13):
        a = 2 * math.pi * k / 13; _beam(p, (x + math.cos(a) * r * 0.16, y + math.sin(a) * r * 0.16, fz + 0.02), (x + math.cos(a + 0.22) * r * 0.68, y + math.sin(a + 0.22) * r * 0.68, fz + 0.05), max(0.03, r * 0.05), 'metal')
    for f in (0.24, 0.44, 0.7): _shell(p, x, y, [(z0 + L * f, r * 1.0), (z0 + L * f, r * 1.035), (z0 + L * f + 0.05, r * 1.035), (z0 + L * f + 0.05, r * 1.0)], 'metal', n=36)
    _bell(p, x, y, z0 - r * 0.9, z0 + 0.05, r * 0.82, 10)

def _gear(p, gx, gz, top, r=0.08):
    """A landing leg — now drawn by the game itself, so it can fold away (js/render/ships.js): nothing in the model."""
    return
    add_cyl(p, gx, gz, 0.42, top, r, 'heatshield', 14); add_cyl(p, gx, gz, 0.1, 0.5, r * 0.62, 'metal', 14)
    _beam(p, (gx, 0.62, gz + r * 1.1), (gx, 0.36, gz + r * 2.2), 0.035, 'metal'); _beam(p, (gx, 0.36, gz + r * 2.2), (gx, 0.14, gz + r * 0.9), 0.035, 'metal')
    add_cyl(p, gx, gz, 0.03, 0.12, r * 3.4, 'metal', 20, r2=r * 1.3); add_cyl(p, gx, gz, 0, 0.035, r * 3.6, 'rubber', 20)
def _duct(p, x, y, z, r, depth=0.8):
    """A ducted lift fan: a ring, a hub and blades you can see into."""
    for (a, b, rr0, rr1) in ((z, z + depth, r * 1.08, r * 1.08),):
        add_loft(p, [(a, y, rr0 * 0.88, x, rr0 * 0.88, 2), (a + 0.04, y, rr0, x, rr0, 2), (b - 0.04, y, rr1, x, rr1, 2), (b, y, rr1 * 0.88, x, rr1 * 0.88, 2)], 'tint', 28, axis='z', cap=False)
    add_loft(p, [(z, y, r * 0.88, x, r * 0.88, 2), (z + depth, y, r * 0.88, x, r * 0.88, 2)], 'rubber', 28, axis='z', cap=False)
    add_cyl(p, x, y, z + depth * 0.45, z + depth * 0.6, r * 0.86, 'glow', 24, axis='z')
    add_cyl(p, x, y, z - 0.1, z + depth + 0.1, r * 0.22, 'metal', 14, axis='z')
    for k in range(7):
        a = 2 * math.pi * k / 7; _beam(p, (x, y, z + depth * 0.3), (x + math.cos(a) * r * 0.86, y + math.sin(a) * r * 0.86, z + depth * 0.3), 0.09, 'metal')

def _container(p, x0, y0, z0, x1, y1, z1, mat='tint'):
    """A cargo box: corner posts, ribbed sides."""
    add_box(p, x0, y0, z0, x1, y1, z1, mat, 0.015)
    for x in (x0 - 0.02, x1 - 0.06):
        for z in (z0 - 0.02, z1 - 0.06): add_box(p, x, y0 - 0.02, z, x + 0.08, y1 + 0.02, z + 0.08, 'metal', 0.004)
    n = max(2, int((z1 - z0) / 0.55))
    for k in range(1, n):
        z = z0 + (z1 - z0) * k / n
        add_box(p, x0 - 0.02, y0 + 0.08, z, x0 + 0.01, y1 - 0.08, z + 0.05, 'paint', 0.002); add_box(p, x1 - 0.01, y0 + 0.08, z, x1 + 0.02, y1 - 0.08, z + 0.05, 'paint', 0.002)

def _radiator(p, x0, y, z0, x1, z1, tilt=0.0):
    """A heat radiator: a thin black panel between silver feeder pipes."""
    _plate(p, [(x0, y, z0), (x0, y, z1), (x1, y + tilt, z1), (x1, y + tilt, z0)], 'heatshield', 0.05)
    n = int(abs(z1 - z0) / 0.45)
    for k in range(n + 1):
        z = z0 + (z1 - z0) * k / max(1, n); _beam(p, (x0, y + 0.04, z), (x1, y + tilt + 0.04, z), 0.03, 'metal')

def _stern(p, sec, xc, dx0, dx1, deck, dtop, z):
    """The aft bulkhead: a smooth plate from the hull's edge in to the door's frame."""
    _, cy_, ry, _, rx, e = sec; n = 72; dy = (deck + dtop) / 2; hw_, hh_ = (dx1 - dx0) / 2, (dtop - deck) / 2; dx = (dx0 + dx1) / 2; bm = bmesh.new(); O = []; I = []
    for k in range(n):
        a = 2 * math.pi * k / n; ox = xc + rx * math.copysign(abs(math.cos(a)) ** (2 / e), math.cos(a)); oy = cy_ + ry * math.copysign(abs(math.sin(a)) ** (2 / e), math.sin(a))
        u, v = ox - dx, oy - dy; t = min(hw_ / abs(u) if abs(u) > 1e-6 else 1e9, hh_ / abs(v) if abs(v) > 1e-6 else 1e9)
        O.append(bm.verts.new(P(ox, oy, z))); I.append(bm.verts.new(P(dx + u * t, dy + v * t, z)))
    for k in range(n): bm.faces.new([O[k], O[(k + 1) % n], I[(k + 1) % n], I[k]])
    for f in bm.faces:
        f.normal_update()
        if f.normal.dot(mathutils.Vector(P(0, 0, -1)) - mathutils.Vector(P(0, 0, 0))) < 0: f.normal_flip()
    merge(p, bm, 'tint')

def _stern_dress(p, xc, dx0, dx1, deck, dtop, z, hw, cy, hh):
    """Round the ramp door: a frame, the rams that work the ramp, work lights, a pipe run across the bulkhead."""
    for x in (dx0 - 0.1, dx1 + 0.1): _beam(p, (x, deck, z - 0.04), (x, dtop + 0.08, z - 0.04), 0.14, 'metal')
    _beam(p, (dx0 - 0.1, dtop + 0.08, z - 0.04), (dx1 + 0.1, dtop + 0.08, z - 0.04), 0.14, 'metal')
    for x in (dx0 - 0.34, dx1 + 0.34):
        _beam(p, (x, dtop - 0.1, z - 0.06), (x, deck + 0.2, z - 0.42), 0.09, 'heatshield'); _beam(p, (x, deck + 0.75, z - 0.26), (x, deck + 0.12, z - 0.5), 0.045, 'metal')
        add_cyl(p, x, dtop + 0.26, z - 0.1, z - 0.03, 0.08, 'navwhite', 12, axis='z')
    y = deck + (dtop - deck) * 0.5
    for s in (-1, 1):
        q = dx1 + 0.6 if s > 0 else dx0 - 0.6; e_ = xc + s * hw * 0.82
        for dy in (0, 0.14): _beam(p, (q, y + dy, z - 0.05), (e_, y + dy, z - 0.05), 0.05, 'metal')

def _cheeks(p, xc, dx0, dx1, hw, cy, hh, hz0):
    """Either side of the door the hull runs on aft and tapers away, so a ship doesn't end in a flat drum."""
    for s, inner in ((-1, dx0 - 0.18), (1, dx1 + 0.18)):
        outer = xc + s * hw * 0.96; rx = abs(outer - inner) / 2
        if rx < 0.25: continue
        xm = (outer + inner) / 2
        _sloft(p, [(hz0 + 0.9, cy, hh * 0.88, xm, rx, 2.4), (hz0, cy - hh * 0.04, hh * 0.8, xm, rx * 0.96, 2.4), (hz0 * 0.66, cy + hh * 0.08, hh * 0.46, xm, rx * 0.68, 2.2), (hz0 * 0.4, cy + hh * 0.18, hh * 0.2, xm, rx * 0.34, 2.1), (hz0 * 0.26, cy + hh * 0.22, 0.02, xm, 0.03, 2)], 'tint', 36, per=6)

def _inward(B, bm):
    for f in bm.faces:
        f.normal_update(); c = f.calc_center_median(); z = -c.y; cy, ry, cx, rx, e = B.sect(z)
        if (c - mathutils.Vector(P(cx, cy, z))).dot(f.normal) > 0: f.normal_flip()

def _strip(p, B, rows, mat, inward=True):
    bm = bmesh.new(); V = [[bm.verts.new(P(*q)) for q in r_] for r_ in rows]
    for r0, r1 in zip(V, V[1:]):
        for j in range(len(r0) - 1):
            if (r0[j].co - r0[j + 1].co).length + (r1[j].co - r1[j + 1].co).length < 1e-5: continue
            bm.faces.new([r0[j], r0[j + 1], r1[j + 1], r1[j]])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    (_inward if inward else _outward)(B, bm); merge(p, bm, mat)

def _ang_at_y(B, z, y, lift):
    """The angle (−90..90, the +x side) at which the hull's skin, lifted by `lift`, is at height y; None if the section doesn't reach y."""
    lo, hi = -90.0, 90.0
    if B.at(z, lo, lift)[1] > y: return -90.0
    if B.at(z, hi, lift)[1] < y: return None
    for _ in range(30):
        m = (lo + hi) / 2
        if B.at(z, m, lift)[1] < y: lo = m
        else: hi = m
    return (lo + hi) / 2

def _glass_plan(B, lay, f, ext=0.0):
    """Where the canopy is, from the cockpit inside it: it starts just behind the pilot's head and runs forward until the nose has
    dropped to the dash; at each station its edge comes down the hull as far as the dash line (times f: less glass on an armoured
    ship). The same plan draws the glass outside and cuts the opening in the lining inside, so the two always agree."""
    deck = lay['deck']; sill = deck + 1.02; hz1 = lay['hull'][3]
    R = next((q for q in lay['rooms'] if q.get('purpose') == 'cockpit'), None); zc0 = R['rect'][1] if R else hz1 - 3.2
    pz = next((q['z'] for q in lay['seats'] if q['kind'] == 'pilot'), hz1 - 1.6)
    z0 = max(zc0 + 0.25, pz - 1.35); z1 = hz1
    while z1 < lay['D'] and B.at(z1 + 0.05, 90, 0)[1] > sill + 0.16 and z1 < pz + 6.0: z1 += 0.05
    def edge(z):
        a = _ang_at_y(B, z, sill, 0.0)
        return 0.0 if a is None else max(0.0, min(84.0, (90 - a) * f))
    return z0, z1 + ext, edge

def _glass_cockpit(p, lay, secs, f=0.9, bulge=0.18, k=3.0, bows=(0.25, 0.5, 0.75)):
    """For a hull lofted straight through its sections (no smoothing): the canopy drawn from the cockpit, and what the cockpit needs to match it."""
    B = Body(secs); B.secs = list(secs)
    cz0, cz1, edge = _glass_plan(B, lay, f)
    _canopy(p, B, cz0, cz1, 60, bulge, k, bows=bows, edge=edge)
    _GLASS[0] = lambda z, ang: cz0 - 0.1 < z < cz1 + 0.1 and abs(ang - 90) < edge(min(cz1, max(cz0, z))) + 4
    return dict(B=B, cz0=cz0, cz1=cz1, half=60, bulge=bulge, k=k, bows=bows, edge=edge)

def _cockpit(p, lay, ck, zc0):
    """The cockpit is the inside of the nose: a lining that follows the hull's own curve, open where the canopy is, the canopy's
    frame seen from within, a floor that runs on into the nose, a glare shield over the instruments. What you see from the pilot's
    seat is what the ship looks like from outside."""
    B = ck['B']; deck = lay['deck']; ceil = lay['ceiling']; hx0, hz0, hx1, hz1 = lay['hull']; xc = (hx0 + hx1) / 2
    cz0, cz1, half, bulge, k = ck['cz0'], ck['cz1'], ck['half'], ck['bulge'], ck['k']; LN = -0.07
    def shape(t):
        if ck.get('edge'): return (1 - max(0.0, 1 - t / 0.3) ** k) ** (1 / k)
        m = max(0.0, 1 - abs(2 * t ** 0.72 - 1) ** k); return m ** (1 / k)
    def hc(z):
        if not (cz0 < z < cz1): return 0.0
        return (ck['edge'](z) if ck.get('edge') else half) * shape((z - cz0) / (cz1 - cz0))
    # how far the lining runs forward: until the nose has closed down to the floor
    zend = zc0
    while zend < lay['D'] and (B.at(zend + 0.05, 90, LN)[1] > deck + 0.35): zend += 0.05
    zs = []; z = zc0
    while z < zend: zs.append(z); z += 0.08
    zs.append(zend)
    for z_ in (cz0, cz1):
        if zc0 < z_ < zend: zs.append(z_)
    zs = sorted(set(round(q, 4) for q in zs)); NA = 22
    # the lining, in two strips (right and left of the centre line) that meet over the top where there's no glass between them
    for side in (1, -1):
        rows, reveal, floor_ = [], [], []
        for z in zs:
            ar = _ang_at_y(B, z, deck, LN)
            if ar is None: continue
            h = hc(z); a0, a1 = (ar, 90 - h) if side > 0 else (90 + h, 180 - ar)
            rows.append([B.at(z, a0 + (a1 - a0) * j / NA, LN) for j in range(NA + 1)])
            ae = 90 - h if side > 0 else 90 + h
            reveal.append([B.at(z, ae, LN), B.at(z, ae, 0.03)])
            q = B.at(z, ar, LN); floor_.append([(xc, deck - 0.004, z), (q[0], deck - 0.004, z)])
        _strip(p, B, rows, 'paint')
        if any(hc(z) > 0 for z in zs): _strip(p, B, reveal, 'metal')
        bm = bmesh.new(); V = [[bm.verts.new(P(*q)) for q in r_] for r_ in floor_]
        for r0, r1 in zip(V, V[1:]): bm.faces.new([r0[0], r0[1], r1[1], r1[0]])
        for f in bm.faces:
            f.normal_update()
            if f.normal.z < 0: f.normal_flip()
        merge(p, bm, 'rubber')
    # frames: a rib round the lining every 0.55 m, broken where the glass is; a lit strip low down each side
    z = zc0 + 0.35
    while z < zend - 0.25:
        ar = _ang_at_y(B, z, deck, LN)
        if ar is not None:
            h = hc(z)
            for (a0, a1) in ((ar + 3, 90 - h), (90 + h, 177 - ar)):
                if a1 - a0 < 2: continue
                _strip(p, B, [[B.at(z - 0.035, a0 + (a1 - a0) * j / 16, -0.12) for j in range(17)], [B.at(z + 0.035, a0 + (a1 - a0) * j / 16, -0.12) for j in range(17)]], 'metal')
        z += 0.55
    for side in (1, -1):
        rows = []
        for z in zs:
            ar = _ang_at_y(B, z, deck + 0.12, LN - 0.01)
            if ar is None: continue
            a = ar if side > 0 else 180 - ar; rows.append([B.at(z, a, LN - 0.01), B.at(z, a + side * 1.6, LN - 0.01)])
        if len(rows) > 1: _strip(p, B, rows, 'glow')
    # the canopy from inside: its glass (seen from below it catches the sky), the bows across it and the rails along its edges
    if cz1 > zc0:
        def pt(t, u, ex=0.0):
            z_ = cz0 + (cz1 - cz0) * t; m = shape(t); fr = min(1.0, (1 - t) / 0.2) ** 0.6 if ck.get('edge') else 1.0; a = 90 + (ck['edge'](z_) if ck.get('edge') else half) * m * u; L = bulge * fr * (m ** 0.75) * max(0.0, 1 - abs(u) ** 2.6) ** 0.5 + 0.012 + ex
            return B.at(cz0 + (cz1 - cz0) * t, a, L)
        nz, na = 60, 22
        _strip(p, B, [[pt(i / nz, -1 + 2 * j / na, -0.006) for j in range(na + 1)] for i in range(nz + 1)], 'glass')
        W = 0.045 / max(0.5, cz1 - cz0)
        for t in ck['bows']:
            if cz0 + (cz1 - cz0) * t < zc0: continue
            _strip(p, B, [[pt(t - W, -1 + 2 * j / na, -0.03) for j in range(na + 1)], [pt(t + W, -1 + 2 * j / na, -0.03) for j in range(na + 1)]], 'metal')
        for u in (-0.96, 0.96): _strip(p, B, [[pt(i / nz, u - 0.04, -0.03), pt(i / nz, u + 0.04, -0.03)] for i in range(1, nz)], 'metal')
    # the bulkhead at the back of the cockpit: everything between the cabin's box and the hull's curve
    zb = zc0
    cy, ry, cx, rx, e = B.sect(zb); ytop = cy + ry + LN; NY = 48
    for kk in range(NY):
        y0_, y1_ = deck + (ytop - deck) * kk / NY, deck + (ytop - deck) * (kk + 1) / NY; ym = (y0_ + y1_) / 2
        ar = _ang_at_y(B, zb, ym, LN)
        if ar is None: continue
        xr = B.at(zb, ar, LN)[0]; xl = 2 * cx - xr
        if ym < ceil + 0.12:
            if xl < hx0 - 0.01: add_box(p, xl, y0_, zb - 0.05, hx0, y1_, zb + 0.05, 'paint', 0)
            if xr > hx1 + 0.01: add_box(p, hx1, y0_, zb - 0.05, xr, y1_, zb + 0.05, 'paint', 0)
        else: add_box(p, xl, y0_, zb - 0.05, xr, y1_, zb + 0.05, 'paint', 0)
    # the glare shield: a shelf over the instruments, from the console forward to the skin, a row of screens set in it
    yd = deck + 1.0; z = hz1 - 0.06; rows = []; zstop = min(zend, cz1 if cz1 > hz1 else zend)
    while z < zstop:
        ar = _ang_at_y(B, z, yd, LN)
        if ar is None: break
        xr = B.at(z, ar, LN)[0]; rows.append([(2 * xc - xr, yd, z), (xr, yd, z)]); z += 0.06
    if len(rows) > 1:
        bm = bmesh.new(); V = [[bm.verts.new(P(*q)) for q in r_] for r_ in rows]
        for r0, r1 in zip(V, V[1:]): bm.faces.new([r0[0], r0[1], r1[1], r1[0]])
        for f in bm.faces:
            f.normal_update()
            if f.normal.z < 0: f.normal_flip()
        merge(p, bm, 'paint')
        zf = min(hz1 + 0.5, rows[-1][0][2] - 0.05); wd = min(xc - rows[0][0][0], 1.6)
        for kk in (-1, 0, 1):
            x0 = xc + kk * wd * 0.62 - wd * 0.28
            add_box(p, x0, yd, hz1 + 0.02, x0 + wd * 0.56, yd + 0.012, min(zf, hz1 + 0.34), 'screen', 0)
        add_box(p, 2 * xc - rows[0][1][0] + 0.02, yd - 0.04, hz1 - 0.08, rows[0][1][0] - 0.02, yd + 0.025, hz1 - 0.04, 'metal', 0)
    # in front of the glass the nose is closed off above the dash: a bulkhead across it, where the glass ends
    if hz1 < cz1 < zend - 0.1:
        cy, ry, cx, rx, e = B.sect(cz1); ytop = cy + ry + LN; NY = 80
        for kk in range(NY):
            y0_, y1_ = yd + (ytop - yd) * kk / NY, yd + (ytop - yd) * (kk + 1) / NY
            ar = _ang_at_y(B, cz1, (y0_ + y1_) / 2, LN)
            if ar is None: continue
            xr = B.at(cz1, ar, LN)[0]; add_box(p, 2 * cx - xr, y0_, cz1 - 0.04, xr, y1_, cz1 + 0.04, 'paint', 0)
    return zend

def sleek_ship(p, lay, r, C, v):
    """Fast, clean, nothing bolted on: a long smooth body, blended wings with real aerofoils and their flaps, engines faired in, glass in a frame. A bright trim line, lights in the tips."""
    hx0, hz0, hx1, hz1 = lay['hull']; deck = lay['deck']; ceil = lay['ceiling']; xc = (hx0 + hx1) / 2; W, D = lay['W'], lay['D']; a, b = (hx1 - hx0) / 2 + 0.06, (ceil + 0.14 - (deck - 0.24)) / 2; cy = (ceil + 0.14 + deck - 0.24) / 2; nose = D - 0.45; NL = nose - hz1; L = hz1 - hz0
    e = {'racer': 2.6, 'arrow': 2.3}.get(C, 2.0); hw = max(a * ({'racer': 1.26}.get(C, 1.34)), W / 2 * {'arrow': 0.24, 'manta': 0.62, 'wraith': 0.27, 'racer': 0.2}[C]); hh = _fit_ry(a, b, hw, e) * 1.04
    # the nose is drawn out as a curve: flat-sided and dropping at the tip on the racers, spade-broad on the manta
    pw, ph, droop = {'arrow': (1.7, 1.5, 0.3), 'racer': (1.5, 1.35, 0.34), 'manta': (2.7, 1.8, 0.2), 'wraith': (1.8, 1.55, 0.26)}[C]
    secs = [(hz0, cy, hh * 0.97, xc, hw * 0.97, e), (hz0 + 0.6, cy, hh, xc, hw, e), (hz1 + 0.3, cy, hh, xc, hw, e)]
    for t in (0.1, 0.22, 0.35, 0.48, 0.6, 0.72, 0.83, 0.92, 0.975, 1): secs.append((hz1 + 0.3 + (NL - 0.3) * t, cy - droop * hh * t * t, max(0.012, hh * (1 - t ** ph)), xc, max(0.012, hw * (1 - t ** pw)), e + (2.0 - e) * t))
    B = Body(secs); hull_loft(p, B.secs, 'tint', (xc, cy, (hz0 + hz1) / 2), n=72); sect = B.sect
    d0 = lay['doors'][0]; dx0, dx1 = d0['x'] - d0['width'] / 2, d0['x'] + d0['width'] / 2; dtop = deck + d0.get('height', 2.15)
    _stern(p, secs[0], xc, dx0, dx1, deck, dtop, hz0 - 0.05); _stern_dress(p, xc, dx0, dx1, deck, dtop, hz0 - 0.05, hw, cy, hh); _cheeks(p, xc, dx0, dx1, hw, cy, hh, hz0)
    # the tail boat-tails away over the door
    top0 = cy + hh * 0.98; under = dtop + 0.1; ry_t = max(0.2, (top0 - under) / 2); cy_t = under + ry_t; tail = 0.05; tw = hw * 0.84
    _sloft(p, [(hz0 + 0.9, cy_t, ry_t, xc, hw * 0.9, 2), (hz0, cy_t, ry_t * 0.98, xc, tw, 2), (hz0 * 0.5, cy_t + ry_t * 0.1, ry_t * 0.72, xc, tw * 0.8, 2), (tail + 0.25, cy_t + ry_t * 0.18, ry_t * 0.42, xc, tw * 0.5, 2), (tail, cy_t + ry_t * 0.18, ry_t * 0.32, xc, tw * 0.42, 2)], 'tint', 48, per=5)
    ey = cy_t + ry_t * 0.18
    # the canopy
    bulge, gf = {'arrow': (0.3, 0.9), 'racer': (0.34, 0.8), 'manta': (0.26, 0.75), 'wraith': (0.32, 0.85)}[C]
    cz0, cz1, edge = _glass_plan(B, lay, gf); half = 60
    _canopy(p, B, cz0, cz1, half, bulge, bows=(0.36, 0.64), edge=edge); CK = dict(B=B, cz0=cz0, cz1=cz1, half=half, bulge=bulge, k=2.2, bows=(0.36, 0.64), edge=edge)
    clear = lambda z, ang: not (cz0 - 0.1 < z < cz1 + 0.1 and abs(ang - 90) < edge(min(cz1, max(cz0, z))) + 4)
    _GLASS[0] = lambda z, ang: not clear(z, ang)
    _plating(p, B, hz0 + 0.5, hz1 + NL * 0.62, r, clear, 0.72)
    span = W / 2; y0 = cy - hh * 0.2
    if C == 'arrow':
        for s in (-1, 1):
            root = xc + s * hw * 0.72
            _wing(p, root, y0, hz0 + L * 0.98, 0.5, xc + s * span, y0 - 0.14, 1.9, 0.5, 0.62, curve=1.2, light='navgreen' if s > 0 else 'navred')
            _aero(p, _span(xc + s * hw * 0.6, y0 + 0.04, hz1 + NL * 0.5, hz0 + L * 0.5, xc + s * hw * 1.42, y0, hz0 + L * 0.8, hz0 + L * 0.42, 0.2, 8, 1.3, 0.1))        # the strake: a blade of wing run forward along the nose
            _blade(p, (xc + s * hw * 0.42, cy + hh * 0.72, 0.5), (xc + s * hw * 0.42, cy + hh * 0.72, hz0 + L * 0.34), (xc + s * (hw * 0.42 + 0.9), cy + hh + 1.5, 0.75), (xc + s * (hw * 0.42 + 0.9), cy + hh + 1.5, -0.05), 0.07)
            ex = xc + s * tw * 0.5; _sloft(p, [(hz0 + L * 0.7, ey, 0.05, ex, 0.05, 2), (hz0 + L * 0.2, ey, 0.34, ex, 0.4, 2), (0.6, ey, 0.42, ex, 0.46, 2), (0.14, ey, 0.38, ex, 0.42, 2)], 'tint', 28); _bell(p, ex, ey, -0.32, 0.16, 0.38, 10)
            _vent(p, B, hz0 + L * 0.5, 40 if s > 0 else 126)
    elif C == 'racer':
        # a dart: everything swept back from a long flat nose, big twin bells, engine pods out on the tips of the wings, and a single knife of a fin
        for s in (-1, 1):
            tip = xc + s * span * 0.98; yt = y0 + 0.24; root = xc + s * hw * 0.7
            _wing(p, root, y0, hz0 + L * 0.9, hz0 - 1.2, tip, yt, hz0 + L * 0.02, -0.15, 0.62, curve=0.9, thin=0.3)
            _aero(p, _span(xc + s * hw * 0.55, y0 - 0.05, hz1 + NL * 0.62, hz0 + L * 0.6, xc + s * hw * 1.5, y0, hz0 + L * 0.88, hz0 + L * 0.5, 0.2, 10, 1.25, 0.12))
            _nacelle(p, tip, yt, 0.3, hz0 + L * 0.7, 0.42)
            add_cyl(p, tip, yt + 0.42, hz0 + L * 0.3, hz0 + L * 0.34, 0.035, 'navgreen' if s > 0 else 'navred', 8, axis='z')
            _blade(p, (tip, yt + 0.32, 0.3), (tip, yt + 0.32, 1.9), (tip + s * 0.14, yt + 1.15, 0.5), (tip + s * 0.14, yt + 1.15, -0.1), 0.06)
            _blade(p, (tip, yt - 0.32, 0.5), (tip, yt - 0.32, 1.6), (tip + s * 0.08, yt - 0.92, 0.65), (tip + s * 0.08, yt - 0.92, 0.1), 0.05)
            ex = xc + s * tw * 0.46; _sloft(p, [(hz0 + L * 0.6, ey, 0.05, ex, 0.05, 2), (hz0 + L * 0.15, ey, 0.42, ex, 0.46, 2), (0.5, ey, 0.5, ex, 0.5, 2), (0.14, ey, 0.46, ex, 0.46, 2)], 'tint', 28); _bell(p, ex, ey, -0.5, 0.16, 0.46, 14)
            _vent(p, B, hz0 + L * 0.55, 34 if s > 0 else 132); _vent(p, B, hz0 + L * 0.28, 34 if s > 0 else 132)
            _seam_long(p, B, hz0 + 0.8, hz1 + NL * 0.86, 90 + s * 11, 0.12, 'paint', 0.008)
        _blade(p, (xc, cy + hh * 0.84, -0.4 + 0.9), (xc, cy + hh * 0.84, hz0 + L * 0.5), (xc, cy + hh + 1.75, 0.35), (xc, cy + hh + 1.8, -0.75), 0.09)
    elif C == 'manta':
        # the whole thing is the wing: lifting body running out to tips, engines as a slot of bells in the trailing edge
        cw = hz0 + L * 0.4; yw = cy - hh * 0.28
        for s in (-1, 1):
            _wing(p, xc + s * hw * 0.42, yw, cw + D * 0.42, cw - D * 0.34, xc + s * span, yw + 0.55, cw - D * 0.24, cw - D * 0.34 + 0.05, hh * 1.05, flap=(0.34, 0.92), split=0.78, curve=1.5, n=14, thin=0.1, light='navgreen' if s > 0 else 'navred')
            _blade(p, (xc + s * span * 0.97, yw + 0.55, hz0 - 2.4), (xc + s * span * 0.97, yw + 0.55, hz0 - 0.6), (xc + s * span * 1.02, yw + 1.7, hz0 - 2.1), (xc + s * span * 1.02, yw + 1.7, hz0 - 2.7), 0.04)
            for k_ in range(3):
                bx_ = xc + s * (hw * 0.55 + k_ * 0.82); by_ = ey - 0.1 - k_ * 0.03
                _sloft(p, [(hz0 + L * 0.5, by_, 0.04, bx_, 0.04, 2), (hz0 + 0.2, by_, 0.34, bx_, 0.38, 2), (0.5, by_, 0.36, bx_, 0.4, 2), (0.42, by_, 0.33, bx_, 0.37, 2)], 'tint', 24)
                _bell(p, bx_, by_, -0.1, 0.45, 0.33, 8)
    else:  # wraith: long, curved, gull wings and twin booms
        for s in (-1, 1):
            bx = xc + s * span * 0.55; by = cy + hh * 0.05 + 0.75
            _wing(p, xc + s * hw * 0.7, cy + hh * 0.05, hz0 + L * 1.1, hz0 + L * 0.3, bx, by, hz0 + L * 0.82, hz0 + L * 0.18, 0.42, n=7, thin=0.6, flap=(0.18, 0.84))
            _sloft(p, [(-0.1, by, 0.34, bx, 0.34, 2), (hz0 * 0.5, by, 0.44, bx, 0.44, 2), (hz0 + L * 0.5, by, 0.4, bx, 0.4, 2), (hz1 + NL * 0.25, by - 0.05, 0.16, bx, 0.16, 2), (hz1 + NL * 0.42, by - 0.08, 0.012, bx, 0.012, 2)], 'tint', 28, per=7)
            _bell(p, bx, by, -0.55, -0.05, 0.34, 10)
            _wing(p, bx, by, hz0 + L * 0.34, hz0 - L * 0.1, xc + s * span, by - 0.62, hz0 - L * 0.22, hz0 - L * 0.32, 0.2, n=8, flap=(0.1, 0.8), thin=0.15, light='navgreen' if s > 0 else 'navred')
            _blade(p, (bx, by + 0.2, 0.1), (bx, by + 0.2, 1.8), (bx + s * 0.1, by + 1.5, 0.2), (bx + s * 0.1, by + 1.5, -0.4), 0.05)
    # a thin bright line down each flank, the only ornament
    for s in (-1, 1):
        _seam_long(p, B, hz0 + 0.4, hz1 + NL * 0.7, 6 if s > 0 else 174, 0.05, 'glow' if C == 'wraith' else 'metal', 0.008)
        _rcs(p, B, hz1 + NL * 0.42, 20 if s > 0 else 160); _rcs(p, B, hz0 + 0.9, 28 if s > 0 else 152)
    _beam(p, (xc, cy - droop * hh, nose - 0.03), (xc, cy - droop * hh, nose + 0.4), 0.03, 'metal')       # the pitot probe
    _skin(p, B, hz0 + L * 0.55, hz0 + L * 0.68, 87, 93, 0.03, 'metal', 2, 1); _beam(p, B.at(hz0 + L * 0.62, 90, 0.02), (xc, cy + hh + 0.55, hz0 + L * 0.52), 0.03, 'metal')    # antenna
    for (gx, gz) in ((xc - hw * 0.55, hz0 + 1), (xc + hw * 0.55, hz0 + 1), (xc, hz1 + NL * 0.2)): _gear(p, gx, gz, cy - hh * 0.6, 0.07)
    ship_interior(p, lay, CK)

def designed_ship(p, L_, D_, H_, r, model):
    _GLASS[0] = None
    lay = SHIPCAT[model]; C = lay['cls']; v = int(model[-1])
    if C in ('arrow', 'manta', 'wraith', 'racer'): return sleek_ship(p, lay, r, C, v)
    hx0, hz0, hx1, hz1 = lay['hull']; deck = lay['deck']; ceil = lay['ceiling']; xc = (hx0 + hx1) / 2; W, D = lay['W'], lay['D']
    a, b = (hx1 - hx0) / 2 + 0.06, (ceil + 0.14 - (deck - 0.24)) / 2; cy = (ceil + 0.14 + deck - 0.24) / 2
    nose = D - 0.2; NL = nose - hz1; L = hz1 - hz0
    # the shape of the section and how the nose closes, class by class: (exponent, body half-width as a share of the ship's half-width, nose stations (t along the nose, dy, ry, rx, e))
    if C == 'gunship': e, wide, ns = 1.4, 0.56, [(0.3, -0.02, 0.76, 0.86, 1.3), (0.68, -0.14, 0.32, 0.5, 1.2), (1, -0.24, 0.04, 0.1, 1.2)]
    elif C == 'dropship':e, wide, ns = 2.6, 0.58, [(0.45, -0.06, 0.8, 0.92, 2.4), (0.85, -0.2, 0.44, 0.78, 2.2), (1, -0.28, 0.2, 0.56, 2.0)]
    elif C == 'hauler':  e, wide, ns = 3.4, 0.48, [(0.5, 0.0, 0.92, 0.94, 3.2), (0.86, -0.1, 0.62, 0.74, 2.8), (1, -0.18, 0.28, 0.42, 2.4)]
    elif C == 'miner':   e, wide, ns = 3.0, 0.52, [(0.42, 0.04, 0.88, 0.92, 2.8), (0.82, -0.06, 0.6, 0.66, 2.4), (1, -0.14, 0.26, 0.3, 2.2)]
    elif C == 'ferry':   e, wide, ns = 2.2, 0.66, [(0.4, -0.06, 0.8, 0.8, 2.1), (0.76, -0.2, 0.42, 0.44, 2.0), (1, -0.3, 0.05, 0.06, 2)]
    elif C == 'explorer':e, wide, ns = 2.2, 0.6, [(0.36, 0.02, 0.84, 0.84, 2.1), (0.72, 0.0, 0.5, 0.5, 2.0), (1, -0.02, 0.1, 0.1, 2)]
    else:                e, wide, ns = 2.0, 0.62, [(0.42, -0.04, 0.84, 0.84, 2.0), (0.8, -0.12, 0.5, 0.52, 2.0), (1, -0.18, 0.08, 0.1, 2)]     # runabout: a smooth egg
    hw = max(a * 1.1, W / 2 * wide); hh = _fit_ry(a, b, hw, e) * 1.05
    secs = [(hz0, cy, hh * 0.97, xc, hw * 0.97, e), (hz0 + 0.8, cy, hh, xc, hw, e), (hz1 + 0.35, cy, hh, xc, hw, e)]
    for (t, dy, ry, rx, ee) in ns: secs.append((hz1 + 0.35 + (NL - 0.35) * t, cy + dy * hh, max(0.02, hh * ry), xc, max(0.02, hw * rx), ee))
    BD = Body(secs); hull_loft(p, BD.secs, 'tint', (xc, cy, (hz0 + hz1) / 2), n=72); sect = BD.sect
    def top_y(x, z):
        c_, ry, cx, rx, ee = sect(z); q = 1 - min(1, abs((x - cx) / rx)) ** ee; return c_ + ry * max(q, 0) ** (1 / ee)
    def side_x(y, z):
        c_, ry, cx, rx, ee = sect(z); q = 1 - min(1, abs((y - c_) / ry)) ** ee; return rx * max(q, 0) ** (1 / ee)
    # the stern, round the ramp door
    d0 = lay['doors'][0]; dx0, dx1 = d0['x'] - d0['width'] / 2, d0['x'] + d0['width'] / 2; dtop = deck + d0.get('height', 2.15)
    _stern(p, secs[0], xc, dx0, dx1, deck, dtop, hz0 - 0.05)
    _stern_dress(p, xc, dx0, dx1, deck, dtop, hz0 - 0.05, hw, cy, hh); _cheeks(p, xc, dx0, dx1, hw, cy, hh, hz0)
    # The tail: the roof runs on aft over the door and narrows, so the ship ends in an engine deck, not a wall. The door sits under it.
    top0 = cy + hh * 0.98; under = dtop + 0.14; ry_t = max(0.25, (top0 - under) / 2); cy_t = under + ry_t; tail = max(0.25, 0.25 * hz0)
    tail_e = max(2.0, e); tail_w = hw * 0.78
    _sloft(p, [(hz0 + 0.9, cy_t, ry_t, xc, hw * 0.88, tail_e), (hz0, cy_t, ry_t, xc, tail_w, tail_e), (hz0 * 0.5 + tail * 0.5, cy_t + ry_t * 0.1, ry_t * 0.86, xc, tail_w * 0.92, tail_e), (tail, cy_t + ry_t * 0.2, ry_t * 0.66, xc, tail_w * 0.78, tail_e)], 'tint', 48)
    deck_y = cy_t + ry_t * 0.2; deck_ry = ry_t * 0.66; deck_rx = tail_w * 0.78
    # the canopy: glass in a frame; how much of the nose it takes is the ship's character. Squarer on the working ships, more bows across it.
    half, bg, kk, gf = {'runabout': (66, 0.22, 2.4, 1.0), 'ferry': (54, 0.14, 4, 0.9), 'explorer': (60, 0.18, 3, 1.0), 'gunship': (36, 0.1, 5, 0.7), 'dropship': (52, 0.12, 5, 0.85), 'hauler': (54, 0.1, 6, 0.85), 'miner': (50, 0.1, 6, 0.8)}[C]
    cz0, cz1, edge = _glass_plan(BD, lay, gf); bows = (0.25, 0.5, 0.75) if kk > 3 else (0.34, 0.62)
    _canopy(p, BD, cz0, cz1, half, bg, kk, bows=bows, edge=edge); CK = dict(B=BD, cz0=cz0, cz1=cz1, half=half, bulge=bg, k=kk, bows=bows, edge=edge)
    clear = lambda z, ang: not (cz0 - 0.1 < z < cz1 + 0.1 and abs(ang - 90) < edge(min(cz1, max(cz0, z))) + 4)
    _GLASS[0] = lambda z, ang: not clear(z, ang)
    _plating(p, BD, hz0 + 0.5, hz1 + NL * 0.5, r, clear)
    # a heat-shielded belly: separate tiles, gaps between them
    z_ = hz0 + 0.3; tn = 5
    while z_ < hz1 + NL * 0.55:
        for k in range(tn): _skin(p, BD, z_, z_ + 0.96, 232 + k * 76 / tn + 0.5, 232 + (k + 1) * 76 / tn - 0.5, 0.022, 'heatshield', 2, 2)
        z_ += 1.0
    gear = [(xc - hw * 0.62, hz0 + 1.0), (xc + hw * 0.62, hz0 + 1.0), (xc - hw * 0.5, hz1 - 0.4), (xc + hw * 0.5, hz1 - 0.4)]
    ty = cy + hh * 0.96; stern = hz0 - 0.1

    if C == 'racer':
        # all engine and blade: a huge bell, forward-swept blades with wingtip pods, one tall dorsal knife
        for sx in (-1, 1): _bell(p, xc + sx * deck_rx * 0.48, deck_y, 0.0, tail + 0.05, min(deck_ry, deck_rx * 0.42) * 0.98, 14)
        span = 0.7 + 0.6 * v + max(0, W / 2 - hw)
        for s in (-1, 1):
            root, tip = xc + s * hw * 0.92, xc + s * (hw + span); y0 = cy - hh * 0.25
            _plate(p, [(root, y0, hz0 + L * 0.0), (root, y0, hz0 + L * 0.55), (tip, y0 + 0.28, hz1 + NL * 0.14), (tip, y0 + 0.28, hz1 - L * 0.1)], 'tint', 0.1)
            _nacelle(p, tip, y0 + 0.28, hz1 - L * 0.5, hz1 + NL * 0.25, 0.36)
            _plate(p, [(root + s * 0.25, y0 + 0.07, hz0 + 0.5), (root + s * 0.25, y0 + 0.07, hz0 + L * 0.42), (tip - s * 0.3, y0 + 0.33, hz1 - L * 0.05), (tip - s * 0.3, y0 + 0.33, hz1 - L * 0.16)], 'hazard', 0.012)
            add_cyl(p, tip, y0 + 0.28, hz1 + NL * 0.25, hz1 + NL * 0.25 + 0.1, 0.05, 'navgreen' if s > 0 else 'navred', 8, axis='z')
        _fin(p, [(xc, ty - 0.1, hz0 - 0.4), (xc, ty - 0.1, hz0 + L * 0.5), (xc, ty + 1.7, hz0 - 0.2), (xc, ty + 1.75, hz0 - 1.1)], 'tint', 0.09)
        for dx in (-0.35, 0.35): add_box(p, xc + dx - 0.09, top_y(xc + dx, hz0 + L * 0.5) - 0.03, hz0 + 0.3, xc + dx + 0.09, top_y(xc + dx, hz0 + L * 0.5) + 0.015, hz1, 'navwhite', 0.004)

    elif C == 'gunship':
        # a slab-sided wedge: stepped armour, sponson cannons you can read from a mile off, canted twin tails
        for s in (-1, 1):
            sx = xc + s * (hw + 0.45); sy = cy - hh * 0.28
            _sloft(p, [(hz0 + 0.6, sy, 0.3, sx, 0.3, 3), (hz0 + 1.2, sy, 0.46, sx, 0.5, 3), (hz1 - 0.2, sy, 0.46, sx, 0.5, 3), (hz1 + NL * 0.25, sy - 0.04, 0.2, sx, 0.3, 2.6)], 'tint', 32)
            _beam(p, (xc + s * hw * 0.8, sy, hz0 + L * 0.3), (sx, sy, hz0 + L * 0.3), 0.3, 'heatshield'); _beam(p, (xc + s * hw * 0.8, sy, hz0 + L * 0.7), (sx, sy, hz0 + L * 0.7), 0.3, 'heatshield')
            for dy in (-0.14, 0.14):
                add_cyl(p, sx + dy, sy, hz1 + NL * 0.25, hz1 + NL * 0.25 + 2.1 + 0.3 * v, 0.055, 'metal', 10, axis='z')
                add_cyl(p, sx + dy, sy, hz1 + NL * 0.25 + 0.4, hz1 + NL * 0.25 + 1.0, 0.085, 'heatshield', 10, axis='z')
                add_cyl(p, sx + dy, sy, hz1 + NL * 0.25 + 2.1 + 0.3 * v, hz1 + NL * 0.25 + 2.3 + 0.3 * v, 0.08, 'metal', 10, axis='z')
            _nacelle(p, xc + s * deck_rx * 0.72, deck_y + deck_ry * 0.5, tail + 0.3, hz0 + L * 0.4, 0.5)
            _fin(p, [(xc + s * hw * 0.62, ty - 0.1, hz0 - 0.2), (xc + s * hw * 0.62, ty - 0.1, hz0 + 1.8), (xc + s * (hw * 0.62 + 0.8), ty + 1.3, hz0 + 0.2), (xc + s * (hw * 0.62 + 0.8), ty + 1.3, hz0 - 0.9)], 'tint', 0.1)
            # armour: overlapping plates down the flank
            for k in range(int(L / 1.7)):
                z0 = hz0 + 0.5 + k * 1.7; a0 = 8 if s > 0 else 138; _skin(p, BD, z0, z0 + 1.62, a0, a0 + 34, 0.06, 'tint', 3, 4); _skin(p, BD, z0 + 1.45, z0 + 1.6, a0 + 2, a0 + 32, 0.075, 'metal', 1, 4)
        add_cyl(p, xc, cy - hh, hz1 + NL * 0.15, hz1 + NL * 0.15 + 0.5, 0.34, 'heatshield', 16, axis='z')      # chin sensor ball
        add_cyl(p, xc, cy - hh, hz1 + NL * 0.15 + 0.5, hz1 + NL * 0.15 + 0.55, 0.2, 'visor', 16, axis='z')

    elif C == 'dropship':
        # a flying box of people: four huge ducted fans on pylons, a searchlight, armour skirts
        for sx in (-1, 1): _bell(p, xc + sx * deck_rx * 0.5, deck_y, 0.0, tail + 0.05, min(0.6, deck_ry), 10)
        fr = 1.05 + 0.1 * v
        for s in (-1, 1):
            for (fz, up) in ((hz0 + L * 0.12, 1), (hz1 - L * 0.08, 0.4)):
                fx = xc + s * (hw + fr * 0.75); fy = cy + hh * 0.42 * up
                _duct(p, fx, fy, fz - 0.45, fr, 0.9)
                _beam(p, (xc + s * hw * 0.82, fy, fz), (fx - s * fr * 0.9, fy, fz), 0.32, 'heatshield')
                add_box(p, fx - 0.09, fy + fr * 1.07, fz - 0.3, fx + 0.09, fy + fr * 1.13, fz + 0.3, 'hazard', 0.004)
            add_box(p, xc + s * side_x(cy - hh * 0.5, hz0 + L / 2) - 0.06, cy - hh * 0.72, hz0 + 0.4, xc + s * side_x(cy - hh * 0.5, hz0 + L / 2) + 0.06, cy - hh * 0.1, hz1 - 0.4, 'heatshield', 0.02)
        for dx in (-0.6, 0, 0.6):
            add_cyl(p, xc + dx, cy - hh * 0.15, hz1 + NL * 0.86, hz1 + NL * 0.95, 0.16, 'metal', 12, axis='z'); add_cyl(p, xc + dx, cy - hh * 0.15, hz1 + NL * 0.95, hz1 + NL * 0.97, 0.12, 'glow', 12, axis='z')
        _fin(p, [(xc, ty - 0.1, hz0), (xc, ty - 0.1, hz0 + 1.4), (xc, ty + 0.9, hz0 + 0.2), (xc, ty + 0.9, hz0 - 0.4)], 'tint', 0.12)

    elif C == 'hauler':
        # a cab on a spine: the cargo rides outside in racks, engines and radiators hung on an open frame
        for s in (-1, 1):
            x0 = xc + s * (hw + 0.14); bw = max(1.0, W / 2 - hw - 0.1 + 0.9); yb = cy - hh * 0.72
            for k in range(3):
                z0 = hz0 + 0.6 + k * (L - 1.2) / 3; z1 = z0 + (L - 1.2) / 3 - 0.25
                for (y0, y1, sel) in ((yb, yb + 1.45, 0), (yb + 1.55, yb + 3.0, 1)):
                    if (k + sel + v) % 5 == 4: continue         # (an empty slot: this one's not loaded)
                    xa, xb = (x0, x0 + bw) if s > 0 else (x0 - bw, x0)
                    _container(p, xa, y0, z0, xb, y1, z1, 'tint' if (k + sel) % 2 else 'hazard' if (k + sel + v) % 3 == 0 else 'paint')
            for z in (hz0 + 0.45, hz1 - 0.45):
                _beam(p, (xc + s * hw * 0.85, yb - 0.08, z), (xc + s * (hw + bw + 0.2), yb - 0.08, z), 0.14); _beam(p, (xc + s * hw * 0.85, yb + 3.08, z), (xc + s * (hw + bw + 0.2), yb + 3.08, z), 0.14)
                _beam(p, (xc + s * (hw + bw + 0.2), yb - 0.08, z), (xc + s * (hw + bw + 0.2), yb + 3.08, z), 0.14)
            _beam(p, (xc + s * (hw + bw + 0.2), yb - 0.08, hz0 + 0.45), (xc + s * (hw + bw + 0.2), yb - 0.08, hz1 - 0.45), 0.14); _beam(p, (xc + s * (hw + bw + 0.2), yb + 3.08, hz0 + 0.45), (xc + s * (hw + bw + 0.2), yb + 3.08, hz1 - 0.45), 0.14)
            _bell(p, xc + s * deck_rx * 0.52, deck_y, 0.0, tail + 0.05, min(1.0, deck_ry), 12)
            _radiator(p, xc + s * 0.4, ty + 0.28, hz0 + 1.0, xc + s * (hw * 0.95), hz0 + L * 0.5, 0.25)
        _beam(p, (xc, ty, hz0 + 0.6), (xc, ty + 0.3, hz0 + 0.8), 0.2, 'heatshield')
        for k in range(3): add_box(p, xc - hw * 0.55, cy - 0.5 + k * 0.32, hz1 + NL * 0.82, xc + hw * 0.55, cy - 0.42 + k * 0.32, hz1 + NL * 0.86, 'hazard', 0.004)

    elif C == 'miner':
        # a working barge, not symmetrical: a boom and grab on one side, a drill under the nose, ore hoppers and stacks
        s = 1 if v % 2 else -1
        bx = xc + s * hw * 0.8; by = ty; bz = hz1 - 0.8
        add_cyl(p, bx, by + 0.15, bz - 0.5, bz + 0.5, 0.42, 'heatshield', 18, axis='z')
        elbow = (bx + s * 2.1, by + 1.9, bz + 1.2); wrist = (bx + s * 2.9, by + 0.2, bz + 3.0)
        _beam(p, (bx, by + 0.15, bz), elbow, 0.34, 'hazard'); _beam(p, elbow, wrist, 0.24, 'heatshield')
        _beam(p, (bx + s * 0.1, by + 0.15, bz - 0.2), (elbow[0] - s * 0.3, elbow[1] - 0.45, elbow[2] - 0.4), 0.09, 'metal')     # hydraulic ram
        for k in range(3):
            a_ = -0.7 + 0.7 * k; _beam(p, wrist, (wrist[0] + math.sin(a_) * 0.7, wrist[1] - 0.45, wrist[2] + math.cos(a_) * 0.55), 0.13, 'metal'); _beam(p, (wrist[0] + math.sin(a_) * 0.7, wrist[1] - 0.45, wrist[2] + math.cos(a_) * 0.55), (wrist[0] + math.sin(a_) * 0.45, wrist[1] - 1.05, wrist[2] + math.cos(a_) * 0.35), 0.1, 'metal')
        # the drill: a stepped cone under the nose
        dy = cy - hh * 0.72; dz = secs[-2][0]
        add_cyl(p, xc, dy, dz - 1.2, dz + 0.2, 0.62, 'heatshield', 18, axis='z')
        for k in range(4): add_cyl(p, xc, dy, dz + 0.2 + k * 0.42, dz + 0.62 + k * 0.42, 0.6 - k * 0.13, 'metal', 14, axis='z', r2=0.47 - k * 0.13)
        add_cyl(p, xc, dy, dz + 1.88, dz + 2.3, 0.08, 'metal', 10, axis='z', r2=0.01)
        # hoppers on the far side, stacks aft
        for k in range(2 + v % 2):
            z0 = hz0 + 0.5 + k * 2.1; x0 = xc - s * (hw + 0.1); xa, xb = (x0 - 1.3, x0) if s > 0 else (x0, x0 + 1.3)
            add_box(p, xa, cy - hh * 0.4, z0, xb, cy + hh * 0.5, z0 + 1.8, 'heatshield', 0.03); add_box(p, xa + 0.1, cy + hh * 0.5, z0 + 0.1, xb - 0.1, cy + hh * 0.5 + 0.12, z0 + 1.7, 'heatshield', 0.01)
            for q in range(4): add_box(p, xa - 0.02, cy - hh * 0.3 + q * 0.3, z0 + 0.1, xb + 0.02, cy - hh * 0.3 + q * 0.3 + 0.05, z0 + 1.7, 'metal', 0.003)
        for q in (-0.7, 0.7):
            add_cyl(p, xc + q, hz0 + 0.8, ty - 0.2, ty + 1.3, 0.14, 'metal', 12); add_cyl(p, xc + q, hz0 + 0.8, ty + 1.3, ty + 1.45, 0.18, 'rubber', 12)
        for q in (-1, 1): _bell(p, xc + q * deck_rx * 0.52, deck_y, 0.0, tail + 0.05, min(0.85, deck_ry), 10)

    elif C == 'ferry':
        # a long clean liner: rows of lit windows, a swept dorsal, a neat ring of small engines
        for s in (-1, 1):
            for row, yy in enumerate((cy + hh * 0.22,)):
                n = int(L / 0.95)
                for k in range(n):
                    z = hz0 + 0.6 + k * (L - 1.0) / n; x = side_x(yy, z)
                    a0 = 20 if s > 0 else 148; _skin(p, BD, z - 0.06, z + 0.56, a0 - 1, a0 + 13, 0.012, 'metal', 2, 2); _skin(p, BD, z, z + 0.5, a0, a0 + 12, 0.022, 'glow', 2, 2)
            x = side_x(cy - hh * 0.2, hz0 + L / 2)
            add_box(p, xc + s * x - 0.02, cy - hh * 0.22, hz0 + 0.3, xc + s * x + 0.02, cy - hh * 0.14, hz1 + NL * 0.2, 'navwhite', 0.002)
            _wing(p, xc + s * hw * 0.8, cy - hh * 0.35, hz0 + L * 0.45, hz0 + 0.4, xc + s * (hw + 2.1), cy - hh * 0.15, hz0 + L * 0.08, hz0 - 0.5, 0.3, n=6)
            add_cyl(p, xc + s * (hw + 2.05), cy - hh * 0.15, hz0 - 0.5, hz0 - 0.3, 0.06, 'navgreen' if s > 0 else 'navred', 8, axis='z')
        for k in range(8):
            a_ = (k + 0.5) * math.pi / 4; _bell(p, xc + math.cos(a_) * deck_rx * 0.68, deck_y + math.sin(a_) * deck_ry * 0.66, max(0, tail - 0.8), tail + 0.05, min(0.32, deck_ry * 0.32), 8)
        _fin(p, [(xc, ty - 0.1, hz0 + 0.1), (xc, ty - 0.1, hz0 + L * 0.42), (xc, ty + 1.6, hz0 + 0.1), (xc, ty + 1.7, hz0 - 1.0)], 'tint', 0.1)

    elif C == 'explorer':
        # built for a long way from anywhere: a great dish, a radiator wing each side, a truss aft to the engines, a spin ring
        rz = hz0 + L * 0.42; R = max(hw, hh) + 1.0
        for (ra, rb) in ((R, R - 0.34),):
            add_loft(p, [(rz, cy, rb, xc, rb, 2), (rz, cy, ra, xc, ra, 2), (rz + 0.7, cy, ra, xc, ra, 2), (rz + 0.7, cy, rb, xc, rb, 2), (rz, cy, rb, xc, rb, 2)], 'tint', 48, axis='z', cap=False)
        for k in range(8):
            a_ = (k + 0.5) * math.pi / 4; _beam(p, (xc + math.cos(a_) * hw * 0.7, cy + math.sin(a_) * hh * 0.7, rz + 0.35), (xc + math.cos(a_) * (R - 0.3), cy + math.sin(a_) * (R - 0.3), rz + 0.35), 0.14, 'metal')
        n = 28
        for k in range(n):
            a_ = 2 * math.pi * k / n; add_box(p, xc + math.cos(a_) * R - 0.09, cy + math.sin(a_) * R - 0.09, rz + 0.25, xc + math.cos(a_) * R + 0.09, cy + math.sin(a_) * R + 0.09, rz + 0.45, 'glow' if k % 7 == 0 else 'heatshield', 0.004)
        # the dish on a mast, turned up and out
        ds = 1 if v % 2 else -1; dx, dz = xc + ds * hw * 0.45, hz1 - L * 0.12; dy = ty + 1.35
        add_cyl(p, dx, dz, ty - 0.1, dy - 0.2, 0.09, 'metal', 10); add_cyl(p, dx, dz, dy - 0.26, dy + 0.2, 1.45, 'navwhite', 28, r2=0.14) if False else None
        add_cyl(p, dx, dz, dy - 0.34, dy, 0.16, 'heatshield', 12, r2=1.4); add_cyl(p, dx, dz, dy - 0.02, dy + 0.02, 1.34, 'heatshield', 28)
        for k in range(3): a_ = k * 2.094; _beam(p, (dx + math.cos(a_) * 1.2, dy, dz + math.sin(a_) * 1.2), (dx, dy + 0.85, dz), 0.04)
        add_cyl(p, dx, dz, dy + 0.82, dy + 0.98, 0.09, 'metal', 10)
        for s in (-1, 1):
            _radiator(p, xc + s * hw * 0.9, cy + 0.12, hz0 + 0.5, xc + s * (hw + 2.6 + 0.5 * v), hz0 + L * 0.32, 0.2)
            _bell(p, xc + s * deck_rx * 0.5, deck_y, 0.0, tail + 0.05, min(0.78, deck_ry), 12)
        _beam(p, (xc, nose - NL * 0.05, cy) if False else (xc, cy, nose - NL * 0.1), (xc, cy, nose + 0.1), 0.04)

    else:   # runabout: small, friendly, rounded; over-wing pods on curved arms, a big bubble of glass
        for s in (-1, 1):
            nx = xc + s * (hw + 0.6); ny = cy + hh * 0.42
            _nacelle(p, nx, ny, tail + 0.4, hz0 + L * 0.72, 0.56)
            for z in (hz0 + L * 0.18, hz0 + L * 0.48):
                _beam(p, (xc + s * hw * 0.74, cy + hh * 0.05, z), (nx - s * 0.3, ny - 0.15, z), 0.26, 'heatshield')
            _fin(p, [(nx, ny + 0.5, hz0 + 0.1), (nx, ny + 0.5, hz0 + 1.3), (nx + s * 0.18, ny + 1.35, hz0 + 0.3), (nx + s * 0.18, ny + 1.35, hz0 - 0.2)], 'tint', 0.07)
            add_cyl(p, nx, ny + 0.57, hz0 + L * 0.6, hz0 + L * 0.65, 0.05, 'navgreen' if s > 0 else 'navred', 8, axis='z')
        for dx in (-0.3, 0.3): add_cyl(p, xc + dx, cy - hh * 0.2, nose - NL * 0.42, nose - NL * 0.4, 0.13, 'glow', 12, axis='z')

    # what a real ship has on its skin: vents, thruster blocks, a sensor mast, its lights
    for s in (-1, 1):
        for z_ in (hz0 + L * 0.3, hz0 + L * 0.62): _vent(p, BD, z_, 38 if s > 0 else 128, 0.8, 16)
        _rcs(p, BD, hz1 + NL * 0.25, 24 if s > 0 else 156); _rcs(p, BD, hz0 + 1.0, 30 if s > 0 else 150)
    for z_ in (hz0 + L * 0.2, hz0 + L * 0.75): add_cyl(p, xc, z_, ty - 0.02, ty + 0.06, 0.05, 'navwhite', 10)
    for s in (-1, 1): _skin(p, BD, hz0 + 0.5, hz1 - 0.5, 90 + s * 13 - 1.6, 90 + s * 13 + 1.6, 0.05, 'metal', int(L), 1) if C not in ('runabout',) else None
    for (gx, gz) in gear: _gear(p, gx, gz, cy - hh * 0.55, 0.09)
    ship_interior(p, lay, CK)


# ---- road vehicles. Built along z like a ship, then turned to the vehicle frame (x along, z across).
def _lift_pods(p, L, W, belly):
    lw = W / 2
    add_box(p, L * 0.14, belly - 0.03, 0.34, L * 0.86, belly + 0.08, W - 0.34, 'rubber', 0)
    for x in (L * 0.18, L * 0.82):
        for zz in (lw * 0.5, W - lw * 0.5):
            add_cyl(p, x, zz, belly - 0.04, belly + 0.05, 0.33, 'rubber', 24); add_cyl(p, x, zz, belly - 0.12, belly - 0.04, 0.27, 'metal', 24, r2=0.31); add_cyl(p, x, zz, belly - 0.135, belly - 0.12, 0.2, 'glow', 20)
            for q in range(6):
                a_ = q * math.pi / 3; add_box(p, x + math.cos(a_) * 0.11 - 0.012, belly - 0.145, zz + math.sin(a_) * 0.11 - 0.012, x + math.cos(a_) * 0.11 + 0.012, belly - 0.12, zz + math.sin(a_) * 0.11 + 0.012, 'metal', 0)
            add_cyl(p, x, zz, belly - 0.15, belly - 0.12, 0.05, 'metal', 10)

def _road_body(out, L, W, H, b, tall=False, x0=0.0):
    """One smooth body from the belly to the belt, the cabin growing out of it, every window a piece of glass in the body, gaps round the doors."""
    p = Part(); LL = L - x0; xc = W / 2; lw = W / 2; belly = 0.38; e = max(2.4, min(4.5, b.get('round', 3) + 0.4)); nose = b.get('nose', 0.28); tail = b.get('tail', 0.18); wedge = b.get('wedge')
    Z = lambda t: LL * t
    if tall:
        hb = (H - belly) / 2; cy = belly + hb
        secs = [(0.0, cy, hb * 0.9, xc, lw * 0.9, e), (0.18, cy, hb * 0.98, xc, lw * 0.98, e), (0.5, cy, hb, xc, lw, e), (Z(1 - nose * 0.95), cy, hb, xc, lw, e), (Z(1 - nose * 0.45), cy - hb * 0.14, hb * 0.86, xc, lw * 0.98, e), (Z(1 - nose * 0.12), cy - hb * 0.42, hb * 0.54, xc, lw * 0.94, e), (LL, cy - hb * 0.5, 0.05, xc, lw * 0.7, 2.4)]
        BL = Body(secs, 7); hull_loft(p, BL.secs, 'tint', (xc, cy, LL / 2), n=64); top = cy
        add_loft(p, [(0.0, cy, hb * 0.9, xc, lw * 0.9, e), (0.012, cy, hb * 0.9, xc, lw * 0.9, e)], 'tint', 40, axis='z')
        _skin(p, BL, Z(1 - nose * 0.92), Z(1 - nose * 0.3), 28, 152, 0.012, 'visor', 8, 12)
        n = 4 if b.get('windows') else 1; z0 = Z(0.12); z1 = Z(1 - nose * 0.98)
        for s0 in (24, 118):
            if b.get('windows') or True:
                for i in range(n if b.get('windows') else 0): zs = z0 + (z1 - z0) * i / n; _skin(p, BL, zs + 0.04, zs + (z1 - z0) / n - 0.04, s0, s0 + 38, 0.012, 'visor', 2, 3)
            _skin(p, BL, z1 - min(0.95, (z1 - z0) * 0.25), z1 - 0.06, s0, s0 + 38, 0.012, 'visor', 2, 3)       # the cab door's window
        doors = [z1 - 1.05, z1 + 0.03]; side = (-32, 18)
    else:
        Hb = (H - belly) * 0.54; top = belly + Hb; dn = 0.3 if wedge else 0.42
        secs = [(0.0, belly + Hb * 0.64, Hb * 0.28, xc, lw * 0.8, e), (Z(0.045), belly + Hb * 0.56, Hb * 0.44, xc, lw * 0.95, e), (Z(0.16), belly + Hb * 0.5, Hb * 0.5, xc, lw, e), (Z(0.8), belly + Hb * 0.5, Hb * 0.5, xc, lw, e), (Z(0.93), belly + Hb * dn, Hb * (dn - 0.03), xc, lw * 0.96, e), (Z(0.985), belly + Hb * (dn - 0.05), Hb * 0.2, xc, lw * 0.86, e), (LL, belly + Hb * (dn - 0.06), 0.03, xc, lw * 0.66, 2.4)]
        BL = Body(secs, 7); hull_loft(p, BL.secs, 'tint', (xc, belly + Hb / 2, LL / 2), n=64)
        add_loft(p, [(0.0, belly + Hb * 0.64, Hb * 0.28, xc, lw * 0.8, e), (0.01, belly + Hb * 0.64, Hb * 0.28, xc, lw * 0.8, e)], 'tint', 40, axis='z')
        cab = b.get('cabin', 0.42); c0 = Z(tail + (1 - tail - nose - cab) * 0.5); c1 = c0 + Z(cab); ch = (H - top) * b.get('roof', 0.92) + 0.08; e2 = 2.7
        G = [(c0 - Z(0.11), top - 0.08, 0.02, xc, lw * 0.72, e2), (c0 - Z(0.02), top - 0.08 + ch * 0.26, ch * 0.34, xc, lw * 0.78, e2), (c0 + Z(0.05), top - 0.08 + ch * 0.5, ch * 0.54, xc, lw * 0.8, e2), (c1 - Z(0.05), top - 0.08 + ch * 0.5, ch * 0.54, xc, lw * 0.8, e2), (c1 + Z(0.05), top - 0.08 + ch * 0.29, ch * 0.36, xc, lw * 0.8, e2), (c1 + Z(0.15), top - 0.08, 0.02, xc, lw * 0.74, e2)]
        BG = Body(G, 7); hull_loft(p, BG.secs, 'tint', (xc, top, (c0 + c1) / 2), n=64)
        _skin(p, BG, c1 - Z(0.015), c1 + Z(0.125), 24, 156, 0.008, 'visor', 8, 12); _skin(p, BG, c0 - Z(0.085), c0 + Z(0.025), 26, 154, 0.008, 'visor', 6, 12)
        mid = (c0 + c1) / 2
        for s0 in (10, 118):
            _skin(p, BG, c0 + Z(0.035), mid - 0.05, s0, s0 + 52, 0.008, 'visor', 4, 5); _skin(p, BG, mid + 0.05, c1 - Z(0.012), s0, s0 + 52, 0.008, 'visor', 4, 5)
        doors = [c0 + Z(0.02), mid, c1 + Z(0.04)]; side = (-34, 28)
        if b.get('taxi'): add_box(p, xc - 0.25, top - 0.08 + ch * 1.03, mid - 0.12, xc + 0.25, top - 0.08 + ch * 1.03 + 0.16, mid + 0.12, 'navwhite', 0.02)
    # doors: gaps, handles; a rubbing strip; lights in their housings; the grille
    for s0 in (0, 180):
        for z in doors: _seam_ring(p, BL, z, s0 + side[0], s0 + side[1], 0.018)
        _seam_long(p, BL, doors[0], doors[-1], s0 + side[1], 0.018)
        _seam_long(p, BL, doors[0], doors[-1], s0 + side[0], 0.018)
        for z in doors[1:]: _skin(p, BL, z - 0.2, z - 0.05, s0 + 12, s0 + 16, 0.02, 'metal', 1, 1)
        _seam_long(p, BL, Z(0.05), Z(0.93), s0 + 354 if s0 == 0 else s0 + 6, 0.05, 'metal', 0.008)
    if tall:
        yL = BL.sect(Z(0.9))[0] + 0.1
        for s in (-1, 1):
            xl = xc + s * lw * 0.62; zl = LL - Z(0.055); add_box(p, xl - 0.2, yL - 0.1, zl, xl + 0.2, yL + 0.1, zl + 0.05, 'metal', 0.006); add_box(p, xl - 0.16, yL - 0.07, zl + 0.04, xl + 0.16, yL + 0.07, zl + 0.06, 'navwhite', 0)
            xm = xc + s * (lw + 0.1); ym = BL.sect(Z(0.8))[0] + BL.sect(Z(0.8))[1] * 0.4; zm = Z(1 - nose * 0.75); _beam(p, (xc + s * lw * 0.9, ym + 0.1, zm), (xm, ym + 0.1, zm), 0.03, 'rubber'); add_box(p, xm - 0.05, ym - 0.14, zm - 0.02, xm + 0.05, ym + 0.16, zm + 0.04, 'rubber', 0.008)
    else:
        for s0, s1 in ((18, 50), (130, 162)):
            _skin(p, BL, Z(0.915), Z(0.965), s0, s1, 0.01, 'metal', 6, 5); _skin(p, BL, Z(0.915) + 0.02, Z(0.965) - 0.02, s0 + 3, s1 - 3, 0.018, 'navwhite', 6, 4)
    for s0, s1 in ((14, 60), (120, 166)):
        _skin(p, BL, Z(0.02), Z(0.06), s0, s1, 0.012, 'rubber', 3, 5); _skin(p, BL, Z(0.024), Z(0.056), s0 + 4, s1 - 4, 0.02, 'navred', 3, 4)
    cyN = BL.sect(Z(0.97))[0]; add_box(p, xc - lw * 0.42, cyN - 0.11, LL - Z(0.03) - 0.02, xc + lw * 0.42, cyN + 0.03, LL - Z(0.012), 'rubber', 0)
    for q in range(4): add_box(p, xc - lw * 0.4, cyN - 0.09 + q * 0.03, LL - Z(0.03), xc + lw * 0.4, cyN - 0.08 + q * 0.03, LL - Z(0.008), 'metal', 0)
    if not tall:
        for s, mx in ((-1, xc - lw * 0.82), (1, xc + lw * 0.82)): mz = doors[-1] - Z(0.03); add_box(p, mx + s * 0.02, top - 0.0, mz - 0.03, mx + s * 0.14, top + 0.02, mz + 0.03, 'rubber', 0); _sloft(p, [(mz - 0.05, top + 0.05, 0.015, mx + s * 0.18, 0.015, 2), (mz, top + 0.05, 0.05, mx + s * 0.18, 0.09, 2), (mz + 0.04, top + 0.05, 0.05, mx + s * 0.18, 0.09, 2)], 'tint', 12, per=2)
    if b.get('wing'):
        for s in (-1, 1): _blade(p, (xc + s * lw * 0.6, top - 0.02, 0.42), (xc + s * lw * 0.6, top - 0.02, 0.1), (xc + s * lw * 0.6, top + 0.2, 0.05), (xc + s * lw * 0.6, top + 0.2, 0.3), 0.02)
        _aero(p, [(xc - lw * 0.95, top + 0.22, 0.42, 0.02, 0.04), (xc, top + 0.24, 0.45, 0.02, 0.05), (xc + lw * 0.95, top + 0.22, 0.42, 0.02, 0.04)])
    if b.get('chrome'): _seam_long(p, BL, Z(0.08), Z(0.92), 10, 0.03, 'metal', 0.01); _seam_long(p, BL, Z(0.08), Z(0.92), 170, 0.03, 'metal', 0.01)
    # turn it to the vehicle frame: along x, nose at +x, the body's rear at x0
    for v in p.bm.verts:
        bx, by, bz = v.co; x, y, z = bx, bz, -by; v.co = P(x0 + z, y, W - x)
    m = bpy.data.meshes.new('tmp'); p.bm.to_mesh(m); p.bm.free(); out.bm.from_mesh(m); bpy.data.meshes.remove(m)
