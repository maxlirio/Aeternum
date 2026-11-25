# The Harrow: the enemy's dreadnought, hull and inside built as one ship (run after capital_kit.py, whose tools it uses).
#   blender -b --factory-startup -P tools/assets/build.py -- harrow            → assets/harrow.glb, assets/decks-harrow.glb
#   HX_ONLY=hull|decks  build one of the two;  HX_LOOK=1  render out/booth/harrow*-N.png instead of writing
# A lance with a ship built round it. Two long hulls, edge down, with combs of radiator blades along their backs; aft they join in the
# engine block under the citadel; amidships the lance hangs in a drum between them, held by four arms, muzzle down through the gap. The
# heat of a firing goes out along the arms in the coolant mains to four vents in the hulls' flanks (sim/planetwar.js VENTS).
# What you walk inside is laid out by tools/gen-harrow.mjs to the same numbers: the bay in the starboard hull's flank at (510, -6, 200),
# across that hull, out along the forward starboard arm (z = 270) or the aft one (z = 130), into the drum.
HXM = (510.0, -6.0, 200.0)      # the bay's mouth, in the ship's frame (x across, y up, z stern to bow)

def _hx_clear(p, x0, y0, z0, x1, y1, z1):
    """Nothing of the hull may stand in what you walk through: faces crossing this box (ship frame) go, big ones cut fine first."""
    def hit(f):
        xs = [v.co.x for v in f.verts]; ys = [v.co.z for v in f.verts]; zs = [-v.co.y for v in f.verts]
        return not (max(xs) < x0 or min(xs) > x1 or max(ys) < y0 or min(ys) > y1 or max(zs) < z0 or min(zs) > z1), max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    for _ in range(8):
        big = [f for f in p.bm.faces if hit(f)[0] and hit(f)[1] > 2.5]
        if not big: break
        edges = list({e_ for f in big for e_ in f.edges if e_.calc_length() > 2.0})
        if not edges: break
        bmesh.ops.subdivide_edges(p.bm, edges=edges, cuts=1, use_grid_fill=True)
    gone = [f for f in p.bm.faces if hit(f)[0]]
    bmesh.ops.delete(p.bm, geom=gone, context='FACES'); print('hx cleared', len(gone))

