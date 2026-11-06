# The fleet: three working ships a kilometre long. Hard engineering, nothing decorative: armour where shots land, radiators
# where heat goes, spin where people live. One mesh each, built around the origin: x across, y up, z from stern (-) to bow (+).
# All original shapes. Run: blender -b --factory-startup -P tools/assets/build.py -- capital

def _plates(p, r, n, x0, x1, y0, y1, z0, z1, h, mats=('tint', 'tint', 'paint', 'heatshield')):
    """Slabs of armour scattered on a flat: raised panels of many sizes, the look of a thing built in sections."""
    for _ in range(n):
        w, d = r.uniform(3, 26), r.uniform(5, 44); x = r.uniform(x0, x1 - w); z = r.uniform(z0, z1 - d); t = r.uniform(0.4, h)
        add_box(p, x, y0, z, x + w, y0 + t if y1 > y0 else y0 - t, z + d, r.choice(mats), 0)

def _windows(p, x, y0, y1, z0, z1, n, rows=1, depth=0.25, sx=1, mat='lampwarm', r=None, lit=0.6):
    """Rows of lit windows along a flank at x."""
    for j in range(rows):
        y = y0 + (y1 - y0) * (j + 0.5) / rows
        for k in range(n):
            if r and r.random() > lit: continue
            z = z0 + (z1 - z0) * k / n
            add_box(p, x, y, z, x + sx * depth, y + 1.1, z + 2.4, mat, 0)

def _turret(p, x, y, z, R, up=1, barrels=2):
    add_cyl(p, x, z, y, y + up * R * 0.5, R, 'heatshield', 14); add_cyl(p, x, z, y + up * R * 0.5, y + up * R * 0.9, R * 0.72, 'tint', 12)
    for b in range(barrels):
        dx = (b - (barrels - 1) / 2) * R * 0.5
        add_cyl(p, x + dx, y + up * R * 0.65, z, z + R * 3.6, R * 0.11, 'metal', 8, axis='z')

def _hangar_block(p, lay, cx, cy, cz, side):
    """The docking block on a flank: a box round the walkable decks, its mouth facing out. Interior comes from the layout."""
    W, D = lay['W'], lay['D']; deck, ceil = lay['deck'], lay['ceiling']
    # in ship coordinates the layout's z runs along +x*side from the mouth inward; its x along ship z
    x_m, x_i = cx, cx - side * D                    # mouth, inner end
    a, b = (x_m, x_i) if x_m < x_i else (x_i, x_m); z0, z1 = cz - W / 2 - 2, cz + W / 2 + 2; y0, y1 = cy + deck - 3, cy + ceil + 3
    add_box(p, a, y0, z0, b, cy + deck - 0.4, z1, 'heatshield', 0); add_box(p, a, cy + ceil + 0.3, z0, b, y1, z1, 'tint', 0)
    add_box(p, a, y0, z0, b, y1, z0 + 1.6, 'tint', 0); add_box(p, a, y0, z1 - 1.6, b, y1, z1, 'tint', 0)
    for k in range(9):      # hazard chevrons and a lit lip round the mouth, so you can find it from a long way out
        z = z0 + (z1 - z0) * (k + 0.5) / 9
        add_box(p, x_m - 0.6, y0 - 0.4, z - 1.2, x_m + 0.6, y0 + 0.5, z + 1.2, 'hazard', 0)
        add_box(p, x_m - 0.6, y1 - 0.5, z - 1.2, x_m + 0.6, y1 + 0.4, z + 1.2, 'lampwarm', 0)
    for s in (-1, 1): add_box(p, x_m - 0.5, y0, cz + s * (W / 2 + 1) - 0.5, x_m + 0.5, y1, cz + s * (W / 2 + 1) + 0.5, 'lampcold' if False else 'glow', 0)

