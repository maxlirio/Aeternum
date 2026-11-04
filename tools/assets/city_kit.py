# The megacity kit: street furniture, market stalls and goods, Warrens junk, neon signs,
# roof kit, industry, skyport gear, parks. exec'd inside build.py (shares its helpers and
# SLOTS); `-- city` builds assets/city.glb. Each model is centred on its footprint, stands
# on y = 0 and faces -z (the street side when the game sets it on a kerb).
# One function per kind name used by js/gen/city.js (CITY dict at the bottom).

def bx(p, cx, y0, cz, w, h, d, mat, bevel=0.006):
    add_box(p, cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, mat, bevel)
def cy(p, cx, cz, y0, y1, r, mat, seg=12, r2=None):
    add_cyl(p, cx, cz, y0, y1, r, mat, seg=(max(seg, 16) if r > 0.08 else seg), r2=r2)
def rod_x(p, x0, x1, y, z, r, mat, seg=8):          # a bar along x at height y, depth z
    add_cyl(p, y, z, x0, x1, r, mat, seg=seg, axis='x')
def rod_z(p, z0, z1, x, y, r, mat, seg=8):          # along z
    add_cyl(p, x, y, z0, z1, r, mat, seg=seg, axis='z')
def ball(p, cx, cy_, cz, r, mat, sub=2):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=max(2, sub), radius=r)
    for v in bm.verts: x, y, z = v.co; v.co = P(cx + x, cy_ + z, cz + y)
    merge(p, bm, mat)
def frame4(p, w, d, h, r, mat):                     # four posts
    for sx in (-1, 1):
        for sz in (-1, 1): cy(p, sx * (w / 2 - r), sz * (d / 2 - r), 0, h, r, mat, 8)

# ---------------------------------------------------------------- lamps
def lamp_cobra(p, r):
    cy(p, 0, 0, 0, 8.0, 0.09, 'paint', 10, r2=0.06); cy(p, 0, 0, 0, 0.5, 0.16, 'paint', 10)
    rod_z(p, -1.6, 0, 0, 7.9, 0.045, 'paint')
    bx(p, 0, 7.75, -1.75, 0.34, 0.16, 0.8, 'paint', 0.03); bx(p, 0, 7.72, -1.75, 0.26, 0.04, 0.62, 'lampwarm', 0.01)
def lamp_double(p, r):
    cy(p, 0, 0, 0, 7.0, 0.08, 'metal', 10); bx(p, 0, 0, 0, 0.36, 0.4, 0.36, 'concrete', 0.02)
    for s in (-1, 1):
        rod_x(p, 0, s * 1.2, 6.8, 0, 0.035, 'metal') if s > 0 else rod_x(p, -1.2, 0, 6.8, 0, 0.035, 'metal')
        cy(p, s * 1.25, 0, 6.35, 6.85, 0.2, 'metal', 12, r2=0.06); cy(p, s * 1.25, 0, 6.3, 6.36, 0.17, 'lampwarm', 12)
def lamp_lux(p, r):
    bx(p, 0, 0, 0, 0.22, 5.8, 0.22, 'mirror', 0.04); bx(p, 0, 4.2, -0.12, 0.08, 1.5, 0.02, 'lampwarm', 0.005)
    bx(p, 0, 5.8, 0, 0.5, 0.06, 0.5, 'mirror', 0.02)
def lamp_lantern(p, r):
    cy(p, 0, 0, 0, 3.8, 0.06, 'paint', 8); cy(p, 0, 0, 0, 0.3, 0.14, 'paint', 8)
    bx(p, 0, 3.8, 0, 0.36, 0.5, 0.36, 'glass', 0.01); bx(p, 0, 3.86, 0, 0.22, 0.36, 0.22, 'lampwarm', 0.01)
    cy(p, 0, 0, 4.3, 4.55, 0.26, 'paint', 4, r2=0.02)
def lamp_neon(p, r):
    bx(p, 0, 0, 0, 0.16, 4.6, 0.16, 'metal', 0.01); rod_z(p, -1.0, 0, 0, 4.5, 0.03, 'metal')
    bx(p, 0, 4.4, -1.05, 0.12, 0.1, 0.9, 'neoncyan', 0.01); bx(p, 0, 1.0, -0.09, 0.06, 2.4, 0.03, 'neonpink', 0.005)
    bx(p, 0, 0.6, 0, 0.3, 0.3, 0.3, 'metal', 0.02)
def lamp_flood(p, r):
    cy(p, 0, 0, 0, 12.0, 0.18, 'paint', 10, r2=0.12); bx(p, 0, 11.6, 0, 1.6, 0.12, 0.3, 'paint', 0.02)
    for x in (-0.55, 0, 0.55): bx(p, x, 11.3, -0.15, 0.42, 0.34, 0.24, 'paint', 0.02); bx(p, x, 11.32, -0.28, 0.34, 0.26, 0.02, 'lampwarm', 0.004)
def lamp_park(p, r):
    cy(p, 0, 0, 0, 3.6, 0.05, 'paint', 8); ball(p, 0, 3.75, 0, 0.22, 'lampwarm'); cy(p, 0, 0, 0, 0.25, 0.12, 'paint', 8)

# ---------------------------------------------------------------- street furniture
def bench(p, r):
    for x in (-0.75, 0.75): bx(p, x, 0, 0, 0.08, 0.42, 0.5, 'paint', 0.01)
    for i in range(4): bx(p, 0, 0.42, -0.2 + i * 0.13, 1.8, 0.04, 0.1, 'wood', 0.008)
    for i in range(3): bx(p, 0, 0.55 + i * 0.13, 0.28, 1.8, 0.1, 0.035, 'wood', 0.008)
    for x in (-0.75, 0.75): bx(p, x, 0.42, 0.28, 0.06, 0.45, 0.05, 'paint', 0.01)
def bench_lux(p, r):
    bx(p, 0, 0, 0, 2.2, 0.42, 0.7, 'stone', 0.03); bx(p, 0, 0.42, 0, 2.0, 0.06, 0.6, 'wood', 0.01)
def bin_(p, r):
    cy(p, 0, 0, 0, 0.95, 0.28, 'tint', 14); cy(p, 0, 0, 0.95, 1.02, 0.3, 'metal', 14); cy(p, 0, 0, 0.9, 1.03, 0.16, 'rubber', 10)
def bin_lux(p, r):
    bx(p, 0, 0, 0, 0.5, 1.0, 0.5, 'mirror', 0.04); bx(p, 0, 0.8, -0.26, 0.3, 0.08, 0.02, 'rubber', 0.005)
def bin_rusty(p, r):
    cy(p, 0, 0, 0, 0.9, 0.3, 'corrugated', 12); ball(p, 0.05, 0.92, 0, 0.18, 'cardboard', 1); bx(p, 0.25, 0.9, 0.1, 0.3, 0.2, 0.25, 'cardboard')
def vending(p, r, glow='screen', accent='tint'):
    bx(p, 0, 0, 0, 1.0, 1.9, 0.8, accent, 0.02); bx(p, -0.12, 0.55, -0.41, 0.6, 1.15, 0.02, 'glass', 0.003)
    for i in range(5):
        for j in range(4): bx(p, -0.37 + j * 0.17, 0.68 + i * 0.21, -0.3, 0.1, 0.14, 0.1, 'plastic', 0.01)
    bx(p, 0.33, 1.0, -0.41, 0.18, 0.5, 0.02, glow, 0.003); bx(p, -0.12, 0.2, -0.41, 0.5, 0.2, 0.02, 'rubber', 0.003)
    bx(p, 0, 1.75, -0.41, 0.9, 0.12, 0.02, 'neoncyan' if accent == 'tint' else 'neonamber', 0.003)
def vending2(p, r):
    bx(p, 0, 0, 0, 0.9, 1.95, 0.75, 'paint', 0.03); bx(p, 0, 0.9, -0.38, 0.7, 0.85, 0.02, 'screen', 0.003)
    bx(p, 0, 0.3, -0.38, 0.4, 0.15, 0.02, 'rubber', 0.003); bx(p, 0, 1.85, -0.38, 0.8, 0.06, 0.02, 'neonpink', 0.003)
def vending_old(p, r):
    vending(p, r, 'screen', 'corrugated'); bx(p, 0.45, 0, -0.2, 0.3, 0.25, 0.25, 'cardboard')
def kiosk(p, r, mat='tint'):
    bx(p, 0, 0, 0, 2.4, 1.05, 2.0, mat, 0.02); bx(p, 0, 1.05, 0, 2.4, 0.06, 2.0, 'laminate', 0.01)
    for sx in (-1.15, 1.15): bx(p, sx, 1.1, 0.95, 0.08, 1.5, 0.08, 'metal', 0.01)
    bx(p, 0, 1.1, 0.95, 2.3, 1.5, 0.05, mat, 0.01)
    add_box(p, -1.4, 2.6, -1.3, 1.4, 2.8, 1.1, mat, 0.02); bx(p, 0, 2.62, -1.31, 2.6, 0.16, 0.03, 'neonamber', 0.004)
    bx(p, 0, 1.15, 0.4, 0.5, 0.35, 0.3, 'screen', 0.01)
def kiosk_lux(p, r):
    cy(p, 0, 0, 0, 2.8, 1.2, 'glass', 24); cy(p, 0, 0, 2.8, 3.1, 1.35, 'mirror', 24); cy(p, 0, 0, 0, 1.0, 1.0, 'stone', 24)
    cy(p, 0, 0, 3.1, 3.2, 1.0, 'neoncyan', 24)
def kiosk_food(p, r): kiosk(p, r); bx(p, 0, 1.12, -0.6, 1.8, 0.1, 0.4, 'metal')
def planter(p, r):
    plant(p, fern, 1.5, 1.5, 0.8, r, 0.7)
    bx(p, 0, 0, 0, 1.6, 0.75, 1.6, 'concrete', 0.03); bx(p, 0, 0.6, 0, 1.4, 0.14, 1.4, 'soil', 0.01)
def planter_lux(p, r):
    plant(p, tree_builder('parasol'), 2.2, 2.2, 3.4, r, 0.6)
    cy(p, 0, 0, 0, 0.7, 1.0, 'stone', 32); cy(p, 0, 0, 0.6, 0.72, 0.92, 'soil', 32)
def bollard(p, r):
    cy(p, 0, 0, 0, 0.95, 0.12, 'paint', 12); cy(p, 0, 0, 0.8, 0.86, 0.125, 'hazard', 12); ball(p, 0, 0.95, 0, 0.12, 'paint', 1)
def hydrant(p, r):
    cy(p, 0, 0, 0, 0.62, 0.13, 'tint', 12); cy(p, 0, 0, 0.62, 0.78, 0.15, 'tint', 12, r2=0.06); cy(p, 0, 0, 0, 0.08, 0.18, 'tint', 12)
    rod_x(p, -0.24, 0.24, 0.45, 0, 0.06, 'tint'); rod_z(p, -0.22, 0, 0, 0.4, 0.07, 'metal')
def newsstand(p, r):
    bx(p, 0, 0, 0, 1.4, 0.9, 0.6, 'paint', 0.02); bx(p, 0, 0.9, 0.05, 1.4, 0.5, 0.5, 'glass', 0.01)
    for i in range(4): bx(p, -0.5 + i * 0.33, 0.95, 0, 0.28, 0.38, 0.03, 'books', 0.003)
def shelter(p, r):
    for x in (-1.9, 1.9): bx(p, x, 0, 0.6, 0.1, 2.7, 0.1, 'metal', 0.01)
    bx(p, 0, 2.7, 0, 4.2, 0.1, 1.8, 'metal', 0.02); bx(p, 0, 0.15, 0.68, 3.8, 2.4, 0.03, 'glass', 0.003)
    bx(p, 1.95, 0.15, 0, 0.03, 2.4, 1.2, 'glass', 0.003); bx(p, 0, 0.45, 0.45, 2.4, 0.05, 0.35, 'metal', 0.01)
    bx(p, -1.0, 0.8, 0.66, 1.4, 1.6, 0.02, 'screen', 0.003)
def atm(p, r):
    bx(p, 0, 0, 0, 0.8, 1.8, 0.6, 'paint', 0.03); bx(p, 0, 1.1, -0.31, 0.4, 0.3, 0.02, 'screen', 0.003)
    bx(p, 0, 0.85, -0.36, 0.5, 0.15, 0.12, 'metal', 0.01); bx(p, 0, 1.65, -0.31, 0.7, 0.1, 0.02, 'neongreen', 0.003)
def bikerack(p, r):
    for i in range(5): add_cyl(p, -0.8 + i * 0.4, 0, 0, 0.8, 0.025, 'metal', seg=8, axis='y'); rod_z(p, -0.25, 0.25, -0.8 + i * 0.4, 0.8, 0.025, 'metal')
def mailbox(p, r):
    bx(p, 0, 0, 0, 0.12, 0.8, 0.12, 'tint'); bx(p, 0, 0.8, 0, 0.5, 0.45, 0.5, 'tint', 0.04); cy(p, 0, 0, 1.25, 1.3, 0.25, 'tint', 12)
    bx(p, 0, 1.05, -0.26, 0.3, 0.05, 0.02, 'rubber', 0.003)
def terminal_post(p, r):
    bx(p, 0, 0, 0, 0.45, 1.6, 0.35, 'paint', 0.04); bx(p, 0, 0.9, -0.18, 0.34, 0.55, 0.02, 'screen', 0.003)
    bx(p, 0, 1.55, -0.18, 0.3, 0.04, 0.02, 'neoncyan', 0.003)
