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

import numpy as np
random.seed(42)
scene=bpy.context.scene
stone=bpy.data.materials['Limestone']; plaster=bpy.data.materials['Warm mineral plaster']
dark=bpy.data.materials['Anodized bronze']; glass=bpy.data.materials['Solar glazing']
wood=bpy.data.materials['Thermowood oak']; lawn=bpy.data.materials['Garden lawn']
paving=bpy.data.materials['Sandstone paving']; asphalt=bpy.data.materials['Asphalt']
# Small packed, tileable color maps survive GLB export (no procedural-only shaders).
def texture(m, mode, scale):
    n=256; rng=np.random.default_rng(25); yy,xx=np.mgrid[0:n,0:n]
    noise=rng.normal(0,1,(n,n))
    if mode=='wood':
        signal=.055*np.sin(xx*.34+2*np.sin(yy*.024))+.026*np.sin(xx*1.7)+noise*.012
        base=np.array([.43,.28,.16])
    elif mode=='stone':
        signal=noise*.024+.018*np.sin(xx*.09+yy*.045)
        base=np.array([.70,.67,.59])
    elif mode=='grass':
        signal=noise*.04+.026*np.sin(xx*.07)*np.cos(yy*.11)
        base=np.array([.29,.37,.18])
    elif mode=='asphalt':
        signal=noise*.025; base=np.array([.22,.235,.24])
    else:
        signal=noise*.009; base=np.array([.84,.82,.76])
    rgba=np.ones((n,n,4),dtype=np.float32)
    rgba[:,:,:3]=np.clip(base[None,None,:]+signal[:,:,None],0,1)
    im=bpy.data.images.new('Packed_'+mode,width=n,height=n)
    im.pixels.foreach_set(rgba.ravel()); im.pack()
    nodes=m.node_tree.nodes; p=nodes.get('Principled BSDF')
    tex=nodes.new('ShaderNodeTexImage'); tex.image=im; tex.extension='REPEAT'
    m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
    m['uv_metres_per_tile']=scale
for m,mode,s in [(wood,'wood',1),(stone,'stone',1.5),(paving,'stone',1.5),(plaster,'plaster',2),(lawn,'grass',2),(asphalt,'asphalt',1.5)]:
    texture(m,mode,s)
bronze=mat('Satin brass hardware',(.43,.32,.16),.27,.8)
soil=mat('Mulch',(.065,.047,.027),1)
bark=mat('Olive bark',(.21,.18,.12),.95)
foliage=[mat('Olive leaf '+str(i),c,.85) for i,c in enumerate([(.13,.20,.075),(.22,.29,.12),(.31,.36,.18)])]
for m in foliage: m.use_backface_culling=False
# Ramp profile: street level to 180mm landing over 5.5m, uninterrupted 2.4m path.
def ramp(name,x,width):
    old=bpy.data.objects.get(name)
    if old: bpy.data.objects.remove(old,do_unlink=True)
    y0=-11.5; y1=-6; y2=-4.5
    verts=[(x-width/2,y0,0),(x+width/2,y0,0),(x-width/2,y1,.18),(x+width/2,y1,.18),(x-width/2,y2,.18),(x+width/2,y2,.18),
           (x-width/2,y0,-.03),(x+width/2,y0,-.03),(x-width/2,y2,-.03),(x+width/2,y2,-.03)]
    faces=[(0,1,3,2),(2,3,5,4),(6,0,2,4,8),(1,7,9,5,3),(4,5,9,8),(6,8,9,7),(0,6,7,1)]
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); scene.collection.objects.link(o); me.materials.append(paving)
    return o