def harrow(p, r):
    # ---- the two hulls: tall blades, a keel fin under each, a comb of radiator blades along the back
    for sx in (-1, 1):
        X = sx * 400
        secs = [(-960, -40, 138, X, 100, 3.0), (-760, -40, 160, X, 110, 3.4), (-400, -40, 160, X, 110, 3.4), (0, -40, 160, X, 110, 3.4), (400, -40, 160, X, 110, 3.4), (760, -40, 160, X, 110, 3.4), (1150, -40, 150, X, 84, 3.0), (1450, -44, 150, X, 40, 2.6), (1640, -50, 158, X, 9, 2.2), (1700, -54, 150, X, 1.2, 2)]
        add_loft(p, smooth_secs(secs, 5), 'tint', 96, axis='z')
        add_loft(p, smooth_secs([(-840, -212, 5, X, 3, 2), (-700, -226, 44, X, 15, 2.2), (300, -230, 50, X, 17, 2.2), (1150, -214, 40, X, 13, 2.2), (1400, -196, 5, X, 3, 2)], 4), 'heatshield', 20, axis='z')
        z = -640
        while z < 1090:
            add_box(p, X - 72, 100, z, X + 72, 152, z + 2.6, 'heatshield', 0); z += 30
        add_box(p, X - 5, 104, -652, X + 5, 158, 1100, 'metal', 0)
        for dx in (-60, 60): add_cyl(p, X + dx, 150, -650, 1098, 2.2, 'metal', 10, axis='z')
        # its guns: a triple turret aft and forward on the back, a twin under the turn of the bilge
        _turret(p, X, 112, -790, 34, 1, 3); _turret(p, X, 104, 1180, 26, 1, 3); _turret(p, sx * 330, -186, 500, 22, -1, 2)
        # the outer flank: decks of light, the two vents in their housings, boat pods; the inner flank: the coolant mains from the arms to the vents
        o = sx * 509.2
        for (a, b) in ((-700, -450), (-350, 170), (232, 740), (860, 1060)): _lit_bands(p, o, -100, 20, a, b, 5, sx, max(3, int((b - a) / 70)), r)
        for vz in (-400, 800):
            add_cyl(p, -40, vz, min(o - sx * 6, o + sx * 9), max(o - sx * 6, o + sx * 9), 36, 'heatshield', 40, axis='x')
            add_cyl(p, -40, vz, min(o + sx * 6, o + sx * 12), max(o + sx * 6, o + sx * 12), 31, 'metal', 40, axis='x', r2=31)
            for k in range(12):
                a = 2 * math.pi * k / 12; c, s = math.cos(a), math.sin(a)
                _beam(p, (o + sx * 4, -40 + c * 38, vz + s * 38), (o + sx * 4, -40 + c * 58, vz + s * 58), 5, 'paint')
            for (a, b) in ((-66, -58), (58, 66)): add_box(p, min(o, o + sx * 5), -40 + a, vz - 70, max(o, o + sx * 5), -40 + b, vz + 70, 'paint', 0)
        _pods(p, sx * 506, 62, -600, 600, 40, 5, sx)
        i = sx * 290
        _pipes(p, r, i - sx * 4, -30, -420, 820, 3, 12, 4.2, -sx)
        _lit_bands(p, i - sx * 0.6, -110, -50, -700, 60, 2, -sx, 8, r); _lit_bands(p, i - sx * 0.6, -110, -50, 340, 900, 2, -sx, 8, r)
        # the four arms: box girders from the hulls to the drum, slit windows down their sides, the coolant mains on their backs, bracing above and below
        for zc in (130, 270):
            a, b = sorted((sx * 112, sx * 296)); add_box(p, a, -34, zc - 20, b, 24, zc + 20, 'tint', 0)
            for zz in (zc - 20.15, zc + 20.0): add_box(p, a + 14, -3.9, zz, b - 10, -2.6, zz + 0.15, 'visor', 0)
            for dz in (-10, 10): add_cyl(p, 29, zc + dz, a - 4, b + 2, 5, 'metal', 16, axis='x')
            for k in range(7):
                xx = a + (b - a) * (k + 0.5) / 7
                add_box(p, xx - 2, -36, zc - 22, xx + 2, 26, zc + 22, 'paint', 0)
            _beam(p, (sx * 126, 24, zc), (sx * 300, 96, zc), 9, 'metal'); _beam(p, (sx * 126, -34, zc), (sx * 300, -120, zc), 9, 'metal')
            _beam(p, (sx * 118, 24, zc), (sx * 60, 96, 200 + (zc - 200) * 0.6), 7, 'metal')
        _beam(p, (sx * 128, -5, 150), (sx * 290, -5, 250), 7, 'metal'); _beam(p, (sx * 128, -5, 250), (sx * 290, -5, 150), 7, 'metal')
    # ---- the engine block joining them aft, five great drives and two trimmers
    add_loft(p, smooth_secs([(-1670, -20, 118, 0, 410, 3.2), (-1570, -20, 164, 0, 498, 3.6), (-1300, -20, 170, 0, 512, 3.8), (-1000, -20, 170, 0, 512, 3.8), (-905, -20, 150, 0, 505, 3.4)], 5), 'tint', 120, axis='z')
    for (x, y, R) in ((-380, -20, 68), (-190, -20, 82), (0, -20, 94), (190, -20, 82), (380, -20, 68), (-285, 96, 38), (285, 96, 38)): _engine(p, x, y, -1790, -1668, R)
    for sx in (-1, 1): _lit_bands(p, sx * 511, -90, 60, -1520, -1000, 6, sx, 8, r); _vents(p, sx * 509, -140, -1500, -1000, 40, 24, sx)
    # the citadel on the block's back, its bridge looking forward down the gap at the lance
    _taper(p, -170, 170, -1520, -1040, 146, 226, 22, 34, 'tint'); _taper(p, -100, 100, -1440, -1090, 226, 296, 14, 30, 'paint'); _bridgeglass(p, -84, 84, -1408, -1122, 296, 312, 3, 8)
    for sx in (-1, 1): _lit_bands(p, sx * 160, 156, 220, -1490, -1070, 4, sx, 6, r); _phased(p, sx * 94, 236, 288, -1330, -1210, sx)
    _mast(p, 0, 313, -1300, 96, 5); _mast(p, -60, 313, -1180, 50, 3); _turret(p, 0, 226, -1065, 20, 1, 2)
    # a yoke forward of the block: two buttresses reaching up the hulls' inner shoulders
    for sx in (-1, 1): add_loft(p, smooth_secs([(-910, -30, 120, sx * 250, 60, 3), (-800, -34, 96, sx * 262, 40, 2.6), (-640, -38, 50, sx * 280, 14, 2.2), (-560, -40, 6, sx * 288, 2, 2)], 4), 'tint', 32, axis='z')
    # the lance's ring: a great hoop round the drum from hull to hull, that the arms cross and the drum hangs in
    _hring(p, 0, -5, 200, 268, 15, 'tint', 128, 12); _hring(p, 0, -5, 200, 268, 17.5, 'paint', 128, 6)
    for k in range(24):
        a = 2 * math.pi * (k + 0.5) / 24; c, s = math.cos(a), math.sin(a)
        if abs(s * 268) < 95 : continue
        _beam(p, (c * 132, 60, 200 + s * 132), (c * 262, 2, 200 + s * 262), 6, 'metal'); _beam(p, (c * 132, -150, 200 + s * 132), (c * 262, -12, 200 + s * 262), 6, 'metal')
    # ---- the drum and the lance in it: hooped and ribbed, the capacitor crown on top, the muzzle hanging under
    add_cyl(p, 0, 200, -200, 100, 130, 'tint', 96)
    for y in (-184, -112, -40, 32, 92): add_cyl(p, 0, 200, y - 4, y + 4, 134, 'paint', 96)
    for k in range(32):
        a = 2 * math.pi * (k + 0.5) / 32; c, s = math.cos(a), math.sin(a)
        _beam(p, (c * 132.5, -198, 200 + s * 132.5), (c * 132.5, 98, 200 + s * 132.5), 5, 'metal')
    add_cyl(p, 0, 200, 100, 120, 124, 'heatshield', 72, r2=100)
    for k in range(12):
        a = 2 * math.pi * k / 12; c, s = math.cos(a), math.sin(a)
        add_cyl(p, c * 82, 200 + s * 82, 118, 172, 14, 'paint', 24); add_cyl(p, c * 82, 200 + s * 82, 172, 178, 10, 'metal', 20); add_cyl(p, c * 82, 200 + s * 82, 140, 146, 15, 'metal', 24)
        _beam(p, (c * 82, 176, 200 + s * 82), (c * 30, 196, 200 + s * 30), 3, 'metal')
    _sphere(p, 0, 150, 200, 50, 'tint', 40, 18); _hring(p, 0, 176, 200, 82, 3, 'metal', 72, 8); _mast(p, 0, 198, 200, 60, 4)
    add_cyl(p, 0, 200, -246, -200, 84, 'heatshield', 72, r2=130); add_cyl(p, 0, 200, -302, -246, 40, 'metal', 48); add_cyl(p, 0, 200, -308, -296, 50, 'heatshield', 48); add_cyl(p, 0, 200, -309, -307.6, 30, 'rubber', 40)
    for y in (-262, -278): _hring(p, 0, y, 200, 42, 3.4, 'paint', 48, 8)
    for k in range(8):
        a = 2 * math.pi * k / 8; c, s = math.cos(a), math.sin(a)
        _beam(p, (c * 100, -224, 200 + s * 100), (c * 50, -300, 200 + s * 50), 6, 'metal')
    # ---- the bay in the starboard flank, and the ways through hull, arm and drum that the decks run in
    _hx_clear(p, 447, -5.4, 179.4, 513, 7.4, 220.6)
    _hx_clear(p, 78, -5.2, 263.8, 294, 1.4, 276.2); _hx_clear(p, 78, -5.2, 125.8, 294, -1.2, 134.2)
    _hangar_block(p, {'W': 40, 'D': 61, 'deck': 1, 'ceiling': 13}, 510, -6, 200, 1)

# =============================================================== inside
HX_LAMP = {'red': 'navred', 'warm': 'lampwarm', 'amber': 'neonamber', 'lance': 'neonamber'}
HX_COL = {'red': (1.0, 0.2, 0.12), 'warm': (1.0, 0.86, 0.68), 'amber': (1.0, 0.6, 0.26), 'lance': (1.0, 0.7, 0.4)}
HX_FLOOR = [('heatshield', 3.0), ('metal', 2.0), ('rubber', 2.0), ('concrete', 2.0), ('rubber', 2.0), ('metal', 2.5), ('metal', 2.0), ('metal', 1.7), ('metal', 4.0)]
HX_BAY = [5.0, 5.0, 3.0, 3.0, 3.0, 5.0, 15.0, 5.5, 8.0]      # the frames' spacing in each space

def _hx_room_of(lay, x, z, y=None):
    best = None
    for R in lay['rooms']:
        x0, z0, x1, z1 = R['rect']
        if x < x0 - 0.01 or x > x1 + 0.01 or z < z0 - 0.01 or z > z1 + 0.01: continue
        if best is None or (x1 - x0) * (z1 - z0) < (best['rect'][2] - best['rect'][0]) * (best['rect'][3] - best['rect'][1]): best = R
    return best

def _hx_plates(p, x0, z0, x1, z1, y, size, mat, under='paint'):
    add_box(p, x0, y - 0.3, z0, x1, y - 0.045, z1, under, 0)
    nx = max(1, round((x1 - x0) / size)); nz = max(1, round((z1 - z0) / size)); dx = (x1 - x0) / nx; dz = (z1 - z0) / nz; g = 0.012
    for i in range(nx):
        for j in range(nz): add_box(p, x0 + i * dx + g, y - 0.045, z0 + j * dz + g, x0 + (i + 1) * dx - g, y, z0 + (j + 1) * dz - g, mat, 0)