def holo_post(p, r):
    cy(p, 0, 0, 0, 0.4, 0.3, 'mirror', 16); cy(p, 0, 0, 0.4, 3.0, 0.035, 'mirror', 8)
    bx(p, 0, 1.2, 0, 1.2, 1.6, 0.02, 'neoncyan', 0.003)
def barrier(p, r):
    for x in (-0.85, 0.85): bx(p, x, 0, 0, 0.1, 1.0, 0.45, 'paint', 0.01)
    bx(p, 0, 0.7, 0, 2.0, 0.25, 0.06, 'hazard', 0.01); bx(p, 0, 0.3, 0, 2.0, 0.12, 0.06, 'hazard', 0.01)
def junction(p, r):
    bx(p, 0, 0, 0, 0.9, 1.4, 0.5, 'paint', 0.02); bx(p, 0, 1.4, 0, 0.95, 0.04, 0.55, 'paint', 0.01)
    bx(p, 0, 0.9, -0.26, 0.4, 0.3, 0.02, 'hazard', 0.003); bx(p, 0.46, 0.2, 0, 0.04, 1.0, 0.2, 'metal')
def steamvent(p, r):
    bx(p, 0, 0, 0, 1.0, 0.2, 1.0, 'metal', 0.02)
    for i in range(6): bx(p, 0, 0.2, -0.4 + i * 0.16, 0.9, 0.03, 0.05, 'metal', 0.005)
def bikerack2(p, r): bikerack(p, r)

# ---------------------------------------------------------------- trees
def plant(p, grow, L, D, H, r, y=0.0):
    # one of the grown plants (build.py), centred on the footprint: the same ones as out in the country
    grow(p, L, D, H, r)
    bmesh.ops.translate(p.bm, vec=mathutils.Vector(P(-L / 2, y, -D / 2)), verts=list(p.bm.verts))
def tree(p, r, lux=False):
    plant(p, tree_builder('birch' if lux else 'oak'), 4.5, 4.5, 8.0, r)
    if not lux:
        bx(p, 0, 0, 0, 1.5, 0.05, 1.5, 'metal', 0.01)
        for i in range(8): bx(p, -0.6 + i * 0.17, 0.05, 0, 0.05, 0.02, 1.4, 'rubber', 0.002)
    else: cy(p, 0, 0, 0, 0.5, 0.9, 'stone', 24)
def tree_lux(p, r): tree(p, r, True)

# ---------------------------------------------------------------- market
def stall(p, r, roof='tint', goods='crates', w=3.2, d=2.4, kind='canopy'):
    rng = random.Random(r.random())
    frame4(p, w, d, 2.5 if kind != 'umbrella' else 0.01, 0.04, 'metal')
    bx(p, 0, 0, -d / 2 + 0.45, w - 0.2, 0.9, 0.8, 'wood', 0.01)               # the counter at the front
    bx(p, 0, 0.9, -d / 2 + 0.45, w - 0.1, 0.05, 0.9, 'wood', 0.01)
    if kind == 'canopy':
        add_box(p, -w / 2 - 0.2, 2.5, -d / 2 - 0.6, w / 2 + 0.2, 2.56, d / 2, roof, 0.01)
        for i in range(int(w / 0.5)): bx(p, -w / 2 + 0.25 + i * 0.5, 2.3, -d / 2 - 0.58, 0.48, 0.22, 0.02, roof, 0.003)
    elif kind == 'tent':
        for s in (-1, 1):
            bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((-w / 2, 2.2, s * d / 2), (w / 2, 2.2, s * d / 2), (w / 2, 3.0, 0), (-w / 2, 3.0, 0))]
            bm.faces.new(vs if s < 0 else vs[::-1]); merge(p, bm, roof)
    elif kind == 'umbrella':
        cy(p, 0, 0, 0, 2.6, 0.04, 'metal', 8); cy(p, 0, 0, 2.3, 2.9, 1.7, roof, 10, r2=0.05)
    # goods on the counter
    for i in range(int((w - 0.4) / 0.42)):
        x = -w / 2 + 0.4 + i * 0.42
        if goods == 'crates': bx(p, x, 0.95, -d / 2 + 0.45, 0.38, 0.18, 0.5, 'wood', 0.005); [add_blob(p, x + rng.uniform(-0.12, 0.12), 1.15, -d / 2 + 0.45 + rng.uniform(-0.18, 0.18), 0.07, rng.choice(['tint', 'leaf', 'paint']), rng, 2) for _ in range(5)]
        elif goods == 'fish': bx(p, x, 0.95, -d / 2 + 0.45, 0.4, 0.06, 0.6, 'ceramic', 0.005); [add_blob(p, x, 1.03, -d / 2 + 0.25 + k * 0.2, 0.06, 'mirror', rng, 2, 0.5) for k in range(3)]
        elif goods == 'cloth': bx(p, x, 0.95, -d / 2 + 0.45, 0.38, 0.22, 0.55, 'tint', 0.03)
        elif goods == 'tech': bx(p, x, 0.95, -d / 2 + 0.45, 0.3, 0.12, 0.3, 'plastic', 0.01); bx(p, x, 1.07, -d / 2 + 0.4, 0.24, 0.02, 0.18, 'screen', 0.003)
        elif goods == 'spice': cy(p, x, -d / 2 + 0.45, 0.95, 1.1, 0.16, 'cardboard', 10); ball(p, x, 1.08, -d / 2 + 0.45, 0.12, rng.choice(['tint', 'soil', 'hazard']), 1)
        elif goods == 'noodle': cy(p, x, -d / 2 + 0.45, 0.95, 1.2, 0.17, 'metal', 12)
        elif goods == 'grill': bx(p, x, 0.95, -d / 2 + 0.45, 0.4, 0.15, 0.6, 'metal'); bx(p, x, 1.1, -d / 2 + 0.45, 0.36, 0.01, 0.56, 'neonamber', 0.002)
    if kind != 'umbrella':           # back shelving with stock
        bx(p, 0, 0, d / 2 - 0.25, w - 0.3, 1.8, 0.4, 'wood', 0.01)
        for i in range(3):
            for j in range(int((w - 0.5) / 0.5)): bx(p, -w / 2 + 0.5 + j * 0.5, 0.15 + i * 0.6, d / 2 - 0.3, 0.4, 0.4, 0.3, rng.choice(['cardboard', 'tint', 'plastic']), 0.01)
def stall_canopy(p, r): stall(p, r, 'tint', 'crates')
def stall_umbrella(p, r): stall(p, r, 'tint', 'crates', 2.4, 1.8, 'umbrella')
def stall_tent(p, r): stall(p, r, 'fabric', 'cloth', 3.0, 2.6, 'tent')
def stall_fish(p, r): stall(p, r, 'tint', 'fish'); bx(p, 0, 2.2, -1.25, 2.6, 0.3, 0.05, 'neoncyan', 0.004)
def stall_cloth(p, r): stall(p, r, 'tint', 'cloth', 3.0, 2.2, 'tent'); [bx(p, -1.2 + i * 0.4, 1.0, 0.0, 0.3, 1.2, 0.02, 'tint', 0.003) for i in range(7)]
def stall_tech(p, r): stall(p, r, 'corrugated', 'tech'); bx(p, 0, 2.15, -1.25, 2.4, 0.3, 0.05, 'neongreen', 0.004)
def stall_fruit(p, r): stall(p, r, 'tint', 'crates', 3.0, 2.2)
def stall_spice(p, r): stall(p, r, 'fabric', 'spice', 3.0, 2.2, 'tent')
def stall_grill(p, r): stall(p, r, 'corrugated', 'grill', 2.6, 2.0); cy(p, 1.0, 0.6, 2.5, 3.6, 0.12, 'metal', 8)
def stall_noodle(p, r):
    stall(p, r, 'tint', 'noodle', 3.4, 2.2)
    for i in range(4): cy(p, -1.2 + i * 0.8, -1.6, 0, 0.62, 0.17, 'tint', 10); cy(p, -1.2 + i * 0.8, -1.6, 0, 0.6, 0.03, 'metal', 6)
    for i in range(5): bx(p, -1.4 + i * 0.7, 2.0, -1.4, 0.3, 0.4, 0.3, 'lampwarm', 0.05)
def stall_cart(p, r):
    bx(p, 0, 0.4, 0, 2.2, 0.8, 1.2, 'tint', 0.03); bx(p, 0, 1.2, 0, 2.3, 0.05, 1.3, 'metal', 0.01)
    for x in (-0.7, 0.7): add_cyl(p, 0.35, 0.62, x - 0.04, x + 0.04, 0.35, 'rubber', seg=14, axis='x')
    for x in (-1.05, 1.05): cy(p, x, 0.55, 1.25, 2.3, 0.03, 'metal', 6)
    add_box(p, -1.3, 2.3, -0.9, 1.3, 2.36, 0.8, 'tint', 0.01); rod_x(p, 1.1, 1.8, 0.8, 0, 0.03, 'metal')
def stall_crate(p, r):
    rng = random.Random(r.random())
    for i in range(6):
        x = -1.2 + (i % 3) * 1.2; z = -0.5 + (i // 3) * 1.0
        bx(p, x, 0, z, 1.0, 0.5, 0.8, 'wood', 0.01)
        for k in range(6): add_blob(p, x + rng.uniform(-0.35, 0.35), 0.58, z + rng.uniform(-0.25, 0.25), 0.1, rng.choice(['tint', 'leaf']), rng, 2)
def foodcart(p, r, roof='tint'):
    bx(p, 0, 0.3, 0, 2.0, 1.0, 1.1, 'mirror', 0.03); bx(p, 0, 1.3, 0, 2.0, 0.05, 1.1, 'metal')
    add_cyl(p, 0.3, 0.45, -0.85, -0.75, 0.3, 'rubber', seg=14, axis='x'); add_cyl(p, 0.3, 0.45, 0.75, 0.85, 0.3, 'rubber', seg=14, axis='x')
    for x in (-0.95, 0.95): cy(p, x, 0.5, 1.3, 2.2, 0.025, 'metal', 6)
    add_box(p, -1.2, 2.2, -0.8, 1.2, 2.26, 0.7, roof, 0.01); cy(p, 0.5, 0, 1.35, 1.6, 0.2, 'metal', 12); bx(p, -0.5, 1.35, 0, 0.6, 0.3, 0.4, 'glass')
def foodcart2(p, r): foodcart(p, r, 'fabric'); bx(p, 0, 1.9, -0.58, 1.6, 0.25, 0.03, 'neonpink', 0.004)
def crates_fruit(p, r):
    rng = random.Random(r.random())
    for i in range(3):
        bx(p, -0.5 + i * 0.5, 0, 0, 0.45, 0.35, 0.6, 'wood', 0.005)
        for k in range(5): add_blob(p, -0.5 + i * 0.5 + rng.uniform(-0.12, 0.12), 0.42, rng.uniform(-0.2, 0.2), 0.08, rng.choice(['tint', 'leaf', 'hazard']), rng, 2)
    bx(p, -0.25, 0.35, 0.05, 0.45, 0.35, 0.6, 'wood', 0.005)
def sacks(p, r):
    for i, (x, z, y) in enumerate(((-0.35, 0, 0), (0.35, 0, 0), (0, 0.05, 0.4))): add_cushion(p, x - 0.32, y, z - 0.25, x + 0.32, y + 0.42, z + 0.25, 'fabric', 0.35, 0.5, 6)
def baskets(p, r):
    for x, z in ((-0.25, 0), (0.25, 0.1), (0, -0.3)): cy(p, x, z, 0, 0.32, 0.22, 'wood', 12, r2=0.26); cy(p, x, z, 0.28, 0.33, 0.21, 'tint', 12)
def barrels(p, r):
    for x in (-0.35, 0.35): cy(p, x, 0, 0, 0.9, 0.3, 'wood', 14); cy(p, x, 0, 0.2, 0.25, 0.31, 'metal', 14); cy(p, x, 0, 0.65, 0.7, 0.31, 'metal', 14)
def pots(p, r):
    for x, z, s in ((-0.3, 0, 1), (0.25, 0.1, 0.8), (0, -0.3, 0.6)): cy(p, x, z, 0, 0.5 * s, 0.22 * s, 'ceramic', 12, r2=0.12 * s); cy(p, x, z, 0.5 * s, 0.58 * s, 0.1 * s, 'ceramic', 10)
def rugs(p, r):
    for i in range(5): bx(p, 0, i * 0.09, 0, 1.6 - i * 0.05, 0.08, 1.0, 'tint' if i % 2 else 'fabric', 0.03)
    cy(p, 0.5, 0.3, 0, 0.6, 0.12, 'tint', 10)
def cage(p, r):
    bx(p, 0, 0, 0, 0.8, 0.05, 0.8, 'wood')
    for i in range(6): cy(p, -0.38 + i * 0.152, -0.38, 0.05, 0.75, 0.01, 'metal', 4); cy(p, -0.38 + i * 0.152, 0.38, 0.05, 0.75, 0.01, 'metal', 4)
    bx(p, 0, 0.75, 0, 0.8, 0.04, 0.8, 'wood'); ball(p, 0.1, 0.2, 0.1, 0.12, 'tint', 1)
def stool(p, r): cy(p, 0, 0, 0, 0.58, 0.04, 'metal', 6); cy(p, 0, 0, 0.58, 0.64, 0.18, 'tint', 12)
def scale(p, r):
    bx(p, 0, 0, 0, 0.5, 0.8, 0.4, 'wood'); cy(p, 0, 0, 0.8, 1.2, 0.03, 'metal', 6); rod_x(p, -0.3, 0.3, 1.2, 0, 0.015, 'metal')
    for x in (-0.3, 0.3): cy(p, x, 0, 0.95, 0.98, 0.12, 'metal', 12)
def handcart(p, r):
    bx(p, 0, 0.4, 0, 1.4, 0.06, 0.8, 'wood'); bx(p, 0, 0.46, 0, 1.4, 0.3, 0.02, 'wood')
    add_cyl(p, 0.3, 0.42, -0.5, -0.42, 0.3, 'wood', seg=12, axis='x'); add_cyl(p, 0.3, 0.42, 0.42, 0.5, 0.3, 'wood', seg=12, axis='x')
    rod_x(p, 0.7, 1.4, 0.55, -0.3, 0.025, 'wood'); rod_x(p, 0.7, 1.4, 0.55, 0.3, 0.025, 'wood'); bx(p, -0.2, 0.46, 0, 0.6, 0.3, 0.5, 'cardboard')
def lanternline(p, r):
    rod_x(p, -3.5, 3.5, 0.2, 0, 0.008, 'rubber', 4)
    for i in range(10): ball(p, -3.2 + i * 0.7, 0.05 - 0.04 * math.sin(i * 0.45), 0, 0.11, 'lampwarm' if i % 3 else 'neonpink', 1)
def lanterns(p, r):
    rod_x(p, -1.5, 1.5, 0.3, 0, 0.01, 'rubber', 4)
    for i in range(5): cy(p, -1.2 + i * 0.6, 0, -0.1, 0.25, 0.14, 'lampwarm', 10)
def lanterns_post(p, r):
    cy(p, 0, 0, 0, 3.0, 0.05, 'wood', 6); rod_z(p, -0.8, 0, 0, 2.9, 0.03, 'wood')
    cy(p, 0, -0.8, 2.3, 2.75, 0.16, 'lampwarm', 10)
def awning(p, r, mat='tint'):
    for i in range(6):
        bm = bmesh.new(); x0 = -1.5 + i * 0.5
        vs = [bm.verts.new(P(*q)) for q in ((x0, 0.25, 0.4), (x0 + 0.5, 0.25, 0.4), (x0 + 0.5, -0.1, -1.2), (x0, -0.1, -1.2))]
        bm.faces.new(vs); merge(p, bm, mat if i % 2 else 'fabric')
    rod_x(p, -1.5, 1.5, -0.12, -1.2, 0.02, 'metal')
def awning2(p, r): awning(p, r, 'tint'); bx(p, 0, -0.35, -1.2, 3.0, 0.25, 0.02, 'tint', 0.003)
def sign(p, w, h, mat, back='paint'):
    bx(p, 0, 0, 0, w, h, 0.14, back, 0.02); bx(p, 0, 0.1, -0.075, w - 0.2, h - 0.2, 0.02, mat, 0.004)
def sign_shop(p, r): sign(p, 3.0, 0.9, 'neoncyan')
def sign_market(p, r): sign(p, 3.0, 1.0, 'neonamber', 'wood')
def sign_blade(p, r):
    rod_z(p, -0.0, 0.3, 0, 2.8, 0.03, 'metal'); bx(p, 0, 0, -0.6, 0.18, 3.0, 0.9, 'paint', 0.02)
    for s in (-1, 1): bx(p, s * 0.1, 0.15, -0.6, 0.02, 2.7, 0.7, 'neonpink', 0.003)
def holo_ad(p, r):
    bx(p, 0, 0, 0, 4.2, 2.6, 0.12, 'metal', 0.02); bx(p, 0, 0.1, -0.07, 3.9, 2.3, 0.02, 'screen', 0.003)
    bx(p, 0, -0.1, -0.08, 4.2, 0.08, 0.04, 'neoncyan', 0.004)

# ---------------------------------------------------------------- neon (Warrens) — drawn as glowing tubes on a dark backing
def tube_path(p, pts, mat, r=0.045):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        if L < 1e-4: continue
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=r, depth=L)
        a = math.atan2(y1 - y0, x1 - x0)
        for v in bm.verts:
            x, y, z = v.co          # along Blender z → along the segment in the sign plane (x, y), sitting at prop z = -0.12
            t = z + L / 2; ox, oy = x * -math.sin(a), x * math.cos(a)
            v.co = P(-(x0 + math.cos(a) * t + ox), y0 + math.sin(a) * t + oy, -0.12 + y)     # (x mirrored: drawn as read from the front, -z)
        merge(p, bm, mat)
