import bpy, math, random
from mathutils import Vector
def mat(name, color, rough=.7, metal=0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    return m
def box(name, loc, size, material, bevel=.015, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o=bpy.context.object
    o.name=name
    o.dimensions=size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    if bevel:
        mod=o.modifiers.new('Construction edge bevel','BEVEL')
        mod.width=bevel; mod.segments=2
        mod=o.modifiers.new('Weighted planar normals','WEIGHTED_NORMAL')
    if parent:
        o.parent=parent
        o.matrix_parent_inverse=parent.matrix_world.inverted()
    return o
def aim(o, point):
    o.rotation_euler=(Vector(point)-o.location).to_track_quat('-Z','Y').to_euler()

scene=bpy.context.scene
scene.unit_settings.system='METRIC'
stone=mat('Limestone',(.64,.60,.51))
plaster=mat('Warm mineral plaster',(.82,.80,.73))
dark=mat('Anodized bronze',(.055,.065,.062),.3,.75)
glass=mat('Solar glazing',(.16,.23,.25),.17,.35)
wood=mat('Thermowood oak',(.28,.14,.065),.55)
ground=mat('Garden lawn',(.16,.22,.085),.95)
asphalt=mat('Asphalt',(.10,.115,.12),.95)
paving=mat('Sandstone paving',(.60,.58,.51),.9)
box('ENV_terrain',(0,0,-.15),(90,90,.3),ground,0)
box('ENV_road',(0,-14,-.025),(90,6,.05),asphalt,0)
box('ENV_driveway',(-4.5,-8,.08),(5.5,7,.16),paving)
box('ENV_level_approach',(1.4,-8,.09),(2.4,7,.18),paving)
box('HERO_floor',(0,0,.08),(14,9,.20),stone)
# Actual hollow shell: no solid block behind door/windows.
box('HERO_rear_wall',(0,4.35,1.65),(14,.3,3),plaster)
box('HERO_left_wall',(-6.85,0,1.65),(.3,9,3),stone)
box('HERO_right_wall',(6.85,0,1.65),(.3,9,3),plaster)
box('HERO_facade_garage',(-4.5,-4.4,1.5),(4.7,.18,2.65),wood)
box('HERO_facade_pier',(-1.2,-4.35,1.65),(1.9,.3,3),stone)
box('HERO_entry_jamb_left',(.4,-4.35,1.5),(.5,.3,2.65),stone)
box('HERO_entry_jamb_right',(2.4,-4.35,1.5),(.5,.3,2.65),stone)
box('HERO_entry_lintel',(1.4,-4.35,2.95),(2.5,.3,.4),stone)
box('HERO_glazing_ground',(4.65,-4.35,1.65),(3.8,.06,2.9),glass)
box('HERO_roof_ground',(0,0,3.2),(14.6,9.6,.28),plaster)
# Upper shell with a deeply recessed glazed elevation.
box('HERO_upper_rear',(-1.8,3.7,4.75),(9.3,.25,2.8),plaster)
box('HERO_upper_left',(-6.33,.2,4.75),(.25,7.2,2.8),plaster)
box('HERO_upper_right',(2.73,.2,4.75),(.25,7.2,2.8),plaster)
box('HERO_upper_glazing',(-1.8,-3.15,4.75),(8.9,.08,2.7),glass)
box('HERO_upper_roof',(-1.8,.2,6.27),(9.8,7.7,.25),plaster)
box('HERO_entry_canopy',(1.4,-5.05,2.9),(3.1,1.5,.13),dark)
hinge=bpy.data.objects.new('EntranceDoor_Hinge',None)
scene.collection.objects.link(hinge); hinge.location=(.75,-4.30,.18)
hinge['opening_width_m']=1.3
hinge['opening_height_m']=2.55
hinge['animation_axis']='local Z in Blender; local Y after glTF export'
bpy.context.view_layer.update()
box('EntranceDoor_Leaf',(1.4,-4.30,1.455),(1.3,.085,2.55),wood,.01,hinge)
anchor=bpy.data.objects.new('InteriorAnchor',None); scene.collection.objects.link(anchor)
anchor.location=(1.4,-3.3,.18)
anchor['purpose']='Future interior attachment; exterior only at this revision'
# Daylight working rig and delivery camera.
world=bpy.data.worlds.new('Daylight sky'); scene.world=world; world.use_nodes=True
world.node_tree.nodes.get('Background').inputs[0].default_value=(.66,.76,.88,1)
world.node_tree.nodes.get('Background').inputs[1].default_value=.5
bpy.ops.object.light_add(type='SUN',location=(-10,-10,14))
key=bpy.context.object; key.name='LGT_key'; key.data.energy=2.5; key.data.angle=math.radians(8); aim(key,(0,0,0))
bpy.ops.object.light_add(type='POINT',location=(8,-8,10))
fill=bpy.context.object; fill.name='LGT_fill'; fill.data.energy=850; fill.data.shadow_soft_size=8
bpy.ops.object.camera_add(location=(20,-28,13))
camera=bpy.context.object; camera.name='CAM_main'; camera.data.lens=42; aim(camera,(0,-1,2))
scene.camera=camera; scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=960; scene.render.resolution_y=640; scene.render.resolution_percentage=100
target=artifacts.file(name='house-blockout.png',media_type='image/png')
scene.render.filepath=str(target.path)
scene.render.image_settings.media_type='IMAGE'; scene.render.image_settings.file_format='PNG'
bpy.ops.render.render(write_still=True); target.publish()
result={'house_m':[14,9,6.4],'door_m':[1.3,2.55],'objects':len(scene.objects)}
