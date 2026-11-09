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

def _taper(p, x0, x1, z0, z1, y0, y1, ix, iz, mat):
    """A block whose walls lean in as they rise: nothing on a real superstructure stands dead plumb."""
    bm = bmesh.new(); c = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (x0 + ix, y1, z0 + iz), (x1 - ix, y1, z0 + iz), (x1 - ix, y1, z1 - iz), (x0 + ix, y1, z1 - iz)]; V = [bm.verts.new(P(*q)) for q in c]
    for f in ((0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)): bm.faces.new([V[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def _rails(p, x0, x1, z0, z1, y, h=1.2, step=5.0):
    """A deck edge: stanchions and two rails."""
    for (a, b) in (((x0, z0), (x1, z0)), ((x1, z0), (x1, z1)), ((x1, z1), (x0, z1)), ((x0, z1), (x0, z0))):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        for k in range(n + 1): _beam(p, (a[0] + (b[0] - a[0]) * k / n, y, a[1] + (b[1] - a[1]) * k / n), (a[0] + (b[0] - a[0]) * k / n, y + h, a[1] + (b[1] - a[1]) * k / n), 0.12, 'metal')
        for yy in (h * 0.55, h): _beam(p, (a[0], y + yy, a[1]), (b[0], y + yy, b[1]), 0.08, 'metal')

def _bridgeglass(p, x0, x1, z0, z1, y0, y1, lean=2.2, per=4.5):
    """The bridge's windows: glass raked outward at the top, every pane between mullions, a visor over it."""
    pts = [((x0, z0), (x1, z0)), ((x1, z0), (x1, z1)), ((x1, z1), (x0, z1)), ((x0, z1), (x0, z0))]; cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    for (a, b) in pts:
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(L / per))
        for k in range(n):
            t0, t1 = k / n, (k + 1) / n; A = (a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0); B = (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)
            out = lambda q: (q[0] + lean * (1 if q[0] > cx + 0.5 else -1 if q[0] < cx - 0.5 else 0), q[1] + lean * (1 if q[1] > cz + 0.5 else -1 if q[1] < cz - 0.5 else 0))
            At, Bt = out(A), out(B); bm = bmesh.new(); bm.faces.new([bm.verts.new(P(A[0], y0, A[1])), bm.verts.new(P(B[0], y0, B[1])), bm.verts.new(P(Bt[0], y1, Bt[1])), bm.verts.new(P(At[0], y1, At[1]))])
            f = bm.faces[0] if False else None
            for fc in bm.faces:
                fc.normal_update(); ctr = fc.calc_center_median()
                if (ctr - mathutils.Vector(P(cx, (y0 + y1) / 2, cz))).dot(fc.normal) < 0: fc.normal_flip()
            merge(p, bm, 'visor'); _beam(p, (A[0], y0, A[1]), (At[0], y1, At[1]), 0.34, 'heatshield')
    add_box(p, x0 - lean - 0.6, y1, z0 - lean - 0.6, x1 + lean + 0.6, y1 + 0.8, z1 + lean + 0.6, 'paint', 0)

def _phased(p, x, y0, y1, z0, z1, sx):
    """A flat radar array on a wall: a frame and its grid of elements."""
    add_box(p, min(x, x + sx * 0.4), y0, z0, max(x, x + sx * 0.4), y1, z1, 'heatshield', 0)
    for k in range(1, 5): add_box(p, min(x, x + sx * 0.5), y0 + (y1 - y0) * k / 5, z0, max(x, x + sx * 0.5), y0 + (y1 - y0) * k / 5 + 0.22, z1, 'metal', 0); add_box(p, min(x, x + sx * 0.5), y0, z0 + (z1 - z0) * k / 5, max(x, x + sx * 0.5), y1, z0 + (z1 - z0) * k / 5 + 0.22, 'metal', 0)

def _island(p, r):
    """A carrier's island, made as one is: a raked superstructure in decks, an overhanging flight-control room, a bridge with wings, funnels, radar arrays, a lattice mast, walkways and pipework up the walls."""
    x0, x1 = 34, 66
    # three raked decks, each stepped in, each with a walkway round it and windows along it
    tiers = ((x0, x1, -240, -40, 58, 84, 3, 4), (x0 + 4, x1 - 4, -226, -74, 86, 104, 2.4, 3), (x0 + 8, x1 - 7, -212, -112, 106, 118, 1.6, 2))
    for i, (a, b, c, d, y0, y1, ix, iz) in enumerate(tiers):
        _taper(p, a, b, c, d, y0, y1, ix, iz, 'tint')
        add_box(p, a + ix - 1.8, y1, c + iz - 1.8, b - ix + 1.8, y1 + 2, d - iz + 1.8, 'paint', 0)     # the deck's roof, standing proud
        _rails(p, a + ix - 1.6, b - ix + 1.6, c + iz - 1.6, d - iz + 1.6, y1 + 2, 1.4, 6)
        # bands of plating and windows on the raked walls
        for j in range(4 - i):
            yy = y0 + (y1 - y0) * (j + 0.5) / (4 - i); inset = ix * (yy - y0) / (y1 - y0); izs = iz * (yy - y0) / (y1 - y0)
            add_box(p, a + inset - 0.2, yy - 0.9, c + izs + 2, a + inset + 0.3, yy + 0.9, d - izs - 2, 'rubber', 0); add_box(p, b - inset - 0.3, yy - 0.9, c + izs + 2, b - inset + 0.2, yy + 0.9, d - izs - 2, 'rubber', 0)
            for s, xx in ((-1, a + inset - 0.3), (1, b - inset + 0.3)):
                n = int((d - c - 2 * izs - 4) / 4.2)
                for k in range(n):
                    if r.random() < 0.72: zk = c + izs + 3 + k * 4.2; add_box(p, xx - 0.06, yy - 0.55, zk, xx + 0.06, yy + 0.55, zk + 2.8, 'lampwarm', 0)
    # pipes and a ladderway up the walls
    for z in (-200, -150, -90):
        for dx in (0, 1.2): _beam(p, (x0 + 1 - dx * 0.1, 58, z + dx), (x0 + 4.2, 84, z + dx), 0.5, 'metal')
    # flight control: a glass box hung out over the deck from the side of the top tier
    add_box(p, 25, 111, -176, 44, 113, -146, 'heatshield', 0); _beam(p, (42, 100, -172), (29, 111, -172), 1.1, 'paint'); _beam(p, (42, 100, -150), (29, 111, -150), 1.1, 'paint')
    _bridgeglass(p, 27, 43, -174, -148, 113, 118, 1.1, 3.4)
    # the bridge on top, its wings reaching out each side
    _taper(p, x0 + 11, x1 - 10, -198, -128, 120, 124, 0.6, 0.6, 'paint')
    _bridgeglass(p, x0 + 12, x1 - 11, -196, -130, 124, 129.5, 1.6, 4.0)
    for (xa, xb) in ((x0 + 3, x0 + 12), (x1 - 11, x1 - 2)): add_box(p, xa, 123.4, -176, xb, 124.2, -152, 'paint', 0); _rails(p, xa, xb, -176, -152, 124.2, 1.3, 5)
    # funnels: exhausts behind the bridge, a cap and a grating on each
    for (fx, fz, R, h) in ((52, -222, 5.2, 16), (52, -96, 3.6, 12)):
        tierY = 104 if -226 < fz < -74 else 84; add_cyl(p, fx, fz, tierY, tierY + h + 10, R, 'tint', 28, r2=R * 0.84)
        for yy in (tierY + 6, tierY + 14): add_cyl(p, fx, fz, yy, yy + 0.5, R * 1.04, 'metal', 28)
        add_cyl(p, fx, fz, tierY + h + 10, tierY + h + 10.6, R * 0.88, 'heatshield', 28); add_cyl(p, fx, fz, tierY + h + 10.6, tierY + h + 10.9, R * 0.7, 'rubber', 24)
        for k in range(4): _beam(p, (fx - R * 0.8, tierY + h + 10.9, fz - R * 0.5 + k * R * 0.33), (fx + R * 0.8, tierY + h + 10.9, fz - R * 0.5 + k * R * 0.33), 0.16, 'metal')
    # a lattice mast, not a pole: four legs, braced, yards across, a radome and a whip on top
    mx, mz, base, top = 52, -160, 129.5, 176
    for k in range(5):
        y0, y1 = base + (top - base) * k / 5, base + (top - base) * (k + 1) / 5; w0, w1 = 4.5 * (1 - k / 5.6), 4.5 * (1 - (k + 1) / 5.6)
        for (sa, sb) in ((-1, -1), (1, -1), (1, 1), (-1, 1)): _beam(p, (mx + sa * w0, y0, mz + sb * w0), (mx + sa * w1, y1, mz + sb * w1), 0.5, 'metal')
        for (a0, b0, a1, b1) in ((-1, -1, 1, -1), (1, -1, 1, 1), (1, 1, -1, 1), (-1, 1, -1, -1)): _beam(p, (mx + a0 * w0, y0, mz + b0 * w0), (mx + a1 * w1, y1, mz + b1 * w1), 0.24, 'metal'); _beam(p, (mx + a0 * w1, y1, mz + b0 * w1), (mx + a1 * w1, y1, mz + b1 * w1), 0.24, 'metal')
        if k in (1, 3): add_box(p, mx - 12 + k * 1.5, y1, mz - 0.25, mx + 12 - k * 1.5, y1 + 0.5, mz + 0.25, 'metal', 0); add_box(p, mx - w1 - 1, y1 - 0.2, mz - w1 - 1, mx + w1 + 1, y1, mz + w1 + 1, 'paint', 0)
    _sloft(p, [(top - 0.5, mx, 0.1, mz, 0.1, 2)] if False else [(top, 0, 0.01, 0, 0.01, 2)], 'paint') if False else None
    add_cyl(p, mx, mz, top, top + 2.4, 3.2, 'paint', 24, r2=3.6); add_cyl(p, mx, mz, top + 2.4, top + 5.4, 3.6, 'paint', 24, r2=2.6); add_cyl(p, mx, mz, top + 5.4, top + 6.6, 2.6, 'paint', 24, r2=0.6); add_cyl(p, mx, mz, top + 6.6, top + 22, 0.18, 'metal', 8, r2=0.05); add_cyl(p, mx, mz, top + 22, top + 22.6, 0.25, 'navred', 8)
    # radar arrays on the top tier's four corners, a dish on the second, cowled vents, boats in davits
    _phased(p, x0 + 7.8, 107, 116, -200, -186, -1); _phased(p, x1 - 7.1, 107, 116, -200, -186, 1); _phased(p, x0 + 7.8, 107, 116, -138, -124, -1); _phased(p, x1 - 7.1, 107, 116, -138, -124, 1)
    add_cyl(p, 60, -92, 106, 108, 1.2, 'metal', 12); add_cyl(p, 60, -92, 108, 112, 0.4, 'paint', 24, r2=5.2); add_cyl(p, 60, -92, 111.8, 112, 5.2, 'heatshield', 28); _beam(p, (60, 112, -92), (60, 115, -92), 0.14, 'metal')
    for z in range(-235, -50, 22):
        add_box(p, 64, 86, z, 70, 89, z + 9, 'heatshield', 0) if -226 > z or z > -74 else None
    for (fx, fz) in ((45, -102), (58, -216)):
        add_cyl(p, fx, fz, 86, 90, 1.4, 'paint', 16); _beam(p, (fx, 90, fz), (fx, 91, fz + 1.5), 2.2, 'paint')

def _clear_decks(p, lay, cx, cy, cz, side):
    """Nothing outside may stand in the rooms. Anything that runs through where the decks go is cut away, big hull panels cut finely first so only what's inside the docking block goes (the block closes the hole from outside)."""
    W, D = lay['W'], lay['D']; a, b = sorted((cx, cx - side * D)); z0, z1 = cz - W / 2 + 0.05, cz + W / 2 - 0.05; y0, y1 = cy + lay['deck'] - 0.3, cy + lay['ceiling'] + 0.25
    def hit(f):
        xs = [v.co.x for v in f.verts]; ys = [v.co.z for v in f.verts]; zs = [-v.co.y for v in f.verts]
        return not (max(xs) < a or min(xs) > b or max(ys) < y0 or min(ys) > y1 or max(zs) < z0 or min(zs) > z1), max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    for _ in range(7):
        big = [f for f in p.bm.faces if hit(f)[0] and hit(f)[1] > 3]
        if not big: break
        edges = list({e_ for f in big for e_ in f.edges if e_.calc_length() > 2.5})
        if not edges: break
        bmesh.ops.subdivide_edges(p.bm, edges=edges, cuts=1, use_grid_fill=True)
        bmesh.ops.triangulate(p.bm, faces=[f for f in p.bm.faces if len(f.verts) > 4]) if False else None
    gone = [f for f in p.bm.faces if hit(f)[0]]
    bmesh.ops.delete(p.bm, geom=gone, context='FACES'); print('cleared', len(gone), 'faces from the decks')

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
            x = r.uniform(-rx * 0.8, rx * 0.8); w, d = min(r.uniform(3, 24), rx * 0.3), r.uniform(5, 38)
            if up > 0 and x + w > -64 and x < 60 and z + d > -342 and z < 217: continue      # (a flight deck is clear)
            yy, _r = surf(x, z, up); y1, _r = surf(x, min(z + d, z1), up); y2, _r = surf(x + w, z, up)
            if yy is None or y1 is None or y2 is None: continue
            lo, hi = (min(yy, y1, y2) - 1.5, max(yy, y1, y2) + r.uniform(0.4, h)) if up > 0 else (min(yy, y1, y2) - r.uniform(0.4, h), max(yy, y1, y2) + 1.5)
            add_box(p, x, lo, z, x + w, hi, z + d, r.choice(('tint', 'paint', 'tint', 'heatshield')), 0)
    # a flat flight deck along the back, offset to one side as an angled carrier's is
    add_box(p, -62, 26, -340, 58, 58, 215, 'heatshield', 0)
    for k in range(38):
        z = -330 + k * 14.2; add_box(p, -3, 58, z, 3, 58.3, z + 7, 'hazard' if k % 6 == 0 else 'paint', 0)
    for s in (-52, 48): add_box(p, s, 58, -335, s + 1.2, 58.2, 212, 'lampwarm', 0)
    _island(p, r)
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
    # the flight deck is one even surface of laid plates: a grid of joints, nothing standing on it but what's meant to
    for gx in range(-60, 58, 10): add_box(p, gx, 58, -338, gx + 0.1, 58.015, 213, 'paint', 0)
    for gz in range(-338, 214, 10): add_box(p, -61, 58, gz, 57, 58.015, gz + 0.1, 'paint', 0)
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

RING_PARTS = {}
def _ringshell(p, R, rz, glazed=False, n=192, m=28):
    """A habitat tube round the axle: its section a squared ellipse 40 m deep and 64 wide. The side toward the axle carries its windows
    (all of it, in the greenhouse ring); lit window bands along its flanks, frames round it every few degrees."""
    bm = bmesh.new(); Q = [_se(2 * math.pi * j / m, 3.0) for j in range(m)]
    rings = [[bm.verts.new(P((R + 20 * q[1]) * math.cos(2 * math.pi * i / n), (R + 20 * q[1]) * math.sin(2 * math.pi * i / n), rz + 32 * q[0])) for q in Q] for i in range(n)]
    hull, glass = [], []
    for i in range(n):
        for j in range(m):
            f = bm.faces.new([rings[i][j], rings[(i + 1) % n][j], rings[(i + 1) % n][(j + 1) % m], rings[i][(j + 1) % m]])
            qm = (Q[j][1] + Q[(j + 1) % m][1]) / 2; (glass if (qm < -0.55 if not glazed else qm < 0.1) else hull).append(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.normal_update(); c = f.calc_center_median(); x, y = c.x, -c.y * 0; rr = math.hypot(c.x, c.z); ctr = mathutils.Vector((c.x / rr * R, c.y, c.z / rr * R)) if False else None
    g2 = bm.copy(); [g2.faces.remove(f) for f in [f for f in g2.faces if f.index in {x.index for x in hull}]] if False else None
    keep_glass = {f.index for f in glass}
    bm2 = bm.copy(); bmesh.ops.delete(bm2, geom=[f for f in bm2.faces if f.index not in keep_glass], context='FACES'); merge(p, bm2, 'visor')
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index in keep_glass], context='FACES'); merge(p, bm, 'tint')
    for k in range(48):              # frames round the tube
        a = 2 * math.pi * k / 48; c, s_ = math.cos(a), math.sin(a)
        pts = [((R + 20.6 * q[1]) * c, (R + 20.6 * q[1]) * s_, rz + 32.6 * q[0]) for q in (_se(2 * math.pi * j / 24, 3.0) for j in range(25))]
        for q0, q1 in zip(pts, pts[1:]): _beam(p, q0, q1, 1.4, 'heatshield')
    for sz in (-1, 1):               # lit bands down each flank, where the flats in the hull look out
        for k in range(144):
            a = 2 * math.pi * k / 144; c, s_ = math.cos(a), math.sin(a)
            if (k * 7) % 5 < 4:
                bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in (((R + 4) * c, (R + 4) * s_, rz + sz * 31.4), ((R + 4) * math.cos(a + 0.03), (R + 4) * math.sin(a + 0.03), rz + sz * 31.4), ((R - 2) * math.cos(a + 0.03), (R - 2) * math.sin(a + 0.03), rz + sz * 31.6), ((R - 2) * c, (R - 2) * s_, rz + sz * 31.6))]
                bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.4); merge(p, bm, 'lampwarm')

