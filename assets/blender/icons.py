# 아이콘 3D 모델(로우폴리). 아이콘마다 컬렉션 하나를 짓고, 카메라를 그 물체에 맞춰 512px로 렌더한다.
# 시점: 정사영, 위에서 18도, 왼쪽에서 20도 돌린 3/4. 빛은 화면 왼쪽 위. lib.py의 mat·box·cone·cyl·ball·mesh를 쓴다.
import bmesh
from mathutils import Vector, Matrix

for k, v in dict(coin=(255, 204, 64), coin2=(232, 160, 36), red=(232, 64, 58), red2=(176, 38, 40), blue=(58, 150, 236), blue2=(34, 98, 190),
                 steel=(214, 222, 232), steel2=(150, 160, 176), leather=(150, 86, 44), leather2=(106, 58, 30), cream=(252, 244, 222),
                 ink=(44, 40, 52), green=(96, 170, 74), purple=(150, 86, 226), purple2=(110, 58, 178), fishb=(70, 150, 240), fishb2=(40, 100, 200),
                 woodend=(232, 190, 128), bark=(132, 78, 42), card=(26, 110, 104), sand=(240, 214, 150), glass=(196, 236, 246), pink=(246, 160, 170)).items():
    M[k] = mat("i-" + k, v)


def extrude_shape(c, m, pts, depth, loc=(0, 0, 0), rot=(90, 0, 0), bevel=0.0):
    """2D 윤곽(x, y)을 두께 depth로 세운 판. 기본은 화면을 향하도록 x축으로 90도 돌림"""
    me = bpy.data.meshes.new("shape")
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0)) for x, y in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += depth
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, -depth / 2))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel:
        bmesh.ops.bevel(bm, geom=[e for e in bm.edges], offset=bevel, segments=1, affect='EDGES')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("shape", me)
    o.location = loc
    o.rotation_euler = tuple(R(a) for a in rot)
    SC.collection.objects.link(o)
    return put(o, m, c)


def circle_pts(n, r, a0=0.0, sx=1.0, sy=1.0, cx=0.0, cy=0.0):
    return [(cx + sx * r * math.cos(a0 + 2 * math.pi * i / n), cy + sy * r * math.sin(a0 + 2 * math.pi * i / n)) for i in range(n)]


def heart_pts(s=1.0):
    pts = []
    for i in range(28):
        t = 2 * math.pi * i / 28
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x * s / 16, y * s / 16))
    return pts


def i_gold(c):
    extrude_shape(c, M["coin2"], circle_pts(10, 1.0, math.pi / 10), 0.28, (0.25, 0.3, -0.15))
    extrude_shape(c, M["coin2"], circle_pts(10, 1.0, math.pi / 10), 0.28, (0, 0, 0))
    extrude_shape(c, M["coin"], circle_pts(10, 0.8, math.pi / 10), 0.36, (0, 0, 0))
    for x, y, r in ((0, -0.12, 0.26), (-0.3, 0.2, 0.11), (-0.1, 0.36, 0.11), (0.1, 0.36, 0.11), (0.3, 0.2, 0.11)):
        extrude_shape(c, M["cream"], circle_pts(8, r), 0.44, (x, -0.0, y), (90, 0, 0))


def i_crystal(c):
    cone(c, M["purple"], 6, 0.55, 0.0, 1.5, (0, 0, 0.75))
    cone(c, M["purple2"], 6, 0.55, 0.0, 0.6, (0, 0, -0.3), (180, 0, 0))
    cone(c, M["teal"], 5, 0.28, 0.0, 0.8, (0.62, -0.1, 0.2), (0, 18, 0))
    cone(c, M["teal2"], 5, 0.28, 0.0, 0.3, (0.62, -0.1, -0.35), (180, -18, 0))


