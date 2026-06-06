#!/usr/bin/env python3
"""
HYPER-POLY OPENWORLD FILM — 30-minute procedural feature
Run inside Blender:  blender --background --python film.py
Or headless:         blender -b -P film.py

Act structure: DAWN(0-8) → NOON(8-18) → DUSK(18-28) → NIGHT(28-30)

RENDER BUDGET:
  Full 30min at 1080p/24fps (43,200 frames)
    Cycles: ~2s/frame → ~24 hours GPU render time
    Eevee:  ~0.2s/frame → ~2.4 hours

  Use --preview for iteration:
    blender --background --python film.py -- --preview 1
    Renders 480p, 10fps, 1 minute of content → ~600 frames
    Cycles estimate: ~20 minutes. Eevee: ~2 minutes.

  Kaggle P100 GPU can render ~3-4 full passes per month
  within the 30-hour GPU quota.
"""
import bpy
import math
import random
from mathutils import Vector, Euler, noise

# ═══════════════════════════════════════════════════════════════════════
# CONFIG — tune for Kaggle GPU sessions
# ═══════════════════════════════════════════════════════════════════════
FPS = 12
DURATION_MINUTES = 30
TOTAL_FRAMES = FPS * 60 * DURATION_MINUTES
RESOLUTION_X = 1280
RESOLUTION_Y = 720
RENDER_ENGINE = 'CYCLES'
DEVICE = 'GPU'

# ── Preview mode: override config for fast iteration ──
# Usage: blender --background --python film.py -- --preview
# Sets low-res, low-fps, short duration
import sys as _sys
if '--preview' in _sys.argv:
    idx = _sys.argv.index('--preview')
    preview_minutes = 1  # default: 1 minute
    if idx + 1 < len(_sys.argv) and _sys.argv[idx+1].isdigit():
        preview_minutes = int(_sys.argv[idx+1])
    FPS = 10
    DURATION_MINUTES = preview_minutes
    TOTAL_FRAMES = FPS * 60 * DURATION_MINUTES
    RESOLUTION_X = 854
    RESOLUTION_Y = 480
    RENDER_ENGINE = 'EEVEE'
    print(f"[PREVIEW] Mode: {preview_minutes}min at 480p/10fps ({TOTAL_FRAMES} frames)")
SAMPLES = 64
CHUNK_START = 0       # override for resume
CHUNK_END = TOTAL_FRAMES
OUTPUT_DIR = '//render_output/'
SEED = 42

random.seed(SEED)
noise.seed_set(SEED)

# ═══════════════════════════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════════════════════════
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Clear default data
for block in bpy.data.meshes:
    bpy.data.meshes.remove(block)
for block in bpy.data.materials:
    bpy.data.materials.remove(block)
for block in bpy.data.curves:
    bpy.data.curves.remove(block)

# ═══════════════════════════════════════════════════════════════════════
# RENDER SETTINGS
# ═══════════════════════════════════════════════════════════════════════
scene = bpy.context.scene
scene.render.engine = RENDER_ENGINE
scene.render.fps = FPS
scene.render.resolution_x = RESOLUTION_X
scene.render.resolution_y = RESOLUTION_Y
scene.render.resolution_percentage = 100
scene.render.filepath = f'{OUTPUT_DIR}frame_####'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.compression = 15

scene.cycles.device = DEVICE
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.02

scene.frame_start = CHUNK_START
scene.frame_end = CHUNK_END
scene.frame_current = CHUNK_START

# World
world = bpy.data.worlds.new("FilmWorld")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']

# ═══════════════════════════════════════════════════════════════════════
# TERRAIN
# ═══════════════════════════════════════════════════════════════════════
TERRAIN_SIZE = 200
TERRAIN_SUBDIV = 128