def _hx_lining(p, lay, w, R, r):
    """One side of a space: frames standing out of it, panels between them in tiers (a dado, then plate), a kick strip, the doors left open with their frames."""
    along = w['z0'] == w['z1']; a0, a1 = (w['x0'], w['x1']) if along else (w['z0'], w['z1']); c = w['z0'] if along else w['x0']
    rx0, rz0, rx1, rz1 = R['rect']; mid = (rz0 + rz1) / 2 if along else (rx0 + rx1) / 2; n = 1 if mid > c else -1
    yb = max(R['y0'], 1) if not w.get('pit') else w['y0']; yt = R['y1'] if not w.get('pit') else w['y1'] + 0.3; i = R['i']; bay = HX_BAY[i]
    def box(u0, u1, d0, d1, y0, y1, mat):
        q0, q1 = sorted((c + n * d0, c + n * d1))
        if along: add_box(p, u0, y0, q0, u1, y1, q1, mat, 0)
        else: add_box(p, q0, y0, u0, q1, y1, u1, mat, 0)
    spans = sorted([(lay['doors'][d]['x' if along else 'z'] - lay['doors'][d]['width'] / 2, lay['doors'][d]['x' if along else 'z'] + lay['doors'][d]['width'] / 2, lay['doors'][d]) for d in w.get('doors', [])])
    # the tiers of plate up the wall
    if w.get('pit'): tiers = [(yb, yt, 'paint')]
    elif i == 6: tiers = [(yb, yb + 1.2, 'paint'), (yb + 1.2, yb + 2.4, 'mirror'), (yb + 2.4, yt, 'tint')]
    else:
        tiers = [(yb, yb + 1.3, 'paint')]; y = yb + 1.3; th = 2.6 if yt - yb < 8 else 4.4 if yt - yb < 20 else 7.2
        while y < yt - 0.05: tiers.append((y, min(yt, y + th), 'tint')); y += th
    u = a0; k = 0
    while u < a1 - 0.01:
        e = min(a1, u + bay)
        for (d0, d1, D_) in spans:      # a bay stops at a door, and the next starts past it
            if u < d0 < e: e = d0
            if d0 <= u < d1: e = None; nxt = d1; dr = D_; break
        if e is None:
            # over the door: plate down to its head; its frame: jambs, a head, a threshold strip, hazard edges
            h = yb + dr['height']
            if h < yt - 0.05: box(u, nxt, 0, 0.07, h, yt, 'paint')
            for q in (u, nxt): box(q - 0.16, q + 0.16, -0.14, 0.2, yb, h + 0.16, 'hazard' if dr['width'] > 3.5 else 'metal')
            box(u - 0.16, nxt + 0.16, -0.14, 0.2, h, h + 0.3, 'metal'); box(u, nxt, -0.14, 0.14, yb - 0.01, yb + 0.012, 'hazard')
            u = nxt; continue
        box(u, u + 0.24, 0, 0.3 if yt - yb > 8 else 0.18, yb, yt, 'metal')                      # the frame
        box(u + 0.24, e, 0, 0.1, yb, yb + 0.14, 'rubber')
        for (y0, y1, m) in tiers:
            if m == 'mirror' and (along or u >= 399): m = 'tint'
            if m == 'mirror': box(u + 0.24, e, 0.0, 0.05, y0 + 0.04, y1 - 0.04, 'mirror'); box(u + 0.24, e, 0, 0.16, y0 - 0.04, y0 + 0.04, 'metal'); box(u + 0.24, e, 0, 0.16, y1 - 0.04, y1 + 0.04, 'metal')
            else: box(u + 0.27, e - 0.03, 0, 0.07, y0 + 0.03 + (0.14 if y0 == yb else 0), y1 - 0.03, m)
        # what's on the wall between frames: now and then a conduit run, a junction box, a status strip
        if not w.get('pit') and e - u > 2 and yt - yb > 2.2:
            q = r.random()
            if q < 0.22: box(u + 0.6, u + 1.5, 0.07, 0.2, yb + 1.45, yb + 2.1, 'heatshield'); box(u + 0.7, u + 1.4, 0.2, 0.21, yb + 1.85, yb + 1.95, 'navred')
            elif q < 0.4: box(u + 0.5, e - 0.3, 0.07, 0.15, yb + 2.05, yb + 2.17, 'metal')
            elif q < 0.5 and i != 6: box(u + 0.8, u + 1.9, 0.07, 0.09, yb + 1.4, yb + 2.0, 'screen')
        u = e; k += 1
    box(a1 - 0.24, a1, 0, 0.18, yb, yt, 'metal')

def _hx_rail(p, w):
    """A rail: stanchions, two rails, a toe board. A stair's side: plate down to the floor it climbs from."""
    along = w['z0'] == w['z1']; a0, a1 = (w['x0'], w['x1']) if along else (w['z0'], w['z1']); c = w['z0'] if along else w['x0']; y0, y1 = w['y0'], w['y1']
    def box(u0, u1, d, y_0, y_1, mat):
        if along: add_box(p, u0, y_0, c - d, u1, y_1, c + d, mat, 0)
        else: add_box(p, c - d, y_0, u0, c + d, y_1, u1, mat, 0)
    if y1 - y0 > 2: box(a0, a1, 0.05, y0, y1 - 1.05, 'paint'); y0 = y1 - 1.05
    n = max(1, round((a1 - a0) / 2.0))
    for k in range(n + 1): u = a0 + (a1 - a0) * k / n; box(u - 0.03, u + 0.03, 0.03, y0, y1, 'metal')
    for yy in (0.55, 1.03): box(a0, a1, 0.025, y0 + yy - 0.025, y0 + yy + 0.025, 'metal')
    box(a0, a1, 0.012, y0, y0 + 0.12, 'paint')

def _hx_stair(p, R):
    x0, x1, z0, z1, y0, y1 = R['x0'], R['x1'], R['z0'], R['z1'], R['y0'], R['y1']; n = max(2, int(abs(y1 - y0) / 0.18)); dz = (z1 - z0) / n; dy = (y1 - y0) / n
    for k in range(n):
        ya, yb = y0 + dy * k, y0 + dy * (k + 1); top = max(ya, yb)
        add_box(p, x0 + 0.06, top - 0.04, z0 + dz * k + 0.01, x1 - 0.06, top, z0 + dz * (k + 1) - 0.01, 'metal', 0)
        add_box(p, x0 + 0.06, top - 0.18, z0 + dz * (k + (0 if dy > 0 else 1)) - 0.01, x1 - 0.06, top - 0.04, z0 + dz * (k + (0 if dy > 0 else 1)) + 0.01, 'paint', 0)
    for x in (x0, x1 - 0.06):      # the stringers, as one raking beam each side
        _beam(p, (x + 0.03, y0 - 0.2, z0), (x + 0.03, y1 - 0.2, z1), 0.24, 'paint')

