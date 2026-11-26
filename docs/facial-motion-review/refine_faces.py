"""Refine both Kaizen Care faces, create expression keys, and export from Blender."""
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

arguments = list(map(Path, sys.argv[sys.argv.index("--") + 1:]))
repository, output = arguments[:2]
web_source = arguments[2] if len(arguments) > 2 else repository/'frontend/public/assets/house'
output.mkdir(parents=True, exist_ok=True)


def gaussian(value, center, width):
    return np.exp(-((value-center)/width)**2)


def texture_pixels(image, resolution):
    image.scale(resolution, resolution)
    pixels = np.empty(resolution*resolution*4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(resolution, resolution, 4)


def pack_texture(name, pixels, colorspace):
    height, width, _ = pixels.shape
    image = bpy.data.images.new(name, width, height, alpha=False)
    image.colorspace_settings.name = colorspace
    image.pixels.foreach_set(pixels.ravel())
    image.update()
    image.pack()
    return image


def paint_face(body, coords, elderly):
    resolution = 2048
    material = body.data.materials[0]
    nodes = material.node_tree.nodes
    base = next(link.from_node for link in material.node_tree.links
                if link.to_socket.name == 'Base Color' and link.from_node.type == 'TEX_IMAGE')
    normal = next((node for node in nodes if node.type == 'TEX_IMAGE'
                   and node.image and 'normal' in node.image.name.lower()), None)
    albedo = texture_pixels(base.image, resolution)
    skin = np.zeros((resolution,resolution), dtype=np.float32)
    projected = np.zeros((resolution,resolution,2), dtype=np.float32)
    lids = np.zeros((resolution,resolution), dtype=np.float32)
    uv_layer = body.data.uv_layers.active.data
    uv = np.empty(len(uv_layer)*2, dtype=np.float32)
    uv_layer.foreach_get('uv',uv)
    uv = uv.reshape(-1,2)*resolution
    loops = np.empty(len(body.data.loops), dtype=np.int32)
    body.data.loops.foreach_get('vertex_index',loops)
    x,y,z = coords.T
    face = (z>1.505)&(z<1.746)&(y<.032)&(abs(x)<.103)
    eyes = (z>1.640)&(z<1.679)&(y<-.044)&(abs(x)>.009)&(abs(x)<.059)
    indices = np.flatnonzero(face[loops])
    uv_pixels = np.clip(uv[indices].astype(int),0,resolution-1)
    skin[uv_pixels[:,1],uv_pixels[:,0]]=1
    for _ in range(6):
        skin = np.maximum.reduce([skin,np.roll(skin,1,0)*.94,np.roll(skin,-1,0)*.94,
                                  np.roll(skin,1,1)*.94,np.roll(skin,-1,1)*.94])
    body.data.calc_loop_triangles()
    for tri in body.data.loop_triangles:
        point = np.array(tri.vertices)
        if not eyes[point].any():
            continue
        a,b,c = uv[list(tri.loops)]
        low = np.maximum(np.floor(np.minimum(np.minimum(a,b),c)).astype(int),0)
        high = np.minimum(np.ceil(np.maximum(np.maximum(a,b),c)).astype(int)+1,resolution)
        if np.any(high<=low) or np.prod(high-low)>1200:
            continue
        row,col = np.mgrid[low[1]:high[1],low[0]:high[0]]
        u,v = b-a,c-a
        denom = u[0]*v[1]-u[1]*v[0]
        if abs(denom)<.0001:
            continue
        bx=(col+.5-a[0])
        by=(row+.5-a[1])
        s=(bx*v[1]-by*v[0])/denom
        t=(u[0]*by-u[1]*bx)/denom
        inside=(s>=0)&(t>=0)&(s+t<=1)
        values=coords[point][:,[0,2]]
        world=values[0]+s[:,:,None]*(values[1]-values[0])+t[:,:,None]*(values[2]-values[0])
        projected[row[inside],col[inside]]=world[inside]
        lids[row[inside],col[inside]]=1
    r,g,b=albedo[:,:,:3].transpose(2,0,1)
    skin *= np.clip((r-b-.047)/.093,0,1)
    rng=np.random.default_rng(43021 if elderly else 47082)
    noise=rng.standard_normal(skin.shape,dtype=np.float32)
    freckles=np.maximum(noise-1.64,0)
    tone=(.009*noise-.012*freckles) if elderly else (.005*noise-.006*freckles)
    albedo[:,:,:3]=np.clip(albedo[:,:,:3]+(skin*tone)[:,:,None]*np.array([1,.87,.82]),0,1)
    rows,cols=np.nonzero(lids)
    x,z=projected[rows,cols].T
    center_x=np.where(x<0,-.0325,.0325)
    center_z=np.where(x<0,1.6614,1.6610)
    horizontal=(x-center_x)/.0152
    aperture=np.sqrt(np.maximum(1-horizontal**2,0))
    upper=center_z+.0049*aperture+.00065*horizontal*np.sign(x)
    lower=center_z-.00315*aperture+.00045*horizontal*np.sign(x)
    opening=np.clip((upper-z)/.00065,0,1)*np.clip((z-lower)/.00065,0,1)*(abs(horizontal)<1)
    distance=np.hypot(x-center_x+.00025,z-center_z-.00045)/.0062
    angle=np.arctan2(z-center_z,x-center_x)
    streak=(np.sin(angle*39+distance*12)+.6*np.sin(angle*71-distance*9))*.019
    sclera=np.array([.70,.660,.621] if elderly else [.74,.704,.667])
    shadow = .22*np.clip(1-(upper-z)/.0021,0,1)
    sclera=sclera[None,:]*(1-.26*abs(horizontal)**2-shadow)[:,None]
    iris=np.array([.34,.218,.132] if elderly else [.36,.258,.173])[None,:]
    iris=np.clip(iris+(streak-.15*np.clip((distance-.84)/.16,0,1))[:,None],.035,1)
    iris_mask=np.clip((1.035-distance)/.12,0,1)
    pupil=np.clip((.43-distance)/.09,0,1)
    eye=(sclera*(1-iris_mask[:,None])+iris*iris_mask[:,None])*(1-.93*pupil[:,None])
    reflection=gaussian(x-center_x,-.00136,.00064)*gaussian(z-center_z,.00163,.00065)
    eye=np.clip(eye+.46*reflection[:,None],0,1)
    albedo[rows,cols,:3]=albedo[rows,cols,:3]*(1-opening[:,None])+eye*opening[:,None]
    base.image=pack_texture('Painted skin, iris and sclera',albedo,'sRGB')
    if normal:
        pixels=texture_pixels(normal.image,resolution)
        strength=(.018 if elderly else .011)*skin
        pixels[:,:,0]+=strength*(np.roll(noise,1,1)-noise)
        pixels[:,:,1]+=strength*(np.roll(noise,1,0)-noise)
        normal.image=pack_texture('Layered skin pore normals',np.clip(pixels,0,1),'Non-Color')


def expressions(body, elderly):
    world=body.matrix_world.copy()
    coords=np.array([tuple(world@v.co) for v in body.data.vertices])
    x,y,z=coords.T
    front=np.clip((-y-.023)/.036,0,1)
    eye_x=np.where(x<0,-.0325,.0325)
    eye_z=np.where(x<0,1.6614,1.6610)
    eyelid=front*gaussian(x,eye_x,.0178)*gaussian(z,eye_z,.0114)
    corner=front*gaussian(abs(x),.029,.016)*gaussian(z,1.587,.014)
    cheek=front*gaussian(abs(x),.048,.028)*gaussian(z,1.606,.026)
    brow=front*gaussian(x,eye_x,.023)*gaussian(z,1.676,.010)
    inverse=world.inverted()
    # A shallow corneal curve catches the studio key light without changing eyelid boundaries.
    cornea=front*gaussian(x,eye_x,.010)*gaussian(z,eye_z,.0035)
    coords[:,1]-=.00165*cornea
    for vertex, point in zip(body.data.vertices,coords):
        vertex.co=inverse@Vector(point)
    body.shape_key_add(name='Basis',from_mix=False)
    poses={}
    blink=coords.copy()
    blink[:,2]+=(eye_z-.0015-z)*np.clip(eyelid*1.62,0,.98)
    poses['Blink']=blink
    smile=coords.copy()
    smile[:,0]+=np.sign(x)*.0016*corner
    smile[:,1]-=.0014*cheek
    smile[:,2]+=(.0029 if elderly else .0035)*corner+.0016*cheek
    poses['SoftSmile']=smile
    focus=coords.copy()
    focus[:,2]-=.0017*brow+.0013*eyelid
    poses['Focus']=focus
    for name,points in poses.items():
        key=body.shape_key_add(name=name,from_mix=False)
        local=np.asarray([tuple(inverse@Vector(v)) for v in points],dtype=np.float32)
        key.data.foreach_set('co',local.ravel())
        key.value=0
    paint_face(body,coords,elderly)


for elderly,label in [(True,'elderly_patient'),(False,'companion')]:
    for editable in (True,False):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        if editable:
            bpy.ops.wm.open_mainfile(filepath=str(repository/'docs/character-refinement'/f'{label}.blend'))
        else:
            bpy.ops.import_scene.gltf(filepath=str(web_source/f'{label}.glb'),
                                     disable_bone_shape=True,bone_heuristic='BLENDER')
        scene=bpy.context.scene
        rig=next(obj for obj in scene.objects if obj.type=='ARMATURE')
        body=next(obj for obj in rig.children if obj.name.startswith('char1'))
        rig.data.pose_position='REST'
        bpy.context.view_layer.update()
        expressions(body,elderly)
        if editable:
            camera=scene.camera
            camera.location=(.28,-2.15,1.72)
            camera.rotation_euler=(Vector((0,0,1.64))-camera.location).to_track_quat('-Z','Y').to_euler()
            camera.data.ortho_scale=.32
            scene.render.resolution_x=scene.render.resolution_y=680
            scene.cycles.samples=18
            scene.render.filepath=f'//{label}_face_cycles.png'
            bpy.context.preferences.filepaths.save_version=0
            bpy.ops.wm.save_as_mainfile(filepath=str(output/f'{label}.blend'),compress=True)
            body.data.shape_keys.key_blocks['SoftSmile'].value=.31 if elderly else .44
            bpy.ops.render.render(write_still=True)
        else:
            rig.data.pose_position='POSE'
            bpy.ops.object.select_all(action='DESELECT')
            for obj in (rig,*rig.children): obj.select_set(True)
            bpy.ops.export_scene.gltf(filepath=str(output/f'{label}.glb'),export_format='GLB',
                use_selection=True,export_animations=True,export_morph_animation=False,
                export_image_format='WEBP',export_image_quality=92,
                export_meshopt_compression_enable=True,export_meshopt_extension='EXT_meshopt_compression',
                export_optimize_animation_size=True,export_optimize_animation_keep_anim_armature=True)
