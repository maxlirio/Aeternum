# Things most places on most planets have, whoever built them: how people eat, wash, work, repair,
# heal, store, farm, mine, power and get about. `-- common` builds assets/common.glb.
def washingline(p, r):
    for x in (-1.2, 1.2): bx(p, x, 0, 0, 0.04, 1.6, 0.04, 'metal', 0.004); bx(p, x, 1.6, 0, 0.04, 0.03, 0.5, 'metal', 0.004)
    for z in (-0.2, -0.07, 0.07, 0.2): rod_x(p, -1.2, 1.2, 1.6, z, 0.003, 'rubber', 4)
    rng = random.Random(r.random())
    for i in range(6): bx(p, -0.9 + i * 0.36, 1.05 + rng.uniform(0, 0.15), -0.2 + (i % 4) * 0.13, 0.3, 0.5, 0.006, rng.choice(['tint', 'fabric']), 0.002)
def sink(p, r): bx(p, 0, 0, 0, 0.8, 0.85, 0.6, 'tint', 0.008); bx(p, 0, 0.85, 0, 0.84, 0.035, 0.62, 'stone', 0.004); cy(p, 0, 0, 0.84, 0.885, 0.2, 'mirror', 24); cy(p, 0, 0.24, 0.885, 1.1, 0.012, 'metal', 10); rod_z(p, 0.08, 0.24, 0, 1.1, 0.01, 'metal', 8); [cy(p, x, 0.24, 0.885, 0.92, 0.018, 'metal', 10) for x in (-0.09, 0.09)]
def stove(p, r): bx(p, 0, 0, 0, 0.6, 0.88, 0.6, 'metal', 0.008); bx(p, 0, 0.88, 0, 0.6, 0.012, 0.6, 'rubber', 0.002); [cy(p, x, z, 0.892, 0.902, 0.09, 'rubber', 20) for x in (-0.14, 0.14) for z in (-0.14, 0.14)]; bx(p, 0, 0.2, -0.302, 0.5, 0.45, 0.004, 'visor', 0.001); rod_x(p, -0.2, 0.2, 0.7, -0.33, 0.01, 'metal', 8); [cy(p, -0.2 + i * 0.1, -0.305, 0.76, 0.8, 0.018, 'metal', 10) for i in range(5)]
def bedframe(p, r):
    bx(p, 0, 0.3, 0, 2.0, 0.08, 1.4, 'wood', 0.006); add_cushion(p, -0.98, 0.38, -0.68, 0.98, 0.58, 0.68, 'fabric', 0.1, 0.3, 8); bx(p, 1.02, 0.1, 0, 0.05, 0.9, 1.42, 'wood', 0.008); [bx(p, x, 0, z, 0.08, 0.3, 0.08, 'wood', 0.006) for x in (-0.95, 0.95) for z in (-0.65, 0.65)]; [add_cushion(p, 0.55, 0.58, z - 0.3, 0.95, 0.72, z + 0.3, 'tint', 0.4, 0.5, 6) for z in (-0.33, 0.33)]
def wardrobe(p, r): bx(p, 0, 0, 0, 1.2, 2.0, 0.6, 'wood', 0.008); bx(p, 0, 0.1, -0.302, 0.01, 1.85, 0.004, 'rubber', 0.001); [cy(p, x, -0.32, 1.05, 1.25, 0.008, 'metal', 8) for x in (-0.05, 0.05)]; [bx(p, x, 0.1, -0.303, 0.54, 1.85, 0.003, 'wood', 0.001) for x in (-0.3, 0.3)]
def nightstand(p, r): bx(p, 0, 0, 0, 0.5, 0.55, 0.42, 'wood', 0.006); [bx(p, 0, 0.1 + i * 0.22, -0.212, 0.44, 0.19, 0.006, 'wood', 0.001) for i in range(2)]; [ball(p, 0, 0.2 + i * 0.22, -0.225, 0.012, 'metal') for i in range(2)]
def bathtub(p, r):
    bx(p, 0, 0, 0, 1.7, 0.56, 0.75, 'ceramic', 0.05); bx(p, 0, 0.42, 0, 1.5, 0.15, 0.55, 'visor', 0.03); cy(p, 0.72, 0, 0.56, 0.72, 0.014, 'metal', 10); rod_x(p, 0.6, 0.72, 0.72, 0, 0.012, 'metal', 8); [cy(p, 0.74, z, 0.56, 0.6, 0.02, 'metal', 10) for z in (-0.1, 0.1)]