ramp('ENV_level_approach',1.4,2.4)
ramp('ENV_driveway',-4.5,5.5)
bpy.data.objects['ENV_road'].location.z=-.015 # road top .01 avoids coincident terrain
box('ENV_sidewalk',(0,-10.7,-.015),(50,1.6,.03),paving,0)
# Flush approach at road: sidewalk and crossings meet without a curb step.
mark=mat('Road paint',(.73,.73,.66),.9)
for x in range(-30,31,6): box('ENV_road_marking',(x,-14,.018),(2.8,.10,.008),mark,0)
# Split side wall around two real openings.
bpy.data.objects.remove(bpy.data.objects['HERO_right_wall'],do_unlink=True)
box('HERO_right_sill',(6.85,0,.41),(.3,9,.46),plaster)
box('HERO_right_header',(6.85,0,2.98),(.3,9,.34),plaster)
for y in [-4.15,.1,4.12]: box('HERO_right_pier',(6.85,y,1.7),(.3,.65,2.2),plaster)
for y in [-2,2.1]:
    box('HERO_side_glazing',(6.87,y,1.7),(.06,3.5,2.2),glass,0)
    for yy in [y-1.75,y,y+1.75]:
        box('DETAIL_side_mullion',(6.93,yy,1.7),(.12,.055,2.24),dark,.006)
    for z in [.6,2.8]: box('DETAIL_side_frame',(6.93,y,z),(.12,3.6,.055),dark,.005)
# Recessed glazing with thin frames and sills.
for prefix,x,y,z,w,h,count in [('ground',4.65,-4.39,1.65,3.8,2.9,3),('upper',-1.8,-3.22,4.75,8.9,2.7,5)]:
    for i in range(count+1):
        box('DETAIL_'+prefix+'_mullion',(x-w/2+i*w/count,y,z),(.055,.12,h),dark,.005)
    for zz in [z-h/2,z+h/2]:
        box('DETAIL_'+prefix+'_rail',(x,y,zz),(w+.08,.12,.065),dark,.005)
    box('DETAIL_'+prefix+'_sill',(x,y-.05,z-h/2-.055),(w+.2,.28,.07),stone,.01)
# Balcony terrace on the lower wing, open pergola casting natural slatted shadows.
for y in [-3.55,3.6]: box('DETAIL_pergola_column',(6.5,y,4.6),(.12,.12,2.5),dark,.01)
for x in [2.95,6.5]: box('DETAIL_pergola_beam',(x,0,5.88),(.12,7.4,.16),dark,.01)
for i in range(19):
    box('DETAIL_pergola_slat',(4.72,-3.6+i*.4,5.98),(3.7,.09,.12),wood,.008)
# Fine vertical timber fins on upper left and garage face; no fake image facade.
for i in range(35):
    box('DETAIL_garage_batten',(-6.77+i*.134,-4.51,1.5),(.105,.065,2.58),wood,.006)
for i in range(18):
    box('DETAIL_upper_screen',(-6.19+i*.11,-3.45,4.75),(.055,.15,2.68),wood,.005)
# Limestone horizontal courses at entrance pier.
for i in range(11):
    box('DETAIL_stone_course',(-1.2,-4.515,.30+i*.265),(1.88,.04,.245),stone,.005)
# Door child hardware remains attached to the actual hinge.
hinge=bpy.data.objects['EntranceDoor_Hinge']
for i in range(10):
    box('EntranceDoor_Batten',(.81+i*.13,-4.355,1.455),(.115,.025,2.50),wood,.004,hinge)
box('EntranceDoor_Handle',(1.91,-4.44,1.25),(.035,.055,.44),bronze,.012,hinge)
for z in [1.05,1.45]:
    box('EntranceDoor_HandleMount',(1.91,-4.39,z),(.045,.085,.035),bronze,.004,hinge)
box('EntranceDoor_Kickplate',(1.4,-4.365,.28),(1.24,.012,.16),bronze,.003,hinge)
for x in [.69,2.11]: box('DETAIL_entry_frame',(x,-4.37,1.46),(.055,.14,2.62),dark,.005)
box('DETAIL_entry_frame',(1.4,-4.37,2.77),(1.48,.14,.055),dark,.005)
# Framed narrow sidelight adjacent to entry; nameplate and sconces.
box('DETAIL_entry_sidelight',(2.53,-4.54,1.5),(.22,.025,2.3),glass,.005)
emissive=mat('Warm lamp diffuser',(.9,.72,.4),.5)
p=emissive.node_tree.nodes.get('Principled BSDF')
p.inputs['Emission Color'].default_value=(1,.72,.36,1); p.inputs['Emission Strength'].default_value=.5
for x in [-.65,2.55]:
    box('DETAIL_entry_sconce',(x,-4.6,2.18),(.12,.13,.30),dark,.02)
    box('DETAIL_entry_diffuser',(x,-4.675,2.18),(.065,.015,.21),emissive,.005)