def meridian(p, lay, r):
    """A colony liner: a long spine, three spin rings where people live, a great glass atrium at the bow, a sail of radiators aft."""
    # spine, in sections with service collars
    add_loft(p, [(-560, 0, 30, 0, 30, 2), (-430, 0, 38, 0, 38, 2.2), (340, 0, 38, 0, 38, 2.2), (440, 0, 58, 0, 58, 2.2), (520, 0, 74, 0, 74, 2), (580, 0, 60, 0, 60, 2)], 'tint', 56, axis='z')
    for k in range(32): z = -420 + k * 24; add_cyl(p, 0, 0, z, z + 2.4, 39.5, 'metal' if k % 4 else 'heatshield', 40, axis='z')
    # the atrium: a glass dome on the bow over a lit garden, ribs over it
    _sloft(p, [(575, 0, 62, 0, 62, 2), (610, 0, 56, 0, 56, 2), (640, 0, 36, 0, 36, 2), (651, 0, 8, 0, 8, 2), (652, 0, 0.5, 0, 0.5, 2)], 'glass', 96, per=6)
    # ribs that follow the glass, hoops round it
    prof = smooth_secs([(575, 62.6), (610, 56.6), (640, 36.6), (651, 8.5), (652, 1.0)], 5)
    for k in range(24):
        a = k * math.pi / 12
        for (z0, R0), (z1, R1) in zip(prof, prof[1:]): _beam(p, (math.cos(a) * R0, math.sin(a) * R0, z0), (math.cos(a) * R1, math.sin(a) * R1, z1), 0.6, 'metal')
    for (zh, Rh) in ((590, 60.8), (610, 56.8), (626, 49), (640, 37)): _shell(p, 0, 0, [(zh, Rh - 0.1), (zh + 0.5, Rh - 0.1), (zh + 0.5, Rh + 0.4), (zh, Rh + 0.4), (zh, Rh - 0.1)], 'metal', n=96)
    _windows(p, 58.6, -30, 30, 450, 560, 46, 7, sx=1, r=r, lit=0.8); _windows(p, -58.6, -30, 30, 450, 560, 46, 7, sx=-1, r=r, lit=0.8)
    # three spin rings on spokes, each its own piece because each turns: a habitat tube of squared section (people live in it: js/gen/rings.js), its hub, six spokes with lifts in them
    RING_PARTS['meridian'] = []
    for i, (rz, R) in enumerate(((60, 240), (260, 190), (-170, 210))):
        q = Part(); RING_PARTS['meridian'].append(q); glazed = i == 1
        _ringshell(q, R, rz, glazed)
        add_cyl(q, 0, 0, rz - 8, rz + 8, 44, 'metal', 40, axis='z'); add_cyl(q, 0, 0, rz - 9, rz - 8, 46, 'heatshield', 40, axis='z'); add_cyl(q, 0, 0, rz + 8, rz + 9, 46, 'heatshield', 40, axis='z')
        for k in range(6):
            a = (k + 0.5) * math.pi / 3 - math.pi / 2; c, s = math.cos(a), math.sin(a)     # (spoke k comes down to the floor at s = (k + 0.5) C / 6: see gen/rings.js)
            _beam(q, (c * 44, s * 44, rz), (c * (R - 17), s * (R - 17), rz), 9, 'tint')
            for d in (-6.5, 6.5): _beam(q, (c * 44, s * 44, rz + d), (c * (R - 17), s * (R - 17), rz + d), 1.4, 'metal')
            for t in range(1, 9):
                u = 44 + (R - 61) * t / 9; add_cyl(q, 0, 0, 0, 0, 0, 'metal') if False else _beam(q, (c * u - s * 5.2, s * u + c * 5.2, rz), (c * u + s * 5.2, s * u - c * 5.2, rz), 1.0, 'metal')
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
    """A parked craft on a deck, in small but whole: a fuselage, swept wings folded in a little, a tail, a canopy, wheels. It gives everything its scale."""
    _sloft(p, [(z - 8 * s, y + 2.2 * s, 0.5 * s, x, 0.6 * s, 2.2), (z - 3 * s, y + 2.3 * s, 1.15 * s, x, 1.3 * s, 2.3), (z + 3 * s, y + 2.35 * s, 1.2 * s, x, 1.25 * s, 2.3), (z + 7 * s, y + 2.1 * s, 0.6 * s, x, 0.65 * s, 2.1), (z + 10 * s, y + 1.9 * s, 0.05, x, 0.06, 2)], 'tint', 20, per=4)
    _sloft(p, [(z + 2 * s, y + 3.15 * s, 0.05, x, 0.3 * s, 2), (z + 3.6 * s, y + 3.3 * s, 0.42 * s, x, 0.62 * s, 2.2), (z + 6 * s, y + 2.75 * s, 0.05, x, 0.2 * s, 2)], 'visor', 14, per=3)
    for q in (-1, 1):
        _aero(p, _span(x + q * 1.0 * s, y + 2.1 * s, z + 3 * s, z - 3.5 * s, x + q * 7 * s, y + 2.2 * s, z - 5 * s, z - 7 * s, 0.5 * s, 3, 1, 0.3), 0, 1, 'tint', 6)
        _aero(p, _span(x + q * 0.4 * s, y + 2.6 * s, z - 5 * s, z - 8 * s, x + q * 2.6 * s, y + 3.6 * s, z - 8 * s, z - 9.4 * s, 0.2 * s, 2, 1, 0.4), 0, 1, 'tint', 5)
        add_cyl(p, x + q * 1.7 * s, z - 2 * s, y, y + 1.3 * s, 0.12 * s, 'metal', 8); add_cyl(p, x + q * 1.7 * s, z - 2 * s, y, y + 0.45 * s, 0.34 * s, 'rubber', 10)
    add_cyl(p, x, z + 5 * s, y, y + 1.3 * s, 0.1 * s, 'metal', 8); add_cyl(p, x, z + 5 * s, y, y + 0.34 * s, 0.26 * s, 'rubber', 10)
    add_cyl(p, x, z - 8.1 * s, y + 2.2 * s, y + 2.2 * s + 0.01, 0.01, 'metal', 4)