def towelrail(p, r): rod_x(p, -0.35, 0.35, 1.2, 0, 0.012, 'metal', 10); [bx(p, x, 1.18, 0.04, 0.02, 0.06, 0.08, 'metal', 0.003) for x in (-0.33, 0.33)]; add_cushion(p, -0.2, 0.75, -0.02, 0.2, 1.22, 0.02, 'tint', 0.3, 0.5, 6)
def washer(p, r): bx(p, 0, 0, 0, 0.6, 0.85, 0.6, 'ceramic', 0.012); add_cyl(p, 0.42, -0.302, -0.03, 0, 0.21, 'metal', seg=28, axis='z'); add_cyl(p, 0.42, -0.332, -0.036, -0.03, 0.17, 'visor', seg=28, axis='z'); bx(p, 0, 0.74, -0.302, 0.5, 0.08, 0.004, 'plastic', 0.001); cy(p, -0.17, -0.31, 0.76, 0.78, 0.022, 'metal', 12) ; bx(p, 0.14, 0.76, -0.306, 0.1, 0.04, 0.002, 'screen', 0.0005)
def workbench(p, r):
    bx(p, 0, 0.88, 0, 2.2, 0.06, 0.8, 'wood', 0.006); [bx(p, x, 0, z, 0.08, 0.88, 0.08, 'metal', 0.006) for x in (-1.0, 1.0) for z in (-0.33, 0.33)]; bx(p, 0, 0.3, 0, 2.05, 0.03, 0.7, 'metal', 0.004)
    bx(p, -0.8, 0.94, 0, 0.2, 0.12, 0.16, 'hazard', 0.01); rod_x(p, -0.72, -0.6, 1.0, 0, 0.01, 'metal', 8); rng = random.Random(4)
    for i in range(6): bx(p, rng.uniform(0, 0.9), 0.94, rng.uniform(-0.25, 0.25), rng.uniform(0.08, 0.26), 0.03, 0.04, rng.choice(['metal', 'rubber', 'hazard']), 0.004)
def pegboard(p, r):
    bx(p, 0, 1.0, 0, 1.6, 0.9, 0.02, 'wood', 0.002); rng = random.Random(6)
    for i in range(10): x, y, h = -0.65 + i * 0.145, 1.5 + rng.uniform(-0.1, 0.1), rng.uniform(0.18, 0.42); bx(p, x, y - h, -0.015, 0.03, h, 0.012, rng.choice(['metal', 'rubber', 'hazard']), 0.002)