def neon_back(p, w, h): bx(p, 0, 0, 0, w, h, 0.08, 'rubber', 0.01)
def circle(cx, cy_, R, n=16, a0=0, a1=2 * math.pi): return [(cx + R * math.cos(a0 + (a1 - a0) * i / n), cy_ + R * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
def neon_bar(p, r):
    neon_back(p, 2.4, 0.7); tube_path(p, [(-1.0, 0.15), (-1.0, 0.55), (-0.7, 0.55), (-0.7, 0.35), (-1.0, 0.35)], 'neonpink')
    tube_path(p, [(-0.45, 0.15), (-0.25, 0.55), (-0.05, 0.15)], 'neonpink'); tube_path(p, [(0.2, 0.15), (0.2, 0.55), (0.5, 0.55), (0.5, 0.35), (0.2, 0.35), (0.55, 0.15)], 'neonpink')
    tube_path(p, [(0.8, 0.15), (0.95, 0.55), (1.1, 0.15)], 'neoncyan')
def neon_noodle(p, r):
    neon_back(p, 2.6, 0.8); tube_path(p, circle(-0.6, 0.38, 0.28, 12, math.pi, 2 * math.pi), 'neonamber'); tube_path(p, [(-0.9, 0.38), (-0.3, 0.38)], 'neonamber')
    for k in range(3): tube_path(p, [(-0.75 + k * 0.12, 0.42), (-0.55 + k * 0.12, 0.72)], 'neonamber', 0.025)
    for k in range(4): tube_path(p, [(0.0 + k * 0.28, 0.15), (0.0 + k * 0.28, 0.6), (0.18 + k * 0.28, 0.15), (0.18 + k * 0.28, 0.6)], 'neonpink', 0.035)
def neon_eye(p, r):
    neon_back(p, 1.2, 1.2); tube_path(p, circle(0, 0.6, 0.45, 20, 0.35, math.pi - 0.35), 'neoncyan'); tube_path(p, circle(0, 0.6, 0.45, 20, math.pi + 0.35, 2 * math.pi - 0.35), 'neoncyan')
    tube_path(p, circle(0, 0.6, 0.15, 12), 'neonpink')
def neon_arrow(p, r): neon_back(p, 1.8, 0.7); tube_path(p, [(-0.8, 0.35), (0.6, 0.35)], 'neonamber'); tube_path(p, [(0.3, 0.6), (0.75, 0.35), (0.3, 0.1)], 'neonamber')
def neon_ring(p, r): neon_back(p, 1.4, 1.4); tube_path(p, circle(0, 0.7, 0.55, 24), 'neonviolet'); tube_path(p, circle(0, 0.7, 0.35, 18), 'neoncyan')
def neon_vert(p, r):
    neon_back(p, 0.6, 3.2)
    for k in range(5): tube_path(p, [(-0.15, 0.3 + k * 0.6), (0.15, 0.3 + k * 0.6), (0.15, 0.6 + k * 0.6), (-0.15, 0.6 + k * 0.6)], 'neonpink' if k % 2 else 'neonamber', 0.035)
def neon_cross(p, r): neon_back(p, 1.0, 1.0); tube_path(p, [(0, 0.15), (0, 0.85)], 'neongreen', 0.06); tube_path(p, [(-0.35, 0.5), (0.35, 0.5)], 'neongreen', 0.06)
def neon_star(p, r):
    neon_back(p, 1.2, 1.2); pts = [(0.5 * math.cos(math.pi / 2 + i * 2 * math.pi / 5 * 2), 0.6 + 0.5 * math.sin(math.pi / 2 + i * 2 * math.pi / 5 * 2)) for i in range(6)]
    tube_path(p, pts, 'neonamber')
def neon_fish(p, r):
    neon_back(p, 1.8, 0.9); tube_path(p, circle(-0.1, 0.45, 0.32, 14, 0.5, 2 * math.pi - 0.5), 'neoncyan'); tube_path(p, [(0.2, 0.6), (0.7, 0.25), (0.7, 0.65), (0.2, 0.3)], 'neoncyan')
def neon_glyph(p, r):
    neon_back(p, 0.8, 2.4)
    for k in range(3): tube_path(p, [(-0.25, 0.3 + k * 0.7), (0.25, 0.3 + k * 0.7), (0, 0.65 + k * 0.7), (0.25, 0.85 + k * 0.7)], 'neonviolet' if k % 2 else 'neonpink', 0.035)

# ---------------------------------------------------------------- Warrens junk and shelters
def dumpster(p, r):
    add_box(p, -1.0, 0.15, -0.6, 1.0, 1.25, 0.6, 'tint', 0.02); add_box(p, -1.02, 1.25, -0.62, 1.02, 1.32, 0.62, 'rubber', 0.01)
    for x in (-0.8, 0.8):
        for z in (-0.45, 0.45): cy(p, x, z, 0, 0.15, 0.08, 'rubber', 8)
    rod_x(p, -0.7, 0.7, 0.9, -0.64, 0.03, 'metal'); bx(p, 0.5, 1.3, 0.1, 0.5, 0.25, 0.4, 'cardboard')
def trashpile(p, r):
    rng = random.Random(r.random())
    for i in range(14): add_blob(p, rng.uniform(-0.9, 0.9), rng.uniform(0.1, 0.5), rng.uniform(-0.9, 0.9), rng.uniform(0.18, 0.4), rng.choice(['rubber', 'plastic', 'cardboard', 'tint']), rng, 2, 0.7)
    for i in range(4): bx(p, rng.uniform(-0.8, 0.8), 0, rng.uniform(-0.8, 0.8), 0.4, 0.3, 0.3, 'cardboard')
def boxes(p, r):
    rng = random.Random(r.random())
    for i in range(6):
        w = rng.uniform(0.35, 0.6); bx(p, rng.uniform(-0.45, 0.45), 0 if i < 4 else 0.45, rng.uniform(-0.4, 0.4), w, rng.uniform(0.3, 0.45), w * 0.8, 'cardboard', 0.01)
def firebarrel(p, r):
    cy(p, 0, 0, 0, 0.88, 0.29, 'corrugated', 14); cy(p, 0, 0, 0.84, 0.9, 0.28, 'neonamber', 14)
    for i in range(5): bx(p, 0, 0.84, -0.2 + i * 0.1, 0.5, 0.06, 0.06, 'bark', 0.01)
def mattress(p, r): add_cushion(p, -0.95, 0, -0.45, 0.95, 0.22, 0.45, 'fabric', 0.15, 0.3, 6); bx(p, 0.6, 0.22, 0, 0.5, 0.12, 0.35, 'tint', 0.04)
def shack(p, r):
    for x in (-1.5, 1.5): bx(p, x, 0, 0, 0.06, 2.2, 2.6, 'corrugated', 0.003)
    bx(p, 0, 0, 1.3, 3.0, 2.2, 0.06, 'corrugated', 0.003); bx(p, -0.9, 0, -1.3, 1.2, 2.0, 0.06, 'wood', 0.003)
    add_box(p, -1.7, 2.25, -1.6, 1.7, 2.32, 1.5, 'corrugated', 0.003); bx(p, 0.7, 1.2, -1.32, 0.6, 0.4, 0.02, 'lampwarm', 0.003)
    bx(p, 0.6, 0, -1.6, 0.8, 0.5, 0.5, 'cardboard')
def leanto(p, r):
    bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((-1.5, 2.1, 1.0), (1.5, 2.1, 1.0), (1.5, 1.2, -1.0), (-1.5, 1.2, -1.0))]
    bm.faces.new(vs); merge(p, bm, 'corrugated')
    for x in (-1.4, 1.4): cy(p, x, -0.95, 0, 1.2, 0.04, 'wood', 6)
    bx(p, 0, 0, 0.95, 3.0, 2.1, 0.05, 'wood', 0.003); mattress(p, r)
def scrapheap(p, r):
    rng = random.Random(r.random())
    for i in range(10):
        w = rng.uniform(0.4, 1.4); bx(p, rng.uniform(-1, 1), rng.uniform(0, 0.8), rng.uniform(-1, 1), w, rng.uniform(0.1, 0.5), rng.uniform(0.3, 1.2), rng.choice(['corrugated', 'metal', 'hull', 'paint']), 0.01)
    for i in range(4): rod_x(p, rng.uniform(-1.4, 0), rng.uniform(0.2, 1.4), rng.uniform(0.3, 1.2), rng.uniform(-0.8, 0.8), 0.05, 'metal')
def hulk(p, r):
    bx(p, 0, 0.3, 0, 3.8, 0.7, 1.7, 'hull', 0.15); bx(p, -0.3, 1.0, 0, 1.6, 0.45, 1.4, 'visor', 0.12)
    bx(p, 1.6, 0.0, 0, 0.6, 0.35, 1.9, 'rubber', 0.05); bx(p, -1.6, 0.0, 0.3, 0.5, 0.3, 0.8, 'corrugated', 0.05)
def washline(p, r):
    for x in (-3, 3): cy(p, x, 0, 0, 2.3, 0.04, 'metal', 6)
    rod_x(p, -3, 3, 2.15, 0, 0.008, 'rubber', 4)
    rng = random.Random(r.random())
    for i in range(7): bx(p, -2.5 + i * 0.75, 1.4 + rng.uniform(0, 0.3), 0, 0.5, 0.75, 0.02, rng.choice(['tint', 'fabric']), 0.003)
def play(p, r):
    frame4(p, 2.6, 1.6, 2.2, 0.05, 'tint'); rod_x(p, -1.3, 1.3, 2.2, 0, 0.05, 'tint')
    for x in (-0.6, 0.6): rod_z(p, -0.0, 0.0, x, 1.0, 0.01, 'metal'); cy(p, x, 0, 0.5, 2.2, 0.01, 'metal', 4); bx(p, x, 0.45, 0, 0.45, 0.05, 0.2, 'rubber')

# ---------------------------------------------------------------- roof kit
def ac(p, r):
    bx(p, 0, 0, 0, 1.4, 0.95, 1.0, 'paint', 0.02)
    for i in range(10): bx(p, -0.6 + i * 0.13, 0.15, -0.51, 0.04, 0.7, 0.02, 'metal', 0.003)
    cy(p, 0.3, 0.1, 0.95, 1.0, 0.36, 'metal', 16)
def ac2(p, r):
    bx(p, 0, 0, 0, 2.4, 1.5, 1.6, 'paint', 0.03)
    for x in (-0.6, 0.6): cy(p, x, 0, 1.5, 1.62, 0.55, 'metal', 20); cy(p, x, 0, 1.55, 1.63, 0.08, 'rubber', 8)
    for i in range(14): bx(p, -1.1 + i * 0.17, 0.2, -0.81, 0.05, 1.1, 0.02, 'metal', 0.003)
def tank_roof(p, r):
    for sx in (-1, 1):
        for sz in (-1, 1): cy(p, sx * 0.9, sz * 0.9, 0, 1.0, 0.07, 'metal', 6)
    bx(p, 0, 1.0, 0, 2.3, 0.1, 2.3, 'metal'); cy(p, 0, 0, 1.1, 3.4, 1.05, 'wood', 20); cy(p, 0, 0, 3.4, 3.9, 1.08, 'wood', 20, r2=0.1)
    for y in (1.6, 2.4, 3.1): cy(p, 0, 0, y, y + 0.05, 1.07, 'metal', 20)
def antenna(p, r):
    cy(p, 0, 0, 0, 6.0, 0.06, 'metal', 6, r2=0.025); bx(p, 0, 0, 0, 0.5, 0.15, 0.5, 'concrete')
    for y in (2.5, 3.5, 4.5): rod_x(p, -0.6, 0.6, y, 0, 0.012, 'metal', 4)
    ball(p, 0, 6.0, 0, 0.08, 'navred', 1)
def dish(p, r):
    cy(p, 0, 0, 0, 0.9, 0.1, 'metal', 8); bx(p, 0, 0, 0, 0.6, 0.12, 0.6, 'concrete')
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=8, radius=1.0)
    for v in list(bm.verts):
        if v.co.z > 0.05: bm.verts.remove(v)
    for v in bm.verts:
        x, y, z = v.co; v.co = P(x, 1.7 + z * 0.35 * math.cos(0.6) + y * math.sin(0.6), y * math.cos(0.6) * 0.9 - z * 0.3)
    merge(p, bm, 'ceramic'); cy(p, 0, -0.25, 1.4, 2.2, 0.02, 'metal', 4)