def dress_bastion(p, r):
    # the deck: catapults, elevators, parked craft, missile batteries down both edges
    for x in (-34, -10, 14):
        add_box(p, x - 1.3, 58, -100, x + 1.3, 58.45, 212, 'metal', 0); add_box(p, x - 0.4, 58.45, -100, x + 0.4, 58.6, 212, 'rubber', 0)
    for (x0, z0, x1, z1) in ((-58, -300, -28, -262), (-58, -180, -28, -142), (-20, -300, 14, -262)):
        for (a, b, c, d) in ((x0, z0, x1, z0 + 1), (x0, z1 - 1, x1, z1), (x0, z0, x0 + 1, z1), (x1 - 1, z0, x1, z1)): add_box(p, a, 58, b, c, 58.3, d, 'hazard', 0)
    # parked in ranks along the marked ranks, wing to wing, each on its painted spot
    for k in range(16):
        xk = -50 + (k % 5) * 18; zk = -260 + (k // 5) * 44
        _lighter(p, xk, 58.1, zk, 1.25)
        add_box(p, xk - 8, 58, zk - 13, xk + 8, 58.04, zk - 12.6, 'paint', 0); add_box(p, xk - 0.15, 58, zk - 13, xk + 0.15, 58.05, zk + 14, 'hazard', 0)
    # a flight deck is one surface, painted: long runway edges and aiming marks, tram-lines, not plates
    for x in (-40, 22):
        for k in range(30): z = -330 + k * 18; add_box(p, x - 0.5, 58, z, x + 0.5, 58.05, z + 10, 'lampwarm' if k % 5 == 0 else 'paint', 0)
    for zz in (-90, 120):
        for q in range(9): add_box(p, -54 + q * 12, 58, zz, -48 + q * 12, 58.05, zz + 3, 'hazard', 0)
    _cells(p, -60.5, 58, -60, 3, 26, 2.3, 0.5, r); _cells(p, 50.5, 58, -30, 2, 30, 2.3, 0.5, r)
    # the hull forward of the deck: a raised spine with secondary guns, sensors at the prow
    add_box(p, -9, 28, 215, 9, 36, 352, 'paint', 0); add_box(p, -5, 36, 225, 5, 39, 340, 'tint', 0)
    for z in (235, 360): _mast(p, 0, 36, z, 20)
    for k in range(5): _turret(p, -18 if k % 2 else 18, 30 - k * 2, 232 + k * 26, 6, 1, 2)
    add_cyl(p, 0, 408, 2, 11, 4.5, 'paint', 12)
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
    # under the atrium's glass: a real garden. Lawn on a deck that fits the dome, paths, a pond, terraces at the sides, trees standing on it, lamps along the walks.
    fy = -22; half = lambda z: math.sqrt(max(4.0, _pchip([575, 610, 640, 651], [62, 56, 36, 8], z) ** 2 - fy * fy)) * 0.985
    zs_ = [576 + k * 2.5 for k in range(26)]; bm = bmesh.new(); L_ = [bm.verts.new(P(-half(z), fy, z)) for z in zs_]; R_ = [bm.verts.new(P(half(z), fy, z)) for z in zs_]
    for i in range(len(zs_) - 1): bm.faces.new([L_[i], L_[i + 1], R_[i + 1], R_[i]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0: f.normal_flip()
    merge(p, bm, 'leaf')
    add_box(p, -2.5, fy, 576, 2.5, fy + 0.06, 636, 'stone', 0); add_box(p, -36, fy, 598, 36, fy + 0.06, 602, 'stone', 0)
    add_cyl(p, 18, 615, fy, fy + 0.08, 7, 'visor', 32); add_cyl(p, 18, 615, fy, fy + 0.3, 7.5, 'stone', 32, r2=7.1)
    for s in (-1, 1):
        for (off, h_, z0_, z1_) in ((40, 2.4, 580, 612), (46, 5, 578, 606)):
            add_box(p, s * off - 3, fy, z0_, s * off + 3, fy + h_, z1_, 'stone', 0); add_box(p, s * off - 2.8, fy + h_, z0_ + 0.2, s * off + 2.8, fy + h_ + 0.25, z1_ - 0.2, 'leaf', 0)
    for k in range(46):
        a = r.uniform(0, 6.28); z = r.uniform(580, 632); hw_ = half(z) * 0.9; x = r.uniform(-hw_, hw_)
        if abs(x) < 4.5 or abs(z - 600) < 3.5 or math.hypot(x - 18, z - 615) < 9: continue
        H_ = r.uniform(5, 13); R_t = H_ * r.uniform(0.3, 0.42)
        add_cyl(p, x, z, fy, fy + H_ * 0.62, 0.22 + H_ * 0.018, 'bark', 8, r2=0.12)
        for q in range(3):
            ox, oy, oz = r.uniform(-1, 1) * R_t * 0.4, r.uniform(-0.2, 0.3) * R_t, r.uniform(-1, 1) * R_t * 0.4; cy_ = fy + H_ * 0.72 + oy; rr_ = R_t * r.uniform(0.6, 0.95)
            _sloft(p, [(z + oz - rr_, cy_, 0.05, x + ox, 0.05, 2), (z + oz - rr_ * 0.5, cy_, rr_ * 0.8, x + ox, rr_ * 0.84, 2), (z + oz + rr_ * 0.5, cy_, rr_ * 0.8, x + ox, rr_ * 0.84, 2), (z + oz + rr_, cy_, 0.05, x + ox, 0.05, 2)], 'leaf', 10, per=2)
    for z in range(580, 636, 10):
        for s in (-1, 1): add_cyl(p, s * 3.4, z, fy, fy + 3.2, 0.06, 'metal', 6); add_cyl(p, s * 3.4, z, fy + 3.2, fy + 3.5, 0.2, 'lampwarm', 8)
    # the spine: pipe runs and modules between the rings; tenders moored along it
    for a in range(6):
        c, s_ = math.cos(a * 1.047 + 0.5), math.sin(a * 1.047 + 0.5)
        for z0 in range(-400, 330, 34):
            if r.random() < 0.6: add_box(p, c * 38 - 4, s_ * 38 - 4, z0, c * 38 + 4, s_ * 38 + 4, z0 + r.uniform(8, 28), r.choice(('paint', 'heatshield', 'tint', 'metal')), 0)
    _pipes(p, r, 41, -14, -420, 340, 4, 8, 0.9); _pipes(p, r, -41, -14, -420, 340, 4, 8, 0.9)
    for (x, z) in ((-44, -100), (-44, 150), (44, 150), (0, 300)):
        _lighter(p, x, 34, z, 2.2)
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
        if abs(z - 650) < 70: z += 100 if z < 650 else -100      # (not through the hangar)
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


def _sphere(p, x, y, z, R, mat='tint', n=32, rows=14):
    """A ball, as a loft along z: tanks and domes."""
    st = [(z - R + 2 * R * k / rows, y, max(0.05, R * math.sin(math.pi * k / rows)), x, max(0.05, R * math.sin(math.pi * k / rows)), 2) for k in range(rows + 1)]
    add_loft(p, st, mat, n, axis='z')

def _lit_bands(p, x, y0, y1, z0, z1, rows, sx, seg=6, r=None):
    """Decks of windows at this scale: long lit bands, broken where a compartment is dark, a sill under each."""
    for j in range(rows):
        y = y0 + (y1 - y0) * (j + 0.5) / rows; z = z0
        while z < z1:
            ln = (z1 - z0) / seg * (r.uniform(0.5, 1.2) if r else 1); e_ = min(z1, z + ln)
            if not r or r.random() < 0.8: add_box(p, min(x, x + sx * 0.6), y, z, max(x, x + sx * 0.6), y + (y1 - y0) / rows * 0.34, e_, 'lampwarm', 0)
            add_box(p, min(x, x + sx * 1.1), y - 0.7, z, max(x, x + sx * 1.1), y - 0.2, e_, 'metal', 0)
            z = e_ + (z1 - z0) / seg * 0.06

def _tower(p, x, z, y0, h, w, d, r, lit=True):
    """A block of the ship's city: raked walls, setbacks, a crown of plant and aerials, floors of light."""
    steps = r.randint(2, 3); y = y0; ww, dd = w, d
    for k in range(steps):
        hh = h / steps; _taper(p, x - ww / 2, x + ww / 2, z - dd / 2, z + dd / 2, y, y + hh, ww * 0.05, dd * 0.05, r.choice(('tint', 'tint', 'paint')))
        if lit:
            for sx, xx in ((-1, x - ww / 2 * 0.95), (1, x + ww / 2 * 0.95)): _lit_bands(p, xx, y + 4, y + hh - 4, z - dd * 0.42, z + dd * 0.42, max(2, int(hh / 16)), sx, 3, r)
        add_box(p, x - ww / 2 * 1.02, y + hh, z - dd / 2 * 1.02, x + ww / 2 * 1.02, y + hh + 2.4, z + dd / 2 * 1.02, 'metal', 0)
        y += hh + 2.4; ww *= 0.7; dd *= 0.7
    if r.random() < 0.6: _mast(p, x, y, z, h * 0.3)

def anvil(p, lay, r):
    """A dreadnought, 3.4 km: a wedge of armour rising in terraces to a double citadel, main batteries down the spine, broadsides along both shoulders, nine engines."""
    secs = [(-1700, 0, 120, 0, 300, 3.4), (-1500, 0, 180, 0, 420, 3.4), (0, 0, 210, 0, 440, 3.2), (900, -12, 170, 0, 300, 2.8), (1450, -24, 90, 0, 120, 2.2), (1700, -30, 6, 0, 8, 2)]
    add_loft(p, smooth_secs(secs, 6), 'tint', 120, axis='z')
    # terraces of armour up the back
    for (x, z0, z1, y0, y1, ix) in ((340, -1450, 860, 150, 225, 40), (250, -1400, 640, 225, 290, 30), (160, -1300, 300, 290, 350, 24)):
        _taper(p, -x, x, z0, z1, y0, y1, ix, 60, 'tint')
        for sx in (-1, 1): _lit_bands(p, sx * (x - ix * 0.5), y0 + 8, y1 - 6, z0 + 80, z1 - 80, 3, sx, 9, r); _pipes(p, r, sx * (x - ix * 0.2), y0 + 2, z0 + 40, z1 - 40, 3, 5, 1.6)
    # the double citadel and its bridges
    for zc in (-900, -220):
        _taper(p, -80, 80, zc - 180, zc + 180, 350, 470, 12, 24, 'tint'); _taper(p, -46, 46, zc - 100, zc + 100, 470, 540, 8, 14, 'paint'); _bridgeglass(p, -40, 40, zc - 70, zc + 70, 540, 553, 3, 8)
        add_box(p, -130, 508, zc - 18, 130, 514, zc + 18, 'paint', 0)
        for sx in (-1, 1): _lit_bands(p, sx * 76, 360, 464, zc - 170, zc + 170, 6, sx, 6, r); _phased(p, sx * 44, 480, 530, zc - 40, zc + 40, sx)
        _mast(p, 0, 553, zc, 110, 5)
    # main batteries on the spine, broadsides on the shoulders
    for z in (480, 700, 920, 1100): _turret(p, 0, 170 if z < 860 else 150, z, 46, 1, 3)
    for sx in (-1, 1):
        for k in range(14): _turret(p, sx * (360 - k * 2), 188, -1360 + k * 170, 18, 1, 2)
        for k in range(9): _turret(p, sx * 300, -150, -1200 + k * 260, 20, -1, 2)
        _lit_bands(p, sx * 436, -60, 60, -1300, 300, 6, sx, 14, r); _vents(p, sx * 434, -110, -1300, 400, 80, 26, sx)
        _pods(p, sx * 432, 70, -1400, 500, 70, 6, sx)
    # engines
    for (x, y, R) in ((-260, 60, 74), (0, 60, 90), (260, 60, 74), (-300, -60, 60), (-100, -70, 66), (100, -70, 66), (300, -60, 60), (-170, 130, 40), (170, 130, 40)): _engine(p, x, y, -1800, -1690, R)
    add_box(p, -24, -220, -1500, 24, -196, 1100, 'heatshield', 0)
    return (441, -6, -330, 1)

def _se(a, e):
    """A point on the unit superellipse of exponent e at angle a: the shape of everything rounded-square in the fleet."""
    u, v = math.cos(a), math.sin(a); return math.copysign(abs(u) ** (2 / e), u), math.copysign(abs(v) ** (2 / e), v)

def _yloft(p, secs, mat, n=24, top=True, bottom=False):
    """A tower's body: rounded sections (y, cx, rx, cz, rz, e) stacked up the y axis."""
    bm = bmesh.new(); rings = []
    for (y, cx, rx, cz, rz, e) in secs:
        rings.append([bm.verts.new(P(cx + rx * q[0], y, cz + rz * q[1])) for q in (_se(2 * math.pi * k / n, e) for k in range(n))])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(n): bm.faces.new([r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]])
    if top: bm.faces.new(rings[-1])
    if bottom: bm.faces.new(rings[0][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def _band(p, cx, cz, y0, y1, rx, rz, e, t, mat, n=24):
    """A floor slab's edge standing proud of the glass: an outer face and its top and underside back to the wall."""
    bm = bmesh.new(); Q = [_se(2 * math.pi * k / n, e) for k in range(n)]
    ring = lambda y, d: [bm.verts.new(P(cx + (rx + d) * q[0], y, cz + (rz + d) * q[1])) for q in Q]
    a0, a1, b0, b1 = ring(y0, 0), ring(y0, t), ring(y1, t), ring(y1, 0)
    for k in range(n):
        j = (k + 1) % n
        for (A, B) in ((a0, a1), (a1, b0), (b0, b1)): bm.faces.new([A[k], A[j], B[j], B[k]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def _hring(p, x, y, z, R, r_, mat, n=64, m=8):
    """A ring lying flat: a halo round a spire, a rim round a dome."""
    bm = bmesh.new(); rings = []
    for i in range(n):
        a = 2 * math.pi * i / n; c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new(P(x + (R + r_ * math.cos(2 * math.pi * j / m)) * c, y + r_ * math.sin(2 * math.pi * j / m), z + (R + r_ * math.cos(2 * math.pi * j / m)) * s)) for j in range(m)])
    for i in range(n):
        for j in range(m): bm.faces.new([rings[i][j], rings[(i + 1) % n][j], rings[(i + 1) % n][(j + 1) % m], rings[i][(j + 1) % m]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def _arc(p, pts, w0, w1, mat, n=14):
    """A curved member through three points (a quadratic curve), tapering from w0 to w1: a buttress, a rib."""
    A, B, C = [mathutils.Vector(q) for q in pts]; prev = None
    for k in range(n + 1):
        t = k / n; q = A * (1 - t) ** 2 + B * 2 * t * (1 - t) + C * t * t
        if prev is not None: _beam(p, tuple(prev), tuple(q), w0 + (w1 - w0) * (k - 0.5) / n, mat)
        prev = q

def _city_tower(p, x, z, y0, h, w, d, r, kind, crown=None):
    """One building of the ark's city, as a building is made: a glass body, its floor slabs standing out of the glass, lit floors where people are awake, fins down the corners, and a crown of its own."""
    e = {'slab': 5.0, 'round': 2.0, 'stepped': 4.0, 'needle': 2.6}[kind]; n = 16 if h < 120 else 24
    tp = {'slab': 0.9, 'round': 0.82, 'stepped': 1.0, 'needle': 0.42}[kind]
    if kind == 'stepped':
        tiers = [(0.0, 0.5, 1.0), (0.5, 0.8, 0.74), (0.8, 1.0, 0.5)]
    else:
        tiers = [(0.0, 1.0, 1.0)]
    for (f0, f1, k) in tiers:
        ya, yb = y0 + h * f0, y0 + h * f1; wa, da = w / 2 * k, d / 2 * k; wb, db = (wa * (1 - (1 - tp) * (f1 - f0)), da * (1 - (1 - tp) * (f1 - f0))) if kind != 'stepped' else (wa, da)
        _yloft(p, [(ya, x, wa, z, da, e), (yb, x, wb, z, db, e)], 'visor', n)
        fl = 14.0 if h > 140 else 11.0; m = max(1, int((yb - ya) / fl))
        for j in range(1, m + 1):
            yy = ya + (yb - ya) * j / m; t = (yy - ya) / max(1, yb - ya); rx, rz = wa + (wb - wa) * t, da + (db - da) * t
            _band(p, x, z, yy - 1.6, yy, rx, rz, e, 0.9, 'tint', n)
            if j < m and r.random() < 0.38: _band(p, x, z, yy - fl * 0.62, yy - fl * 0.32, rx, rz, e, 0.4, 'lampwarm', n)
        if kind in ('slab', 'stepped') and h > 90:
            for (sx, sz) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                c = 0.72 ** (1 / e) ; _beam(p, (x + sx * wa * c, ya, z + sz * da * c), (x + sx * wb * c, yb, z + sz * db * c), 2.2, 'tint')
    # the crown
    yt = y0 + h; rx, rz = (w / 2 * tiers[-1][2] * (tp if kind != 'stepped' else 1), d / 2 * tiers[-1][2] * (tp if kind != 'stepped' else 1))
    q = r.random()
    if crown: q = {'cone': 0.0, 'pad': 0.3, 'cap': 0.9}[crown]
    if kind == 'needle' or q < 0.1:
        _yloft(p, [(yt, x, rx, z, rz, e), (yt + h * 0.12, x, rx * 0.35, z, rz * 0.35, e), (yt + h * 0.2, x, 0.6, z, 0.6, 2)], 'tint', n)
        add_cyl(p, x, z, yt + h * 0.2, yt + h * 0.32, 0.6, 'metal', 6, r2=0.1); add_cyl(p, x, z, yt + h * 0.32, yt + h * 0.32 + 1.2, 0.5, 'navred', 6)
    elif q < 0.6:
        # a pad you can land on and walk out over (js/gen/vesper.js): its deck, the circle painted on it, a glass rail round the edge, the lift's housing
        _yloft(p, [(yt, x, rx * 1.03, z, rz * 1.03, e), (yt + 6, x, rx * 1.03, z, rz * 1.03, e)], 'tint', n)
        add_cyl(p, x, z, yt + 6, yt + 6.03, min(rx, rz) * 0.62, 'paint', 32); _hring(p, x, yt + 6.05, z, min(rx, rz) * 0.55, 0.35, 'hazard', 32, 4)
        _band(p, x, z, yt + 6, yt + 7.1, rx * 0.97, rz * 0.97, e, 0.06, 'glass', n); _band(p, x, z, yt + 7.1, yt + 7.2, rx * 0.97, rz * 0.97, e, 0.12, 'metal', n)
        lz = z - rz * 0.45; add_box(p, x - 1.6, yt + 6, lz - 3.2, x + 1.6, yt + 9.2, lz - 0.4, 'tint', 0); add_box(p, x - 1.1, yt + 6, lz - 0.42, x + 1.1, yt + 8.6, lz - 0.36, 'metal', 0); add_box(p, x - 0.05, yt + 6.2, lz - 0.36, x + 0.05, yt + 8.4, lz - 0.34, 'glow', 0)
    else:
        _yloft(p, [(yt, x, rx, z, rz, e), (yt + 3, x, rx * 1.06, z, rz * 1.06, e), (yt + 4, x, rx * 0.9, z, rz * 0.9, e)], 'tint', n)
        _yloft(p, [(yt + 4, x, rx * 0.9, z, rz * 0.9, e), (yt + 4 + h * 0.06, x, rx * 0.5, z, rz * 0.5, e)], 'visor', n)
        _mast(p, x, yt + 4 + h * 0.06, z, h * 0.12)

def vesper(p, lay, r):
    """An ark, 5.2 km: a whole city carried inside a hull. The city stands on a deck sunk within the bulwarks, laid out as cities are: a green boulevard
    down the middle, avenues, blocks of glass towers rising towards a great spire, parks under domes. Down the flanks, decks of lit promenades; astern, seven drives."""
    DY, EQ, RIM = 120.0, -10.0, 18.0
    S = [(-2600, 520, 200), (-2400, 690, 280), (-1800, 760, 310), (-280, 772, 320), (900, 750, 305), (1700, 610, 260), (2250, 360, 190), (2520, 120, 110), (2640, 6, 50)]
    zs_, hws, dps = [q[0] for q in S], [q[1] for q in S], [q[2] for q in S]
    hw = lambda z: _pchip(zs_, hws, z); dp = lambda z: _pchip(zs_, dps, z)
    rim_x = lambda z: hw(z) * 0.93; deck_x = lambda z: max(0.4, hw(z) * 0.93 - 12)
    side_x = lambda z, y: hw(z) + (rim_x(z) - hw(z)) * ((y - EQ) / (DY + RIM - EQ)) ** 1.6      # the topsides fall in as they rise
    def prof(z):
        h, d = hw(z), dp(z); pts = [(-deck_x(z), DY), (-deck_x(z), DY + RIM), (-rim_x(z), DY + RIM)]
        for k in range(1, 6): y = DY + RIM - (DY + RIM - EQ) * k / 6; pts.append((-side_x(z, y), y))
        for k in range(25):
            a = math.pi + math.pi * k / 24; q = _se(a, 2.6); pts.append((h * q[0], EQ + d * q[1]))
        for k in range(5, 0, -1): y = DY + RIM - (DY + RIM - EQ) * k / 6; pts.append((side_x(z, y), y))
        pts += [(rim_x(z), DY + RIM), (deck_x(z), DY + RIM), (deck_x(z), DY)]
        return pts
    stations = [-2600 + 5240 * (k / 150) ** 1.0 for k in range(151)]
    bm = bmesh.new(); rings = [[bm.verts.new(P(x, y, z)) for (x, y) in prof(z)] for z in stations]
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(len(r0) - 1): bm.faces.new([r0[k], r0[k + 1], r1[k + 1], r1[k]])
    bm.faces.new(rings[0]); bm.faces.new(rings[-1][::-1]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, 'tint')
    # the city's ground, inside the bulwarks
    bm = bmesh.new(); G = [[bm.verts.new(P(-deck_x(z) + 2 * deck_x(z) * j / 8, DY, z)) for j in range(9)] for z in stations]
    for r0, r1 in zip(G, G[1:]):
        for j in range(8): bm.faces.new([r0[j], r0[j + 1], r1[j + 1], r1[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, 'concrete')
    # the bulwark's cap and the lit promenades down each flank, each deck its own ledge
    def ribbon(fx, y0, y1, z0, z1, mat, out=0.6, seg=60, gaps=0):
        zz = [z0 + (z1 - z0) * k / seg for k in range(seg + 1)]
        for k in range(seg):
            if gaps and k % gaps == gaps - 1: continue
            bm = bmesh.new(); V = [bm.verts.new(P(sx * (fx(z, y) + out), y, z)) for (z, y, sx) in ((zz[k], y0, SX), (zz[k + 1], y0, SX), (zz[k + 1], y1, SX), (zz[k], y1, SX))]
            bm.faces.new(V); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.4); merge(p, bm, mat)
    for SX in (-1, 1):
        for (y0, ln) in ((-2, 2150), (26, 2250), (54, 2300), (82, 2250), (106, 2150)):
            ribbon(side_x, y0, y0 + 5, -ln + 50, ln * 0.55 if y0 < 40 else ln * 0.6, 'lampwarm', 2.0, 90, 9)
            ribbon(lambda z, y: side_x(z, y) + 2.4, y0 - 1.6, y0 - 0.4, -ln + 30, ln * 0.55 + 20 if y0 < 40 else ln * 0.6 + 20, 'paint', 0.4, 90)
        _pods(p, SX * (side_x(-200, 0) + 6), -40, -1900, 1000, 70, 7, SX)
        ribbon(side_x, 36, 112, -2150, 1350, 'visor', 1.2, 120)                 # a glass gallery the length of the city: the ark's own promenade
        for z in range(-2100, 1400, 110):                                            # the frames that carry it
            pts = [(SX * (side_x(z, y) + 2.6), y, z) for y in [EQ + (DY + RIM - EQ) * j / 10 for j in range(11)]]
            for q0, q1 in zip(pts, pts[1:]): _beam(p, q0, q1, 4.0, 'tint')
    for z0_, z1_ in ((-2560, 2600),):
        pass
    bm = bmesh.new(); cap = [[bm.verts.new(P(sx * x_, DY + RIM + 1.6, z)) for (sx, x_) in ((-1, rim_x(z) + 1), (-1, deck_x(z) - 1), (1, deck_x(z) - 1), (1, rim_x(z) + 1))] for z in stations]
    for r0, r1 in zip(cap, cap[1:]):
        for (i, j) in ((0, 1), (2, 3)): bm.faces.new([r0[i], r0[j], r1[j], r1[i]])
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=1.6); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, 'paint')
    # the boulevard: two carriageways either side of a green median with its trees, a canal down the middle of it
    ZB0, ZB1 = -2250, 2050
    add_box(p, -56, DY, ZB0, 56, DY + 0.03, ZB1, 'rubber', 0); add_box(p, -22, DY, ZB0, 22, DY + 0.2, ZB1, 'leaf', 0); add_box(p, -6, DY + 0.18, ZB0 + 20, 6, DY + 0.22, ZB1 - 20, 'mirror', 0)
    for x in (-56, -22, 22, 56): add_box(p, x - 0.3, DY, ZB0, x + 0.3, DY + 0.15, ZB1, 'stone', 0)
    for z in range(ZB0 + 20, ZB1, 30):
        if abs(z + 200) < 400: continue
        for sx in (-1, 1): add_cyl(p, sx * 14, z, DY + 0.19, DY + 0.24, 1.4, 'soil', 20)      # (a tree pit: the planet's own tree stands in it — js/main.js)
    # the spire, on a round plaza: one smooth body, its floors standing out of it, light running up its seams, six flying buttresses, a halo near the top
    SZ = -200.0
    add_cyl(p, 0, SZ, DY, DY + 0.1, 380, 'stone', 72); _hring(p, 0, DY + 0.1, SZ, 330, 0.6, 'glass', 72, 6)
    prof_ = [(DY, 230), (DY + 120, 205), (DY + 300, 160), (DY + 520, 112), (DY + 720, 74), (DY + 880, 44), (DY + 980, 22), (DY + 1050, 6)]
    secs = [(y, 0, rad, SZ, rad, 2.3) for (y, rad) in (tuple(q) for q in smooth_secs(prof_, 6))]
    _yloft(p, secs, 'visor', 48)
    rad_at = lambda y: _pchip([q[0] for q in prof_], [q[1] for q in prof_], y)
    y = DY + 24
    while y < DY + 960:
        R_ = rad_at(y); _band(p, 0, SZ, y - 2.4, y, R_, R_, 2.3, 1.6, 'tint', 48)
        if r.random() < 0.5: _band(p, 0, SZ, y - 13, y - 7, R_, R_, 2.3, 0.2, 'lampwarm', 48)
        y += 24 if y < DY + 600 else 30
    for k in range(6):
        a = k * math.pi / 3 + 0.26; c, s = math.cos(a), math.sin(a)
        pts = [(c * rad_at(y) * 0.98, y, SZ + s * rad_at(y) * 0.98) for y in [DY + 20 + 900 * j / 30 for j in range(31)]]
        for q0, q1 in zip(pts, pts[1:]): _beam(p, q0, q1, 3.2, 'tint')
        _arc(p, [(c * 360, DY, SZ + s * 360), (c * 330, DY + 260, SZ + s * 330), (c * rad_at(DY + 420) * 0.98, DY + 420, SZ + s * rad_at(DY + 420) * 0.98)], 34, 14, 'tint', 18)
        _arc(p, [(c * 352, DY + 2, SZ + s * 352), (c * 322, DY + 260, SZ + s * 322), (c * rad_at(DY + 420) * 0.9, DY + 412, SZ + s * rad_at(DY + 420) * 0.9)], 6, 3, 'lampwarm', 18)
    _hring(p, 0, DY + 900, SZ, 120, 4, 'tint', 72, 8); _hring(p, 0, DY + 900, SZ, 120, 1.2, 'glow', 72, 6)
    for k in range(6): a = k * math.pi / 3; _beam(p, (math.cos(a) * rad_at(DY + 890), DY + 890, SZ + math.sin(a) * rad_at(DY + 890)), (math.cos(a) * 118, DY + 900, SZ + math.sin(a) * 118), 3, 'tint')
    add_cyl(p, 0, SZ, DY + 1050, DY + 1240, 3.4, 'metal', 12, r2=0.4); add_cyl(p, 0, SZ, DY + 1240, DY + 1243, 1.4, 'navred', 8)
    # the city: blocks between avenues and cross streets, each built up with a podium and its towers, tallest round the spire. Laid out by
    # js/gen/vesper.js (assets/ships/vesper.json) so the streets, roofs and lifts here are the ones the game walks
    V = json.load(open(os.path.join(ROOT, 'assets', 'ships', 'vesper.json'))); PARKS = [tuple(q) for q in V['parks']]
    for P_ in V['podiums']:
        xm, zm, hx, hz, cx_, cz_ = P_['xm'], P_['zm'], P_['hx'], P_['hz'], P_['cx'], P_['cz']
        # the block's core, carrying its towers; the street buildings round it are the game's own real buildings (js/render/vesperreal.js)
        _yloft(p, [(DY, xm, cx_, zm, cz_, 7), (DY + 14, xm, cx_, zm, cz_, 7)], 'tint', 28)
        _band(p, xm, zm, DY + 7, DY + 11, cx_ - 0.5, cz_ - 0.5, 7, 0.3, 'lampwarm' if P_['lit'] else 'visor', 28)
        _yloft(p, [(DY + 14, xm, hx, zm, hz, 7), (DY + 14.4, xm, hx, zm, hz, 7)], 'paint', 28) if False else None
        _band(p, xm, zm, DY, DY + 0.14, hx + 0.2, hz + 0.2, 7, 4.0, 'stone', 28)          # the kerbed pavement round the block
    for T in V['towers']:
        _city_tower(p, T['x'], T['z'], T['y0'], T['h'], T['w'], T['d'], random.Random(T['seed']), T['kind'], T['crown'])
    for i, (x, z) in enumerate(V['lamps']):
        add_cyl(p, x, z, DY, DY + 0.4, 0.2, 'paint', 8); add_cyl(p, x, z, DY + 0.4, DY + 4.8, 0.08, 'paint', 6, r2=0.06); add_box(p, x - 0.5, DY + 4.75, z - 0.12, x + 0.5, DY + 4.9, z + 0.12, 'paint', 0); add_box(p, x - 0.45, DY + 4.6, z - 0.1, x + 0.45, DY + 4.75, z + 0.1, 'lampwarm', 0)
        if i % 2 == 0: add_box(p, x - 1.0, DY, z + 1.0, x + 1.0, DY + 0.45, z + 1.5, 'wood', 0)
    for B in V['bridges']:
        add_box(p, B['x'] - 6, B['y'], B['z0'], B['x'] + 6, B['y'] + 8, B['z1'], 'tint', 0); add_box(p, B['x'] - 6.3, B['y'] + 2.5, B['z0'], B['x'] + 6.3, B['y'] + 5.5, B['z1'], 'lampwarm', 0)
    for Lf in V['lifts']:
        # the lift's door at the foot of the block, on the street: a frame, two leaves, the light that says it's there
        x, _, z = Lf['street']; z += 1.7
        add_box(p, x - 2.0, DY, z - 0.4, x + 2.0, DY + 3.6, z, 'metal', 0); add_box(p, x - 1.4, DY, z - 0.46, x - 0.03, DY + 3.0, z - 0.4, 'paint', 0); add_box(p, x + 0.03, DY, z - 0.46, x + 1.4, DY + 3.0, z - 0.4, 'paint', 0)
        add_box(p, x - 1.4, DY + 3.15, z - 0.48, x + 1.4, DY + 3.45, z - 0.4, 'glow', 0)
    px_, pz_ = V['plaza']                                         # the plaza's lift, down to the docks
    for (a_, b_) in ((-1.6, -1.6), (1.6, -1.6), (1.6, 1.6), (-1.6, 1.6)): add_box(p, px_ + a_ - 0.12, DY, pz_ + b_ - 0.12, px_ + a_ + 0.12, DY + 4.2, pz_ + b_ + 0.12, 'metal', 0)
    add_box(p, px_ - 1.8, DY + 4.2, pz_ - 1.8, px_ + 1.8, DY + 4.6, pz_ + 1.8, 'tint', 0); add_box(p, px_ - 1.5, DY + 0.2, pz_ - 1.5, px_ + 1.5, DY + 4.2, pz_ + 1.5, 'glass', 0); add_box(p, px_ - 1.7, DY + 4.3, pz_ - 1.85, px_ + 1.7, DY + 4.5, pz_ - 1.8, 'glow', 0)
    # parks under glass domes: lawns, trees, a lake, the dome's ribs meeting at a crown ring
    for (x, z, R) in PARKS:
        add_cyl(p, x, z, DY, DY + 1.5, R, 'leaf', 96); add_cyl(p, x + R * 0.3, z - R * 0.2, DY + 1.5, DY + 1.56, R * 0.28, 'mirror', 64); add_cyl(p, x + R * 0.3, z - R * 0.2, DY + 1.45, DY + 1.62, R * 0.3, 'stone', 64, r2=R * 0.285)
        # (its trees are the planet's own, put in by the game: js/gen/vesper.js parkTrees)
        st = [(DY + R * 0.7 * math.sin(math.pi / 2 * k / 12), x, max(0.5, R * math.cos(math.pi / 2 * k / 12)), z, max(0.5, R * math.cos(math.pi / 2 * k / 12)), 2) for k in range(13)]
        _yloft(p, st, 'glass', 64, top=False)
        _hring(p, x, DY + 1, z, R, 2.4, 'tint', 72, 6); _hring(p, x, DY + R * 0.7 - 1, z, R * 0.12, 1.6, 'tint', 24, 6)
        for k in range(16):
            a = k * math.pi / 8; pts = [(x + math.cos(a) * R * math.cos(math.pi / 2 * j / 10), DY + R * 0.7 * math.sin(math.pi / 2 * j / 10), z + math.sin(a) * R * math.cos(math.pi / 2 * j / 10)) for j in range(10)]
            for q0, q1 in zip(pts, pts[1:]): _beam(p, q0, q1, 1.4, 'tint')
    # the bow: the deck ends in a terrace over the prow, a beacon at the tip
    add_cyl(p, 0, 2600, 40, 70, 3, 'metal', 12); add_cyl(p, 0, 2600, 70, 74, 2.2, 'navwhite', 12)
    # under the hull: a keel, its bays lit, and the drives astern on their thrust frame
    add_box(p, -36, EQ - dp(0) - 14, -2300, 36, EQ - dp(0) + 30, 1700, 'heatshield', 0)
    for z in range(-2200, 1600, 160): add_box(p, -37, EQ - dp(0) - 6, z, 37, EQ - dp(0) - 2, z + 70, 'lampwarm', 0)
    for (x, y, R) in ((0, -40, 112), (-240, -30, 98), (240, -30, 98), (-430, -10, 72), (430, -10, 72), (-140, -150, 58), (140, -150, 58)): _engine(p, x, y, -2740, -2600, R)
    for k in range(9): a = k * math.pi / 8; _beam(p, (math.cos(a) * 480, -40 + math.sin(a) * 120, -2602), (math.cos(a) * 200, -40 + math.sin(a) * 60, -2602), 10, 'metal')
    mx = round(side_x(-280, 0) - 1.0)
    return (mx, -4, -280, 1)

def tiller(p, lay, r):
    """A refinery, 4.2 km: a long open truss carrying ball tanks and cracking towers, flare stacks burning, ore arms folded along it, a blocky cab at the bow where people live, six engines."""
    for (x, y) in ((-130, 130), (130, 130), (-130, -130), (130, -130)): _beam(p, (x, y, -1900), (x, y, 1500), 16, 'heatshield')
    for k in range(40):
        z = -1900 + k * 85
        for (a, b) in (((-130, 130), (130, 130)), ((130, 130), (130, -130)), ((130, -130), (-130, -130)), ((-130, -130), (-130, 130))):
            _beam(p, (a[0], a[1], z), (b[0], b[1], z), 7, 'metal'); _beam(p, (a[0], a[1], z), (b[0], b[1], z + 85), 3.6, 'metal')
    # the core tube
    _sloft(p, [(-1880, 0, 46, 0, 46, 2), (1500, 0, 46, 0, 46, 2)], 'paint', 24, per=1)
    # ball tanks in ranks
    for k in range(9):
        z = -1650 + k * 340
        for sx in (-1, 1):
            R = r.uniform(120, 165); x = sx * (R + 138); _sphere(p, x, 0, z, R, 'tint', 40, 16)
            for dz in (-0.0,): add_cyl(p, x, z - 2, -R * 1.02 * 0 , 0.1, 1, 'metal', 4)
            _shell(p, x, 0, [(z - 3, R * 1.0), (z - 3, R * 1.02), (z + 3, R * 1.02), (z + 3, R * 1.0)], 'metal', n=48)
            _beam(p, (sx * 130, 0, z), (x - sx * R * 0.96, 0, z), 18, 'heatshield'); _beam(p, (sx * 130, 60, z), (x - sx * R * 0.8, 40, z), 8, 'metal')
    # cracking towers and flares on top
    for k in range(14):
        z = -1700 + k * 230; x = r.uniform(-90, 90); h = r.uniform(120, 300); R = r.uniform(12, 30)
        add_cyl(p, x, z, 130, 130 + h, R, r.choice(('tint', 'metal', 'paint')), 24)
        for q in range(int(h / 40)): add_cyl(p, x, z, 140 + q * 40, 143 + q * 40, R * 1.2, 'metal', 24)
        if k % 3 == 0: add_cyl(p, x, z, 130 + h, 130 + h + 6, R * 0.5, 'heatshield', 16); _sloft(p, [(z - 8, 130 + h + 26, 0.3, x, 0.3, 2), (z, 130 + h + 22, 18, x, 10, 2), (z + 8, 130 + h + 26, 0.3, x, 0.3, 2)], 'neonamber', 12, per=3)
    # ore arms, folded
    for sx in (-1, 1):
        # stowed flat against the underside of the truss
        add_cyl(p, sx * 130, -600, -170, -130, 40, 'heatshield', 24); _beam(p, (sx * 130, -170, -600), (sx * 130, -215, 400), 44, 'hazard'); _beam(p, (sx * 130, -215, 400), (sx * 80, -190, 1330), 32, 'hazard'); _beam(p, (sx * 130, -150, -300), (sx * 130, -205, 200), 14, 'metal')
        for q in (-1, 0, 1): _beam(p, (sx * 80, -190, 1330), (sx * 80 + q * 60, -220, 1430), 14, 'metal')
    # the cab: a blunt rounded bow, decks of windows along it, a raked house on top with a wide bridge
    cab = [(1440, 0, 170, 0, 200, 3.4), (1560, 0, 178, 0, 214, 3.4), (1960, -6, 172, 0, 212, 3.2), (2090, -20, 130, 0, 150, 2.6), (2170, -36, 70, 0, 70, 2.2), (2200, -44, 6, 0, 8, 2)]
    add_loft(p, smooth_secs(cab, 6), 'tint', 96, axis='z')
    _taper(p, -150, 150, 1480, 2010, 150, 240, 16, 24, 'paint'); _taper(p, -92, 92, 1600, 1920, 240, 280, 8, 12, 'tint'); _bridgeglass(p, -84, 84, 1630, 1890, 280, 294, 4, 9)
    add_box(p, -210, 288, 1740, 210, 292, 1780, 'paint', 0)
    for sx in (-1, 1):
        _lit_bands(p, sx * 213, -110, 120, 1540, 1970, 9, sx, 8, r); _lit_bands(p, sx * 142, 158, 232, 1500, 1990, 4, sx, 7, r); _pods(p, sx * 214, 124, 1520, 2000, 18, 4, sx); _vents(p, sx * 212, -150, 1520, 2000, 16, 22, sx)
    for (x, z, h) in ((-44, 1720, 90), (40, 1830, 70), (0, 1660, 110)): _mast(p, x, 294, z, h, 5)
    add_cyl(p, 0, 2120, -20, -6, 30, 'paint', 24)
    # engines on a thrust frame
    for (x, y, R) in ((-190, 120, 74), (0, 130, 74), (190, 120, 74), (-190, -120, 74), (0, -130, 74), (190, -120, 74)):
        _engine(p, x, y, -2060, -1940, R); _beam(p, (x, y, -1940), (x * 0.5, y * 0.5, -1880), 14, 'metal')
    return (214, -14, 1760, 1)

def sable(p, lay, r):
    """A black flying wing, 2.4 km across: nothing bolted on it at all, one long curve from tip to tip, a slit of light along its edge, engines buried in the trailing edge."""
    _sloft(p, [(-600, 0, 40, 0, 200, 2), (-300, 2, 86, 0, 220, 2), (100, 0, 96, 0, 200, 2), (500, -4, 60, 0, 110, 2), (880, -10, 12, 0, 16, 2), (960, -12, 0.5, 0, 0.6, 2)], 'tint', 96, per=8)
    for s in (-1, 1):
        _aero(p, _span(s * 60, -6, 620, -560, s * 1200, 60, -760, -860, 110, 18, 1.5, 0.05), 0, 1, 'tint', 16)
        for f in (0.2, 0.48, 0.76):
            st = _span(s * 60, -6, 620, -560, s * 1200, 60, -760, -860, 110, 3, 1.5, 0.05, f, f + 0.04)
        for k in range(30):
            t0, t1 = k / 30, (k + 1) / 30; xa, xb = s * (60 + 1140 * t0), s * (60 + 1140 * t1); ya, yb = -6 + 66 * t0, -6 + 66 * t1; za, zb = 620 - 1380 * t0 ** 1.5, 620 - 1380 * t1 ** 1.5
            _beam(p, (xa, ya, za + 0.5), (xb, yb, zb + 0.5), 2.6, 'glow')
        add_box(p, s * 1200 - 3, 58, -870, s * 1200 + 3, 72, -760, 'navgreen' if s > 0 else 'navred', 0)
        _aero(p, _span(s * 1190, 60, -760, -860, s * 1205, 240, -860, -930, 16, 4, 1, 0.2), 0, 1, 'tint', 8)
        for k in range(3):
            ex = s * (120 + k * 150); _sloft(p, [(-200, 6 + k * 2, 30, ex, 56, 2.6), (-560 - k * 22, 6 + k * 2, 26, ex, 54, 3.4)], 'heatshield', 32, per=3); _engine(p, ex, 6 + k * 2, -640 - k * 22, -560 - k * 22, 24, 12)
        _lit_bands(p, s * 196, -20, 30, -300, 200, 3, s, 10, r)
    _canopy_like = [(420, 40), (620, 26)]
    bm_rows = 9; st = [(330 + 300 * k / bm_rows, 44 - 22 * (k / bm_rows) ** 2, max(0.3, 16 * math.sin(math.pi * k / bm_rows)), 0, max(0.3, 44 * math.sin(math.pi * k / bm_rows)), 2) for k in range(bm_rows + 1)]
    add_loft(p, smooth_secs(st, 3), 'visor', 48, axis='z')
    return (204, -6, -60, 1)

def _ibeam(p, a, b, h, w, mat='metal'):
    """A beam as it's rolled: a web between two flanges."""
    d = mathutils.Vector(b) - mathutils.Vector(a)
    ax = max(range(3), key=lambda i: abs(d[i])); lo = [min(a[i], b[i]) for i in range(3)]; hi = [max(a[i], b[i]) for i in range(3)]
    if ax == 1:   # a column: flanges face along z
        add_box(p, lo[0] - w / 2, lo[1], lo[2] - h / 2, hi[0] + w / 2, hi[1], lo[2] - h / 2 + 0.04, mat, 0); add_box(p, lo[0] - w / 2, lo[1], hi[2] + h / 2 - 0.04, hi[0] + w / 2, hi[1], hi[2] + h / 2, mat, 0); add_box(p, lo[0] - 0.025, lo[1], lo[2] - h / 2, hi[0] + 0.025, hi[1], hi[2] + h / 2, mat, 0)
    else:         # a girder: flanges above and below
        q = 2 if ax == 0 else 0; A = list(lo); B = list(hi)
        for (y0, y1) in ((lo[1] - h / 2, lo[1] - h / 2 + 0.05), (lo[1] + h / 2 - 0.05, lo[1] + h / 2)):
            A[q] = lo[q] - w / 2; B[q] = hi[q] + w / 2; add_box(p, A[0], y0, A[2], B[0], y1, B[2], mat, 0)
        A[q] = lo[q] - 0.025; B[q] = hi[q] + 0.025; add_box(p, A[0], lo[1] - h / 2, A[2], B[0], lo[1] + h / 2, B[2], mat, 0)

def _fitting(p, x, y, z, ln=2.4, wd=0.36):
    """A light: a housing up against the roof, a diffuser in it, not a glowing slab."""
    add_box(p, x - wd / 2 - 0.06, y - 0.1, z - ln / 2 - 0.06, x + wd / 2 + 0.06, y, z + ln / 2 + 0.06, 'metal', 0); add_box(p, x - wd / 2, y - 0.125, z - ln / 2, x + wd / 2, y - 0.1, z + ln / 2, 'lampwarm', 0)

ROOM_LOOK = {   # floor, wall panels, trim
    'hold': ('heatshield', 'tint', 'metal'), 'storage': ('concrete', 'tint', 'metal'), 'shopfloor-workshop': ('concrete', 'tint', 'metal'), 'kitchen': ('stone', 'laminate', 'metal'),
    'bedroom': ('wood', 'laminate', 'wood'), 'living': ('wood', 'laminate', 'wood'), 'lobby': ('stone', 'laminate', 'metal'), 'office': ('heatshield', 'paint', 'metal'),
}
def _partition(p, L, D, H, r):
    """A dividing wall: a frame, a panel each side, a shelf."""
    add_box(p, 0.03, 0.08, 0, L - 0.03, H - 0.05, D, 'laminate', 0); add_box(p, 0, 0, -0.01, L, 0.08, D + 0.01, 'rubber', 0); add_box(p, 0, H - 0.05, -0.01, L, H, D + 0.01, 'wood', 0)
    n = max(1, int(L / 2.4))
    for k in range(n + 1): add_box(p, k * (L - 0.06) / n, 0, -0.012, k * (L - 0.06) / n + 0.06, H, D + 0.012, 'wood', 0)

def dress_decks(p, lay, name):
    """The decks, made of what decks are made of: floor plates laid on a dark sub-floor, wall panels with gaps between them, real beams, a truss roof in the hangar and a lowered ceiling where people live. Everything keeps to walls and overhead; the floor you walk on is left clear."""
    hx0, hz0, hx1, hz1 = lay['hull']; deck = lay['deck']; ceil = lay['ceiling']; xc = (hx0 + hx1) / 2; r = random.Random(name); T = 0.14
    d0 = lay['doors'][0]; dx0, dx1 = d0['x'] - d0['width'] / 2, d0['x'] + d0['width'] / 2; dtop = deck + d0.get('height', 2.15)
    add_box(p, hx0, deck - 0.3, hz0, hx1, deck - 0.03, hz1, 'rubber', 0)          # sub-floor
    add_box(p, hx0 - 0.5, ceil, hz0, hx1 + 0.5, ceil + 0.3, hz1, 'heatshield', 0)     # the deck above
    for x in (hx0 - T, hx1): add_box(p, x, deck - 0.3, hz0, x + T, ceil + 0.3, hz1, 'rubber', 0)   # the pressure hull behind the panels
    add_box(p, hx0, deck, hz0 - 0.02, dx0, ceil, hz0 + 0.12, 'metal', 0); add_box(p, dx1, deck, hz0 - 0.02, hx1, ceil, hz0 + 0.12, 'metal', 0); add_box(p, dx0, dtop, hz0 - 0.02, dx1, ceil, hz0 + 0.12, 'metal', 0)
    add_box(p, hx0, deck, hz1 - 0.12, hx1, ceil, hz1, 'paint', 0)
    # the blast door's tracks and its hazard frame round the mouth
    for x in (dx0 - 0.6, dx1 + 0.1): add_box(p, x, deck, hz0 + 0.12, x + 0.5, dtop, hz0 + 0.5, 'hazard', 0)
    add_box(p, dx0 - 0.6, dtop, hz0 + 0.12, dx1 + 0.6, dtop + 0.5, hz0 + 0.5, 'hazard', 0)
    for R in lay['rooms']:
        x0, z0, x1, z1 = R['rect']; hangar = R['purpose'] == 'hold'; tall = hangar or R['purpose'] == 'lobby'; floor_, wall_, trim = ROOM_LOOK.get(R['purpose'], ('concrete', 'tint', 'metal'))
        roof = ceil if tall else deck + 4.2; per = 7.0 if hangar else 3.5
        # floor plates, each its own piece, a gap all round
        size = 3.0 if hangar else 1.2 if floor_ in ('stone', 'concrete') else 0
        if size:
            nx = int((x1 - x0) / size) | 1; nz = int((z1 - z0) / size); dx = (x1 - x0) / nx; dz = (z1 - z0) / nz
            for i in range(nx):
                for j in range(nz): add_box(p, x0 + i * dx + 0.005, deck - 0.03, z0 + j * dz + 0.005, x0 + (i + 1) * dx - 0.005, deck, z0 + (j + 1) * dz - 0.005, floor_, 0)
        elif floor_ == 'wood':
            for i in range(int((x1 - x0) / 0.32)): zs = z0 + (i * 0.73) % 1.0 - 0.0; add_box(p, x0 + i * 0.32 + 0.004, deck - 0.03, z0, x0 + (i + 1) * 0.32 - 0.004, deck, z1, 'wood', 0)
        else: add_box(p, x0, deck - 0.03, z0, x1, deck, z1, floor_, 0)
        # wall panels: lower, upper, each bay separate; a kick-plate; the structure showing between them
        zz = z0
        while zz < z1 - 0.2:
            ze = min(z1, zz + (per if hangar else 2.4)); low, mid = deck + (1.1 if not hangar else 1.6), roof
            for (x, sx) in ((x0, 1), (x1, -1)):
                a, b = (x, x + 0.06) if sx > 0 else (x - 0.06, x)
                add_box(p, a, deck + 0.14, zz + 0.04, b, low - 0.02, ze - 0.04, 'paint' if wall_ == 'tint' else wall_, 0); add_box(p, a, low + 0.02, zz + 0.04, b, mid, ze - 0.04, wall_, 0)
                a2, b2 = (x, x + 0.09) if sx > 0 else (x - 0.09, x); add_box(p, a2, deck, zz + 0.04, b2, deck + 0.14, ze - 0.04, 'rubber', 0)
                if not tall: add_box(p, a2, roof - 0.12, zz, b2, roof, ze, trim, 0)
            zz = ze
        # the roof
        if hangar:
            zz = z0 + 3.5
            while zz < z1:
                for x in (x0, x1): _ibeam(p, (x + (0.2 if x == x0 else -0.2), deck, zz), (x + (0.2 if x == x0 else -0.2), ceil, zz), 0.5, 0.4)
                # a truss across: top and bottom chords and the diagonals between them
                _ibeam(p, (x0, ceil - 0.2, zz), (x1, ceil - 0.2, zz), 0.36, 0.3); _ibeam(p, (x0, ceil - 0.5, zz), (x1, ceil - 0.5, zz), 0.26, 0.26)      # (a shallow truss: everything overhead stays above the bay doors' 6.6 m, so whatever comes in under them clears it)
                n = 12
                for k in range(n):
                    a = x0 + (x1 - x0) * k / n; b = x0 + (x1 - x0) * (k + 1) / n; _beam(p, (a, ceil - 0.5 if k % 2 else ceil - 0.2, zz), (b, ceil - 0.2 if k % 2 else ceil - 0.5, zz), 0.08, 'metal')
                zz += 7
            for x in (xc - 10, xc, xc + 10):
                add_box(p, x - 0.08, ceil - 0.3, z0, x + 0.08, ceil - 0.06, z1, 'metal', 0)     # stringers
            zz = z0 + 7
            while zz < z1:
                for x in (xc - 10, xc, xc + 10): _fitting(p, x, ceil - 0.52, zz, 2.6, 0.5)
                zz += 7
            # services along the roof: fat ducts on hangers, pipe runs, a cable tray
            for (dxx, R_) in ((-13, 0.42), (13, 0.42)):
                add_cyl(p, xc + dxx, ceil - 0.36, z0 + 1, z1 - 1, R_ * 0.7, 'metal', 16, axis='z'); zb = z0 + 3
                while zb < z1 - 1: add_cyl(p, xc + dxx, ceil - 0.36, zb, zb + 0.09, R_ * 0.75, 'paint', 16, axis='z'); zb += 3
            for x, y_, R_, m in ((x0 + 0.34, deck + 5.4, 0.1, 'metal'), (x0 + 0.34, deck + 5.15, 0.07, 'hazard'), (x1 - 0.34, deck + 5.4, 0.1, 'metal'), (x1 - 0.34, deck + 5.15, 0.07, 'paint')): add_cyl(p, x, y_, z0 + 0.4, z1 - 0.4, R_, m, 10, axis='z')
            # a gallery down each wall with a real rail, and a stair up to it at the back
            cy_ = deck + 4.5
            for (a, b, inner) in ((x0 + 0.1, x0 + 1.5, x0 + 1.5), (x1 - 1.5, x1 - 0.1, x1 - 1.5)):
                add_box(p, a, cy_ - 0.06, z0 + 4, b, cy_, z1 - 0.3, 'metal', 0); _ibeam(p, (inner, cy_ - 0.2, z0 + 4), (inner, cy_ - 0.2, z1 - 0.3), 0.2, 0.12)
                for yy in (0.55, 1.1): add_cyl(p, inner, cy_ + yy, z0 + 4, z1 - 0.3, 0.025, 'metal', 6, axis='z')
                zr = z0 + 4
                while zr < z1: add_box(p, inner - 0.02, cy_, zr, inner + 0.02, cy_ + 1.1, zr + 0.04, 'metal', 0); zr += 1.4
                zb = z0 + 7
                while zb < z1 - 1:
                    _beam(p, (min(a, b) if inner > xc else max(a, b), cy_ - 1.2, zb), (inner, cy_ - 0.1, zb), 0.1, 'metal'); zb += 7      # brackets
            # an overhead crane on rails under the roof
            # the overhead crane, parked against the back wall where nothing flies in, its hook drawn right up
            for zc_ in (z1 - 4.5,):
                for dz_ in (0, 1.4): _ibeam(p, (x0 + 0.5, ceil - 0.62, zc_ + dz_), (x1 - 0.5, ceil - 0.62, zc_ + dz_), 0.24, 0.36, 'soil')
                tx = xc + 4; add_box(p, tx - 1, ceil - 1.1, zc_ - 0.3, tx + 1, ceil - 0.74, zc_ + 1.7, 'heatshield', 0); add_cyl(p, tx, zc_ + 0.7, ceil - 1.5, ceil - 1.1, 0.025, 'metal', 6); add_box(p, tx - 0.18, ceil - 1.72, zc_ + 0.5, tx + 0.18, ceil - 1.5, zc_ + 0.9, 'hazard', 0)
            # work stations on the walls: tool boards, hose reels, status screens, a fire point
            zw = z0 + 5.2
            while zw < z1 - 2:
                for (xw, sx) in ((x0 + 0.08, 1), (x1 - 0.08, -1)):
                    a, b = (xw, xw + 0.05) if sx > 0 else (xw - 0.05, xw)
                    q = r.random()
                    if q < 0.4: add_box(p, a, deck + 1.35, zw, b, deck + 2.05, zw + 1.1, 'screen', 0)
                    elif q < 0.7: add_box(p, a, deck + 0.9, zw, b, deck + 2.2, zw + 1.5, 'paint', 0); add_cyl(p, xw + sx * 0.14, deck + 1.55, zw + 0.75 - 0.03, zw + 0.75 + 0.03, 0.3, 'navred', 16, axis='z')
                    else:
                        add_box(p, a, deck + 0.9, zw, b, deck + 2.3, zw + 1.0, 'heatshield', 0); add_cyl(p, xw + sx * 0.22, zw + 0.5, deck + 1.1, deck + 2.0, 0.08, 'navred', 10)
                zw += 7
            # the deck's paint: a landing box, a lead-in, centre line. Paint, so only just above the plates.
            for (a, b, c, d) in ((xc - 9, z0 + 9, xc + 9, z0 + 9.28), (xc - 9, z0 + 33, xc + 9, z0 + 33.28), (xc - 9, z0 + 9, xc - 8.72, z0 + 33), (xc + 8.72, z0 + 9, xc + 9, z0 + 33)): add_box(p, a, deck, b, c, deck + 0.004, d, 'hazard', 0)
            z_ = z0 + 1.5
            while z_ < z0 + 8:
                for s in (-1, 1): add_box(p, xc + s * 1.4 - 0.9, deck, z_, xc + s * 1.4 + 0.9, deck + 0.004, z_ + 0.42, 'hazard', 0)
                z_ += 1.4
            # tie-downs in the plates
            for i in range(-3, 4):
                for j in range(int((z1 - z0) / 6)): add_cyl(p, xc + i * 3.5, z0 + 3 + j * 6, deck, deck + 0.012, 0.09, 'metal', 8)
        else:
            if not tall:
                # a ship's room, not an office: frames every 3.5 m (a pilaster up each wall, a haunch leaning in, a beam across), so the room's section is a
                # flattened hexagon; between the frames the ceiling is coffered, with three light troughs running its length and a lit strip along each wall
                H = roof - deck; hz = H - 1.0; zf = z0 + 1.75
                while zf < z1 - 0.5:
                    for (x, sx) in ((x0, 1), (x1, -1)):
                        add_box(p, min(x, x + sx * 0.32), deck, zf - 0.25, max(x, x + sx * 0.32), deck + hz, zf + 0.25, 'paint', 0)
                        add_box(p, min(x + sx * 0.32, x + sx * 0.36), deck + 0.4, zf - 0.27, max(x + sx * 0.32, x + sx * 0.36), deck + hz - 0.2, zf + 0.27, 'metal', 0)
                        bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((x + sx * 0.32, deck + hz, zf - 0.25), (x + sx * 0.32, deck + hz, zf + 0.25), (x + sx * 1.4, roof, zf + 0.25), (x + sx * 1.4, roof, zf - 0.25))]; bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.3); merge(p, bm, 'paint')
                    add_box(p, x0 + 1.3, roof - 0.34, zf - 0.22, x1 - 1.3, roof, zf + 0.22, 'paint', 0); add_box(p, x0 + 1.3, roof - 0.37, zf - 0.08, x1 - 1.3, roof - 0.34, zf + 0.08, 'metal', 0)
                    zf += 3.5
                # the haunch between frames: a sloped panel either side, the lit strip at its foot
                for (x, sx) in ((x0, 1), (x1, -1)):
                    bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((x + sx * 0.05, deck + hz, z0 + 0.1), (x + sx * 0.05, deck + hz, z1 - 0.1), (x + sx * 1.35, roof + 0.02, z1 - 0.1), (x + sx * 1.35, roof + 0.02, z0 + 0.1))]; bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.04); merge(p, bm, wall_)
                    add_box(p, min(x, x + sx * 0.14), deck + hz - 0.12, z0 + 0.1, max(x, x + sx * 0.14), deck + hz - 0.04, z1 - 0.1, 'lampwarm', 0)
                    add_box(p, min(x, x + sx * 0.2), deck + hz - 0.2, z0 + 0.1, max(x, x + sx * 0.2), deck + hz - 0.12, z1 - 0.1, 'metal', 0)
                    add_box(p, min(x, x + sx * 0.1), deck + 0.14, z0 + 0.1, max(x, x + sx * 0.1), deck + 0.17, z1 - 0.1, 'glow', 0)        # the ship's colour, low along the wall
                # the coffers: panels between the beams, a trough of light down each third of the room
                add_box(p, x0 + 1.3, roof + 0.02, z0, x1 - 1.3, roof + 0.06, z1, 'tint' if wall_ != 'laminate' else 'laminate', 0)
                for x in (xc - 9, xc, xc + 9):
                    add_box(p, x - 0.42, roof - 0.16, z0 + 0.2, x - 0.36, roof + 0.02, z1 - 0.2, 'metal', 0); add_box(p, x + 0.36, roof - 0.16, z0 + 0.2, x + 0.42, roof + 0.02, z1 - 0.2, 'metal', 0)
                    add_box(p, x - 0.36, roof - 0.02, z0 + 0.2, x + 0.36, roof + 0.02, z1 - 0.2, 'lampwarm', 0)
                add_box(p, x0, roof + 0.06, z0, x1, roof + 0.09, z1, 'rubber', 0)
                add_box(p, x0, roof + 0.09, z0 + 0.09, x1, ceil, z0 + 0.12, 'rubber', 0); add_box(p, x0, roof + 0.09, z1 - 0.12, x1, ceil, z1 - 0.09, 'rubber', 0)      # (closing the space over the ceiling, just inside the bulkhead: never in the same plane as it)
                # services in the haunch: a pipe and a cable tray run the length of it
                for (x, sx) in ((x0, 1), (x1, -1)):
                    add_cyl(p, x + sx * 0.7, roof - 0.42, z0 + 0.2, z1 - 0.2, 0.07, 'metal', 8, axis='z'); add_box(p, min(x + sx * 0.9, x + sx * 1.15), roof - 0.62, z0 + 0.2, max(x + sx * 0.9, x + sx * 1.15), roof - 0.58, z1 - 0.2, 'metal', 0)
                # a runner down the clear way: carpet where people live, anti-slip and lines where they work
                soft = R['purpose'] in ('living', 'bedroom', 'lobby')
                add_box(p, xc - 2.6, deck, z0 + 0.3, xc + 2.6, deck + 0.012, z1 - 0.3, 'fabric' if soft else 'rubber', 0)
                if not soft:
                    for x in (xc - 2.75, xc + 2.6): add_box(p, x, deck, z0 + 0.3, x + 0.15, deck + 0.014, z1 - 0.3, 'hazard', 0)
            else:
                # a tall hall: columns, a balcony round it at the upper level, a great light down the middle
                zz = z0 + 2
                while zz < z1 - 1:
                    for x in (x0 + 0.5, x1 - 0.5): add_cyl(p, x, zz, deck, ceil, 0.26, 'stone', 20)
                    zz += 3.5
                by = deck + 3.6
                for (a, b, inner) in ((x0 + 0.1, x0 + 3, x0 + 3), (x1 - 3, x1 - 0.1, x1 - 3)):
                    add_box(p, a, by - 0.22, z0 + 0.2, b, by, z1 - 0.2, 'laminate', 0); add_box(p, inner - 0.05, by, z0 + 0.2, inner + 0.05, by + 1.05, z1 - 0.2, 'glass', 0); add_cyl(p, inner, by + 1.08, z0 + 0.2, z1 - 0.2, 0.04, 'metal', 8, axis='z')
                k = 1
                while k * 3.5 < z1:
                    zf = k * 3.5 - 1.75
                    if z0 < zf < z1:
                        for x in (xc - 10, xc, xc + 10): add_cyl(p, x, zf, ceil - 0.7, ceil, 0.015, 'metal', 6); add_cyl(p, x, zf, ceil - 1.0, ceil - 0.7, 0.42, 'lampwarm', 20)
                    k += 1
            # what the room is for, on its walls
            pz = R['purpose']
            def viewport(x, sx, za, zb, y0, y1):
                """A window out of the ship: a deep frame, the pane (it shows the sky: render/capital.js), a sill."""
                a_, b_ = (x, x + sx * 0.06) if sx > 0 else (x - sx * -0.06 - 0.06 + 0.0, x)
                add_box(p, min(x, x + sx * 0.04), y0, za, max(x, x + sx * 0.04), y1, zb, 'mirror', 0)
                for (q0, q1, r0, r1) in ((y0 - 0.12, y0, za - 0.12, zb + 0.12), (y1, y1 + 0.12, za - 0.12, zb + 0.12), (y0, y1, za - 0.12, za), (y0, y1, zb, zb + 0.12)):
                    add_box(p, min(x, x + sx * 0.22), q0, r0, max(x, x + sx * 0.22), q1, r1, 'metal', 0)
                add_box(p, min(x, x + sx * 0.32), y0 - 0.16, za - 0.1, max(x, x + sx * 0.32), y0 - 0.1, zb + 0.1, 'wood' if pz in ('living', 'lobby', 'bedroom') else 'metal', 0)
                add_box(p, min(x, x + sx * 0.08), (y0 + y1) / 2 - 0.03, za, max(x, x + sx * 0.08), (y0 + y1) / 2 + 0.03, zb, 'metal', 0)
            if pz == 'lobby' and tall:
                # the hall's windows: tall ones between the columns under the balcony, and again above it; a skylight of coffers over the middle
                zq = z0 + 2
                while zq + 3.5 < z1:
                    for x, sx in ((x0 + 0.06, 1), (x1 - 0.06, -1)):
                        if name == 'meridian' and sx > 0 and zq < 48.25 < zq + 3.5: continue          # (the spoke lift's door is in this bay)
                        viewport(x, sx, zq + 0.45, zq + 3.05, deck + 0.8, deck + 3.3); viewport(x, sx, zq + 0.45, zq + 3.05, by + 1.4, ceil - 0.8)
                    zq += 3.5
                for i in range(4):
                    for j in range(int((z1 - z0 - 2) / 3)):
                        xa = xc - 6 + i * 3; za = z0 + 1 + j * 3; add_box(p, xa + 0.1, ceil - 0.05, za + 0.1, xa + 2.9, ceil - 0.02, za + 2.9, 'lampwarm', 0); add_box(p, xa, ceil - 0.35, za, xa + 3, ceil - 0.05, za + 0.1, 'paint', 0); add_box(p, xa, ceil - 0.35, za, xa + 0.1, ceil - 0.05, za + 3, 'paint', 0)
            if pz == 'office':
                # a bridge: the far wall one long raked window over everything, the stations' screens, a chart table with the plot standing over it, rings of light overhead
                if R['i'] == len(lay['rooms']) - 1:
                    n = 6; wspan = (x1 - x0 - 2.0) / n
                    for i in range(n):
                        xa = x0 + 1 + i * wspan; bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((xa + 0.1, deck + 0.9, z1 - 0.2), (xa + wspan - 0.1, deck + 0.9, z1 - 0.2), (xa + wspan - 0.1, roof - 0.3, z1 - 0.9), (xa + 0.1, roof - 0.3, z1 - 0.9))]; bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.04); merge(p, bm, 'mirror')
                        _beam(p, (xa, deck + 0.9, z1 - 0.15), (xa, roof - 0.3, z1 - 0.85), 0.2, 'paint')
                    _beam(p, (x1 - 1, deck + 0.9, z1 - 0.15), (x1 - 1, roof - 0.3, z1 - 0.85), 0.2, 'paint')
                    add_box(p, x0 + 0.5, deck, z1 - 0.6, x1 - 0.5, deck + 0.9, z1 - 0.1, 'paint', 0); add_box(p, x0 + 0.5, deck + 0.9, z1 - 0.7, x1 - 0.5, deck + 0.95, z1 - 0.1, 'metal', 0)
                    for i in range(14): xa = x0 + 1.2 + i * (x1 - x0 - 2.4) / 14; add_box(p, xa, deck + 0.95, z1 - 0.62, xa + 0.9, deck + 0.97, z1 - 0.25, 'screen', 0)
                    cz = z0 + 3.0
                    # the plot over the chart table: the table's top a screen, the ships in it standing up off it as thin lines of light, a ring round its edge
                    add_box(p, xc - 1.42, deck + 0.76, cz - 0.52, xc + 1.42, deck + 0.775, cz + 0.52, 'screen', 0)
                    for (a_, b_, c_, d_) in ((-1.45, -1.42, -0.55, 0.55), (1.42, 1.45, -0.55, 0.55), (-1.45, 1.45, -0.55, -0.52), (-1.45, 1.45, 0.52, 0.55)): add_box(p, xc + a_, deck + 0.77, cz + c_, xc + b_, deck + 0.79, cz + d_, 'glow', 0)
                    for q in range(11): px_, pz_ = xc + ((q * 0.37) % 1 - 0.5) * 2.4, cz + ((q * 0.61) % 1 - 0.5) * 0.8; hh = 0.08 + (q % 4) * 0.07; add_box(p, px_ - 0.003, deck + 0.78, pz_ - 0.003, px_ + 0.003, deck + 0.78 + hh, pz_ + 0.003, 'glow', 0); add_box(p, px_ - 0.015, deck + 0.78 + hh, pz_ - 0.01, px_ + 0.015, deck + 0.79 + hh, pz_ + 0.01, 'glow', 0)
                    for rr in (2.4, 3.4): add_cyl(p, xc, cz, roof - 0.6, roof - 0.52, rr, 'lampwarm', 48); add_cyl(p, xc, cz, roof - 0.52, roof - 0.45, rr + 0.08, 'metal', 48)
                    for (x, sx) in ((x0 + 0.08, 1), (x1 - 0.08, -1)):
                        for q in range(3): zq = z0 + 1.0 + q * 3.5; add_box(p, min(x, x + sx * 0.06), deck + 1.1, zq, max(x, x + sx * 0.06), deck + 2.4, zq + 2.6, 'screen', 0); add_box(p, min(x, x + sx * 0.04), deck + 1.04, zq - 0.06, max(x, x + sx * 0.04), deck + 2.46, zq + 2.66, 'metal', 0)
            elif pz == 'storage':
                # an armoury: cages of racks, rifles stood in them, red light low on the walls
                zw = z0 + 0.7
                while zw < z1 - 1.2:
                    for x, sx in ((x0 + 0.08, 1), (x1 - 0.08, -1)):
                        for yy in (1.0, 1.7, 2.4): add_box(p, min(x, x + sx * 0.3), deck + yy, zw, max(x, x + sx * 0.3), deck + yy + 0.05, zw + 1.0, 'metal', 0)
                        for q in range(5): zq = zw + 0.12 + q * 0.18; add_box(p, min(x + sx * 0.08, x + sx * 0.14), deck + 1.05, zq, max(x + sx * 0.08, x + sx * 0.14), deck + 1.95, zq + 0.05, 'heatshield', 0); add_box(p, min(x + sx * 0.06, x + sx * 0.22), deck + 1.35, zq - 0.01, max(x + sx * 0.06, x + sx * 0.22), deck + 1.5, zq + 0.06, 'heatshield', 0)
                        add_box(p, min(x, x + sx * 0.06), deck + 0.3, zw, max(x, x + sx * 0.06), deck + 0.34, zw + 1.0, 'navred', 0)
                    zw += 1.6
                for x in (xc - 3.2, xc + 3.2):
                    add_box(p, x - 0.03, deck, z0 + 0.6, x + 0.03, deck + 2.6, z1 - 0.6, 'metal', 0) if False else None
                    zq = z0 + 0.6
                    while zq < z1 - 0.6: add_box(p, x - 0.025, deck, zq, x + 0.025, deck + 2.6, zq + 0.05, 'metal', 0); zq += 0.6
                    for yy in (0.1, 1.3, 2.55): add_box(p, x - 0.03, deck + yy, z0 + 0.6, x + 0.03, deck + yy + 0.05, z1 - 0.6, 'metal', 0)
            elif pz in ('living', 'bedroom', 'lobby') and not tall or pz == 'living':
                # windows out of the ship down both sides, tall where people sit, a band of wood under them
                zw = z0 + 1.75 + 0.3
                while zw + 2.9 < z1:
                    for x, sx in ((x0 + 0.06, 1), (x1 - 0.06, -1)):
                        viewport(x, sx, zw, zw + 2.9, deck + (0.7 if pz == 'living' else 1.1), deck + (2.9 if pz == 'living' else 2.4))
                    zw += 3.5
                for x, sx in ((x0 + 0.04, 1), (x1 - 0.04, -1)): add_box(p, min(x, x + sx * 0.05), deck + 0.14, z0 + 0.1, max(x, x + sx * 0.05), deck + 0.6, z1 - 0.1, 'wood', 0)
                if pz == 'living':
                    # pendant lights over the seating, and a bar across the far end with its shelves of bottles lit from below
                    for zq in range(int(z0 + 3), int(z1 - 1), 4):
                        for x in (xc - 6.4, xc + 6.4, xc - 11, xc + 11): add_cyl(p, x, zq + 1.6, roof - 1.1, roof, 0.01, 'metal', 4); add_cyl(p, x, zq + 1.6, roof - 1.45, roof - 1.1, 0.32, 'lampwarm', 20, r2=0.12)
                    bx0, bx1 = xc + 3.5, x1 - 2.5
                    add_box(p, bx0, deck, z1 - 1.4, bx1, deck + 1.05, z1 - 0.8, 'wood', 0); add_box(p, bx0 - 0.05, deck + 1.05, z1 - 1.5, bx1 + 0.05, deck + 1.1, z1 - 0.75, 'stone', 0)
                    for yy in (1.4, 1.9, 2.4):
                        add_box(p, bx0, deck + yy, z1 - 0.35, bx1, deck + yy + 0.03, z1 - 0.1, 'glass', 0); add_box(p, bx0, deck + yy - 0.03, z1 - 0.14, bx1, deck + yy, z1 - 0.1, 'neonamber', 0)
                        q = bx0 + 0.15
                        while q < bx1 - 0.15: add_cyl(p, q, z1 - 0.22, deck + yy + 0.03, deck + yy + 0.3, 0.035, 'glass' if int(q * 7) % 3 else 'visor', 8); q += 0.17
            elif pz == 'kitchen':
                # a mess: a galley along the wall, tiled behind the counters, a hood over them; lights hung low over each table
                for x, sx in ((x0 + 0.06, 1), (x1 - 0.06, -1)):
                    add_box(p, min(x, x + sx * 0.03), deck + 0.95, z0 + 0.4, max(x, x + sx * 0.03), deck + 1.9, z1 - 0.4, 'ceramic', 0)
                    add_box(p, min(x, x + sx * 0.9), deck + 2.4, z0 + 0.6, max(x, x + sx * 0.9), deck + 2.7, z1 - 0.6, 'metal', 0)
                for zq in [z for z in [z0 + 2.2 + 4.2 * k for k in range(4)] if z < z1 - 1]:
                    for off in (5.4, 10):
                        for sgn in (-1, 1): x = xc + sgn * off; add_cyl(p, x, zq, roof - 1.6, roof, 0.01, 'metal', 4); add_cyl(p, x, zq, roof - 1.85, roof - 1.6, 0.26, 'paint', 16, r2=0.06); add_cyl(p, x, zq, roof - 1.86, roof - 1.85, 0.24, 'lampwarm', 16)
                add_box(p, xc - 1.5, deck + 2.0, z1 - 0.2, xc + 1.5, deck + 2.9, z1 - 0.14, 'screen', 0)
            elif pz == 'shopfloor-workshop':
                zw = z0 + 1
                while zw < z1 - 1:
                    for x, sx in ((x0 + 0.08, 1), (x1 - 0.08, -1)): add_box(p, min(x, x + sx * 0.05), deck + 1.1, zw, max(x, x + sx * 0.05), deck + 2.5, zw + 2.2, 'heatshield', 0)
                    zw += 3.5
                # a gantry crane on rails down the room
                for x in (x0 + 1.6, x1 - 1.6): add_box(p, x - 0.15, roof - 0.9, z0 + 0.3, x + 0.15, roof - 0.6, z1 - 0.3, 'soil', 0)
                zc_ = (z0 + z1) / 2; add_box(p, x0 + 1.4, roof - 1.3, zc_ - 0.3, x1 - 1.4, roof - 0.9, zc_ + 0.3, 'soil', 0); add_box(p, xc + 3 - 0.5, roof - 1.7, zc_ - 0.4, xc + 3 + 0.5, roof - 1.3, zc_ + 0.4, 'heatshield', 0); add_cyl(p, xc + 3, zc_, roof - 2.6, roof - 1.7, 0.02, 'metal', 6); add_box(p, xc + 2.85, roof - 2.8, zc_ - 0.15, xc + 3.15, roof - 2.6, zc_ + 0.15, 'hazard', 0)
                for (x_, w_) in ((xc - 2.75, 0.15), (xc + 2.6, 0.15)): add_box(p, x_, deck, z0 + 0.3, x_ + w_, deck + 0.014, z1 - 0.3, 'hazard', 0)
            if pz == 'bedroom':
                # each bunk its own reading light, a curtain half drawn across the bay
                for pr in [q for q in lay['props'] if q['room'] == R['i'] and q['kind'] == 'bed']:
                    cx_, cz_ = (pr['x0'] + pr['x1']) / 2, (pr['z0'] + pr['z1']) / 2; add_box(p, cx_ - 0.15, deck + 1.55, cz_ - 0.1, cx_ + 0.15, deck + 1.65, cz_ + 0.1, 'lampwarm', 0)
                for pr in [q for q in lay['props'] if q['room'] == R['i'] and q['kind'] == 'partition']:
                    xin = pr['x1'] if pr['x0'] < xc else pr['x0']; zq = pr['z1']
                    add_box(p, xin - 0.02 - (0.9 if xin > xc else 0), deck + 2.25, zq + 0.02, xin + 0.02 + (0 if xin > xc else 0.9) - 0.0, deck + 2.3, zq + 3.25, 'metal', 0) if False else None
                    add_box(p, xin - 0.015, deck + 2.25, zq + 0.1, xin + 0.015, deck + 2.28, zq + 3.2, 'metal', 0)
                    for q in range(3): add_box(p, xin - 0.03, deck + 0.35, zq + 0.12 + q * 0.17, xin + 0.03, deck + 2.25, zq + 0.26 + q * 0.17, 'fabric', 0)
    # stairs up to the balconies: strings, treads, risers, rails; the balconies and the landing they reach
    for S in lay.get('stairs', []):
        by, foot, top = S['by'], S['foot'], S['top']; n = int((by - deck) / 0.18)
        for (a, b) in S['flights']:
            for i in range(n):
                y0_ = deck + (by - deck) * i / n; y1_ = deck + (by - deck) * (i + 1) / n; za = foot + (top - foot) * i / n; zb = foot + (top - foot) * (i + 1) / n
                add_box(p, a + 0.1, y1_ - 0.05, za, b - 0.1, y1_, top if i == n - 1 else zb + 0.03, 'stone', 0); add_box(p, a + 0.12, y0_, za, b - 0.12, y1_ - 0.05, za + 0.03, 'wood', 0)
            for x in (a, b):
                bm = bmesh.new(); vs = [bm.verts.new(P(x, *v)) for v in ((deck, foot), (by - 0.0, top), (by + 0.05, top), (deck + 0.32, foot))]; bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.12); merge(p, bm, 'paint')
                for i in range(0, n + 1, 3): fz = foot + (top - foot) * i / n; fy = deck + (by - deck) * i / n; add_cyl(p, x, fz, fy, fy + 1.0, 0.018, 'metal', 6)
                _beam(p, (x, deck + 1.0, foot), (x, by + 1.0, top), 0.05, 'wood')
            # underneath the flight: closed in, a panel wall, so it stands on something
            bm = bmesh.new(); vs = [bm.verts.new(P(a + 0.02, *v)) for v in ((deck, foot), (by, top), (deck, top))]; bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.04); merge(p, bm, 'laminate')
            bm = bmesh.new(); vs = [bm.verts.new(P(b - 0.02, *v)) for v in ((deck, foot), (by, top), (deck, top))]; bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.04); merge(p, bm, 'laminate')
        # the landing across the far wall, over the hatch
        add_box(p, S['inL'], by - 0.22, top, S['inR'], by, S['z1'] - 0.08, 'stone', 0); add_box(p, S['inL'], by - 0.32, top - 0.02, S['inR'], by - 0.22, top + 0.1, 'wood', 0)
        fl = S['flights']
        for (a, b) in ((S['inL'], fl[0][0]), (fl[0][1], fl[1][0]), (fl[1][1], S['inR'])):
            if b - a > 0.05: add_box(p, a, by, top - 0.03, b, by + 1.0, top + 0.03, 'glass', 0); add_box(p, a, by + 1.0, top - 0.05, b, by + 1.06, top + 0.05, 'wood', 0)
    # partitions between sleeping bays; rugs under the seating; pictures, sconces and shelves on bulkheads
    for pr in lay['props']:
        if pr['kind'] == 'partition': continue
    r2 = random.Random(name + 'rooms')
    for R in lay['rooms']:
        x0, z0, x1, z1 = R['rect']
        if R['purpose'] in ('living',):
            for pr in [q for q in lay['props'] if q['room'] == R['i'] and q['kind'] == 'sofa']:
                add_box(p, pr['x0'] - 1.2, deck, pr['z0'] - 0.4, pr['x1'] + 1.2, deck + 0.012, pr['z0'] + 2.9, 'fabric', 0)
        if R['purpose'] in ('living', 'bedroom', 'kitchen', 'lobby', 'office'):
            for z_, sgn in ((z0 + 0.1, 1), (z1 - 0.1, -1)):
                xx = x0 + 2
                while xx < x1 - 3:
                    if abs(xx + 1 - xc) > 2.6:
                        m_ = 'screen' if R['purpose'] == 'office' else 'laminate'; add_box(p, xx, deck + 1.0, min(z_, z_ + sgn * 0.03), xx + 2.2, deck + 2.5, max(z_, z_ + sgn * 0.03), 'wood' if m_ == 'laminate' else 'metal', 0)
                        add_box(p, xx + 0.08, deck + 1.08, min(z_, z_ + sgn * 0.045), xx + 2.12, deck + 2.42, max(z_, z_ + sgn * 0.045), m_ if m_ == 'screen' else r2.choice(('fabric', 'visor', 'laminate')), 0)
                    xx += 4.4
    # the bulkheads between rooms, each with its hatch: a coaming round the door, its number by it
    for part_ in lay['partitions']:
        dd = lay['doors'][part_['door']]; a0, a1 = dd['x'] - dd['width'] / 2, dd['x'] + dd['width'] / 2; z = part_['z']; top = deck + 2.1
        add_box(p, hx0, deck, z - 0.08, a0, ceil, z + 0.08, 'tint', 0); add_box(p, a1, deck, z - 0.08, hx1, ceil, z + 0.08, 'tint', 0); add_box(p, a0, top, z - 0.08, a1, ceil, z + 0.08, 'tint', 0)
        for (x0_, x1_, y0_, y1_) in ((a0 - 0.14, a0, deck, top + 0.14), (a1, a1 + 0.14, deck, top + 0.14), (a0, a1, top, top + 0.14)): add_box(p, x0_, y0_, z - 0.13, x1_, y1_, z + 0.13, 'metal', 0)
        for s in (-1, 1): add_box(p, a1 + 0.3, deck + 1.3, z + s * 0.08 - (0.012 if s < 0 else 0), a1 + 1.0, deck + 1.75, z + s * 0.08 + (0.012 if s > 0 else 0), 'screen', 0)
    # the Meridian's spoke lift, in the promenade wall: up to the hub and down into the rings (js/gen/rings.js)
    if name == 'meridian':
        x, z = hx0 + 0.02, 48.25
        add_box(p, x, deck, z - 1.5, x + 0.3, deck + 3.1, z - 1.2, 'metal', 0); add_box(p, x, deck, z + 1.2, x + 0.3, deck + 3.1, z + 1.5, 'metal', 0); add_box(p, x, deck + 2.8, z - 1.2, x + 0.3, deck + 3.1, z + 1.2, 'metal', 0)
        add_box(p, x + 0.05, deck, z - 1.2, x + 0.12, deck + 2.8, z - 0.02, 'paint', 0); add_box(p, x + 0.05, deck, z + 0.02, x + 0.12, deck + 2.8, z + 1.2, 'paint', 0)
        add_box(p, x + 0.12, deck + 1.0, z - 0.02, x + 0.14, deck + 2.4, z + 0.02, 'glow', 0); add_box(p, x + 0.1, deck + 3.2, z - 0.9, x + 0.16, deck + 3.6, z + 0.9, 'screen', 0)
        add_box(p, x + 0.1, deck + 1.2, z + 1.7, x + 0.18, deck + 1.45, z + 1.85, 'lampwarm', 0)
        for k in range(12): add_box(p, x + 0.3, deck, z - 1.5 + k * 0.25, x + 1.6, deck + 0.004, z - 1.4 + k * 0.25, 'hazard', 0)
    # the furniture the layout says is here
    def pillar(q, L, D, H, r):
        """A frame column: a plinth, the shaft with a lit channel up its face, a capital spreading into the girder."""
        add_box(q, -0.04, 0, -0.04, L + 0.04, 0.25, D + 0.04, 'metal', 0); add_box(q, 0, 0.25, 0, L, H - 0.6, D, 'paint', 0)
        add_box(q, L / 2 - 0.05, 0.6, -0.01, L / 2 + 0.05, H - 1.2, 0.0, 'glow', 0); add_box(q, L / 2 - 0.05, 0.6, D, L / 2 + 0.05, H - 1.2, D + 0.01, 'glow', 0)
        bm = bmesh.new(); vs = [bm.verts.new(P(*v)) for v in ((0, H - 0.6, 0), (L, H - 0.6, 0), (L, H - 0.6, D), (0, H - 0.6, D), (-0.25, H, -0.25), (L + 0.25, H, -0.25), (L + 0.25, H, D + 0.25), (-0.25, H, D + 0.25))]
        for f_ in ((0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)): bm.faces.new([vs[i] for i in f_])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(q, bm, 'paint')
    for R in lay['rooms']:
        if R['purpose'] in ('hold', 'lobby'): continue
        x0, z0, x1, z1 = R['rect']; roof_ = deck + 4.2
        for x in (xc - 3.45, xc + 3.45): add_box(p, x - 0.25, roof_ - 0.55, z0 + 0.1, x + 0.25, roof_, z1 - 0.1, 'paint', 0); add_box(p, x - 0.27, roof_ - 0.58, z0 + 0.1, x + 0.27, roof_ - 0.55, z1 - 0.1, 'metal', 0)
    B = {'pillar': pillar, 'bed': bed, 'counter': counter, 'locker': lambda q, L, D, H, r: cabinet(q, L, D, H, r, 'locker'), 'crate': crate, 'table': table, 'machine': machine, 'bench': bench, 'sofa': sofa, 'armchair': armchair, 'tvstand': tvstand, 'planter': planter, 'fridge': lambda q, L, D, H, r: cabinet(q, L, D, H, r, 'fridge'), 'desk': desk, 'cabinet': cabinet, 'rack': lambda q, L, D, H, r: shelf(q, L, D, H, r, 'rack'), 'chair': chair, 'console': console, 'partition': _partition}
    for pr in lay['props']:
        across = pr['face'] in (0, 2); L, D = (pr['x1'] - pr['x0'], pr['z1'] - pr['z0']) if across else (pr['z1'] - pr['z0'], pr['x1'] - pr['x0'])
        place_in(p, B[pr['kind']], L, D, pr['h'], pr, deck)

