# 건물 17채 밑그림. 원점이 땅 가운데, 정면(문)은 -y 면(화면 왼쪽, 빛 받는 면). 팀 색은 M["team"] 하나.


def castle(c):
    box(c, M["stone2"], (3.5, 3.5, 0.15), (0, 0, 0.075))
    for x, y, s in ((0, -1.35, (3.0, 0.32, 1.1)), (0, 1.35, (3.0, 0.32, 1.1)), (-1.35, 0, (0.32, 3.0, 1.1)), (1.35, 0, (0.32, 3.0, 1.1))):
        box(c, M["stone"], s, (x, y, 0.15 + 0.55))
    merlons(c, M["stone"], 2.9, 2.9, 1.25)
    box(c, M["dark"], (0.8, 0.12, 0.9), (0, -1.5, 0.6))
    box(c, M["door"], (0.66, 0.1, 0.78), (0, -1.53, 0.54))
    box(c, M["gold"], (0.92, 0.14, 0.12), (0, -1.53, 1.08))
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * 1.35, sy * 1.35
            cyl(c, M["stone"], 8, 0.5, 1.9, (x, y, 1.1))
            cyl(c, M["stone2"], 8, 0.57, 0.16, (x, y, 2.1))
            cone(c, M["team"], 8, 0.66, 0.0, 1.0, (x, y, 2.68))
            ball(c, M["gold"], 0.08, (x, y, 3.22))
            box(c, M["dark"], (0.14, 0.06, 0.3), (x + 0.0, y - 0.48, 1.4)) if sy < 0 else None
    box(c, M["stone"], (1.5, 1.5, 2.5), (0, 0.25, 1.4))
    merlons(c, M["stone"], 1.4, 1.4, 2.65, 0.2, 0.16)
    for x in (-0.35, 0.35):
        box(c, M["dark"], (0.16, 0.06, 0.36), (x, -0.52, 1.95))
    cyl(c, M["stone"], 8, 0.45, 1.3, (0.0, 0.25, 3.3))
    cyl(c, M["stone2"], 8, 0.52, 0.14, (0.0, 0.25, 3.98))
    cone(c, M["team"], 8, 0.62, 0.0, 1.2, (0.0, 0.25, 4.65))
    flag(c, (0.0, 0.25, 5.2), 0.8, 0.9)


def village(c):
    box(c, M["stone2"], (1.9, 1.6, 0.14), (0, 0, 0.07))
    box(c, M["plaster"], (1.7, 1.4, 1.0), (0, 0, 0.64))
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(c, M["wood"], (0.12, 0.12, 1.0), (sx * 0.83, sy * 0.68, 0.64))
    box(c, M["wood"], (1.78, 1.48, 0.1), (0, 0, 1.16))
    gable(c, M["team"], 1.45, 1.75, 0.85, (0, 0, 1.2), rz=90)
    box(c, M["stone2"], (0.26, 0.26, 0.7), (0.42, 0.32, 1.85))
    box(c, M["door"], (0.38, 0.07, 0.64), (-0.3, -0.71, 0.46))
    box(c, M["gold"], (0.46, 0.08, 0.07), (-0.3, -0.72, 0.8))
    box(c, M["dark"], (0.3, 0.06, 0.28), (0.4, -0.71, 0.74))
    box(c, M["wood"], (0.38, 0.08, 0.06), (0.4, -0.72, 0.58))
    flag(c, (-0.95, 0, 1.9), 0.55, 0.45)


def warrior_watchtower(c):
    box(c, M["stone2"], (1.7, 1.7, 0.2), (0, 0, 0.1))
    cone(c, M["stone"], 4, 1.02, 0.8, 2.4, (0, 0, 1.4), (0, 0, 45))
    box(c, M["gold"], (1.26, 1.26, 0.12), (0, 0, 2.66))
    box(c, M["wood"], (1.4, 1.4, 0.5), (0, 0, 2.97))
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(c, M["wood2"], (0.14, 0.14, 0.45), (sx * 0.62, sy * 0.62, 3.4))
    pyramid(c, M["team"], 1.9, 1.1, (0, 0, 3.6))
    flag(c, (0, 0, 4.66), 0.7, 0.7)
    box(c, M["door"], (0.42, 0.08, 0.68), (0, -0.73, 0.54))
    box(c, M["gold"], (0.52, 0.09, 0.08), (0, -0.74, 0.92))
    for z in (1.55, 2.15):
        box(c, M["dark"], (0.11, 0.06, 0.32), (0, -0.66, z))
        box(c, M["dark"], (0.06, 0.11, 0.32), (0.66, 0, z))