def vent(p, r):
    cy(p, 0, 0, 0, 0.9, 0.35, 'metal', 14); cy(p, 0, 0, 0.9, 1.15, 0.45, 'metal', 14, r2=0.1)
    for i in range(3): cy(p, 0, 0, 0.3 + i * 0.2, 0.33 + i * 0.2, 0.37, 'metal', 14)
def solar(p, r):
    for x in (-1.2, 0, 1.2):
        cy(p, x, 0.6, 0, 0.6, 0.03, 'metal', 4); cy(p, x, -0.6, 0, 0.3, 0.03, 'metal', 4)
    bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((-1.6, 0.3, -0.9), (1.6, 0.3, -0.9), (1.6, 0.65, 0.9), (-1.6, 0.65, 0.9))]
    bm.faces.new(vs[::-1]); merge(p, bm, 'visor'); bx(p, 0, 0.27, -0.92, 3.2, 0.04, 0.04, 'metal')
def cooling(p, r):
    cy(p, 0, 0, 0, 1.6, 1.5, 'paint', 20, r2=1.2); cy(p, 0, 0, 1.6, 2.4, 1.2, 'paint', 20, r2=1.35)
    cy(p, 0, 0, 2.3, 2.45, 1.0, 'metal', 16); cy(p, 0, 0, 0.2, 0.25, 1.52, 'metal', 20)
def billboard(p, r):
    for x in (-2.0, 2.0): cy(p, x, 0.3, 0, 4.0, 0.12, 'metal', 8)
    bx(p, 0, 4.0, 0, 6.4, 3.4, 0.25, 'metal', 0.03); bx(p, 0, 4.15, -0.14, 6.1, 3.1, 0.02, 'screen', 0.003)
    rod_x(p, -3.2, 3.2, 3.85, -0.5, 0.05, 'metal'); rod_z(p, -0.5, 0, -2.0, 3.85, 0.04, 'metal'); rod_z(p, -0.5, 0, 2.0, 3.85, 0.04, 'metal')
def aerial(p, r):
    cy(p, 0, 0, 0, 4.0, 0.03, 'metal', 6)
    for i in range(6): rod_z(p, -0.5 + i * 0.0, 0.5, 0, 2.6 + i * 0.22, 0.01, 'metal', 4)
def skylight(p, r):
    bx(p, 0, 0, 0, 3.0, 0.3, 3.0, 'metal', 0.02)
    for s in (-1, 1):
        bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((-1.4, 0.3, s * 1.4), (1.4, 0.3, s * 1.4), (1.4, 0.9, 0), (-1.4, 0.9, 0))]
        bm.faces.new(vs if s < 0 else vs[::-1]); merge(p, bm, 'visor')
def beacon(p, r): cy(p, 0, 0, 0, 1.8, 0.08, 'paint', 8); ball(p, 0, 1.9, 0, 0.18, 'navred', 1)

# ---------------------------------------------------------------- industry and skyport
def tank(p, r):
    cy(p, 0, 0, 0, 9.0, 4.5, 'paint', 32); cy(p, 0, 0, 9.0, 10.0, 4.5, 'paint', 32, r2=0.6)
    for y in (2, 4, 6, 8): cy(p, 0, 0, y, y + 0.08, 4.53, 'metal', 32)
    for i in range(30): cy(p, 4.6 * math.cos(i * 0.21), 4.6 * math.sin(i * 0.21), i * 0.3, i * 0.3 + 0.05, 0.25, 'metal', 4)
    bx(p, 0, 0, -4.4, 0.8, 1.5, 0.6, 'metal')
def silo(p, r):
    cy(p, 0, 0, 3, 16, 3.5, 'concrete', 28); cy(p, 0, 0, 0, 3, 1.2, 'concrete', 16, r2=3.5); cy(p, 0, 0, 16, 18, 3.5, 'concrete', 28, r2=0.8)
    for sx in (-1, 1):
        for sz in (-1, 1): cy(p, sx * 2.5, sz * 2.5, 0, 4, 0.25, 'metal', 8)
def sphere(p, r):
    ball(p, 0, 7, 0, 5.0, 'paint', 3)
    for i in range(8): a = i * math.pi / 4; cy(p, 4.3 * math.cos(a), 4.3 * math.sin(a), 0, 6.5, 0.3, 'metal', 8)
def stack(p, r):
    cy(p, 0, 0, 0, 30, 1.5, 'concrete', 20, r2=1.1)
    for y in (24, 26): cy(p, 0, 0, y, y + 1.0, 1.16, 'hazard', 20)
    cy(p, 0, 0, 29.8, 30.3, 1.25, 'metal', 20); ball(p, 0, 30.4, 1.15, 0.2, 'navred', 1)
def crane(p, r):
    for sx in (-1, 1):
        for sz in (-1, 1): cy(p, sx * 1.0, sz * 1.0, 0, 26, 0.12, 'hazard', 6)
    for y in range(2, 26, 3): bx(p, 0, y, 0, 2.2, 0.15, 2.2, 'hazard', 0.01)
    bx(p, 6, 26, 0, 18, 1.0, 1.0, 'hazard', 0.02); bx(p, -4, 26, 0, 6, 1.6, 1.4, 'concrete', 0.02); bx(p, 1.5, 26.5, 0, 2.5, 2.2, 2.0, 'paint', 0.02)
    cy(p, 12, 0, 12, 26, 0.02, 'metal', 4); bx(p, 12, 11.5, 0, 0.8, 0.6, 0.6, 'hazard')
def forklift(p, r):
    bx(p, 0, 0.2, 0.3, 1.2, 0.9, 1.8, 'tint', 0.05); bx(p, 0, 1.1, 0.6, 1.1, 0.05, 1.0, 'metal')
    for x in (-0.5, 0.5): cy(p, x, -0.6, 0, 2.2, 0.04, 'metal', 6)
    for x in (-0.3, 0.3): bx(p, x, 0.05, -1.2, 0.12, 0.05, 1.2, 'metal')
    for z in (-0.3, 0.9):
        for x in (-0.6, 0.6): add_cyl(p, 0.25, z, x - 0.1, x + 0.1, 0.25, 'rubber', seg=12, axis='x')
def container(p, r):
    add_box(p, -3.0, 0, -1.2, 3.0, 2.6, 1.2, 'tint', 0.02)
    for i in range(24): bx(p, -2.9 + i * 0.25, 0.1, -1.21, 0.08, 2.4, 0.02, 'tint', 0.003)
    bx(p, 3.0, 0.05, 0, 0.04, 2.5, 2.3, 'metal', 0.003)
def pallet(p, r):
    for z in (-0.5, 0, 0.5): bx(p, 0, 0, z, 1.2, 0.1, 0.1, 'wood', 0.005)
    for i in range(7): bx(p, -0.51 + i * 0.17, 0.1, 0, 0.12, 0.03, 1.1, 'wood', 0.003)
    bx(p, 0, 0.13, 0, 1.1, 0.5, 1.0, 'cardboard', 0.01)
def drums(p, r):
    for x, z in ((-0.35, -0.2), (0.35, -0.2), (0, 0.4)): cy(p, x, z, 0, 0.88, 0.29, 'tint', 14); cy(p, x, z, 0.3, 0.33, 0.295, 'metal', 14); cy(p, x, z, 0.6, 0.63, 0.295, 'metal', 14)
def fuelcart(p, r):
    bx(p, 0, 0.3, 0, 3.0, 0.3, 1.6, 'paint', 0.03)
    for x in (-1.0, 1.0):
        for z in (-0.7, 0.7): add_cyl(p, 0.3, z, x - 0.12, x + 0.12, 0.3, 'rubber', seg=12, axis='x')
    add_cyl(p, 1.15, 0, -1.2, 1.3, 0.62, 'hazard', seg=20, axis='x'); bx(p, -1.35, 0.6, 0, 0.3, 0.8, 1.0, 'metal')
def cargoloader(p, r):
    bx(p, 0, 0.35, 0, 4.0, 0.5, 2.4, 'hazard', 0.03); bx(p, 0, 0.85, 0.2, 3.6, 0.1, 2.0, 'rubber', 0.01)
    bx(p, -1.6, 0.85, -0.9, 0.7, 1.4, 0.6, 'visor', 0.05)
    for x in (-1.4, 1.4):
        for z in (-1.0, 1.0): add_cyl(p, 0.35, z, x - 0.15, x + 0.15, 0.35, 'rubber', seg=12, axis='x')
def padlights(p, r):
    for i in range(16):
        a = i * math.pi / 8; ball(p, 7.0 * math.cos(a), 0.05, 7.0 * math.sin(a), 0.12, 'navgreen' if i % 2 else 'navwhite', 1)
    for k in range(4): bx(p, 0, 0, -5 + k * 3.3, 0.6, 0.02, 2.4, 'hazard', 0.002)

# ---------------------------------------------------------------- parks and plazas
def fountain(p, r):
    cy(p, 0, 0, 0, 0.7, 4.0, 'stone', 40); cy(p, 0, 0, 0.55, 0.62, 3.8, 'glass', 40)
    cy(p, 0, 0, 0.7, 1.6, 0.6, 'stone', 20); cy(p, 0, 0, 1.6, 1.75, 1.6, 'stone', 30, r2=1.4); cy(p, 0, 0, 1.75, 2.8, 0.15, 'stone', 12)
    ball(p, 0, 2.9, 0, 0.3, 'mirror', 2)
def monument(p, r):
    bx(p, 0, 0, 0, 4.0, 1.0, 4.0, 'stone', 0.05); bx(p, 0, 1.0, 0, 3.0, 0.6, 3.0, 'stone', 0.05)
    cy(p, 0, 0, 1.6, 14.0, 0.9, 'stone', 4, r2=0.2); ball(p, 0, 14.1, 0, 0.3, 'mirror', 1)
def statue(p, r):
    bx(p, 0, 0, 0, 1.6, 1.6, 1.6, 'stone', 0.04)
    cy(p, -0.2, 0, 1.6, 3.0, 0.16, 'metal', 10); cy(p, 0.2, 0, 1.6, 3.0, 0.16, 'metal', 10)
    cy(p, 0, 0, 3.0, 4.2, 0.35, 'metal', 12, r2=0.28); ball(p, 0, 4.5, 0, 0.24, 'metal', 2)
    add_cyl(p, 4.0, 0, 0.3, 1.1, 0.08, 'metal', seg=8, axis='x'); add_cyl(p, 4.1, 0, -1.1, -0.3, 0.08, 'metal', seg=8, axis='x')
    cy(p, 1.05, 0, 4.0, 5.6, 0.05, 'metal', 6)

