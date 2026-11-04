# Things you carry, buy and find: every item in js/gen/items.js as a model at true size, resting
# on y = 0, centred. Needs city_kit.py's helpers. `-- items` builds assets/items.glb.
def can(p, x, z, h, r, mat, top='metal'):
    cy(p, x, z, 0, h, r, mat, 20); cy(p, x, z, h, h + 0.004, r * 0.92, top, 20); cy(p, x, z, -0.0, 0.004, r * 0.92, top, 20)
def bottle(p, h, r, mat, cap='plastic'):
    cy(p, 0, 0, 0, h * 0.62, r, mat, 20); cy(p, 0, 0, h * 0.62, h * 0.8, r, mat, 20, r2=r * 0.4); cy(p, 0, 0, h * 0.8, h * 0.95, r * 0.4, mat, 16); cy(p, 0, 0, h * 0.95, h, r * 0.45, cap, 16)
def plate_of(p, r_, mat='ceramic'): cy(p, 0, 0, 0, 0.012, r_ * 0.6, mat, 28, r2=r_); cy(p, 0, 0, 0.012, 0.018, r_, mat, 28, r2=r_ * 0.98)
def bowl_of(p, r_, h, mat='ceramic'): cy(p, 0, 0, 0, 0.012, r_ * 0.5, mat, 24); cy(p, 0, 0, 0.012, h, r_ * 0.55, mat, 28, r2=r_)
def lumps(p, n, spread, y, size, mats, seed, squash=0.7):
    rng = random.Random(seed)
    for i in range(n): add_blob(p, rng.uniform(-spread, spread), y + rng.uniform(0, size), rng.uniform(-spread, spread), size * rng.uniform(0.7, 1.2), rng.choice(mats), rng, 2, squash)

# food
def ration(p, r): add_box(p, -0.06, 0, -0.018, 0.06, 0.022, 0.018, 'tint', 0.006); bx(p, 0, 0.022, 0, 0.09, 0.001, 0.03, 'paint', 0.0003); [bx(p, x, 0.004, 0, 0.012, 0.014, 0.038, 'metal', 0.001) for x in (-0.062, 0.062)]
def fruit(p, r): ball(p, 0, 0.042, 0, 0.042, 'tint'); cy(p, 0, 0, 0.08, 0.098, 0.003, 'bark', 6); add_blob(p, 0.012, 0.094, 0, 0.012, 'leaf', random.Random(1), 2, 0.25)
def bread(p, r):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1)
    for v in bm.verts: x, y, z = v.co; v.co = P(x * 0.14, 0.05 + max(z, -0.55) * 0.075, y * 0.065)
    merge(p, bm, 'cardboard')
    for i in range(4): bx(p, -0.075 + i * 0.05, 0.1, 0, 0.012, 0.006, 0.09, 'soil', 0.002)
def cheese(p, r): cy(p, 0, 0, 0, 0.055, 0.075, 'tint', 28); cy(p, 0, 0, 0.055, 0.058, 0.07, 'plastic', 28)
def noodles(p, r): can(p, 0, 0, 0.09, 0.05, 'paint', 'cardboard'); bx(p, 0, 0.03, -0.05, 0.05, 0.03, 0.002, 'tint', 0.0005)
def protein(p, r): add_cushion(p, -0.08, 0, -0.055, 0.08, 0.035, 0.055, 'tint', 0.25, 0.4, 5); bx(p, 0, 0.036, 0, 0.09, 0.0015, 0.06, 'glass', 0.0005)
def vegetables(p, r): lumps(p, 9, 0.06, 0.02, 0.03, ['leaf'], 'veg', 0.5); bx(p, 0, 0, 0, 0.16, 0.012, 0.13, 'cardboard', 0.002)
def rice(p, r): add_cushion(p, -0.07, 0, -0.045, 0.07, 0.14, 0.045, 'fabric', 0.2, 0.5, 6); cy(p, 0, 0, 0.14, 0.16, 0.02, 'tint', 10, r2=0.03)
def eggs(p, r):
    bx(p, 0, 0, 0, 0.21, 0.03, 0.11, 'cardboard', 0.004)
    for i in range(6):
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1); x0, z0 = -0.07 + (i % 3) * 0.07, -0.025 + (i // 3) * 0.05
        for v in bm.verts: x, y, z = v.co; v.co = P(x0 + x * 0.021, 0.05 + z * (0.03 if z > 0 else 0.022), z0 + y * 0.021)
        merge(p, bm, 'ceramic')
def water(p, r): bottle(p, 0.24, 0.035, 'glass'); cy(p, 0, 0, 0.002, 0.13, 0.031, 'visor', 16); bx(p, 0, 0.08, -0.036, 0.04, 0.05, 0.001, 'paint', 0.0003)
def juice(p, r): bx(p, 0, 0, 0, 0.07, 0.17, 0.07, 'tint', 0.004); cy(p, 0, 0, 0.17, 0.19, 0.016, 'plastic', 12); bx(p, 0, 0.05, -0.036, 0.05, 0.07, 0.001, 'paint', 0.0003)
def caf(p, r): cy(p, 0, 0, 0, 0.1, 0.036, 'ceramic', 24, r2=0.042); cy(p, 0, 0, 0.1, 0.112, 0.044, 'plastic', 24); bx(p, 0, 0.05, -0.04, 0.03, 0.03, 0.002, 'cardboard', 0.0005)
def beer(p, r): bottle(p, 0.23, 0.031, 'visor', 'metal'); bx(p, 0, 0.05, -0.032, 0.04, 0.06, 0.001, 'tint', 0.0003)
# meals
def stew(p, r): bowl_of(p, 0.085, 0.06); lumps(p, 7, 0.045, 0.045, 0.014, ['soil', 'tint', 'leaf'], 'stew', 0.6); cy(p, 0, 0, 0.04, 0.05, 0.075, 'soil', 24)
def stirfry(p, r): plate_of(p, 0.12); lumps(p, 16, 0.07, 0.02, 0.016, ['leaf', 'tint', 'soil', 'cardboard'], 'fry', 0.5); bx(p, 0.1, 0.02, 0, 0.17, 0.004, 0.012, 'metal', 0.001)
def omelette(p, r):
    plate_of(p, 0.12); bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1)
    for v in bm.verts: x, y, z = v.co; v.co = P(x * 0.085, 0.03 + z * 0.014, y * 0.05)
    merge(p, bm, 'cardboard'); lumps(p, 5, 0.03, 0.04, 0.005, ['leaf'], 'herb', 0.3)
