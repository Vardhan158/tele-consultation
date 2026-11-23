"""Run in Blender's Text Editor to build an editable stethoscope scene."""

from math import cos, sin, tau

import bpy
from mathutils import Vector


def build_stethoscope():
    scene = bpy.data.scenes.new('Stethoscope Studio')
    model = bpy.data.collections.new('Stethoscope')
    studio = bpy.data.collections.new('Studio')
    scene.collection.children.link(model)
    scene.collection.children.link(studio)

    def material(name, color, metallic, roughness):
        result = bpy.data.materials.new(name)
        result.diffuse_color = (*color, 1)
        result.use_nodes = True
        shader = result.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = result.diffuse_color
        shader.inputs['Metallic'].default_value = metallic
        shader.inputs['Roughness'].default_value = roughness
        return result

    rubber = material('Black rubber', (0.013, 0.015, 0.018), 0, 0.32)
    steel = material('Polished stainless steel', (0.68, 0.71, 0.75), 1, 0.19)
    brushed = material('Satin stainless steel', (0.56, 0.60, 0.65), 1, 0.32)
    silicone = material('Ivory silicone', (0.88, 0.86, 0.8), 0, 0.31)
    backdrop = material('Light gray backdrop', (0.72, 0.72, 0.72), 0, 0.8)

    def mesh_object(name, vertices, faces, surface, collection=model):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        mesh.materials.append(surface)
        for face in mesh.polygons:
            face.use_smooth = True
        return obj

    def tube(name, points, radius, surface, taper=None):
        curve = bpy.data.curves.new(name, 'CURVE')
        curve.dimensions = '3D'
        curve.resolution_u = 24
        curve.bevel_resolution = 8
        curve.bevel_depth = radius
        curve.use_fill_caps = True
        spline = curve.splines.new('BEZIER')
        spline.bezier_points.add(len(points) - 1)
        for index, (point, location) in enumerate(zip(spline.bezier_points, points)):
            point.co = location
            point.handle_left_type = 'AUTO'
            point.handle_right_type = 'AUTO'
            if taper:
                point.radius = taper[index]
        obj = bpy.data.objects.new(name, curve)
        model.objects.link(obj)
        curve.materials.append(surface)
        return obj

    def turned_part(name, center, axis, profile, surface):
        axis = Vector(axis).normalized()
        radial = axis.cross(Vector((0, 1, 0))).normalized()
        tangent = axis.cross(radial)
        center = Vector(center)
        sides = 128
        vertices = []
        faces = []
        for radius, height in profile:
            for i in range(sides):
                angle = tau * i / sides
                vertices.append(center + axis * height + radius * (
                    radial * cos(angle) + tangent * sin(angle)))
        for j in range(len(profile)):
            first = j * sides
            second = ((j + 1) % len(profile)) * sides
            for i in range(sides):
                next_i = (i + 1) % sides
                faces.append((first + i, first + next_i, second + next_i, second + i))
        return mesh_object(name, vertices, faces, surface)

    junction = (-0.63, -0.66, 0.52)
    left_socket = (-0.39, 1.33, 0.38)
    right_socket = (1.49, 0.13, 0.48)
    tube('Looped acoustic hose', [junction, (-1.36, -1.58, .22),
         (-2.77, -2.44, .17), (-4.02, -2.21, .17), (-4.54, -1.32, .17),
         (-4.26, -.25, .17), (-3.27, .57, .17), (-1.97, .84, .17),
         (-.84, .50, .17), (.22, -.20, .17), (1.26, -1.07, .17)], .158, rubber,
         [1.17, 1.02, 1, 1, 1, 1, 1, 1, 1, 1, 1.04])
    tube('Left rubber branch', [junction, (-1.05, -.14, .51),
         (-.86, .59, .45), left_socket], .173, rubber, [1.06, 1, 1, .87])
    tube('Right rubber branch', [junction, (.05, -.60, .55),
         (.82, -.26, .56), right_socket], .17, rubber, [1.06, 1, 1, .87])

    left_tip = (2.63, 3.18, .25)
    right_tip = (3.36, 2.95, .24)
    tube('Left steel ear tube', [left_socket, (.05, 1.94, .26),
         (.78, 2.73, .21), (1.70, 3.30, .21), (2.37, 3.35, .22), left_tip], .071, steel)
    tube('Right steel ear tube', [right_socket, (2.32, .58, .28),
         (3.54, 1.42, .20), (4.26, 2.30, .20), (4.13, 2.70, .21),
         (3.74, 2.88, .22), right_tip], .071, steel)
    tube('Binaural spring', [(-.30, 1.46, .38), (-.47, .87, .45),
         (-.13, .45, .47), (.59, .28, .48), (1.13, .31, .47), (1.63, .22, .43)], .039, brushed)
    tube('Left steel ferrule', [(-.42, 1.29, .38), (-.28, 1.50, .34),
         (-.12, 1.73, .30)], .103, steel)
    tube('Right steel ferrule', [(1.45, .10, .49), (1.69, .24, .43),
         (1.97, .39, .36)], .105, steel)

    tip_profile = [(.073, -.09), (.112, -.08), (.165, -.025), (.207, .055),
                   (.217, .14), (.189, .22), (.134, .255), (.087, .25),
                   (.068, .22), (.068, -.06)]
    turned_part('Left silicone eartip', left_tip, (.73, -.67, .08), tip_profile, silicone)
    turned_part('Right silicone eartip', right_tip, (-.91, .38, .03), tip_profile, silicone)

    chest = (2.35, -1.76, .03)
    vertical = (0, 0, 1)
    tube('Chestpiece connector', [(1.23, -1.05, .17), (1.58, -1.28, .21),
         (1.98, -1.52, .36), (2.27, -1.69, .43)], .107, steel)
    turned_part('Diaphragm housing', chest, vertical, [(.011, .015), (.97, .015),
        (1.015, .035), (1.025, .072), (1.023, .12), (1.005, .15),
        (.973, .16), (.906, .163), (.75, .20), (.57, .27), (.44, .34),
        (.40, .39), (.01, .39)], brushed)
    turned_part('Lower polished rim', chest, vertical, [(.985, .046), (1.022, .052),
        (1.035, .068), (1.031, .094), (1.013, .109), (.985, .105)], steel)
    turned_part('Bell body and concave bowl', chest, vertical, [(.01, .28),
        (.375, .28), (.405, .34), (.414, .51), (.49, .57), (.64, .59),
        (.684, .62), (.69, .68), (.671, .72), (.592, .722), (.54, .702),
        (.505, .683), (.464, .652), (.39, .607), (.30, .562), (.20, .523),
        (.079, .489), (.056, .484), (.052, .45), (.01, .45)], steel)
    turned_part('Black bell gasket', chest, vertical, [(.526, .688), (.543, .718),
        (.58, .737), (.632, .734), (.658, .722), (.661, .698),
        (.638, .683), (.551, .679)], rubber)
    turned_part('Bell sound port', chest, vertical, [(.001, .448), (.052, .448),
        (.051, .478), (.045, .478), (.045, .459), (.001, .459)], rubber)

    mesh_object('Backdrop', [(-200, -200, 0), (200, -200, 0),
                (200, 200, 0), (-200, 200, 0)], [(0, 1, 2, 3)], backdrop, studio)

    def aim(obj, target):
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

    for name, location, energy, width, height in [
        ('Key softbox', (-3, 1, 7), 920, 6, 3),
        ('Fill softbox', (4, -4, 5), 680, 5, 3),
        ('Rim strip', (2, 5, 5), 760, 6, 1.2),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.shape = 'RECTANGLE'
        data.size = width
        data.size_y = height
        light = bpy.data.objects.new(name, data)
        studio.objects.link(light)
        light.location = location
        aim(light, (0, 0, 0))

    camera = bpy.data.objects.new('Product camera', bpy.data.cameras.new('Product camera'))
    studio.objects.link(camera)
    camera.location = (-.15, -5.8, 12)
    aim(camera, (-.15, .24, .23))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 10.1
    scene.camera = camera
    scene.world = bpy.data.worlds.new('Studio ambient light')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.4, .4, .4, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .35
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1536
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    return scene


if __name__ == '__main__':
    stethoscope_scene = build_stethoscope()
    if bpy.context.window:
        bpy.context.window.scene = stethoscope_scene