def bastion(p, lay, r):
    """A carrier: armoured slab, stepped citadel, command island, gun sponsons, engine block."""
    L = 860; zs, zb = -430, 430
    # the hull: a wide flat wedge, chamfered like cast armour
    secs = [(zs, 0, 40, 0, 84, 3.6), (zs + 90, 0, 48, 0, 97, 3.4), (60, -2, 50, 0, 99, 3.2), (250, -8, 40, 0, 78, 2.5), (380, -12, 22, 0, 44, 1.8), (zb, -14, 5, 0, 10, 1.5)]
    add_loft(p, secs, 'tint', 72, axis='z')
    def surf(x, z, up):
        for (za, *A), (zb_, *B) in zip(secs, secs[1:]):
            if za <= z <= zb_:
                t = (z - za) / (zb_ - za); c, ry, cx, rx, e = [u + (w - u) * t for u, w in zip(A, B)]; q = 1 - min(1, abs((x - cx) / rx)) ** e
                return c + up * ry * max(q, 0) ** (1 / e), rx
        return None, 0
    def skin(n, up, z0, z1, h):     # armour that lies on the hull, wherever the hull is
        for _ in range(n):
            z = r.uniform(z0, z1); yy, rx = surf(0, z, up)
            if yy is None: continue
            x = r.uniform(-rx * 0.8, rx * 0.8); w, d = min(r.uniform(3, 24), rx * 0.3), r.uniform(5, 38); yy, _r = surf(x, z, up); y1, _r = surf(x, min(z + d, z1), up); y2, _r = surf(x + w, z, up)
            if yy is None or y1 is None or y2 is None: continue
            lo, hi = (min(yy, y1, y2) - 1.5, max(yy, y1, y2) + r.uniform(0.4, h)) if up > 0 else (min(yy, y1, y2) - r.uniform(0.4, h), max(yy, y1, y2) + 1.5)
            add_box(p, x, lo, z, x + w, hi, z + d, r.choice(('tint', 'paint', 'tint', 'heatshield')), 0)
    # a flat flight deck along the back, offset to one side as an angled carrier's is
    add_box(p, -62, 26, -340, 58, 58, 215, 'heatshield', 0)
    for k in range(38):
        z = -330 + k * 14.2; add_box(p, -3, 58, z, 3, 58.3, z + 7, 'hazard' if k % 6 == 0 else 'paint', 0)
    for s in (-52, 48): add_box(p, s, 58, -335, s + 1.2, 58.2, 212, 'lampwarm', 0)
    # the citadel and the command island, stepped back as ships' superstructures are
    add_box(p, 34, 58, -240, 66, 84, -40, 'tint', 0); add_box(p, 38, 84, -225, 62, 104, -80, 'paint', 0); add_box(p, 42, 104, -210, 60, 122, -120, 'tint', 0); add_box(p, 45, 122, -190, 58, 132, -140, 'heatshield', 0)
    _windows(p, 33.7, 62, 82, -236, -44, 90, 4, sx=-1, r=r, lit=0.55); _windows(p, 37.7, 88, 102, -222, -84, 60, 3, sx=-1, r=r, lit=0.5); _windows(p, 41.7, 108, 120, -205, -125, 30, 2, sx=-1, mat='visor', r=r, lit=1)
    for (h, x, z) in ((46, 52, -170), (30, 48, -150), (24, 55, -185)): add_cyl(p, x, z, 132, 132 + h, 0.7, 'metal', 6)
    add_cyl(p, 52, -130, 122, 133, 9, 'heatshield', 16); add_cyl(p, 52, -130, 133, 136, 10.5, 'paint', 16, r2=3)
    # armour belts stepped down each flank, gun sponsons along them
    for s in (-1, 1):
        for k in range(22):
            z = -395 + k * 30; w = 92 if z < 150 else max(40, 92 - (z - 150) * 0.2)
            if s > 0 and -62 < z + 13 < 2: continue
            add_box(p, s * (w - 2) if s > 0 else -w - 7, -18, z, s * (w + 7) if s > 0 else -w + 2, 22, z + 27, r.choice(['tint', 'paint', 'tint']), 0)
            add_box(p, s * (w + 7) - 1.2 * s, -14, z + 3, s * (w + 7) + 0.3 * s, 18, z + 22, 'heatshield', 0)
        for k in range(9):
            z = -340 + k * 62; w = 96 if z < 150 else 66
            if s > 0 and -75 < z < 15: continue
            _turret(p, s * (w + 2), 22, z, 9, 1, 3); _turret(p, s * (w + 2), -18, z + 20, 7, -1, 2)
        _windows(p, s * 92.3, -32, -24, -300, -60, 80, 2, sx=s, r=r, lit=0.5); _windows(p, s * 92.3, -32, -24, 10, 200, 60, 2, sx=s, r=r, lit=0.5)
    # heavy guns on the spine, forward of the deck
    for z in (270, 315): _turret(p, 0, surf(0, z)[0] if False else 28, z, 18, 1, 3)
    # belly: keel plates and bay doors
    skin(420, -1, -420, 330, 2.4)
    _plates(p, r, 420, -60, 54, 58.2, 59, -330, 205, 0.9, ('paint', 'heatshield', 'metal'))
    skin(330, 1, 216, 420, 1.8)
    # engine block
    add_box(p, -70, -38, -462, 70, 36, zs + 6, 'heatshield', 0)
    for (x, y, R) in ((-44, 10, 22), (0, 10, 22), (44, 10, 22), (-44, -22, 14), (-15, -22, 14), (15, -22, 14), (44, -22, 14)):
        _engine(p, x, y, -505, -462, R)
    for k in range(30): a = k * 0.21; _beam(p, (math.cos(a) * 60, math.sin(a) * 30 + 2, -462), (math.cos(a) * 42, math.sin(a) * 18 + 2, -430), 0.8, 'metal')
    _radiator(p, -70, 36, -450, -150, -330, 18); _radiator(p, 70, 36, -450, 150, -330, 18)
    return (99.5, 12, -30, 1)        # where the docking block's mouth goes: x, y, z, side

