import bpy, json, pathlib, sys, math
from mathutils import Vector
repo, out = map(pathlib.Path, sys.argv[sys.argv.index('--')+1:])
assets = repo/'frontend/public/assets/house'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(assets/'companion.glb'))
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
for o in bpy.context.scene.objects:
    if o.animation_data:
        o.animation_data_clear()
for bone in rig.pose.bones:
    bone.matrix_basis.identity()
bpy.context.view_layer.update()
hip = rig.matrix_world @ rig.pose.bones['Hips'].head
bpy.ops.import_scene.gltf(filepath=str(assets/'journey-sedan.glb'))
car = bpy.data.objects['TravelCar']
car.location = (0,0,.012)
door = bpy.data.objects['TravelDoor']
door.rotation_mode = 'XYZ'
for frame, angle in [(1,0),(24,-1.04),(124,-1.04),(148,0)]:
    door.rotation_euler.z = angle
    door.keyframe_insert(data_path='rotation_euler', frame=frame)
# Sedan coordinates in metres, with X forward and negative Z on the driver side.
# Each foot independently steps around the rear edge of the aperture, then over the sill.
paths = {
    'Pelvis': [(0,-.54,.98,-1.31),(18,-.28,.93,-1.32),(36,-.04,.82,-1.17),(50,.12,.71,-.84),(58,.14,.69,-.65),(80,.13,.68,-.49),(100,.13,.70,-.40)],
    'Left ankle': [(0,-.54,.115,-1.43),(12,-.34,.19,-1.45),(24,-.06,.115,-1.41),(67,-.06,.115,-1.41),(78,.23,.45,-1.10),(89,.47,.58,-.80),(100,.57,.44,-.53)],
    'Right ankle': [(0,-.54,.115,-1.19),(22,-.54,.115,-1.19),(31,-.28,.21,-1.20),(42,.10,.115,-1.14),(52,.10,.115,-1.14),(63,.28,.58,-.90),(73,.48,.54,-.55),(82,.58,.44,-.29),(100,.58,.44,-.29)]
}
controls = {}
for name, keys in paths.items():
    obj = bpy.data.objects.new(name+' control',None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_size = .055
    for frame,x,y,z in keys:
        obj.location = (x,-z,y)
        obj.keyframe_insert(data_path='location',frame=24+frame)
    for slot in obj.animation_data.action.layers[0].strips[0].channelbags:
        for fc in slot.fcurves:
            for k in fc.keyframe_points:
                k.handle_left_type = k.handle_right_type = 'AUTO_CLAMPED'
    controls[name]=obj
pivot=bpy.data.objects.new('Driver heading',None)
bpy.context.collection.objects.link(pivot)
rig.parent=pivot
rig.location-=hip
pivot.constraints.new('COPY_LOCATION').target=controls['Pelvis']
for f,yaw in [(0,2.05),(22,2.38),(42,2.75),(60,2.85),(85,1.75),(100,math.pi/2)]:
    pivot.rotation_euler.z=yaw
    pivot.keyframe_insert(data_path='rotation_euler',frame=24+f)
for side in ('Left','Right'):
    ik=rig.pose.bones[side+'Leg'].constraints.new('IK')
    ik.target=controls[side+' ankle']
    ik.chain_count=2
    ik.use_stretch=False
# Grip the exterior handle during the opening stroke and the interior pull while closing.
inside = bpy.data.objects.new('InteriorPull', None)
bpy.context.collection.objects.link(inside)
inside.parent = door
inside.location = (-.36,-.105,-.095)
inside.empty_display_size = .035
for side, target, keys in [
        ('Right', bpy.data.objects['Handle'], [(1,1),(26,1),(46,0),(148,0)]),
        ('Left', inside, [(1,0),(84,0),(116,1),(148,1)])]:
    grip = rig.pose.bones[side+'ForeArm'].constraints.new('IK')
    grip.target = target
    grip.chain_count = 2
    grip.use_stretch = False
    for frame, influence in keys:
        grip.influence = influence
        grip.keyframe_insert(data_path='influence', frame=frame)
scene=bpy.context.scene
scene.frame_end=148
rows=[]
for f in range(101):
    scene.frame_set(24+f)
    row=[]
    for obj in controls.values():
        x,y,z=obj.location
        row.extend(round(v,5) for v in (x,z,-y))
    rows.append(row)
(out/'cabinTargets.json').write_text('[\n'+',\n'.join(json.dumps(row) for row in rows)+'\n]\n')
scene.frame_set(74)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'driver-entry.blend'))
