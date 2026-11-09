# The Meridian's spin rings, inside: built from the same layout the game walks (assets/ships/rings.json, written by tools/gen-rings.mjs from
# js/gen/rings.js), then bent round the ring. Long things that run with the ring (floor, streets, the canal, the vault) are made as surfaces
# of revolution; everything else is built straight in the flat frame and set down whole at its place on the curve, as a house stands on a hill.
#
# Flat frame: x across the floor 0..W, y up from it toward the axle, s along the ring. Ring frame (what's exported): the axle is z, the floor
# at radius Rf; a point (x, y, s) goes to  (rho sin a, -rho cos a, W/2 - x)  with  a = s / Rf, rho = Rf - y.  js/render/rings.js uses the same.
# Exec'd by build.py after capital_kit.py.

_add_box0 = add_box
def _flat_box(part, x0, y0, z0, x1, y1, z1, mat, bevel=0.0, seg=2): _add_box0(part, x0, y0, z0, x1, y1, z1, mat, 0)     # (at this size a bevel is faces nobody sees)
def _bar(p, a, b, w, mat='metal'):
    """A square-section member from a to b."""
    bm = bmesh.new(); d = mathutils.Vector(b) - mathutils.Vector(a); L = d.length
    if L < 1e-4: bm.free(); return
    d = d / L; up = mathutils.Vector((0, 1, 0)) if abs(d.y) < 0.9 else mathutils.Vector((1, 0, 0)); s = d.cross(up).normalized() * w / 2; u = s.cross(d).normalized() * w / 2
    A, B = mathutils.Vector(a), mathutils.Vector(b); rs = [[bm.verts.new(P(*(c + q))) for q in (s + u, -s + u, -s - u, s - u)] for c in (A, B)]
    for k in range(4): bm.faces.new([rs[0][k], rs[0][(k + 1) % 4], rs[1][(k + 1) % 4], rs[1][k]])
    bm.faces.new(rs[0][::-1]); bm.faces.new(rs[1]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, mat)

def _bend(x, y, s, Rf, W):
    a = s / Rf; rho = Rf - y; return (rho * math.sin(a), -rho * math.cos(a), W / 2 - x)