def i_wood(c):
    for (x, z, rz) in ((0, 0.0, 0), (0.15, 0.62, 0)):
        cyl(c, M["bark"], 8, 0.36, 1.7, (x, 0, z), (0, 90, 20))
        a = R(20)
        cyl(c, M["woodend"], 8, 0.3, 0.06, (x - 0.86 * math.cos(a), -0.86 * math.sin(a), z), (0, 90, 20))
    cyl(c, M["green"], 10, 0.62, 0.18, (0.08, 0, 0.3), (0, 0, 20))


def i_fish(c):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0, location=(0, 0, 0))
    o = bpy.context.object
    o.scale = (1.0, 0.36, 0.62)
    bpy.ops.object.transform_apply(scale=True)
    put(o, M["fishb"], c)
    extrude_shape(c, M["fishb2"], [(0, 0), (0.7, 0.55), (0.55, 0), (0.7, -0.55)], 0.12, (0.85, 0, 0))
    extrude_shape(c, M["fishb2"], [(-0.2, 0.5), (0.25, 0.95), (0.35, 0.45)], 0.1, (0, 0, 0))
    ball(c, M["cream"], 0.15, (-0.62, -0.3, 0.15))
    ball(c, M["ink"], 0.09, (-0.66, -0.37, 0.15))


def i_heart(c):
    extrude_shape(c, M["red2"], heart_pts(1.0), 0.5, (0, 0.05, 0), bevel=0.0)
    extrude_shape(c, M["red"], heart_pts(0.82), 0.62, (0, 0, 0.05))
    extrude_shape(c, M["cream"], circle_pts(6, 0.14, 0, 1.6, 1.0, -0.42, 0.35), 0.7, (0, 0, 0))


def i_mana(c):
    ball(c, M["blue"], 0.75, (0, 0, 0), 2)
    cone(c, M["blue"], 12, 0.68, 0.0, 1.1, (0, 0, 0.82))
    ball(c, M["cream"], 0.15, (-0.32, -0.62, 0.15))


def i_attack(c):
    rot = (90, 40, 0)
    extrude_shape(c, M["steel"], [(-0.2, 0), (0.2, 0), (0.2, 1.55), (0, 1.95), (-0.2, 1.55)], 0.12, (0, 0, 0), rot)
    extrude_shape(c, M["steel2"], [(0, 0), (0.2, 0), (0.2, 1.55), (0, 1.95)], 0.13, (0, 0.005, 0), rot)
    extrude_shape(c, M["coin"], [(-0.62, -0.1), (0.62, -0.1), (0.62, 0.1), (-0.62, 0.1)], 0.26, (0, 0, 0), rot)
    extrude_shape(c, M["leather"], [(-0.11, -0.1), (0.11, -0.1), (0.11, -0.62), (-0.11, -0.62)], 0.2, (0, 0, 0), rot)
    ball(c, M["coin"], 0.18, (-0.74 * math.sin(R(40)), 0, -0.74 * math.cos(R(40))))


def i_move(c):
    extrude_shape(c, M["leather"], [(-0.35, 0), (0.35, 0), (0.35, -0.95), (1.05, -1.25), (1.1, -1.55), (-0.45, -1.55), (-0.45, -0.95)], 0.7, (0, 0, 0.8))
    extrude_shape(c, M["leather2"], [(-0.48, -1.55), (1.12, -1.55), (1.12, -1.75), (-0.48, -1.75)], 0.76, (0, 0, 0.8))
    extrude_shape(c, M["leather2"], [(-0.42, 0.1), (0.42, 0.1), (0.42, -0.12), (-0.42, -0.12)], 0.78, (0, 0, 0.8))


def i_range(c):
    bpy.ops.mesh.primitive_torus_add(major_segments=16, minor_segments=6, major_radius=0.85, minor_radius=0.17, location=(0, 0, 0), rotation=(R(90), 0, 0))
    put(bpy.context.object, M["coin"], c)
    for a in (0, 90, 180, 270):
        x, z = 1.05 * math.cos(R(a)), 1.05 * math.sin(R(a))
        box(c, M["coin2"], (0.12 if a in (90, 270) else 0.34, 0.12, 0.34 if a in (90, 270) else 0.12), (x, 0, z))


