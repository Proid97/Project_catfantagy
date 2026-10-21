# 건물 말 밑그림 공통: 장면·카메라·빛·재질·도형·렌더. 모든 건물이 같은 카메라와 축척을 씀.
import bpy, bmesh, math, os
from mathutils import Vector
R = math.radians
SC = bpy.data.scenes.get("pieces") or bpy.data.scenes.new("pieces")
bpy.context.window.scene = SC


def srgb(c):
    return tuple(pow(v / 255, 2.2) for v in c)


def mat(name, rgb, team=False, emit=0.0):
    m = bpy.data.materials.get("pc-" + name) or bpy.data.materials.new("pc-" + name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*srgb(rgb), 1)
    b.inputs["Roughness"].default_value = 1.0
    b.inputs["Specular IOR Level"].default_value = 0.0
    b.inputs["Emission Color"].default_value = (*srgb(rgb), 1)
    b.inputs["Emission Strength"].default_value = emit
    m["team"] = team
    return m


# 팀 색 자리는 중간 회색. 그 밖에는 회색을 쓰지 않음(채도가 있는 색만)
COLORS = dict(
    stone=(242, 221, 176), stone2=(212, 182, 136), plaster=(247, 234, 206), gold=(236, 172, 52),
    wood=(140, 76, 36), wood2=(104, 56, 28), dark=(52, 34, 28), door=(150, 78, 36), straw=(226, 184, 92), bronze=(122, 78, 46),
    violet=(156, 112, 196), violet2=(112, 76, 152), lilac=(204, 178, 232), teal=(64, 214, 196),
    teal2=(30, 150, 150), brass=(206, 150, 58), dwood=(96, 60, 40), dwood2=(66, 42, 30), cloth=(34, 112, 116), coral=(240, 112, 92),
    rock=(112, 122, 146), moss=(78, 126, 70), leaf=(52, 102, 66), fish=(206, 170, 112), white=(250, 246, 236))
M = {k: mat(k, v) for k, v in COLORS.items()}
M["team"] = mat("team", (150, 150, 150), True)
M["fire"] = mat("fire", (255, 140, 40), False, 2.0)


def put(o, m, c):
    o.data.materials.clear()
    o.data.materials.append(m)
    for p in o.data.polygons:
        p.use_smooth = False
    for col in list(o.users_collection):
        col.objects.unlink(o)
    c.objects.link(o)
    return o


def box(c, m, size, loc, rz=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=(0, 0, R(rz)))
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return put(o, m, c)


def cone(c, m, n, r1, r2, d, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r1, radius2=r2, depth=d, location=loc, rotation=tuple(R(a) for a in rot))
    return put(bpy.context.object, m, c)


def cyl(c, m, n, r, d, loc, rot=(0, 0, 0)):
    return cone(c, m, n, r, r, d, loc, rot)


def ball(c, m, r, loc, sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=loc)
    return put(bpy.context.object, m, c)


def dome(c, m, r, loc, seg=8, rings=3):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings * 2, radius=r, location=loc)
    o = bpy.context.object
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS')
    bm.to_mesh(o.data)
    bm.free()
    return put(o, m, c)


def mesh(c, m, verts, faces, loc=(0, 0, 0), rz=0):
    me = bpy.data.meshes.new("m")
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new("o", me)
    o.location = loc
    o.rotation_euler = (0, 0, R(rz))
    SC.collection.objects.link(o)
    return put(o, m, c)


def gable(c, m, w, d, h, loc, rz=0, over=0.12):
    """박공지붕: x로 폭 w, y로 길이 d, 높이 h"""
    x, y = w / 2 + over, d / 2 + over
    return mesh(c, m, [(-x, -y, 0), (x, -y, 0), (0, -y, h), (-x, y, 0), (x, y, 0), (0, y, h)],
                [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (0, 2, 5, 3)], loc, rz)


def shed(c, m, w, d, h, loc, rz=0, t=0.08):
    """외쪽 지붕: y 뒤가 높음"""
    x, y = w / 2, d / 2
    return mesh(c, m, [(-x, -y, 0), (x, -y, 0), (x, y, h), (-x, y, h), (-x, -y, -t), (x, -y, -t), (x, y, h - t), (-x, y, h - t)],
                [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], loc, rz)


def pyramid(c, m, s, h, loc, rz=45):
    return cone(c, m, 4, s / math.sqrt(2), 0, h, (loc[0], loc[1], loc[2] + h / 2), (0, 0, rz))