def terrain_height(x, y):
    h = 0
    amp = 8.0
    freq = 0.012
    for _ in range(5):
        h += noise.noise(Vector((x * freq, y * freq, 0.3))) * amp
        amp *= 0.55
        freq *= 2.1
    # Ridge detail
    h += abs(noise.noise(Vector((x * 0.025, y * 0.025, 0.7)))) * 6.0
    return h

bpy.ops.mesh.primitive_grid_add(
    x_subdivisions=TERRAIN_SUBDIV, y_subdivisions=TERRAIN_SUBDIV,
    size=TERRAIN_SIZE, location=(0, 0, 0)
)
terrain_obj = bpy.context.active_object
terrain_obj.name = "Terrain"

# Displace
bpy.ops.object.modifier_add(type='DISPLACE')
displace = terrain_obj.modifiers['Displace']
displace.strength = 1.0

tex = bpy.data.textures.new("TerrainTex", 'CLOUDS')
tex.noise_scale = 0.4
tex.noise_depth = 6
tex.noise_basis = 'IMPROVED_PERLIN'
displace.texture = tex

# Subsurf for smooth terrain
bpy.ops.object.modifier_add(type='SUBSURF')
subsurf = terrain_obj.modifiers['Subsurf']
subsurf.levels = 1
subsurf.render_levels = 2

# Terrain material (vertex colors from height)
mat_terrain = bpy.data.materials.new("TerrainMat")
mat_terrain.use_nodes = True
nodes = mat_terrain.node_tree.nodes
links = mat_terrain.node_tree.links
nodes.clear()
output = nodes.new('ShaderNodeOutputMaterial')
output.location = (400, 0)
principled = nodes.new('ShaderNodeBsdfPrincipled')
principled.location = (0, 0)
principled.inputs['Roughness'].default_value = 0.85
try:
    principled.inputs['Specular IOR Level'].default_value = 0.1  # Blender <4.0
except KeyError:
    principled.inputs['Specular'].default_value = 0.1             # Blender 4.0+
links.new(principled.outputs['BSDF'], output.inputs['Surface'])

# Color ramp based on geometry normal Z
geom = nodes.new('ShaderNodeNewGeometry')
geom.location = (-400, 200)
sep = nodes.new('ShaderNodeSeparateXYZ')
sep.location = (-200, 200)
links.new(geom.outputs['Normal'], sep.inputs['Vector'])
ramp = nodes.new('ShaderNodeValToRGB')
ramp.location = (0, 200)
links.new(sep.outputs['Z'], ramp.inputs['Fac'])
ramp.color_ramp.elements[0].position = 0.3
ramp.color_ramp.elements[0].color = (0.12, 0.42, 0.15, 1)
ramp.color_ramp.elements[1].position = 0.7
ramp.color_ramp.elements[1].color = (0.55, 0.48, 0.3, 1)
c2 = ramp.color_ramp.elements.new(0.9)
c2.color = (0.7, 0.68, 0.62, 1)
links.new(ramp.outputs['Color'], principled.inputs['Base Color'])

terrain_obj.data.materials.append(mat_terrain)

# ═══════════════════════════════════════════════════════════════════════
# WATER PLANE
# ═══════════════════════════════════════════════════════════════════════
bpy.ops.mesh.primitive_plane_add(size=TERRAIN_SIZE * 1.3, location=(0, 0, -0.5))
water_obj = bpy.context.active_object
water_obj.name = "Water"

mat_water = bpy.data.materials.new("WaterMat")
mat_water.use_nodes = True
nodes = mat_water.node_tree.nodes
links = mat_water.node_tree.links
nodes.clear()
out_w = nodes.new('ShaderNodeOutputMaterial')
out_w.location = (400, 0)
glass = nodes.new('ShaderNodeBsdfGlass')
glass.location = (0, 0)
glass.inputs['Roughness'].default_value = 0.05
glass.inputs['IOR'].default_value = 1.33
links.new(glass.outputs['BSDF'], out_w.inputs['Surface'])
water_obj.data.materials.append(mat_water)