# ---------------------------------------------------------------- batch 2: more of everything
def phonebooth(p, r):
    for sx in (-0.5, 0.5):
        for sz in (-0.5, 0.5): bx(p, sx, 0, sz, 0.08, 2.4, 0.08, 'tint')
    bx(p, 0, 2.4, 0, 1.15, 0.2, 1.15, 'tint', 0.02); bx(p, 0, 2.42, -0.58, 0.9, 0.14, 0.02, 'neoncyan', 0.003)
    for (x, z, w, d) in ((0, 0.52, 1.0, 0.03), (-0.52, 0, 0.03, 1.0), (0.52, 0, 0.03, 1.0)): bx(p, x, 0.1, z, w, 2.2, d, 'glass', 0.003)
    bx(p, 0, 1.1, 0.46, 0.4, 0.5, 0.1, 'paint'); bx(p, 0, 1.3, 0.4, 0.25, 0.18, 0.02, 'screen', 0.003)
def ticketmachine(p, r):
    bx(p, 0, 0, 0, 0.7, 1.7, 0.5, 'tint', 0.04); bx(p, 0, 1.0, -0.26, 0.45, 0.4, 0.02, 'screen', 0.003)
    bx(p, 0, 0.6, -0.27, 0.2, 0.05, 0.04, 'rubber'); bx(p, 0, 1.6, -0.26, 0.6, 0.08, 0.02, 'neonamber', 0.003)
def parkingmeter(p, r): cy(p, 0, 0, 0, 1.1, 0.04, 'paint', 8); bx(p, 0, 1.1, 0, 0.22, 0.32, 0.16, 'paint', 0.03); bx(p, 0, 1.25, -0.085, 0.14, 0.1, 0.01, 'screen', 0.002)
def trafficlight(p, r):
    cy(p, 0, 0, 0, 5.4, 0.1, 'paint', 10); rod_z(p, -3.6, 0, 0, 5.2, 0.06, 'paint')
    bx(p, 0, 4.0, -3.4, 0.36, 1.1, 0.3, 'paint', 0.03)
    for i in range(3): cy(p, 0, -3.56, 4.85 - i * 0.33, 4.88 - i * 0.33, 0.11, 'rubber', 12)        # (lit by the game: render/citytraffic.js)
    bx(p, 0, 1.0, -0.12, 0.3, 0.4, 0.2, 'paint')
def streetsign(p, r):
    cy(p, 0, 0, 0, 3.0, 0.04, 'metal', 8)
    for k, rot in ((0, 0), (1, 1)): bx(p, 0.5 if not rot else 0, 2.7 - k * 0.3, 0 if not rot else 0.5, 1.0 if not rot else 0.03, 0.22, 0.03 if not rot else 1.0, 'tint', 0.01)
def fountain_drink(p, r): cy(p, 0, 0, 0, 0.95, 0.18, 'stone', 12); cy(p, 0, 0, 0.95, 1.0, 0.24, 'metal', 14); cy(p, 0.1, 0, 1.0, 1.1, 0.02, 'metal', 6)
def recycler(p, r):
    for i, x in enumerate((-0.7, 0, 0.7)): bx(p, x, 0, 0, 0.62, 1.2, 0.62, 'tint', 0.04); bx(p, x, 1.0, -0.32, 0.3, 0.06, 0.02, ('neongreen', 'neonamber', 'neoncyan')[i], 0.003)
def bench_curved(p, r):
    for i in range(9):
        a = -0.8 + i * 0.2; x, z = math.sin(a) * 2.0, math.cos(a) * 2.0 - 2.0
        bx(p, x, 0, z, 0.42, 0.45, 0.5, 'stone', 0.02)
    for i in range(9):
        a = -0.8 + i * 0.2; bx(p, math.sin(a) * 2.2, 0.45, math.cos(a) * 2.2 - 2.0, 0.42, 0.04, 0.1, 'wood', 0.005)
def picnic(p, r):
    bx(p, 0, 0.72, 0, 1.8, 0.05, 0.8, 'wood'); [bx(p, 0, 0.42, s * 0.65, 1.8, 0.04, 0.3, 'wood') for s in (-1, 1)]
    for x in (-0.75, 0.75): bx(p, x, 0, 0, 0.06, 0.72, 1.6, 'metal')
def palm(p, r):
    rng = random.Random(r.random())
    for i in range(10): cy(p, math.sin(i * 0.25) * 0.15, 0, i * 0.7, i * 0.7 + 0.72, 0.18 - i * 0.008, 'bark', 8, r2=0.17 - i * 0.008)
    for k in range(9):
        a = k * 2 * math.pi / 9; bm = bmesh.new(); L = rng.uniform(2.4, 3.2)
        vs = [bm.verts.new(P(*q)) for q in ((0.12, 7.0, 0), (L * math.cos(a) - 0.3 * math.sin(a), 6.4 - L * 0.25, L * math.sin(a) + 0.3 * math.cos(a)), (L * math.cos(a) + 0.3 * math.sin(a), 6.4 - L * 0.25, L * math.sin(a) - 0.3 * math.cos(a)))]
        bm.faces.new(vs); merge(p, bm, 'leaf')
def hedge(p, r): add_cushion(p, -1.5, 0, -0.4, 1.5, 1.1, 0.4, 'leaf', 0.2, 0.4, 8)
def flowerbed(p, r):
    rng = random.Random(r.random()); bx(p, 0, 0, 0, 2.4, 0.4, 1.2, 'stone', 0.03); bx(p, 0, 0.3, 0, 2.2, 0.12, 1.0, 'soil')
    for i in range(18): ball(p, rng.uniform(-1, 1), 0.5, rng.uniform(-0.4, 0.4), 0.1, rng.choice(['tint', 'leaf', 'neonpink']), 1)
def lamp_ornate(p, r):
    cy(p, 0, 0, 0, 0.5, 0.2, 'paint', 12, r2=0.12); cy(p, 0, 0, 0.5, 4.4, 0.07, 'paint', 10)
    rod_x(p, -0.6, 0.6, 4.3, 0, 0.03, 'paint')
    for s in (-1, 1): bx(p, s * 0.6, 3.8, 0, 0.3, 0.45, 0.3, 'glass', 0.01); bx(p, s * 0.6, 3.86, 0, 0.18, 0.32, 0.18, 'lampwarm', 0.01)
def stall_meat(p, r):
    stall(p, r, 'tint', 'crates', 3.0, 2.2)
    rod_x(p, -1.3, 1.3, 2.2, -0.6, 0.02, 'metal')
    for i in range(6): cy(p, -1.1 + i * 0.44, -0.6, 1.45, 2.15, 0.12, 'tint', 8, r2=0.06)
def stall_pots(p, r):
    stall(p, r, 'fabric', 'spice', 3.0, 2.2, 'tent')
    for i in range(5): cy(p, -1.2 + i * 0.6, -1.5, 0, 0.5, 0.2, 'ceramic', 12, r2=0.12)
def stall_flowers(p, r):
    stall(p, r, 'tint', 'crates', 2.8, 2.0, 'umbrella'); rng = random.Random(2)
    for i in range(14): ball(p, rng.uniform(-1.2, 1.2), 1.05, rng.uniform(-0.9, -0.3), 0.12, rng.choice(['tint', 'neonpink', 'leaf', 'hazard']), 1)
def stall_juice(p, r):
    stall(p, r, 'tint', 'noodle', 2.6, 2.0)
    for i in range(3): cy(p, -0.8 + i * 0.8, 0.4, 1.0, 1.5, 0.15, 'glass', 12); cy(p, -0.8 + i * 0.8, 0.4, 1.02, 1.35, 0.13, ('neonamber', 'neonpink', 'neongreen')[i], 12)
def stall_droid(p, r):
    stall(p, r, 'corrugated', 'tech', 3.0, 2.4)
    ball(p, 0.8, 1.15, -0.6, 0.22, 'metal', 2); cy(p, 0.8, -0.6, 1.3, 1.4, 0.1, 'screen', 10); rod_x(p, -0.4, 0.2, 1.05, -0.6, 0.03, 'metal')
def stall_weapons(p, r):
    stall(p, r, 'corrugated', 'tech', 3.0, 2.2); bx(p, 0, 1.0, 1.0, 2.6, 1.2, 0.05, 'rubber')
    for i in range(5): bx(p, -1.0 + i * 0.5, 1.2 + (i % 2) * 0.4, 0.96, 0.4, 0.08, 0.02, 'metal')
def stall_fortune(p, r):
    for k in range(8):
        a = k * math.pi / 4; bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((1.4 * math.cos(a), 0, 1.4 * math.sin(a)), (1.4 * math.cos(a + math.pi / 4), 0, 1.4 * math.sin(a + math.pi / 4)), (0, 3.0, 0))]
        if k != 6: bm.faces.new(vs[::-1]); merge(p, bm, 'tint' if k % 2 else 'fabric')
    cy(p, 0, 0, 0, 0.7, 0.4, 'wood', 12); ball(p, 0, 0.85, 0, 0.16, 'neonviolet', 2)
def stall_tea(p, r):
    stall(p, r, 'fabric', 'noodle', 2.8, 2.0, 'umbrella')
    for i in range(3): cy(p, -0.9 + i * 0.9, -1.5, 0, 0.45, 0.25, 'wood', 10)
def stall_hats(p, r):
    stall(p, r, 'tint', 'cloth', 2.8, 2.0)
    for i in range(6): cy(p, -1.0 + i * 0.4, -0.6, 1.0, 1.12, 0.16, 'tint', 12); cy(p, -1.0 + i * 0.4, -0.6, 1.12, 1.25, 0.1, 'tint', 12)
def graffiti(p, r):
    bx(p, 0, 0, 0, 4.0, 2.6, 0.25, 'concrete', 0.02); rng = random.Random(r.random())
    for i in range(7): bx(p, rng.uniform(-1.6, 1.6), rng.uniform(0.3, 2.0), -0.13, rng.uniform(0.4, 1.4), rng.uniform(0.2, 0.6), 0.01, rng.choice(['tint', 'neonpink', 'hazard', 'neoncyan']), 0.002)
def barricade(p, r):
    rng = random.Random(r.random())
    for i in range(7): bx(p, rng.uniform(-1.5, 1.5), rng.uniform(0, 0.8), rng.uniform(-0.3, 0.3), rng.uniform(0.5, 1.2), 0.25, 0.3, rng.choice(['wood', 'corrugated', 'paint']), 0.01)
    cy(p, -1.2, 0, 0, 0.9, 0.29, 'tint', 12); cy(p, 1.3, 0.2, 0, 0.9, 0.29, 'corrugated', 12)
def burntcar(p, r):
    bx(p, 0, 0.25, 0, 4.2, 0.6, 1.8, 'rubber', 0.12); bx(p, -0.2, 0.85, 0, 2.2, 0.5, 1.6, 'corrugated', 0.1)
    for x in (-1.4, 1.4):
        for z in (-0.85, 0.85): add_cyl(p, 0.22, z, x - 0.12, x + 0.12, 0.22, 'metal', seg=10, axis='x')
def tent(p, r):
    for s in (-1, 1):
        bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((-1.1, 0, s * 1.0), (1.1, 0, s * 1.0), (1.1, 1.3, 0), (-1.1, 1.3, 0))]
        bm.faces.new(vs if s < 0 else vs[::-1]); merge(p, bm, 'tint')
    bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((1.1, 0, -1.0), (1.1, 0, 1.0), (1.1, 1.3, 0))]; bm.faces.new(vs); merge(p, bm, 'tint')
def generator(p, r):
    bx(p, 0, 0.2, 0, 1.6, 0.9, 0.9, 'hazard', 0.04); bx(p, 0, 0, 0, 1.8, 0.2, 1.0, 'metal')
    cy(p, 0.6, 0.2, 1.1, 1.6, 0.06, 'metal', 8); bx(p, -0.4, 0.6, -0.46, 0.4, 0.3, 0.02, 'screen', 0.003)
def cablespool(p, r): add_cyl(p, 0.6, 0, -0.45, 0.45, 0.6, 'wood', seg=20, axis='x'); add_cyl(p, 0.6, 0, -0.4, 0.4, 0.4, 'rubber', seg=16, axis='x')
def droid_delivery(p, r):
    bx(p, 0, 0.25, 0, 0.7, 0.55, 0.9, 'tint', 0.12); bx(p, 0, 0.8, 0, 0.6, 0.05, 0.8, 'metal')
    for x in (-0.33, 0.33):
        for z in (-0.3, 0.3): add_cyl(p, 0.12, z, x - 0.05, x + 0.05, 0.12, 'rubber', seg=10, axis='x')
    bx(p, 0, 0.6, -0.46, 0.4, 0.12, 0.02, 'neoncyan', 0.003); cy(p, 0.25, 0.35, 0.8, 1.6, 0.01, 'metal', 4)
def droid_cleaner(p, r): cy(p, 0, 0, 0.05, 0.35, 0.35, 'paint', 18); cy(p, 0, 0, 0.35, 0.45, 0.3, 'metal', 18); cy(p, 0, -0.2, 0.38, 0.42, 0.06, 'neongreen', 8)
def droid_sentry(p, r):
    cy(p, 0, 0, 0, 2.6, 0.06, 'metal', 8); ball(p, 0, 2.8, 0, 0.3, 'paint', 2); cy(p, 0, -0.28, 2.75, 2.85, 0.08, 'navred', 10)
    rod_x(p, -0.4, 0.4, 2.8, 0, 0.03, 'metal')