def _hx_fighter(p, x, y, z0, sx, r):
    """One of their fighters stowed in its cradle, nose to the bay's mouth: a dart of a hull, a slit of canopy, swept blades of wing folded down, twin drives, the guns under the nose."""
    secs = [(z0 + 0.3, y, 0.05, x, 0.05, 2), (z0 + 1.6, y + 0.02, 0.34, x, 0.42, 2.4), (z0 + 3.6, y + 0.06, 0.52, x, 0.66, 2.6), (z0 + 6.2, y + 0.05, 0.5, x, 0.7, 2.8), (z0 + 8.2, y, 0.36, x, 0.52, 2.6)]
    add_loft(p, smooth_secs(secs, 4), 'paint', 20, axis='z')
    add_loft(p, smooth_secs([(z0 + 2.0, y + 0.3, 0.05, x, 0.1, 2), (z0 + 2.9, y + 0.5, 0.2, x, 0.3, 2), (z0 + 4.2, y + 0.52, 0.16, x, 0.26, 2), (z0 + 4.9, y + 0.44, 0.04, x, 0.08, 2)], 3), 'visor', 12, axis='z')
    for s in (-1, 1):      # the wings, folded: they hang down either side
        add_loft(p, [(x + s * 0.5, y - 0.05, 0.07, z0 + 5.0, 1.6, 2), (x + s * 0.9, y - 0.55, 0.05, z0 + 5.5, 1.25, 2), (x + s * 1.15, y - 1.3, 0.03, z0 + 6.3, 0.7, 2)], 'paint', 12, axis='x')
        add_cyl(p, x + s * 0.3, y - 0.08, z0 + 7.9, z0 + 8.7, 0.22, 'metal', 14, axis='z', r2=0.3); add_cyl(p, x + s * 0.3, y - 0.08, z0 + 8.66, z0 + 8.7, 0.2, 'rubber', 12, axis='z')
        add_cyl(p, x + s * 0.22, y - 0.34, z0 + 0.5, z0 + 2.4, 0.045, 'metal', 8, axis='z')
    add_box(p, x - 0.04, y + 0.4, z0 + 6.6, x + 0.04, y + 1.25, z0 + 8.1, 'paint', 0)      # the fin
    add_box(p, x - 0.5, y - 0.02, z0 + 3.2, x + 0.5, y + 0.0, z0 + 3.26, 'navred', 0)

HX_COUNT = {}
def _hx_flat(fn, *a):
    """Furniture from the common kit, without its rounded edges: in here it's seen by battle lamps, and there's a great deal of it."""
    global add_box
    old = add_box
    def plain(part, x0, y0, z0, x1, y1, z1, mat, bevel=0, seg=2): return old(part, x0, y0, z0, x1, y1, z1, mat, 0, seg)
    add_box = plain
    try: fn(*a)
    finally: add_box = old

def _hx_prop(p, pr, lay, r, B):
    k = pr['kind']; x0, z0, x1, z1 = pr['x0'], pr['z0'], pr['x1'], pr['z1']; y = pr.get('y', 1); h = pr['h']; xc, zc = (x0 + x1) / 2, (z0 + z1) / 2
    if k in B:
        across = pr['face'] in (0, 2); L, D = (x1 - x0, z1 - z0) if across else (z1 - z0, x1 - x0); n0 = len(p.bm.faces); _hx_flat(place_in, p, B[k], L, D, h, pr, y); HX_COUNT[k] = HX_COUNT.get(k, 0) + len(p.bm.faces) - n0; return
    n0 = len(p.bm.faces); _hx_prop2(p, pr, lay, r, B); HX_COUNT[k] = HX_COUNT.get(k, 0) + len(p.bm.faces) - n0