def _look(obs):
    """A partial build is for looking at: each piece from four sides, rendered here (workbench, a colour per material), into out/booth/."""
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
    sc.display.shading.show_cavity = True; sc.display.shading.show_shadows = True; sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    COL = {'tint': (0.8, 0.78, 0.74), 'visor': (0.1, 0.13, 0.17), 'lampwarm': (1, 0.85, 0.5), 'glass': (0.5, 0.7, 0.8), 'leaf': (0.25, 0.45, 0.2), 'paint': (0.3, 0.32, 0.35), 'metal': (0.55, 0.55, 0.56), 'concrete': (0.6, 0.6, 0.58), 'heatshield': (0.08, 0.08, 0.09), 'rubber': (0.05, 0.05, 0.05), 'stone': (0.7, 0.68, 0.62), 'glow': (0.5, 0.9, 1), 'hazard': (0.9, 0.7, 0.1), 'wood': (0.5, 0.33, 0.18), 'fabric': (0.4, 0.3, 0.3), 'screen': (0.2, 0.6, 0.8)}
    for m in bpy.data.materials: m.diffuse_color = (*COL.get(m.name, (0.6, 0.5, 0.6)), 1)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam; cam.data.clip_end = 1e6; cam.data.lens = float(os.environ.get('LENS', 35))
    for ob in obs:
        for o in bpy.data.objects: o.hide_render = o.type == 'MESH' and o is not ob
        bb = [ob.matrix_world @ mathutils.Vector(c) for c in ob.bound_box]; c = sum(bb, mathutils.Vector()) / 8; R = max((v - c).length for v in bb)
        views = [(0.55, -0.75, 0.3), (-0.8, 0.5, 0.35), (0.05, -0.2, 1.0), (1.0, 0.05, 0.08)]
        if os.environ.get('VIEW'): views = [tuple(float(q) for q in v.split(',')) for v in os.environ['VIEW'].split(';')]
        if os.environ.get('CAM'):
            for i, q in enumerate(os.environ['CAM'].split('|')):
                a, b = [mathutils.Vector(P(*[float(t) for t in u.split(',')])) for u in q.split(';')]
                cam.location = a; cam.rotation_euler = (b - a).to_track_quat('-Z', 'Y').to_euler()
                sc.render.filepath = os.path.join(ROOT, 'out', 'booth', ob.name + '-c' + str(i) + '.png'); bpy.ops.render.render(write_still=True); print('look', sc.render.filepath)
            continue
        for i, v in enumerate(views):
            d = mathutils.Vector(v).normalized(); D = float(os.environ.get('DIST', 1.9)); tgt = c + mathutils.Vector(tuple(float(q) for q in os.environ.get('AT', '0,0,0').split(',')))
            cam.location = tgt + d * R * D; cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
            sc.render.filepath = os.path.join(ROOT, 'out', 'booth', ob.name + '-' + str(i) + '.png'); bpy.ops.render.render(write_still=True); print('look', sc.render.filepath)

