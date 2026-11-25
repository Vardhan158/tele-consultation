"""Bake scroll animation reference measurements from the unchanged character GLBs."""
import json
import re
from pathlib import Path

import bpy

frontend = Path(__file__).resolve().parents[2]
assets = frontend / 'public/assets/house'
output = frontend / 'src/components/public/story/rigCalibration.json'


def load(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(assets / f'{name}.glb'))
    return next(obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')


def controls(rig):
    names = list(rig.pose.bones.keys())
    return {
        'eyelids': any(re.search(r'eyelid|blink', name, re.I) for name in names),
        'fingers': any(re.search(r'thumb|index|middle|ringfinger|pinky', name, re.I) for name in names),
        'faceMorphs': any(
            mesh.shape_keys and len(mesh.shape_keys.key_blocks) > 1
            for mesh in bpy.data.meshes
        ),
    }


def point(rig, name):
    point = rig.matrix_world @ rig.pose.bones[name].head
    return (point.x, point.z, -point.y)


rig = load('patient')
patient_controls = controls(rig)
action = bpy.data.actions['walk']
rig.animation_data.action = action
start, end = action.frame_range
count = 120
sides = ('Left', 'Right')
samples = {side: [] for side in sides}
for index in range(count):
    frame = start + (end - start) * index / count
    bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
    for side in sides:
        samples[side].append((point(rig, side + 'Foot'), point(rig, side + 'ToeBase')))

feet = []
for side in sides:
    poses = samples[side]
    floor = min(toe[1] for _, toe in poses)
    planted = [toe[1] < floor + .018 for _, toe in poses]
    starts = [i for i in range(count) if planted[i] and not planted[i - 1]]
    spans = [(next(j for j in range(1, count) if not planted[(i + j) % count]), i) for i in starts]
    length, first = max(spans)
    center = (first + length / 2) / count
    ankle, toe = poses[int(center * count) % count]
    feet.append({
        'center': round(center % 1, 4),
        'halfWidth': round(length / count / 2, 4),
        'ankle': [round(ankle[0], 4), round(ankle[1], 4)],
        'toe': [0, round(toe[1] - ankle[1], 4), round(toe[2] - ankle[2], 4)],
    })

pharmacist_controls = controls(load('pharmacist'))
output.write_text(json.dumps({
    'feet': feet,
    'patient': patient_controls,
    'pharmacist': pharmacist_controls,
}, indent=2) + '\n', encoding='utf-8')
