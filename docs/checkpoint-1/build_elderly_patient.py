"""Refine the Kaizen Care rig in Blender. Invoke with the current story GLB after --."""
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

source = Path(sys.argv[-1]).resolve()
output = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
scene = bpy.context.scene
rig = next(obj for obj in scene.objects if obj.type == 'ARMATURE')
body = next(obj for obj in scene.objects if obj.type == 'MESH' and obj.vertex_groups)
for obj in tuple(scene.objects):
    if obj not in (rig, body):
        bpy.data.objects.remove(obj, do_unlink=True)
rig.data.pose_position = 'REST'
scene.frame_set(0)
bpy.context.view_layer.update()

# Work in meters while retaining the original centimeter-scaled bone matrices.
world = body.matrix_world.copy()
inverse = world.inverted()
points = np.array([tuple(world @ vertex.co) for vertex in body.data.vertices])
x, y, z = points.T.copy()

def gaussian(value, center, width):
    return np.exp(-((value - center) / width) ** 2)

front = np.clip((-y - .013) / .055, 0, 1)
cheek = gaussian(abs(x), .044, .024) * gaussian(z, 1.595, .027) * front
jaw = gaussian(z, 1.554, .027) * front
under_eye = gaussian(abs(x), .033, .020) * gaussian(z, 1.646, .010) * front
nose = gaussian(x, 0, .024) * gaussian(z, 1.619, .021) * front
forehead = sum(
    gaussian(z, level + .004 * (x / .07) ** 2 + .0014 * np.sin(39 * x + level * 40), .0012) * gaussian(x, 0, .060)
    for level in (1.688, 1.701, 1.711)
) * front
fold = gaussian(abs(x), .023 + (1.619 - z) * .49, .0036) * gaussian(z, 1.595, .018) * front
torso = gaussian(z, 1.06, .16) * gaussian(x, 0, .27)
arms = np.clip((abs(x) - .21) / .17, 0, 1) * gaussian(z, 1.21, .125)
points[:, 0] += x * (.18 * nose + .022 * jaw - .075 * cheek + .11 * torso)
points[:, 1] += (y - .055) * (.17 * torso - .15 * arms)
points[:, 1] += .0060 * cheek + .0032 * under_eye + .00135 * forehead + .0025 * fold
points[:, 2] -= .0027 * jaw + .0017 * cheek
wrinkle_uv = np.zeros((1024, 1024), dtype=np.float32)
beard_uv = np.zeros_like(wrinkle_uv)
beard = (gaussian(z, 1.549, .026) * gaussian(x, 0, .066)
    + .48 * gaussian(z, 1.599, .007) * gaussian(x, 0, .044)) * front
uv = body.data.uv_layers.active.data
for loop in body.data.loops:
    index = loop.vertex_index
    strength = .10 * forehead[index] + .16 * fold[index] + .12 * under_eye[index]
    if max(strength, beard[index]) > .012:
        u, v = uv[loop.index].uv
        row = min(1023, max(0, int(v * 1024)))
        col = min(1023, max(0, int(u * 1024)))
        wrinkle_uv[row, col] = max(wrinkle_uv[row, col], strength)
        beard_uv[row, col] = max(beard_uv[row, col], beard[index])
for vertex, xyz in zip(body.data.vertices, points):
    vertex.co = inverse @ Vector(xyz)
body.data.update()

color = next(img for img in bpy.data.images if 'elder-color' in img.name)
pixels = np.empty(1024 * 1024 * 4, dtype=np.float32)
color.pixels.foreach_get(pixels)
pixels = pixels.reshape(1024, 1024, 4)
rgb = pixels[:, :, :3].copy()
r, g, b = rgb.transpose(2, 0, 1)
skin = np.clip((r - b - .085) / .11, 0, 1) * np.clip((g - .22) / .24, 0, 1)
v, u = np.mgrid[0:1024, 0:1024] / 1024
neutral = np.clip((.083 - np.maximum(r - g, g - b)) / .07, 0, 1)
brow = np.maximum(gaussian(u, .638, .023) * gaussian(v, .169, .010),
                  gaussian(u, .691, .023) * gaussian(v, .177, .010))