def _hx_prop2(p, pr, lay, r, B):
    k = pr['kind']; x0, z0, x1, z1 = pr['x0'], pr['z0'], pr['x1'], pr['z1']; y = pr.get('y', 1); h = pr['h']; xc, zc = (x0 + x1) / 2, (z0 + z1) / 2
    if k == 'bed':
        # a bunk in tiers of two: a steel frame, a thin mattress and a folded blanket on each, a kit shelf at the head
        for (yy) in (y + 0.3, y + 1.5):
            add_box(p, x0, yy, z0, x1, yy + 0.08, z1, 'metal', 0); add_box(p, x0 + 0.04, yy + 0.08, z0 + 0.04, x1 - 0.04, yy + 0.22, z1 - 0.04, 'fabric', 0.03, 2)
            lx = (x1 - x0) > (z1 - z0)
            if lx: add_box(p, x0 + 0.1, yy + 0.22, z0 + 0.12, x0 + 0.5, yy + 0.3, z1 - 0.12, 'ceramic', 0.03, 2); add_box(p, x1 - 0.7, yy + 0.22, z0 + 0.1, x1 - 0.1, yy + 0.3, z1 - 0.1, 'rubber', 0.02, 2)
            else: add_box(p, x0 + 0.12, yy + 0.22, z0 + 0.1, x1 - 0.12, yy + 0.3, z0 + 0.5, 'ceramic', 0.03, 2); add_box(p, x0 + 0.1, yy + 0.22, z1 - 0.7, x1 - 0.1, yy + 0.3, z1 - 0.1, 'rubber', 0.02, 2)
        for (xx, zz) in ((x0, z0), (x1 - 0.06, z0), (x0, z1 - 0.06), (x1 - 0.06, z1 - 0.06)): add_box(p, xx, y, zz, xx + 0.06, y + 2.0, zz + 0.06, 'metal', 0)
    elif k == 'frame':
        add_box(p, x0, y, z0, x1, y + 0.2, z1, 'metal', 0); add_box(p, x0 + 0.08, y + 0.2, z0 + 0.1, x1 - 0.08, y + h, z1 - 0.1, 'paint', 0); add_box(p, x0 - 0.1, y + h - 0.5, z0 - 0.05, x1 + 0.1, y + h, z1 + 0.05, 'metal', 0)
        fz = z1 - 0.1 if zc < 65 else z0 + 0.088; add_box(p, xc - 0.04, y + 0.6, fz, xc + 0.04, y + h - 1.0, fz + 0.012, 'navred', 0)
    elif k == 'shield':
        # a blast shield to fight from: plate on two feet, a rolled top edge, a slot to fire through
        along = (x1 - x0) > (z1 - z0); a0, a1 = (x0, x1) if along else (z0, z1); c = zc if along else xc
        def bx(u0, u1, d, y_0, y_1, m):
            if along: add_box(p, u0, y_0, c - d, u1, y_1, c + d, m, 0)
            else: add_box(p, c - d, y_0, u0, c + d, y_1, u1, m, 0)
        mid = (a0 + a1) / 2
        bx(a0, mid - 0.35, 0.05, y + 0.05, y + h, 'paint'); bx(mid + 0.35, a1, 0.05, y + 0.05, y + h, 'paint'); bx(mid - 0.35, mid + 0.35, 0.05, y + 0.05, y + h - 0.32, 'paint')
        bx(a0, a1, 0.09, y + h - 0.06, y + h, 'metal'); bx(a0, a1, 0.07, y, y + 0.12, 'hazard')
        for u in (a0 + 0.3, a1 - 0.3): bx(u - 0.08, u + 0.08, 0.45, y, y + 0.08, 'metal'); bx(u - 0.05, u + 0.05, 0.3, y + 0.08, y + 0.5, 'metal')
    elif k == 'pier':
        add_box(p, x0, y, z0, x1, y + 0.3, z1, 'metal', 0); add_box(p, x0 + 0.1, y + 0.3, z0 + 0.1, x1 - 0.1, y + h - 0.5, z1 - 0.1, 'paint', 0); add_box(p, x0 - 0.1, y + h - 0.5, z0 - 0.1, x1 + 0.1, y + h, z1 + 0.1, 'metal', 0)
        fx = x1 - 0.1 if xc < 170 else x0 + 0.09; add_box(p, fx, y + 0.7, zc - 0.05, fx + 0.012, y + h - 1.0, zc + 0.05, 'navred', 0)
        if xc < 170: _ibeam(p, (x1, y + h - 0.25, zc), (340 - x1, y + h - 0.25, zc), 0.4, 0.3, 'paint')      # (one girder across the gallery from each pair)
    elif k == 'cradle':
        left = xc < 100; wx = x0 if left else x1; fx = x0 + 2.6 if left else x1 - 2.6; yy = y + 3.1
        for zz in (z0 + 2.6, z0 + 6.4):      # two arms out of the wall, a clamp on each over the fighter's back, a strut down to the deck
            add_box(p, min(wx, fx), yy + 0.85, zz - 0.14, max(wx, fx), yy + 1.15, zz + 0.14, 'hazard', 0); add_box(p, fx - 0.75, yy + 0.5, zz - 0.1, fx + 0.75, yy + 0.86, zz + 0.1, 'metal', 0)
            for s in (-1, 1): add_box(p, fx + s * 0.75 - 0.06, yy + 0.0, zz - 0.1, fx + s * 0.75 + 0.06, yy + 0.6, zz + 0.1, 'metal', 0)
            sx_ = wx + (0.25 if left else -0.25); _beam(p, (sx_, y, zz), (sx_, yy + 0.9, zz), 0.2, 'paint'); _beam(p, (sx_, y + 0.2, zz), (fx, yy + 0.9, zz), 0.12, 'metal')
        _hx_fighter(p, fx, yy, z0 + 0.2, 1 if left else -1, r)
        # the launch rail under it, and its fuelling point on the wall
        add_box(p, fx - 0.1, y, z0, fx + 0.1, y + 0.08, z1, 'hazard', 0)
        add_box(p, wx + (0.02 if left else -0.42), y + 0.4, z0 + 4.2, wx + (0.42 if left else -0.02), y + 1.9, z0 + 5.0, 'paint', 0); add_cyl(p, wx + (0.5 if left else -0.5), z0 + 4.6, y + 0.5, y + 1.4, 0.07, 'navred', 10)
    elif k == 'bowser':
        add_cyl(p, y + 1.15, zc, x0 + 0.5, x1 - 0.3, 0.72, 'paint', 24, axis='x'); add_box(p, x0 + 0.2, y + 0.3, zc - 0.7, x1 - 0.2, y + 0.5, zc + 0.7, 'metal', 0)
        for xx in (x0 + 1.0, x1 - 1.0):
            for s in (-1, 1): add_cyl(p, xx, y + 0.3, zc + s * 0.85 - 0.12, zc + s * 0.85 + 0.12, 0.3, 'rubber', 16, axis='z')
        add_box(p, x0, y + 0.5, zc - 0.5, x0 + 0.5, y + 1.3, zc + 0.5, 'hazard', 0); add_cyl(p, x1 - 0.8, zc, y + 1.85, y + 1.95, 0.25, 'metal', 14)
    elif k == 'exchanger':
        # a stack: a frame holding a core of plates on edge, headers top and bottom, the coolant in from the main overhead and out by the floor
        add_box(p, x0, y, z0, x1, y + 0.4, z1, 'paint', 0); add_box(p, x0, y + h - 0.5, z0, x1, y + h, z1, 'paint', 0)
        for (xx, zz) in ((x0, z0), (x1 - 0.4, z0), (x0, z1 - 0.4), (x1 - 0.4, z1 - 0.4)): add_box(p, xx, y + 0.4, zz, xx + 0.4, y + h - 0.5, zz + 0.4, 'paint', 0)
        n = int((z1 - z0 - 1.0) / 0.34)
        for q in range(n): zz = z0 + 0.5 + q * (z1 - z0 - 1.0) / n; add_box(p, x0 + 0.45, y + 0.5, zz, x1 - 0.45, y + h - 0.6, zz + 0.09, 'metal', 0)
        for yy in (y + 1.3, y + h - 1.4): add_cyl(p, yy, z0 + 0.1, x0 + 0.5, x1 - 0.5, 0.55, 'heatshield', 16, axis='x'); add_cyl(p, yy, z1 - 0.1, x0 + 0.5, x1 - 0.5, 0.55, 'heatshield', 16, axis='x')
        add_cyl(p, xc, zc, y + h, 13.0, 0.6, 'metal', 16); add_cyl(p, xc, zc, y + h + 0.6, y + h + 0.8, 0.8, 'paint', 16)
        add_box(p, x0 + 1.2, y + 1.6, z0 - 0.03, x0 + 2.6, y + 2.5, z0, 'heatshield', 0); add_box(p, x0 + 1.4, y + 2.0, z0 - 0.04, x0 + 2.4, y + 2.3, z0 - 0.03, 'screen', 0)
        add_box(p, x0, y + h * 0.5 - 0.15, z0 - 0.02, x1, y + h * 0.5 + 0.15, z0, 'hazard', 0)
    elif k == 'pump':
        add_box(p, x0, y, z0, x1, y + 0.25, z1, 'paint', 0); add_cyl(p, y + 0.75, zc, x0 + 0.2, x0 + 1.5, 0.46, 'paint', 20, axis='x')
        for q in range(6): add_cyl(p, y + 0.75, zc, x0 + 0.3 + q * 0.2, x0 + 0.36 + q * 0.2, 0.5, 'metal', 20, axis='x')
        add_cyl(p, y + 0.75, zc, x0 + 1.7, x1 - 0.3, 0.6, 'metal', 24, axis='x'); add_cyl(p, y + 0.75, zc, x0 + 1.5, x0 + 1.7, 0.2, 'metal', 12, axis='x'); add_cyl(p, x1 - 0.7, zc, y + 0.9, y + 1.3, 0.22, 'heatshield', 14)
        add_box(p, x1 - 0.32, y + 0.25, zc - 0.3, x1 - 0.08, y + 1.15, zc + 0.3, 'heatshield', 0)
    elif k == 'main':
        # a coolant main: two great pipes one over the other, flanged every six metres, on saddles; lagging on the upper one
        for (yy, m) in ((y + 1.05, 'metal'), (y + 3.2, 'paint')):
            add_cyl(p, xc, yy, z0, z1, 0.92, m, 20, axis='z'); zz = z0 + 3
            while zz < z1: add_cyl(p, xc, yy, zz, zz + 0.14, 1.03, 'heatshield', 20, axis='z'); zz += 6
        zz = z0 + 6
        while zz < z1: add_box(p, x0, y, zz - 0.15, x1, y + 0.4, zz + 0.15, 'paint', 0); add_box(p, xc - 0.12, y + 0.4, zz - 0.12, xc + 0.12, y + 4.25, zz + 0.12, 'metal', 0); zz += 12
    elif k == 'valve':
        left = xc < 30; add_box(p, x0, y, z0, x1, y + 1.0, z1, 'paint', 0); add_cyl(p, xc, zc, y + 1.0, y + 1.3, 0.12, 'metal', 10); add_cyl(p, xc, zc, y + 1.3, y + 1.36, 0.42, 'navred', 20); add_cyl(p, xc, zc, y + 1.28, y + 1.38, 0.3, 'paint', 16)
        add_box(p, x0 + 0.1, y + 0.5, z0 - 0.02, x1 - 0.1, y + 0.8, z0, 'hazard', 0)
    elif k == 'header':
        add_box(p, x0, y, z0, x1, y + 0.3, z1, 'paint', 0)
        for q in range(4): zz = z0 + 1.6 + q * (z1 - z0 - 3.2) / 3; add_cyl(p, xc, zz, y + 0.3, y + h, 1.1, 'metal', 20); add_cyl(p, xc, zz, y + 2.2, y + 2.4, 1.25, 'heatshield', 20); add_cyl(p, xc, zz, y + h, y + h + 4.0, 0.7, 'paint', 16)
        add_cyl(p, xc, y + 1.3, z0 + 1.0, z1 - 1.0, 0.6, 'heatshield', 16, axis='z')
    elif k == 'capacitor':
        add_box(p, x0, y, z0, x1, y + 0.35, z1, 'paint', 0)
        for (xx, zz) in ((x0 + 2, z0 + 1.6), (x1 - 2, z0 + 1.6), (x0 + 2, zc), (x1 - 2, zc), (x0 + 2, z1 - 1.6), (x1 - 2, z1 - 1.6)):
            add_cyl(p, xx, zz, y + 0.35, y + h - 1.0, 1.25, 'heatshield', 20); add_cyl(p, xx, zz, y + h - 1.0, y + h - 0.6, 0.7, 'ceramic', 16); add_cyl(p, xx, zz, y + h - 0.6, y + h - 0.3, 0.3, 'metal', 12)
            for q in range(3): add_cyl(p, xx, zz, y + 1.2 + q * 1.9, y + 1.36 + q * 1.9, 1.32, 'metal', 20)
        for xx in (x0 + 2, x1 - 2): add_box(p, xx - 0.12, y + h - 0.34, z0 + 1.6, xx + 0.12, y + h - 0.22, z1 - 1.6, 'neonamber', 0)
        add_box(p, x0 + 2, y + h - 0.34, zc - 0.12, x1 - 2, y + h - 0.22, zc + 0.12, 'metal', 0)
        add_box(p, x0 + 0.1, y + 0.35, z0 + 0.1, x0 + 0.3, y + h - 1.4, z0 + 0.3, 'paint', 0); add_box(p, x1 - 0.3, y + 0.35, z1 - 0.3, x1 - 0.1, y + h - 1.4, z1 - 0.1, 'paint', 0)
    elif k == 'pylon':
        add_box(p, x0, y, z0, x1, y + 0.5, z1, 'metal', 0); add_box(p, x0 + 0.5, y + 0.5, z0 + 0.5, x1 - 0.5, y + h - 0.6, z1 - 0.5, 'paint', 0); add_box(p, x0 - 0.3, y + h - 0.6, z0 - 0.3, x1 + 0.3, y + h - 0.3, z1 + 0.3, 'metal', 0)
    elif k == 'barrel':
        # the lance: its barrel up through the hall, jacketed, banded, ported (the light of it shows through the ports); the collar where the bridges meet it;
        # the coolant junction on its after face, where the mains from both arms come together
        R0 = 11.6
        add_cyl(p, xc, zc, y, y + 2.5, R0 + 3.4, 'paint', 48, r2=R0 + 1.2); add_cyl(p, xc, zc, y + 2.5, y + h, R0, 'heatshield', 64)
        for yy in (y + 6, y + 9.2, y + 13.5, y + 22, y + 30, y + 38, y + 46, y + 52):
            add_cyl(p, xc, zc, yy, yy + 0.7, R0 + 0.5, 'metal', 64)
        for q in range(16):
            a = 2 * math.pi * (q + 0.5) / 16; c, s = math.cos(a), math.sin(a)
            _beam(p, (xc + c * (R0 + 0.35), y + 2.5, zc + s * (R0 + 0.35)), (xc + c * (R0 + 0.35), y + h, zc + s * (R0 + 0.35)), 0.5, 'paint')
            for (ya, yb) in ((y + 14.6, y + 21.4), (y + 23.2, y + 29.4), (y + 31.2, y + 37.4)):      # the ports
                a2 = 2 * math.pi * q / 16; c2, s2 = math.cos(a2), math.sin(a2)
                _beam(p, (xc + c2 * (R0 + 0.06), ya, zc + s2 * (R0 + 0.06)), (xc + c2 * (R0 + 0.06), yb, zc + s2 * (R0 + 0.06)), 1.1, 'neonamber')
        add_cyl(p, xc, zc, y + 9.9, y + 10.4, R0 + 2.2, 'metal', 48); add_cyl(p, xc, zc, y + 10.4, y + 11.2, R0 + 0.9, 'hazard', 48)
        # the junction, on the face toward the bay: a manifold block with the four mains into it, valves, a gauge panel
        jz = zc - R0
        add_box(p, xc - 3.2, y + 10.05, jz - 1.3, xc + 3.2, y + 13.0, jz + 0.6, 'paint', 0); add_box(p, xc - 3.3, y + 12.4, jz - 1.36, xc + 3.3, y + 12.7, jz - 1.3, 'hazard', 0)
        for dx in (-2.3, -0.8, 0.8, 2.3):
            add_cyl(p, xc + dx, jz - 0.5, y + 13.0, y + 19.0, 0.5, 'metal', 16); add_cyl(p, xc + dx, jz - 0.5, y + 14.2, y + 14.5, 0.66, 'heatshield', 16); add_cyl(p, xc + dx, y + 11.4, jz - 1.62, jz - 1.3, 0.3, 'navred', 16, axis='z')
        add_box(p, xc - 1.2, y + 11.9, jz - 1.34, xc + 1.2, y + 12.3, jz - 1.3, 'screen', 0)
    else: print('hx: no builder for', k)

