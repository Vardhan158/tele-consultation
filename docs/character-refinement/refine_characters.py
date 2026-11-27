"""Build the story's footwear and character variants using Blender."""
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

output, elder_source, companion_source = map(Path, sys.argv[sys.argv.index("--") + 1:])
output.mkdir(parents=True, exist_ok=True)

# Longitudinal profile in meters: position, half-width, center height, edge height.
SHOE_PROFILE = [
    (-.105, .009, .059, .030), (-.097, .035, .083, .063),
    (-.079, .045, .100, .080), (-.048, .051, .116, .091),
    (-.012, .055, .125, .099), (.030, .060, .119, .086),
    (.076, .068, .094, .052), (.121, .071, .075, .043),
    (.166, .064, .063, .035), (.194, .052, .054, .032),
    (.211, .032, .043, .028), (.218, .006, .032, .024),
]


def material(name, color, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def footwear(rig, elder):
    upper = material("Tobacco nubuck" if elder else "Indigo woven upper",
                     (.092, .046, .022) if elder else (.040, .066, .108), .72)
    seam = material("Brown welt" if elder else "Gray midsole",
                    (.052, .025, .013) if elder else (.33, .35, .34), .77)
    sole = material("Tread rubber", (.024, .019, .016), .86)
    detail = material("Saddle strap" if elder else "Cotton laces",
                      (.127, .065, .030) if elder else (.24, .27, .32), .8)
    vertices, faces, materials, sides = [], [], [], []
    def add_face(indices, mat):
        faces.append(indices)
        materials.append(mat)

    for side in ("Left", "Right"):
        ankle = rig.matrix_world @ rig.data.bones[side + "Foot"].head_local
        toe = rig.matrix_world @ rig.data.bones[side + "ToeBase"].head_local
        forward = Vector((toe.x - ankle.x, toe.y - ankle.y, 0)).normalized()
        across = Vector((-forward.y, forward.x, 0))
        base = len(vertices)
        collar_offset = -.010 if side == "Left" else -.020

        def add_vertex(length, lateral, height):
            point = ankle + forward * length + across * lateral
            point.z = height
            vertices.append(tuple(point))
            return len(vertices) - 1

        ring_size = 16
        for length, span, peak, edge in SHOE_PROFILE:
            for i in range(ring_size):
                t = math.tau * i / ring_size
                lateral = span * math.cos(t) + collar_offset
                height = edge + (peak - edge) * math.sin(t) if i <= 8 else .016 + .016 * (1 + math.sin(t))
                add_vertex(length, lateral, height)
        for row in range(len(SHOE_PROFILE) - 1):
            for i in range(ring_size):
                a = base + row * ring_size + i
                b = base + row * ring_size + (i + 1) % ring_size
                add_face((a, b, b + ring_size, a + ring_size), 0 if i < 8 else 1)
        add_face(tuple(base + i for i in reversed(range(ring_size))), 0)
        add_face(tuple(len(vertices) - ring_size + i for i in range(ring_size)), 0)

        tread = len(vertices)
        for level in (0, .020):
            for length, span, _, _ in SHOE_PROFILE:
                for direction in (-1, 1):
                    add_vertex(length, collar_offset + (span + .003) * direction, level)
        band = len(SHOE_PROFILE) * 2
        for row in range(len(SHOE_PROFILE) - 1):
            left = tread + row * 2
            right = left + 1
            add_face((left, left + 2, right + 2, right), 2)
            add_face((left + band, right + band, right + band + 2, left + band + 2), 1)
            add_face((left, left + band, left + band + 2, left + 2), 2)
            add_face((right, right + 2, right + band + 2, right + band), 2)
        add_face((tread, tread+1, tread+1+band, tread+band), 2)
        end = tread + band - 2
        add_face((end, end+band, end+band+1, end+1), 2)

        # Low loafer saddle or four inset laces across the vamp.
        rows = [(0.052, .082)] if elder else [(t, t+.005) for t in (.018,.035,.052,.069)]
        for start, finish in rows:
            section = []
            for length in (start, finish):
                for u in np.linspace(-1, 1, 9):
                    top = np.interp(length, [v[0] for v in SHOE_PROFILE], [v[2] for v in SHOE_PROFILE])
                    edge = np.interp(length, [v[0] for v in SHOE_PROFILE], [v[3] for v in SHOE_PROFILE])
                    height = edge + (top-edge) * math.sqrt(1 - (.84*u)**2) + .003
                    section.append(add_vertex(length, collar_offset + u*.050, height))
            for index in range(8):
                add_face((section[index],section[index+9],section[index+10],section[index+1]), 3)
        sides.append((side, base, len(vertices)))

    mesh = bpy.data.meshes.new("Shoe uppers and flat outsoles")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Leather walking loafers" if elder else "Canvas walking sneakers", mesh)
    bpy.context.collection.objects.link(obj)
    for mat in (upper, seam, sole, detail):
        mesh.materials.append(mat)
    for poly, mat in zip(mesh.polygons, materials):
        poly.material_index = mat
        poly.use_smooth = mat == 0
    edit = bmesh.new()
    edit.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(edit, faces=tuple(edit.faces))
    edit.to_mesh(mesh)
    edit.free()
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()
    modifier = obj.modifiers.new("Foot bones", "ARMATURE")
    modifier.object = rig
    for side, start, end in sides:
        obj.vertex_groups.new(name=side+"Foot").add(list(range(start, end)), 1, "REPLACE")
    return obj


def refine_surface(body, elder):
    world = body.matrix_world
    inverse = world.inverted()
    position = np.array([tuple(world @ vertex.co) for vertex in body.data.vertices])
    x, y, z = position.T.copy()

    def around(value, center, size):
        return np.exp(-((value-center)/size)**2)

    front = np.clip((-y - .013)/.060, 0, 1)
    if elder:
        jowl = front * around(abs(x), .051, .025) * around(z, 1.554, .025)
        cheek = front * around(abs(x), .046, .022) * around(z, 1.607, .022)
        orbit = front * around(abs(x), .042, .026) * around(z, 1.648, .008)
        neck = front * around(x, 0, .046) * around(z, 1.515, .023)
        folds = front * around(abs(x), .028 + (1.619-z)*.46, .0036) * around(z, 1.592, .022)
        temple = np.clip((z - 1.713)/.045,0,1) * around(abs(x),.069,.042)
        arms = np.clip((abs(x)-.23)/.15,0,1) * around(z,1.23,.15)
        position[:, 0] += x * (.087*jowl - .071*cheek - .042*temple)
        position[:, 1] += .0065*cheek + .0035*orbit - .004*neck + .0017*folds - .15*arms*(y-.04)
        position[:, 2] -= .008*jowl + .0025*neck + .011*temple
        age = np.clip(.40*jowl + .72*orbit + .31*neck + .4*cheek + .53*folds, 0, 1)
    else:
        jaw = front * around(z, 1.557, .030)
        nose = front * around(x, 0, .026) * around(z, 1.618, .023)
        position[:, 0] += x * (.11*jaw - .07*nose)
        position[:, 1] -= .006*nose
        age = np.zeros_like(x)
    for vertex, coords in zip(body.data.vertices, position):
        vertex.co = inverse @ Vector(coords)

    node = next(link.from_node for link in body.data.materials[0].node_tree.links
                if link.to_socket.name == "Base Color" and link.from_node.type == "TEX_IMAGE")
    image = node.image
    width, height = image.size
    rgba = np.empty(width*height*4, dtype=np.float32)
    image.pixels.foreach_get(rgba)
    rgba = rgba.reshape(height,width,4)
    rgb = rgba[:, :, :3].copy()
    r,g,b = rgb.transpose(2,0,1)
    shirt = np.zeros((height,width), dtype=np.float32)
    fabric_core = np.zeros_like(shirt)
    protected_uv = np.zeros_like(shirt)
    aged = np.zeros_like(shirt)
    uv = body.data.uv_layers.active.data
    for loop in body.data.loops:
        i = loop.vertex_index
        is_shirt = .87 < z[i] < 1.485 and abs(x[i]) < .338
        u,v = uv[loop.index].uv
        col = min(width-1,max(0,int(u*width)))
        row = min(height-1,max(0,int(v*height)))
        if is_shirt:
            shirt[row,col] = 1
            if .907 < z[i] < 1.426 and abs(x[i]) < .220:
                fabric_core[row,col] = 1
        else:
            protected_uv[row,col] = 1
        if age[i] > .011:
            aged[row,col] = max(aged[row,col],age[i])
    for _ in range(5):
        shirt = np.maximum.reduce([shirt, np.roll(shirt,1,0),np.roll(shirt,-1,0),np.roll(shirt,1,1),np.roll(shirt,-1,1)])
        aged = np.maximum.reduce([aged,np.roll(aged,1,0)*.92,np.roll(aged,-1,0)*.92,np.roll(aged,1,1)*.92,np.roll(aged,-1,1)*.92])
        protected_uv = np.maximum.reduce([protected_uv,np.roll(protected_uv,1,0),np.roll(protected_uv,-1,0),
            np.roll(protected_uv,1,1),np.roll(protected_uv,-1,1)])
    # Fill UV padding inside the torso while protecting the neckline and sleeve edges.
    for _ in range(12):
        fabric_core = np.maximum.reduce([fabric_core,np.roll(fabric_core,1,0)*.982,
            np.roll(fabric_core,-1,0)*.982,np.roll(fabric_core,1,1)*.982,np.roll(fabric_core,-1,1)*.982])
    neutral = np.clip((.169 - np.abs(r-b))/.038,0,1) * np.clip((g-.21)/.12,0,1)
    fabric = np.array([.28,.57,.49] if elder else [.63,.37,.20])
    luminance = (.2126*r + .7152*g + .0722*b) / .58
    cloth = luminance[:,:,None] * fabric
    core_color = np.clip((.216 - np.abs(r-b))/.045,0,1) * np.clip((g-.29)/.16,0,1)
    cloth_mask = (np.maximum(shirt * neutral, fabric_core * core_color) * (1-protected_uv))[:,:,None]
    rgba[:,:,:3] = np.clip((rgb * (1-cloth_mask) + cloth * cloth_mask)
        * (1 - aged[:,:,None]*np.array([.10,.16,.18])),0,1)
    atlas = bpy.data.images.new("Sage cotton and aged skin" if elder else "Ochre cotton and skin",width,height,alpha=False)
    atlas.colorspace_settings.name = "sRGB"
    atlas.pixels.foreach_set(rgba.ravel())
    atlas.update()
    atlas.pack()
    node.image = atlas

    # Ankles overlap the shoe collar. Remove the covered bare-foot geometry.
    mesh = bmesh.new()
    mesh.from_mesh(body.data)
    bmesh.ops.bisect_plane(mesh, geom=[*mesh.verts,*mesh.edges,*mesh.faces],
        dist=.00001, plane_co=inverse @ Vector((0,0,.079)),
        plane_no=world.to_3x3().transposed() @ Vector((0,0,1)), clear_inner=True)
    mesh.to_mesh(body.data)
    mesh.free()
    body.data.update()


def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()


def studio(scene):
    if scene.camera is None:
        camera = bpy.data.objects.new("Studio camera", bpy.data.cameras.new("Studio camera"))
        scene.collection.objects.link(camera)
        scene.camera = camera
        for name, loc, energy in (("Key",(1.8,-3,3.1),280),("Fill",(-2,-1,2.4),175),("Rim",(0,2,2.7),275)):
            data = bpy.data.lights.new(name,"AREA")
            data.energy, data.shape, data.size = energy,"DISK",2.3
            obj = bpy.data.objects.new(name,data)
            scene.collection.objects.link(obj)
            obj.location = loc
            aim(obj,(0,0,1.12))
        scene.world = bpy.data.worlds.new("Ambient")
        scene.world.color = (.16,.16,.16)
        bpy.ops.mesh.primitive_plane_add(size=200)
        bpy.context.object.name = "Studio floor"
        bpy.context.object.data.materials.append(material("Slate",(.075,.102,.13),.8))
    camera = scene.camera
    camera.location = (1.25,-5.1,1.76)
    aim(camera,(0,0,.91))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.04
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 18
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 680, 920
    scene.render.resolution_percentage = 100


for elder, path, name in [(True,elder_source,"elderly_patient"),(False,companion_source,"companion")]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if elder:
        bpy.ops.wm.open_mainfile(filepath=str(path))
    else:
        bpy.ops.import_scene.gltf(filepath=str(path), disable_bone_shape=True, bone_heuristic="BLENDER")
    scene = bpy.context.scene
    rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    body = next(obj for obj in rig.children if obj.type == "MESH")
    rig.data.pose_position = "REST"
    bpy.context.view_layer.update()
    refine_surface(body,elder)
    shoe = footwear(rig,elder)
    bpy.context.view_layer.update()
    studio(scene)
    scene.render.filepath = f"//{name}_cycles.png"
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(output/f"{name}.blend"), compress=True)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    body.select_set(True)
    shoe.select_set(True)
    bpy.context.view_layer.objects.active = body
    reduce = body.modifiers.new("Web mesh reduction","DECIMATE")
    reduce.ratio = .36 if elder else .30
    reduce.use_collapse_triangulate = True
    bpy.ops.object.modifier_move_up(modifier=reduce.name)
    bpy.ops.object.modifier_apply(modifier=reduce.name)
    for vertex in body.data.vertices:
        weights = sorted(((w.group,w.weight) for w in vertex.groups if w.weight > 1e-6),
                         key=lambda pair: pair[1], reverse=True)
        total = sum(weight for _,weight in weights[:4])
        for group,_ in weights[4:]:
            body.vertex_groups[group].remove([vertex.index])
        for group,weight in weights[:4]:
            body.vertex_groups[group].add([vertex.index],weight/total,"REPLACE")
    rig.data.pose_position = "POSE"
    bpy.ops.export_scene.gltf(filepath=str(output/f"{name}.glb"),export_format="GLB",
        use_selection=True, export_animations=True, export_image_format="WEBP",export_image_quality=93,
        export_meshopt_compression_enable=True,export_meshopt_extension="EXT_meshopt_compression",
        export_optimize_animation_size=True,export_optimize_animation_keep_anim_armature=True)
    rig.data.pose_position = "REST"
    bpy.ops.render.render(write_still=True)
