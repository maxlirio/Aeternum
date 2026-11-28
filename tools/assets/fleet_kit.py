# The insides of the fleet's great ships, built from their layouts (tools/gen-capital.mjs): each a hangar the width of its docking block, the
# working decks behind, an upper deck with its gallery and its bridge. Run inside build.py after capital_kit.py and harrow_kit.py's helpers
# (exec'd into its namespace). Everything is made of its parts: plates on a sub-deck, panels between frames, treads on stringers, glass in mullions.

FL_COL = {'warm': (1.0, 0.86, 0.68), 'cool': (0.78, 0.88, 1.0), 'red': (1.0, 0.24, 0.16), 'amber': (1.0, 0.68, 0.34), 'cyan': (0.42, 0.88, 1.0), 'day': (0.94, 0.97, 1.0), 'gold': (1.0, 0.8, 0.52)}
FL_LAMP = {'warm': 'lampwarm', 'cool': 'navwhite', 'red': 'navred', 'amber': 'neonamber', 'cyan': 'neoncyan', 'day': 'navwhite', 'gold': 'lampwarm'}
# what each kind of ship is made of inside: [the hangar's deck, its plates' size], walls (panel, dado), and the floor of each kind of space
FL_LOOK = {
    'navy': {'bay': ('heatshield', 6.0), 'wall': ('tint', 'paint'), 'floor': {'_': ('concrete', 2.0), 'office': ('rubber', 1.5), 'corridor': ('metal', 2.0), 'kitchen': ('stone', 1.5), 'bedroom': ('rubber', 2.0)}, 'amb': (0.2, 0.21, 0.23)},
    'liner': {'bay': ('stone', 4.0), 'wall': ('laminate', 'wood'), 'floor': {'_': ('wood', 0.3), 'corridor': ('stone', 1.5), 'lobby': ('stone', 1.5), 'kitchen': ('stone', 1.2)}, 'amb': (0.26, 0.24, 0.2)},
    'works': {'bay': ('concrete', 6.0), 'wall': ('corrugated', 'paint'), 'floor': {'_': ('concrete', 2.5), 'office': ('metal', 1.5), 'corridor': ('metal', 2.0)}, 'amb': (0.22, 0.2, 0.17)},
    'civic': {'bay': ('stone', 5.0), 'wall': ('laminate', 'stone'), 'floor': {'_': ('stone', 1.5), 'office': ('wood', 0.3), 'living': ('wood', 0.3), 'lift': ('metal', 1.0)}, 'amb': (0.27, 0.26, 0.24)},
    'black': {'bay': ('heatshield', 6.0), 'wall': ('heatshield', 'paint'), 'floor': {'_': ('rubber', 2.0), 'office': ('heatshield', 1.5), 'corridor': ('metal', 2.0)}, 'amb': (0.12, 0.14, 0.16)},
}

def _fl_room_at(lay, x, z, y):
    best = None
    for R in lay['rooms']:
        x0, z0, x1, z1 = R['rect']
        if x < x0 - 0.01 or x > x1 + 0.01 or z < z0 - 0.01 or z > z1 + 0.01 or y < R['y0'] - 1.2 or y > R['y1'] + 0.6: continue
        if best is None or (x1 - x0) * (z1 - z0) < (best['rect'][2] - best['rect'][0]) * (best['rect'][3] - best['rect'][1]): best = R
    return best

def _fl_plates(p, x0, z0, x1, z1, y, size, mat, under='paint'):
    add_box(p, x0, y - 0.3, z0, x1, y - 0.045, z1, under, 0); g = 0.012
    if mat == 'wood':      # boards, laid along the room's length
        n = max(1, round((x1 - x0) / size)); dx = (x1 - x0) / n
        for i in range(n): add_box(p, x0 + i * dx + 0.004, y - 0.045, z0, x0 + (i + 1) * dx - 0.004, y, z1, 'wood', 0)
        return
    nx = max(1, round((x1 - x0) / size)); nz = max(1, round((z1 - z0) / size)); dx = (x1 - x0) / nx; dz = (z1 - z0) / nz
    for i in range(nx):
        for j in range(nz): add_box(p, x0 + i * dx + g, y - 0.045, z0 + j * dz + g, x0 + (i + 1) * dx - g, y, z0 + (j + 1) * dz - g, mat, 0)

def _fl_wallbox(p, w, R):
    """→ box(u0, u1, d0, d1, y0, y1, mat): along the wall from u0 to u1, standing d0..d1 out of it into its room."""
    along = w['z0'] == w['z1']; c = w['z0'] if along else w['x0']; rx0, rz0, rx1, rz1 = R['rect']; mid = (rz0 + rz1) / 2 if along else (rx0 + rx1) / 2; n = 1 if mid > c else -1
    def box(u0, u1, d0, d1, y0, y1, mat):
        if u1 - u0 < 0.005 or y1 - y0 < 0.005: return
        q0, q1 = sorted((c + n * d0, c + n * d1))
        if along: add_box(p, u0, y0, q0, u1, y1, q1, mat, 0)
        else: add_box(p, q0, y0, u0, q1, y1, u1, mat, 0)
    return box, along, ((w['x0'], w['x1']) if along else (w['z0'], w['z1'])), n

def _fl_spans(lay, w, along):
    return sorted([(lay['doors'][d]['x' if along else 'z'] - lay['doors'][d]['width'] / 2, lay['doors'][d]['x' if along else 'z'] + lay['doors'][d]['width'] / 2, lay['doors'][d]) for d in w.get('doors', [])])

def _fl_lining(p, lay, w, R, r, look):
    """One side of a space: frames standing out of it, panels between them in tiers (a dado, then plate), a kick strip, the doors left open in their frames."""
    box, along, (a0, a1), n = _fl_wallbox(p, w, R); panel, dado = look['wall']
    yb = w['y0'] if w.get('high') else max(R['y0'], 1); yt = w['y1']; H = yt - yb; big = H > 9
    bay = 9.0 if H > 24 else 7.0 if big else 3.0; fr = 0.5 if H > 24 else 0.34 if big else 0.16
    spans = _fl_spans(lay, w, along)
    if w.get('high'): tiers = []; y = yb
    else: tiers = [(yb, yb + (1.6 if big else 1.1), dado)]; y = tiers[0][1]
    th = 7.5 if H > 24 else 4.6 if big else 2.7
    while y < yt - 0.05: tiers.append((y, min(yt, y + th), panel)); y += th
    u = a0      # the bulkhead itself, behind the panels (a sheet: the space the other side of it has its own panels on it), open where the doors are
    for (d0, d1, D_) in spans + [(a1, a1, None)]:
        box(u, d0, -0.008, 0.0, yb - 0.3, yt + 0.3, 'rubber')
        if D_ and D_['y'] + D_['height'] < yt: box(d0, d1, -0.008, 0.0, max(yb, D_['y'] + D_['height']), yt + 0.3, 'rubber')
        if D_ and D_['y'] > yb + 0.5: box(d0, d1, -0.008, 0.0, yb - 0.3, D_['y'], 'rubber')
        u = d1
    u = a0
    while u < a1 - 0.01:
        e = min(a1, u + bay); dr = None
        for (d0, d1, D_) in spans:
            if u < d0 < e: e = d0
            if d0 <= u < d1 and D_['y'] >= yb - 0.5 and D_['y'] < yt: e = None; nxt = d1; dr = D_; break
        if e is None:
            h = dr['y'] + dr['height']; wide = dr['width'] > 3.5
            if h < yt - 0.05: box(u, nxt, 0, 0.07, h, yt, panel)
            j = 0.3 if dr['width'] > 20 else 0.16
            for q in (u, nxt): box(q - j, q + j, -0.14, 0.24, dr['y'], h + j, 'hazard' if wide else 'metal')
            box(u - j, nxt + j, -0.14, 0.24, h, h + j * 1.6, 'hazard' if wide else 'metal'); box(u, nxt, -0.14, 0.14, dr['y'] - 0.01, dr['y'] + 0.012, 'hazard' if wide else 'metal')
            u = nxt; continue
        box(u, u + fr, 0, fr * 0.9, yb, yt, 'metal')
        box(u + fr, e, 0, 0.1, yb, yb + 0.14, 'rubber')
        for k, (y0, y1, m) in enumerate(tiers): box(u + fr + 0.03, e - 0.03, 0, 0.07, y0 + 0.03 + (0.14 if k == 0 and not w.get('high') else 0), y1 - 0.03, m)
        if not w.get('high') and e - u > 2 and H > 2.2:      # what's on the wall between frames: now and then a conduit, a junction box, a screen
            q = r.random()
            if q < 0.2: box(u + fr + 0.4, u + fr + 1.3, 0.07, 0.2, yb + 1.45, yb + 2.1, 'heatshield'); box(u + fr + 0.5, u + fr + 1.2, 0.2, 0.21, yb + 1.85, yb + 1.95, 'navgreen')
            elif q < 0.36: box(u + fr + 0.3, e - 0.3, 0.07, 0.15, yb + 2.2, yb + 2.32, 'metal')
            elif q < 0.46: box(u + fr + 0.5, u + fr + 1.7, 0.07, 0.09, yb + 1.35, yb + 2.05, 'screen')
            elif q < 0.56 and big: box(u + fr + 0.4, u + fr + 1.6, 0.07, 0.14, yb + 0.9, yb + 2.3, 'paint'); box(u + fr + 0.86, u + fr + 1.14, 0.14, 0.4, yb + 1.4, yb + 1.68, 'navred')
        u = e
    box(a1 - fr, a1, 0, fr * 0.9, yb, yt, 'metal')