def halcyon(p, lay, r):
    """A private liner, and it looks like it: one long clean line from a needle bow to three faired engines, swept wings with a true section, a raked fin, ribbons of windows."""
    secs = [(-385, 2, 24, 0, 34, 2), (-300, 0, 42, 0, 60, 2), (-40, 0, 48, 0, 72, 2), (150, -3, 38, 0, 54, 2), (280, -8, 20, 0, 28, 2), (360, -11, 6, 0, 8, 2), (404, -12, 0.4, 0, 0.5, 2)]
    add_loft(p, secs, 'tint', 72, axis='z')
    def at(z):
        for (za, *A), (zb, *B) in zip(secs, secs[1:]):
            if za <= z <= zb: t = (z - za) / (zb - za); return [q + (w - q) * t for q, w in zip(A, B)]
        return list(secs[-1][1:])
    def side(y, z):
        c, ry, cx, rx, e = at(z); q = 1 - min(1, abs((y - c) / ry)) ** e; return rx * max(q, 0) ** (1 / e)
    # wings: long, thin, swept right back
    for s_ in (-1, 1):
        st = [(s_ * 40, -12, 11, -30, 190, 2), (s_ * 110, -13, 7.5, -130, 118, 2), (s_ * 200, -11, 4, -235, 60, 2), (s_ * 290, -6, 1.4, -325, 22, 2), (s_ * 335, -2, 0.3, -372, 6, 2)]
        add_loft(p, st if s_ > 0 else st[::-1], 'tint', 28, axis='x')
        add_box(p, s_ * 335 - 1, -2.6, -378, s_ * 335 + 1, -1.4, -370, 'navgreen' if s_ > 0 else 'navred', 0)
        # engines faired into the wing roots
        ex = s_ * 62; add_loft(p, [(-120, -14, 1, ex, 1, 2), (-250, -14, 18, ex, 19, 2), (-370, -14, 19, ex, 20, 2), (-405, -14, 17, ex, 18, 2)], 'tint', 32, axis='z'); _bell(p, ex, -14, -432, -404, 17, 18)
        # ribbons of windows, following the hull
        for y, a, b in ((14, -300, 150), (6, -300, 190), (-2, -300, 190), (22, -280, 60)):
            z = a
            while z < b:
                if (s_ > 0 and -84 < z < -36) or r.random() > 0.86: z += 3.2; continue
                x = side(y, z); add_box(p, s_ * x - 0.3, y, z, s_ * x + 0.3, y + 1.3, z + 2.3, 'lampwarm', 0); z += 3.2
        for y in (-7, 28):
            pts = [(s_ * side(y, z) * 1.002, y, z) for z in range(-300, 280, 40)]
            for u, w in zip(pts, pts[1:]): _beam(p, u, w, 0.45, 'metal')
    # the bow canopy: a long sweep of glass, framed
    bm = bmesh.new(); rows = []
    for k in range(9):
        z = 150 + 130 * k / 8; c, ry, cx, rx, e = at(z)
        rows.append([bm.verts.new(P(1.008 * rx * math.cos(q), c + 1.008 * ry * math.sin(q), z)) for q in (math.radians(48 + 84 * j / 16) for j in range(17))])
    for a_, b_ in zip(rows, rows[1:]):
        for j in range(16): bm.faces.new([a_[j], a_[j + 1], b_[j + 1], b_[j]])
    for f in bm.faces:
        f.normal_update()
        if (f.calc_center_median() - mathutils.Vector(P(0, 0, 0))).dot(f.normal) < 0: f.normal_flip()
    merge(p, bm, 'visor')
    # a raked fin, and the centre engine under it
    st = [(-340, 2, 50), (-120, 2, 44)]
    bm = bmesh.new(); pts = [(0, 38, -330), (0, 42, -120), (0, 150, -360), (0, 156, -410)]; bm.faces.new([bm.verts.new(P(*q)) for q in pts]); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=2.2); merge(p, bm, 'tint')
    _bell(p, 0, 2, -420, -383, 21, 20)
    add_box(p, -0.8, 156, -412, 0.8, 158, -404, 'navwhite', 0)
    return (73, -8, -60, 1)