def noodlebowl(p, r):
    bowl_of(p, 0.09, 0.07); cy(p, 0, 0, 0.05, 0.058, 0.08, 'cardboard', 24)
    for k in range(14): a = k * 0.45; rod_x(p, -0.06, 0.06, 0.06, math.sin(a) * 0.05, 0.002, 'ceramic', 4)
    add_cyl(p, 0.07, -0.02, -0.1, 0.1, 0.003, 'wood', seg=6, axis='x'); add_cyl(p, 0.07, 0.02, -0.1, 0.1, 0.003, 'wood', seg=6, axis='x')
# medicine
def painkillers(p, r): can(p, 0, 0, 0.07, 0.022, 'ceramic', 'plastic'); cy(p, 0, 0, 0.07, 0.085, 0.023, 'tint', 16); bx(p, 0, 0.035, -0.022, 0.025, 0.03, 0.001, 'paint', 0.0002)
def stim(p, r): add_cyl(p, 0.012, 0, -0.06, 0.05, 0.011, 'glass', seg=12, axis='x'); add_cyl(p, 0.012, 0, -0.05, 0.02, 0.009, 'neongreen', seg=10, axis='x'); add_cyl(p, 0.012, 0, 0.05, 0.08, 0.002, 'metal', seg=6, axis='x'); add_cyl(p, 0.012, 0, -0.075, -0.06, 0.013, 'tint', seg=12, axis='x')
def medkit(p, r):
    bx(p, 0, 0, 0, 0.26, 0.09, 0.18, 'tint', 0.012); bx(p, 0, 0.09, 0, 0.265, 0.012, 0.185, 'paint', 0.004); rod_x(p, -0.05, 0.05, 0.05, -0.1, 0.006, 'rubber', 6)
    for x, w, d in ((0, 0.07, 0.022), (0, 0.022, 0.07)): bx(p, x, 0.102, 0, w, 0.001, d, 'ceramic', 0.0003)
    for x in (-0.09, 0.09): bx(p, x, 0.07, -0.092, 0.03, 0.02, 0.004, 'metal', 0.001)
# clothing, folded or standing
def folded(p, mat, w, d, n=4, h=0.016): [add_cushion(p, -w / 2, i * h, -d / 2, w / 2, (i + 1) * h, d / 2, mat, 0.25, 0.5, 4) for i in range(n)]
def shirt(p, r): folded(p, 'tint', 0.24, 0.3); bx(p, 0, 0.066, -0.11, 0.13, 0.006, 0.05, 'tint', 0.002); bx(p, 0.05, 0.066, 0.02, 0.05, 0.002, 0.05, 'fabric', 0.0005)
def jacket(p, r): folded(p, 'tint', 0.3, 0.34, 5, 0.022); bx(p, 0, 0.115, -0.13, 0.17, 0.016, 0.05, 'fabric', 0.006); bx(p, 0, 0.112, 0.02, 0.012, 0.002, 0.28, 'metal', 0.001)
def coverall(p, r): folded(p, 'tint', 0.28, 0.32, 5, 0.018); bx(p, 0, 0.092, 0, 0.26, 0.002, 0.018, 'hazard', 0.0005); bx(p, 0.07, 0.092, -0.08, 0.06, 0.002, 0.06, 'rubber', 0.0005)
def boots(p, r):
    for s in (-0.065, 0.065):
        add_cushion(p, s - 0.048, 0.022, -0.14, s + 0.048, 0.1, 0.13, 'rubber', 0.2, 0.5, 5); bx(p, s, 0, 0, 0.1, 0.025, 0.28, 'rubber', 0.006); cy(p, s, 0.07, 0.08, 0.21, 0.052, 'tint', 16, r2=0.056); cy(p, s, 0.07, 0.205, 0.215, 0.056, 'rubber', 16)
        for k in range(4): rod_x(p, s - 0.035, s + 0.035, 0.11 + k * 0.022, -0.012 + k * 0.012, 0.0022, 'fabric', 4)
# tools
def torch(p, r): add_cyl(p, 0.02, 0, -0.08, 0.07, 0.016, 'metal', seg=16, axis='x'); add_cyl(p, 0.024, 0, 0.07, 0.1, 0.024, 'metal', seg=18, axis='x', r2=0.018); add_cyl(p, 0.024, 0, 0.1, 0.102, 0.022, 'lampwarm', seg=18, axis='x'); bx(p, 0.02, 0.034, 0, 0.018, 0.004, 0.012, 'rubber', 0.001)
def multitool(p, r): bx(p, 0, 0, 0, 0.11, 0.016, 0.028, 'metal', 0.003); bx(p, 0.075, 0.005, 0, 0.06, 0.005, 0.012, 'mirror', 0.001); bx(p, -0.075, 0.005, 0.005, 0.05, 0.004, 0.006, 'metal', 0.001); cy(p, -0.05, 0, 0.016, 0.019, 0.006, 'rubber', 10)
def wrench(p, r):
    bx(p, -0.05, 0.012, 0, 0.2, 0.014, 0.024, 'metal', 0.004); add_cyl(p, 0.012, 0, -0.17, -0.1, 0.014, 'rubber', seg=12, axis='x'); cy(p, 0.07, 0, 0, 0.03, 0.03, 'metal', 20); bx(p, 0.095, 0.015, 0, 0.02, 0.018, 0.03, 'metal', 0.002); bx(p, -0.02, 0.026, 0, 0.03, 0.002, 0.016, 'screen', 0.0005)