def gascan(p, r): bx(p, 0, 0, 0, 0.3, 0.36, 0.16, 'tint', 0.012); rod_x(p, -0.1, 0.1, 0.39, 0, 0.012, 'tint', 8); cy(p, 0.11, 0, 0.36, 0.41, 0.022, 'rubber', 10)
def jackstand(p, r): cy(p, 0, 0, 0, 0.3, 0.1, 'hazard', 4, r2=0.03); cy(p, 0, 0, 0.3, 0.48, 0.018, 'metal', 10); bx(p, 0, 0.48, 0, 0.1, 0.02, 0.06, 'metal', 0.004)
def tyre(p, r):
    bm = bmesh.new(); M = 28; S = 10; R0, r0 = 0.27, 0.09; rows = []
    for i in range(M):
        a = i / M * 6.283; row = []
        for j in range(S): b = j / S * 6.283; rr = R0 + r0 * math.cos(b); row.append(bm.verts.new(P(rr * math.cos(a), r0 + r0 * math.sin(b), rr * math.sin(a))))
        rows.append(row)
    for i in range(M):
        for j in range(S): bm.faces.new([rows[i][j], rows[(i + 1) % M][j], rows[(i + 1) % M][(j + 1) % S], rows[i][(j + 1) % S]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, 'rubber')
def stretcher(p, r): add_cushion(p, -0.95, 0.72, -0.3, 0.95, 0.8, 0.3, 'fabric', 0.1, 0.3, 6); [rod_x(p, -1.0, 1.0, 0.72, z, 0.014, 'metal', 8) for z in (-0.32, 0.32)]; [cy(p, x, z, 0.1, 0.72, 0.014, 'metal', 8) for x in (-0.8, 0.8) for z in (-0.28, 0.28)]; [ball(p, x, 0.06, z, 0.06, 'rubber') for x in (-0.8, 0.8) for z in (-0.28, 0.28)]
def ivstand(p, r): cy(p, 0, 0, 0.08, 1.9, 0.012, 'metal', 8); [bx(p, 0, 0.06, 0, 0.5 * abs(math.cos(a)) + 0.02, 0.02, 0.5 * abs(math.sin(a)) + 0.02, 'metal', 0.004) for a in (0.4, 1.97)]; bx(p, 0.1, 1.62, 0, 0.1, 0.2, 0.04, 'glass', 0.008); bx(p, 0, 1.88, 0, 0.26, 0.012, 0.012, 'metal', 0.002)
def wheelchair(p, r):
    add_cushion(p, -0.22, 0.46, -0.22, 0.22, 0.54, 0.22, 'fabric', 0.15, 0.35, 5); bx(p, 0, 0.55, 0.23, 0.42, 0.45, 0.03, 'fabric', 0.006)
    for s in (-0.28, 0.28):
        add_cyl(p, 0.3, 0.05, s - 0.012, s + 0.012, 0.3, 'rubber', seg=28, axis='x'); add_cyl(p, 0.3, 0.05, s - 0.008, s + 0.008, 0.26, 'metal', seg=28, axis='x'); add_cyl(p, 0.08, -0.25, s - 0.012, s + 0.012, 0.08, 'rubber', seg=16, axis='x'); cy(p, s * 0.8, 0.25, 0.3, 1.0, 0.012, 'metal', 8)
def cargonet(p, r):
    for i in range(9): bx(p, -0.8 + i * 0.2, 0.05, 0, 0.012, 1.1, 0.012, 'rubber', 0.002)
    for j in range(7): bx(p, 0, 0.05 + j * 0.18, 0, 1.62, 0.012, 0.012, 'rubber', 0.002)
def barrelrack(p, r): [bx(p, x, 0, 0, 0.08, 0.1, 1.5, 'wood', 0.006) for x in (-0.5, 0.5)]; [add_cyl(p, 0.42, z, -0.55, 0.55, 0.32, 'wood', seg=20, axis='x') for z in (-0.4, 0.4)]; [add_cyl(p, 0.42, z, x - 0.02, x + 0.02, 0.325, 'metal', seg=20, axis='x') for z in (-0.4, 0.4) for x in (-0.3, 0.3)]
def shelvingunit(p, r):
    [bx(p, x, 0, z, 0.04, 2.1, 0.04, 'metal', 0.004) for x in (-0.95, 0.95) for z in (-0.28, 0.28)]; rng = random.Random(9)
    for k in range(5):
        y = 0.1 + k * 0.48; bx(p, 0, y, 0, 1.92, 0.03, 0.6, 'metal', 0.003)
        for i in range(4):
            if rng.random() < 0.8: w = rng.uniform(0.25, 0.42); bx(p, -0.7 + i * 0.47, y + 0.03, 0, w, rng.uniform(0.15, 0.36), rng.uniform(0.3, 0.5), rng.choice(['cardboard', 'plastic', 'tint', 'metal']), 0.006)
def pallettruck(p, r): [bx(p, s, 0.03, 0.25, 0.16, 0.05, 1.15, 'hazard', 0.005) for s in (-0.27, 0.27)]; bx(p, 0, 0.03, -0.35, 0.6, 0.2, 0.08, 'hazard', 0.01); cy(p, 0, -0.42, 0.2, 1.2, 0.018, 'metal', 8); rod_x(p, -0.16, 0.16, 1.2, -0.42, 0.016, 'rubber', 8); ball(p, 0, 0.09, -0.4, 0.09, 'rubber')
def sandbag(p, r):
    for i in range(7): x, y, z = [(-0.5, 0, 0), (0, 0, 0), (0.5, 0, 0), (-0.25, 0.2, 0), (0.25, 0.2, 0), (0, 0.4, 0), (0.7, 0.2, 0.04)][i]; add_cushion(p, x - 0.26, y, z - 0.17, x + 0.26, y + 0.2, z + 0.17, 'fabric', 0.4, 0.6, 5)
def tarp(p, r):
    bm = bmesh.new(); N = 14; rng = random.Random(2); rows = []
    for i in range(N + 1):
        row = []
        for j in range(N + 1): x, z = -1.2 + 2.4 * i / N, -0.9 + 1.8 * j / N; d = max(abs(x) / 1.2, abs(z) / 0.9); row.append(bm.verts.new(P(x, max(0.01, 0.7 * (1 - d ** 3)) + rng.uniform(-0.015, 0.015), z)))
        rows.append(row)
    for i in range(N):
        for j in range(N): bm.faces.new([rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); merge(p, bm, 'tint')
def campfire(p, r):
    rng = random.Random(5)
    for k in range(8): a = k * 0.785; bx(p, 0.34 * math.cos(a), 0, 0.34 * math.sin(a), 0.14, 0.1, 0.14, 'rock', 0.03)
    for k in range(5): a = k * 1.25; rod_x(p, -0.26, 0.26, 0.09 + k * 0.02, 0.1 * math.sin(a), 0.03, 'bark', 8)
    cy(p, 0, 0, 0.1, 0.42, 0.11, 'neonamber', 10, r2=0.015)
def watertankfarm(p, r): cy(p, 0, 0, 0.3, 2.3, 0.75, 'plastic', 28); cy(p, 0, 0, 2.3, 2.5, 0.75, 'plastic', 28, r2=0.2); bx(p, 0, 0, 0, 1.7, 0.3, 1.7, 'concrete', 0.02); rod_x(p, 0.7, 1.4, 0.5, 0, 0.03, 'metal', 8); cy(p, 1.4, 0, 0.5, 0.75, 0.04, 'hazard', 10)
def generatorset(p, r): bx(p, 0, 0.2, 0, 2.4, 1.3, 1.0, 'hazard', 0.02); bx(p, 0, 0, 0, 2.6, 0.2, 1.1, 'metal', 0.01); cy(p, 0.9, 0.2, 1.5, 2.2, 0.08, 'corrugated', 12); [bx(p, -0.9 + i * 0.1, 0.4, -0.505, 0.05, 0.9, 0.01, 'metal', 0.002) for i in range(8)]; bx(p, 0.7, 0.8, -0.505, 0.5, 0.4, 0.006, 'screen', 0.001)
def powerpole(p, r):
    cy(p, 0, 0, 0, 9.0, 0.14, 'bark', 12, r2=0.09); bx(p, 0, 8.3, 0, 1.8, 0.1, 0.1, 'wood', 0.01); [cy(p, x, 0, 8.4, 8.6, 0.04, 'ceramic', 10) for x in (-0.8, 0, 0.8)]; cy(p, 0.25, 0, 7.2, 8.0, 0.2, 'metal', 14)
def signpost(p, r): cy(p, 0, 0, 0, 2.4, 0.04, 'wood', 8); [bx(p, 0.35 * (1 if i % 2 else -1), 1.75 + i * 0.25, 0, 0.8, 0.2, 0.025, 'wood', 0.004) for i in range(2)]
def fencepanel(p, r): [bx(p, x, 0, 0, 0.09, 1.5, 0.09, 'wood', 0.008) for x in (-1.2, 1.2)]; [bx(p, 0, y, 0, 2.4, 0.09, 0.03, 'wood', 0.004) for y in (0.35, 0.95)]; [bx(p, -1.05 + i * 0.3, 0.08, 0.02, 0.2, 1.3, 0.018, 'wood', 0.002) for i in range(8)]
def wellhead(p, r): cy(p, 0, 0, 0, 0.8, 0.7, 'rock', 24); cy(p, 0, 0, 0.65, 0.82, 0.55, 'visor', 24); [cy(p, x, 0, 0.8, 2.2, 0.05, 'wood', 8) for x in (-0.7, 0.7)]; rod_x(p, -0.75, 0.75, 2.0, 0, 0.04, 'wood', 8); cy(p, 0.1, 0, 1.3, 2.0, 0.006, 'rubber', 4); cy(p, 0.1, 0, 1.0, 1.3, 0.14, 'wood', 14, r2=0.16)
def hydroponicrack(p, r):
    [bx(p, x, 0, z, 0.04, 2.0, 0.04, 'metal', 0.004) for x in (-0.95, 0.95) for z in (-0.3, 0.3)]; rng = random.Random(8)
    for k in range(3):
        y = 0.35 + k * 0.6; bx(p, 0, y, 0, 1.9, 0.09, 0.5, 'plastic', 0.008); bx(p, 0, y + 0.5, 0, 1.8, 0.03, 0.08, 'lampwarm', 0.004)
        for i in range(8): add_blob(p, -0.8 + i * 0.23, y + 0.16, rng.uniform(-0.12, 0.12), rng.uniform(0.08, 0.13), 'leaf', rng, 2, 0.8)
# ---------------------------------------------------------------- beyond the city: farms, mines, utilities, rail, outposts
def lattice(p, h, b, mat='metal', step=2.0):       # a tapering four-legged steel tower
    t = b * 0.25
    for sx in (-1, 1):
        for sz in (-1, 1):
            n = int(h / step)
            for i in range(n):
                f0, f1 = i / n, (i + 1) / n; x0, z0 = sx * (b + (t - b) * f0), sz * (b + (t - b) * f0)
                cy(p, x0, z0, f0 * h, f1 * h, 0.05, mat, 6)
    for i in range(int(h / step)):
        y = (i + 1) * step; w = b + (t - b) * y / h; bx(p, 0, y, -w, 2 * w, 0.05, 0.05, mat, 0.004); bx(p, 0, y, w, 2 * w, 0.05, 0.05, mat, 0.004); bx(p, -w, y, 0, 0.05, 0.05, 2 * w, mat, 0.004); bx(p, w, y, 0, 0.05, 0.05, 2 * w, mat, 0.004)
def pylon(p, r):
    lattice(p, 28, 3.0)
    for y, w in ((20, 7), (24, 5.5), (28, 4)):
        bx(p, 0, y, 0, 2 * w, 0.25, 0.25, 'metal', 0.01)
        for s in (-1, 1): cy(p, s * w, 0, y - 1.3, y, 0.09, 'ceramic', 10)
def windmillbig(p, r):
    cy(p, 0, 0, 0, 34, 1.5, 'ceramic', 24, r2=0.8); bx(p, 0, 34, 0.6, 1.6, 1.6, 4.2, 'ceramic', 0.2); add_cyl(p, 34.8, -1.6, -2.1, -1.3, 0.8, 'ceramic', seg=18, axis='z')
    for k in range(3):
        a = k * 2.094; bm = bmesh.new(); ca, sa = math.cos(a), math.sin(a); L = 15
        vs = [bm.verts.new(P(q[0] * ca - q[1] * sa, 34.8 + q[0] * sa + q[1] * ca, -1.9 + q[2])) for q in ((0.5, 0, -0.1), (L, 0, -0.05), (L, 0.3, 0.05), (0.5, 1.1, 0.1))]; bm.faces.new(vs); bm.faces.new([bm.verts.new(v.co) for v in vs[::-1]]); merge(p, bm, 'ceramic')
def solarfield(p, r):
    for i in range(4):
        x = -6 + i * 4; cy(p, x, 0, 0, 1.2, 0.07, 'metal', 8)
        bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((x - 1.8, 0.8, -1.5), (x + 1.8, 0.8, -1.5), (x + 1.8, 1.9, 1.5), (x - 1.8, 1.9, 1.5))]; bm.faces.new(vs[::-1]); merge(p, bm, 'visor')
        for k in range(7): bx(p, x - 1.5 + k * 0.5, 1.35, 0, 0.012, 0.012, 3.2, 'metal', 0.002)
def pumpjack(p, r):
    bx(p, 0, 0, 0, 7, 0.4, 1.8, 'concrete', 0.02); [cy(p, 0, s, 0.4, 4.5, 0.14, 'hazard', 8, r2=0.1) for s in (-0.7, 0.7)]; bx(p, 0, 4.5, 0, 6.2, 0.45, 0.32, 'hazard', 0.02); bx(p, 3.1, 3.4, 0, 0.5, 1.6, 0.5, 'hazard', 0.03)
    cy(p, 3.1, 0, 0, 3.4, 0.06, 'metal', 8); add_cyl(p, 1.1, 0.9, -2.6, -1.8, 0.8, 'rubber', seg=20, axis='x'); bx(p, -2.4, 0.4, 0, 1.5, 1.0, 1.2, 'paint', 0.03)
def substation(p, r):
    bx(p, 0, 0, 0, 7, 0.2, 5, 'concrete', 0.01)
    for x in (-2.2, 0, 2.2): bx(p, x, 0.2, -1, 1.5, 2, 1.3, 'paint', 0.04); [cy(p, x + k * 0.45, -1, 2.2, 3.1, 0.06, 'ceramic', 10, r2=0.04) for k in (-1, 0, 1)]
    for x in (-3.5, 3.5): [cy(p, x, z, 0, 5, 0.06, 'metal', 6) for z in (-2.4, 2.4)]; bx(p, x, 5, 0, 0.1, 0.1, 4.9, 'metal', 0.004)
    [bx(p, 0, 2.1, z, 7.4, 0.04, 0.04, 'hazard', 0.004) for z in (2.5, -2.5)]
def tractor(p, r):
    bx(p, 0.4, 0.75, 0, 2.4, 0.85, 1.0, 'tint', 0.06); bx(p, -0.7, 1.05, 0, 1.2, 1.5, 1.2, 'visor', 0.04); bx(p, -0.7, 2.55, 0, 1.35, 0.1, 1.35, 'tint', 0.03); cy(p, 1.2, 0.2, 1.5, 2.5, 0.05, 'metal', 8)
    for s in (-1, 1): add_cyl(p, 0.72, s * 0.85, -1.15, -0.25, 0.72, 'rubber', seg=26, axis='x'); add_cyl(p, 0.42, s * 0.72, 1.0, 1.4, 0.42, 'rubber', seg=20, axis='x')
def harvester(p, r):
    bx(p, 0, 0.8, 0, 5, 2.4, 2.8, 'tint', 0.1); bx(p, 2.2, 2.6, 0, 1.5, 1.2, 1.6, 'visor', 0.05); bx(p, 3.9, 0.3, 0, 1.6, 0.7, 5, 'hazard', 0.05); rod_z(p, -2.4, 2.4, 4.3, 0.75, 0.32, 'metal', 14)
    for s in (-1, 1): add_cyl(p, 0.8, s * 1.5, 0.6, 1.6, 0.8, 'rubber', seg=24, axis='x'); add_cyl(p, 0.55, s * 1.3, -2.2, -1.5, 0.55, 'rubber', seg=20, axis='x')
    bx(p, -1, 3.2, -0.9, 3, 0.25, 0.25, 'metal', 0.03)
def barn(p, r):
    bx(p, 0, 0, 0, 12, 4, 8, 'corrugated', 0.02)
    for s in (-1, 1):
        bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((-6.3, 3.9, s * 4.3), (6.3, 3.9, s * 4.3), (6.3, 6.6, 0), (-6.3, 6.6, 0))]; bm.faces.new(vs if s < 0 else vs[::-1]); merge(p, bm, 'corrugated')
    for x in (-6, 6):
        bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((x, 4, -4), (x, 4, 4), (x, 6.5, 0))]; bm.faces.new(vs if x > 0 else vs[::-1]); merge(p, bm, 'corrugated')
    bx(p, 6.02, 0, 0, 0.05, 3.2, 4, 'wood', 0.005); bx(p, 6.05, 0, 0, 0.03, 3.2, 0.06, 'rubber', 0.002)