def _torus(p, R, r_, z, mat, n=72):
    """A ring about the z axis."""
    bm = bmesh.new(); m = 10; rings = []
    for i in range(n):
        a = 2 * math.pi * i / n; c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new(P((R + r_ * math.cos(2 * math.pi * j / m)) * c, (R + r_ * math.cos(2 * math.pi * j / m)) * s, z + r_ * 1.4 * math.sin(2 * math.pi * j / m))) for j in range(m)])
    for i in range(n):
        for j in range(m): bm.faces.new([rings[i][j], rings[(i + 1) % n][j], rings[(i + 1) % n][(j + 1) % m], rings[i][(j + 1) % m]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def meridian(p, lay, r):
    """A colony liner: a long spine, three spin rings where people live, a great glass atrium at the bow, a sail of radiators aft."""
    # spine, in sections with service collars
    add_loft(p, [(-560, 0, 30, 0, 30, 2), (-430, 0, 38, 0, 38, 2.2), (340, 0, 38, 0, 38, 2.2), (440, 0, 58, 0, 58, 2.2), (520, 0, 74, 0, 74, 2), (580, 0, 60, 0, 60, 2)], 'tint', 56, axis='z')
    for k in range(32): z = -420 + k * 24; add_cyl(p, 0, 0, z, z + 2.4, 39.5, 'metal' if k % 4 else 'heatshield', 40, axis='z')
    # the atrium: a glass dome on the bow over a lit garden, ribs over it
    add_loft(p, [(575, 0, 62, 0, 62, 2), (610, 0, 56, 0, 56, 2), (640, 0, 36, 0, 36, 2), (652, 0, 6, 0, 6, 2)], 'visor', 40, axis='z')
    for k in range(16):
        a = k * math.pi / 8
        for (z0, R0, z1, R1) in ((575, 63, 610, 57), (610, 57, 640, 37), (640, 37, 652, 7)):
            _beam(p, (math.cos(a) * R0, math.sin(a) * R0, z0), (math.cos(a) * R1, math.sin(a) * R1, z1), 0.9, 'metal')
    _windows(p, 58.6, -30, 30, 450, 560, 46, 7, sx=1, r=r, lit=0.8); _windows(p, -58.6, -30, 30, 450, 560, 46, 7, sx=-1, r=r, lit=0.8)
    # three spin rings on spokes
    for (rz, R) in ((-170, 210), (60, 240), (260, 190)):
        _torus(p, R, 16, rz, 'tint'); _torus(p, R - 15.5, 2.8, rz, 'heatshield'); _torus(p, R + 15.5, 1.6, rz, 'paint', 60)
        for k in range(110):
            a = 2 * math.pi * k / 110
            if r.random() < 0.72:
                c, s = math.cos(a), math.sin(a); add_box(p, c * (R + 16.2) - 2.6, s * (R + 16.2) - 2.6, rz - 9, c * (R + 16.8) + 2.6, s * (R + 16.8) + 2.6, rz - 8.4 + r.uniform(0, 17), 'lampwarm', 0)
        for k in range(6):
            a = k * math.pi / 3 + 0.26; c, s = math.cos(a), math.sin(a)
            add_cyl(p, 0, 0, rz - 6, rz + 6, 42, 'metal', 28, axis='z')
            _beam(p, (c * 38, s * 38, rz), (c * (R - 14), s * (R - 14), rz), 7.2, 'tint'); _beam(p, (c * 38, s * 38, rz + 5), (c * (R - 14), s * (R - 14), rz + 5), 1.2, 'metal')
    # radiators: a broad dark sail each side, aft, edge-on to the sun
    for s in (-1, 1):
        for k in range(3):
            z0 = -520 + k * 92; _radiator(p, s * 36, 0, z0, s * (360 - k * 56), z0 + 74, 0)
        _beam(p, (s * 30, 0, -520), (s * 360, 0, -520), 4, 'metal')
    # the reactor block and engines
    add_cyl(p, 0, 0, -600, -556, 48, 'heatshield', 36, axis='z', r2=32)
    for (x, y) in ((0, 34), (29, -17), (-29, -17)):
        _engine(p, x, y, -660, -600, 26)
    _plates(p, r, 180, -28, 28, 39, 41, -420, 340, 1.4)
    return (112, -20, -300, 1)

def longshore(p, lay, r):
    """A bulk hauler: nothing but a truss, its cargo, and the engines to shove it. Cab at the bow; containers by the hundred."""
    H, Wd = 26, 26; z0, z1 = -640, 640
    for (x, y) in ((-Wd, -H), (Wd, -H), (-Wd, H), (Wd, H)): add_box(p, x - 2.2, y - 2.2, z0, x + 2.2, y + 2.2, z1, 'metal', 0)
    for k in range(80):
        z = z0 + k * 16; z2 = z + 16
        for ((a, b), (c, d)) in ((((-Wd, -H)), ((Wd, -H))), (((-Wd, H)), ((Wd, H))), (((-Wd, -H)), ((-Wd, H))), (((Wd, -H)), ((Wd, H)))):
            if k % 2 == 0: _beam(p, (a, b, z), (c, d, z2), 0.9, 'metal')
            else: _beam(p, (c, d, z), (a, b, z2), 0.9, 'metal')
    # the cargo: racks of containers round the truss, in owners' blocks of colour, some racks empty
    cols = 48
    for k in range(cols):
        z = z0 + 70 + k * 23.5
        if (k * 7) % 11 == 0: continue
        for (x0, y0, nx, ny, dx, dy) in ((-Wd, H + 3, 5, 2, 12.8, 13), (-Wd, -H - 16, 5, 2, 12.8, -13), (Wd + 3, -H, 2, 4, 13, 13.2), (-Wd - 16, -H, 2, 4, -13, 13.2)):
            for i in range(nx):
                for j in range(ny):
                    if r.random() < 0.1: continue
                    x, y = x0 + i * dx, y0 + j * dy; col = ['tint', 'paint', 'heatshield', 'tint', 'metal', 'paint', 'heatshield', 'hazard', 'tint', 'paint'][(k // 5 + i // 2 + j) % 10]
                    add_box(p, x, y, z, x + 12.2, y + 12.2, z + 22.5, col, 0)
                    add_box(p, x - 0.1, y + 1.4, z + 1, x + 12.3, y + 1.8, z + 21.5, 'rubber', 0)
    # the cab: a blunt block with a long window strip, on a neck ahead of the cargo
    add_loft(p, [(600, 0, 34, 0, 34, 4), (640, 0, 38, 0, 40, 4), (690, -2, 36, 0, 38, 3.4), (725, -6, 22, 0, 26, 2.8), (742, -10, 6, 0, 8, 2.2)], 'tint', 40, axis='z')
    for s in (-1, 1): add_box(p, s * 37.6 if s > 0 else -38.6, 18, 660, s * 38.6 if s > 0 else -37.6, 26, 700, 'visor', 0)
    add_box(p, -26, 34, 690, 26, 40, 716, 'visor', 0)
    _windows(p, 40.3, -14, 14, 620, 690, 36, 5, sx=1, r=r, lit=0.55); _windows(p, -40.3, -14, 14, 620, 690, 36, 5, sx=-1, r=r, lit=0.55)
    add_cyl(p, 18, 660, 36, 76, 1, 'metal', 6); add_cyl(p, 18, 660, 76, 80, 12, 'heatshield', 16, r2=2)
    # reactor and drive at the stern, a shadow shield between them and the cargo
    add_cyl(p, 0, 0, -652, -640, 58, 'heatshield', 40, axis='z')
    add_loft(p, [(-760, 0, 30, 0, 30, 2), (-700, 0, 44, 0, 44, 2.4), (-650, 0, 40, 0, 40, 2.4)], 'tint', 36, axis='z')
    for (x, y) in ((-34, -34), (34, -34), (-34, 34), (34, 34)):
        _engine(p, x, y, -830, -750, 30, 20); _beam(p, (x, y, -750), (x * 0.7, y * 0.7, -700), 7, 'metal')
    for s in (-1, 1):
        for k in range(4): z = -630 + k * 68; _radiator(p, s * 32, H + 28 if False else 0, z, s * 240, z + 58, 0)
    for s in (-1, 1):
        for k in range(6): add_cyl(p, s * 0, 0, 0, 0, 0.01, 'metal', 3) if False else None
    return (58, -18, 650, 1)


def _engine(p, x, y, z0, z1, R, ribs=16):
    """A big drive: the nozzle itself, gimbal struts forward of it, and the fairing that joins them to the ship."""
    _bell(p, x, y, z0, z1, R, ribs)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.3; c, s = math.cos(a), math.sin(a)
        _beam(p, (x + c * R * 0.55, y + s * R * 0.55, z1), (x + c * R * 0.95, y + s * R * 0.95, z1 + R * 0.7), R * 0.07, 'metal')
    add_cyl(p, x, y, z1, z1 + R * 0.9, R * 0.62, 'heatshield', 28, axis='z', r2=R * 0.85)

def _cells(p, x0, y, z0, nx, nz, size, gap, r, mat='heatshield'):
    """A grid of missile cells: frame, lids, a few open."""
    W_, D_ = nx * (size + gap) + gap, nz * (size + gap) + gap
    add_box(p, x0, y - 1, z0, x0 + W_, y + 0.35, z0 + D_, 'paint', 0)
    for i in range(nx):
        for j in range(nz):
            a, b = x0 + gap + i * (size + gap), z0 + gap + j * (size + gap)
            add_box(p, a, y + 0.35, b, a + size, y + (0.1 if r.random() < 0.08 else 0.6), b + size, mat if (i + j) % 3 else 'metal', 0)

def _vents(p, x, y0, z0, z1, n, h, sx=1, mat='heatshield'):
    """Slats on a flank."""
    for k in range(n):
        z = z0 + (z1 - z0) * k / n; add_box(p, x, y0, z, x + sx * 0.5, y0 + h, z + (z1 - z0) / n * 0.55, mat, 0)

def _pipes(p, r, x, y, z0, z1, n, sp, R, sx=1, mat='metal'):
    """Runs of pipe along the hull, with brackets and junction boxes."""
    for k in range(n):
        yy = y + k * sp
        add_cyl(p, x, yy, z0, z1, R, mat, 8, axis='z')
        zz = z0
        while zz < z1:
            add_box(p, x - R * 1.6, yy - R * 1.6, zz, x + R * 1.6, yy + R * 1.6, zz + R * 1.2, 'heatshield', 0)
            if r.random() < 0.12: add_box(p, x - R * 3, yy - R * 3, zz, x + R * 3, yy + R * 3, zz + R * 8, 'paint', 0)
            zz += r.uniform(9, 22)

def _pods(p, x, y, z0, z1, n, R, sx=1):
    """Lifeboats in their cradles: a row of capsules along a flank."""
    for k in range(n):
        z = z0 + (z1 - z0) * k / n
        add_cyl(p, x + sx * R, y, z, z + R * 3.6, R, 'paint', 10, axis='z', r2=R * 0.8); add_cyl(p, x + sx * R, y, z + R * 3.6, z + R * 4.2, R * 0.8, 'hazard', 10, axis='z', r2=R * 0.15)
        add_box(p, x, y - R * 0.3, z + R, x + sx * R, y + R * 0.3, z + R * 2.4, 'metal', 0)

def _mast(p, x, y, z, h, n=4):
    add_cyl(p, x, z, y, y + h, 0.5, 'metal', 6)
    for k in range(n):
        yy = y + h * (0.4 + 0.55 * k / n); w = h * 0.16 * (1 - k / n)
        add_box(p, x - w, yy, z - 0.12, x + w, yy + 0.24, z + 0.12, 'metal', 0)
    add_box(p, x - 0.4, y + h, z - 0.4, x + 0.4, y + h + 0.8, z + 0.4, 'navred', 0)

def _lighter(p, x, y, z, s=1.0, yaw_x=False):
    """A parked craft on a deck: gives everything its scale."""
    add_loft(p, [(z - 8 * s, y + 2.2 * s, 1.1 * s, x, 1.3 * s, 2.2), (z, y + 2.4 * s, 1.6 * s, x, 2.1 * s, 2.4), (z + 7 * s, y + 2.0 * s, 0.7 * s, x, 0.9 * s, 2), (z + 10 * s, y + 1.8 * s, 0.1, x, 0.15, 2)], 'tint', 12, axis='z')
    for q in (-1, 1): _plate(p, [(x + q * 1.8 * s, y + 2.2 * s, z - 6 * s), (x + q * 1.8 * s, y + 2.2 * s, z + 2 * s), (x + q * 7 * s, y + 2 * s, z - 5 * s), (x + q * 7 * s, y + 2 * s, z - 7 * s)], 'paint', 0.3)
    add_box(p, x - 1.2 * s, y, z - 2 * s, x + 1.2 * s, y + 1.1 * s, z + 2 * s, 'heatshield', 0)

def dress_bastion(p, r):
    # the deck: catapults, elevators, parked craft, missile batteries down both edges
    for x in (-34, -10, 14):
        add_box(p, x - 1.3, 58, -100, x + 1.3, 58.45, 212, 'metal', 0); add_box(p, x - 0.4, 58.45, -100, x + 0.4, 58.6, 212, 'rubber', 0)
    for (x0, z0, x1, z1) in ((-58, -300, -28, -262), (-58, -180, -28, -142), (-20, -300, 14, -262)):
        for (a, b, c, d) in ((x0, z0, x1, z0 + 1), (x0, z1 - 1, x1, z1), (x0, z0, x0 + 1, z1), (x1 - 1, z0, x1, z1)): add_box(p, a, 58, b, c, 58.3, d, 'hazard', 0)
    for k in range(16):
        _lighter(p, -50 + (k % 5) * 18, 58.2, -260 + (k // 5) * 44 + (k % 2) * 6, 1.25)
    _cells(p, -60.5, 58, -60, 3, 26, 2.3, 0.5, r); _cells(p, 50.5, 58, -30, 2, 30, 2.3, 0.5, r)
    # the hull forward of the deck: a raised spine with secondary guns, sensors at the prow
    add_box(p, -9, 28, 215, 9, 36, 352, 'paint', 0); add_box(p, -5, 36, 225, 5, 39, 340, 'tint', 0)
    for z in (235, 360): _mast(p, 0, 36, z, 20)
    for k in range(5): _turret(p, -18 if k % 2 else 18, 30 - k * 2, 232 + k * 26, 6, 1, 2)
    add_cyl(p, 0, 408, 2, 11, 4.5, 'paint', 12)
    # the island: walkways, dishes, more masts
    for (y, x0, x1, z0, z1) in ((84, 31, 69, -243, -37), (104, 36, 64, -228, -77), (122, 40, 62, -213, -117)):
        add_box(p, x0, y - 0.5, z0, x1, y + 0.2, z1, 'metal', 0)
    for (x, z, h) in ((39, -70, 26), (61, -60, 18), (47, -105, 22)): _mast(p, x, 104 if z < -80 else 84, z, h)
    add_cyl(p, 63, -100, 84, 91, 5, 'paint', 12, r2=1); add_cyl(p, 36, -55, 84, 88, 3, 'heatshield', 10)
    # flanks: pipe runs and vents between the armour belts and the keel, lifeboats high up
    for s in (-1, 1):
        rngz = ((-420, -66), (6, 300)) if s > 0 else ((-420, 300),)
        for (a, b) in rngz:
            _pipes(p, r, s * 98, 24, a, b, 3, 2.6, 0.7)
            _pods(p, s * 96, 36, a + 10, b - 20, int((b - a) / 16), 1.6, s)
            _vents(p, s * 96 if s > 0 else -96, -40, a, b, int((b - a) / 3.5), 6, s)
    # keel: a long block with sensor blisters and bay doors under it
    add_box(p, -22, -58, -400, 22, -44, 280, 'heatshield', 0)
    for k in range(10):
        z = -380 + k * 66; add_box(p, -18, -59, z, -1, -58, z + 48, 'paint', 0); add_box(p, 1, -59, z, 18, -58, z + 48, 'paint', 0)
        add_cyl(p, 26 if k % 2 else -26, z + 20, -54, -48, 4, 'paint', 10, r2=2)
    # the engine block: ducting and frames round the nozzles
    for x in (-66, -33, 0, 33, 66): add_box(p, x - 1.5, -38, -463, x + 1.5, 36, -440, 'metal', 0)
    for y in (-30, -6, 18): add_box(p, -70, y - 1, -463, 70, y + 1, -440, 'metal', 0)
    _pipes(p, r, 72, -30, -456, -340, 6, 9, 1.4)
    _pipes(p, r, -72, -30, -456, -340, 6, 9, 1.4)

def dress_meridian(p, r):
    # under the atrium's glass: a garden floor, terraces and trees, lit
    add_cyl(p, 0, 0, 575, 600, 54, 'grasslit' if False else 'leaf', 24, axis='z', r2=44) if False else None
    for k in range(70):
        a = r.uniform(0, 6.28); R0 = r.uniform(4, 44); z = r.uniform(585, 630); x, y = math.cos(a) * R0, -abs(math.sin(a)) * R0 * 0.6 - 8
        add_cyl(p, x, z, y, y + r.uniform(4, 12), r.uniform(2.5, 6), 'leaf', 7, r2=0.8)
    add_box(p, -48, -36, 578, 48, -12, 640, 'lampwarm', 0)
    # the spine: pipe runs and modules between the rings; tenders moored along it
    for a in range(6):
        c, s_ = math.cos(a * 1.047 + 0.5), math.sin(a * 1.047 + 0.5)
        for z0 in range(-400, 330, 34):
            if r.random() < 0.6: add_box(p, c * 38 - 4, s_ * 38 - 4, z0, c * 38 + 4, s_ * 38 + 4, z0 + r.uniform(8, 28), r.choice(('paint', 'heatshield', 'tint', 'metal')), 0)
    _pipes(p, r, 41, -14, -420, 340, 4, 8, 0.9); _pipes(p, r, -41, -14, -420, 340, 4, 8, 0.9)
    for (x, z) in ((-44, -100), (-44, 150), (44, 150), (0, 300)):
        _lighter(p, x, 34, z, 2.2)
    # the rings: truss round the inside, solar panels between spokes, docking arms, more windows in bands
    for (rz, R) in ((-170, 210), (60, 240), (260, 190)):
        n = 96
        for k in range(n):
            a = 2 * math.pi * k / n; c, s_ = math.cos(a), math.sin(a); a2 = a + 2 * math.pi / n; c2, s2 = math.cos(a2), math.sin(a2)
            _beam(p, (c * (R - 19), s_ * (R - 19), rz - 6), (c2 * (R - 19), s2 * (R - 19), rz + 6) if k % 2 else (c2 * (R - 19), s2 * (R - 19), rz - 6), 0.5, 'metal')
            if k % 3 == 0: add_box(p, c * (R + 16.3) - 3, s_ * (R + 16.3) - 3, rz + 11, c * (R + 16.9) + 3, s_ * (R + 16.9) + 3, rz + 14.5, 'heatshield', 0)
            for q in (-13.5, -11, 11, 13.5):
                if r.random() < 0.55: add_box(p, c * (R + 8) - 1.3, s_ * (R + 8) - 1.3, rz + q, c * (R + 9) + 1.3, s_ * (R + 9) + 1.3, rz + q + 0.7, 'lampwarm', 0)
    # solar sails on the aft ring's spokes
    for k in range(3):
        a = k * 2.094 + 0.8; c, s_ = math.cos(a), math.sin(a)
        for q in (1, -1): _radiator(p, c * 60 + q * (-s_) * 2, s_ * 60, -130, c * 170, -60, s_ * 110) if False else None
    # bow collar: portholes, a ring of tenders at the neck
    for k in range(10):
        a = k * 0.628; _lighter(p, math.cos(a) * 66, math.sin(a) * 66 - 2, 500, 1.3)

def dress_longshore(p, r):
    # gantry cranes that ride the cargo racks
    for z in (-420, -120, 180, 460):
        for (a, b) in ((-74, -74), (74, -74)): _beam(p, (a, -60, z), (a, 74, z), 2.2, 'hazard')
        _beam(p, (-74, 74, z), (74, 74, z), 2.6, 'hazard'); _beam(p, (-74, 72, z - 4), (74, 72, z - 4), 1.2, 'metal'); _beam(p, (-74, 74, z), (-74, 72, z - 4), 1, 'metal'); _beam(p, (74, 74, z), (74, 72, z - 4), 1, 'metal')
        add_box(p, -8, 66, z - 3, 8, 72, z + 3, 'heatshield', 0); _beam(p, (0, 66, z), (0, 45, z), 0.4, 'metal')
    # the cab: decks of windows, walkways, dishes, a mast farm
    for y in (-14, -3, 8): add_box(p, -41, y - 0.4, 612, -40, y + 0.2, 696, 'metal', 0); add_box(p, 40, y - 0.4, 612, 41, y + 0.2, 696, 'metal', 0)
    for (x, z, h) in ((-14, 640, 26), (-22, 668, 16), (6, 650, 20), (12, 690, 14)): _mast(p, x, 36, z, h)
    _pipes(p, r, 38, 24, 600, 700, 2, 3, 0.8); _pipes(p, r, -38, 24, 600, 700, 2, 3, 0.8)
    # service pipes along the truss, reactor shielding, radiators on booms
    _pipes(p, r, 0, 28.5, -640, 600, 2, 3, 1.6); _pipes(p, r, 0, -30, -640, 600, 2, 3, 1.6)
    for k in range(24):
        a = k * 0.2618; add_box(p, math.cos(a) * 56 - 2, math.sin(a) * 56 - 2, -654, math.cos(a) * 56 + 2, math.sin(a) * 56 + 2, -638, 'metal', 0)
    for k in range(10):
        a = k * 0.628; add_box(p, math.cos(a) * 42 - 1.5, math.sin(a) * 42 - 1.5, -745, math.cos(a) * 42 + 1.5, math.sin(a) * 42 + 1.5, -655, 'heatshield', 0)

def dress_decks(p, lay, name):
    """What makes a room read as part of a great ship, kept off the floor you walk on: all of it is on walls and overhead."""
    hx0, hz0, hx1, hz1 = lay['hull']; deck = lay['deck']; ceil = lay['ceiling']; xc = (hx0 + hx1) / 2; r = random.Random(name)
    # floor plates and a coloured guide line running through every hatch to the far end
    add_box(p, xc - 0.12, deck, hz0, xc + 0.12, deck + 0.012, hz1, 'hazard' if False else 'neonamber', 0)
    z = hz0
    while z < hz1:
        add_box(p, hx0 + 0.1, deck, z, hx1 - 0.1, deck + 0.006, z + 0.05, 'rubber', 0); z += 3
    for R in lay['rooms']:
        x0, z0, x1, z1 = R['rect']; hangar = R['purpose'] == 'hold'
        # ribs up the walls and across the roof, each bay with its own lights
        step = 7.0 if hangar else 3.2; zz = z0 + 0.8
        while zz < z1 - 0.3:
            for x in (x0 + 0.1, x1 - 0.42):
                add_box(p, x, deck, zz, x + 0.32, ceil, zz + 0.32, 'metal', 0)
            add_box(p, x0, ceil - 0.5, zz, x1, ceil, zz + 0.32, 'metal', 0)
            for qx in ((xc - 8, xc + 8) if hangar else (xc - 5, xc + 5)): add_box(p, qx - 1.4, ceil - 0.56, zz + (step / 2), qx + 1.4, ceil - 0.5, zz + (step / 2) + 0.3, 'lampwarm', 0)
            zz += step
        # conduit along both walls, high up
        for x in (x0 + 0.13, x1 - 0.13):
            for y, Rp, m in ((ceil - 1.1, 0.07, 'metal'), (ceil - 1.35, 0.05, 'paint'), (ceil - 1.55, 0.09, 'rubber')): add_cyl(p, x, y, z0 + 0.2, z1 - 0.2, Rp, m, 6, axis='z')
        # wall panels with status screens at eye height
        n = int((z1 - z0) / (9 if hangar else 4.4))
        for k in range(n):
            zc = z0 + (k + 0.5) * (z1 - z0) / max(1, n)
            for sx, x in ((1, x0 + 0.1), (-1, x1 - 0.1)):
                if r.random() < 0.5: add_box(p, min(x, x + sx * 0.04), deck + 1.25, zc - 0.5, max(x, x + sx * 0.04), deck + 1.9, zc + 0.5, 'screen', 0)
                add_box(p, min(x, x + sx * 0.02), deck + 0.02, zc - 1.3, max(x, x + sx * 0.02), deck + 0.9, zc + 1.3, 'paint', 0)
        if hangar:
            # a catwalk round the bay above head height and a gantry crane over the floor; landing marks
            cy_ = deck + 4.6
            for x, a, b in ((x0 + 0.1, x0 + 0.1, x0 + 1.4), (x1 - 0.1, x1 - 1.4, x1 - 0.1)):
                add_box(p, a, cy_ - 0.08, z0 + 1, b, cy_, z1 - 0.5, 'metal', 0)
                inner = max(a, b) if x < xc else min(a, b); add_box(p, inner - 0.02, cy_ + 1.0, z0 + 1, inner + 0.02, cy_ + 1.05, z1 - 0.5, 'hazard', 0)
            for zg in (z0 + 12, z0 + 28):
                add_box(p, x0 + 0.5, ceil - 1.1, zg, x1 - 0.5, ceil - 0.55, zg + 0.5, 'hazard', 0); add_box(p, xc + 3, ceil - 1.7, zg - 0.6, xc + 5, ceil - 1.1, zg + 1.1, 'heatshield', 0)
            for (a, b, c, d) in ((xc - 9, z0 + 9, xc + 9, z0 + 9.3), (xc - 9, z0 + 33, xc + 9, z0 + 33.3), (xc - 9, z0 + 9, xc - 8.7, z0 + 33), (xc + 8.7, z0 + 9, xc + 9, z0 + 33)):
                add_box(p, a, deck, b, c, deck + 0.012, d, 'hazard', 0)
            z_ = z0 + 2
            while z_ < z0 + 8: add_box(p, x0 + 2, deck, z_, x1 - 2, deck + 0.012, z_ + 0.45, 'hazard', 0); z_ += 1.4

CAPITALS = {'bastion': bastion, 'meridian': meridian, 'longshore': longshore, 'halcyon': halcyon}
DRESS = {'bastion': dress_bastion, 'meridian': dress_meridian, 'longshore': dress_longshore, 'halcyon': lambda p, r: None}
def build_capital():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)
    decks = json.load(open(os.path.join(ROOT, 'assets', 'ships', 'capital.json'))); hulls = []; rooms = []; docks = {}
    for name, fn in CAPITALS.items():
        p = Part(); r = random.Random(name); lay = decks[name + '_decks']; mouth = fn(p, lay, r); DRESS[name](p, r); _hangar_block(p, lay, *mouth); docks[name] = {'x': mouth[0], 'y': mouth[1], 'z': mouth[2], 'side': mouth[3]}
        ob = finish(p, name); ob['kind'] = name; ob['dims'] = [1, 1, 1]; hulls.append(ob); print('capital', name, len(ob.data.polygons), 'faces')
        p = Part(); ship_interior(p, lay); dress_decks(p, lay, name); ob = finish(p, name + '_decks'); ob['kind'] = name + '_decks'; ob['dims'] = [1, 1, 1]; rooms.append(ob); print('decks', name, len(ob.data.polygons), 'faces')
    json.dump(docks, open(os.path.join(ROOT, 'assets', 'ships', 'capital-docks.json'), 'w'), indent=1)
    for fname, group in (('capital.glb', hulls), ('capital-decks.glb', rooms)):
        bpy.ops.object.select_all(action='DESELECT')
        for ob in group: ob.select_set(True)
        out = os.path.join(ROOT, 'assets', fname)
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_materials='EXPORT', export_extras=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True)
        print('wrote', out, os.path.getsize(out) // 1024, 'KB')