# ═══════════════════════════════════════════════════════════════════════
# CHARACTER — low-poly geometric figure
# ═══════════════════════════════════════════════════════════════════════
def create_character():
    bpy.ops.mesh.primitive_cube_add(size=0.5, location=(0, 0, 1.0))
    torso = bpy.context.active_object
    torso.name = "Torso"
    torso.scale = (0.4, 0.25, 0.6)

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.22, location=(0, 0, 1.75))
    head = bpy.context.active_object
    head.name = "Head"

    bpy.ops.mesh.primitive_cube_add(size=0.3, location=(0.5, 0, 1.05))
    arm_r = bpy.context.active_object
    arm_r.name = "Arm_R"
    arm_r.scale = (0.6, 0.12, 0.12)

    bpy.ops.mesh.primitive_cube_add(size=0.3, location=(-0.5, 0, 1.05))
    arm_l = bpy.context.active_object
    arm_l.name = "Arm_L"
    arm_l.scale = (0.6, 0.12, 0.12)

    bpy.ops.mesh.primitive_cube_add(size=0.3, location=(0.15, 0, 0.45))
    leg_r = bpy.context.active_object
    leg_r.name = "Leg_R"
    leg_r.scale = (0.14, 0.14, 0.55)

    bpy.ops.mesh.primitive_cube_add(size=0.3, location=(-0.15, 0, 0.45))
    leg_l = bpy.context.active_object
    leg_l.name = "Leg_L"
    leg_l.scale = (0.14, 0.14, 0.55)

    # Eyes
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(0.08, 0.18, 1.82))
    eye_r = bpy.context.active_object
    eye_r.name = "Eye_R"
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(-0.08, 0.18, 1.82))
    eye_l = bpy.context.active_object
    eye_l.name = "Eye_L"

    # Group parts
    parts = [torso, head, arm_r, arm_l, leg_r, leg_l, eye_r, eye_l]
    mat_char = bpy.data.materials.new("CharacterMat")
    mat_char.use_nodes = True
    bsdf = mat_char.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.9, 0.45, 0.25, 1)
    bsdf.inputs['Roughness'].default_value = 0.5

    mat_eye = bpy.data.materials.new("EyeMat")
    mat_eye.use_nodes = True
    mat_eye.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0, 0, 0, 1)

    for obj in parts:
        obj.data.materials.append(mat_char)

    eye_r.data.materials.clear()
    eye_r.data.materials.append(mat_eye)
    eye_l.data.materials.clear()
    eye_l.data.materials.append(mat_eye)

    # Parent all to Empty for group animation
    bpy.ops.object.empty_add(location=(0, 0, 0.5))
    char_root = bpy.context.active_object
    char_root.name = "Character"

    for obj in parts:
        obj.parent = char_root

    return char_root

char = create_character()

# ═══════════════════════════════════════════════════════════════════════
# CHARACTER PATH — journey across the terrain
# ═══════════════════════════════════════════════════════════════════════
def get_ground_z(x, y):
    """Sample terrain height at world x,y via noise (matches displacement)"""
    return terrain_height(x, y) + 0.5  # offset for character

# Waypoints across the terrain
path_waypoints = [
    (-70, -70), (-50, -40), (-20, -50), (0, -30), (15, -10),
    (5, 15), (-10, 35), (10, 50), (30, 35), (50, 20),
    (60, 0), (45, -20), (55, -45), (70, -30), (60, -60),
    (30, -70), (0, -65), (-30, -75), (-55, -60), (-70, -40),
]

