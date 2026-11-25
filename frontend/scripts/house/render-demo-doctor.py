"""Render the simulated doctor with local Blender from a CC0 rigged GLB."""
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

source, destination = map(Path, sys.argv[sys.argv.index('--') + 1:][:2])
destination.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
body = next(o for o in scene.objects if o.type == 'MESH')
rig.animation_data_clear()

def mat(name, color, rough=.7):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    return material

scrubs = mat('Mineral teal scrub top', (.045,.23,.22))
body.data.materials.append(scrubs)
cached = [body.matrix_world @ v.co for v in body.data.vertices]
for face in body.data.polygons:
    p = body.matrix_world @ face.center
    if 1.015 < p.z < 1.365 - .075 * max(0, 1 - abs(p.x) / .092) and abs(p.x) < .284:
        face.material_index = 1

# Subtle speech deformation restricted to the lower lip and chin.
body.shape_key_add(name='Basis')
speech = body.shape_key_add(name='Speech')
for i, p in enumerate(cached):
    if p.y < -.041 and 1.425 < p.z < 1.525 and abs(p.x) < .060:
        weight = math.exp(-((p.x-.006)/.035)**2-((p.z-1.469)/.031)**2)
        speech.data[i].co += body.matrix_world.to_3x3().inverted() @ Vector((0, -.001*weight, -.013*weight))

def box(name, center, size, material, bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('Soft edge', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 3
    return obj

wall = mat('Clinic wall', (.70,.77,.745))
trim = mat('Clinic trim', (.29,.45,.40))
oak = mat('Light oak', (.46,.31,.18))
white = mat('Porcelain', (.83,.86,.81))
dark = mat('Monitor charcoal', (.028,.055,.049))
paper = mat('Paper', (.81,.84,.79))
box('Back wall', (0,.85,1.45),(5,.10,3),wall)
box('Acoustic panel',(-.60,.785,1.48),(.65,.05,.66),trim,.035)
for x in [-.83,-.72,-.61,-.50,-.39]:
    box('Oak acoustic slat',(x,.745,1.48),(.018,.04,.54),oak,.003)
box('Shelf',(.69,.67,1.24),(.65,.22,.036),oak)
for i in range(5):
    box('Reference book',(.51+.066*i,.67,1.35),(.045,.14,.19-i*.008),[white,trim,oak][i%3],.004)
box('Desk', (0,-.46,1.035),(1.65,.57,.038),oak)
box('Notes pad',(-.19,-.52,1.058),(.15,.13,.009),paper,.004)
box('Pen',(-.19,-.56,1.066),(.102,.009,.008),dark,.003)
box('Doctor badge',(.091,-.103,1.251),(.071,.012,.035),white,.004)
bpy.ops.object.text_add(location=(.061,-.110,1.244), rotation=(math.pi/2,0,0))
badge = bpy.context.object
badge.name='Clinic badge lettering'
badge.data.body='DR. RAO'
badge.data.size=.012
badge.data.materials.append(dark)

def aim_object(obj, point):
    obj.rotation_euler = (Vector(point)-obj.location).to_track_quat('-Z', 'Y').to_euler()
def light(name, position, power, size, color):
    bpy.ops.object.light_add(type='AREA', location=position)
    obj = bpy.context.object
    obj.name = name
    obj.data.energy = power
    obj.data.shape = 'DISK'
    obj.data.size = size
    obj.data.color = color
    aim_object(obj,(0,0,1.33))
light('Window key',(-.9,-1.4,2.0),115,1.7,(.93,.98,1))
light('Warm room fill',(1.2,-.8,1.72),65,1.5,(1,.88,.76))
light('Hair separation',(.22,.54,2.05),38,.7,(.95,1,.96))
bpy.ops.object.camera_add(location=(.045,-2.12,1.48))
camera = bpy.context.object
camera.data.lens = 45
aim_object(camera,(0,-.04,1.335))
scene.camera = camera
scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.taa_render_samples = 12
scene.render.resolution_x=480
scene.render.resolution_y=270
scene.render.resolution_percentage=100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new('Clinic ambient')
scene.world.color = (.26,.26,.26)

def aim_bone(name, child, target):
    bone = rig.pose.bones[name]
    tip = rig.pose.bones[child]
    root = rig.matrix_world @ bone.head
    start = (rig.matrix_world @ tip.head - root).normalized()
    finish = (Vector(target) - root).normalized()
    rot = start.rotation_difference(finish)
    basis = rig.matrix_world.to_quaternion()
    bone.matrix = (basis.inverted() @ rot @ basis).to_matrix().to_4x4() @ bone.matrix
    bone.location = (0,0,0)
    bpy.context.view_layer.update()

def pulse(t, center, width):
    return math.exp(-((t-center)/width)**2)

for frame in range(36):
    t=frame/35
    scene.frame_set(frame+1)
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()
    bpy.context.view_layer.update()
    emphasis = pulse(t,.25,.095) + .73*pulse(t,.69,.12)
    nod = .52*pulse(t,.40,.055) + .66*pulse(t,.80,.069)
    head = rig.matrix_world @ rig.pose.bones['Head'].head
    aim_bone('Head','head_end', head + Vector((.017*math.sin(t*math.tau), -.029-.038*nod,.23)))
    for side, sign in [('Left',1),('Right',-1)]:
        gesture=emphasis if sign == -1 else .76*pulse(t,.56,.115)
        aim_bone(side+'Arm',side+'ForeArm',(sign*(.247+.022*gesture),-.042-.032*gesture,1.095+.018*gesture))
        aim_bone(side+'ForeArm',side+'Hand',(sign*(.156+.098*gesture),-.225-.045*gesture,1.10+.107*gesture))
    phrase = max(pulse(t,.21,.15), pulse(t,.67,.22))
    speech.value = phrase * (.23 + .77 * abs(math.sin(t*math.tau*8.7)))
    scene.render.filepath=str((destination / f'doctor-{frame:02d}.png').resolve())
    bpy.ops.render.render(write_still=True)