def i_dice(c):
    box(c, M["cream"], (1.4, 1.4, 1.4), (0, 0, 0))
    pip = lambda loc, rot: extrude_shape(c, M["ink"], circle_pts(8, 0.14), 0.04, loc, rot)
    extrude_shape(c, M["red"], circle_pts(8, 0.22), 0.04, (0, 0, 0.71), (0, 0, 0))
    for x, z in ((-0.35, 0.35), (0.35, -0.35)):
        pip((x, -0.71, z), (90, 0, 0))
    for y, z in ((-0.35, 0.35), (0, 0), (0.35, -0.35)):
        pip((0.71, y, z), (0, 90, 0))


def i_chat(c):
    pts = []
    for i in range(14):
        t = math.pi * 2 * i / 14
        pts.append((1.15 * math.cos(t), 0.85 * math.sin(t) + 0.1))
    pts = pts[:10] + [(-0.55, -0.62), (-0.85, -1.05), (-0.2, -0.72)] + pts[11:]
    extrude_shape(c, M["steel2"], [(x * 1.06, y * 1.06) for x, y in pts], 0.32, (0, 0.06, 0))
    extrude_shape(c, M["cream"], pts, 0.44, (0, 0, 0))
    for x, y, r in ((0, -0.05, 0.24), (-0.32, 0.3, 0.1), (-0.11, 0.44, 0.1), (0.11, 0.44, 0.1), (0.32, 0.3, 0.1)):
        extrude_shape(c, M["coral"], circle_pts(8, r), 0.5, (x, -0.0, y + 0.1), (90, 0, 0))


def i_settings(c):
    n = 8
    pts = []
    for i in range(n * 4):
        t = 2 * math.pi * i / (n * 4)
        r = 1.0 if (i % 4) in (1, 2) else 0.78
        pts.append((r * math.cos(t), r * math.sin(t)))
    extrude_shape(c, M["steel2"], pts, 0.36, (0, 0, 0))
    extrude_shape(c, M["steel"], circle_pts(16, 0.62), 0.42, (0, 0, 0))
    extrude_shape(c, M["ink"], circle_pts(12, 0.28), 0.5, (0, 0, 0))


def i_deck(c):
    for k in range(3):
        extrude_shape(c, M["card"] if k == 2 else M["cream"], [(-0.62, -0.88), (0.62, -0.88), (0.62, 0.88), (-0.62, 0.88)], 0.08, (0.12 * k - 0.12, -0.1 * k, 0.06 * k), (90, 0, -12 + 12 * k))
    extrude_shape(c, M["coin"], [(0, 0.42), (0.3, 0), (0, -0.42), (-0.3, 0)], 0.1, (0.12, -0.26, 0.12), (90, 0, 12))


def i_turn(c):
    cyl(c, M["leather"], 8, 0.7, 0.16, (0, 0, 0.95))
    cyl(c, M["leather"], 8, 0.7, 0.16, (0, 0, -0.95))
    for a in (45, 135, 225, 315):
        cyl(c, M["leather2"], 6, 0.06, 1.8, (0.55 * math.cos(R(a)), 0.55 * math.sin(R(a)), 0))
    cone(c, M["glass"], 8, 0.5, 0.06, 0.85, (0, 0, 0.45), (180, 0, 0))
    cone(c, M["glass"], 8, 0.5, 0.06, 0.85, (0, 0, -0.45))
    cone(c, M["sand"], 8, 0.36, 0.0, 0.4, (0, 0, -0.66))


def i_trade(c):
    arrow = [(-0.9, 0.12), (0.45, 0.12), (0.45, 0.4), (0.95, 0), (0.45, -0.4), (0.45, -0.12), (-0.9, -0.12)]
    extrude_shape(c, M["green"], [(x, y + 0.42) for x, y in arrow], 0.3, (0, 0, 0))
    extrude_shape(c, M["coin"], [(-x, y - 0.42) for x, y in arrow], 0.3, (0, 0, 0))