def grainsilo(p, r): cy(p, 0, 0, 0, 11, 2.8, 'corrugated', 28); cy(p, 0, 0, 11, 13.2, 2.8, 'metal', 28, r2=0.5); [cy(p, 0, 0, y, y + 0.05, 2.83, 'metal', 28) for y in (3, 6, 9)]; [cy(p, 2.9, z, 0, 11, 0.03, 'metal', 6) for z in (-0.2, 0.2)]; [rod_z(p, -0.2, 0.2, 2.9, 0.4 + k * 0.4, 0.015, 'metal', 5) for k in range(27)]
def greenhouse(p, r):
    M = 12
    for i in range(7):
        x = -4.5 + i * 1.5
        for k in range(M): a0, a1 = k / M * 3.1416, (k + 1) / M * 3.1416; bx(p, x, 2.0 * math.sin((a0 + a1) / 2), 2.2 * math.cos((a0 + a1) / 2), 0.05, 0.05, 0.6, 'metal', 0.003)
    bm = bmesh.new(); rows = []
    for k in range(M + 1): a = k / M * 3.1416; rows.append([bm.verts.new(P(x, 2.0 * math.sin(a), 2.2 * math.cos(a))) for x in (-4.5, 4.5)])
    for k in range(M): bm.faces.new([rows[k][0], rows[k][1], rows[k + 1][1], rows[k + 1][0]])
    merge(p, bm, 'glass'); rng = random.Random(3)
    for z in (-1.1, 1.1):
        bx(p, 0, 0, z, 8.4, 0.5, 0.8, 'wood', 0.01); bx(p, 0, 0.45, z, 8.2, 0.08, 0.7, 'soil', 0.005)
        for i in range(14): add_blob(p, -3.9 + i * 0.6, 0.7, z + rng.uniform(-0.2, 0.2), rng.uniform(0.14, 0.24), 'leaf', rng, 2, 1.1)
