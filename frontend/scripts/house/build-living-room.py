"""Run with Blender --background --python build-living-room.py."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
out = Path(__file__).resolve().parents[2] / "public/assets/house/living-room.glb"
def mat(name, color, rough=.75):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    return m

oak = [mat('Oak %s' % i, (.34+i*.014,.20+i*.01,.105+i*.006), .48) for i in range(5)]
walnut = mat('Oiled walnut', (.24,.115,.049), .37)
linen = mat('Oatmeal linen', (.65,.57,.45))
sage = mat('Sage upholstery', (.22,.31,.235))
rug = mat('Woven jute', (.44,.36,.26))
plaster = mat('Ivory plaster', (.83,.796,.72))
trim = mat('Graphite', (.057,.067,.061))
glass = mat('Soft daylight glazing', (.56,.73,.8), .26)
p = glass.node_tree.nodes.get('Principled BSDF')
p.inputs['Emission Color'].default_value = (.48,.65,.77,1)
p.inputs['Emission Strength'].default_value = .42
def point(p):
    x,y,z = p
    return (x,-z,y)

def box(name, pos, size, material, edge=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=point(pos))
    o=bpy.context.object
    o.name=name
    o.dimensions=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    if edge:
        b=o.modifiers.new('Soft edges','BEVEL'); b.width=edge; b.segments=3
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

# InteriorAnchor is (1.4, .18, 3.3) in glTF metres. Preserve a clear entry
# corridor along x=1.4; the finish floor starts behind the door swing.
for row in range(29):
    x=.035+row*.225
    for col in range(4):
        box('Oak floorboard',(x,.184,2.2-col*1.8),(.222,.008,1.797),oak[(row*7+col*3)%5],0)
box('Rear plaster lining',(3.5,1.64,-4.17),(6.7,2.9,.09),plaster)
box('Ceiling lining',(3.45,3.05,-.23),(6.7,.06,8.0),plaster)
box('Rear skirting',(3.5,.245,-4.10),(6.65,.13,.038),oak[2])
# Window liners sit just inside the two existing side openings.
for z in [-2.1,2]:
    box('Daylit side window',(6.805,1.7,z),(.012,2.17,3.46),glass,0)
    for dz in [-1.75,0,1.75]:
        box('Window mullion',(6.777,1.7,z+dz),(.055,2.24,.055),trim)
    for y in [.59,2.81]:
        box('Window reveal',(6.77,y,z),(.13,.061,3.55),trim)
box('Sofa plinth',(4.42,.39,-3.26),(3,.27,1.01),sage,.09)
box('Sofa back',(4.42,.93,-3.69),(3,.83,.26),sage,.10)
for x in [3.06,5.78]:
    box('Sofa arm',(x,.69,-3.24),(.24,.54,.98),sage,.095)
for x in [3.51,4.42,5.33]:
    box('Seat cushion',(x,.592,-3.14),(.87,.19,.73),linen,.075)
    c=box('Back cushion',(x,.96,-3.50),(.85,.55,.19),linen,.071)
    c.rotation_euler.x=.10
box('Area rug',(3.9,.199,-1.56),(3.83,.019,3.02),rug,.008)
for z in [-2.98,-.14]:
    box('Rug border',(3.9,.212,z),(3.75,.007,.028),linen,0)
box('Walnut tabletop',(2.65,.91,-1.25),(1.65,.078,.96),walnut,.028)
box('Table apron',(2.65,.819,-1.25),(1.45,.11,.76),walnut,.012)
for x in [1.99,3.31]:
    for z in [-1.61,-.89]:
        box('Table leg',(x,.502,z),(.081,.64,.081),walnut,.009)
# Chair sits at the far end of the table, clear of the camera approach.
box('Chair seat',(3.93,.54,-1.29),(.54,.099,.55),walnut,.038)
box('Chair seat pad',(3.93,.608,-1.29),(.50,.061,.50),linen,.028)
for x in [3.73,4.14]:
    for z in [-1.50,-1.08]:
        tall=x>4
        box('Chair upright',(x,.64 if tall else .36,z),(.06,.91 if tall else .34,.06),walnut,.01)
box('Chair backrest',(4.14,1.00,-1.29),(.085,.21,.51),walnut,.037)
chair = bpy.data.objects.new('PatientChair', None)
bpy.context.collection.objects.link(chair)
chair.location = point((3.93,.18,-1.29))
bpy.context.view_layer.update()
for part in [o for o in bpy.context.scene.objects if o.name.startswith('Chair ')]:
    world = part.matrix_world.copy()
    part.parent = chair
    part.matrix_world = world
# Ceramic vessel and turned side table supply close-range detail.
box('Side table',(6.05,.68,-2.66),(.57,.064,.52),walnut,.025)
for x in [5.85,6.25]:
    for z in [-2.85,-2.47]:
        box('Side table leg',(x,.431,z),(.053,.48,.053),walnut,.009)
ceramic=mat('Glazed ceramic',(.51,.61,.54),.23)
profile=[(0,0),(.085,0),(.105,.045),(.092,.12),(.045,.17),(.039,.225),(.03,.225),(.03,.17),(.071,.10),(.066,.03),(0,.023)]
v=[(r*math.cos(i*math.tau/32),r*math.sin(i*math.tau/32),h) for r,h in profile for i in range(32)]
f=[(j*32+i,j*32+(i+1)%32,(j+1)*32+(i+1)%32,(j+1)*32+i) for j in range(len(profile)-1) for i in range(32)]
mesh=bpy.data.meshes.new('Lathed ceramic')
mesh.from_pydata(v,[],f); mesh.update()
obj=bpy.data.objects.new('Ceramic vase',mesh); bpy.context.collection.objects.link(obj)
obj.location=point((2.95,.949,-1.49)); mesh.materials.append(ceramic)
for poly in mesh.polygons: poly.use_smooth=True

# Batch the static furniture and finishes by material to keep draw calls low.
for material in list(bpy.data.materials):
    batch=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent != chair and o.data.materials[0]==material]
    if not batch: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in batch:
        bpy.context.view_layer.objects.active=o
        for modifier in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=modifier.name)
        o.select_set(True)
    bpy.context.view_layer.objects.active=batch[0]
    if len(batch)>1: bpy.ops.object.join()
    batch[0].name='LivingRoom_'+material.name
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB')
