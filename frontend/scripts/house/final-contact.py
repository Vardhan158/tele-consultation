bpy.data.objects['ENV_terrain'].location.z = -.18
bpy.data.objects['ENV_sidewalk'].location.z=-.015
bpy.data.objects['ENV_road'].location.z=-.025
scene=bpy.context.scene
scene.eevee.taa_render_samples=8
scene.render.resolution_x=720; scene.render.resolution_y=480
target=artifacts.file(name='house-final.png',media_type='image/png')
scene.render.filepath=str(target.path)
scene.render.image_settings.media_type='IMAGE'; scene.render.image_settings.file_format='PNG'
bpy.ops.render.render(write_still=True); target.publish()
result={'entry_path_width_m':2.4,'path_rise_m':.18,'path_run_m':5.5,'level_street_and_sidewalk':True,'door_children':len(bpy.data.objects['EntranceDoor_Hinge'].children)}