def irrigator(p, r):
    for i in range(3): x = -9 + i * 9; [cy(p, x, s, 0, 3.4, 0.06, 'metal', 8) for s in (-1, 1)]; add_cyl(p, 0.5, -1, x - 0.1, x + 0.1, 0.5, 'rubber', seg=16, axis='x'); add_cyl(p, 0.5, 1, x - 0.1, x + 0.1, 0.5, 'rubber', seg=16, axis='x')
    rod_x(p, -12, 12, 3.4, 0, 0.09, 'metal', 10); [cy(p, -11 + k * 1.5, 0, 2.6, 3.35, 0.012, 'rubber', 5) for k in range(15)]
def animalpen(p, r):
    for x in (-3, -1, 1, 3):
        for z in (-2, 2): cy(p, x, z, 0, 1.2, 0.06, 'wood', 8)
    for z in (-2, 2):
        for y in (0.5, 1.05): rod_x(p, -3, 3, y, z, 0.03, 'wood', 6)
    for x in (-3, 3):
        for y in (0.5, 1.05): rod_z(p, -2, 2, x, y, 0.03, 'wood', 6)
    bx(p, 0, 0, 0, 1.6, 0.4, 0.5, 'wood', 0.01); bx(p, 0, 0.3, 0, 1.45, 0.1, 0.4, 'visor', 0.003)
