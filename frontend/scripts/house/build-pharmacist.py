"""Convert the existing free CC0 Grab3D rig to a pharmacy uniform."""
import sys
from pathlib import Path
import bpy

source = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
output = Path(__file__).resolve().parents[2] / 'public/assets/house/pharmacist.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
rig = next(obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')
body = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH')
rig.animation_data_clear()
top = bpy.data.materials.new('Pharmacy sage uniform')
top.use_nodes = True
shader = top.node_tree.nodes.get('Principled BSDF')
shader.inputs['Base Color'].default_value = (.065, .37, .31, 1)
shader.inputs['Roughness'].default_value = .68
body.data.materials.append(top)
for face in body.data.polygons:
    point = body.matrix_world @ face.center
    if .98 < point.z < 1.367 - .075 * max(0, 1 - abs(point.x) / .092) and abs(point.x) < .280:
        face.material_index = 1
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_animations=False)