def warrior_bastion(c):
    cyl(c, M["stone2"], 14, 1.38, 0.15, (0, 0, 0.075))
    cyl(c, M["stone"], 14, 1.22, 1.0, (0, 0, 0.65))
    ring_merlons(c, M["stone"], 1.16, 1.15, 14, 0.26)
    cyl(c, M["stone2"], 14, 1.02, 0.06, (0, 0, 1.13))
    box(c, M["dark"], (0.66, 0.3, 0.8), (0, -1.12, 0.55))
    box(c, M["door"], (0.54, 0.1, 0.68), (0, -1.24, 0.49))
    box(c, M["gold"], (0.76, 0.12, 0.1), (0, -1.24, 0.98))
    for a in (-130, -50, 10):
        x, y = 1.23 * math.cos(R(a)), 1.23 * math.sin(R(a))
        box(c, M["gold"], (0.2, 0.06, 0.52), (x, y, 0.72), a + 90)
    flag(c, (0, 0, 1.15), 1.1, 0.75)


def warrior_barracks(c):
    box(c, M["stone2"], (2.8, 1.8, 0.15), (0, 0, 0.075))
    box(c, M["stone"], (2.6, 1.6, 0.62), (0, 0, 0.46))
    box(c, M["gold"], (2.66, 1.66, 0.08), (0, 0, 0.8))
    box(c, M["plaster"], (2.55, 1.55, 0.56), (0, 0, 1.12))
    for x in (-1.24, -0.42, 0.42, 1.24):
        box(c, M["wood"], (0.1, 0.06, 0.56), (x, -0.79, 1.12))
    for y in (-0.76, 0, 0.76):
        box(c, M["wood"], (0.06, 0.1, 0.56), (1.29, y, 1.12))
    gable(c, M["team"], 1.6, 2.6, 0.95, (0, 0, 1.4), rz=90)
    box(c, M["door"], (0.62, 0.07, 0.62), (0, -0.82, 0.46))
    box(c, M["gold"], (0.74, 0.08, 0.08), (0, -0.83, 0.8))
    for x in (-0.85, 0.85):
        box(c, M["dark"], (0.26, 0.05, 0.3), (x, -0.8, 1.12))
    for k, x in enumerate((1.5, 1.68)):
        cyl(c, M["wood"], 6, 0.03, 1.2, (x, -0.7, 0.6))
        cone(c, M["gold"], 4, 0.07, 0.0, 0.2, (x, -0.7, 1.3))
    box(c, M["wood2"], (0.5, 0.08, 0.08), (1.6, -0.7, 0.45))
    flag(c, (-0.7, 0, 2.3), 0.55, 0.5)


def warrior_forge(c):
    box(c, M["stone2"], (2.2, 1.8, 0.12), (0, 0, 0.06))
    box(c, M["stone"], (2.0, 0.32, 1.3), (0, 0.64, 0.77))
    box(c, M["stone"], (0.32, 1.6, 1.3), (-0.84, 0, 0.77))
    box(c, M["stone"], (0.32, 1.6, 1.3), (0.84, 0, 0.77))
    box(c, M["stone2"], (0.95, 0.6, 0.9), (0, 0.25, 0.57))
    box(c, M["dark"], (0.55, 0.06, 0.42), (0, -0.06, 0.55))
    box(c, M["fire"], (0.45, 0.07, 0.3), (0, -0.07, 0.5))
    for sx in (-1, 1):
        box(c, M["wood"], (0.16, 0.16, 1.3), (sx * 0.9, -0.76, 0.77))
    box(c, M["wood"], (2.0, 0.14, 0.14), (0, -0.76, 1.42))
    shed(c, M["team"], 2.4, 1.95, 0.45, (0, 0, 1.5))
    box(c, M["stone2"], (0.42, 0.42, 1.5), (-0.6, 0.5, 2.0))
    box(c, M["stone"], (0.5, 0.5, 0.12), (-0.6, 0.5, 2.78))
    cyl(c, M["wood2"], 8, 0.17, 0.32, (0.4, -1.12, 0.16))
    box(c, M["bronze"], (0.2, 0.16, 0.16), (0.4, -1.12, 0.4))
    box(c, M["bronze"], (0.5, 0.2, 0.16), (0.42, -1.12, 0.55))
    cone(c, M["bronze"], 4, 0.1, 0.0, 0.2, (0.72, -1.12, 0.55), (0, 90, 0))