def _hx_light(p, L):
    x, y, z = L['p']; m = HX_LAMP[L['col']]
    if L['col'] == 'lance': return
    if y < 6.2 or L['R'] < 7:       # a strip against a low deck-head
        add_box(p, x - 0.9, y + 0.02, z - 0.14, x + 0.9, y + 0.14, z + 0.14, 'metal', 0); add_box(p, x - 0.82, y - 0.02, z - 0.09, x + 0.82, y + 0.02, z + 0.09, m, 0)
    else:                            # a floodlight on a drop rod under a high roof
        add_cyl(p, x, z, y + 0.5, y + 2.4, 0.05, 'metal', 8); add_cyl(p, x, z, y, y + 0.5, 0.55, 'paint', 20, r2=0.25); add_cyl(p, x, z, y - 0.03, y, 0.5, m, 20)

def harrow_decks(p, lay):
    r = random.Random('harrow-in'); rooms = lay['rooms']
    B = {'counter': counter, 'locker': lambda q, L, D, H, r_: cabinet(q, L, D, H, r_, 'locker'), 'crate': crate, 'table': table, 'bench': bench, 'rack': lambda q, L, D, H, r_: shelf(q, L, D, H, r_, 'rack'), 'console': console}
    # the decks: plates on a sub-deck; the deck-heads
    for S in lay['slabs']:
        for (x0, z0, x1, z1) in S['rects']:
            R = _hx_room_of(lay, (x0 + x1) / 2, (z0 + z1) / 2)
            if S.get('roof'): add_box(p, x0, S['y'] - 0.2, z0, x1, S['y'] + 0.1, z1, 'heatshield', 0); continue
            mat, size = HX_FLOOR[R['i']]
            if R['i'] == 8 and S['y'] < 0: mat, size = 'concrete', 4.0
            if S['y'] == 7: mat, size = 'metal', 2.0
            _hx_plates(p, x0, z0, x1, z1, S['y'], size, mat)
    for w in lay['walls']:
        if w.get('rail'): _hx_rail(p, w)
        elif w.get('pit'): _hx_lining(p, lay, w, rooms[8], r)
        else: _hx_lining(p, lay, w, rooms[w['room']], r)
    for R in lay['ramps']: _hx_stair(p, R)
    for pr in lay['props']: _hx_prop(p, pr, lay, r, B)
    print('hx props', sorted(HX_COUNT.items(), key=lambda q: -q[1])); n0 = len(p.bm.faces)
    for L in lay['lights']: _hx_light(p, L)
    print('hx total so far', len(p.bm.faces))
    # ---- the bay: a vault of box girders, the landing box painted on the deck, the mouth's frame
    x0, z0, x1, z1 = rooms[0]['rect']; top = rooms[0]['y1']; z = z0 + 2.5
    while z < z1:
        _ibeam(p, (x0, top - 0.4, z), (x1, top - 0.4, z), 0.8, 0.5, 'paint'); z += 5
    for x in (x0 + 8, 100, x1 - 8): _ibeam(p, (x, top - 0.35, z0 + 0.3), (x, top - 0.35, z1 - 0.3), 0.6, 0.36, 'paint')
    for (a, b, c, d) in ((87, 9, 113, 9.3), (87, 33, 113, 33.3), (87, 9, 87.3, 33), (112.7, 9, 113, 33), (99.85, 1.2, 100.15, 9)): add_box(p, a, 1.0, b, c, 1.005, d, 'hazard', 0)
    for x in (85.4, 114.1): add_box(p, x, 1, 1.02, x + 0.5, 7.6, 1.5, 'hazard', 0)
    add_box(p, 85.4, 7.6, 1.02, 114.6, 8.1, 1.5, 'hazard', 0)
    for (x, sx) in ((x0 + 0.5, 1), (x1 - 0.5, -1)):      # fuel and coolant lines along the bay's walls, high up
        for (yy, R_, m) in ((9.6, 0.22, 'metal'), (9.0, 0.14, 'hazard'), (8.6, 0.1, 'paint')): add_cyl(p, x, yy, z0 + 0.4, z1 - 0.4, R_, m, 12, axis='z')
    # ---- the spine way: its roof beams, the cable trays, the blast doors shut across it fore and aft
    x0, z0, x1, z1 = rooms[1]['rect']; x = x0 + 5
    while x < x1: _ibeam(p, (x, 5.8, z0), (x, 5.8, z1), 0.36, 0.3, 'paint'); x += 10
    for zz in (z0 + 0.5, z1 - 0.5): add_box(p, x0 + 0.3, 5.2, zz - 0.2, x1 - 0.3, 5.26, zz + 0.2, 'metal', 0); add_cyl(p, 5.34, zz, x0 + 0.3, x1 - 0.3, 0.06, 'rubber', 8, axis='x'); add_cyl(p, 5.34, zz + 0.1, x0 + 0.3, x1 - 0.3, 0.04, 'hazard', 8, axis='x')
    for (xx, n) in ((x0 + 0.1, 1), (x1 - 0.1, -1)):
        a, b = sorted((xx, xx + n * 0.25)); add_box(p, a, 1, z0 + 0.6, b, 5.4, 64.96, 'paint', 0); add_box(p, a, 1, 65.04, b, 5.4, z1 - 0.6, 'paint', 0)
        a, b = sorted((xx + n * 0.25, xx + n * 0.3))
        for yy in (1.5, 3.0, 4.5): add_box(p, a, yy, z0 + 0.8, b, yy + 0.35, z1 - 0.8, 'hazard', 0)
        add_box(p, a, 2.2, 64.4, b, 2.8, 65.6, 'navred', 0)
    # ---- the rooms men live in: a lowered deck-head with its strip lights' troughs
    for i in (2, 3, 4):
        x0, z0, x1, z1 = rooms[i]['rect']; z = z0 + 1.5
        while z < z1: add_box(p, x0, 4.4, z - 0.1, x1, 4.6, z + 0.1, 'paint', 0); z += 3
    # ---- the heat exchange hall: the two mains down it under the roof from the arm, girders across, the catwalk's brackets
    x0, z0, x1, z1 = rooms[5]['rect']; z = z0 + 2.5
    while z < z1: _ibeam(p, (x0, 14.5, z), (x1, 14.5, z), 0.9, 0.5, 'paint'); z += 5
    for x in (160, 179.8): add_cyl(p, x, 13.0, z0 + 0.2, z1 - 0.2, 1.2, 'metal', 24, axis='z')
    for x in (160, 179.8):
        z = z0 + 5
        while z < z1: add_cyl(p, x, 13.0, z, z + 0.2, 1.36, 'heatshield', 24, axis='z'); _beam(p, (x, 14.2, z + 0.1), (x, 15, z + 0.1), 0.12, 'metal'); z += 7.5
    z = 92
    while z < 214: _beam(p, (190, 5.2, z), (184.2, 6.85, z), 0.16, 'metal'); _ibeam(p, (184, 6.8, z), (190, 6.8, z), 0.24, 0.16, 'paint'); z += 4
    # ---- the forward arm: the power bus overhead (three bars on insulators), a cable trench's cover down the middle
    x0, z0, x1, z1 = rooms[6]['rect']
    for dx in (-1.6, 0, 1.6):
        add_box(p, 170 + dx - 0.18, 6.1, z0 + 0.5, 170 + dx + 0.18, 6.34, z1 - 0.5, 'neonamber' if dx == 0 else 'metal', 0); z = z0 + 3
        while z < z1: add_cyl(p, 170 + dx, z, 6.34, 6.86, 0.12, 'ceramic', 10); z += 7.5
    z = z0 + 7.5
    while z < z1: _ibeam(p, (x0, 6.9, z), (x1, 6.9, z), 0.26, 0.24, 'paint'); z += 15
    # ---- the coolant run: hoops round the mains' pair, the walkway's grating edges
    x0, z0, x1, z1 = rooms[7]['rect']; z = z0 + 5.5
    while z < z1: add_box(p, x0, 4.3, z - 0.12, x1, 4.5, z + 0.12, 'paint', 0); z += 5.5
    # ---- the lance hall: a grid of deep girders under its roof, the barrel through the middle of them; the gallery's and the bridges' steelwork underneath
    for q in range(1, 8):
        u = 20 + q * 20
        if abs(u - 100) > 1: _ibeam(p, (u, 43.8, 430.3), (u, 43.8, 589.7), 2.4, 0.9, 'paint'); _ibeam(p, (20.3, 43.8, 410 + u), (179.7, 43.8, 410 + u), 2.4, 0.9, 'paint')
    for (a, b) in ((20.3, 86), (114, 179.7)): _ibeam(p, (a, 43.8, 510), (b, 43.8, 510), 2.4, 0.9, 'paint'); _ibeam(p, (100, 43.8, 410 + a), (100, 43.8, 410 + b), 2.4, 0.9, 'paint')
    for zz in (460, 480, 500, 520, 540, 560):      # brackets under the gallery's inner edge
        _beam(p, (44.2, -4, zz), (48, 0.6, zz), 0.3, 'paint') if not (466 <= zz <= 506) else None; _beam(p, (155.8, -4, zz), (152, 0.6, zz), 0.3, 'paint') if not (514 <= zz <= 554) else None
    for xx in (60, 80, 120, 140): _beam(p, (xx, -4, 454.2), (xx, 0.6, 458), 0.3, 'paint'); _beam(p, (xx, -4, 565.8), (xx, 0.6, 562), 0.3, 'paint')
    for (za, zb) in ((454, 492), (528, 566)):
        for x in (96.3, 103.7): _ibeam(p, (x, 0.3, za), (x, 0.3, zb), 0.8, 0.3, 'paint')
    # the mains coming in from the arms, round the gallery under the roof to the barrel's junction
    for (x, za) in ((177.6, 438), (22.4, 438)):
        add_cyl(p, x, 10.2, 430.3, za + 8, 0.7, 'metal', 16, axis='z')
    add_cyl(p, 10.2, 437.5, 22.4, 99.2, 0.7, 'metal', 16, axis='x'); add_cyl(p, 10.2, 437.5, 100.8, 177.6, 0.7, 'metal', 16, axis='x')
    for x in (99.2, 100.8): add_cyl(p, x, 10.2, 437.5, 497, 0.5, 'metal', 14, axis='z')