# Keyframe character along path
for i, (wx, wy) in enumerate(path_waypoints):
    frame = int((i / (len(path_waypoints) - 1)) * TOTAL_FRAMES)
    z = get_ground_z(wx, wy)
    char.location = Vector((wx, wy, z))
    char.keyframe_insert(data_path='location', frame=frame)
    # Slight bob
    char.location.z += 0.15 * math.sin(frame * 0.3)
    char.keyframe_insert(data_path='location', frame=frame, index=2)
    # Rotation follows direction
    if i < len(path_waypoints) - 1:
        dx = path_waypoints[i+1][0] - wx
        dy = path_waypoints[i+1][1] - wy
        angle = math.atan2(dx, dy)
        char.rotation_euler = Euler((0, 0, angle))
        char.keyframe_insert(data_path='rotation_euler', frame=frame)

# Smooth interpolation
for fc in char.animation_data.action.fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = 'BEZIER'

# ═══════════════════════════════════════════════════════════════════════
# CAMERAS — multi-shot narrative
# ═══════════════════════════════════════════════════════════════════════
def create_camera(name, location, rotation, lens=35):
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.active_object
    cam.name = name
    cam.data.lens = lens
    cam.rotation_euler = rotation
    return cam

# Camera 1: Wide establishing (Act 1)
cam_wide = create_camera("Cam_Wide", (0, -60, 35), Euler((math.radians(55), 0, 0)), lens=24)
# Camera 2: Tracking (Act 2)
cam_track = create_camera("Cam_Track", (-30, -40, 10), Euler((math.radians(65), 0, math.radians(15))), lens=50)
# Camera 3: Overhead (Act 3)
cam_drone = create_camera("Cam_Drone", (20, 20, 50), Euler((math.radians(80), 0, math.radians(180))), lens=35)
# Camera 4: Close (Act 4)
cam_close = create_camera("Cam_Close", (55, -55, 5), Euler((math.radians(70), 0, math.radians(40))), lens=85)

# Camera switching via markers
def bind_camera(camera, start_frame, end_frame):
    """Bind a camera to scene for a frame range"""
    scene.frame_current = start_frame
    scene.camera = camera
    scene.camera.keyframe_insert(data_path='location', frame=start_frame)
    scene.camera.keyframe_insert(data_path='rotation_euler', frame=start_frame)

# Act markers
bind_camera(cam_wide,  0,                    FPS * 60 * 8)     # Act 1: establishing
bind_camera(cam_track, FPS * 60 * 8,         FPS * 60 * 18)    # Act 2: tracking
bind_camera(cam_drone, FPS * 60 * 18,        FPS * 60 * 28)    # Act 3: drone
bind_camera(cam_close, FPS * 60 * 28,        TOTAL_FRAMES)     # Act 4: close

# Camera look-at constraint (follow character during tracking act)
bpy.context.scene.frame_current = int(FPS * 60 * 8)
constraint = cam_track.constraints.new('TRACK_TO')
constraint.target = char
constraint.track_axis = 'TRACK_NEGATIVE_Z'
constraint.up_axis = 'UP_Y'

constraint2 = cam_close.constraints.new('TRACK_TO')
constraint2.target = char
constraint2.track_axis = 'TRACK_NEGATIVE_Z'
constraint2.up_axis = 'UP_Y'

# Animate camera positions for dynamic movement
# Act 1 — slow pan across valley
for f in range(0, int(FPS * 60 * 8), int(FPS * 5)):
    cam_wide.location.x = -40 + math.sin(f * 0.001) * 25
    cam_wide.location.y = -60 + math.cos(f * 0.001) * 10
    cam_wide.keyframe_insert(data_path='location', frame=f)

# Act 3 — drone circles
for f in range(int(FPS * 60 * 18), int(FPS * 60 * 28), int(FPS * 3)):
    t = (f - FPS * 60 * 18) / (FPS * 60 * 10)
    angle = t * math.pi * 2
    cam_drone.location.x = char.location.x + math.cos(angle) * 25
    cam_drone.location.y = char.location.y + math.sin(angle) * 25
    cam_drone.location.z = 30 + math.sin(t * 4) * 10
    cam_drone.keyframe_insert(data_path='location', frame=f)