def warrior_training(c):
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(c, M["stone"], (0.36, 0.36, 0.22), (sx * 0.95, sy * 0.95, 0.11))
            box(c, M["wood"], (0.15, 0.15, 1.55), (sx * 0.95, sy * 0.95, 0.99))
            ball(c, M["gold"], 0.1, (sx * 0.95, sy * 0.95, 1.82))
    pyramid(c, M["team"], 2.5, 0.85, (0, 0, 1.72))
    cyl(c, M["gold"], 6, 0.05, 0.3, (0, 0, 2.7))
    ball(c, M["gold"], 0.1, (0, 0, 2.88))
    cyl(c, M["wood2"], 6, 0.06, 1.1, (-0.3, -0.15, 0.55))
    box(c, M["straw"], (0.36, 0.26, 0.5), (-0.3, -0.15, 1.0))
    box(c, M["straw"], (0.85, 0.13, 0.13), (-0.3, -0.15, 1.12))
    ball(c, M["straw"], 0.18, (-0.3, -0.15, 1.42))
    box(c, M["wood2"], (0.38, 0.28, 0.06), (-0.3, -0.15, 1.0))
    for x in (0.35, 0.85):
        box(c, M["wood"], (0.08, 0.08, 0.8), (x, 0.45, 0.4))
    box(c, M["wood"], (0.6, 0.08, 0.08), (0.6, 0.45, 0.62))
    for x in (0.45, 0.6, 0.75):
        cone(c, M["white"], 4, 0.05, 0.0, 0.5, (x, 0.42, 0.95))


def mage_tower(c):
    cyl(c, M["violet2"], 8, 1.0, 0.25, (0, 0, 0.125))
    cone(c, M["violet"], 8, 0.76, 0.6, 2.9, (0, 0, 1.7))
    for z in (1.1, 2.3):
        cyl(c, M["lilac"], 8, 0.76, 0.12, (0, 0, z))
    cyl(c, M["violet2"], 8, 0.78, 0.2, (0, 0, 3.2))
    cone(c, M["team"], 8, 1.02, 0.0, 1.5, (0, 0, 4.05))
    cone(c, M["teal"], 4, 0.24, 0.0, 0.42, (0, 0, 5.35))
    cone(c, M["teal"], 4, 0.24, 0.0, 0.3, (0, 0, 4.99), (180, 0, 0))
    box(c, M["door"], (0.4, 0.1, 0.72), (0, -0.74, 0.6))
    box(c, M["gold"], (0.5, 0.1, 0.08), (0, -0.75, 0.98))
    cyl(c, M["gold"], 8, 0.17, 0.08, (0, -0.66, 2.7), (90, 0, 0))
    cyl(c, M["teal"], 8, 0.11, 0.1, (0, -0.67, 2.7), (90, 0, 0))
    box(c, M["dark"], (0.12, 0.08, 0.34), (0, -0.7, 1.65))
    box(c, M["dark"], (0.08, 0.12, 0.34), (0.68, 0, 1.75))