def cutter(p, r):
    bx(p, 0, 0.05, 0, 0.2, 0.05, 0.05, 'hazard', 0.008); add_cyl(p, 0.075, 0, 0.1, 0.19, 0.012, 'metal', seg=12, axis='x', r2=0.008); add_cyl(p, 0.075, 0, 0.19, 0.2, 0.005, 'neoncyan', seg=8, axis='x'); bx(p, -0.05, 0, 0, 0.035, 0.055, 0.03, 'rubber', 0.006); bx(p, -0.09, 0.075, 0, 0.03, 0.04, 0.05, 'metal', 0.004)
def scanner(p, r): bx(p, 0, 0, 0, 0.09, 0.022, 0.16, 'plastic', 0.008); bx(p, 0, 0.022, 0.015, 0.072, 0.001, 0.09, 'screen', 0.0003); [cy(p, x, -0.055, 0.022, 0.025, 0.007, 'rubber', 10) for x in (-0.02, 0.02)]; bx(p, 0, 0.012, 0.082, 0.05, 0.008, 0.004, 'neongreen', 0.0005)
# parts
def scrap(p, r):
    rng = random.Random(r.random())
    for i in range(6): bx(p, rng.uniform(-0.1, 0.1), i * 0.012, rng.uniform(-0.08, 0.08), rng.uniform(0.05, 0.16), 0.005, rng.uniform(0.03, 0.1), rng.choice(['corrugated', 'metal', 'hull']), 0.001)
def plate(p, r):
    bx(p, 0, 0, 0, 0.3, 0.008, 0.2, 'hull', 0.0015)
    for sx in (-0.13, 0.13):
        for sz in (-0.08, 0.08): cy(p, sx, sz, 0.008, 0.01, 0.006, 'metal', 8)
def wiring(p, r):
    for k in range(4):
        a0 = k * 0.7
        for i in range(24): a = a0 + i * 0.27; ball(p, math.cos(a) * (0.08 - k * 0.006), 0.006 + k * 0.009, math.sin(a) * (0.08 - k * 0.006), 0.0055, ('rubber', 'tint', 'hazard', 'rubber')[k], 0)
    bx(p, 0.095, 0.01, 0, 0.022, 0.018, 0.03, 'plastic', 0.002)
def circuit(p, r):
    bx(p, 0, 0, 0, 0.12, 0.002, 0.08, 'leaf', 0.0004); rng = random.Random(3)
    for i in range(9): bx(p, rng.uniform(-0.045, 0.045), 0.002, rng.uniform(-0.03, 0.03), rng.uniform(0.006, 0.02), 0.004, rng.uniform(0.006, 0.016), rng.choice(['rubber', 'metal', 'plastic']), 0.0005)
    bx(p, 0, 0.002, 0, 0.026, 0.003, 0.026, 'rubber', 0.0005); bx(p, -0.058, 0.002, 0, 0.006, 0.006, 0.05, 'metal', 0.0005)
def cell(p, r): cy(p, 0, 0, 0, 0.1, 0.028, 'hull', 24); cy(p, 0, 0, 0.03, 0.07, 0.0285, 'neoncyan', 24); cy(p, 0, 0, 0.1, 0.11, 0.012, 'metal', 14); cy(p, 0, 0, -0.0, 0.004, 0.018, 'metal', 14)
def servo(p, r): bx(p, 0, 0, 0, 0.07, 0.05, 0.05, 'paint', 0.004); cy(p, 0, 0, 0.05, 0.06, 0.018, 'metal', 16); cy(p, 0, 0, 0.06, 0.07, 0.01, 'metal', 10); [bx(p, s, 0.015, 0, 0.012, 0.006, 0.05, 'metal', 0.001) for s in (-0.04, 0.04)]; bx(p, -0.02, 0.01, 0.028, 0.012, 0.01, 0.012, 'rubber', 0.001)
def filter_(p, r):
    cy(p, 0, 0, 0, 0.012, 0.09, 'metal', 28); cy(p, 0, 0, 0.1, 0.112, 0.09, 'metal', 28)
    for i in range(32): a = i * math.pi / 16; bx(p, math.cos(a) * 0.08, 0.012, math.sin(a) * 0.08, 0.012, 0.088, 0.012, 'fabric', 0.001)
def bracket(p, r): bx(p, 0, 0, 0, 0.1, 0.008, 0.06, 'metal', 0.002); bx(p, -0.046, 0.008, 0, 0.008, 0.07, 0.06, 'metal', 0.002); [cy(p, x, z, 0.008, 0.01, 0.006, 'rubber', 10) for x, z in ((0.02, -0.018), (0.02, 0.018))]
# valuables and data
def drone(p, r):
    bx(p, 0, 0.03, 0, 0.09, 0.03, 0.09, 'plastic', 0.012); bx(p, 0, 0.022, -0.045, 0.024, 0.016, 0.012, 'visor', 0.003)
    for sx in (-1, 1):
        for sz in (-1, 1):
            add_cyl(p, sx * 0.1, sz * 0.1, 0.045, 0.06, 0.012, 'metal', seg=10); add_cyl(p, sx * 0.1, sz * 0.1, 0.06, 0.063, 0.052, 'glass', seg=18); rod_x(p, min(0, sx * 0.1), max(0, sx * 0.1), 0.045, sz * 0.05, 0.004, 'plastic', 5); rod_z(p, min(0, sz * 0.1), max(0, sz * 0.1), sx * 0.1, 0.045, 0.004, 'plastic', 5)
    for x in (-0.03, 0.03): rod_z(p, -0.04, 0.04, x, 0.008, 0.003, 'rubber', 5)