def _fl_glass(p, lay, w, R, slit=False):
    """A wall of glass: a sill, mullions, a head; panes between (looked through from both sides). A warship's is a slit in armour."""
    box, along, (a0, a1), n = _fl_wallbox(p, w, R); yb = R['y0']; yt = w['y1']; g0 = yb + (1.5 if slit else 0.9); g1 = min(yt - 0.3, yb + (2.3 if slit else 4.2)); spans = _fl_spans(lay, w, along)
    segs = []; u = a0
    for (d0, d1, D_) in spans: segs.append((u, d0)); u = d1
    segs.append((u, a1))
    for (s0, s1) in segs: box(s0, s1, -0.12, 0.12, yb - 0.02, g0, 'paint'); box(s0, s1, -0.16, 0.16, g0 - 0.06, g0, 'metal')
    box(a0, a1, -0.12, 0.12, g1, yt, 'paint'); box(a0, a1, -0.16, 0.16, g1, g1 + 0.06, 'metal')
    for (d0, d1, D_) in spans:      # a doorway through it: its frame (the panes are left across its head only)
        h = D_['y'] + D_['height']; box(d0 - 0.14, d0, -0.18, 0.18, yb, h + 0.14, 'metal'); box(d1, d1 + 0.14, -0.18, 0.18, yb, h + 0.14, 'metal'); box(d0, d1, -0.18, 0.18, h, h + 0.14, 'metal')
    per = 2.4 if slit else 1.8; k = max(1, round((a1 - a0) / per)); du = (a1 - a0) / k
    for i in range(k):
        u0, u1 = a0 + i * du, a0 + (i + 1) * du; box(u0 - 0.04, u0 + 0.04, -0.1, 0.1, g0, g1, 'metal')
        lo = g0
        for (d0, d1, D_) in spans:
            if u1 > d0 and u0 < d1: lo = max(lo, D_['y'] + D_['height'] + 0.14)
        if lo < g1 - 0.05: box(u0 + 0.04, u1 - 0.04, -0.012, 0.012, lo, g1, 'glass')

def _fl_rail(p, w):
    along = w['z0'] == w['z1']; a0, a1 = (w['x0'], w['x1']) if along else (w['z0'], w['z1']); c = w['z0'] if along else w['x0']; y0, y1 = w['y0'], w['y1']
    if a1 - a0 < 0.05: return
    def box(u0, u1, d, y_0, y_1, mat):
        if along: add_box(p, u0, y_0, c - d, u1, y_1, c + d, mat, 0)
        else: add_box(p, c - d, y_0, u0, c + d, y_1, u1, mat, 0)
    n = max(1, round((a1 - a0) / 2.0))
    for k in range(n + 1): u = a0 + (a1 - a0) * k / n; box(u - 0.03, u + 0.03, 0.03, y0, y1, 'metal')
    for yy in (0.55, 1.03): box(a0, a1, 0.025, y0 + yy - 0.025, y0 + yy + 0.025, 'metal')
    box(a0, a1, 0.012, y0, y0 + 0.12, 'paint')