def _hx_bake(me, lay):
    """The light of the place, worked out here and kept in the model (a colour at every corner of every face): each space lit by its own fittings, falling off
    with distance, more on what faces the light; the bay also by the day coming in at its mouth. Kept as the square root of a quarter of it (render/capital.js undoes that)."""
    nl = len(me.loops); vi = np.empty(nl, np.int32); me.loops.foreach_get('vertex_index', vi)
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    npoly = len(me.polygons); pn = np.empty(npoly * 3, np.float32); me.polygons.foreach_get('normal', pn); pn = pn.reshape(-1, 3)
    pc = np.empty(npoly * 3, np.float32); me.polygons.foreach_get('center', pc); pc = pc.reshape(-1, 3); lt = np.empty(npoly, np.int32); me.polygons.foreach_get('loop_total', lt)
    lp = np.repeat(np.arange(npoly), lt)
    tol = lambda a: np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1)
    Pp = tol(co)[vi]; Nn = tol(pn)[lp]; C = tol(pc)
    room = np.full(npoly, -1, np.int32); area = np.full(npoly, 1e12, np.float32)
    for R in lay['rooms']:
        x0, z0, x1, z1 = R['rect']; m = (C[:, 0] > x0 - 0.36) & (C[:, 0] < x1 + 0.36) & (C[:, 2] > z0 - 0.36) & (C[:, 2] < z1 + 0.36) & (C[:, 1] > R['y0'] - 0.8) & (C[:, 1] < R['y1'] + 0.8); a = (x1 - x0) * (z1 - z0)
        m &= a < area; room[m] = R['i']; area[m] = a
    rl = room[lp]; out = np.zeros((nl, 3), np.float32)
    AMB = {0: (0.05, 0.045, 0.05), 8: (0.07, 0.05, 0.04)}
    for R in lay['rooms']:
        m = rl == R['i']
        if not m.any(): continue
        Pm = Pp[m]; Nm = Nn[m]; E = np.tile(np.array(AMB.get(R['i'], (0.045, 0.035, 0.035)), np.float32), (len(Pm), 1))
        for L in lay['lights']:
            if L['room'] != R['i']: continue
            d = np.array(L['p'], np.float32)[None, :] - Pm; dist = np.sqrt((d * d).sum(1)) + 1e-3; ndl = (Nm * d).sum(1) / dist
            w = L['I'] * (0.3 + 0.7 * np.clip(ndl, 0, 1)) / (1 + (dist / L['R']) ** 2) ** 2
            E += w[:, None] * np.array(HX_COL[L['col']], np.float32)[None, :] * 1.5
        if R['i'] == 0:
            t = np.clip((Pm[:, 2] - 2) / 46, 0, 1); day = (1 - t * t * (3 - 2 * t)) * 1.1 * (0.45 + 0.55 * np.clip(-Nm[:, 2] * 0.6 + Nm[:, 1] * 0.5 + 0.4, 0, 1)); E += day[:, None] * np.array((0.72, 0.84, 1.0), np.float32)[None, :]
        out[m] = E
    out[rl < 0] = (0.05, 0.045, 0.045)
    enc = np.sqrt(np.clip(out / 4.0, 0, 1)); rgba = np.concatenate([enc, np.ones((nl, 1), np.float32)], 1)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); ca.data.foreach_set('color', rgba.ravel()); me.color_attributes.active_color = ca; me.color_attributes.render_color_index = 0
    print('hx baked', nl, 'corners;', int((rl < 0).sum()), 'in no space')