def watch(p, r): cy(p, 0, 0, 0.008, 0.016, 0.021, 'mirror', 24); cy(p, 0, 0, 0.016, 0.017, 0.018, 'screen', 24); [bx(p, 0, 0.006, s, 0.02, 0.003, 0.05, 'rubber', 0.001) for s in (-0.042, 0.042)]; add_cyl(p, 0.012, 0, 0.021, 0.025, 0.003, 'metal', seg=8, axis='x')
def ring(p, r):
    bm = bmesh.new(); M = 32
    for i in range(M):
        a0, a1 = i / M * 6.283, (i + 1) / M * 6.283
        vs = [bm.verts.new(P(R_ * math.cos(a), 0.011 + R_ * math.sin(a), z)) for a, R_, z in ((a0, 0.0095, -0.003), (a1, 0.0095, -0.003), (a1, 0.011, -0.003), (a0, 0.011, -0.003))]; bm.faces.new(vs)
        vs = [bm.verts.new(P(R_ * math.cos(a), 0.011 + R_ * math.sin(a), z)) for a, R_, z in ((a0, 0.011, 0.003), (a1, 0.011, 0.003), (a1, 0.0095, 0.003), (a0, 0.0095, 0.003))]; bm.faces.new(vs)
        vs = [bm.verts.new(P(0.011 * math.cos(a), 0.011 + 0.011 * math.sin(a), z)) for a, z in ((a0, -0.003), (a1, -0.003), (a1, 0.003), (a0, 0.003))]; bm.faces.new(vs[::-1])
    merge(p, bm, 'mirror')
def cash(p, r): bx(p, 0, 0, 0, 0.085, 0.001, 0.054, 'metal', 0.0003); bx(p, -0.02, 0.001, 0, 0.02, 0.0004, 0.016, 'neonamber', 0.0001); bx(p, 0.015, 0.001, 0.012, 0.04, 0.0003, 0.006, 'rubber', 0.0001)
def holo(p, r): cy(p, 0, 0, 0, 0.018, 0.04, 'metal', 24); cy(p, 0, 0, 0.018, 0.02, 0.03, 'neoncyan', 20); bx(p, 0, 0.022, 0, 0.05, 0.07, 0.0005, 'neoncyan', 0.0001)
def datachip(p, r): bx(p, 0, 0, 0, 0.032, 0.002, 0.022, 'rubber', 0.0005); bx(p, 0.012, 0.002, 0, 0.006, 0.0003, 0.016, 'neonamber', 0.0001)
def datapad(p, r): bx(p, 0, 0, 0, 0.16, 0.009, 0.22, 'rubber', 0.004); bx(p, 0, 0.009, 0, 0.145, 0.0006, 0.2, 'screen', 0.0002)
def ledger(p, r): bx(p, 0, 0, 0, 0.21, 0.035, 0.29, 'cardboard', 0.002); bx(p, 0.005, 0.0, 0, 0.2, 0.006, 0.285, 'tint', 0.001); bx(p, 0.005, 0.034, 0, 0.2, 0.006, 0.285, 'tint', 0.001); bx(p, -0.1, 0, 0, 0.01, 0.04, 0.285, 'tint', 0.003); bx(p, 0.03, 0.04, -0.06, 0.08, 0.0005, 0.03, 'ceramic', 0.0001)
# supplies
def soap(p, r): bx(p, 0, 0, 0, 0.09, 0.2, 0.05, 'tint', 0.012); cy(p, 0, 0, 0.2, 0.235, 0.015, 'plastic', 12); bx(p, 0, 0.04, -0.026, 0.06, 0.09, 0.001, 'ceramic', 0.0003)
def tape(p, r): cy(p, 0, 0, 0, 0.045, 0.05, 'hazard', 28); cy(p, 0, 0, 0.0005, 0.046, 0.025, 'cardboard', 20); bx(p, 0.05, 0.002, 0, 0.002, 0.04, 0.03, 'hazard', 0.0003)
def sealant(p, r):
    add_cyl(p, 0.05, 0, -0.1, 0.08, 0.024, 'paint', seg=16, axis='x'); add_cyl(p, 0.05, 0, 0.08, 0.14, 0.012, 'plastic', seg=10, axis='x', r2=0.004); bx(p, -0.06, 0, 0, 0.02, 0.05, 0.02, 'metal', 0.003); bx(p, -0.03, 0.015, 0, 0.012, 0.024, 0.012, 'rubber', 0.002); rod_x(p, -0.14, -0.1, 0.05, 0, 0.005, 'metal', 8)
# weapons: lying down
def knife(p, r):
    bx(p, 0.055, 0.008, 0, 0.14, 0.002, 0.03, 'mirror', 0.0008); bx(p, -0.015, 0.006, 0, 0.012, 0.012, 0.05, 'metal', 0.002)
    for k in range(5): bx(p, -0.035 - k * 0.012, 0.006, 0, 0.011, 0.016, 0.027, 'rubber', 0.003)
    bx(p, -0.1, 0.006, 0, 0.012, 0.014, 0.03, 'metal', 0.002)