def i_star(c):
    pts = []
    for i in range(10):
        r = 1.0 if i % 2 == 0 else 0.45
        t = math.pi / 2 + math.pi * i / 5
        pts.append((r * math.cos(t), r * math.sin(t)))
    extrude_shape(c, M["coin2"], pts, 0.3, (0, 0.04, 0))
    extrude_shape(c, M["coin"], [(x * 0.8, y * 0.8) for x, y in pts], 0.42, (0, 0, 0))


def i_home(c):
    box(c, M["stone"], (1.2, 1.0, 0.9), (0, 0, 0.45))
    pyramid(c, M["red"], 1.6, 0.8, (0, 0, 0.9))
    box(c, M["door"], (0.34, 0.05, 0.5), (0, -0.52, 0.25))


def i_paw(c):
    extrude_shape(c, M["coral"], circle_pts(10, 0.5, 0, 1.15, 0.95, 0, -0.25), 0.3, (0, 0, 0))
    for x, y in ((-0.62, 0.38), (-0.22, 0.72), (0.22, 0.72), (0.62, 0.38)):
        extrude_shape(c, M["coral"], circle_pts(8, 0.22, 0, 1.0, 1.15, x, y), 0.3, (0, 0, 0))


ICONS = {"gold": i_gold, "crystal": i_crystal, "wood": i_wood, "fish": i_fish, "heart": i_heart, "mana": i_mana, "attack": i_attack,
         "move": i_move, "range": i_range, "dice": i_dice, "chat": i_chat, "settings": i_settings, "deck": i_deck, "turn": i_turn,
         "trade": i_trade, "star": i_star, "home": i_home, "paw": i_paw}
TILT = {"gold": (14, -18), "heart": (8, -14), "mana": (8, -14), "chat": (10, -16), "star": (8, -14), "paw": (8, -14), "range": (8, -10),
        "settings": (14, -18), "trade": (10, -12), "attack": (10, -14), "move": (12, -24), "deck": (14, -18)}


def render_icons(out, names, px=512):
    SC.render.resolution_x = SC.render.resolution_y = px
    cam = SC.camera
    cam.data.shift_x = cam.data.shift_y = 0
    for ch in list(SC.collection.children):
        for o in list(ch.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(ch)
    for name in names:
        coll = bpy.data.collections.new("ic-" + name)
        SC.collection.children.link(coll)
        ICONS[name](coll)
    bpy.context.view_layer.update()
    sun = bpy.data.objects["pc-sun"]
    sun.data.energy = 3.4
    SC.world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.62, 0.66, 1)
    for name in names:
        coll = bpy.data.collections["ic-" + name]
        for ch in SC.collection.children:
            ch.hide_render = ch.name != "ic-" + name
        el, az = TILT.get(name, (20, -24))
        el, az = R(el), R(az)
        d = Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))
        pts = [o.matrix_world @ Vector(v) for o in coll.objects for v in o.bound_box]
        mid = sum(pts, Vector()) / len(pts)
        cam.location = mid + d * 30
        cam.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        bpy.context.view_layer.update()
        inv = cam.matrix_world.inverted()
        loc = [inv @ (o.matrix_world @ v.co) for o in coll.objects for v in o.data.vertices]
        w = max(p.x for p in loc) - min(p.x for p in loc)
        h = max(p.y for p in loc) - min(p.y for p in loc)
        cx = (max(p.x for p in loc) + min(p.x for p in loc)) / 2
        cy = (max(p.y for p in loc) + min(p.y for p in loc)) / 2
        cam.data.ortho_scale = max(w, h) * 1.1
        cam.data.shift_x = cx / cam.data.ortho_scale
        cam.data.shift_y = cy / cam.data.ortho_scale
        L = cam.matrix_world.to_3x3() @ Vector((-1.0, 1.2, 0.9))
        sun.rotation_euler = L.to_track_quat('Z', 'Y').to_euler()
        SC.render.filepath = os.path.join(out, f"icon-{name}.png")
        bpy.ops.render.render(write_still=True)
        cam.data.shift_x = cam.data.shift_y = 0
    return names