# ═══════════════════════════════════════════════════════════════════════
# LIGHTING — dawn→noon→dusk→night sun arc
# ═══════════════════════════════════════════════════════════════════════
bpy.ops.object.light_add(type='SUN', location=(80, 0, 60))
sun = bpy.context.active_object
sun.name = "Sun"
sun.data.energy = 5.0

# Sun traverses the sky
sun_waypoints = [
    (0,     'DAWN',  80, -70, 8,   0.15, (1.0, 0.6, 0.3)),
    (8,     'NOON',  0,  80,  50,  3.0,  (1.0, 0.95, 0.85)),
    (18,    'DUSK',  -80, 60, 10,  0.4,  (1.0, 0.4, 0.15)),
    (28,    'NIGHT', -40, -80, -10, 0.05, (0.1, 0.15, 0.4)),
    (30,    'END',   -40, -80, -15, 0.03, (0.05, 0.08, 0.2)),
]

for (minute, label, sx, sy, sz, energy, color) in sun_waypoints:
    frame = int(minute * 60 * FPS)
    sun.location = Vector((sx, sy, sz))
    sun.data.energy = energy
    sun.data.color = color
    sun.keyframe_insert(data_path='location', frame=frame)
    sun.keyframe_insert(data_path='energy', frame=frame)
    sun.keyframe_insert(data_path='color', frame=frame)

# Sky color transitions via world node
def make_sky_ramp():
    """Dynamic sky color"""
    sky_ramp = world.node_tree.nodes.new('ShaderNodeValToRGB')
    sky_ramp.location = (-200, 0)
    sky_ramp.color_ramp.elements[0].color = (0.02, 0.04, 0.15, 1)  # night zenith
    sky_ramp.color_ramp.elements[1].color = (0.6, 0.7, 0.95, 1)    # day zenith
    return sky_ramp

# Ambient light for night scenes
bpy.ops.object.light_add(type='POINT', location=(0, 0, 30))
fill = bpy.context.active_object
fill.name = "FillLight"
fill.data.energy = 500
fill.data.color = (0.1, 0.15, 0.3)
fill.data.use_nodes = True
fill.data.node_tree.nodes['Emission'].inputs['Strength'].default_value = 500

# ═══════════════════════════════════════════════════════════════════════
# SCATTER — trees and rocks
# ═══════════════════════════════════════════════════════════════════════
def create_tree(loc):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=5, radius=0.15, depth=1.5 + random.random() * 1.5,
        location=loc
    )
    trunk = bpy.context.active_object
    trunk.name = "TreeTrunk"

    for i in range(2 + random.randint(0, 2)):
        cone_loc = (loc[0], loc[1], loc[2] + 1.2 + i * 0.6)
        bpy.ops.mesh.primitive_cone_add(
            vertices=6, radius1=0.7 - i * 0.2, depth=1.0,
            location=cone_loc
        )
        cone = bpy.context.active_object
        cone.name = "TreeCone"

def create_rock(loc):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=1, radius=0.3 + random.random() * 0.8,
        location=loc
    )
    rock = bpy.context.active_object
    rock.name = "Rock"
    rock.scale.z = 0.4 + random.random() * 0.4

for _ in range(200):
    x = random.uniform(-90, 90)
    y = random.uniform(-90, 90)
    z = terrain_height(x, y)
    if z > -0.5:
        create_tree((x, y, z))
        create_rock((x + random.uniform(-2, 2), y + random.uniform(-2, 2), z))

# ═══════════════════════════════════════════════════════════════════════
# FRAME MARKERS — scene beats
# ═══════════════════════════════════════════════════════════════════════
markers_data = [
    (0,       'TITLE: HYPER-POLY OPENWORLD'),
    (FPS*15,  'ESTABLISH: Valley emerges from mist'),
    (FPS*60*2,'BEAT: Character enters frame'),
    (FPS*60*5,'BEAT: First water crossing'),
    (FPS*60*8,'ACT 2: The climb begins'),
    (FPS*60*12,'BEAT: Rocky ridge obstacle'),
    (FPS*60*16,'BEAT: Summit approach'),
    (FPS*60*18,'ACT 3: Golden hour'),
    (FPS*60*22,'BEAT: Reflection at peak'),
    (FPS*60*26,'BEAT: Descent into dusk'),
    (FPS*60*28,'ACT 4: Stars emerge'),
    (FPS*60*29,'CLOSE: Fade to night'),
]