CAPITALS = {'bastion': bastion, 'meridian': meridian, 'longshore': longshore, 'halcyon': halcyon, 'anvil': anvil, 'vesper': vesper, 'tiller': tiller, 'sable': sable}
DECKS_OF = {'anvil': 'bastion', 'vesper': 'meridian', 'tiller': 'longshore', 'sable': 'halcyon'}      # (a ship of the same line has the same rooms: no more to download)
DRESS = {'bastion': dress_bastion, 'meridian': dress_meridian, 'longshore': dress_longshore, 'halcyon': lambda p, r: None}
for _k in ('anvil', 'vesper', 'tiller', 'sable'): DRESS[_k] = lambda p, r: None
def build_capital():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)
    decks = json.load(open(os.path.join(ROOT, 'assets', 'ships', 'capital.json'))); hulls = []; rooms = []; docks = {}
    for name, fn in CAPITALS.items():
        if ONLY and name not in ONLY: continue
        p = Part(); r = random.Random(name); lay = decks[DECKS_OF.get(name, name) + '_decks']; mouth = fn(p, lay, r); DRESS[name](p, r); _clear_decks(p, lay, *mouth); _hangar_block(p, lay, *mouth); docks[name] = {'x': mouth[0], 'y': mouth[1], 'z': mouth[2], 'side': mouth[3]}
        ob = finish(p, name); ob['kind'] = name; ob['dims'] = [1, 1, 1]; hulls.append(ob); print('capital', name, len(ob.data.polygons), 'faces')
        for i, q in enumerate(RING_PARTS.pop(name, [])): o2 = finish(q, f'{name}_ring{i}'); o2['kind'] = f'{name}_ring{i}'; o2['dims'] = [1, 1, 1]; hulls.append(o2); print('ring part', o2.name, len(o2.data.polygons), 'faces')
        if name in DECKS_OF: continue
        p = Part(); dress_decks(p, lay, name); ob = finish(p, name + '_decks'); ob['kind'] = name + '_decks'; ob['dims'] = [1, 1, 1]; rooms.append(ob); print('decks', name, len(ob.data.polygons), 'faces')
    if ONLY: _look(hulls + rooms); return
    json.dump(docks, open(os.path.join(ROOT, 'assets', 'ships', 'capital-docks.json'), 'w'), indent=1)
    for fname, group in (('capital.glb', hulls), ('capital-decks.glb', rooms)):
        bpy.ops.object.select_all(action='DESELECT')
        for ob in group: ob.select_set(True)
        out = os.path.join(ROOT, 'assets', fname)
        bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_materials='EXPORT', export_extras=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True)
        print('wrote', out, os.path.getsize(out) // 1024, 'KB')