def _fl_prism(p, pts, x0, x1, mat):
    """A flat plate: the outline pts [(z, y)] between x0 and x1."""
    bm = bmesh.new(); A = [bm.verts.new(P(x0, y, z)) for (z, y) in pts]; B = [bm.verts.new(P(x1, y, z)) for (z, y) in pts]; n = len(pts)
    bm.faces.new(A); bm.faces.new(B[::-1])
    for i in range(n): bm.faces.new([A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def _fl_stair(p, R):
    """A flight: treads and risers between two stringers, the sides plated down to the deck it climbs from, a raked balustrade each side."""
    x0, x1, z0, z1, y0, y1 = R['x0'], R['x1'], R['z0'], R['z1'], R['y0'], R['y1']; n = max(2, int(round(abs(y1 - y0) / 0.18))); dz = (z1 - z0) / n; dy = (y1 - y0) / n; lo = min(y0, y1)
    for k in range(n):
        top = y0 + dy * (k + 0.5) + abs(dy) * 0.25      # (the slope you walk runs through the treads, a little under the top of each: your feet are on them, not in them)
        add_box(p, x0 + 0.08, top - 0.04, min(z0 + dz * k, z0 + dz * (k + 1)) + 0.005, x1 - 0.08, top, max(z0 + dz * k, z0 + dz * (k + 1)) - 0.005, 'metal', 0)
        zr = z0 + dz * k if dy > 0 else z0 + dz * (k + 1); add_box(p, x0 + 0.08, top - abs(dy), zr - 0.012, x1 - 0.08, top - 0.04, zr + 0.012, 'paint', 0)
    for x in (x0, x1 - 0.08):
        _fl_prism(p, [(z0, lo), (z1, lo), (z1, y1)] if y1 > y0 else [(z0, lo), (z1, lo), (z0, y0)], x, x + 0.08, 'paint')
        xm = x + 0.04; m = max(2, round(abs(z1 - z0) / 1.6))
        for k in range(m + 1): t = k / m; zz = z0 + (z1 - z0) * t; yy = y0 + (y1 - y0) * t; add_box(p, xm - 0.03, yy, zz - 0.03, xm + 0.03, yy + 1.05, zz + 0.03, 'metal', 0)
        for hh in (0.55, 1.03): _beam(p, (xm, y0 + hh, z0), (xm, y1 + hh, z1), 0.05, 'metal')

def _fl_text(p, s, x, y, z, face, size, mat):
    """Lettering standing on a wall, read from the side it faces (0: −z, 1: +x, 2: +z, 3: −x)."""
    cu = bpy.data.curves.new('t', 'FONT'); cu.body = s; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.extrude = 0.012
    ob = bpy.data.objects.new('t', cu); bpy.context.scene.collection.objects.link(ob); dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    fx, fz = [(0, -1), (1, 0), (0, 1), (-1, 0)][face]; Fb = mathutils.Vector((fx, -fz, 0)); Rb = mathutils.Vector((-Fb.y, Fb.x, 0)); O = mathutils.Vector(P(x, y, z)); Z = mathutils.Vector((0, 0, 1))
    bm = bmesh.new(); bm.from_mesh(me)
    for v in bm.verts: v.co = O + Rb * v.co.x + Z * v.co.y + Fb * (v.co.z + 0.02)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat); bpy.data.objects.remove(ob); bpy.data.curves.remove(cu); bpy.data.meshes.remove(me)      # (each letter welded shut, so its faces know which way is out)
    # its board: a dark plate behind the letters
    w = len(s) * size * 0.62 + 0.4; q = mathutils.Vector((x, y, z))
    if fx == 0: add_box(p, x - w / 2, y - size * 0.75, min(z, z + fz * 0.02), x + w / 2, y + size * 0.75, max(z, z + fz * 0.02), 'heatshield', 0)
    else: add_box(p, min(x, x + fx * 0.02), y - size * 0.75, z - w / 2, max(x, x + fx * 0.02), y + size * 0.75, z + w / 2, 'heatshield', 0)

# ---- the things that stand in them (each in its own frame: x across 0..L, y up 0..H, z 0..D, its front at z = 0)
def _ring(q, cx, cy, cz, R, w, mat, n=20, plane='xy', tilt=0.0):
    pts = []
    for k in range(n + 1):
        a = 2 * math.pi * k / n; c, s = math.cos(a) * R, math.sin(a) * R
        pts.append((cx + c, cy + s, cz) if plane == 'xy' else (cx + c, cy + s * math.sin(tilt), cz + s * math.cos(tilt)))
    for a, b in zip(pts, pts[1:]): _beam(q, a, b, w, mat)
def _wheels(q, L, D, R=0.22, inset=0.25):
    for z in (inset + R, D - inset - R):
        for (xa, xb) in ((0.0, 0.12), (L - 0.12, L)): add_cyl(q, R, z, xa, xb, R, 'rubber', 12, axis='x')
def fl_plot(q, L, D, H, r):
    add_box(q, 0.3, 0, 0.3, L - 0.3, H - 0.16, D - 0.3, 'paint', 0); add_box(q, 0, H - 0.16, 0, L, H - 0.03, D, 'metal', 0); add_box(q, 0.1, H - 0.03, 0.1, L - 0.1, H, D - 0.1, 'glow', 0)
    for (a, b) in ((0, 0), (L - 0.06, 0), (0, D - 0.06), (L - 0.06, D - 0.06)): add_box(q, a, H, b, a + 0.06, H + 0.05, b + 0.06, 'metal', 0)
    add_box(q, 0.3, 0.02, 0.26, L - 0.3, 0.1, 0.3, 'glow', 0); add_box(q, 0.3, 0.02, D - 0.3, L - 0.3, 0.1, D - 0.26, 'glow', 0)
def fl_bank(q, L, D, H, r):
    add_box(q, 0, 0.5, D * 0.5, L, H, D, 'metal', 0); add_box(q, 0, 0, D * 0.3, L, 0.5, D, 'paint', 0); n = max(1, round(L / 1.5)); dx = L / n
    for i in range(n):
        for (ya, yb) in ((0.62, 0.62 + (H - 0.7) * 0.48), (0.66 + (H - 0.7) * 0.5, H - 0.08)): add_box(q, i * dx + 0.05, ya, D * 0.42, (i + 1) * dx - 0.05, yb, D * 0.5, 'screen' if (i + int(ya * 3)) % 4 else 'heatshield', 0)
def fl_throne(q, L, D, H, r):
    cx = L / 2; add_cyl(q, cx, D / 2, 0, 0.08, min(L, D) * 0.5, 'metal', 16); add_cyl(q, cx, D / 2, 0.08, 0.42, 0.1, 'metal', 10)
    add_box(q, 0.12, 0.42, 0.1, L - 0.12, 0.54, D - 0.1, 'fabric', 0.03, 2); add_box(q, 0.12, 0.5, D - 0.26, L - 0.12, H, D - 0.1, 'fabric', 0.03, 2); add_box(q, 0.2, H, D - 0.24, L - 0.2, H + 0.16, D - 0.12, 'fabric', 0.03, 2)
    for x in (0.0, L - 0.14): add_box(q, x, 0.5, 0.12, x + 0.14, 0.72, D - 0.2, 'paint', 0); add_box(q, x + 0.02, 0.72, 0.14, x + 0.12, 0.735, 0.4, 'screen', 0)
def fl_helm(q, L, D, H, r):
    cx = L / 2; add_box(q, cx - 0.28, 0, D * 0.3, cx + 0.28, H * 0.62, D * 0.9, 'wood', 0.02, 2); add_box(q, cx - 0.32, H * 0.62, D * 0.26, cx + 0.32, H * 0.66, D * 0.94, 'soil', 0); add_cyl(q, cx, D * 0.6, H * 0.66, H * 0.8, 0.2, 'soil', 16); add_cyl(q, cx, D * 0.6, H * 0.8, H * 0.83, 0.17, 'glass', 16)
    yc = H * 0.62; add_cyl(q, cx, yc, 0.02, D * 0.3, 0.05, 'soil', 10, axis='z'); _ring(q, cx, yc, 0.06, 0.56, 0.06, 'wood', 20); add_cyl(q, cx, yc, 0.02, 0.1, 0.1, 'soil', 12, axis='z')
    for k in range(8): a = k * math.pi / 4; _beam(q, (cx, yc, 0.06), (cx + math.cos(a) * 0.7, yc + math.sin(a) * 0.7, 0.06), 0.045, 'wood')
def fl_telegraph(q, L, D, H, r):
    cx, cz = L / 2, D / 2; add_cyl(q, cx, cz, 0, 0.06, 0.26, 'soil', 14); add_cyl(q, cx, cz, 0.06, H - 0.36, 0.07, 'soil', 12); add_cyl(q, H - 0.2, cz, cx - 0.12, cx + 0.12, 0.2, 'soil', 18, axis='x')
    for x in (cx - 0.125, cx + 0.115): add_cyl(q, H - 0.2, cz, x, x + 0.01, 0.17, 'ceramic', 18, axis='x')
    _beam(q, (cx + 0.15, H - 0.2, cz), (cx + 0.15, H + 0.1, cz - 0.12), 0.035, 'soil'); add_cyl(q, H + 0.1, cz - 0.12, cx + 0.1, cx + 0.2, 0.035, 'wood', 8, axis='x')
def fl_orrery(q, L, D, H, r):
    cx, cz = L / 2, D / 2; add_cyl(q, cx, cz, 0, 0.5, L * 0.36, 'stone', 28); add_cyl(q, cx, cz, 0.5, 0.56, L * 0.38, 'metal', 28); add_cyl(q, cx, cz, 0.56, 0.6, L * 0.3, 'glow', 28)
    # the spine lying over the plinth, and the three rings on it, each on its spokes
    y = H * 0.55; add_cyl(q, cx, y, cz - D * 0.46, cz + D * 0.46, 0.09, 'metal', 12, axis='z')
    for (dz, R) in ((-D * 0.24, L * 0.3), (0.0, L * 0.38), (D * 0.26, L * 0.33)):
        _ring(q, cx, y, cz + dz, R, 0.11, 'ceramic', 28); _ring(q, cx, y, cz + dz, R * 0.99, 0.04, 'glow', 28)
        for k in range(6): a = k * math.pi / 3 + dz; _beam(q, (cx, y, cz + dz), (cx + math.cos(a) * R, y + math.sin(a) * R, cz + dz), 0.035, 'metal')
        add_cyl(q, cx, y, cz + dz - 0.1, cz + dz + 0.1, 0.2, 'metal', 12, axis='z')
    for dz in (-D * 0.4, D * 0.4): _beam(q, (cx, 0.56, cz + dz), (cx, y, cz + dz), 0.08, 'metal')
def fl_holo(q, L, D, H, r):
    cx, cz = L / 2, D / 2; R = min(L, D) * 0.46; yc = H * 0.55; add_cyl(q, cx, cz, 0, 0.06, R * 0.5, 'metal', 20); add_cyl(q, cx, cz, 0.06, 0.08, R * 0.4, 'glow', 20)
    for k in range(4): _ring(q, cx, yc, cz, R, 0.022, 'glow', 24, 'tilt', k * math.pi / 4)
    for k in (-0.5, 0, 0.5):
        rr = R * math.cos(math.asin(k)); pts = [(cx + math.cos(2 * math.pi * i / 24) * rr, yc + k * R, cz + math.sin(2 * math.pi * i / 24) * rr) for i in range(25)]
        for a, b in zip(pts, pts[1:]): _beam(q, a, b, 0.02, 'glow')
    for k in range(7): a = r.uniform(0, 6.28); b = r.uniform(-0.8, 0.8); pt = (cx + math.cos(a) * R * 0.7 * math.cos(b), yc + math.sin(b) * R * 0.7, cz + math.sin(a) * R * 0.7 * math.cos(b)); add_box(q, pt[0] - 0.05, pt[1] - 0.05, pt[2] - 0.05, pt[0] + 0.05, pt[1] + 0.05, pt[2] + 0.05, 'navred' if k % 3 == 0 else 'navgreen', 0)
def fl_citymodel(q, L, D, H, r):
    add_box(q, 0, 0, 0, L, 0.8, D, 'stone', 0); add_box(q, -0.06, 0.8, -0.06, L + 0.06, 0.86, D + 0.06, 'metal', 0); add_box(q, 0.1, 0.86, 0.1, L - 0.1, 0.9, D - 0.1, 'heatshield', 0)
    add_box(q, L * 0.47, 0.9, 0.3, L * 0.53, 0.905, D - 0.3, 'glow', 0)      # the boulevard down it
    for i in range(int(L / 0.5)):
        for j in range(int(D / 0.5)):
            x = 0.3 + i * 0.5; z = 0.3 + j * 0.5
            if x > L - 0.5 or z > D - 0.5 or abs(x + 0.17 - L / 2) < 0.4 or r.random() < 0.25: continue
            h = r.uniform(0.08, 0.3) + (0.7 * r.random() ** 3 if abs(x - L / 2) < L * 0.3 else 0); add_box(q, x, 0.9, z, x + 0.34, 0.9 + h, z + 0.34, 'ceramic' if r.random() < 0.8 else 'glass', 0)
            if h > 0.5: add_box(q, x + 0.14, 0.9 + h, z + 0.14, x + 0.2, 0.9 + h + 0.12, z + 0.2, 'navred', 0)
def fl_mimic(q, L, D, H, r):
    add_box(q, 0, 0.5, D * 0.4, L, H, D, 'paint', 0); add_box(q, 0, 0, D * 0.2, L, 0.5, D, 'metal', 0); zf = D * 0.4
    for k in range(5):      # the lines of the cargo system drawn on it, a valve wheel where each can be shut
        y = 0.8 + k * (H - 1.1) / 4; m = ('soil', 'navred', 'navgreen', 'ceramic', 'soil')[k]; add_box(q, 0.15, y - 0.025, zf - 0.02, L - 0.15, y + 0.025, zf, m, 0)
        for j in range(3):
            x = 0.5 + (j + 0.5 * (k % 2)) * (L - 1.0) / 3
            if x > L - 0.3: continue
            add_cyl(q, x, y, zf - 0.07, zf - 0.02, 0.1, 'navred' if (k + j) % 3 == 0 else 'metal', 12, axis='z'); add_cyl(q, x, y, zf - 0.12, zf - 0.07, 0.02, 'metal', 6, axis='z')
    for j in range(4): x = 0.4 + j * (L - 0.8) / 3; add_box(q, x - 0.03, 0.8, zf - 0.02, x + 0.03, H - 0.3, zf - 0.005, 'ceramic', 0); add_cyl(q, x, H - 0.16, zf - 0.03, zf, 0.11, 'ceramic', 14, axis='z')
def fl_levers(q, L, D, H, r):
    add_box(q, 0, 0, D * 0.25, L, H * 0.7, D, 'paint', 0); add_box(q, -0.03, H * 0.7, D * 0.2, L + 0.03, H * 0.74, D + 0.02, 'metal', 0); n = max(2, int(L / 0.3))
    for k in range(n):
        x = 0.15 + k * (L - 0.3) / (n - 1); t = r.uniform(-0.25, 0.25); add_box(q, x - 0.04, H * 0.74, D * 0.45, x + 0.04, H * 0.76, D * 0.85, 'heatshield', 0)
        _beam(q, (x, H * 0.74, D * 0.65), (x, H * 0.74 + 0.38, D * 0.65 + t), 0.03, 'metal'); add_cyl(q, x, D * 0.65 + t, H * 0.74 + 0.36, H * 0.74 + 0.46, 0.035, 'navred' if k % 3 == 0 else 'rubber', 8)
    for k in range(3): add_cyl(q, 0.3 + k * (L - 0.6) / 2, H * 0.5, D * 0.2, D * 0.25, 0.12, 'ceramic', 14, axis='z')
def fl_liftshaft(q, L, D, H, r):
    # the shaft a lift's car goes up in, standing on the car's own roof: four posts, hoops, glass between, a line of light up the front
    DD = 6.6
    for (x, z) in ((0, 0.5), (L - 0.14, 0.5), (0, DD - 0.14), (L - 0.14, DD - 0.14)): add_box(q, x, 0, z, x + 0.14, H, z + 0.14, 'metal', 0)
    y = 0.0
    while y < H: add_box(q, 0, y, 0.5, L, y + 0.12, 0.62, 'metal', 0); add_box(q, 0, y, 0.5, 0.12, y + 0.12, DD, 'metal', 0); add_box(q, L - 0.12, y, 0.5, L, y + 0.12, DD, 'metal', 0); y += 2.6
    add_box(q, 0.14, 0, 0.55, L - 0.14, H, 0.57, 'glass', 0); add_box(q, 0.05, 0, 0.64, 0.07, H, DD - 0.14, 'glass', 0); add_box(q, L - 0.07, 0, 0.64, L - 0.05, H, DD - 0.14, 'glass', 0)
    add_box(q, L / 2 - 0.05, 0, 0.46, L / 2 + 0.05, H, 0.5, 'glow', 0)
    for x in (L * 0.3, L * 0.7): add_box(q, x - 0.05, 0, DD - 0.5, x + 0.05, H, DD - 0.4, 'metal', 0)      # the car's guide rails
def fl_cart(q, L, D, H, r):
    _wheels(q, L, D, 0.11, 0.1); add_box(q, 0.05, 0.22, 0.05, L - 0.05, 0.3, D - 0.05, 'metal', 0); add_box(q, 0.1, 0.3, 0.2, L - 0.1, H * 0.85, D * 0.62, 'navred', 0)
    for k in range(4): y = 0.36 + k * (H * 0.85 - 0.4) / 4; add_box(q, 0.07, y, 0.3, 0.1, y + 0.03, D * 0.55, 'metal', 0)
    add_box(q, 0.1, 0.3, D * 0.66, L - 0.1, 0.34, D - 0.1, 'rubber', 0); add_box(q, 0.2, 0.34, D * 0.7, L - 0.5, 0.5, D - 0.2, 'paint', 0)
    for x in (0.06, L - 0.09): add_box(q, x, 0.3, D - 0.08, x + 0.03, H, D - 0.05, 'metal', 0)
    add_box(q, 0.06, H - 0.03, D - 0.08, L - 0.06, H, D - 0.05, 'metal', 0)
def fl_bowser(q, L, D, H, r):
    _wheels(q, L, D, 0.36, 0.5); add_box(q, 0.2, 0.36, 0.1, L - 0.2, 0.6, D - 0.1, 'paint', 0); R = min((L - 0.4) / 2, (H - 0.62) / 2)
    add_cyl(q, L / 2, 0.62 + R, 1.3, D - 0.3, R, 'ceramic', 20, axis='z'); add_cyl(q, L / 2, 0.62 + R, D - 0.3, D - 0.12, R, 'ceramic', 20, axis='z', r2=R * 0.6); add_cyl(q, L / 2, 0.62 + R, 1.12, 1.3, R * 0.6, 'ceramic', 20, axis='z', r2=R)
    for z in (2.0, D - 1.2): add_cyl(q, L / 2, 0.62 + R, z, z + 0.08, R + 0.02, 'hazard', 20, axis='z')
    add_box(q, 0.3, 0.6, 0.12, L - 0.3, 1.5, 1.05, 'soil', 0); add_box(q, 0.36, 1.0, 0.1, L - 0.36, 1.44, 0.13, 'visor', 0)      # the cab
    add_cyl(q, 1.05, D * 0.55, 0.12, 0.26, 0.3, 'rubber', 14, axis='x'); add_cyl(q, L / 2, D - 0.6, 0.62 + 2 * R, 0.62 + 2 * R + 0.12, 0.18, 'metal', 12)
def fl_steps(q, L, D, H, r):
    _wheels(q, L, D, 0.14, 0.2); n = max(3, int(H / 0.2)); add_box(q, 0.04, 0.2, 0.1, L - 0.04, 0.3, D - 0.1, 'metal', 0)
    for k in range(n): z0 = 0.2 + k * (D - 1.0) / n; y = (k + 1) * H / n; add_box(q, 0.08, y - 0.04, z0, L - 0.08, y, z0 + (D - 1.0) / n + 0.02, 'metal', 0)
    add_box(q, 0.08, H - 0.04, D - 0.8, L - 0.08, H, D, 'metal', 0)
    for x in (0.04, L - 0.08):
        _beam(q, (x + 0.02, 0.3, 0.2), (x + 0.02, H - 0.1, D - 0.8), 0.08, 'soil'); _beam(q, (x + 0.02, 1.2, 0.2), (x + 0.02, H + 0.95, D - 0.8), 0.04, 'soil'); add_box(q, x, H, D - 0.8, x + 0.04, H + 0.95, D - 0.76, 'soil', 0); add_box(q, x, H, D - 0.04, x + 0.04, H + 0.95, D, 'soil', 0); add_box(q, x, H + 0.91, D - 0.8, x + 0.04, H + 0.95, D, 'soil', 0)
        add_box(q, x, 0.3, D - 0.14, x + 0.04, H, D - 0.1, 'metal', 0)
def fl_trolley(q, L, D, H, r):
    _wheels(q, L, D, 0.16, 0.3); add_box(q, 0.05, 0.3, 0.1, L - 0.05, 0.4, D - 0.1, 'soil', 0); add_cyl(q, L / 2, 0.36, -0.5, 0.1, 0.03, 'metal', 8, axis='z')
    for x in (L * 0.3, L * 0.7):
        for z in (0.6, D - 0.7): add_box(q, x - 0.2, 0.4, z, x + 0.2, 0.56, z + 0.1, 'metal', 0)
        R = 0.17; y = 0.56 + R; add_cyl(q, x, y, 0.55, D - 0.6, R, 'ceramic', 14, axis='z'); add_cyl(q, x, y, 0.2, 0.55, 0.03, 'navred', 14, axis='z', r2=R); add_cyl(q, x, y, D - 0.6, D - 0.45, R, 'metal', 14, axis='z', r2=R * 0.7)
        for a in range(4): c, s = math.cos(a * math.pi / 2 + 0.785), math.sin(a * math.pi / 2 + 0.785); _beam(q, (x + c * R, y + s * R, D - 0.9), (x + c * R * 2, y + s * R * 2, D - 0.55), 0.02, 'paint')
def fl_tug(q, L, D, H, r):
    _wheels(q, L, D, 0.3, 0.3); add_box(q, 0.12, 0.3, 0.1, L - 0.12, 0.9, D - 0.1, 'soil', 0.03, 2); add_box(q, 0.3, 0.9, D * 0.5, L - 0.3, 1.0, D - 0.3, 'rubber', 0); add_box(q, 0.3, 1.0, D - 0.42, L - 0.3, 1.45, D - 0.3, 'rubber', 0)
    add_cyl(q, L / 2, D * 0.45, 0.9, 1.2, 0.03, 'metal', 8); _ring(q, L / 2, 1.2, D * 0.45, 0.17, 0.03, 'rubber', 12, 'tilt', 1.2); add_box(q, 0.1, 0.3, 0.02, L - 0.1, 0.5, 0.1, 'hazard', 0); add_cyl(q, L / 2, 0.4, D, D + 0.5, 0.04, 'metal', 8, axis='z')
def fl_loader(q, L, D, H, r):
    _wheels(q, L, D, 0.24, 0.4); add_box(q, 0.1, 0.24, 0.1, L - 0.1, 0.5, D - 0.1, 'soil', 0); top = H - 0.2
    for x in (0.3, L - 0.3): _beam(q, (x, 0.5, 0.5), (x, top, D - 0.5), 0.09, 'metal'); _beam(q, (x, 0.5, D - 0.5), (x, top, 0.5), 0.09, 'metal'); add_cyl(q, (0.5 + top) / 2, D / 2, x - 0.06, x + 0.06, 0.07, 'metal', 10, axis='x')
    add_box(q, 0, top, 0, L, top + 0.1, D, 'metal', 0)
    for k in range(int(D / 0.5)): add_cyl(q, top + 0.13, 0.25 + k * 0.5, 0.15, L - 0.15, 0.045, 'metal', 8, axis='x')
    for x in (0.0, L - 0.05): add_box(q, x, top + 0.1, 0, x + 0.05, top + 0.2, D, 'hazard', 0)
def fl_pallet(q, L, D, H, r):
    tiers = 2 if H > 2 else 1; hc = (H - 0.16 * tiers) / tiers
    for t in range(tiers):
        y = t * (hc + 0.16)
        for x in (0.0, L / 2 - 0.08, L - 0.16): add_box(q, x, y, 0, x + 0.16, y + 0.1, D, 'wood', 0)
        add_box(q, 0, y + 0.1, 0, L, y + 0.16, D, 'wood', 0)
        for sx in (0, 1):
            for sz in (0, 1):
                x0 = 0.06 + sx * L / 2; z0 = 0.06 + sz * D / 2; x1 = x0 + L / 2 - 0.12; z1 = z0 + D / 2 - 0.12; yb = y + 0.16; yt = y + 0.16 + hc - 0.06
                add_box(q, x0, yb, z0, x1, yt, z1, 'plank', 0); add_box(q, x0 - 0.02, yt, z0 - 0.02, x1 + 0.02, yt + 0.05, z1 + 0.02, 'wood', 0)
                for k in (0.28, 0.72): zz = z0 + (z1 - z0) * k; add_box(q, x0 - 0.012, yb, zz - 0.03, x1 + 0.012, yt + 0.06, zz + 0.03, 'metal', 0)
def fl_tankstand(q, L, D, H, r):
    R = min(L / 2 - 0.12, (H - 0.6) / 2); cy = 0.6 + R; mat = r.choice(('navred', 'soil', 'ceramic', 'paint', 'navgreen')); cx = L / 2
    add_cyl(q, cx, cy, 0.5, D - 0.5, R, mat, 22, axis='z'); add_cyl(q, cx, cy, D - 0.5, D - 0.1, R, mat, 22, axis='z', r2=R * 0.45); add_cyl(q, cx, cy, 0.1, 0.5, R * 0.45, mat, 22, axis='z', r2=R)
    for z in (D * 0.25, D * 0.5, D * 0.75): add_cyl(q, cx, cy, z - 0.04, z + 0.04, R + 0.02, 'metal', 22, axis='z')
    for z in (D * 0.22, D * 0.78):
        add_box(q, cx - R * 0.85, 0.12, z - 0.11, cx + R * 0.85, cy - R * 0.5, z + 0.11, 'metal', 0)
        for x in (cx - R * 0.8, cx + R * 0.8): add_box(q, x - 0.17, 0, z - 0.25, x + 0.17, 0.12, z + 0.25, 'metal', 0)
    add_cyl(q, cx, D / 2, cy + R, cy + R + 0.26, 0.17, 'metal', 12); _ring(q, cx, cy + R + 0.34, D / 2, 0.17, 0.035, 'soil', 12, 'tilt', math.pi / 2); add_cyl(q, cx, D / 2, cy + R + 0.26, cy + R + 0.34, 0.03, 'soil', 6)
def fl_pillar(q, L, D, H, r):
    add_box(q, -0.06, 0, -0.06, L + 0.06, 0.3, D + 0.06, 'metal', 0); add_box(q, 0, 0.3, 0, L, H - 0.5, D, 'stone', 0); add_box(q, -0.1, H - 0.5, -0.1, L + 0.1, H, D + 0.1, 'metal', 0)
    add_box(q, L / 2 - 0.05, 0.7, -0.012, L / 2 + 0.05, H - 1.0, 0, 'glow', 0); add_box(q, L / 2 - 0.05, 0.7, D, L / 2 + 0.05, H - 1.0, D + 0.012, 'glow', 0)

def fl_bunk(q, L, D, H, r):
    # bunks in a tier of two (the bed's head at x = 0): a steel frame, a mattress, a folded blanket and a pillow on each, a ladder at the foot
    for (x, z) in ((0, 0), (L - 0.06, 0), (0, D - 0.06), (L - 0.06, D - 0.06)): add_box(q, x, 0, z, x + 0.06, H, z + 0.06, 'metal', 0)
    for yy in (0.3, H * 0.5 + 0.35):
        add_box(q, 0, yy, 0, L, yy + 0.07, D, 'metal', 0); add_box(q, 0.05, yy + 0.07, 0.05, L - 0.05, yy + 0.2, D - 0.05, 'ceramic', 0); add_box(q, 0.1, yy + 0.2, 0.12, 0.55, yy + 0.29, D - 0.12, 'ceramic', 0)
        add_box(q, L * 0.45, yy + 0.2, 0.07, L - 0.08, yy + 0.25, D - 0.07, 'fabric', 0); add_box(q, 0, yy + 0.2, D - 0.03, L, yy + 0.42, D, 'metal', 0)
    for k in range(5): add_box(q, L - 0.05, 0.25 + k * (H - 0.5) / 5, 0.1, L - 0.02, 0.28 + k * (H - 0.5) / 5, 0.5, 'metal', 0)
def fl_sofa(q, L, D, H, r):
    for (x, z) in ((0.06, 0.06), (L - 0.12, 0.06), (0.06, D - 0.12), (L - 0.12, D - 0.12)): add_box(q, x, 0, z, x + 0.06, 0.1, z + 0.06, 'wood', 0)
    add_box(q, 0, 0.1, 0, L, 0.3, D, 'fabric', 0); n = max(1, round((L - 0.36) / 0.8)); dx = (L - 0.36) / n
    for i in range(n): add_box(q, 0.18 + i * dx + 0.01, 0.3, 0.02, 0.18 + (i + 1) * dx - 0.01, 0.46, D - 0.2, 'fabric', 0.03, 2); add_box(q, 0.18 + i * dx + 0.01, 0.46, D - 0.34, 0.18 + (i + 1) * dx - 0.01, H, D - 0.16, 'fabric', 0.03, 2)
    add_box(q, 0, 0.3, D - 0.16, L, H - 0.06, D, 'fabric', 0)
    for x in (0.0, L - 0.18): add_box(q, x, 0.3, 0, x + 0.18, 0.62, D - 0.16, 'fabric', 0.03, 2)

def fl_planter(q, L, D, H, r):
    add_box(q, 0, 0, 0, L, 0.5, D, 'stone', 0); add_box(q, -0.03, 0.44, -0.03, L + 0.03, 0.5, D + 0.03, 'metal', 0); add_box(q, 0.05, 0.42, 0.05, L - 0.05, 0.47, D - 0.05, 'rubber', 0)
    add_cyl(q, L / 2, D / 2, 0.45, H * 0.6, 0.03, 'bark', 6)
    for k in range(14): a = r.uniform(0, 2 * math.pi); rr = r.uniform(0, min(L, D) * 0.32); add_blob(q, L / 2 + math.cos(a) * rr, r.uniform(0.62, H - 0.12), D / 2 + math.sin(a) * rr, r.uniform(0.11, 0.19), 'leaf', r, 1)

FL_COUNT = {}
def _fl_props(p, lay):
    B = {'counter': counter, 'locker': lambda q, L, D, H, r_: cabinet(q, L, D, H, r_, 'locker'), 'crate': crate, 'table': table, 'bench': bench, 'rack': lambda q, L, D, H, r_: shelf(q, L, D, H, r_, 'rack'), 'console': console,
         'bed': fl_bunk, 'sofa': fl_sofa, 'armchair': fl_sofa, 'chair': chair, 'planter': fl_planter, 'machine': machine, 'cabinet': cabinet, 'fridge': lambda q, L, D, H, r_: cabinet(q, L, D, H, r_, 'fridge'), 'desk': desk,
         'plot': fl_plot, 'bank': fl_bank, 'throne': fl_throne, 'helm': fl_helm, 'telegraph': fl_telegraph, 'orrery': fl_orrery, 'holo': fl_holo, 'citymodel': fl_citymodel, 'mimic': fl_mimic, 'levers': fl_levers, 'liftshaft': fl_liftshaft,
         'cart': fl_cart, 'bowser': fl_bowser, 'steps': fl_steps, 'trolley': fl_trolley, 'tug': fl_tug, 'loader': fl_loader, 'pallet': fl_pallet, 'tankstand': fl_tankstand, 'pillar': fl_pillar}
    for i, pr in enumerate(lay['props']):
        k = pr['kind']; across = pr['face'] in (0, 2); L, D = (pr['x1'] - pr['x0'], pr['z1'] - pr['z0']) if across else (pr['z1'] - pr['z0'], pr['x1'] - pr['x0']); n0 = len(p.bm.faces)
        pr2 = dict(pr)
        if k != 'chair': pr2['kind'] = k + str(i % 7)      # (place_in seeds a piece by its kind: a few of each, not all alike)
        _hx_flat(place_in, p, B[k], L, D, pr['h'], pr2, pr.get('y', 1)); FL_COUNT[k] = FL_COUNT.get(k, 0) + len(p.bm.faces) - n0

def _fl_light(p, L, R):
    x, y, z = L['p']; m = FL_LAMP[L['col']]; top = R['y1']
    if top - R['y0'] < 9:       # a strip against a low deck-head
        add_box(p, x - 0.9, top - 0.14, z - 0.14, x + 0.9, top - 0.02, z + 0.14, 'metal', 0); add_box(p, x - 0.82, top - 0.18, z - 0.09, x + 0.82, top - 0.14, z + 0.09, m, 0)
    else:                       # a floodlight on a drop rod under a high roof
        add_cyl(p, x, z, y + 0.5, top - 0.4, 0.05, 'metal', 6); add_cyl(p, x, z, y, y + 0.5, 0.7, 'paint', 16, r2=0.3); add_cyl(p, x, z, y - 0.04, y, 0.64, m, 16)

def _fl_roof(p, lay, R, style, r):
    """The hangar's roof, by what the ship is."""
    x0, z0, x1, z1 = R['rect']; top = R['y1']; W = x1 - x0; xc = (x0 + x1) / 2; big = top - R['y0'] > 28; gh = 2.2 if big else 1.3
    if style in ('vault', 'truss', 'gantry'):
        nx = max(3, round(W / (22 if big else 15)))
        for k in range(nx + 1): x = x0 + W * k / nx; _ibeam(p, (x, top - gh / 2, z0 + 0.3), (x, top - gh / 2, z1 - 0.3), gh, 0.8 if big else 0.5, 'paint')
        z = z0 + (9 if big else 6)
        while z < z1 - 1: _ibeam(p, (x0 + 0.3, top - 0.45, z), (x1 - 0.3, top - 0.45, z), 0.9, 0.4, 'paint'); z += 12 if big else 9
    if style == 'truss':      # the bottom chords and the lacing between: an open roof
        nx = max(3, round(W / 15)); z = z0 + 6
        while z < z1 - 1:
            _beam(p, (x0 + 0.3, top - 2.6, z), (x1 - 0.3, top - 2.6, z), 0.22, 'paint'); m = int(W / 4.4)
            for k in range(m): a = x0 + W * k / m; b = x0 + W * (k + 1) / m; _beam(p, (a, top - 2.6 if k % 2 else top - 0.5, z), (b, top - 0.5 if k % 2 else top - 2.6, z), 0.12, 'metal')
            z += 9
    if style == 'gantry':     # travelling cranes on rails along the bay: each a pair of girders across, a crab on it, its hook drawn up
        for x in (x0 + 1.2, x1 - 1.2): _ibeam(p, (x, top - 4.4, z0 + 1), (x, top - 4.4, z1 - 1), 0.9, 0.6, 'soil')
        for zg in (z0 + (z1 - z0) * 0.3, z0 + (z1 - z0) * 0.72):
            for dz_ in (0, 3.2): _ibeam(p, (x0 + 1.2, top - 3.4, zg + dz_), (x1 - 1.2, top - 3.4, zg + dz_), 1.6, 0.7, 'hazard')
            tx = xc + r.uniform(-W * 0.25, W * 0.25); add_box(p, tx - 2.4, top - 4.4, zg - 0.4, tx + 2.4, top - 2.6, zg + 3.6, 'soil', 0); add_cyl(p, tx, zg + 1.6, top - 8.5, top - 4.4, 0.06, 'metal', 6); add_box(p, tx - 0.4, top - 9.3, zg + 1.2, tx + 0.4, top - 8.5, zg + 2.0, 'hazard', 0)
            for x in (x0 + 1.2, x1 - 1.2): add_box(p, x - 0.5, top - 5.0, zg - 0.6, x + 0.5, top - 2.6, zg + 3.8, 'soil', 0)
    if style == 'sky':        # a glass roof in a fine frame: the sky over the ship seen through it
        add_box(p, x0, top - 0.03, z0, x1, top - 0.012, z1, 'mirror', 0); nx = max(4, round(W / 12))
        for k in range(nx + 1): x = x0 + W * k / nx; _ibeam(p, (x, top - 0.7, z0 + 0.3), (x, top - 0.7, z1 - 0.3), 1.3, 0.3, 'ceramic')
        z = z0 + 6
        while z < z1 - 1: add_box(p, x0, top - 0.3, z - 0.08, x1, top, z + 0.08, 'ceramic', 0); z += 6
    if style == 'sleek':      # a flush dark ceiling with lines of light let into it, nothing hanging
        z = z0 + 4
        while z < z1 - 1: add_box(p, x0 + 2, top - 0.03, z - 0.06, x1 - 2, top - 0.01, z + 0.06, FL_LAMP[lay['theme'].get('bayLamp', 'warm')], 0); z += 8
        nx = max(2, round(W / 24))
        for k in range(1, nx): x = x0 + W * k / nx; add_box(p, x - 0.3, top - 0.5, z0 + 0.3, x + 0.3, top, z1 - 0.3, 'paint', 0)
    # services under it along both walls: a duct, pipe runs
    for (x, sx) in ((x0 + 1.0, 1), (x1 - 1.0, -1)):
        add_cyl(p, x, top * 0.62, z0 + 0.6, z1 - 0.6, 0.45, 'metal', 14, axis='z'); add_cyl(p, x - sx * 0.3, top * 0.62 - 0.8, z0 + 0.6, z1 - 0.6, 0.16, 'hazard', 10, axis='z'); add_cyl(p, x - sx * 0.3, top * 0.62 - 1.2, z0 + 0.6, z1 - 0.6, 0.11, 'paint', 8, axis='z')
        z = z0 + 5
        while z < z1 - 1: add_box(p, x - sx * 0.9 if sx > 0 else x, top * 0.62 - 0.05, z - 0.05, x if sx > 0 else x - sx * 0.9, top * 0.62 + 0.05, z + 0.05, 'metal', 0); z += 7

def _fl_paint(p, lay, R):
    """The hangar deck's paint: the lane's edges, the box to set down in, a box and a number for each stand, the threshold."""
    x0, z0, x1, z1 = R['rect']; y = R['y0']; xc = (x0 + x1) / 2; d0 = lay['doors'][0]; t = 0.006
    xs = [abs(b['x'] - xc) for b in lay['berths']]; lane = (min(xs) - 9.5) if xs else 20; line = lambda a, b, c, d, m='hazard': add_box(p, min(a, c), y, min(b, d), max(a, c), y + t, max(b, d), m, 0)
    for s in (-1, 1):
        z = z0 + 3
        while z < z1 - 14: line(xc + s * lane - 0.15, z, xc + s * lane + 0.15, z + 4); z += 6
    zc = (z0 + z1) / 2 - 2
    for (a, b, c, d) in ((-10, -13, 10, -12.6), (-10, 12.6, 10, 13), (-10, -13, -9.6, 13), (9.6, -13, 10, 13)): line(xc + a, zc + b, xc + c, zc + d, 'ceramic')
    for k in range(-6, 7): line(xc + k * 1.6 - 0.5, zc - 0.2, xc + k * 1.6 + 0.5, zc + 0.2, 'ceramic') if k % 2 == 0 else None
    k = d0['x'] - d0['width'] / 2
    while k < d0['x'] + d0['width'] / 2 - 1: line(k, z0 + 0.3, k + 1.2, z0 + 1.5); k += 2.4
    for i, b in enumerate(lay['berths']):
        w, d = (7.5, 10.5) if abs(b['x'] - xc) < 0 else (8.2, 12.5); bx, bz = b['x'], b['z']
        for (a, c, e, f) in ((-w, -d, w, -d + 0.2), (-w, d - 0.2, w, d), (-w, -d, -w + 0.2, d), (w - 0.2, -d, w, d)): line(bx + a, bz + c, bx + e, bz + f, 'ceramic')
        _fl_text(p, str(i + 1).zfill(2), bx, y + 0.02, bz - d + 1.6, 0, 1.5, 'ceramic') if False else None
        for (dx, dz) in ((-w + 1.2, -d + 1.2), (w - 1.2, -d + 1.2), (-w + 1.2, d - 1.2), (w - 1.2, d - 1.2)): add_cyl(p, bx + dx, bz + dz, y, y + 0.02, 0.14, 'metal', 8)

def fleet_decks(p, lay, name):
    r = random.Random(name + '-in'); rooms = lay['rooms']; look = FL_LOOK[lay['theme']['look']]; BAY = rooms[0]
    floor_of = lambda R: look['bay'] if R['i'] == 0 else look['floor'].get(R['purpose'], look['floor']['_'])
    for S in lay['slabs']:
        for (x0, z0, x1, z1) in S['rects']:
            if S.get('roof'): add_box(p, x0, S['y'] - 0.2, z0, x1, S['y'] + 0.1, z1, 'heatshield' if lay['theme']['look'] in ('navy', 'black', 'works') else 'paint', 0); continue
            R = _fl_room_at(lay, (x0 + x1) / 2, (z0 + z1) / 2, S['y'] + 0.1) or BAY; mat, size = floor_of(R)
            if abs(S['y'] - R['y0']) > 0.05 and S['y'] - R['y0'] < 1.2 and (x1 - x0) < (R['rect'][2] - R['rect'][0]) - 0.5: mat, size = ('metal', 1.5) if mat != 'wood' else ('wood', 0.3)      # a step up or down in a floor: its own plating, an edge strip
            _fl_plates(p, x0, z0, x1, z1, S['y'], size, mat)
    for w in lay['walls']:
        R = rooms[w['room']] if 'room' in w else None
        if w.get('stair'): continue
        if w.get('rail'): _fl_rail(p, w)
        elif w.get('screen'):      # a timber and glass screen across a room
            box, along, (a0, a1), n = _fl_wallbox(p, w, R); box(a0, a1, -0.05, 0.05, w['y0'], w['y0'] + 1.0, 'wood'); box(a0, a1, -0.012, 0.012, w['y0'] + 1.0, w['y1'] - 0.1, 'glass'); box(a0, a1, -0.06, 0.06, w['y1'] - 0.1, w['y1'], 'wood')
            for k in range(int((a1 - a0) / 1.2) + 1): u = a0 + k * 1.2; box(u - 0.03, u + 0.03, -0.06, 0.06, w['y0'], w['y1'], 'wood')
        elif w.get('glass'): _fl_glass(p, lay, w, R, R.get('slit', False))
        else: _fl_lining(p, lay, w, R, r, look)
    for R in lay['ramps']: _fl_stair(p, R)
    _fl_props(p, lay); print('fleet props', name, sorted(FL_COUNT.items(), key=lambda q: -q[1])[:8]); FL_COUNT.clear()
    for L in lay['lights']: _fl_light(p, L, rooms[L['room']])
    for S in lay['signs']: _fl_text(p, S['text'], S['x'], S['y'], S['z'], S['face'], S['size'], S.get('col', 'glow'))
    _fl_roof(p, lay, BAY, lay['theme'].get('roof', 'vault'), r); _fl_paint(p, lay, BAY)
    # the low spaces: a beam across every few metres under the deck above; a bridge under glass (the city's): the sky in panes
    for R in rooms[1:]:
        x0, z0, x1, z1 = R['rect']; top = R['y1']
        if R.get('sky'):
            add_box(p, x0, top - 0.03, z0, x1, top - 0.012, z1, 'mirror', 0); z = z0
            while z <= z1: add_box(p, x0, top - 0.3, z - 0.06, x1, top, z + 0.06, 'ceramic', 0); z += 3
            for k in range(7): x = x0 + (x1 - x0) * k / 6; add_box(p, x - 0.06, top - 0.3, z0, x + 0.06, top, z1, 'ceramic', 0)
        elif top - R['y0'] < 9 and R['purpose'] != 'lift':
            z = z0 + 1.75
            while z < z1: add_box(p, x0, top - 0.22, z - 0.1, x1, top, z + 0.1, 'paint', 0); z += 3.5
        else:
            z = z0 + 6
            while z < z1: _ibeam(p, (x0, top - 0.5, z), (x1, top - 0.5, z), 1.0, 0.4, 'paint'); z += 8

def _fl_bake(me, lay):
    """The light of the place, worked out here and kept in the model (a colour at every corner of every face): each space lit by its own fittings, falling
    off with distance, more on what faces the light; the hangar also by the day coming in at its mouth. Kept as the square root of a quarter of it."""
    nl = len(me.loops); vi = np.empty(nl, np.int32); me.loops.foreach_get('vertex_index', vi)
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    npoly = len(me.polygons); pn = np.empty(npoly * 3, np.float32); me.polygons.foreach_get('normal', pn); pn = pn.reshape(-1, 3)
    pc = np.empty(npoly * 3, np.float32); me.polygons.foreach_get('center', pc); pc = pc.reshape(-1, 3); lt = np.empty(npoly, np.int32); me.polygons.foreach_get('loop_total', lt)
    lp = np.repeat(np.arange(npoly), lt); tol = lambda a: np.stack([a[:, 0], a[:, 2], -a[:, 1]], 1)
    Pp = tol(co)[vi]; Nn = tol(pn)[lp]; C = tol(pc)
    room = np.zeros(npoly, np.int32); area = np.full(npoly, 1e12, np.float32)
    for R in lay['rooms']:
        x0, z0, x1, z1 = R['rect']; m = (C[:, 0] > x0 - 0.36) & (C[:, 0] < x1 + 0.36) & (C[:, 2] > z0 - 0.36) & (C[:, 2] < z1 + 0.36) & (C[:, 1] > R['y0'] - 1.3) & (C[:, 1] < R['y1'] + 0.5); a = (x1 - x0) * (z1 - z0)
        m &= a < area; room[m] = R['i']; area[m] = a
    rl = room[lp]; out = np.zeros((nl, 3), np.float32); amb = np.array(FL_LOOK[lay['theme']['look']]['amb'], np.float32); HD = lay['hangar']['depth']
    for R in lay['rooms']:
        m = rl == R['i']
        if not m.any(): continue
        Pm = Pp[m]; Nm = Nn[m]; E = np.tile(amb * (1.0 if R['i'] else 1.15), (len(Pm), 1))
        for L in lay['lights']:
            if L['room'] != R['i']: continue
            d = np.array(L['p'], np.float32)[None, :] - Pm; dist = np.sqrt((d * d).sum(1)) + 1e-3; ndl = (Nm * d).sum(1) / dist
            w = L['I'] * (0.35 + 0.65 * np.clip(ndl, 0, 1)) / (1 + (dist / L['R']) ** 2) ** 2
            E += w[:, None] * np.array(FL_COL[L['col']], np.float32)[None, :] * 1.25
        if R['i'] == 0:
            t = np.clip((Pm[:, 2] - 2) / (HD * 0.8), 0, 1); day = (1 - t * t * (3 - 2 * t)) * 1.0 * (0.45 + 0.55 * np.clip(-Nm[:, 2] * 0.6 + Nm[:, 1] * 0.5 + 0.4, 0, 1)); E += day[:, None] * np.array((0.72, 0.84, 1.0), np.float32)[None, :]
        # corners: where a wall meets the floor it's darker
        out[m] = E
    enc = np.sqrt(np.clip(out / 4.0, 0, 1)); rgba = np.concatenate([enc, np.ones((nl, 1), np.float32)], 1)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); ca.data.foreach_set('color', rgba.ravel()); me.color_attributes.active_color = ca; me.color_attributes.render_color_index = 0
    print('fleet baked', nl, 'corners')