def walker(p, r):
    bx(p, 0, 2.6, 0, 1.6, 1.0, 2.0, 'hazard', 0.08); bx(p, 0, 2.9, -1.05, 1.2, 0.5, 0.1, 'visor', 0.03)
    for sx in (-0.6, 0.6):
        rod_z(p, -0.2, 0.2, sx, 2.2, 0.12, 'metal'); cy(p, sx, 0, 0.2, 2.3, 0.1, 'metal', 8); bx(p, sx, 0, 0.1, 0.4, 0.2, 0.9, 'rubber', 0.03)
def piperack(p, r):
    for x in (-3, 0, 3):
        for z in (-0.9, 0.9): cy(p, x, z, 0, 4.0, 0.12, 'hazard', 8)
        rod_z(p, -1, 1, x, 4.0, 0.08, 'hazard')
    for k in range(4): rod_x(p, -3.5, 3.5, 4.25, -0.75 + k * 0.5, 0.18 - k * 0.02, ('metal', 'paint', 'corrugated', 'metal')[k], 10)
def transformer(p, r):
    bx(p, 0, 0, 0, 2.4, 2.2, 1.6, 'paint', 0.04)
    for i in range(10): bx(p, -1.0 + i * 0.22, 0.3, -0.82, 0.06, 1.6, 0.06, 'metal', 0.005)
    for x in (-0.7, 0, 0.7): cy(p, x, 0.2, 2.2, 3.0, 0.1, 'ceramic', 10, r2=0.06)
    bx(p, 0, 1.6, -0.81, 0.5, 0.4, 0.02, 'hazard', 0.003)
def conveyor(p, r):
    bx(p, 0, 1.0, 0, 6.0, 0.25, 1.0, 'rubber', 0.02)
    for x in (-2.6, 0, 2.6): bx(p, x, 0, 0, 0.15, 1.0, 0.9, 'paint')
    for i in range(5): bx(p, -2.4 + i * 1.2, 1.25, 0, 0.6, 0.45, 0.6, 'cardboard', 0.01)
def gastanks(p, r):
    for i in range(7): cy(p, -0.9 + i * 0.3, 0, 0, 1.5, 0.12, 'tint' if i % 2 else 'hazard', 10); ball(p, -0.9 + i * 0.3, 1.5, 0, 0.12, 'metal', 1)
    rod_x(p, -1.1, 1.1, 1.1, 0.14, 0.02, 'metal')
def valve(p, r):
    rod_x(p, -1.5, 1.5, 0.6, 0, 0.15, 'paint', 10); cy(p, 0, 0, 0.3, 1.3, 0.22, 'paint', 10)
    cy(p, 0, 0, 1.3, 1.36, 0.3, 'tint', 16)          # the handwheel
def radar(p, r):
    bx(p, 0, 0, 0, 2.0, 3.0, 2.0, 'paint', 0.04); cy(p, 0, 0, 3.0, 3.6, 0.3, 'metal', 10)
    bx(p, 0, 3.6, 0, 4.0, 1.2, 0.2, 'ceramic', 0.05); ball(p, 0, 0.0 + 3.0, -1.02, 0.1, 'navred', 1)
def windsock(p, r):
    cy(p, 0, 0, 0, 5.0, 0.05, 'paint', 8); rod_x(p, 0, 1.6, 4.85, 0, 0.25, 'hazard', 10)
def baggagecart(p, r):
    for k in range(2): bx(p, k * 2.2 - 1.1, 0.35, 0, 2.0, 0.08, 1.2, 'metal', 0.01); bx(p, k * 2.2 - 1.1, 0.43, 0, 1.6, 0.6, 1.0, 'cardboard', 0.02)
    for k in range(2):
        for z in (-0.5, 0.5): add_cyl(p, 0.18, z, k * 2.2 - 1.1 - 0.7, k * 2.2 - 1.1 - 0.6, 0.18, 'rubber', seg=10, axis='x')
def beacontower(p, r):
    for sx in (-1, 1):
        for sz in (-1, 1): cy(p, sx * 0.8, sz * 0.8, 0, 12, 0.08, 'hazard', 6, r2=0.05)
    for y in range(2, 12, 2): bx(p, 0, y, 0, 1.7, 0.08, 1.7, 'hazard', 0.005)
    ball(p, 0, 12.4, 0, 0.4, 'navred', 2)
def controlbooth(p, r):
    bx(p, 0, 0, 0, 2.6, 2.4, 2.4, 'paint', 0.04); bx(p, 0, 1.2, -1.21, 2.2, 0.9, 0.02, 'visor', 0.003)
    bx(p, 0, 2.4, 0, 3.0, 0.15, 2.8, 'metal', 0.02); cy(p, 1.0, 1.0, 2.55, 3.5, 0.03, 'metal', 4)
def fueltank(p, r): add_cyl(p, 1.6, 0, -3.5, 3.5, 1.4, 'paint', seg=24, axis='x'); [bx(p, x, 0, 0, 0.4, 0.4, 2.2, 'concrete') for x in (-2.5, 2.5)]; bx(p, 0, 3.0, 0, 0.6, 0.4, 0.6, 'hazard')
def gazebo(p, r):
    cy(p, 0, 0, 0, 0.3, 2.8, 'stone', 8)
    for k in range(8): a = k * math.pi / 4; cy(p, 2.5 * math.cos(a), 2.5 * math.sin(a), 0.3, 3.0, 0.08, 'paint', 8)
    cy(p, 0, 0, 3.0, 4.6, 3.0, 'tint', 8, r2=0.1)
def footbridge(p, r):
    bm_pts = [(x, 0.6 * math.cos(x / 4.0 * math.pi / 2) ) for x in (-4, -2, 0, 2, 4)]
    for i in range(4):
        x0, y0 = bm_pts[i]; x1, y1 = bm_pts[i + 1]; bx(p, (x0 + x1) / 2, (y0 + y1) / 2, 0, 2.1, 0.15, 1.8, 'wood', 0.01)
    for s in (-0.85, 0.85): rod_x(p, -4, 4, 1.4, s, 0.04, 'wood'); [cy(p, x, s, 0, 1.4, 0.05, 'wood', 6) for x in (-3.6, -1.2, 1.2, 3.6)]
def sculpture1(p, r):
    bx(p, 0, 0, 0, 1.2, 0.6, 1.2, 'stone', 0.03)
    for k in range(5): a = k * 1.1; bx(p, 0.2 * math.cos(a), 0.6 + k * 0.7, 0.2 * math.sin(a), 0.5, 0.7, 0.5, 'mirror', 0.08)
def sculpture2(p, r):
    bx(p, 0, 0, 0, 1.5, 0.5, 1.5, 'stone', 0.03); bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    for v in bm.verts: x, y, z = v.co; v.co = P(x * (1 + 0.6 * math.sin(z * 3)), 2.2 + z * 1.4, y)
    merge(p, bm, 'metal')
def sculpture3(p, r):
    bx(p, 0, 0, 0, 1.0, 0.4, 1.0, 'stone', 0.03)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=1.2, radius2=1.2, depth=0.18)
    for v in bm.verts: x, y, z = v.co; v.co = P(x, 1.6 + y, z)
    merge(p, bm, 'tint')
def roofgarden(p, r):
    plant(p, fern, 3.6, 2.6, 0.9, r, 0.5)
    bx(p, 0, 0, 0, 4.0, 0.5, 3.0, 'wood', 0.02); bx(p, 0, 0.4, 0, 3.8, 0.12, 2.8, 'soil')
def watertower(p, r):
    for sx in (-1, 1):
        for sz in (-1, 1): cy(p, sx * 1.2, sz * 1.2, 0, 4.0, 0.1, 'metal', 6)
    cy(p, 0, 0, 4.0, 7.0, 1.8, 'paint', 24); cy(p, 0, 0, 7.0, 8.2, 1.85, 'paint', 24, r2=0.1)
def helipadmark(p, r):
    bx(p, 0, 0, 0, 14, 0.04, 14, 'paint', 0.002)
    bx(p, -2, 0.04, 0, 0.6, 0.01, 5, 'neonamber', 0.001); bx(p, 2, 0.04, 0, 0.6, 0.01, 5, 'neonamber', 0.001); bx(p, 0, 0.04, 0, 4, 0.01, 0.6, 'neonamber', 0.001)
def antennacluster(p, r):
    rng = random.Random(r.random()); bx(p, 0, 0, 0, 1.6, 0.3, 1.6, 'concrete')
    for i in range(6): x, z, h = rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), rng.uniform(2, 6); cy(p, x, z, 0.3, h, 0.03, 'metal', 6); ball(p, x, h, z, 0.06, 'navred' if i % 2 else 'metal', 1)
def windturbine(p, r):
    cy(p, 0, 0, 0, 5.0, 0.12, 'paint', 10); bx(p, 0, 5.0, 0.1, 0.4, 0.4, 0.8, 'paint', 0.05)
    for k in range(3):
        a = k * 2 * math.pi / 3; bx(p, 1.2 * math.cos(a), 5.2 + 1.2 * math.sin(a), -0.35, 2.4 if k == 0 else 0.25, 0.25 if k == 0 else 2.4, 0.04, 'paint', 0.01)
def chimney(p, r):
    bx(p, 0, 0, 0, 1.0, 3.2, 1.0, 'concrete', 0.02); bx(p, 0, 3.2, 0, 1.2, 0.2, 1.2, 'concrete', 0.02)
    for x in (-0.25, 0.25): cy(p, x, 0, 3.4, 3.9, 0.15, 'metal', 10)
def ad_tall(p, r):
    bx(p, 0, 0, 0, 1.8, 6.0, 0.3, 'metal', 0.03); bx(p, 0, 0.2, -0.16, 1.6, 5.6, 0.02, 'screen', 0.003)
    for i in range(4): bx(p, 0, 1 + i * 1.3, -0.18, 1.2, 0.5, 0.01, ('neonpink', 'neoncyan', 'neonamber', 'neonviolet')[i], 0.002)
def ad_letters(p, r):
    for i, (w, m) in enumerate(((0.9, 'neonpink'), (0.9, 'neonpink'), (0.9, 'neonamber'), (0.9, 'neoncyan'), (0.9, 'neonpink'))):
        bx(p, -2.0 + i * 1.0, 0.0, 0, w * 0.8, 1.4, 0.15, m, 0.02)
    rod_x(p, -2.6, 2.6, 0.05, 0.2, 0.04, 'metal'); [cy(p, x, 0.2, -1.5, 0.05, 0.04, 'metal', 6) for x in (-2.2, 0, 2.2)]
def holo_globe(p, r):
    cy(p, 0, 0, 0, 0.6, 0.6, 'mirror', 20); ball(p, 0, 1.8, 0, 1.0, 'neoncyan', 2)
def kiosk_noodle(p, r):
    kiosk(p, r); bx(p, 0, 2.62, -1.31, 2.6, 0.16, 0.03, 'neonpink', 0.004)
    for i in range(3): cy(p, -0.8 + i * 0.8, -1.7, 0, 0.62, 0.17, 'tint', 10)
def busstop(p, r):
    cy(p, 0, 0, 0, 3.0, 0.05, 'metal', 8); bx(p, 0, 2.5, 0, 0.6, 0.6, 0.06, 'tint', 0.02); bx(p, 0, 1.3, 0.04, 0.4, 0.8, 0.04, 'screen', 0.003)
def scooter(p, r):
    bx(p, 0, 0.25, 0, 0.3, 0.1, 1.2, 'tint', 0.03); cy(p, 0, -0.5, 0.3, 1.1, 0.03, 'metal', 6); rod_x(p, -0.25, 0.25, 1.1, -0.5, 0.02, 'rubber')
    for z in (-0.5, 0.5): add_cyl(p, 0.12, z, -0.03, 0.03, 0.12, 'rubber', seg=12, axis='x')
def planter_tall(p, r):
    cy(p, 0, 0, 0, 1.2, 0.5, 'tint', 16, r2=0.4); rng = random.Random(4)
    for i in range(5): cy(p, rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 1.1, 2.4 + rng.uniform(0, 0.8), 0.03, 'leaf', 5)
def bollard_light(p, r): cy(p, 0, 0, 0, 0.8, 0.1, 'mirror', 12); cy(p, 0, 0, 0.6, 0.75, 0.105, 'lampwarm', 12)
def newsscreen(p, r): cy(p, 0, 0, 0, 2.2, 0.08, 'metal', 8); bx(p, 0, 2.2, 0, 2.4, 1.4, 0.15, 'metal', 0.02); bx(p, 0, 2.28, -0.08, 2.2, 1.24, 0.02, 'screen', 0.003)

# ---------------------------------------------------------------- batch 3: building sites, transit, bars and shops, civic
def cone(p, r): cy(p, 0, 0, 0.03, 0.7, 0.14, 'hazard', 12, r2=0.03); bx(p, 0, 0, 0, 0.36, 0.03, 0.36, 'rubber')
def conegroup(p, r):
    rng = random.Random(r.random())
    for i in range(5): x, z = -1.6 + i * 0.8, rng.uniform(-0.1, 0.1); cy(p, x, z, 0.03, 0.7, 0.14, 'hazard', 10, r2=0.03); bx(p, x, 0, z, 0.36, 0.03, 0.36, 'rubber')
def scaffold(p, r):
    for x in (-3, 0, 3):
        for z in (-0.6, 0.6): cy(p, x, z, 0, 8, 0.03, 'metal', 6)
    for y in (2, 4, 6, 8):
        rod_x(p, -3, 3, y, -0.6, 0.025, 'metal', 5); rod_x(p, -3, 3, y, 0.6, 0.025, 'metal', 5); bx(p, 0, y, 0, 6, 0.04, 1.1, 'wood', 0.003)
        for x in (-3, 0, 3): rod_z(p, -0.6, 0.6, x, y, 0.025, 'metal', 5)