def flag(c, base, h=0.9, w=0.7, m=None):
    """깃대(금) + 팀 색 깃발. 깃발은 화면 오른쪽(+x)으로 날림"""
    m = m or M["team"]
    x, y, z0 = base
    cyl(c, M["gold"], 6, 0.045, h, (x, y, z0 + h / 2))
    ball(c, M["gold"], 0.09, (x, y, z0 + h + 0.05))
    z = z0 + h - 0.06
    mesh(c, m, [(x, y, z), (x + w, y - 0.05, z - 0.06), (x + w * 0.72, y - 0.03, z - 0.2), (x + w, y - 0.05, z - 0.38), (x, y, z - 0.34)],
         [(0, 1, 2, 4), (2, 3, 4)])


def merlons(c, m, w, d, z, size=0.24, gap=0.2):
    """사각 벽 위 흉벽"""
    for sx, sy, n in ((0, -1, w), (0, 1, w), (-1, 0, d), (1, 0, d)):
        k = max(2, int(n / (size + gap)))
        for i in range(k):
            t = -n / 2 + size / 2 + i * (n - size) / (k - 1)
            box(c, m, (size, size, size), (t if sy else sx * w / 2, sy * d / 2 if sy else t, z + size / 2))


def ring_merlons(c, m, r, z, k=12, size=0.24):
    for i in range(k):
        a = 2 * math.pi * i / k
        box(c, m, (size, size, size), (r * math.cos(a), r * math.sin(a), z + size / 2), math.degrees(a))


# 카메라: 정사영, 모서리가 앞을 보는 3/4(방위 45도), 위에서 30도. 원점(땅 가운데)이 1024 캔버스의 (512, 840)
ORTHO = 8.5


def setup():
    for o in list(SC.collection.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    cam = bpy.data.objects.new("pc-cam", bpy.data.cameras.new("pc-cam"))
    SC.collection.objects.link(cam)
    SC.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ORTHO
    cam.data.shift_y = 328 / 1024
    cam.data.clip_end = 200
    el, az = R(30), R(45)
    cam.location = (40 * math.cos(el) * math.sin(az), -40 * math.cos(el) * math.cos(az), 40 * math.sin(el))
    cam.rotation_euler = (R(90) - el, 0, az)
    sun = bpy.data.objects.new("pc-sun", bpy.data.lights.new("pc-sun", 'SUN'))
    SC.collection.objects.link(sun)
    sun.data.energy = 3.0
    sun.data.angle = R(1)
    bpy.context.view_layer.update()
    L = cam.matrix_world.to_3x3() @ Vector((-1.0, 1.25, 0.7))  # 화면 왼쪽 위, 조금 앞에서
    sun.rotation_euler = L.to_track_quat('Z', 'Y').to_euler()
    w = bpy.data.worlds.get("pc-world") or bpy.data.worlds.new("pc-world")
    SC.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.45, 0.45, 0.5, 1)
    r = SC.render
    r.engine = 'BLENDER_EEVEE'
    r.film_transparent = True
    r.resolution_x = r.resolution_y = 1024
    r.resolution_percentage = 100
    SC.view_settings.view_transform = 'Standard'
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'


HOLD = bpy.data.materials.get("pc-holdout") or bpy.data.materials.new("pc-holdout")
HOLD.use_nodes = True
_nt = HOLD.node_tree
if not any(n.bl_idname == "ShaderNodeHoldout" for n in _nt.nodes):
    _nt.nodes.clear()
    _nt.links.new(_nt.nodes.new("ShaderNodeHoldout").outputs[0], _nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])

BUILD = {}


def build_and_render(out, names):
    """이름마다 컬렉션을 새로 짓고, 그 건물만 보이게 색 렌더와 팀 자리 렌더(다른 재질은 holdout)를 함"""
    for ch in list(SC.collection.children):
        for o in list(ch.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(ch)
    for name in names:
        coll = bpy.data.collections.new("pc-" + name)
        SC.collection.children.link(coll)
        BUILD[name](coll)
    for name in names:
        for ch in SC.collection.children:
            ch.hide_render = ch.name != "pc-" + name
        coll = bpy.data.collections["pc-" + name]
        SC.render.filepath = os.path.join(out, f"b-{name}.png")
        bpy.ops.render.render(write_still=True)
        objs = [o for o in coll.objects if o.type == 'MESH']
        saved = [(o, o.data.materials[0]) for o in objs]
        for o in objs:
            if not o.data.materials[0].get("team"):
                o.data.materials[0] = HOLD
        SC.render.filepath = os.path.join(out, f"b-{name}-teamalpha.png")
        bpy.ops.render.render(write_still=True)
        for o, m in saved:
            o.data.materials[0] = m
    # 뷰포트에서 보기 좋게 가로로 늘어놓음(렌더 뒤)
    for i, ch in enumerate(SC.collection.children):
        ch.hide_render = False
        for o in ch.objects:
            o.location.x += (i - (len(names) - 1) / 2) * 7
    return names
