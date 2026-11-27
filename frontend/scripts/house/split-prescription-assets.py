"""Split the Hosted 3D Jutsu GLB into independently loadable story props."""
import sys
from pathlib import Path
import bpy

source = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
assets = Path(__file__).resolve().parents[2] / 'public/assets/house'
for name, filename in [('DemoPrinter', 'demo-printer.glb'), ('DemoPrescriptionPaper', 'demo-prescription-paper.glb')]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    root = bpy.data.objects[name]
    parts = list(root.children_recursive)
    keep = {root, *parts}
    for obj in list(bpy.context.scene.objects):
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    root.location = (0, 0, 0)
    for material in {obj.data.materials[0] for obj in parts if obj.type == 'MESH'}:
        bpy.ops.object.select_all(action='DESELECT')
        meshes = [obj for obj in parts if obj.type == 'MESH' and obj.data.materials[0] == material]
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        if len(meshes) > 1:
            # Joining invalidates Blender references. Keep the active mesh.
            parts = [obj for obj in parts if obj not in meshes[1:]]
            bpy.ops.object.join()
    bpy.ops.export_scene.gltf(filepath=str(assets / filename), export_format='GLB')