def build_harrow():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)
    lay = json.load(open(os.path.join(ROOT, 'assets', 'ships', 'harrow.json')))['harrow_decks']; what = os.environ.get('HX_ONLY', 'hull,decks'); obs = []
    if 'hull' in what:
        p = Part(); harrow(p, random.Random('harrow')); ob = finish(p, 'harrow'); ob['kind'] = 'harrow'; ob['dims'] = [1, 1, 1]; obs.append(ob); print('harrow', len(ob.data.polygons), 'faces')
    if 'decks' in what:
        p = Part(); harrow_decks(p, lay); ob = finish(p, 'harrow_decks'); ob['kind'] = 'harrow_decks'; ob['dims'] = [1, 1, 1]; _hx_bake(ob.data, lay); obs.append(ob); print('harrow decks', len(ob.data.polygons), 'faces')
    if os.environ.get('HX_LOOK'): _look(obs); return
    for ob in obs:
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); out = os.path.join(ROOT, 'assets', 'harrow.glb' if ob.name == 'harrow' else 'decks-harrow.glb')
        kw = dict(filepath=out, export_format='GLB', use_selection=True, export_materials='EXPORT', export_extras=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True)
        if ob.name != 'harrow': kw['export_vertex_color'] = 'ACTIVE'; kw['export_active_vertex_color_when_no_material'] = True
        try: bpy.ops.export_scene.gltf(**kw)
        except TypeError as e_: print('export options:', e_); kw.pop('export_active_vertex_color_when_no_material', None); bpy.ops.export_scene.gltf(**kw)
        print('wrote', out, os.path.getsize(out) // 1024, 'KB')