for frame, name in markers_data:
    bpy.context.scene.timeline_markers.new(name, frame=frame)

# ═══════════════════════════════════════════════════════════════════════
# MIST / VOLUMETRICS — subtle atmospheric fog
# ═══════════════════════════════════════════════════════════════════════
bpy.ops.mesh.primitive_cube_add(size=TERRAIN_SIZE * 1.5, location=(0, 0, 5))
fog_box = bpy.context.active_object
fog_box.name = "FogVolume"
fog_box.scale.z = 0.3
fog_box.display_type = 'WIRE'

mat_fog = bpy.data.materials.new("FogMat")
mat_fog.use_nodes = True
nodes = mat_fog.node_tree.nodes
links = mat_fog.node_tree.links
nodes.clear()
out_f = nodes.new('ShaderNodeOutputMaterial')
out_f.location = (300, 0)
vol_abs = nodes.new('ShaderNodeVolumeAbsorption')
vol_abs.location = (0, 0)
vol_abs.inputs['Density'].default_value = 0.008
links.new(vol_abs.outputs['Volume'], out_f.inputs['Volume'])
fog_box.data.materials.append(mat_fog)

# ═══════════════════════════════════════════════════════════════════════
# COMPOSITING — subtle post-processing
# ═══════════════════════════════════════════════════════════════════════
scene.use_nodes = True
comp = scene.node_tree
comp_nodes = comp.nodes
comp_links = comp.links
comp_nodes.clear()

render_layers = comp_nodes.new('CompositorNodeRLayers')
render_layers.location = (-400, 0)

glare = comp_nodes.new('CompositorNodeGlare')
glare.location = (-100, 0)
glare.glare_type = 'FOG_GLOW'
glare.quality = 'LOW'
glare.threshold = 0.85
glare.size = 6

mix = comp_nodes.new('CompositorNodeMixRGB')
mix.location = (150, 0)
mix.blend_type = 'SCREEN'
mix.inputs[0].default_value = 0.15

output_comp = comp_nodes.new('CompositorNodeComposite')
output_comp.location = (400, 0)

comp_links.new(render_layers.outputs['Image'], glare.inputs['Image'])
comp_links.new(render_layers.outputs['Image'], mix.inputs[1])
comp_links.new(glare.outputs['Image'], mix.inputs[2])
comp_links.new(mix.outputs['Image'], output_comp.inputs['Image'])

# ═══════════════════════════════════════════════════════════════════════
# EXPORT SETTINGS TO FILE (for Kaggle resume)
# ═══════════════════════════════════════════════════════════════════════
import json
config = {
    'fps': FPS,
    'total_frames': TOTAL_FRAMES,
    'duration_minutes': DURATION_MINUTES,
    'resolution': [RESOLUTION_X, RESOLUTION_Y],
    'engine': RENDER_ENGINE,
    'samples': SAMPLES,
    'chunk_start': CHUNK_START,
    'chunk_end': CHUNK_END,
    'seed': SEED,
}
with open('film_config.json', 'w') as f:
    json.dump(config, f, indent=2)

print(f"=== FILM SCENE BUILT ===")
print(f"Frames: {TOTAL_FRAMES} @ {FPS}fps = {DURATION_MINUTES}min")
print(f"Resolution: {RESOLUTION_X}x{RESOLUTION_Y}")
print(f"Write overlay text file before rendering for subtitles")
print(f"Render: blender -b film.blend -a")
print(f"=========================")