def mage_mana_spring(c):
    cyl(c, M["violet2"], 10, 1.08, 0.5, (0, 0, 0.25))
    cyl(c, M["lilac"], 10, 1.13, 0.1, (0, 0, 0.55))
    cyl(c, M["teal"], 10, 0.86, 0.05, (0, 0, 0.58))
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(c, M["violet"], (0.15, 0.15, 1.35), (sx * 0.76, sy * 0.76, 1.25))
    pyramid(c, M["team"], 2.1, 0.85, (0, 0, 1.92))
    cone(c, M["violet"], 6, 0.1, 0.0, 0.3, (0, 0, 2.9))
    for a in (-90, 0, 180, 90):
        x, y = 1.02 * math.cos(R(a)), 1.02 * math.sin(R(a))
        cone(c, M["teal"], 4, 0.1, 0.0, 0.34, (x, y, 0.78))
    cone(c, M["teal"], 4, 0.14, 0.0, 0.3, (0, 0, 0.98))
    cone(c, M["teal"], 4, 0.14, 0.0, 0.2, (0, 0, 0.73), (180, 0, 0))


def mage_crystal_lab(c):
    box(c, M["violet2"], (2.0, 1.7, 0.15), (0, 0, 0.075))
    box(c, M["violet"], (1.6, 1.3, 1.25), (0, 0, 0.77))
    box(c, M["lilac"], (1.68, 1.38, 0.1), (0, 0, 1.4))
    dome(c, M["team"], 0.8, (0, 0, 1.45))
    cone(c, M["teal"], 4, 0.14, 0.0, 0.4, (0, 0, 2.43))
    cyl(c, M["gold"], 10, 0.24, 0.06, (0.3, -0.66, 0.95), (90, 0, 0))
    cyl(c, M["teal"], 10, 0.16, 0.08, (0.3, -0.67, 0.95), (90, 0, 0))
    box(c, M["door"], (0.36, 0.07, 0.62), (-0.38, -0.66, 0.46))
    shed(c, M["team"], 0.6, 0.32, 0.12, (-0.38, -0.8, 0.86))
    for x, y, h, r in ((-1.0, -0.3, 1.1, 0.2), (-1.05, 0.25, 0.8, 0.16), (-0.95, -0.7, 0.6, 0.13), (1.0, 0.1, 0.9, 0.18), (0.95, -0.5, 0.6, 0.14)):
        cone(c, M["teal"], 5, r, 0.0, h, (x, y, h / 2 + 0.1))
    for x, y, h in ((-1.1, 0.0, 0.5), (1.08, 0.5, 0.55)):
        cone(c, M["violet"], 5, 0.12, 0.0, h, (x, y, h / 2 + 0.1))


def mage_observatory(c):
    cyl(c, M["violet2"], 10, 1.15, 0.2, (0, 0, 0.1))
    cyl(c, M["violet"], 10, 1.0, 1.25, (0, 0, 0.82))
    cyl(c, M["lilac"], 10, 1.04, 0.1, (0, 0, 1.45))
    dome(c, M["team"], 1.0, (0, 0, 1.48), 10)
    box(c, M["dark"], (0.24, 0.5, 0.8), (0.36, -0.2, 2.15), 45)
    cyl(c, M["brass"], 8, 0.13, 1.5, (0.65, -0.35, 2.55), (0, 50, -45))
    cyl(c, M["brass"], 8, 0.17, 0.2, (1.14, -0.84, 2.98), (0, 50, -45))
    box(c, M["door"], (0.42, 0.1, 0.68), (0, -1.0, 0.52))
    box(c, M["gold"], (0.52, 0.1, 0.08), (0, -1.0, 0.9))
    for a in (-30, 30):
        x, y = 0.98 * math.sin(R(a)), -0.98 * math.cos(R(a))
        box(c, M["teal"], (0.18, 0.06, 0.26), (x, y, 1.0), a)