def haybale(p, r): add_cyl(p, 0.65, 0, -0.65, 0.65, 0.65, 'cardboard', seg=22, axis='x'); [add_cyl(p, 0.65, 0, x, x + 0.02, 0.66, 'soil', seg=22, axis='x') for x in (-0.3, 0.3)]
def headframe(p, r):
    lattice(p, 22, 4, 'hazard'); bx(p, 0, 22, 0, 6, 1.0, 6, 'corrugated', 0.02); add_cyl(p, 23, 0, -1.3, 1.3, 1.9, 'metal', seg=24, axis='x'); bx(p, 0, 0, 0, 9, 0.8, 9, 'concrete', 0.03); bx(p, 0, 0.8, 0, 2.6, 3.2, 2.6, 'corrugated', 0.02)
def drillrig(p, r):
    lattice(p, 14, 1.3); bx(p, 0, 0, 0, 7, 0.6, 4, 'hazard', 0.03); bx(p, -2.6, 0.6, 0, 1.8, 2, 3, 'paint', 0.04); cy(p, 0, 0, 0, 13, 0.14, 'metal', 12); add_cyl(p, 1.3, 1.5, 1.0, 3, 0.5, 'corrugated', seg=14, axis='x')
def orecart(p, r):
    bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((-0.9, 0.35, -0.5), (0.9, 0.35, -0.5), (1.15, 1.05, -0.7), (-1.15, 1.05, -0.7))]; bm.faces.new(vs[::-1]); merge(p, bm, 'corrugated')
    bm = bmesh.new(); vs = [bm.verts.new(P(*q)) for q in ((-0.9, 0.35, 0.5), (0.9, 0.35, 0.5), (1.15, 1.05, 0.7), (-1.15, 1.05, 0.7))]; bm.faces.new(vs); merge(p, bm, 'corrugated')
    bx(p, 0, 0.3, 0, 1.9, 0.06, 1.05, 'metal', 0.005); lumps(p, 12, 0.7, 0.75, 0.2, ['rock'], 'ore', 0.8)
    for x in (-0.6, 0.6):
        for z in (-0.46, 0.46): rod_z(p, z - 0.03, z + 0.03, x, 0.17, 0.17, 'metal', 14)