def baton(p, r): add_cyl(p, 0.02, 0, -0.18, -0.03, 0.017, 'rubber', seg=14, axis='x'); add_cyl(p, 0.02, 0, -0.03, 0.22, 0.012, 'metal', seg=14, axis='x'); add_cyl(p, 0.02, 0, 0.22, 0.25, 0.015, 'neoncyan', seg=14, axis='x'); bx(p, -0.1, 0.038, 0, 0.012, 0.002, 0.01, 'navred', 0.0005)
def pistol(p, r):
    bx(p, 0.02, 0.1, 0, 0.19, 0.032, 0.03, 'metal', 0.004); bx(p, 0.02, 0.078, 0, 0.17, 0.024, 0.027, 'rubber', 0.004); add_cyl(p, 0.1, 0, 0.115, 0.13, 0.008, 'rubber', seg=10, axis='x')
    for i in range(6): bx(p, -0.05 - i * 0.003, 0.012 + i * 0.012, 0, 0.042, 0.013, 0.027, 'rubber', 0.003)
    bx(p, -0.058, 0, 0, 0.036, 0.008, 0.024, 'metal', 0.002); bx(p, 0.0, 0.06, 0, 0.04, 0.004, 0.008, 'metal', 0.001); bx(p, -0.05, 0.12, 0, 0.012, 0.009, 0.012, 'metal', 0.001); bx(p, 0.1, 0.12, 0, 0.006, 0.009, 0.006, 'metal', 0.001)
def carbine(p, r):
    bx(p, 0.05, 0.11, 0, 0.42, 0.05, 0.036, 'rubber', 0.005); add_cyl(p, 0.125, 0, 0.26, 0.42, 0.011, 'metal', seg=12, axis='x'); add_cyl(p, 0.125, 0, 0.42, 0.45, 0.016, 'metal', seg=12, axis='x'); bx(p, 0.17, 0.09, 0, 0.14, 0.03, 0.04, 'hull', 0.004)
    bx(p, -0.25, 0.09, 0, 0.2, 0.05, 0.03, 'rubber', 0.006); bx(p, -0.33, 0.06, 0, 0.04, 0.1, 0.034, 'rubber', 0.006); bx(p, 0.02, 0.0, 0, 0.05, 0.11, 0.024, 'metal', 0.003); bx(p, -0.07, 0.03, 0, 0.038, 0.09, 0.028, 'rubber', 0.005)
    bx(p, 0.03, 0.15, 0, 0.14, 0.022, 0.03, 'hull', 0.003); bx(p, 0.1, 0.115, -0.019, 0.05, 0.02, 0.002, 'neoncyan', 0.0005)
    for i in range(6): bx(p, 0.14 + i * 0.015, 0.135, 0, 0.006, 0.006, 0.032, 'metal', 0.001)

# ---------------------------------------------------------------- everyday things most places have
def mug(p, r): cy(p, 0, 0, 0, 0.095, 0.04, 'ceramic', 24); cy(p, 0, 0, 0.088, 0.09, 0.036, 'soil', 20); [ball(p, 0.048 + 0.012 * math.sin(i * 0.5), 0.02 + i * 0.008, 0, 0.006, 'ceramic', 2) for i in range(7)]
def glass_tumbler(p, r): cy(p, 0, 0, 0, 0.11, 0.03, 'glass', 20, r2=0.036); cy(p, 0, 0, 0, 0.006, 0.031, 'glass', 20)
def dinnerplate(p, r): plate_of(p, 0.13)
def cutlery(p, r):
    for x, m in ((-0.03, 'fork'), (0, 'knife'), (0.03, 'spoon')):
        bx(p, x, 0, -0.03, 0.012, 0.003, 0.13, 'metal', 0.001)
        if m == 'spoon': cy(p, x, 0.07, 0, 0.005, 0.018, 'metal', 14)
        elif m == 'fork': bx(p, x, 0, 0.08, 0.022, 0.003, 0.05, 'metal', 0.001)
        else: bx(p, x, 0, 0.08, 0.016, 0.002, 0.07, 'mirror', 0.0005)
def saucepan(p, r): cy(p, 0, 0, 0, 0.1, 0.085, 'metal', 28); cy(p, 0, 0, 0.1, 0.108, 0.088, 'metal', 28); rod_x(p, 0.085, 0.27, 0.085, 0, 0.011, 'rubber', 10); cy(p, 0, 0, 0.108, 0.125, 0.012, 'rubber', 12)
def fryingpan(p, r): cy(p, 0, 0, 0, 0.04, 0.1, 'rubber', 28, r2=0.125); rod_x(p, 0.12, 0.33, 0.04, 0, 0.012, 'rubber', 10)
def kitchenknifeblock(p, r): bx(p, 0, 0, 0, 0.11, 0.2, 0.16, 'wood', 0.008); [bx(p, -0.03 + i * 0.03, 0.2, 0, 0.018, 0.08, 0.028, 'rubber', 0.004) for i in range(3)]
def jar(p, r): cy(p, 0, 0, 0, 0.13, 0.05, 'glass', 22); cy(p, 0, 0, 0.13, 0.15, 0.04, 'metal', 22); lumps(p, 8, 0.025, 0.01, 0.02, ['tint'], 'jar', 0.8)
def cookbook(p, r): bx(p, 0, 0, 0, 0.17, 0.03, 0.24, 'books', 0.003); bx(p, 0, 0.03, 0, 0.175, 0.002, 0.245, 'tint', 0.0006)
def toolbox(p, r):
    bx(p, 0, 0, 0, 0.42, 0.17, 0.2, 'tint', 0.008); bx(p, 0, 0.17, 0, 0.43, 0.04, 0.21, 'tint', 0.008); rod_x(p, -0.12, 0.12, 0.25, 0, 0.012, 'rubber', 8)
    for x in (-0.12, 0.12): bx(p, x, 0.21, 0, 0.012, 0.04, 0.012, 'metal', 0.002); bx(p, x, 0.15, -0.103, 0.03, 0.035, 0.006, 'metal', 0.002)