bpy.ops.object.text_add(location=(-1.25,-4.558,1.8),rotation=(math.pi/2,0,0))
o=bpy.context.object; o.name='DETAIL_house_number'; o.data.body='08'; o.data.size=.19; o.data.extrude=.003; o.data.materials.append(bronze)
bpy.ops.object.convert(target='MESH')
# Planted borders and low limestone retaining edging, outside the clear approach.
for x,y,w,d in [(4.9,-7.8,4.6,4.6),(-.9,-7.6,1.6,4.2),(-8.2,-1,1.7,13),(8.4,0,2,12)]:
    box('ENV_planting_bed',(x,y,.025),(w,d,.05),soil,.04)
    for xx in [x-w/2,x+w/2]:
        box('DETAIL_garden_edging',(xx,y,.075),(.08,d,.15),stone,.01)
# Paver expansion joints: follow the approach grade, not stairs.
joint=mat('Paver joints',(.30,.29,.25),1)
for y in [-11,-10,-9,-8,-7,-6,-5]:
    z=.18*min(1,max(0,(y+11.5)/5.5))
    box('DETAIL_path_joint',(1.4,y,z+.002),(2.38,.012,.004),joint,0)
    box('DETAIL_drive_joint',(-4.5,y,z+.002),(5.48,.012,.004),joint,0)
# Vegetation mesh builder: tapered trunks/branches and thousands of individual
# folded lanceolate leaves, consolidated by material instead of object-per-leaf.
leafverts=[[],[],[]]; leaffaces=[[],[],[]]
def leaf(center,length,width,angle,tilt,mi):
    c=Vector(center); axis=Vector((math.cos(angle)*math.cos(tilt),math.sin(angle)*math.cos(tilt),math.sin(tilt)))
    side=Vector((-math.sin(angle),math.cos(angle),0))*width
    v=leafverts[mi]; f=leaffaces[mi]; k=len(v)
    v.extend([tuple(c-axis*length*.5),tuple(c+side),tuple(c+axis*length*.5),tuple(c-side),tuple(c+Vector((0,0,width*.28)))])
    f.extend([(k,k+1,k+4),(k+1,k+2,k+4),(k+2,k+3,k+4),(k+3,k,k+4)])
def branch(name,a,b,r1,r2):
    direction=Vector(b)-Vector(a)
    bpy.ops.mesh.primitive_cone_add(vertices=9,radius1=r1,radius2=r2,depth=direction.length,location=(Vector(a)+Vector(b))/2)
    o=bpy.context.object; o.name=name; o.rotation_euler=direction.to_track_quat('Z','Y').to_euler(); o.data.materials.append(bark)
    for poly in o.data.polygons: poly.use_smooth=True
def tree(x,y,height,seed):
    rr=random.Random(seed)
    branch('GARDEN_olive_trunk',(x,y,0),(x+.16,y,height*.7),.14,.065)
    for j in range(13):
        angle=j*2.4; radius=rr.uniform(.65,1.55)
        end=(x+math.cos(angle)*radius,y+math.sin(angle)*radius,height*rr.uniform(.65,1))
        start=(x+.1,y,height*rr.uniform(.4,.65))
        branch('GARDEN_olive_branch',start,end,.045,.008)
        for k in range(150):
            # Irregular canopy with open negative space and small true leaves.
            az=rr.random()*math.tau; r=rr.random()**.5
            center=(end[0]+math.cos(az)*r*.85,end[1]+math.sin(az)*r*.85,end[2]+rr.uniform(-.55,.55))
            leaf(center,rr.uniform(.12,.23),rr.uniform(.022,.04),rr.random()*math.tau,rr.uniform(-.7,.8),rr.randrange(3))