def excavator(p, r):
    for s in (-1, 1): bx(p, 0, 0, s * 1.05, 4.2, 0.8, 0.6, 'rubber', 0.1)
    bx(p, 0, 0.8, 0, 3.2, 1.0, 2.2, 'hazard', 0.06); bx(p, 0.6, 1.8, -0.5, 1.1, 1.3, 1.1, 'visor', 0.05); bx(p, -1.0, 1.8, 0.2, 1.2, 0.6, 1.5, 'hazard', 0.04)
    for (a, b2) in (((1, 1.9), (3.4, 3.8)), ((3.4, 3.8), (5.2, 1.6))):
        n = 5
        for i in range(n): f = i / (n - 1); bx(p, a[0] + (b2[0] - a[0]) * f, a[1] + (b2[1] - a[1]) * f, 0, 0.5, 0.42, 0.34, 'hazard', 0.02)
    bx(p, 5.3, 0.9, 0, 0.8, 0.7, 0.9, 'metal', 0.03)
def mixer(p, r):
    bx(p, 0, 0.3, 0, 1.6, 0.1, 0.9, 'metal'); add_cyl(p, 0.22, 0.42, -0.5, -0.42, 0.22, 'rubber', seg=12, axis='x'); add_cyl(p, 0.22, 0.42, 0.42, 0.5, 0.22, 'rubber', seg=12, axis='x')
    cy(p, 0.1, 0, 0.45, 1.0, 0.45, 'hazard', 16); cy(p, 0.1, 0, 1.0, 1.4, 0.45, 'hazard', 16, r2=0.22); bx(p, -0.7, 0.4, 0, 0.4, 0.5, 0.5, 'paint', 0.03)
def portaloo(p, r):
    bx(p, 0, 0, 0, 1.15, 2.2, 1.15, 'tint', 0.04); bx(p, 0, 2.2, 0, 1.25, 0.1, 1.25, 'plastic', 0.03); bx(p, 0, 0.05, -0.59, 0.85, 2.0, 0.03, 'tint', 0.01); bx(p, 0.3, 1.0, -0.62, 0.1, 0.1, 0.03, 'rubber')
def bricks(p, r):
    for y in range(4):
        for x in range(3):
            for z in range(2): bx(p, -0.6 + x * 0.6, y * 0.26, -0.3 + z * 0.6, 0.56, 0.24, 0.56, 'tint', 0.01)
    bx(p, 0, 0, 0, 1.9, 0.08, 1.3, 'wood')
def sandheap(p, r): cy(p, 0, 0, 0, 1.4, 2.4, 'soil', 20, r2=0.25)
def girders(p, r):
    for i in range(6): y = i // 3 * 0.32; z = -0.5 + (i % 3) * 0.5; bx(p, 0, y, z, 6.0, 0.07, 0.3, 'hazard', 0.005); bx(p, 0, y + 0.07, z, 6.0, 0.16, 0.05, 'hazard', 0.003); bx(p, 0, y + 0.23, z, 6.0, 0.07, 0.3, 'hazard', 0.005)
def sitefence(p, r):
    for x in (-3, 0, 3): bx(p, x, 0, 0, 0.08, 2.2, 0.08, 'metal'); bx(p, x, 0, 0, 0.5, 0.1, 0.8, 'concrete')
    bx(p, 0, 0.1, 0, 6, 2.0, 0.03, 'tint', 0.003); bx(p, 0, 1.0, -0.02, 2.0, 0.6, 0.01, 'hazard', 0.002)
def towercrane(p, r):
    for sx in (-1, 1):
        for sz in (-1, 1): cy(p, sx * 1.1, sz * 1.1, 0, 44, 0.09, 'hazard', 5)
    for y in range(3, 44, 4): bx(p, 0, y, 0, 2.3, 0.1, 2.3, 'hazard', 0.005)
    bx(p, 0, 0, 0, 5, 0.8, 5, 'concrete', 0.02); bx(p, 13, 44.5, 0, 30, 0.8, 0.8, 'hazard', 0.01); bx(p, -7, 44.2, 0, 10, 1.3, 1.1, 'concrete', 0.02); bx(p, 0.8, 44, -1.2, 1.5, 2.1, 1.5, 'visor', 0.03)
    cy(p, 22, 0, 26, 44.5, 0.03, 'metal', 4); bx(p, 22, 25.4, 0, 1.0, 0.6, 1.0, 'hazard', 0.02)
def tramstop(p, r):
    bx(p, 0, 0, 0, 9, 0.28, 2.6, 'stone', 0.02); bx(p, 0, 0.28, 0.9, 8.6, 2.6, 0.05, 'glass', 0.005); bx(p, 0, 2.95, 0.1, 9.2, 0.12, 2.4, 'metal', 0.02)
    for x in (-4, 0, 4): bx(p, x, 0.28, 1.0, 0.1, 2.7, 0.1, 'metal')
    bx(p, -2.2, 0.28, 0.65, 2.5, 0.45, 0.45, 'wood'); bx(p, 2.5, 0.8, 0.82, 2.2, 1.3, 0.04, 'screen', 0.003); bx(p, 0, 2.8, -1.05, 3.4, 0.22, 0.03, 'neoncyan', 0.004)
def monopylon(p, r):
    cy(p, 0, 0, 0, 12, 0.8, 'concrete', 20, r2=0.55); bx(p, 0, 12, 0, 1.6, 1.0, 5.4, 'concrete', 0.1); bx(p, 0, 0, 0, 2.2, 0.4, 2.2, 'concrete', 0.03)
def turnstile(p, r):
    for x in (-0.6, 0.6): bx(p, x, 0, 0, 0.18, 1.0, 1.2, 'mirror', 0.03); bx(p, x, 1.0, -0.4, 0.14, 0.03, 0.2, 'neongreen', 0.003)
    for z in (-0.1, 0.1): rod_x(p, -0.5, 0.5, 0.82, z, 0.02, 'metal', 6)
def bigclock(p, r):
    cy(p, 0, 0, 0, 5.2, 0.14, 'paint', 12); add_cyl(p, 5.5, 0, -0.08, 0.08, 0.5, 'paint', seg=24, axis='z'); add_cyl(p, 5.5, 0, -0.1, -0.07, 0.44, 'ceramic', seg=24, axis='z')
    bx(p, 0.14, 5.5, -0.12, 0.28, 0.03, 0.01, 'rubber', 0.001); bx(p, 0, 5.62, -0.12, 0.03, 0.24, 0.01, 'rubber', 0.001)
def postbox(p, r): cy(p, 0, 0, 0, 1.5, 0.28, 'tint', 16); cy(p, 0, 0, 1.5, 1.68, 0.3, 'tint', 16, r2=0.22); bx(p, 0, 1.2, -0.28, 0.3, 0.04, 0.02, 'rubber', 0.002)
def flagpole(p, r): cy(p, 0, 0, 0, 10, 0.06, 'metal', 8, r2=0.03); bx(p, 0.7, 8.6, 0, 1.4, 0.9, 0.02, 'tint', 0.003); bx(p, 0, 0, 0, 0.9, 0.3, 0.9, 'stone', 0.03)
def banner(p, r): cy(p, 0, 0, 0, 7, 0.07, 'paint', 8); bx(p, 0, 7, -0.45, 0.04, 0.04, 0.9, 'metal'); bx(p, 0, 4.3, -0.45, 0.02, 2.7, 0.8, 'tint', 0.003)
def gate(p, r):
    for x in (-2.4, 2.4): bx(p, x, 0, 0, 0.6, 3.6, 0.6, 'stone', 0.03)
    for i in range(14): bx(p, -1.95 + i * 0.3, 0, 0, 0.04, 2.8, 0.04, 'paint')
    bx(p, 0, 2.8, 0, 4.2, 0.1, 0.06, 'paint'); bx(p, 0, 1.0, 0, 4.2, 0.08, 0.05, 'paint')
def wallsegment(p, r): bx(p, 0, 0, 0, 5, 2.2, 0.35, 'concrete', 0.02); bx(p, 0, 2.2, 0, 5.1, 0.12, 0.45, 'stone', 0.02)
def chainfence(p, r):
    for x in (-2.5, 0, 2.5): cy(p, x, 0, 0, 2.3, 0.04, 'metal', 6)
    rod_x(p, -2.5, 2.5, 2.25, 0, 0.02, 'metal', 5); rod_x(p, -2.5, 2.5, 0.05, 0, 0.02, 'metal', 5)
    for i in range(17): cy(p, -2.4 + i * 0.3, 0, 0.05, 2.25, 0.006, 'metal', 3)
    for y in (0.5, 1.0, 1.5, 2.0): rod_x(p, -2.5, 2.5, y, 0, 0.006, 'metal', 3)
def toll(p, r):
    bx(p, -1.6, 0, 0, 1.2, 2.5, 1.6, 'tint', 0.03); bx(p, -1.6, 1.2, -0.81, 1.0, 0.9, 0.02, 'visor', 0.003); bx(p, -1.6, 2.5, 0, 1.6, 0.14, 2.2, 'metal', 0.02)
    rod_x(p, -1.0, 2.4, 1.05, -0.4, 0.04, 'hazard', 8); bx(p, -0.95, 0, -0.4, 0.2, 1.15, 0.2, 'paint', 0.02)
def bar_counter(p, r):
    bx(p, 0, 0, 0, 4.2, 1.05, 0.7, 'wood', 0.02); bx(p, 0, 1.05, -0.03, 4.4, 0.05, 0.85, 'stone', 0.01); rod_x(p, -2.1, 2.1, 0.2, -0.42, 0.02, 'metal', 6)
    for x in (-1.2, 0.6): cy(p, x, 0.1, 1.1, 1.45, 0.03, 'metal', 8); rod_z(p, -0.14, 0.1, x, 1.45, 0.02, 'metal', 6)
    for i in range(3): cy(p, -0.3 + i * 0.3, 0, 1.1, 1.22, 0.04, 'glass', 8)
def bar_shelf(p, r):
    rng = random.Random(r.random()); bx(p, 0, 0, 0, 3.4, 2.4, 0.3, 'wood', 0.01); bx(p, 0, 0.9, -0.12, 3.2, 1.3, 0.04, 'mirror', 0.003)
    for y in (1.0, 1.6):
        bx(p, 0, y - 0.03, -0.14, 3.2, 0.03, 0.24, 'wood')
        for i in range(13): x = -1.5 + i * 0.25; h = rng.uniform(0.2, 0.34); cy(p, x, -0.16, y, y + h, 0.04, rng.choice(['glass', 'tint', 'neonamber', 'visor']), 8, r2=0.02)
def barstool(p, r): cy(p, 0, 0, 0.03, 0.75, 0.03, 'metal', 8); cy(p, 0, 0, 0, 0.04, 0.2, 'metal', 14); cy(p, 0, 0, 0.75, 0.84, 0.18, 'tint', 14); add_cyl(p, 0.3, 0, -0.14, 0.14, 0.012, 'metal', seg=5, axis='x')
def booth(p, r):
    for s in (-1, 1):
        add_cushion(p, -0.8, 0.3, s * 0.82 - 0.26, 0.8, 0.52, s * 0.82 + 0.26, 'tint', 0.2, 0.3, 6); add_cushion(p, -0.8, 0.5, s * 1.05 - 0.1, 0.8, 1.2, s * 1.05 + 0.1, 'tint', 0.2, 0.3, 6); bx(p, 0, 0, s * 0.82, 1.6, 0.3, 0.5, 'wood')
    bx(p, 0, 0.72, 0, 1.4, 0.05, 0.75, 'wood', 0.01); cy(p, 0, 0, 0, 0.72, 0.06, 'metal', 8)
def jukebox(p, r):
    bx(p, 0, 0, 0, 0.9, 1.1, 0.55, 'wood', 0.03); add_cyl(p, 1.1, 0, -0.27, 0.27, 0.44, 'neonamber', seg=20, axis='z'); bx(p, 0, 0.7, -0.28, 0.6, 0.34, 0.02, 'screen', 0.003)
    for i in range(4): bx(p, -0.3 + i * 0.2, 0.15, -0.28, 0.1, 0.42, 0.01, 'neonpink', 0.002)
def pooltable(p, r):
    bx(p, 0, 0.72, 0, 2.5, 0.12, 1.4, 'wood', 0.02); bx(p, 0, 0.84, 0, 2.3, 0.01, 1.2, 'tint', 0.002)
    for sx in (-1, 1):
        for sz in (-1, 1): bx(p, sx * 1.05, 0, sz * 0.55, 0.14, 0.72, 0.14, 'wood', 0.01)
    rng = random.Random(1)
    for i in range(9): ball(p, rng.uniform(-0.8, 0.8), 0.875, rng.uniform(-0.4, 0.4), 0.028, rng.choice(['tint', 'ceramic', 'rubber']), 1)
def arcade(p, r):
    bx(p, 0, 0, 0, 0.75, 1.75, 0.7, 'tint', 0.03); bx(p, 0, 1.15, -0.2, 0.6, 0.45, 0.02, 'screen', 0.003); bx(p, 0, 0.9, -0.25, 0.65, 0.05, 0.3, 'rubber', 0.01); ball(p, -0.15, 0.97, -0.28, 0.03, 'navred', 1); bx(p, 0, 1.68, -0.36, 0.7, 0.12, 0.02, 'neonviolet', 0.003)