def stepladder(p, r):
    for s in (-0.22, 0.22):
        for k in range(10): bx(p, s, k * 0.17, -0.3 + k * 0.03, 0.03, 0.18, 0.05, 'metal', 0.004); bx(p, s, k * 0.17, 0.3 - k * 0.03, 0.025, 0.18, 0.035, 'metal', 0.004)
    for k in range(1, 6): bx(p, 0, k * 0.28, -0.3 + k * 0.05, 0.44, 0.03, 0.1, 'metal', 0.003)
    bx(p, 0, 1.7, 0, 0.48, 0.04, 0.26, 'plastic', 0.006)
def broom(p, r): cy(p, 0, 0, 0.1, 1.4, 0.012, 'wood', 8); bx(p, 0, 0.06, 0, 0.32, 0.06, 0.06, 'wood', 0.004); [bx(p, -0.15 + i * 0.03, 0, 0, 0.022, 0.07, 0.05, 'soil', 0.002) for i in range(11)]
def bucket(p, r): cy(p, 0, 0, 0, 0.27, 0.11, 'tint', 24, r2=0.14); cy(p, 0, 0, 0.27, 0.28, 0.142, 'tint', 24); cy(p, 0, 0, 0.2, 0.21, 0.13, 'visor', 24); [ball(p, 0.14 * math.cos(a * 0.21), 0.27 + 0.13 * math.sin(a * 0.21), 0, 0.005, 'metal', 2) for a in range(16)]
def mop(p, r): cy(p, 0, 0, 0.12, 1.35, 0.012, 'metal', 8); lumps(p, 16, 0.09, 0.0, 0.03, ['fabric'], 'mop', 1.2)
def wastebin(p, r): cy(p, 0, 0, 0, 0.32, 0.1, 'plastic', 22, r2=0.13); cy(p, 0, 0, 0.3, 0.32, 0.135, 'rubber', 22)
def wallclock(p, r): add_cyl(p, 1.8, 0, -0.03, 0, 0.15, 'plastic', seg=32, axis='z'); add_cyl(p, 1.8, -0.031, -0.032, -0.03, 0.135, 'ceramic', seg=32, axis='z'); bx(p, 0.03, 1.8, -0.035, 0.08, 0.006, 0.002, 'rubber', 0.0005); bx(p, 0, 1.84, -0.035, 0.006, 0.09, 0.002, 'rubber', 0.0005)
def handset(p, r): bx(p, 0, 0, 0, 0.07, 0.008, 0.15, 'rubber', 0.003); bx(p, 0, 0.008, 0, 0.062, 0.0005, 0.135, 'screen', 0.0002)
def deskphone(p, r): bx(p, 0, 0, 0, 0.2, 0.05, 0.2, 'plastic', 0.012); bx(p, -0.05, 0.05, 0, 0.06, 0.03, 0.18, 'plastic', 0.01); [bx(p, 0.03 + (i % 3) * 0.028, 0.05, -0.05 + (i // 3) * 0.028, 0.02, 0.004, 0.02, 'rubber', 0.001) for i in range(12)]
def desklamp(p, r): cy(p, 0, 0, 0, 0.02, 0.09, 'metal', 22); cy(p, 0, 0, 0.02, 0.28, 0.008, 'metal', 8); rod_z(p, -0.2, 0, 0, 0.28, 0.008, 'metal', 8); cy(p, 0, -0.2, 0.2, 0.28, 0.08, 'metal', 22, r2=0.03); cy(p, 0, -0.2, 0.205, 0.21, 0.07, 'lampwarm', 22)
def fan(p, r):
    cy(p, 0, 0, 0, 0.03, 0.14, 'plastic', 22); cy(p, 0, 0, 0.03, 0.8, 0.015, 'metal', 8); add_cyl(p, 0.86, -0.02, -0.05, 0.05, 0.05, 'plastic', seg=16, axis='z')
    for k in range(5): a = k * 1.257; bx(p, 0.1 * math.cos(a), 0.86 + 0.1 * math.sin(a), -0.07, 0.11, 0.05, 0.004, 'plastic', 0.002)
    for k in range(20): a = k * 0.314; ball(p, 0.17 * math.cos(a), 0.86 + 0.17 * math.sin(a), -0.09, 0.004, 'metal', 2)
def heater(p, r): bx(p, 0, 0, 0, 0.7, 0.55, 0.12, 'paint', 0.01); [bx(p, -0.3 + i * 0.05, 0.05, -0.062, 0.03, 0.45, 0.004, 'metal', 0.001) for i in range(13)]; bx(p, 0.3, 0.45, -0.063, 0.04, 0.04, 0.002, 'neonamber', 0.0005)
def radio(p, r): bx(p, 0, 0, 0, 0.26, 0.15, 0.08, 'tint', 0.012); add_cyl(p, 0.075, -0.041, -0.043, -0.04, 0.05, 'rubber', seg=20, axis='z'); bx(p, 0.07, 0.09, -0.041, 0.09, 0.04, 0.002, 'screen', 0.0005); cy(p, 0.09, 0, 0.15, 0.32, 0.003, 'metal', 6)
def monitor(p, r): bx(p, 0, 0.12, 0, 0.56, 0.33, 0.03, 'rubber', 0.006); bx(p, 0, 0.13, -0.016, 0.53, 0.3, 0.002, 'screen', 0.0005); bx(p, 0, 0.0, 0.03, 0.2, 0.012, 0.14, 'metal', 0.003); bx(p, 0, 0.012, 0.03, 0.04, 0.14, 0.03, 'metal', 0.003)
def keyboard(p, r):
    bx(p, 0, 0, 0, 0.42, 0.018, 0.14, 'plastic', 0.004)
    for i in range(14):
        for j in range(4): bx(p, -0.19 + i * 0.029, 0.018, -0.045 + j * 0.03, 0.024, 0.004, 0.024, 'rubber', 0.001)
def folders(p, r): [bx(p, -0.1 + i * 0.05, 0, 0, 0.04, 0.3, 0.22, 'tint', 0.003) for i in range(5)]
def filebox(p, r): bx(p, 0, 0, 0, 0.32, 0.26, 0.4, 'cardboard', 0.004); bx(p, 0, 0.26, 0, 0.33, 0.03, 0.41, 'cardboard', 0.004); bx(p, 0, 0.14, -0.2, 0.09, 0.03, 0.002, 'rubber', 0.0005)
def foldchair(p, r):
    bx(p, 0, 0.44, 0, 0.42, 0.025, 0.4, 'plastic', 0.006); bx(p, 0, 0.72, 0.2, 0.42, 0.2, 0.02, 'plastic', 0.006)
    for s in (-0.19, 0.19): cy(p, s, 0.2, 0, 0.85, 0.011, 'metal', 8); cy(p, s, -0.18, 0, 0.45, 0.011, 'metal', 8)
def officechair(p, r):
    add_cushion(p, -0.24, 0.44, -0.24, 0.24, 0.53, 0.24, 'fabric', 0.2, 0.35, 6); add_cushion(p, -0.22, 0.6, 0.2, 0.22, 1.1, 0.27, 'fabric', 0.15, 0.35, 6); cy(p, 0, 0, 0.1, 0.44, 0.024, 'metal', 12); bx(p, 0, 0.5, 0.25, 0.05, 0.2, 0.02, 'metal', 0.004)
    for k in range(5): a = k * 1.257; x, z = 0.28 * math.cos(a), 0.28 * math.sin(a); bx(p, x / 2, 0.08, z / 2, abs(x) + 0.04, 0.025, abs(z) + 0.04, 'rubber', 0.006); ball(p, x, 0.035, z, 0.033, 'rubber', 2)
def roundtable(p, r): cy(p, 0, 0, 0.72, 0.75, 0.45, 'wood', 36); cy(p, 0, 0, 0.03, 0.72, 0.04, 'metal', 14); cy(p, 0, 0, 0, 0.03, 0.25, 'metal', 28)
def coatrack(p, r):
    cy(p, 0, 0, 0, 1.75, 0.018, 'wood', 10); cy(p, 0, 0, 0, 0.03, 0.2, 'wood', 22)
    for k in range(6): a = k * 1.047; bx(p, 0.07 * math.cos(a), 1.6, 0.07 * math.sin(a), 0.14 * abs(math.cos(a)) + 0.012, 0.012, 0.14 * abs(math.sin(a)) + 0.012, 'wood', 0.002)
    add_cushion(p, 0.03, 0.85, -0.12, 0.13, 1.6, 0.12, 'tint', 0.2, 0.5, 6)
def shoerack(p, r): [bx(p, 0, 0.05 + k * 0.2, 0, 0.8, 0.02, 0.28, 'wood', 0.003) for k in range(3)]; [bx(p, s, 0, 0, 0.02, 0.5, 0.28, 'wood', 0.003) for s in (-0.39, 0.39)]; [add_cushion(p, -0.3 + i * 0.3 - 0.05, 0.07, -0.12, -0.3 + i * 0.3 + 0.05, 0.16, 0.12, 'rubber', 0.2, 0.5, 4) for i in range(3)]
def wallmirror(p, r): bx(p, 0, 0.8, 0, 0.6, 1.2, 0.03, 'wood', 0.006); bx(p, 0, 0.84, -0.016, 0.52, 1.12, 0.002, 'mirror', 0.0005)
def rug(p, r): bx(p, 0, 0, 0, 2.2, 0.012, 1.5, 'tint', 0.004); bx(p, 0, 0.012, 0, 1.9, 0.001, 1.2, 'fabric', 0.0003); [bx(p, s, 0, 0, 0.08, 0.004, 1.5, 'fabric', 0.001) for s in (-1.14, 1.14)]
def pillow(p, r): add_cushion(p, -0.3, 0, -0.2, 0.3, 0.14, 0.2, 'tint', 0.5, 0.5, 8)
def blanket(p, r): folded(p, 'tint', 0.5, 0.36, 5, 0.03)
def suitcase(p, r): bx(p, 0, 0.04, 0, 0.46, 0.62, 0.22, 'tint', 0.03); [bx(p, s, 0.04, 0, 0.02, 0.62, 0.225, 'rubber', 0.006) for s in (-0.15, 0.15)]; [cy(p, s, 0.08, 0.68, 0.82, 0.008, 'metal', 6) for s in (-0.1, 0.1)]; rod_x(p, -0.1, 0.1, 0.82, 0.08, 0.01, 'rubber', 8); [ball(p, s, 0.03, 0.09, 0.028, 'rubber', 2) for s in (-0.18, 0.18)]
def backpack(p, r): add_cushion(p, -0.17, 0.04, -0.1, 0.17, 0.52, 0.12, 'tint', 0.3, 0.5, 7); add_cushion(p, -0.13, 0.08, -0.15, 0.13, 0.28, -0.06, 'tint', 0.3, 0.5, 5); [bx(p, s, 0.1, 0.13, 0.05, 0.4, 0.015, 'rubber', 0.004) for s in (-0.1, 0.1)]; rod_x(p, -0.05, 0.05, 0.54, 0, 0.012, 'rubber', 6); bx(p, 0, 0.3, -0.106, 0.28, 0.006, 0.004, 'metal', 0.001)
def plasticcrate(p, r):
    bx(p, 0, 0, 0, 0.6, 0.02, 0.4, 'tint', 0.004)
    for i in range(11): bx(p, -0.28 + i * 0.056, 0.02, -0.195, 0.022, 0.28, 0.012, 'tint', 0.002); bx(p, -0.28 + i * 0.056, 0.02, 0.195, 0.022, 0.28, 0.012, 'tint', 0.002)
    for i in range(7): bx(p, -0.295, 0.02, -0.17 + i * 0.056, 0.012, 0.28, 0.022, 'tint', 0.002); bx(p, 0.295, 0.02, -0.17 + i * 0.056, 0.012, 0.28, 0.022, 'tint', 0.002)
    for z in (-0.2, 0.2): bx(p, 0, 0.29, z, 0.62, 0.03, 0.02, 'tint', 0.004)
def extinguisher(p, r): cy(p, 0, 0, 0, 0.46, 0.075, 'navred', 24); ball(p, 0, 0.46, 0, 0.075, 'navred'); cy(p, 0, 0, 0.53, 0.58, 0.02, 'metal', 12); bx(p, 0.03, 0.58, 0, 0.1, 0.012, 0.03, 'metal', 0.003); [ball(p, 0.06 + 0.012 * i, 0.5 - i * 0.05, 0.08, 0.009, 'rubber', 2) for i in range(5)]; bx(p, 0, 0.2, -0.076, 0.07, 0.1, 0.001, 'ceramic', 0.0003)
def firstaidbox(p, r): bx(p, 0, 1.3, 0, 0.36, 0.4, 0.12, 'ceramic', 0.01); [bx(p, 0, 1.5, -0.061, w, h, 0.001, 'navgreen', 0.0003) for w, h in ((0.12, 0.04), (0.04, 0.12))]; bx(p, 0.16, 1.45, -0.062, 0.015, 0.05, 0.004, 'metal', 0.001)
def exitsign(p, r): bx(p, 0, 2.3, 0, 0.36, 0.14, 0.03, 'plastic', 0.004); bx(p, 0, 2.31, -0.016, 0.33, 0.12, 0.001, 'neongreen', 0.0003)
def outlet(p, r): bx(p, 0, 0.3, 0, 0.09, 0.13, 0.012, 'plastic', 0.003); [bx(p, 0, 0.32 + i * 0.05, -0.007, 0.05, 0.03, 0.002, 'rubber', 0.0005) for i in range(2)]
def lightswitch(p, r): bx(p, 0, 1.2, 0, 0.08, 0.12, 0.01, 'plastic', 0.003); bx(p, 0, 1.25, -0.007, 0.03, 0.05, 0.006, 'ceramic', 0.002)
def doormat(p, r): bx(p, 0, 0, 0, 0.8, 0.018, 0.5, 'soil', 0.004); bx(p, 0, 0.018, 0, 0.72, 0.001, 0.42, 'rubber', 0.0003)
def waterdispenser(p, r): bx(p, 0, 0, 0, 0.32, 1.0, 0.32, 'paint', 0.01); cy(p, 0, 0, 1.0, 1.4, 0.13, 'glass', 22); cy(p, 0, 0, 1.02, 1.3, 0.12, 'visor', 22); bx(p, 0, 0.72, -0.165, 0.2, 0.14, 0.02, 'rubber', 0.003); [bx(p, x, 0.72, -0.18, 0.025, 0.04, 0.03, 'tint', 0.003) for x in (-0.05, 0.05)]
def bookstack(p, r):
    rng = random.Random(r.random())
    for i in range(6): bx(p, rng.uniform(-0.015, 0.015), i * 0.035, rng.uniform(-0.015, 0.015), rng.uniform(0.16, 0.22), 0.032, rng.uniform(0.21, 0.27), rng.choice(['tint', 'books', 'cardboard']), 0.002)
def cableduct(p, r): bx(p, 0, 0, 0, 2, 0.05, 0.08, 'plastic', 0.004); bx(p, 0, 0.05, 0, 2, 0.006, 0.09, 'plastic', 0.001)
def guitar(p, r):
    cy(p, 0, 0, 0, 0.09, 0.19, 'wood', 28); cy(p, 0, 0.25, 0, 0.09, 0.15, 'wood', 28); bx(p, 0, 0.09, 0.45, 0.05, 0.02, 0.5, 'bark', 0.005); bx(p, 0, 0.09, 0.73, 0.08, 0.02, 0.1, 'bark', 0.006); cy(p, 0, 0.04, 0.085, 0.091, 0.04, 'rubber', 16); [rod_z(p, 0.0, 0.72, -0.018 + i * 0.007, 0.1, 0.0009, 'metal', 4) for i in range(6)]

ITEMS3D = 'ration fruit bread cheese noodles protein vegetables rice eggs water juice caf beer stew stirfry omelette noodlebowl painkillers stim medkit shirt jacket boots coverall torch multitool wrench cutter scanner scrap plate wiring circuit cell servo filter_ bracket drone watch ring cash holo datachip datapad ledger soap tape sealant knife baton pistol carbine mug glass_tumbler dinnerplate cutlery saucepan fryingpan kitchenknifeblock jar cookbook toolbox stepladder broom bucket mop wastebin wallclock handset deskphone desklamp fan heater radio monitor keyboard folders filebox foldchair officechair roundtable coatrack shoerack wallmirror rug pillow blanket suitcase backpack plasticcrate extinguisher firstaidbox exitsign outlet lightswitch doormat waterdispenser bookstack cableduct guitar'.split()
def build_items():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)
    made = []
    for name in ITEMS3D:
        if ONLY and name not in ONLY: continue
        p = Part(); globals()[name](p, random.Random('item:' + name)); nm = name.rstrip('_'); ob = finish(p, 'item_' + nm)
        ob['kind'] = 'item_' + nm; ob['dims'] = [1, 1, 1]; made.append(ob)
    out = os.path.join(ROOT, 'assets', 'items.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in made: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_materials='EXPORT', export_extras=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True)
    print('items:', len(made), 'wrote', out, os.path.getsize(out) // 1024, 'KB')