iris = np.maximum(gaussian(u, .642, .0054) * gaussian(v, .152, .0044),
                  gaussian(u, .690, .0054) * gaussian(v, .163, .0044))
brow = np.maximum(brow, gaussian(u, .724, .014) * gaussian(v, .300, .025))
hair = neutral * np.clip((r - .43) / .19, 0, 1)
rng = np.random.default_rng(26712)
grain = rng.normal(0, .006, skin.shape)
spot = np.maximum(0, rng.normal(0, 1, skin.shape) - 2.3)
for _ in range(2):
    wrinkle_uv = np.maximum.reduce([wrinkle_uv, np.roll(wrinkle_uv, 1, axis=0) * .75,
        np.roll(wrinkle_uv, -1, axis=0) * .75, np.roll(wrinkle_uv, 1, axis=1) * .75,
        np.roll(wrinkle_uv, -1, axis=1) * .75])
    beard_uv = np.maximum.reduce([beard_uv, np.roll(beard_uv, 1, axis=0) * .88,
        np.roll(beard_uv, -1, axis=0) * .88, np.roll(beard_uv, 1, axis=1) * .88,
        np.roll(beard_uv, -1, axis=1) * .88])
pixels[:, :, :3] = np.clip(
    rgb * (1 - skin[:, :, None] + skin[:, :, None] * np.array([.66, .57, .53]))
    * (1 - wrinkle_uv[:, :, None])
    + (grain - .023 * spot)[:, :, None] * skin[:, :, None]
    - (hair * (.13 + .36 * np.clip(brow * 1.45, 0, 1)))[:, :, None]
    - (.057 * beard_uv * skin)[:, :, None]
    - (iris * .25)[:, :, None],
    0, 1)
atlas = bpy.data.images.new('Patient color atlas', width=1024, height=1024, alpha=False)
atlas.colorspace_settings.name = 'sRGB'
atlas.pixels.foreach_set(pixels.ravel())
atlas.update()
atlas.pack()
mat = body.data.materials[0]
mat.name = 'Patient skin, hair and clothing'
for node in mat.node_tree.nodes:
    if node.type == 'TEX_IMAGE' and node.image == color:
        node.image = atlas

# Joint centers follow the already relaxed fingers of the scan in bind space.
digits = {
    'Thumb': [(.473,-.056,.938),(.460,-.085,.911),(.457,-.097,.886),(.456,-.099,.855)],
    'Index': [(.506,-.070,.892),(.508,-.085,.855),(.500,-.092,.830),(.486,-.092,.807)],
    'Middle': [(.517,-.052,.886),(.524,-.062,.849),(.512,-.070,.820),(.491,-.070,.791)],
    'Ring': [(.523,-.033,.884),(.529,-.039,.851),(.517,-.049,.823),(.499,-.052,.798)],
    'Pinky': [(.520,-.011,.891),(.521,-.014,.862),(.509,-.022,.838),(.494,-.026,.814)],
}
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
chains = {}
for side, sign in (('Left', 1), ('Right', -1)):
    for digit, landmarks in digits.items():
        coords = np.array(landmarks) * [sign, 1, 1]
        coords[:, 1] += .0012 if sign < 0 else 0
        parent = rig.data.edit_bones[side + 'Hand']
        for index, (start, end) in enumerate(zip(coords, coords[1:]), 1):
            name = f'{side}{digit}{index}'
            bone = rig.data.edit_bones.new(name)
            bone.head = rig.matrix_world.inverted() @ Vector(start)
            bone.tail = rig.matrix_world.inverted() @ Vector(end)
            bone.parent = parent
            bone.use_connect = index > 1
            parent = bone
        chains[side, digit] = coords
bpy.ops.object.mode_set(mode='OBJECT')

