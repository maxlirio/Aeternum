# Designed ships: every class has its own silhouette and its own reason for looking that way.
# A hull is lofted round the layout's interior (the rooms the game walks through never change); what's
# bolted to it says what the ship is for. Frame as everywhere: x across [0, W], y up, z from stern (0) to
# nose (D). All original shapes. Exec'd by build.py.

def _fit_ry(a, b, rx, e):
    """How tall a superellipse of half-width rx must be to hold the interior's corner (a, b)."""
    q = 1 - min(0.92, (a / rx) ** e)
    return b / q ** (1 / e)

def _plate(p, pts, mat='tint', t=0.1):
    bm = bmesh.new(); top = [bm.verts.new(P(x, y + t / 2, z)) for (x, y, z) in pts]; bot = [bm.verts.new(P(x, y - t / 2, z)) for (x, y, z) in pts]
    bm.faces.new(top); bm.faces.new(bot[::-1])
    for k in range(len(pts)): bm.faces.new([top[k], bot[k], bot[(k + 1) % len(pts)], top[(k + 1) % len(pts)]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def _fin(p, pts, mat='tint', t=0.1):
    bm = bmesh.new(); bm.faces.new([bm.verts.new(P(*v)) for v in pts]); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=t); merge(p, bm, mat)

def _beam(p, a, b, w, mat='metal'):
    """A square strut from a to b."""
    bm = bmesh.new(); d = mathutils.Vector(b) - mathutils.Vector(a); L = d.length
    if L < 1e-4: bm.free(); return
    d = d / L; up = mathutils.Vector((0, 1, 0)) if abs(d.y) < 0.9 else mathutils.Vector((1, 0, 0)); s = d.cross(up).normalized() * w / 2; u = s.cross(d).normalized() * w / 2
    A, B = mathutils.Vector(a), mathutils.Vector(b)
    rs = [[bm.verts.new(P(*(c + i * s + j * u))) for (i, j) in ((-1, -1), (1, -1), (1, 1), (-1, 1))] for c in (A, B)]
    for k in range(4): bm.faces.new([rs[0][k], rs[0][(k + 1) % 4], rs[1][(k + 1) % 4], rs[1][k]])
    bm.faces.new(rs[0][::-1]); bm.faces.new(rs[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def _bell(p, x, y, z0, z1, r, ribs=12):
    """A rocket bell, flaring aft, with a lit throat and cooling ribs."""
    add_cyl(p, x, y, z0, z1, r, 'metal', 28, axis='z', r2=r * 0.55)
    add_cyl(p, x, y, z0 - 0.03, z0 + 0.03, r * 0.82, 'glow', 28, axis='z')
    for k in range(ribs):
        a = 2 * math.pi * k / ribs; c, s = math.cos(a), math.sin(a)
        _beam(p, (x + c * r * 1.01, y + s * r * 1.01, z0 + 0.02), (x + c * r * 0.57, y + s * r * 0.57, z1), 0.035, 'paint')

def _nacelle(p, x, y, z0, z1, r, mat='tint'):
    """An engine pod: intake lip forward, bell aft, service bands round it."""
    L = z1 - z0
    add_loft(p, [(z0, y, r * 0.72, x, r * 0.72, 2), (z0 + L * 0.12, y, r, x, r, 2), (z0 + L * 0.8, y, r, x, r, 2), (z1 - L * 0.04, y, r * 0.86, x, r * 0.86, 2), (z1, y, r * 0.62, x, r * 0.62, 2)], mat, 24, axis='z')
    add_cyl(p, x, y, z1 - 0.02, z1 + 0.03, r * 0.5, 'rubber', 20, axis='z')
    for f in (0.2, 0.34, 0.66): add_cyl(p, x, y, z0 + L * f, z0 + L * f + 0.07, r * 1.025, 'metal', 24, axis='z')
    _bell(p, x, y, z0 - r * 0.9, z0 + 0.05, r * 0.82, 10)

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

def designed_ship(p, L_, D_, H_, r, model):
    lay = SHIPCAT[model]; C = lay['cls']; v = int(model[-1])
    hx0, hz0, hx1, hz1 = lay['hull']; deck = lay['deck']; ceil = lay['ceiling']; xc = (hx0 + hx1) / 2; W, D = lay['W'], lay['D']
    a, b = (hx1 - hx0) / 2 + 0.06, (ceil + 0.14 - (deck - 0.24)) / 2; cy = (ceil + 0.14 + deck - 0.24) / 2
    nose = D - 0.2; NL = nose - hz1; L = hz1 - hz0
    # the shape of the section and how the nose closes, class by class: (exponent, width over the interior, nose stations (t along the nose, dy, ry, rx, e))
    if C == 'racer':     e, wide, ns = 2.2, 1.28, [(0.3, -0.12, 0.72, 0.6, 2.0), (0.62, -0.28, 0.36, 0.28, 2.0), (1, -0.42, 0.02, 0.03, 2)]
    elif C == 'gunship': e, wide, ns = 1.65, 1.5, [(0.32, -0.02, 0.8, 0.8, 1.5), (0.7, -0.14, 0.34, 0.5, 1.3), (1, -0.24, 0.04, 0.2, 1.3)]
    elif C == 'dropship':e, wide, ns = 3.4, 1.14, [(0.45, -0.06, 0.82, 0.96, 3.2), (0.85, -0.2, 0.46, 0.84, 2.8), (1, -0.28, 0.2, 0.62, 2.4)]
    elif C == 'hauler':  e, wide, ns = 4.0, 1.09, [(0.5, 0.0, 0.92, 0.94, 3.6), (0.86, -0.1, 0.62, 0.74, 3.0), (1, -0.18, 0.28, 0.42, 2.4)]
    elif C == 'miner':   e, wide, ns = 3.6, 1.12, [(0.42, 0.04, 0.88, 0.92, 3.0), (0.82, -0.06, 0.6, 0.66, 2.6), (1, -0.14, 0.26, 0.3, 2.2)]
    elif C == 'ferry':   e, wide, ns = 2.5, 1.24, [(0.42, -0.06, 0.8, 0.8, 2.3), (0.78, -0.2, 0.44, 0.46, 2.1), (1, -0.3, 0.06, 0.08, 2)]
    elif C == 'explorer':e, wide, ns = 2.4, 1.25, [(0.36, 0.02, 0.84, 0.84, 2.2), (0.72, 0.0, 0.5, 0.5, 2.0), (1, -0.02, 0.1, 0.1, 2)]
    else:                e, wide, ns = 2.1, 1.32, [(0.42, -0.04, 0.84, 0.84, 2.0), (0.8, -0.12, 0.5, 0.52, 2.0), (1, -0.18, 0.08, 0.1, 2)]     # runabout: a smooth egg
    hw = a * wide; hh = _fit_ry(a, b, hw, e) * 1.02
    secs = [(hz0, cy, hh * 0.97, xc, hw * 0.97, e), (hz0 + 0.8, cy, hh, xc, hw, e), (hz1 - 0.5, cy, hh, xc, hw, e)]
    for (t, dy, ry, rx, ee) in ns: secs.append((hz1 + NL * t, cy + dy * hh, max(0.02, hh * ry), xc, max(0.02, hw * rx), ee))
    hull_loft(p, secs, 'tint', (xc, cy, (hz0 + hz1) / 2))
    def sect(z):
        for (za, *A), (zb, *B) in zip(secs, secs[1:]):
            if za <= z <= zb: t = (z - za) / max(1e-6, zb - za); return [q + (w - q) * t for q, w in zip(A, B)]
        return list(secs[0 if z < secs[0][0] else -1][1:])
    def top_y(x, z):
        c_, ry, cx, rx, ee = sect(z); q = 1 - min(1, abs((x - cx) / rx)) ** ee; return c_ + ry * max(q, 0) ** (1 / ee)
    def side_x(y, z):
        c_, ry, cx, rx, ee = sect(z); q = 1 - min(1, abs((y - c_) / ry)) ** ee; return rx * max(q, 0) ** (1 / ee)
    # the stern, round the ramp door
    d0 = lay['doors'][0]; dx0, dx1 = d0['x'] - d0['width'] / 2, d0['x'] + d0['width'] / 2; dtop = deck + d0.get('height', 2.15)
    c0, ry0, _, rx0, e0 = secs[0][1:]
    for k in range(48):
        y0_, y1_ = c0 - ry0 + k * 2 * ry0 / 48, c0 - ry0 + (k + 1) * 2 * ry0 / 48; ym = (y0_ + y1_) / 2
        q = 1 - abs((ym - c0) / ry0) ** e0
        if q <= 0: continue
        w_ = rx0 * q ** (1 / e0)
        if deck < ym < dtop: add_box(p, xc - w_, y0_, hz0 - 0.1, dx0, y1_, hz0 + 0.05, 'heatshield', 0); add_box(p, dx1, y0_, hz0 - 0.1, xc + w_, y1_, hz0 + 0.05, 'heatshield', 0)
        else: add_box(p, xc - w_, y0_, hz0 - 0.1, xc + w_, y1_, hz0 + 0.05, 'heatshield', 0)
    for x in (dx0 - 0.16, dx1 + 0.06): add_box(p, x, deck, hz0 - 0.16, x + 0.1, dtop, hz0 - 0.1, 'hazard', 0.005)
    # the canopy: a raked dark glass band, framed; how much of the nose it takes is the ship's character
    span0, span1 = {'racer': (0.0, 0.4), 'runabout': (0.0, 0.55), 'ferry': (0.0, 0.4), 'explorer': (0.0, 0.46), 'gunship': (0.02, 0.26), 'dropship': (0.0, 0.3), 'hauler': (0.02, 0.34), 'miner': (0.02, 0.3)}[C]
    arc0, arc1 = {'racer': 42, 'runabout': 12, 'gunship': 48, 'explorer': 22}.get(C, 30), None; arc1 = 180 - arc0
    bm = bmesh.new(); rows = []; zs = [hz1 + NL * (span0 + (span1 - span0) * k / 4) for k in range(5)]
    for z in zs:
        c_, ry, cx, rx, ee = sect(z); rows.append([bm.verts.new(P(cx + 1.012 * rx * math.copysign(abs(math.cos(a_)) ** (2 / ee), math.cos(a_)), c_ + 1.012 * ry * math.copysign(abs(math.sin(a_)) ** (2 / ee), math.sin(a_)), z)) for a_ in (math.radians(arc0 + (arc1 - arc0) * k / 16) for k in range(17))])
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(16): bm.faces.new([r0[k], r0[k + 1], r1[k + 1], r1[k]])
    for f in bm.faces:
        if (f.calc_center_median() - mathutils.Vector(P(xc, cy, (hz0 + hz1) / 2))).dot(f.normal) < 0: f.normal_flip()
    merge(p, bm, 'visor')
    for k in (0, 8, 16):        # canopy frames, along it
        pts = [rows[j][k].co for j in range(5)] if False else None
    # plating: dark seams round the hull, a heat-shielded belly, a contrasting spine
    n_seams = max(3, int(L / 1.9))
    for k in range(n_seams + 1):
        z = hz0 + 0.5 + (hz1 + NL * 0.05 - hz0 - 0.5) * k / n_seams; c_, ry, cx, rx, ee = sect(z)
        add_loft(p, [(z, c_, ry * 1.006, cx, rx * 1.006, ee), (z + 0.045, c_, ry * 1.006, cx, rx * 1.006, ee)], 'rubber', 48, axis='z', cap=False)
    add_loft(p, [(hz0 + 0.1, cy - hh * 0.72, hh * 0.3, xc, hw * 0.8, 3), (hz1, cy - hh * 0.74, hh * 0.3, xc, hw * 0.82, 3), (hz1 + NL * 0.55, secs[-2][1] - secs[-2][2] * 0.6, secs[-2][2] * 0.45, xc, secs[-2][4] * 0.7, 2.5)], 'heatshield', 32, axis='z')
    gear = [(xc - hw * 0.62, hz0 + 1.0), (xc + hw * 0.62, hz0 + 1.0), (xc - hw * 0.5, hz1 - 0.4), (xc + hw * 0.5, hz1 - 0.4)]
    ty = cy + hh * 0.96; stern = hz0 - 0.1

    if C == 'racer':
        # all engine and blade: a huge bell, forward-swept blades with wingtip pods, one tall dorsal knife
        R = hh * 0.9
        add_loft(p, [(max(0.1, hz0 - 2.0), cy, R * 0.95, xc, R * 0.95, 2.1), (hz0 - 0.3, cy, R * 1.04, xc, R * 1.04, 2.2), (hz0 + 1.0, cy, hh * 1.02, xc, hw * 1.0, e)], 'tint', 32, axis='z')
        _bell(p, xc, cy, max(0.0, hz0 - 3.0), max(0.1, hz0 - 1.9), R * 0.9, 16)
        span = 1.2 + 0.9 * v + max(0, W / 2 - hw)
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
            add_loft(p, [(hz0 + 0.6, sy, 0.3, sx, 0.3, 3), (hz0 + 1.2, sy, 0.46, sx, 0.5, 3), (hz1 - 0.2, sy, 0.46, sx, 0.5, 3), (hz1 + NL * 0.25, sy - 0.04, 0.2, sx, 0.3, 2.6)], 'tint', 24, axis='z')
            _beam(p, (xc + s * hw * 0.8, sy, hz0 + L * 0.3), (sx, sy, hz0 + L * 0.3), 0.3, 'paint'); _beam(p, (xc + s * hw * 0.8, sy, hz0 + L * 0.7), (sx, sy, hz0 + L * 0.7), 0.3, 'paint')
            for dy in (-0.14, 0.14):
                add_cyl(p, sx + dy, sy, hz1 + NL * 0.25, hz1 + NL * 0.25 + 2.1 + 0.3 * v, 0.055, 'metal', 10, axis='z')
                add_cyl(p, sx + dy, sy, hz1 + NL * 0.25 + 0.4, hz1 + NL * 0.25 + 1.0, 0.085, 'paint', 10, axis='z')
                add_cyl(p, sx + dy, sy, hz1 + NL * 0.25 + 2.1 + 0.3 * v, hz1 + NL * 0.25 + 2.3 + 0.3 * v, 0.08, 'metal', 10, axis='z')
            _nacelle(p, xc + s * hw * 0.62, cy + hh * 0.5, hz0 - 0.4, hz0 + L * 0.4, 0.5)
            _fin(p, [(xc + s * hw * 0.62, ty - 0.1, hz0 - 0.2), (xc + s * hw * 0.62, ty - 0.1, hz0 + 1.8), (xc + s * (hw * 0.62 + 0.8), ty + 1.3, hz0 + 0.2), (xc + s * (hw * 0.62 + 0.8), ty + 1.3, hz0 - 0.9)], 'tint', 0.1)
            # armour: overlapping plates down the flank
            for k in range(int(L / 1.7)):
                z0 = hz0 + 0.5 + k * 1.7; x = xc + s * side_x(cy + hh * 0.25, z0)
                add_box(p, x - (0.05 if s > 0 else 0.05), cy + hh * 0.05, z0, x + 0.05, cy + hh * 0.5, z0 + 1.5, 'paint', 0.02)
        add_cyl(p, xc, cy - hh, hz1 + NL * 0.15, hz1 + NL * 0.15 + 0.5, 0.34, 'paint', 16, axis='z')      # chin sensor ball
        add_cyl(p, xc, cy - hh, hz1 + NL * 0.15 + 0.5, hz1 + NL * 0.15 + 0.55, 0.2, 'visor', 16, axis='z')

    elif C == 'dropship':
        # a flying box of people: four huge ducted fans on pylons, a searchlight, armour skirts
        fr = 1.15 + 0.1 * v
        for s in (-1, 1):
            for (fz, up) in ((hz0 + L * 0.12, 1), (hz1 - L * 0.08, 0.4)):
                fx = xc + s * (hw + fr * 0.75); fy = cy + hh * 0.42 * up
                _duct(p, fx, fy, fz - 0.45, fr, 0.9)
                _beam(p, (xc + s * hw * 0.82, fy, fz), (fx - s * fr * 0.9, fy, fz), 0.32, 'paint')
                add_box(p, fx - 0.09, fy + fr * 1.07, fz - 0.3, fx + 0.09, fy + fr * 1.13, fz + 0.3, 'hazard', 0.004)
            add_box(p, xc + s * side_x(cy - hh * 0.5, hz0 + L / 2) - 0.06, cy - hh * 0.72, hz0 + 0.4, xc + s * side_x(cy - hh * 0.5, hz0 + L / 2) + 0.06, cy - hh * 0.1, hz1 - 0.4, 'paint', 0.02)
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
                    _container(p, xa, y0, z0, xb, y1, z1, 'tint' if (k + sel) % 2 else 'paint')
            for z in (hz0 + 0.45, hz1 - 0.45):
                _beam(p, (xc + s * hw * 0.85, yb - 0.08, z), (xc + s * (hw + bw + 0.2), yb - 0.08, z), 0.14); _beam(p, (xc + s * hw * 0.85, yb + 3.08, z), (xc + s * (hw + bw + 0.2), yb + 3.08, z), 0.14)
                _beam(p, (xc + s * (hw + bw + 0.2), yb - 0.08, z), (xc + s * (hw + bw + 0.2), yb + 3.08, z), 0.14)
            _beam(p, (xc + s * (hw + bw + 0.2), yb - 0.08, hz0 + 0.45), (xc + s * (hw + bw + 0.2), yb - 0.08, hz1 - 0.45), 0.14); _beam(p, (xc + s * (hw + bw + 0.2), yb + 3.08, hz0 + 0.45), (xc + s * (hw + bw + 0.2), yb + 3.08, hz1 - 0.45), 0.14)
            for dy in (-0.9, 0.9): _bell(p, xc + s * hw * 0.55, cy + dy * 0.8, max(0, hz0 - 2.3), hz0 - 0.5, 0.82, 12); _beam(p, (xc + s * hw * 0.55, cy + dy * 0.8, hz0 - 0.5), (xc + s * hw * 0.55, cy + dy * 0.5, hz0), 0.28)
            _radiator(p, xc + s * 0.4, ty + 0.28, hz0 + 1.0, xc + s * (hw * 0.95), hz0 + L * 0.5, 0.25)
        _beam(p, (xc, ty, hz0 + 0.6), (xc, ty + 0.3, hz0 + 0.8), 0.2, 'paint')
        for k in range(3): add_box(p, xc - hw * 0.55, cy - 0.5 + k * 0.32, hz1 + NL * 0.82, xc + hw * 0.55, cy - 0.42 + k * 0.32, hz1 + NL * 0.86, 'hazard', 0.004)

    elif C == 'miner':
        # a working barge, not symmetrical: a boom and grab on one side, a drill under the nose, ore hoppers and stacks
        s = 1 if v % 2 else -1
        bx = xc + s * hw * 0.8; by = ty; bz = hz1 - 0.8
        add_cyl(p, bx, by + 0.15, bz - 0.5, bz + 0.5, 0.42, 'paint', 18, axis='z')
        elbow = (bx + s * 2.1, by + 1.9, bz + 1.2); wrist = (bx + s * 2.9, by + 0.2, bz + 3.0)
        _beam(p, (bx, by + 0.15, bz), elbow, 0.34, 'hazard'); _beam(p, elbow, wrist, 0.24, 'paint')
        _beam(p, (bx + s * 0.1, by + 0.15, bz - 0.2), (elbow[0] - s * 0.3, elbow[1] - 0.45, elbow[2] - 0.4), 0.09, 'metal')     # hydraulic ram
        for k in range(3):
            a_ = -0.7 + 0.7 * k; _beam(p, wrist, (wrist[0] + math.sin(a_) * 0.7, wrist[1] - 0.45, wrist[2] + math.cos(a_) * 0.55), 0.13, 'metal'); _beam(p, (wrist[0] + math.sin(a_) * 0.7, wrist[1] - 0.45, wrist[2] + math.cos(a_) * 0.55), (wrist[0] + math.sin(a_) * 0.45, wrist[1] - 1.05, wrist[2] + math.cos(a_) * 0.35), 0.1, 'metal')
        # the drill: a stepped cone under the nose
        dy = cy - hh * 0.72; dz = secs[-2][0]
        add_cyl(p, xc, dy, dz - 1.2, dz + 0.2, 0.62, 'paint', 18, axis='z')
        for k in range(4): add_cyl(p, xc, dy, dz + 0.2 + k * 0.42, dz + 0.62 + k * 0.42, 0.6 - k * 0.13, 'metal', 14, axis='z', r2=0.47 - k * 0.13)
        add_cyl(p, xc, dy, dz + 1.88, dz + 2.3, 0.08, 'metal', 10, axis='z', r2=0.01)
        # hoppers on the far side, stacks aft
        for k in range(2 + v % 2):
            z0 = hz0 + 0.5 + k * 2.1; x0 = xc - s * (hw + 0.1); xa, xb = (x0 - 1.3, x0) if s > 0 else (x0, x0 + 1.3)
            add_box(p, xa, cy - hh * 0.4, z0, xb, cy + hh * 0.5, z0 + 1.8, 'paint', 0.03); add_box(p, xa + 0.1, cy + hh * 0.5, z0 + 0.1, xb - 0.1, cy + hh * 0.5 + 0.12, z0 + 1.7, 'heatshield', 0.01)
            for q in range(4): add_box(p, xa - 0.02, cy - hh * 0.3 + q * 0.3, z0 + 0.1, xb + 0.02, cy - hh * 0.3 + q * 0.3 + 0.05, z0 + 1.7, 'metal', 0.003)
        for q in (-0.7, 0.7):
            add_cyl(p, xc + q, hz0 + 0.8, ty - 0.2, ty + 1.3, 0.14, 'metal', 12); add_cyl(p, xc + q, hz0 + 0.8, ty + 1.3, ty + 1.45, 0.18, 'rubber', 12)
        for q in (-1, 1): _bell(p, xc + q * hw * 0.55, cy, max(0, hz0 - 1.9), hz0 - 0.1, 0.72, 10)

    elif C == 'ferry':
        # a long clean liner: rows of lit windows, a swept dorsal, a neat ring of small engines
        for s in (-1, 1):
            for row, yy in enumerate((cy + hh * 0.22,)):
                n = int(L / 0.95)
                for k in range(n):
                    z = hz0 + 0.6 + k * (L - 1.0) / n; x = side_x(yy, z)
                    add_box(p, xc + s * x - 0.03, yy - 0.2, z, xc + s * x + 0.03, yy + 0.2, z + 0.5, 'glow', 0.004)
            x = side_x(cy - hh * 0.2, hz0 + L / 2)
            add_box(p, xc + s * x - 0.02, cy - hh * 0.22, hz0 + 0.3, xc + s * x + 0.02, cy - hh * 0.14, hz1 + NL * 0.2, 'navwhite', 0.002)
            _plate(p, [(xc + s * hw * 0.88, cy - hh * 0.35, hz0 + 0.4), (xc + s * hw * 0.88, cy - hh * 0.35, hz0 + L * 0.45), (xc + s * (hw + 2.0), cy - hh * 0.15, hz0 + L * 0.08), (xc + s * (hw + 2.1), cy - hh * 0.15, hz0 - 0.5)], 'tint', 0.09)
            add_cyl(p, xc + s * (hw + 2.05), cy - hh * 0.15, hz0 - 0.5, hz0 - 0.3, 0.06, 'navgreen' if s > 0 else 'navred', 8, axis='z')
        for k in range(8):
            a_ = (k + 0.5) * math.pi / 4; _bell(p, xc + math.cos(a_) * hw * 0.68, cy + math.sin(a_) * hh * 0.7, max(0, hz0 - 1.2), hz0 - 0.1, 0.34, 8)
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
            a_ = 2 * math.pi * k / n; add_box(p, xc + math.cos(a_) * R - 0.09, cy + math.sin(a_) * R - 0.09, rz + 0.25, xc + math.cos(a_) * R + 0.09, cy + math.sin(a_) * R + 0.09, rz + 0.45, 'glow' if k % 7 == 0 else 'paint', 0.004)
        # the dish on a mast, turned up and out
        ds = 1 if v % 2 else -1; dx, dz = xc + ds * hw * 0.45, hz1 - L * 0.12; dy = ty + 1.35
        add_cyl(p, dx, dz, ty - 0.1, dy - 0.2, 0.09, 'metal', 10); add_cyl(p, dx, dz, dy - 0.26, dy + 0.2, 1.45, 'navwhite', 28, r2=0.14) if False else None
        add_cyl(p, dx, dz, dy - 0.34, dy, 0.16, 'paint', 12, r2=1.4); add_cyl(p, dx, dz, dy - 0.02, dy + 0.02, 1.34, 'heatshield', 28)
        for k in range(3): a_ = k * 2.094; _beam(p, (dx + math.cos(a_) * 1.2, dy, dz + math.sin(a_) * 1.2), (dx, dy + 0.85, dz), 0.04)
        add_cyl(p, dx, dz, dy + 0.82, dy + 0.98, 0.09, 'metal', 10)
        for s in (-1, 1):
            _radiator(p, xc + s * hw * 0.9, cy + 0.12, hz0 + 0.5, xc + s * (hw + 2.6 + 0.5 * v), hz0 + L * 0.32, 0.2)
            _beam(p, (xc + s * hw * 0.7, cy + hh * 0.5, hz0), (xc + s * hw * 0.7, cy + hh * 0.5, max(0.2, hz0 - 2.2)), 0.12); _beam(p, (xc + s * hw * 0.7, cy - hh * 0.5, hz0), (xc + s * hw * 0.7, cy - hh * 0.5, max(0.2, hz0 - 2.2)), 0.12)
            _beam(p, (xc + s * hw * 0.7, cy + hh * 0.5, hz0), (xc + s * hw * 0.7, cy - hh * 0.5, max(0.2, hz0 - 2.2)), 0.06)
            _bell(p, xc + s * hw * 0.7, cy, max(0, hz0 - 3.1), max(0.2, hz0 - 2.2), 0.72, 12)
        _beam(p, (xc, nose - NL * 0.05, cy) if False else (xc, cy, nose - NL * 0.1), (xc, cy, nose + 0.1), 0.04)

    else:   # runabout: small, friendly, rounded; over-wing pods on curved arms, a big bubble of glass
        for s in (-1, 1):
            nx = xc + s * (hw + 0.72); ny = cy + hh * 0.42
            _nacelle(p, nx, ny, hz0 - 0.1, hz0 + L * 0.72, 0.56)
            for z in (hz0 + L * 0.18, hz0 + L * 0.48):
                _beam(p, (xc + s * hw * 0.74, cy + hh * 0.05, z), (nx - s * 0.3, ny - 0.15, z), 0.26, 'paint')
            _fin(p, [(nx, ny + 0.5, hz0 + 0.1), (nx, ny + 0.5, hz0 + 1.3), (nx + s * 0.18, ny + 1.35, hz0 + 0.3), (nx + s * 0.18, ny + 1.35, hz0 - 0.2)], 'tint', 0.07)
            add_cyl(p, nx, ny + 0.57, hz0 + L * 0.6, hz0 + L * 0.65, 0.05, 'navgreen' if s > 0 else 'navred', 8, axis='z')
        for dx in (-0.3, 0.3): add_cyl(p, xc + dx, cy - hh * 0.2, nose - NL * 0.42, nose - NL * 0.4, 0.13, 'glow', 12, axis='z')

    # surface clutter where a real ship has it: hatches, vents and pipe runs along the top
    for k in range(int(10 + L * 1.2 * lay.get('look', {}).get('greeble', 1.0))):
        z = r.uniform(hz0 + 0.4, hz1 - 0.4); x = xc + r.choice([-1, 1]) * r.uniform(0.2, hw * 0.55); y = top_y(x, z)
        w_, d_, h_ = r.uniform(0.2, 0.55), r.uniform(0.3, 1.1), r.uniform(0.03, 0.09)
        add_box(p, x - w_ / 2, y - 0.12, z, x + w_ / 2, y + h_, z + d_, r.choice(['metal', 'paint', 'heatshield']), 0.01)
    for s in (-1, 1): add_box(p, xc + s * 0.6 - 0.03, ty - 0.04, hz0 + 0.5, xc + s * 0.6 + 0.03, ty + 0.05, hz1 - 0.5, 'metal', 0.004) if C not in ('runabout', 'racer') else None
    for (gx, gz) in gear:
        add_cyl(p, gx, gz, 0.3, cy - hh * 0.55, 0.09, 'paint', 10); add_cyl(p, gx, gz, 0.05, 0.45, 0.055, 'metal', 10); add_box(p, gx - 0.3, 0, gz - 0.42, gx + 0.3, 0.09, gz + 0.42, 'rubber', 0.015)
    ship_interior(p, lay)