for args in [(-8.7,-3,4.8,12),(8.7,-.5,5.4,24),(-7.7,6.8,5.6,34),(8,7,5.2,44)]: tree(*args)
# Shrubs: loose rosemary/olive mounds; no spheres or billboard foliage.
for x,y in [(3.4,-9),(5.4,-9),(6.5,-6.2),(-.85,-6.5),(-.85,-8.4),(7.9,3)]:
    for j in range(9):
        a=random.random()*math.tau
        end=(x+math.cos(a)*.35,y+math.sin(a)*.35,random.uniform(.45,.8))
        branch('GARDEN_shrub_branch',(x,y,.02),end,.012,.003)
        for k in range(32):
            t=random.random()
            center=(x+(end[0]-x)*t+random.uniform(-.18,.18),y+(end[1]-y)*t+random.uniform(-.18,.18),end[2]*t+.05)
            leaf(center,.14,.022,random.random()*math.tau,random.uniform(-.3,1),random.randrange(3))
# Ornamental grasses, curved tapered blade strips.
gv=[]; gf=[]
for x,y in [(4,-6.3),(5.1,-7.1),(6.5,-9.3),(3.2,-7.8),(-.8,-10),(8.2,-5)]:
    for j in range(70):
        a=random.random()*math.tau; h=random.uniform(.35,.8); r=random.random()*.3
        bx=x+math.cos(a)*r; by=y+math.sin(a)*r; k=len(gv)
        for t in [0,.35,.7,1]:
            bend=t*t*.32
            cx=bx+math.cos(a)*bend; cy=by+math.sin(a)*bend
            w=.013*(1-t)+.001
            gv.extend([(cx-math.sin(a)*w,cy+math.cos(a)*w,t*h),(cx+math.sin(a)*w,cy-math.cos(a)*w,t*h)])
        gf.extend([(k+i,k+i+1,k+i+3,k+i+2) for i in [0,2,4]])
def meshpart(name,verts,faces,material):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); scene.collection.objects.link(o); me.materials.append(material)
    return o
for i in range(3): meshpart('GARDEN_leaf_clusters_'+str(i),leafverts[i],leaffaces[i],foliage[i])
meshpart('GARDEN_ornamental_grass',gv,gf,foliage[1])
# UVs measured in metres; portable packed materials, no missing external textures.
for o in list(scene.objects):
    if o.type!='MESH' or not o.data.materials: continue
    material=o.data.materials[0]
    scale=material.get('uv_metres_per_tile')
    if scale:
        uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
        for poly in o.data.polygons:
            normal=poly.normal; axis=max(range(3),key=lambda i:abs(normal[i]))
            axes=[i for i in range(3) if i!=axis]
            for li in poly.loop_indices:
                co=o.data.vertices[o.data.loops[li].vertex_index].co
                uv.data[li].uv=(co[axes[0]]/scale,co[axes[1]]/scale)
# Apply edge modifiers then consolidate static detail by material and semantic role.
# Door children and the shell are intentionally kept independently addressable.
groups={}
for o in list(scene.objects):
    if o.type!='MESH' or o.parent: continue
    if o.name.startswith(('DETAIL_','GARDEN_')):
        key=('GARDEN' if o.name.startswith('GARDEN_') else 'DETAIL',o.data.materials[0].name)
        groups.setdefault(key,[]).append(o)
for (role,mname),objects in groups.items():
    for o in objects:
        bpy.context.view_layer.objects.active=o
        for mod in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    objects[0].name=role+'_'+mname.replace(' ','_')
scene.eevee.taa_render_samples=16
scene.render.resolution_x=800; scene.render.resolution_y=560
scene.camera.location=(18,-25,10); aim(scene.camera,(0,-1,2))
result={'objects':len(scene.objects),'meshes':len([o for o in scene.objects if o.type=='MESH']),'triangles_estimate':sum(len(p.vertices)-2 for o in scene.objects if o.type=='MESH' for p in o.data.polygons),'door_children':len(hinge.children),'path_width_m':2.4,'path_rise_m':.18,'path_run_m':5.5}