def railtrack(p, r):
    for i in range(10): bx(p, -4.5 + i, 0, 0, 0.22, 0.12, 2.3, 'wood', 0.008)
    for z in (-0.72, 0.72): bx(p, 0, 0.12, z, 10, 0.05, 0.09, 'metal', 0.004); bx(p, 0, 0.17, z, 10, 0.05, 0.03, 'metal', 0.003); bx(p, 0, 0.22, z, 10, 0.03, 0.06, 'metal', 0.004)
def railcar(p, r):
    bx(p, 0, 1.0, 0, 12, 2.6, 2.8, 'tint', 0.06); [bx(p, -5.5 + i, 1.0, -1.41, 0.05, 2.6, 0.02, 'tint', 0.003) for i in range(12)]; bx(p, 0, 0.75, 0, 12.4, 0.25, 2.5, 'rubber', 0.01); [bx(p, s * 4, 0, 0, 2.6, 0.75, 2.2, 'rubber', 0.03) for s in (-1, 1)]
    for s in (-1, 1):
        for x in (-0.8, 0.8): rod_z(p, -1.1, 1.1, s * 4 + x, 0.45, 0.45, 'metal', 18)
def platformbench(p, r): bx(p, 0, 0, 0, 12, 1.0, 3.5, 'concrete', 0.02); bx(p, 0, 1.0, -1.68, 12, 0.01, 0.2, 'hazard', 0.001); [cy(p, x, 0.9, 1.0, 3.6, 0.09, 'metal', 10) for x in (-4, 0, 4)]; bx(p, 0, 3.6, 0.2, 12.4, 0.12, 3.2, 'corrugated', 0.01); bx(p, 2, 1.0, 1.2, 2.4, 0.45, 0.5, 'wood', 0.01); bx(p, -3, 2.6, 0.85, 2.4, 0.8, 0.06, 'screen', 0.005)
def bridgespan(p, r):
    bx(p, 0, 3.4, 0, 12, 0.6, 7, 'concrete', 0.03); [bx(p, x, 0, 0, 1.2, 3.4, 5.5, 'concrete', 0.03) for x in (-5.2, 5.2)]; [bx(p, 0, 4.0, z, 12, 0.8, 0.25, 'concrete', 0.02) for z in (-3.4, 3.4)]; bx(p, 0, 4.0, 0, 12, 0.02, 6.4, 'rubber', 0.002)
def guardrail(p, r): [bx(p, x, 0, 0, 0.12, 0.8, 0.12, 'metal', 0.006) for x in (-2, 0, 2)]; bx(p, 0, 0.5, -0.07, 4.2, 0.28, 0.03, 'metal', 0.005); bx(p, 0, 0.61, -0.09, 4.2, 0.05, 0.015, 'hazard', 0.002)
def roadsign(p, r): cy(p, 0, 0, 0, 2.6, 0.04, 'metal', 8); add_cyl(p, 2.3, -0.05, -0.06, -0.04, 0.38, 'tint', seg=4 if r.random() < 0.3 else 24, axis='z'); add_cyl(p, 2.3, -0.065, -0.07, -0.06, 0.3, 'ceramic', seg=24, axis='z')
def fuelpump(p, r): bx(p, 0, 0, 0, 2.4, 0.18, 1.0, 'concrete', 0.02); bx(p, 0, 0.18, 0, 0.75, 1.9, 0.5, 'tint', 0.03); bx(p, 0, 1.3, -0.26, 0.5, 0.42, 0.01, 'screen', 0.002); [bx(p, s * 0.42, 0.9, 0, 0.1, 0.32, 0.08, 'rubber', 0.01) for s in (-1, 1)]; bx(p, 0, 2.08, 0, 0.8, 0.2, 0.55, 'neoncyan', 0.02)
def fuelcanopy(p, r): [cy(p, x, 0, 0, 5, 0.22, 'metal', 14) for x in (-4, 4)]; bx(p, 0, 5, 0, 13, 0.6, 7, 'tint', 0.05); bx(p, 0, 4.98, 0, 12.4, 0.02, 6.4, 'lampwarm', 0.002); bx(p, 0, 5.15, -3.51, 11, 0.3, 0.02, 'neonamber', 0.003)
def waterwheel(p, r):
    rod_z(p, -1.0, 1.0, 0, 2.4, 0.14, 'wood', 12); 
    for k in range(12): a = k * 0.5236; rod_z(p, -0.6, 0.6, 2.2 * math.cos(a), 2.4 + 2.2 * math.sin(a), 0.1, 'wood', 6); bx(p, 1.1 * math.cos(a), 2.4 + 1.1 * math.sin(a), -0.55, 2.2 * abs(math.cos(a)) + 0.1, 2.2 * abs(math.sin(a)) + 0.1, 0.06, 'wood', 0.005)
    [bx(p, 0, 0, s, 0.5, 2.6, 0.3, 'rock', 0.03) for s in (-1.05, 1.05)]