for side in ('Left', 'Right'):
    palm = body.vertex_groups[side + 'Hand']
    hand = [(vertex.index, weight.weight) for vertex in body.data.vertices
            for weight in vertex.groups if weight.group == palm.index]
    indexes, original = zip(*hand)
    coords = points[list(indexes)]
    groups = {}
    scores, progress, along = [], [], []
    for digit in digits:
        joints = chains[side, digit]
        distances, proportions = [], []
        for index, (start, end) in enumerate(zip(joints, joints[1:]), 1):
            groups[digit, index] = body.vertex_groups.new(name=f'{side}{digit}{index}')
            direction = end - start
            at = (coords-start) @ direction / (direction @ direction)
            nearest = start + np.clip(at, 0, 1)[:, None] * direction
            distances.append(np.sum((coords-nearest) ** 2, axis=1))
            proportions.append(index - 1 + np.clip(at, 0, 1))
        candidates = np.array(distances)
        best = candidates.argmin(axis=0)
        scores.append(candidates.min(axis=0))
        progress.append(np.take_along_axis(np.array(proportions), best[None], axis=0)[0])
        along.append(((coords-joints[0]) @ (joints[1]-joints[0])) / np.linalg.norm(joints[1]-joints[0]))
    winner = np.argmin(scores, axis=0)
    for row, (index, weight) in enumerate(hand):
        k = winner[row]
        digit = tuple(digits)[k]
        transfer = min(1, max(0, (along[k][row]+.008) / .024))
        transfer = transfer * transfer * (3 - 2 * transfer)
        if transfer < .002 or scores[k][row] > .00052:
            continue
        remainder = weight * (1-transfer)
        if remainder > .0001:
            palm.add([index], remainder, 'REPLACE')
        else:
            palm.remove([index])
        position = min(2, max(0, progress[k][row]-.52))
        low = int(position)
        fraction = position-low
        for j, amount in ((low+1, 1-fraction), (low+2, fraction)):
            if amount > .0001:
                groups[digit, j].add([index], weight * transfer * amount, 'REPLACE')

# Export a lighter mesh while keeping the editable high-resolution mesh in the blend.
editable_mesh = body.data.copy()
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = body
decimate = body.modifiers.new('Web mesh reduction', 'DECIMATE')
decimate.ratio = .34
decimate.use_collapse_triangulate = True
bpy.ops.object.modifier_move_up(modifier=decimate.name)
bpy.ops.object.modifier_apply(modifier=decimate.name)
for vertex in body.data.vertices:
    weights = sorted(((w.group, w.weight) for w in vertex.groups if w.weight > 1e-6),
                     key=lambda pair: pair[1], reverse=True)
    total = sum(weight for _, weight in weights[:4])
    for group, _ in weights[4:]:
        body.vertex_groups[group].remove([vertex.index])
    for group, weight in weights[:4]:
        body.vertex_groups[group].add([vertex.index], weight / total, 'REPLACE')
rig.data.pose_position = 'POSE'
bpy.ops.export_scene.gltf(filepath=str(output/'elderly_patient.glb'),
    export_format='GLB', use_selection=True, export_animations=True,
    export_image_format='WEBP', export_image_quality=93,
    export_meshopt_compression_enable=True, export_meshopt_extension='EXT_meshopt_compression',
    export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=True)
body.data = editable_mesh

def point(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def light(name, xyz, energy, size, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = xyz
    point(obj, (0, 0, 1.20))

rig.data.pose_position = 'REST'
camera = bpy.data.objects.new('Full body camera', bpy.data.cameras.new('Full body camera'))
scene.collection.objects.link(camera)
camera.location = (1.54, -5.35, 1.92)
point(camera, (0, 0, .93))
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.02
scene.camera = camera
light('Key', (1.8,-3,3.1), 270, 2.1, (1,.91,.83))
light('Fill', (-2,-1,1.9), 130, 2.5, (.80,.90,1))
light('Rim', (.3,2,2.7), 330, 1.7, (1,.95,.88))
scene.world = bpy.data.worlds.new('Studio ambient')
scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs[1].default_value = .25
bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.name = 'Studio floor'
mat = bpy.data.materials.new('Studio slate')
mat.use_nodes = True
mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (.095,.133,.17,1)
floor.data.materials.append(mat)
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 900
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.filepath = '//elderly_patient_cycles.png'
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(output/'elderly_patient.blend'), compress=True)
bpy.ops.render.render(write_still=True)
camera.location = (.32,-2.1,1.77)
point(camera, (0,0,1.63))
camera.data.ortho_scale = .39
scene.render.resolution_x = 760
scene.render.resolution_y = 760
scene.render.filepath = '//elderly_patient_face_cycles.png'
bpy.ops.render.render(write_still=True)