class Ring:
    N = 12            # built in sections round the ring, each its own mesh, so what's behind you isn't drawn
    def __init__(R, lay):
        R.L = lay; R.Rf = lay['Rf']; R.W = lay['W']; R.C = lay['C']; R.parts = [Part() for _ in range(R.N)]
    def part(R, s): return R.parts[int((s % R.C) / R.C * R.N) % R.N]
    def at(R, x, y, s): return _bend(x, y, s, R.Rf, R.W)
    def emit(R, tmp, s0, mirror_x=None):
        """Set a piece built straight (in flat coordinates) down whole on the curve at s0: as a rigid body, so nothing in it bends."""
        a = s0 / R.Rf; c, sn = math.cos(a), math.sin(a)
        if mirror_x is not None:
            for v in tmp.bm.verts: bx, by, bz = v.co; v.co = (2 * mirror_x - bx, by, bz)
            bmesh.ops.reverse_faces(tmp.bm, faces=list(tmp.bm.faces))
        for v in tmp.bm.verts:
            bx, by, bz = v.co; x, y, z = bx, bz, -by                        # Blender → flat (x, y, s)
            rho = R.Rf - y; dz = z - s0
            v.co = P(rho * sn + dz * c, -rho * c + dz * sn, R.W / 2 - x)
        m = bpy.data.meshes.new('tmp'); tmp.bm.to_mesh(m); tmp.bm.free(); R.part(s0).bm.from_mesh(m); bpy.data.meshes.remove(m)
    def revolve(R, prof, mat, s0=0.0, s1=None, step=3.0):
        """A surface swept along the ring through a section (x, y) points; you see it from the left of the way the section runs. Cut where the sections meet."""
        s1 = R.C if s1 is None else s1; cuts = sorted({s0, s1, *[k * R.C / R.N for k in range(R.N + 1) if s0 < k * R.C / R.N < s1]})
        for a, b in zip(cuts, cuts[1:]):
            if b - a > 1e-3: R._revolve(prof, mat, a, b, step)
    def _revolve(R, prof, mat, s0, s1, step):
        n = max(1, int(math.ceil((s1 - s0) / step))); bm = bmesh.new()
        rows = [[bm.verts.new(P(*R.at(x, y, s0 + (s1 - s0) * k / n))) for (x, y) in prof] for k in range(n + 1)]
        for k in range(n):
            sm = s0 + (s1 - s0) * (k + 0.5) / n
            for i in range(len(prof) - 1):
                (xa, ya), (xb, yb) = prof[i], prof[i + 1]; dx, dy = xb - xa, yb - ya; l = math.hypot(dx, dy) or 1
                f = bm.faces.new([rows[k][i], rows[k][i + 1], rows[k + 1][i + 1], rows[k + 1][i]]); f.normal_update()
                cx, cy = (xa + xb) / 2, (ya + yb) / 2; A = mathutils.Vector(P(*R.at(cx, cy, sm))); B = mathutils.Vector(P(*R.at(cx - dy / l * 0.2, cy + dx / l * 0.2, sm)))
                if f.normal.dot(B - A) < 0: f.normal_flip()
        merge(R.part((s0 + s1) / 2), bm, mat)
    def ribbon(R, pts, half, y, mat, lift=0.0):
        """A strip that wanders: a path, a stream. pts: (x, s) along it; bent vertex by vertex (they're close together). In runs, one to a section."""
        runs = [[]]
        for q in pts:
            if runs[-1] and R.part(q[1]) is not R.part(runs[-1][-1][1]): runs.append([runs[-1][-1]])
            runs[-1].append(q)
        for run in runs:
            if len(run) > 1: R._ribbon(run, half, y, mat, lift)
    def _ribbon(R, pts, half, y, mat, lift=0.0):
        bm = bmesh.new(); prev = None
        for i, (x, s) in enumerate(pts):
            nx = pts[min(i + 1, len(pts) - 1)][0] - pts[max(i - 1, 0)][0]; ns = pts[min(i + 1, len(pts) - 1)][1] - pts[max(i - 1, 0)][1]; l = math.hypot(nx, ns) or 1
            ox, os_ = ns / l * half, -nx / l * half
            row = (bm.verts.new(P(*R.at(x - ox, y + lift, s - os_))), bm.verts.new(P(*R.at(x + ox, y + lift, s + os_))))
            if prev: f = bm.faces.new([prev[0], prev[1], row[1], row[0]]); f.normal_update(); (f.normal_flip() if f.normal.dot(mathutils.Vector(P(*R.at(x, y + 1, s))) - mathutils.Vector(P(*R.at(x, y, s)))) < 0 else None)
            prev = row
        merge(R.part(pts[len(pts) // 2][1]), bm, mat)

def _fur(builder, L, D, H, x, s, rot, r):
    """A piece of furniture from the props kit, its own frame turned (quarter turns) and centred at (x, s) on the flat."""
    tmp = Part(); builder(tmp, L, D, H, r)
    for v in tmp.bm.verts:
        bx, by, bz = v.co; px, py, pz = bx - L / 2, bz, -by - D / 2
        for _ in range(rot % 4): px, pz = pz, -px
        v.co = P(x + px, py, s + pz)
    for f in tmp.bm.faces:
        if f.material_index == SLOTS.index('tint'): f.material_index = SLOTS.index('fabric')
    return tmp

# ---------- the shell: the vault over everything, ribs across it, the sunline down its crown, windows either side of it
def _vault_prof(W, inset=0.4, n=40):
    """The tube's section above the floor, from the far side over to the near (so it's seen from inside)."""
    out = []
    for k in range(n + 1):
        x = W - W * k / n; w = (x - W / 2) / 32.0; q = max(0.0, 1 - abs(w) ** 3); out.append((x, 14 + 20 * q ** (1 / 3) - inset))
    return out

def _shell(R, glass_half=8.0, glazed=False, panel='tint'):
    W = R.W; prof = _vault_prof(W); xs = [q[0] for q in prof]
    # split the vault into side panels and the glazed crown
    side_a = [q for q in prof if q[0] >= W / 2 + glass_half]; crown = [q for q in prof if abs(q[0] - W / 2) <= glass_half]; side_b = [q for q in prof if q[0] <= W / 2 - glass_half]
    if glazed: side_a = [q for q in side_a if q[1] < 7.5] + [q for q in prof if q[0] >= W / 2 + glass_half and q[1] >= 7.5][:0]
    R.revolve([(W, -0.2)] + side_a, panel); R.revolve(side_b + [(0, -0.2)], panel)
    R.revolve(crown, 'glass', step=6)
    # the ribs: an arch every twelve metres, the hull's frames; purlins along the crown between them
    for k in range(int(R.C / 12)):
        s = k * 12 + 6; tmp = Part()
        pr = _vault_prof(W, 0.9, 30)
        for (xa, ya), (xb, yb) in zip(pr, pr[1:]): _bar(tmp, (xa, ya, s), (xb, yb, s), 0.55, 'metal')
        R.emit(tmp, s)
    for dx in (-glass_half, -glass_half / 2, 0, glass_half / 2, glass_half):
        x = W / 2 + dx; y = 14 + 20 * max(0.0, 1 - abs(dx / 32) ** 3) ** (1 / 3) - 0.7
        R.revolve([(x - 0.18, y), (x + 0.18, y), (x + 0.18, y - 0.3), (x - 0.18, y - 0.3), (x - 0.18, y)], 'metal', step=4)
    # the sunline: a bright line hung under the crown, its light the ring's daylight
    yc = 34 - 2.6
    R.revolve([(W / 2 + 0.5, yc), (W / 2, yc - 0.5), (W / 2 - 0.5, yc), (W / 2, yc + 0.5), (W / 2 + 0.5, yc)], 'navwhite', step=4)
    for k in range(int(R.C / 24)):
        s = k * 24; tmp = Part(); _beam(tmp, (W / 2, yc + 0.4, s), (W / 2, 34 - 0.6, s), 0.08, 'metal'); R.emit(tmp, s)

def _station(R, it):
    """Where a spoke comes down: a lift tower of glass in a steel frame rising to the vault, doors at the foot, a collar where it meets the crown."""
    x, s = it['x'], it['s']; tmp = Part(); top = 34 - 0.6
    for (dx, dz) in ((-3, -3), (3, -3), (3, 3), (-3, 3)): add_box(tmp, x + dx - 0.25, 0, s + dz - 0.25, x + dx + 0.25, top, s + dz + 0.25, 'metal', 0.02)
    for (a, b, c, d) in ((-2.75, -2.8, 2.75, -2.75), (-2.75, 2.75, 2.75, 2.8), (-2.8, -2.75, -2.75, 2.75), (2.75, -2.75, 2.8, 2.75)): add_box(tmp, x + a, 3.2, s + b, x + c, top, s + d, 'glass', 0)
    for y in range(4, int(top), 4): add_box(tmp, x - 3.1, y, s - 3.1, x + 3.1, y + 0.3, s + 3.1, 'metal', 0)
    for sd in (-1, 1):
        add_box(tmp, x - 2.75, 0, s + sd * 2.78 - 0.04, x - 0.05, 2.6, s + sd * 2.78 + 0.04, 'metal', 0.01); add_box(tmp, x + 0.05, 0, s + sd * 2.78 - 0.04, x + 2.75, 2.6, s + sd * 2.78 + 0.04, 'metal', 0.01)
        add_box(tmp, x - 2.9, 2.6, s + sd * 2.8 - 0.06, x + 2.9, 3.2, s + sd * 2.8 + 0.06, 'paint', 0.01); add_box(tmp, x - 1.2, 2.72, s + sd * 2.86 - 0.02, x + 1.2, 3.08, s + sd * 2.86 + 0.02, 'screen', 0)
        add_box(tmp, x - 2.75, 0, s - 2.75, x + 2.75, 0.04, s + 2.75, 'stone', 0)
    add_cyl(tmp, x, s, top - 1.4, top + 0.6, 5.4, 'tint', 32); add_cyl(tmp, x, s, top - 1.6, top - 1.4, 5.6, 'lampwarm', 32)
    # the cab, part way up, in its shaft
    add_box(tmp, x - 2.2, 12, s - 2.2, x + 2.2, 15, s + 2.2, 'tint', 0.05); add_box(tmp, x - 2.0, 15, s - 2.0, x + 2.0, 15.2, s + 2.0, 'lampwarm', 0)
    R.emit(tmp, s)

FACADES = ('render', 'brick', 'ceramic', 'laminate', 'plastic', 'tint', 'concrete', 'plank')
def _house(R, it, r):
    """A town house, as it's built: a plinth, its walls, string courses at the floors, windows each in a frame with a sill (lit where someone's home),
    a shopfront at the foot of it or a front door up its steps, balconies on some, a cornice and parapet, things on the roof."""
    x0, x1, s0, s1 = 1.0, 11.0, it['s0'] + 0.04, it['s1'] - 0.04; w = s1 - s0; F = it['floors']; H = 3.3; top = F * H + 0.6; fx = x1     # built facing +x, then turned
    face = FACADES[it['colour'] % len(FACADES)]; trim = 'stone' if it['style'] % 2 else 'paint'; tmp = Part()
    add_box(tmp, x0, 0, s0, x1 - 0.12, top, s1, face, 0.02)
    add_box(tmp, x1 - 0.15, 0, s0, x1 + 0.08, 0.55, s1, 'stone', 0.01)                                     # plinth
    for k in range(1, F + 1): add_box(tmp, x1 - 0.15, k * H - 0.18 + 0.6, s0, x1 + 0.1, k * H + 0.6, s1, trim, 0.01)     # string courses
    add_box(tmp, x1 - 0.2, top, s0, x1 + 0.28, top + 0.35, s1, trim, 0.02); add_box(tmp, x1 - 0.3, top + 0.35, s0, x1 - 0.05, top + 1.15, s1, face, 0.01)   # cornice, parapet
    nwin = max(1, int(w / 2.6))
    for k in range(F):
        y0 = 0.6 + k * H + 0.85
        if k == 0 and it['shop']:
            # a shopfront: pilasters, a long window lit from inside, a door, a fascia with the name, an awning
            add_box(tmp, x1 - 0.1, 0.55, s0 + 0.2, x1 + 0.12, 3.6, s0 + 0.55, trim, 0.01); add_box(tmp, x1 - 0.1, 0.55, s1 - 0.55, x1 + 0.12, 3.6, s1 - 0.2, trim, 0.01)
            add_box(tmp, x1 - 0.3, 0.75, s0 + 0.6, x1 - 0.16, 3.0, s1 - 1.9, 'lampwarm', 0); add_box(tmp, x1 - 0.12, 0.75, s0 + 0.6, x1 - 0.06, 3.0, s1 - 1.9, 'glass', 0)
            for q in range(1, max(2, int((w - 2.5) / 1.6))): zz = s0 + 0.6 + q * (w - 2.5) / max(2, int((w - 2.5) / 1.6)); add_box(tmp, x1 - 0.1, 0.75, zz - 0.03, x1 + 0.0, 3.0, zz + 0.03, 'metal', 0)
            add_box(tmp, x1 - 0.2, 0.55, s1 - 1.75, x1 - 0.08, 2.75, s1 - 0.65, 'wood', 0.01)
            add_box(tmp, x1 - 0.08, 3.05, s0 + 0.5, x1 + 0.14, 3.6, s1 - 0.5, 'paint', 0.01); add_box(tmp, x1 + 0.14, 3.15, s0 + 1.0, x1 + 0.17, 3.5, s0 + 1.0 + min(4.0, w - 2), ('neonamber', 'neoncyan', 'neonpink', 'neongreen')[it['k'] % 4], 0)
            bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((x1 + 0.1, 3.0, s0 + 0.5), (x1 + 0.1, 3.0, s1 - 0.5), (x1 + 1.6, 2.5, s1 - 0.5), (x1 + 1.6, 2.5, s0 + 0.5))]; bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.03); merge(tmp, bm, ('fabric', 'leather', 'books', 'rubber')[it['k'] % 4] if False else 'fabric')
            for zz in (s0 + 0.55, s1 - 0.55): _beam(tmp, (x1 + 0.1, 2.75, zz), (x1 + 1.55, 2.52, zz), 0.03, 'metal')
            continue
        for j in range(nwin):
            zc = s0 + w * (j + 0.5) / nwin
            if k == 0 and j == nwin - 1:
                # the front door: steps, a frame, a lamp beside it
                add_box(tmp, x1 - 0.2, 0.55, zc - 0.55, x1 - 0.06, 2.9, zc + 0.55, 'wood', 0.01); add_box(tmp, x1 - 0.1, 0.55, zc - 0.7, x1 + 0.08, 3.05, zc - 0.55, trim, 0.01); add_box(tmp, x1 - 0.1, 0.55, zc + 0.55, x1 + 0.08, 3.05, zc + 0.7, trim, 0.01); add_box(tmp, x1 - 0.1, 2.9, zc - 0.7, x1 + 0.12, 3.12, zc + 0.7, trim, 0.01)
                for q in range(3): add_box(tmp, x1 - 0.1 + q * 0.3, 0, zc - 0.8, x1 + 0.9 - q * 0.0, 0.55 - q * 0.18, zc + 0.8, 'stone', 0.01) if q == 0 else add_box(tmp, x1 - 0.1, 0, zc - 0.8, x1 + 0.9 - q * 0.3, 0.55 - q * 0.18 + 0.18, zc + 0.8, 'stone', 0.01)
                add_box(tmp, x1 + 0.0, 2.2, zc + 0.85, x1 + 0.2, 2.5, zc + 1.05, 'lampwarm', 0.01)
                continue
            lit = r.random() < 0.45; ww = 0.62 if it['style'] < 3 else 0.9
            add_box(tmp, x1 - 0.2, y0, zc - ww, x1 - 0.05, y0 + 1.7, zc + ww, 'lampwarm' if lit else 'visor', 0)
            add_box(tmp, x1 - 0.3, y0 - 0.09, zc - ww - 0.1, x1 - 0.08, y0 + 1.79, zc + ww + 0.1, 'wood' if it['style'] in (0, 4) else 'paint', 0)       # the frame, the pane set in it
            add_box(tmp, x1 - 0.06, y0 + 1.05, zc - ww, x1 - 0.02, y0 + 1.1, zc + ww, 'wood' if it['style'] in (0, 4) else 'paint', 0)
            add_box(tmp, x1 - 0.14, y0 - 0.16, zc - ww - 0.14, x1 + 0.12, y0 - 0.06, zc + ww + 0.14, 'stone', 0.01)       # sill
            if it['style'] in (1, 3) and k > 0:
                add_box(tmp, x1 - 0.1, y0 - 0.2, zc - ww - 0.35, x1 + 0.95, y0 - 0.06, zc + ww + 0.35, 'stone', 0.01)       # a balcony and its rail
                add_box(tmp, x1 + 0.88, y0 - 0.06, zc - ww - 0.3, x1 + 0.9, y0 + 0.86, zc + ww + 0.3, 'glass', 0); add_box(tmp, x1 + 0.86, y0 + 0.86, zc - ww - 0.33, x1 + 0.94, y0 + 0.92, zc + ww + 0.33, 'metal', 0)
                for zz in (zc - ww - 0.3, zc + ww + 0.3): add_box(tmp, x1 + 0.86, y0 - 0.06, zz - 0.03, x1 + 0.94, y0 + 0.86, zz + 0.03, 'metal', 0)
                if r.random() < 0.5: add_box(tmp, x1 + 0.3, y0 - 0.06, zc - ww - 0.2, x1 + 0.7, y0 + 0.25, zc - ww + 0.2, 'concrete', 0.01); add_blob(tmp, x1 + 0.5, y0 + 0.4, zc - ww, 0.28, 'leaf', r, 1)
    # the roof: a garden in planters, a vent stack, a water tank on legs
    if it['roof'] == 0:
        for q in range(max(1, int(w / 3))): zz = s0 + 1 + q * 3; add_box(tmp, x0 + 3, top, zz, x0 + 6, top + 0.5, zz + 1.6, 'concrete', 0.01); add_blob(tmp, x0 + 4.5, top + 0.75, zz + 0.8, 0.6, 'leaf', r, 1)
    else:
        add_cyl(tmp, x0 + 3, s0 + w / 2, top, top + 1.8, 0.3, 'metal', 10); add_cyl(tmp, x0 + 6, s0 + w * 0.3, top + 1.0, top + 2.6, 0.9, 'corrugated', 16)
        for (a, b) in ((-0.6, -0.6), (0.6, -0.6), (0.6, 0.6), (-0.6, 0.6)): _beam(tmp, (x0 + 6 + a, top, s0 + w * 0.3 + b), (x0 + 6 + a, top + 1.0, s0 + w * 0.3 + b), 0.06, 'metal')
    R.emit(tmp, (s0 + s1) / 2, mirror_x=(R.W / 2) if it['side'] == 1 else None)

def _tree_pit(R, it):
    tmp = Part(); x, s = it['x'], it['s']; add_box(tmp, x - 0.7, 0.0, s - 0.7, x + 0.7, 0.06, s + 0.7, 'soil', 0); add_box(tmp, x - 0.78, 0, s - 0.78, x + 0.78, 0.1, s - 0.7, 'stone', 0); add_box(tmp, x - 0.78, 0, s + 0.7, x + 0.78, 0.1, s + 0.78, 'stone', 0); add_box(tmp, x - 0.78, 0, s - 0.7, x - 0.7, 0.1, s + 0.7, 'stone', 0); add_box(tmp, x + 0.7, 0, s - 0.7, x + 0.78, 0.1, s + 0.7, 'stone', 0)
    R.emit(tmp, s)

def _lamp(R, it):
    tmp = Part(); x, s = it['x'], it['s']
    add_cyl(tmp, x, s, 0, 0.35, 0.14, 'paint', 12); add_cyl(tmp, x, s, 0.35, 4.0, 0.06, 'paint', 10, r2=0.045)
    add_cyl(tmp, x, s, 3.95, 4.05, 0.12, 'metal', 12); add_cyl(tmp, x, s, 4.05, 4.45, 0.2, 'lampwarm', 12, r2=0.14); add_cyl(tmp, x, s, 4.45, 4.55, 0.22, 'paint', 12, r2=0.05)
    R.emit(tmp, s)

def _bench(R, it, r):
    rot = {0: 0, 1: 1, 2: 2, 3: 3}[it['face']]; R.emit(_fur(bench, 2.0, 0.5, 0.45, it['x'], it['s'], rot, r), it['s'])

def _stall(R, it, r):
    tmp = Part(); x, s = it['x'], it['s']; col = ('neonamber', 'neoncyan', 'neonpink', 'neongreen', 'neonviolet', 'hazard')[it['colour'] % 6]
    for (dx, dz) in ((-1.3, -1.5), (1.3, -1.5), (1.3, 1.5), (-1.3, 1.5)): add_cyl(tmp, x + dx, s + dz, 0, 2.5, 0.05, 'wood', 8)
    add_box(tmp, x - 1.3, 0.85, s - 1.5, x + 1.3, 0.95, s + 1.5, 'wood', 0.01); add_box(tmp, x - 1.25, 0, s - 1.45, x + 1.25, 0.85, s + 1.45, 'plank', 0.01)
    for k in range(6):                      # a striped canopy
        z0 = s - 1.6 + k * 3.2 / 6; add_box(tmp, x - 1.5, 2.5 + 0.12 * (k % 2), z0, x + 1.5, 2.56 + 0.12 * (k % 2), z0 + 3.2 / 6, 'fabric' if k % 2 else col, 0.005)
    for q in range(5): add_box(tmp, x - 1.0 + q * 0.42, 0.95, s - 1.2, x - 0.7 + q * 0.42, 1.2, s - 0.4, 'cardboard', 0.01); add_blob(tmp, x - 0.85 + q * 0.42, 1.28, s - 0.8, 0.13, r.choice(('leaf', 'neonamber', 'hazard')), r, 1)
    R.emit(tmp, s)

def _table(R, it, r):
    x, s = it['x'], it['s']; tmp = _fur(table, 1.0, 1.0, 0.75, x, s, 0, r)
    for d in (-0.85, 0.85): q = _fur(chair, 0.5, 0.5, 0.9, x, s + d, 0 if d > 0 else 2, r); m = bpy.data.meshes.new('t'); q.bm.to_mesh(m); q.bm.free(); tmp.bm.from_mesh(m); bpy.data.meshes.remove(m)
    add_cyl(tmp, x, s, 0.75, 2.4, 0.025, 'metal', 8); add_cyl(tmp, x, s, 2.2, 2.45, 1.3, 'fabric', 16, r2=0.05)
    R.emit(tmp, s)

def _fountain(R, it):
    tmp = Part(); x, s, rr = it['x'], it['s'], it['r']
    add_cyl(tmp, x, s, 0, 0.6, rr, 'stone', 40); add_cyl(tmp, x, s, 0.6, 0.66, rr - 0.3, 'visor', 40)
    add_cyl(tmp, x, s, 0.6, 1.8, 0.35, 'stone', 16); add_cyl(tmp, x, s, 1.8, 2.0, 1.2, 'stone', 24, r2=0.6); add_cyl(tmp, x, s, 2.0, 2.05, 1.1, 'visor', 24)
    add_cyl(tmp, x, s, 2.0, 2.9, 0.18, 'stone', 12); add_cyl(tmp, x, s, 2.9, 3.0, 0.5, 'stone', 16, r2=0.3)
    R.emit(tmp, s)

def _bridge(R, it):
    """A bridge over the canal: its deck level with the street, an arch under it, a balustrade either side."""
    tmp = Part(); s0, s1 = it['s0'], it['s1']
    add_box(tmp, 23.6, -0.35, s0, 30.4, 0.02, s1, 'stone', 0.01)
    bm = bmesh.new(); n = 12; vs = []
    for k in range(n + 1):
        x = 24 + 6 * k / n; y = -0.35 - 0.9 * (1 - ((x - 27) / 3) ** 2); vs.append(x)
    for (a, b) in zip(range(n), range(1, n + 1)):
        xa, xb = 24 + 6 * a / n, 24 + 6 * b / n; ya, yb = -0.35 - 0.9 * (1 - ((xa - 27) / 3) ** 2) * 0 - 0.35 * (1 - ((xa - 27) / 3) ** 2), -0.35 - 0.35 * (1 - ((xb - 27) / 3) ** 2)
        add_box(tmp, xa, min(ya, yb) - 0.1, s0 + 0.1, xb, -0.35, s1 - 0.1, 'stone', 0)
    for z in (s0 + 0.06, s1 - 0.06):
        add_box(tmp, 23.6, 0, z - 0.12, 30.4, 0.18, z + 0.12, 'stone', 0.01); add_box(tmp, 23.6, 0.92, z - 0.15, 30.4, 1.08, z + 0.15, 'stone', 0.01)
        for q in range(15): xq = 23.9 + q * 6.2 / 14; add_cyl(tmp, xq, z, 0.18, 0.92, 0.07, 'stone', 8, r2=0.05)
    R.emit(tmp, (s0 + s1) / 2)

def _canal(R, runs):
    """The canal: a coping and low wall each side, its walls down to the water, the water dark and still."""
    for (a, b) in runs:
        if b - a < 0.5: continue
        R.revolve([(30.0, -0.9), (24.0, -0.9)], 'visor', a, b)
        R.revolve([(24.0, -1.7), (24.0, 0.0)][::-1] + [], 'stone', a, b) if False else None
        R.revolve([(24.15, 0.65), (24.15, -1.7)], 'stone', a, b); R.revolve([(29.85, -1.7), (29.85, 0.65)], 'stone', a, b)
        R.revolve([(23.85, 0.0), (23.85, 0.65), (24.15, 0.65)], 'stone', a, b); R.revolve([(29.85, 0.65), (30.15, 0.65), (30.15, 0.0)], 'stone', a, b)
        R.revolve([(23.8, 0.65), (23.8, 0.8), (24.2, 0.8), (24.2, 0.65)], 'concrete', a, b); R.revolve([(29.8, 0.65), (29.8, 0.8), (30.2, 0.8), (30.2, 0.65)], 'concrete', a, b)

def build_town(R, r):
    L = R.L; W = R.W; C = R.C
    # the ground: pavements, a kerb, the street in setts, grass verges with their trees, and the same again on the far side
    R.revolve([(0, 0), (14, 0)], 'stone'); R.revolve([(14, 0), (14.25, 0)], 'concrete'); R.revolve([(14.25, 0), (21, 0)], 'slate'); R.revolve([(21, 0), (23.85, 0)], 'leaf')
    R.revolve([(30.15, 0), (33, 0)], 'leaf'); R.revolve([(33, 0), (39.75, 0)], 'slate'); R.revolve([(39.75, 0), (40, 0)], 'concrete'); R.revolve([(40, 0), (W, 0)], 'stone')
    over = sorted([(i['s0'], i['s1']) for i in L['items'] if i['t'] in ('bridge', 'square')]); runs = []; s = 0
    for (a, b) in over:
        if a > s: runs.append((s, a))
        s = max(s, b)
    if s < C: runs.append((s, C))
    _canal(R, runs)
    for i in L['items']:
        if i['t'] == 'square':
            R.revolve([(23.85, 0.01), (30.15, 0.01)], 'stone', i['s0'], i['s1'])
            for x in (24, 30): R.revolve([(x - 0.15, 0.0), (x - 0.15, 0.02), (x + 0.15, 0.02), (x + 0.15, 0.0)], 'concrete', i['s0'], i['s1'])
    # up the walls above the houses: the hull's own flats, three storeys of them, each with its gallery, a glass rail along it, doors and windows behind
    for (x, sx) in ((0.0, 1), (W, -1)):
        R.revolve([(x + sx * 0.02, 14.4), (x + sx * 0.02, 27.6)][::(-1 if sx > 0 else 1)], 'render')
        for gy in (15.2, 19.6, 24.0):
            sl = [(x, gy), (x + sx * 1.7, gy), (x + sx * 1.7, gy - 0.28), (x, gy - 0.28)]; R.revolve(sl if sx > 0 else sl[::-1], 'stone')
            R.revolve([(x + sx * 1.62, gy), (x + sx * 1.62, gy + 1.0)], 'glass', step=6)
            rl = [(x + sx * 1.56, gy + 1.08), (x + sx * 1.7, gy + 1.08), (x + sx * 1.7, gy + 0.98), (x + sx * 1.56, gy + 0.98)]; R.revolve(rl if sx > 0 else rl[::-1], 'metal', step=4)
    for k in range(int(C / 3.5)):
        s = k * 3.5 + 1.75; tmp = Part()
        for (x, sx) in ((0.03, 1), (W - 0.03, -1)):
            for gy in (15.2, 19.6, 24.0):
                door = (k + int(gy)) % 4 == 0; lit = r.random() < 0.5; a_, b_ = (x, x + sx * 0.12) if sx > 0 else (x + sx * 0.12, x)
                y0, y1 = (gy, gy + 2.3) if door else (gy + 0.8, gy + 2.3)
                add_box(tmp, min(x, x + sx * 0.1), y0 - (0 if door else 0.12), s - 0.82, max(x, x + sx * 0.1), y1 + 0.12, s + 0.82, 'wood' if (k // 6) % 2 else 'paint', 0)
                add_box(tmp, min(x + sx * 0.05, x + sx * 0.14), y0, s - 0.7, max(x + sx * 0.05, x + sx * 0.14), y1, s + 0.7, 'lampwarm' if lit else 'visor', 0)
                if r.random() < 0.15: add_box(tmp, min(x + sx * 0.9, x + sx * 1.4), gy, s - 0.3, max(x + sx * 0.9, x + sx * 1.4), gy + 0.45, s + 0.3, 'concrete', 0); add_blob(tmp, x + sx * 1.15, gy + 0.7, s, 0.32, 'leaf', r, 1)
        R.emit(tmp, s)
    _shell(R, 7.0)
    for i in L['items']:
        t = i['t']
        if t == 'house': _house(R, i, r)
        elif t == 'tree': _tree_pit(R, i)
        elif t == 'lamp': _lamp(R, i)
        elif t == 'bench': _bench(R, i, r)
        elif t == 'stall': _stall(R, i, r)
        elif t == 'table': _table(R, i, r)
        elif t == 'fountain': _fountain(R, i)
        elif t == 'bridge': _bridge(R, i)
        elif t == 'station': _station(R, i)

def build_garden(R, r):
    L = R.L; W = R.W; C = R.C
    R.revolve([(0, 0), (W, 0)], 'leaf', step=2.5)
    # low stone walls along the hull, beds in them
    for (x, sx) in ((0.0, 1), (W, -1)): R.revolve([(x, 0), (x, 1.2), (x + sx * 1.6, 1.2), (x + sx * 1.6, 0)][::(1 if sx > 0 else -1)], 'stone'); R.revolve([(x + sx * 0.2, 1.21), (x + sx * 1.4, 1.21)][::(1 if sx > 0 else -1)], 'soil')
    R.ribbon([tuple(q) for q in L['path']], 1.25, 0.03, 'concrete'); R.ribbon([tuple(q) for q in L['path']], 1.45, 0.015, 'stone')
    R.ribbon([tuple(q) for q in L['stream']], 1.1, 0.02, 'visor'); R.ribbon([tuple(q) for q in L['stream']], 1.5, 0.01, 'rock')
    _shell(R, 26.0, glazed=True, panel='metal')
    # under the glass: misting pipes along the vault
    for dx in (-14, 14):
        x = W / 2 + dx; y = 14 + 20 * max(0.0, 1 - abs(dx / 32) ** 3) ** (1 / 3) - 1.6; R.revolve([(x - 0.06, y), (x + 0.06, y), (x + 0.06, y - 0.12), (x - 0.06, y - 0.12), (x - 0.06, y)], 'metal', step=4)
    flowers = ('neonpink', 'neonamber', 'neonviolet', 'hazard', 'navwhite')
    for i in L['items']:
        t = i['t']
        if t == 'bench': _bench(R, i, r)
        elif t == 'lamp': _lamp(R, i)
        elif t == 'station': _station(R, i)
        elif t == 'pond':
            tmp = Part(); x, s, rr = i['x'], i['s'], i['r']; add_cyl(tmp, x, s, -0.05, 0.25, rr + 0.6, 'stone', 64); add_cyl(tmp, x, s, 0.25, 0.27, rr, 'visor', 64)
            for q in range(14): a = r.uniform(0, 6.28); d = r.uniform(3, rr - 1); add_cyl(tmp, x + math.cos(a) * d, s + math.sin(a) * d, 0.27, 0.29, r.uniform(0.3, 0.6), 'leaf', 10)
            R.emit(tmp, s)
        elif t == 'pavilion':
            tmp = Part(); x, s, rr = i['x'], i['s'], i['r']; add_cyl(tmp, x, s, 0, 0.5, rr, 'stone', 32)
            for q in range(8): a = q * math.pi / 4; add_cyl(tmp, x + math.cos(a) * rr * 0.85, s + math.sin(a) * rr * 0.85, 0.5, 3.6, 0.12, 'metal', 10)
            st = [(s + rr * math.cos(math.pi / 2 * k / 8) * 0, 0, 0, 0, 0, 2) for k in range(1)]
            add_cyl(tmp, x, s, 3.6, 3.8, rr * 0.95, 'metal', 32); _sphere(tmp, x, 3.8, s, rr * 0.9, 'glass', 32, 8)
            R.emit(tmp, s)
        elif t == 'beds':
            for k in range(5):
                s0 = i['s0'] + k * (i['s1'] - i['s0']) / 5; tmp = Part(); xa, xb = i['x0'] + 2, i['x1'] - 2
                for (a, b) in ((xa, W / 2 - 3), (W / 2 + 3, xb)):
                    add_box(tmp, a, 0, s0 + 0.4, b, 0.35, s0 + 4.6, 'stone', 0.02); add_box(tmp, a + 0.15, 0.35, s0 + 0.55, b - 0.15, 0.38, s0 + 4.45, 'soil', 0)
                    for q in range(int((b - a) * 3)): add_blob(tmp, r.uniform(a + 0.3, b - 0.3), 0.55, r.uniform(s0 + 0.8, s0 + 4.2), r.uniform(0.12, 0.22), r.choice(flowers) if r.random() < 0.6 else 'leaf', r, 1)
                R.emit(tmp, s0 + 2.5)
        elif t == 'footbridge':
            tmp = Part(); x, s = i['x'], i['s']; add_box(tmp, x - 2.0, 0.15, s - 0.8, x + 2.0, 0.3, s + 0.8, 'plank', 0.01)
            for z in (s - 0.75, s + 0.75): add_box(tmp, x - 2.0, 0.3, z - 0.04, x + 2.0, 1.0, z + 0.04, 'wood', 0.01) if False else [add_cyl(tmp, x - 1.9 + q * 0.95, z, 0.3, 1.0, 0.04, 'wood', 6) for q in range(5)] + [_beam(tmp, (x - 2.0, 1.0, z), (x + 2.0, 1.0, z), 0.06, 'wood')]
            R.emit(tmp, s)

def build_farm(R, r):
    L = R.L; W = R.W; C = R.C
    R.revolve([(0, 0), (W, 0)], 'soil', step=2.5); R.revolve([(23, 0.02), (31, 0.02)], 'concrete')
    for i in L['items']:
        if i['t'] != 'crop': continue
        a, b = i['x0'], i['x1']; n = int((b - a) / 1.2); mat = ('thatch', 'leaf', 'leaf', 'leaf')[i['crop']]
        for k in range(n):
            x = a + k * 1.2 + 0.6
            if i['crop'] == 0: R.revolve([(x + 0.45, 0.0), (x + 0.3, 0.9), (x - 0.3, 0.9), (x - 0.45, 0.0)], 'thatch', i['s0'], i['s1'], step=4)
            elif i['crop'] == 1: R.revolve([(x + 0.4, 0.0), (x + 0.35, 0.3), (x, 0.42), (x - 0.35, 0.3), (x - 0.4, 0.0)], 'leaf', i['s0'], i['s1'], step=2)
            else:
                R.revolve([(x + 0.45, 0.0), (x + 0.45, 0.25), (x - 0.45, 0.25), (x - 0.45, 0.0)], 'stone', i['s0'], i['s1'], step=4)
                R.revolve([(x + 0.36, 0.26), (x + 0.2, 0.62), (x - 0.2, 0.62), (x - 0.36, 0.26)], 'leaf', i['s0'], i['s1'], step=2)
            if k % 4 == 3: R.revolve([(x + 0.66, 0.01), (x + 0.54, 0.01)], 'visor', i['s0'], i['s1'], step=4)
    _shell(R, 6.0, panel='tint')
    # grow-lights along the vault: long bars in rows
    for dx in (-16, -9, 9, 16):
        x = W / 2 + dx; y = 14 + 20 * max(0.0, 1 - abs(dx / 32) ** 3) ** (1 / 3) - 1.8
        R.revolve([(x - 0.25, y), (x + 0.25, y), (x + 0.25, y - 0.15), (x - 0.25, y - 0.15), (x - 0.25, y)], 'neonpink', step=4)
        R.revolve([(x - 0.3, y + 0.15), (x + 0.3, y + 0.15), (x + 0.3, y), (x - 0.3, y), (x - 0.3, y + 0.15)], 'metal', step=4)
    for i in L['items']:
        t = i['t']
        if t == 'station': _station(R, i)
        elif t == 'lamp': _lamp(R, i)
        elif t == 'barn':
            tmp = Part(); x0, x1, s0, s1 = i['x0'], i['x1'], i['s0'], i['s1']; h = 6.0
            add_box(tmp, x0, 0, s0, x1, h, s1, 'plank', 0.02); add_box(tmp, x0 - 0.1, 0, s0 - 0.1, x1 + 0.1, 0.5, s1 + 0.1, 'stone', 0.01)
            for (a, b) in ((x0 - 0.4, (x0 + x1) / 2), ((x0 + x1) / 2, x1 + 0.4)):
                bm = bmesh.new(); hi = 9.0; lo = h; ya, yb = (lo, hi) if a < (x0 + x1) / 2 - 0.01 else (hi, lo); vs = [bm.verts.new(P(*q)) for q in ((a, ya, s0 - 0.4), (b, yb, s0 - 0.4), (b, yb, s1 + 0.4), (a, ya, s1 + 0.4))]; bm.faces.new(vs); bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.12); merge(tmp, bm, 'corrugated')
            bm = bmesh.new(); xm = (x0 + x1) / 2
            for z in (s0, s1): bm.faces.new([bm.verts.new(P(*q)) for q in ((x0, h, z), (x1, h, z), (xm, 9.0, z))])
            bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.1); merge(tmp, bm, 'plank')
            dx = x1 if i['side'] == 0 else x0; sx = 1 if i['side'] == 0 else -1
            add_box(tmp, min(dx, dx + sx * 0.12), 0, (s0 + s1) / 2 - 2.2, max(dx, dx + sx * 0.12), 4.4, (s0 + s1) / 2 + 2.2, 'wood', 0.02)
            for q in (-1, 1): _beam(tmp, (dx + sx * 0.14, 0.2, (s0 + s1) / 2 + q * 2.1), (dx + sx * 0.14, 4.2, (s0 + s1) / 2 - q * 2.1), 0.12, 'paint')
            R.emit(tmp, (s0 + s1) / 2)
        elif t == 'silo':
            tmp = Part(); x, s, rr, h = i['x'], i['s'], i['r'], i['h']; add_cyl(tmp, x, s, 0, h, rr, 'corrugated', 32); add_cyl(tmp, x, s, h, h + 2.4, rr, 'metal', 32, r2=0.6)
            for y in range(2, int(h), 3): add_cyl(tmp, x, s, y, y + 0.12, rr + 0.06, 'metal', 32)
            for y in range(0, int(h), 1): add_box(tmp, x + rr + 0.05, y, s - 0.25, x + rr + 0.1, y + 0.04, s + 0.25, 'metal', 0)
            R.emit(tmp, s)
        elif t == 'rack':
            tmp = Part(); x, s = i['x'], i['s']; sx = 1 if x < W / 2 else -1
            for dz in (-2.5, 2.5):
                for dx in (-0.5, 0.5): add_box(tmp, x + dx - 0.04, 0, s + dz - 0.04, x + dx + 0.04, 5.4, s + dz + 0.04, 'metal', 0)
            for y in (0.6, 1.6, 2.6, 3.6, 4.6):
                add_box(tmp, x - 0.55, y, s - 2.5, x + 0.55, y + 0.08, s + 2.5, 'metal', 0); add_box(tmp, x - 0.45, y + 0.08, s - 2.4, x + 0.45, y + 0.3, s + 2.4, 'leaf', 0.02)
                add_box(tmp, x - 0.3, y + 0.85, s - 2.4, x + 0.3, y + 0.9, s + 2.4, 'neonpink', 0)
            R.emit(tmp, s)

KITS = {'town': build_town, 'garden': build_garden, 'farm': build_farm}
def build_rings():
    global add_box
    add_box = _flat_box
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)
    rings = json.load(open(os.path.join(ROOT, 'assets', 'ships', 'rings.json'))); made = []
    for lay in rings:
        if ONLY and lay['key'] not in ONLY: continue
        R = Ring(lay); KITS[lay['kind']](R, random.Random(lay['key'])); tot = 0
        for k, q in enumerate(R.parts):
            ob = finish(q, f"ring_{lay['key']}_{k}"); ob['kind'] = 'ring_' + lay['key']; ob['dims'] = [1, 1, 1]; made.append(ob); tot += len(ob.data.polygons)
        print('ring', lay['key'], tot, 'faces')
    if ONLY: _look(made); return
    bpy.ops.object.select_all(action='DESELECT')
    for ob in made: ob.select_set(True)
    out = os.path.join(ROOT, 'assets', 'rings.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_materials='EXPORT', export_extras=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True)
    print('wrote', out, os.path.getsize(out) // 1024, 'KB')
