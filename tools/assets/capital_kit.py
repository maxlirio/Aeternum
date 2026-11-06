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
        add_cyl(p, x, y, -500, -462, R, 'metal', 28, axis='z', r2=R * 0.62); add_cyl(p, x, y, -497, -494, R * 0.84, 'glow', 28, axis='z')
    for k in range(30): a = k * 0.21; _beam(p, (math.cos(a) * 60, math.sin(a) * 30 + 2, -462), (math.cos(a) * 42, math.sin(a) * 18 + 2, -430), 0.8, 'metal')
    _radiator(p, -70, 36, -450, -150, -330, 18); _radiator(p, 70, 36, -450, 150, -330, 18)
    return (99.5, 12, -30, 1)        # where the docking block's mouth goes: x, y, z, side

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
        add_cyl(p, x, y, -660, -600, 26, 'metal', 28, axis='z', r2=15); add_cyl(p, x, y, -656, -652, 22, 'glow', 28, axis='z')
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
        _bell(p, x, y, -830, -750, 30, 16); _beam(p, (x, y, -750), (x * 0.7, y * 0.7, -700), 7, 'metal')
    for s in (-1, 1):
        for k in range(4): z = -630 + k * 68; _radiator(p, s * 32, H + 28 if False else 0, z, s * 240, z + 58, 0)
    for s in (-1, 1):
        for k in range(6): add_cyl(p, s * 0, 0, 0, 0, 0.01, 'metal', 3) if False else None
    return (58, -18, 650, 1)

CAPITALS = {'bastion': bastion, 'meridian': meridian, 'longshore': longshore}
def build_capital():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)
    decks = json.load(open(os.path.join(ROOT, 'assets', 'ships', 'capital.json'))); made = []; docks = {}
    for name, fn in CAPITALS.items():
        p = Part(); r = random.Random(name); lay = decks[name + '_decks']; mouth = fn(p, lay, r); _hangar_block(p, lay, *mouth); docks[name] = {'x': mouth[0], 'y': mouth[1], 'z': mouth[2], 'side': mouth[3]}
        ob = finish(p, name); ob['kind'] = name; ob['dims'] = [1, 1, 1]; made.append(ob); print('capital', name, len(ob.data.polygons), 'faces')
        p = Part(); ship_interior(p, lay); ob = finish(p, name + '_decks'); ob['kind'] = name + '_decks'; ob['dims'] = [1, 1, 1]; made.append(ob); print('decks', name, len(ob.data.polygons), 'faces')
    json.dump(docks, open(os.path.join(ROOT, 'assets', 'ships', 'capital-docks.json'), 'w'), indent=1)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in made: ob.select_set(True)
    out = os.path.join(ROOT, 'assets', 'capital.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_materials='EXPORT', export_extras=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True)
    print('wrote', out, os.path.getsize(out) // 1024, 'KB')