def dartboard(p, r): bx(p, 0, 1.3, 0, 0.8, 0.8, 0.04, 'wood'); add_cyl(p, 1.7, -0.03, -0.03, 0.0, 0.24, 'rubber', seg=20, axis='z'); add_cyl(p, 1.7, -0.04, -0.04, -0.03, 0.07, 'navred', seg=12, axis='z')
def clothesrack(p, r):
    rng = random.Random(r.random()); cy(p, -0.8, 0, 0, 1.5, 0.02, 'metal', 6); cy(p, 0.8, 0, 0, 1.5, 0.02, 'metal', 6); rod_x(p, -0.8, 0.8, 1.5, 0, 0.015, 'metal', 6)
    for i in range(9): bx(p, -0.7 + i * 0.175, 0.65, 0, 0.13, 0.85, 0.42, 'tint' if rng.random() > 0.4 else 'fabric', 0.02)
def mannequin(p, r):
    bx(p, 0, 0, 0, 0.36, 0.03, 0.36, 'metal'); cy(p, 0, 0, 0.03, 0.9, 0.025, 'metal', 6); cy(p, 0, 0, 0.9, 1.45, 0.17, 'plastic', 12, r2=0.2); ball(p, 0, 1.6, 0, 0.11, 'plastic', 2)
def displaycase(p, r):
    bx(p, 0, 0, 0, 1.6, 0.85, 0.6, 'wood', 0.02); bx(p, 0, 0.85, 0, 1.6, 0.55, 0.6, 'glass', 0.005); rng = random.Random(r.random())
    for i in range(6): ball(p, -0.6 + i * 0.24, 0.92, rng.uniform(-0.1, 0.1), 0.05, rng.choice(['mirror', 'tint', 'neonamber']), 1)
def freezer(p, r): bx(p, 0, 0, 0, 2.0, 0.85, 0.85, 'ceramic', 0.03); bx(p, 0, 0.85, 0, 1.9, 0.03, 0.75, 'glass', 0.003); bx(p, 0, 0.3, -0.43, 1.6, 0.12, 0.01, 'neoncyan', 0.002)
def hospitalbed(p, r):
    bx(p, 0, 0.55, 0, 2.0, 0.1, 0.9, 'metal', 0.01); add_cushion(p, -0.95, 0.65, -0.42, 0.95, 0.82, 0.42, 'fabric', 0.1, 0.3, 6); bx(p, -1.0, 0.55, 0, 0.04, 0.55, 0.88, 'metal')
    for sx in (-0.9, 0.9):
        for sz in (-0.38, 0.38): cy(p, sx, sz, 0.08, 0.55, 0.02, 'metal', 6); ball(p, sx, 0.06, sz, 0.05, 'rubber', 1)
def medscanner(p, r):
    bx(p, 0, 0, 0, 2.2, 0.75, 0.8, 'ceramic', 0.04); add_cyl(p, 0.95, 0, 0.6, 1.1, 0.72, 'ceramic', seg=28, axis='x'); add_cyl(p, 0.95, 0, 0.6, 1.11, 0.45, 'rubber', seg=24, axis='x'); bx(p, 1.0, 1.3, -0.65, 0.1, 0.1, 0.02, 'neoncyan', 0.002)
def gymbench(p, r):
    bx(p, 0, 0.42, 0, 1.2, 0.08, 0.3, 'fabric', 0.02); [bx(p, x, 0, 0, 0.08, 0.42, 0.5, 'metal') for x in (-0.5, 0.5)]; [cy(p, -0.55, z, 0, 1.1, 0.02, 'metal', 6) for z in (-0.4, 0.4)]
    rod_z(p, -0.8, 0.8, -0.55, 1.1, 0.012, 'metal', 6); [add_cyl(p, -0.55, 1.1, z - 0.03, z + 0.03, 0.2, 'rubber', seg=16, axis='z') for z in (-0.7, 0.7)]
def treadmill(p, r):
    bx(p, 0, 0.05, 0, 0.75, 0.1, 1.7, 'rubber', 0.02); [cy(p, x, -0.75, 0.1, 1.3, 0.025, 'metal', 6) for x in (-0.33, 0.33)]; bx(p, 0, 1.3, -0.8, 0.7, 0.3, 0.1, 'screen', 0.01)
def serverrack(p, r):
    bx(p, 0, 0, 0, 0.7, 2.1, 0.9, 'rubber', 0.01); rng = random.Random(r.random())
    for i in range(14):
        bx(p, 0, 0.1 + i * 0.14, -0.46, 0.6, 0.11, 0.01, 'metal', 0.001)
        for k in range(4): bx(p, -0.25 + k * 0.1, 0.13 + i * 0.14, -0.47, 0.025, 0.025, 0.005, rng.choice(['neongreen', 'neonamber', 'neoncyan']), 0.001)
def officepod(p, r): bx(p, 0, 0.72, -0.1, 1.4, 0.04, 0.7, 'laminate'); [bx(p, x, 0, -0.1, 0.04, 0.72, 0.65, 'metal') for x in (-0.65, 0.65)]; bx(p, 0, 0.72, 0.28, 1.5, 0.7, 0.05, 'fabric', 0.01); bx(p, 0, 0.8, 0.05, 0.55, 0.36, 0.02, 'screen', 0.003)
def lockerbank(p, r):
    for i in range(5): bx(p, -1.0 + i * 0.5, 0, 0, 0.48, 1.9, 0.5, 'tint', 0.008); bx(p, -1.0 + i * 0.5, 1.5, -0.26, 0.25, 0.04, 0.01, 'rubber', 0.001); bx(p, -0.82 + i * 0.5, 0.9, -0.26, 0.02, 0.1, 0.01, 'metal', 0.001)
def police_barrier(p, r): bx(p, 0, 0.05, 0, 2.4, 0.9, 0.08, 'hazard', 0.01); [bx(p, x, 0, 0, 0.1, 0.1, 0.6, 'rubber') for x in (-1, 1)]; bx(p, 0, 1.0, 0, 0.3, 0.1, 0.1, 'navred', 0.01)
def checkpoint(p, r):
    bx(p, 0, 0, 0, 2.2, 2.6, 2.2, 'paint', 0.04); bx(p, 0, 1.3, -1.11, 1.8, 0.9, 0.02, 'visor', 0.003); bx(p, 0, 2.6, 0, 2.8, 0.12, 2.8, 'metal'); cy(p, 0.9, 0.9, 2.7, 3.8, 0.02, 'metal', 4); ball(p, 0.9, 3.85, 0.9, 0.09, 'navred', 1)
    bx(p, 0, 2.7, -1.4, 1.6, 0.2, 0.03, 'neonamber', 0.003)
def sewergrate(p, r):
    bx(p, 0, 0, 0, 1.0, 0.04, 0.7, 'metal', 0.005)
    for i in range(8): bx(p, -0.42 + i * 0.12, 0.04, 0, 0.05, 0.01, 0.6, 'rubber', 0.001)
def manhole(p, r): cy(p, 0, 0, 0, 0.03, 0.42, 'metal', 20); cy(p, 0, 0, 0.03, 0.035, 0.32, 'rubber', 16)
def bollard_chain(p, r):
    for x in (-1.5, 0, 1.5): cy(p, x, 0, 0, 0.8, 0.05, 'paint', 8); ball(p, x, 0.82, 0, 0.06, 'paint', 1)
    for x0 in (-1.5, 0):
        for i in range(6): f = i / 5; ball(p, x0 + f * 1.5, 0.7 - 0.2 * math.sin(f * math.pi), 0, 0.015, 'metal', 0)
def skip_bin(p, r):
    bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((-1.8, 0, -0.8), (1.8, 0, -0.8), (2.3, 1.2, -1.0), (-2.3, 1.2, -1.0))]; bm.faces.new(vs[::-1]); merge(p, bm, 'tint')
    bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((-1.8, 0, 0.8), (1.8, 0, 0.8), (2.3, 1.2, 1.0), (-2.3, 1.2, 1.0))]; bm.faces.new(vs); merge(p, bm, 'tint')
    bx(p, 0, 0, 0, 3.6, 0.06, 1.6, 'tint'); bx(p, 0, 0.5, 0, 3.8, 0.6, 1.5, 'corrugated', 0.05)
def ladder_wall(p, r):
    for x in (-0.22, 0.22): bx(p, x, 0, 0, 0.04, 4, 0.04, 'metal')
    for i in range(13): rod_x(p, -0.22, 0.22, 0.2 + i * 0.3, 0, 0.012, 'metal', 5)
def drainpipe(p, r):
    cy(p, 0, 0, 0, 8, 0.05, 'paint', 8)
    for y in range(1, 8, 2): bx(p, 0, y, 0.05, 0.14, 0.04, 0.05, 'metal')
def wallac(p, r): bx(p, 0, 0, 0, 0.9, 0.6, 0.35, 'paint', 0.02); add_cyl(p, 0.3, -0.18, -0.01, 0.01, 0.24, 'rubber', seg=16, axis='z'); bx(p, 0, -0.22, 0.1, 0.5, 0.04, 0.3, 'metal')
def foodtruck(p, r):
    bx(p, 0, 0.5, 0, 5.2, 2.2, 2.1, 'tint', 0.08); bx(p, 2.4, 0.5, 0, 0.8, 1.5, 2.0, 'visor', 0.06); bx(p, -0.5, 1.3, -1.06, 2.6, 0.9, 0.03, 'rubber', 0.005); bx(p, -0.5, 1.2, -1.2, 2.7, 0.06, 0.32, 'metal')
    bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((-1.8, 2.25, -1.06), (0.8, 2.25, -1.06), (0.8, 2.0, -1.9), (-1.8, 2.0, -1.9))]; bm.faces.new(vs); merge(p, bm, 'tint')
    for x in (-1.6, 1.6):
        for z in (-1.0, 1.0): add_cyl(p, 0.4, z, x - 0.14, x + 0.14, 0.4, 'rubber', seg=14, axis='x')
    bx(p, -0.5, 2.3, -1.08, 2.0, 0.3, 0.03, 'neonpink', 0.004)

KINDS = """lanternline lamp_double lamp_neon tree bollard bench hydrant stall_fish stall_canopy stall_spice stall_fruit stall_tent stall_cart stall_tech stall_grill
stall_noodle stall_cloth stall_umbrella planter stall_crate bin bikerack shelter lamp_lantern mailbox lamp_cobra aerial antenna solar ac skylight beacon vent cooling dish
ac2 billboard tank_roof lamp_flood awning cables barrier crates_fruit awning2 stool barrels sacks lamp_park sign_market handcart lanterns junction trashpile boxes dumpster
firebarrel lamp_lux pipes pipes2 vending vending_old cage steamvent pots scale rugs bin_rusty baskets sign_shop sign_blade holo_ad terminal_post container neon_noodle
neon_eye neon_cross neon_vert neon_arrow neon_bar neon_star neon_glyph neon_ring neon_fish foodcart foodcart2 lanterns_post drums pallet leanto kiosk mattress scrapheap
shack hulk washline play tank vending2 newsstand atm bin_lux bench_lux planter_lux kiosk_lux tree_lux holo_post fuelcart sphere silo padlights forklift stack crane
cargoloader fountain monument statue kiosk_food
phonebooth ticketmachine parkingmeter trafficlight streetsign fountain_drink recycler bench_curved picnic palm hedge flowerbed lamp_ornate
stall_meat stall_pots stall_flowers stall_juice stall_droid stall_weapons stall_fortune stall_tea stall_hats graffiti barricade burntcar tent
generator cablespool droid_delivery droid_cleaner droid_sentry walker piperack transformer conveyor gastanks valve radar windsock baggagecart
beacontower controlbooth fueltank gazebo footbridge sculpture1 sculpture2 sculpture3 roofgarden watertower helipadmark antennacluster windturbine
chimney ad_tall ad_letters holo_globe kiosk_noodle busstop scooter planter_tall bollard_light newsscreen
cone conegroup scaffold excavator mixer portaloo bricks sandheap girders sitefence towercrane tramstop monopylon turnstile bigclock postbox flagpole banner gate wallsegment chainfence toll
bar_counter bar_shelf barstool booth jukebox pooltable arcade dartboard clothesrack mannequin displaycase freezer hospitalbed medscanner gymbench treadmill serverrack officepod lockerbank
police_barrier checkpoint sewergrate manhole bollard_chain skip_bin ladder_wall drainpipe wallac foodtruck""".split()
def pipes(p, r, rr=0.25, mat='metal', n=2):
    for k in range(n): rod_z(p, -7, 7, -0.35 + k * 0.7 * (1 if n > 1 else 0), 0, rr, mat, 10)
    for z in (-6, -2, 2, 6): bx(p, 0, -0.35, z, 1.0, 0.06, 0.12, 'metal')
def pipes2(p, r): pipes(p, r, 0.4, 'corrugated', 1); rod_z(p, -7, 7, 0.6, 0.2, 0.1, 'paint', 8)
def cables(p, r):
    for k in range(5): rod_z(p, -7, 7, -0.3 + k * 0.15, -0.05 * k, 0.025, 'rubber', 5)
CITY = {k: (bin_ if k == 'bin' else globals()[k]) for k in KINDS}

def build_city():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)
    made = []
    for name, fn in sorted(CITY.items()):
        if ONLY and name not in ONLY: continue
        p = Part(); fn(p, random.Random('city:' + name)); ob = finish(p, 'city_' + name)
        ob['kind'] = 'city_' + name; ob['dims'] = [1, 1, 1]
        made.append(ob)
    print('city kit:', len(made), 'models')
    out = os.path.join(ROOT, 'assets', 'city.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in made: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_materials='EXPORT',
                              export_extras=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True)
    print('wrote', out, os.path.getsize(out) // 1024, 'KB')