def mage_teleport_gate(c):
    cyl(c, M["violet2"], 12, 1.25, 0.25, (0, 0, 0.125))
    cyl(c, M["lilac"], 12, 1.12, 0.05, (0, 0, 0.27))
    for sx in (-1, 1):
        box(c, M["violet"], (0.32, 0.36, 1.85), (sx * 0.78, 0, 1.2))
        box(c, M["lilac"], (0.4, 0.44, 0.14), (sx * 0.78, 0, 0.35))
    box(c, M["violet"], (1.9, 0.36, 0.32), (0, 0, 2.27))
    box(c, M["lilac"], (0.3, 0.4, 0.34), (0, 0, 2.27))
    box(c, M["teal"], (1.24, 0.08, 1.9), (0, 0, 1.2))
    box(c, M["teal2"], (0.8, 0.1, 1.3), (0, 0, 1.15))
    cone(c, M["teal"], 5, 0.18, 0.0, 0.6, (-0.3, 0, 2.73))
    cone(c, M["teal"], 5, 0.12, 0.0, 0.4, (-0.05, 0.05, 2.63))
    flag(c, (0.55, 0, 2.43), 0.6, 0.45)


def assassin_shade_tower(c):
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(c, M["dwood"], (0.15, 0.15, 2.45), (sx * 0.6, sy * 0.6, 1.22))
    for z in (0.7, 1.6):
        box(c, M["dwood2"], (1.35, 0.08, 0.09), (0, -0.6, z))
        box(c, M["dwood2"], (0.08, 1.35, 0.09), (0.6, 0, z))
    box(c, M["dwood2"], (1.55, 1.55, 0.15), (0, 0, 2.5))
    box(c, M["dwood"], (1.42, 1.42, 0.6), (0, 0, 2.87))
    box(c, M["cloth"], (0.6, 0.06, 0.45), (-0.2, -0.73, 2.9))
    box(c, M["cloth"], (0.06, 0.6, 0.45), (0.73, 0.2, 2.9))
    box(c, M["coral"], (1.48, 1.48, 0.07), (0, 0, 3.18))
    pyramid(c, M["team"], 1.95, 1.05, (0, 0, 3.2))
    for z in (0.3, 0.7, 1.1, 1.5, 1.9, 2.3):
        box(c, M["dwood2"], (0.4, 0.05, 0.05), (-0.1, -0.72, z))
    for x in (-0.3, 0.1):
        box(c, M["dwood2"], (0.05, 0.05, 2.4), (x, -0.72, 1.2))


def assassin_hideout(c):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0, location=(0.3, 0.45, 0.6))
    o = bpy.context.object
    o.scale = (1.25, 1.0, 0.95)
    bpy.ops.object.transform_apply(scale=True)
    put(o, M["rock"], c)
    ball(c, M["moss"], 0.55, (0.55, 0.6, 1.25))
    box(c, M["dwood"], (1.25, 0.6, 0.95), (-0.2, -0.35, 0.47))
    gable(c, M["dwood2"], 0.7, 1.4, 0.35, (-0.2, -0.35, 0.95), rz=90)
    cyl(c, M["dwood2"], 10, 0.3, 0.08, (-0.2, -0.66, 0.42), (90, 0, 0))
    ball(c, M["coral"], 0.05, (-0.08, -0.71, 0.42))
    shed(c, M["team"], 1.0, 0.45, 0.14, (-0.2, -0.86, 0.92))
    cyl(c, M["dark"], 6, 0.02, 0.25, (0.38, -0.72, 0.92))
    ball(c, M["coral"], 0.13, (0.38, -0.72, 0.72))
    ball(c, M["leaf"], 0.38, (-1.0, -0.15, 0.3))
    ball(c, M["leaf"], 0.3, (0.95, -0.55, 0.26))
    ball(c, M["moss"], 0.26, (-0.85, 0.45, 0.24))


def assassin_fish_store(c):
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(c, M["dwood2"], (0.13, 0.13, 0.4), (sx * 0.85, sy * 0.65, 0.2))
    box(c, M["dwood2"], (2.0, 1.6, 0.12), (0, 0, 0.44))
    box(c, M["dwood"], (1.8, 1.4, 1.0), (0, 0, 1.0))
    shed(c, M["team"], 2.25, 1.85, 0.45, (0, 0, 1.52))
    box(c, M["dwood2"], (0.42, 0.07, 0.66), (-0.4, -0.72, 0.83))
    for x in (0.2, 0.55):
        cyl(c, M["dark"], 4, 0.012, 0.5, (x, -0.86, 1.25))
        for z in (1.2, 1.02):
            ball(c, M["fish"], 0.09, (x, -0.86, z))
    for x, y in ((1.15, -0.85), (0.75, -1.05)):
        cyl(c, M["dwood"], 8, 0.24, 0.5, (x, y, 0.25))
        cyl(c, M["coral"], 8, 0.25, 0.05, (x, y, 0.36))
    box(c, M["wood"], (0.45, 0.45, 0.4), (-1.05, -1.0, 0.2))
    box(c, M["white"], (0.3, 0.06, 0.18), (0.95, -0.72, 1.25))


