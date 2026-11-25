"""Import the CC0 Grab3D man rig and export the Blender-authored laptop."""
import sys
from pathlib import Path
import bpy

assets = Path(__file__).resolve().parents[2] / 'public/assets/house'
source = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
assert any(obj.type == 'ARMATURE' for obj in bpy.context.scene.objects)
bpy.ops.export_scene.gltf(filepath=str(assets / 'patient.glb'), export_format='GLB')

bpy.ops.wm.read_factory_settings(use_empty=True)
def material(name, color, metallic, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

shell = material('Anodized graphite', (.13,.15,.17), .72, .36)
keys = material('Matte keys', (.027,.031,.037), .05, .68)
display = material('Unlit display glass', (.01,.014,.019), .18, .31)
def part(name, center, size, mat, bevel=.002, parent=None):
    x,y,z = center
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x,-z,y))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    b = obj.modifiers.new('Rounded manufacturing edges', 'BEVEL')
    b.width = bevel
    b.segments = 2
    if parent:
        obj.parent = parent
    return obj

# +X faces the seated user, and Hinge rotates about the glTF +Z axis.
part('Laptop base', (.118,.009,0),(.236,.018,.333),shell)
part('Trackpad', (.184,.0182,0),(.061,.001,.109),shell,.0003)
for row in range(5):
    for col in range(15):
        part('Key', (.044+row*.018,.019,(col-7)*.019),(.015,.002,.016),keys,.0005)
hinge = bpy.data.objects.new('LaptopHinge', None)
bpy.context.collection.objects.link(hinge)
hinge.location.z = .022
part('Display lid', (.112,.005,0),(.224,.01,.333),shell,parent=hinge)
part('Display glass', (.112,-.0006,0),(.203,.001,.312),display,.0004,hinge)
bpy.ops.export_scene.gltf(filepath=str(assets / 'patient-laptop.glb'), export_format='GLB')