def watchtower(p, r): lattice(p, 10, 1.8, 'wood'); bx(p, 0, 10, 0, 4.2, 0.2, 4.2, 'wood', 0.01); [bx(p, 0, 10.2, s, 4.2, 1.0, 0.08, 'wood', 0.005) for s in (-2.05, 2.05)]; [bx(p, s, 10.2, 0, 0.08, 1.0, 4.2, 'wood', 0.005) for s in (-2.05, 2.05)]; [cy(p, sx * 1.95, sz * 1.95, 10.2, 12.4, 0.07, 'wood', 8) for sx in (-1, 1) for sz in (-1, 1)]; cy(p, 0, 0, 12.4, 13.8, 3.2, 'corrugated', 4, r2=0.1)
def radiomast(p, r): lattice(p, 34, 0.9); [cy(p, 0, 0, y, y + 0.1, 0.7, 'metal', 8) for y in (12, 22, 30)]; ball(p, 0, 34.3, 0, 0.25, 'navred'); bx(p, 2, 0, 2, 3, 2.3, 2.4, 'corrugated', 0.02)
def bunker(p, r): bx(p, 0, 0, 0, 7, 2.3, 5.5, 'concrete', 0.2); bx(p, 0, 2.3, 0, 7.6, 0.5, 6, 'concrete', 0.15); bx(p, 0, 1.3, -2.76, 4.4, 0.32, 0.03, 'rubber', 0.005); bx(p, 2.4, 0, 2.76, 1.2, 2, 0.08, 'metal', 0.01); lumps(p, 12, 4, 0.1, 0.4, ['soil', 'rock'], 'bun', 0.6)
def ruinwall(p, r):
    rng = random.Random(r.random())
    for i in range(9):
        h = rng.uniform(0.6, 3.4) * (1 - abs(i - 4) * 0.1); bx(p, -4 + i, 0, 0, 0.98, h, 0.55, 'concrete', 0.05)
    lumps(p, 14, 4.2, 0.1, 0.32, ['rock', 'concrete'], 'rubble', 0.7)
def cairn(p, r): lumps(p, 16, 0.5, 0, 0.22, ['rock'], 'cairn-a', 0.8); lumps(p, 8, 0.3, 0.42, 0.17, ['rock'], 'cairn-b', 0.8); lumps(p, 3, 0.12, 0.8, 0.12, ['rock'], 'cairn-c', 0.8)
def stonewall(p, r): rng = random.Random(4); [add_blob(p, rng.uniform(-2.4, 2.4), rng.uniform(0.1, 0.8), rng.uniform(-0.2, 0.2), rng.uniform(0.17, 0.28), 'rock', rng, 2, 0.75) for _ in range(46)]
def workcamp(p, r):
    bx(p, 0, 0, 0, 6, 2.5, 2.4, 'corrugated', 0.03); bx(p, 0, 2.5, 0, 6.2, 0.1, 2.6, 'metal', 0.01); bx(p, -1.5, 0, -1.22, 0.9, 2.1, 0.04, 'paint', 0.005); [bx(p, x, 1.0, -1.22, 1, 0.8, 0.03, 'visor', 0.003) for x in (0.4, 1.9)]; cy(p, 3, 0.9, 2.6, 3.2, 0.08, 'metal', 8); bx(p, 2.4, 2.6, 0.4, 0.8, 0.4, 0.6, 'paint', 0.02)
def lighthouse(p, r): cy(p, 0, 0, 0, 20, 2.4, 'ceramic', 24, r2=1.4); [cy(p, 0, 0, y, y + 3, 2.42 - y * 0.05, 'navred', 24, r2=2.42 - (y + 3) * 0.05) for y in (4, 12)]; cy(p, 0, 0, 20, 20.3, 1.9, 'metal', 24); cy(p, 0, 0, 20.3, 22, 1.1, 'glass', 18); cy(p, 0, 0, 20.5, 21.8, 0.5, 'lampwarm', 12); cy(p, 0, 0, 22, 23, 1.2, 'navred', 18, r2=0.1)

COMMON = 'washingline sink stove bedframe wardrobe nightstand bathtub towelrail washer workbench pegboard gascan jackstand tyre stretcher ivstand wheelchair cargonet barrelrack shelvingunit pallettruck sandbag tarp campfire watertankfarm generatorset powerpole signpost fencepanel wellhead hydroponicrack pylon windmillbig solarfield pumpjack substation tractor harvester barn grainsilo greenhouse irrigator animalpen haybale headframe drillrig orecart railtrack railcar platformbench bridgespan guardrail roadsign fuelpump fuelcanopy waterwheel watchtower radiomast bunker ruinwall cairn stonewall workcamp lighthouse'.split()
def build_common():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob)
    made = []
    for name in COMMON:
        if ONLY and name not in ONLY: continue
        p = Part(); globals()[name](p, random.Random('common:' + name)); ob = finish(p, 'common_' + name); ob['kind'] = 'common_' + name; ob['dims'] = [1, 1, 1]; made.append(ob)
    out = os.path.join(ROOT, 'assets', 'common.glb'); bpy.ops.object.select_all(action='DESELECT')
    for ob in made: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_materials='EXPORT', export_extras=True, export_apply=True, export_yup=True, export_normals=True, export_texcoords=True)
    print('common:', len(made), 'wrote', out, os.path.getsize(out) // 1024, 'KB')