def assassin_informant_nest(c):
    ball(c, M["rock"], 0.32, (-0.2, -0.1, 0.12))
    ball(c, M["rock"], 0.26, (0.25, 0.15, 0.1))
    box(c, M["dwood"], (0.22, 0.22, 2.7), (0, 0, 1.35))
    box(c, M["dwood2"], (0.6, 0.4, 0.07), (0, -0.4, 2.55))
    box(c, M["dwood"], (0.95, 0.95, 0.8), (0, 0, 3.0))
    box(c, M["coral"], (1.0, 1.0, 0.07), (0, 0, 3.4))
    pyramid(c, M["team"], 1.3, 0.65, (0, 0, 3.42))
    cyl(c, M["dark"], 10, 0.22, 0.06, (0, -0.48, 3.02), (90, 0, 0))
    box(c, M["cloth"], (0.42, 0.06, 0.2), (0, -0.5, 3.15))
    for x in (-0.16, 0.16):
        box(c, M["straw"], (0.035, 0.035, 2.5), (x, -0.42, 1.27))
    for z in (0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4):
        box(c, M["straw"], (0.34, 0.04, 0.04), (0, -0.42, z))


def assassin_black_market(c):
    box(c, M["dwood2"], (2.3, 1.7, 0.12), (0, 0, 0.06))
    box(c, M["dwood"], (1.9, 0.55, 0.8), (0, -0.4, 0.52))
    box(c, M["dwood2"], (2.0, 0.65, 0.08), (0, -0.4, 0.96))
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(c, M["dwood"], (0.12, 0.12, 1.75), (sx * 1.02, sy * 0.72, 0.95))
    shed(c, M["team"], 2.4, 1.85, 0.4, (0, 0, 1.82))
    for sx in (-1, 1):
        box(c, M["cloth"], (0.05, 1.2, 0.85), (sx * 1.05, 0.05, 1.3))
        cyl(c, M["dark"], 4, 0.012, 0.25, (sx * 0.75, -0.85, 1.68))
        ball(c, M["coral"], 0.13, (sx * 0.75, -0.85, 1.48))
    for x, m in ((-0.45, "cloth"), (-0.1, "coral"), (0.35, "fish")):
        ball(c, M[m], 0.15, (x, -0.45, 1.12))
    box(c, M["wood"], (0.45, 0.45, 0.42), (1.35, -0.75, 0.21))
    box(c, M["wood"], (0.38, 0.38, 0.36), (-1.4, -0.3, 0.18))


for _n, _f in list(globals().items()):
    if callable(_f) and _f.__module__ is None or (callable(_f) and getattr(_f, "__code__", None) and _f.__code__.co_filename == "<string>"):
        pass
BUILD.update({
    "castle": castle, "village": village,
    "warrior-watchtower": warrior_watchtower, "warrior-bastion": warrior_bastion, "warrior-barracks": warrior_barracks,
    "warrior-forge": warrior_forge, "warrior-training": warrior_training,
    "mage-tower": mage_tower, "mage-mana-spring": mage_mana_spring, "mage-crystal-lab": mage_crystal_lab,
    "mage-observatory": mage_observatory, "mage-teleport-gate": mage_teleport_gate,
    "assassin-shade-tower": assassin_shade_tower, "assassin-hideout": assassin_hideout, "assassin-fish-store": assassin_fish_store,
    "assassin-informant-nest": assassin_informant_nest, "assassin-black-market": assassin_black_market,
})
