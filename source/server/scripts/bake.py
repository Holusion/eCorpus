#acl All:read
#format python
# Blender Python script for converting a mesh to GLB with Draco compression.
# Tested on Blender 4.2
# Usage:
# blender --background --factory-startup --addons io_scene_gltf2 --python obj_rebake.py -- -i [input obj file] -o [output glb file] -rbk true/false -uw true/false -q [quality]
import os
from pathlib import Path
from sys import argv,stderr
from functools import reduce
import math

import argparse
import bpy



def fail(msg):
    print("Fatal Error: "+msg, file=stderr)
    exit(1)


def clean():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    if len(bpy.data.objects) != 0:
        print('Error deleting Blender scene objects', file=stderr)
        exit(1)

def file_name(filepath):
    return path.split(filepath)[1]

def dir_path(filepath):
    return path.split(filepath)[0]

def file_suffix(filepath):
    return path.splitext(file_name(filepath))[1]

def import_func_wrapper(func, filepath):
    func(filepath=filepath)



if "--" not in argv:
    argv = [] # as if no args are passed
else:
    argv = argv[argv.index("--") + 1:]

parser = argparse.ArgumentParser(description='Blender bake resized maps')
parser.add_argument('-i', '--input', help='glb file to be converted')
parser.add_argument('-o', '--output', help='output GLB file')
parser.add_argument('-s', '--scale', help='texture scale factor [0..1]', type=float)
parser.add_argument('--unwrap', help='Force unwrap mesh', default=False, action='store_true')
parser.add_argument('--orm', help='Bake an Occlusion-Roughness-Metallic map', default=False, action='store_true')
args = parser.parse_args(argv)

if not (args.input and args.output and args.scale):
    fail('Command line arguments not supplied or inappropriate')

ifile = args.input
ofile = args.output
scale = args.scale
if scale < 0:
   fail("Invalid scale requested : {}".format(scale))
elif 1 < scale:
   fail("Will not upscale images")

# use file's directory as workspace
path, name = os.path.split(ofile)
filename = Path(name).stem


def configure():
  """configure render engine for baking operations"""
  print("Configure render engine")
  bpy.data.scenes['Scene'].render.bake.use_pass_direct = False
  bpy.data.scenes['Scene'].render.bake.use_pass_indirect = False
  bpy.data.scenes['Scene'].render.bake.use_pass_color = True
  # only Cycles can bake
  bpy.data.scenes['Scene'].render.engine = 'CYCLES' 
  bpy.data.scenes['Scene'].cycles.device = 'CPU'
  bpy.data.scenes['Scene'].render.bake.margin_type = 'ADJACENT_FACES' # Or 'EXTEND'?
  #We won't resize the texture further so we don't expect too much bleeding. We might even use 0
  bpy.data.scenes['Scene'].render.bake.margin = 1 

  #Disable undo to save memory
  bpy.context.preferences.edit.undo_steps = 0
  bpy.context.preferences.edit.use_global_undo = False



def walk_node(node:bpy.types.ShaderNode) -> int:
  if not node:
    return 0
  if node.type == 'TEX_IMAGE':
    image = node.image
    if not image:
      print("Image texture does not point to an image for object {}".format(obj.name_full))
      return 0
    else:
      return image.size[0] * image.size[1]
  if node.type == "BSDF_PRINCIPLED":
    diffuseInput = node.inputs[0]
    if not diffuseInput.links:
      return 0
    if len(diffuseInput.links) != 1:
      print("Diffuse input has more than one link for object {} (additional links ignored)".format(obj.name_full))
      return 0
    return walk_node(diffuseInput.links[0].from_node)
  elif node.type == "MIX":
    # a MixShader is inserted into the glTF if it has some color attributes
    return reduce(lambda s, input: s + walk_node(input.links[0].from_node) if hasattr(input, 'links') and 0 < len(input.links) else s, node.inputs, 0)
  else:
    return 0

def diffuse_pixels(obj):
  """Compute total pixel count of all difuses assigned to this object"""
  size = 0
  for mat_slot in obj.material_slots:
    material = mat_slot.material
    output_node = material.node_tree.get_output_node('CYCLES')
    if not output_node:
      print("Material {} has no output node".format(material.name_full))
      continue
    diffuse_input = [input for input in output_node.inputs if input.name == "Surface"][0]
    if not diffuse_input:
      print("material {} has no diffuse input".format(material.name_full))
      continue
    size = size + walk_node(diffuse_input.links[0].from_node)
  return size

def pixels_to_width(n):
   """from a total count of pixel, compute an image width, rounded-down to the nearest power of two"""
   width = math.sqrt(n)
   exp = math.floor(math.log2(width))
   return 2**exp

def pack(obj):
  """
  pack uv islands
  """
  obj.select_set(True)
  print("Remove doubles")
  #create new UV, initialized to existing unwrap or a default uv map
  uv = obj.data.uv_layers.new(name='UVMap_smart', do_init=True)
  uv.active = True
  bpy.context.view_layer.objects.active = obj
  bpy.ops.object.mode_set(mode="EDIT")
  bpy.ops.mesh.select_all(action='SELECT')
  bpy.ops.mesh.remove_doubles(threshold=0)
  if args.unwrap:
    print("Create new Unwrap with smart UV project")
    bpy.ops.uv.smart_project()
  #Or not smart :
  # bpy.ops.uv.unwrap()
  bpy.ops.uv.select_all(action='SELECT')
  print("Pack Islands") 
  # pack margin is in fraction of island size
  bpy.ops.uv.pack_islands(margin=0.0001)
  return uv
  

def bake(obj: bpy.types.Mesh, type: str):
  """Bake an object's 'DIFFUSE' or 'AO' map"""
  name = obj.name_full

  # clamped max original texture value
  original_size_pixels = min(diffuse_pixels(obj), 8192*8192)
  if(original_size_pixels == 0):
     print("Skip texture baking: No diffuse found")
     return None
  square_size = math.isqrt(original_size_pixels)
  print("Original combined diffuse size {} {} pixels square".format("was a" if square_size == math.sqrt(original_size_pixels) else "rounded down to", square_size))

  width = height = pixels_to_width(original_size_pixels*scale)

  print("baking {} ({}) to a {}x{} pixels map".format(name, type, width, height))


  #create empty img
  bake_img_name="{}_{}_{}".format(type[0:3], width, name)
  bake_img = bpy.data.images.new(name = bake_img_name, width = width, height = height)
  for mat_slot in obj.material_slots:
      mat= mat_slot.material
      nodes = mat.node_tree.nodes
      bake_node = nodes.new('ShaderNodeTexImage')
      bake_node.name="bake_{}_{}_node".format(type.lower(), name)
      bake_node.image = bake_img
      #deselect all nodes
      for node in nodes:
          node.select = False
      #There can be only one selected and active node
      bake_node.select = True
      nodes.active = bake_node
  
  img_file = bake_img_name + ".png"
  bpy.ops.object.bake(type=type)
  bake_img.filepath_raw = img_file
  bake_img.file_format = 'PNG'
  # we can save the image to disk if we want to see it.
  # But since it will be saved with the glb file, we can also just extract it from there
  #print("export baked {} to {}".format(type.lower(), img_file))
  #bake_img.save()
  return bake_img


def create_baked_material(bake_img: bpy.types.Image):
  print("Create baked material")
  mat = bpy.data.materials.new(name="baked_material_" + name)
  mat.use_nodes = True
  # FIXME should we handle backface culling here?
  mat.use_backface_culling = True
  nodes = mat.node_tree.nodes
  links = mat.node_tree.links
  mat.node_tree.links.clear()
  mat.node_tree.nodes.clear()
  output = nodes.new(type='ShaderNodeOutputMaterial')
  shader = nodes.new(type="ShaderNodeBsdfPrincipled")
  links.new(shader.outputs[0], output.inputs[0])
  
  
  imgDiffuse_node = nodes.new('ShaderNodeTexImage')
  imgDiffuse_node.name="baked_diffuse_node"
  #bake_img =  bpy.data.images.get(bake_img_name)
  imgDiffuse_node.image = bake_img
  links.new(imgDiffuse_node.outputs[0], shader.inputs[0])
  
  #Shader default value : rough
  shader.inputs['Roughness'].default_value = 1
  return mat

def remove_color_attributes(obj: bpy.types.Mesh):
  while obj.data.color_attributes:
    obj.data.color_attributes.remove(obj.data.color_attributes[0])

def clean_uv(obj: bpy.types.Mesh):
  if 1 < len(obj.data.uv_layers):
    print("Delete {} UV layers".format(len(obj.data.uv_layers) - 1))
  while 1 < len(obj.data.uv_layers):
    obj.data.uv_layers.remove(obj.data.uv_layers[0])

def process(obj: bpy.types.Mesh):
  """
  take a mesh, iterate through its material to pack its uv islands and rebake its textures into one image
  """
  obj.select_set(True)
  name = obj.name_full

  uv = pack(obj)
  
  bake_img = bake(obj, 'DIFFUSE')
  if(args.orm):
    fail("ORM maps not supported")
    # bake(obj, 'AO')

  if not bake_img:
    print("No diffuse found in this object")
    obj.data.uv_layers.remove(uv)
    return
  else:
    #Delete useless UV layers
    clean_uv(obj)

  #Delete all material
  obj.data.materials.clear()
  # FIXME ORM map goes here
  mat = create_baked_material(bake_img)
  obj.data.materials.append(mat)

  #Delete any color attributes are they are now baked in the diffuse
  # (if they were used at all...)
  remove_color_attributes(obj)

###
# BOOTSTRAP
###
try: 
  print("Resize and bake textures for {}".format(filename))

  clean()
  #Import input file
  bpy.ops.import_scene.gltf(filepath = ifile)

  configure()

  #Select object
  for obj in bpy.data.objects:
    if type(obj.data) != bpy.types.Mesh:
      continue
    process(obj)

  # Lossless export. Compress later with gltf-transform
  bpy.ops.export_scene.gltf(
    filepath=ofile,
    export_image_format="AUTO",
    export_image_quality=85,
    export_draco_mesh_compression_enable=False
  )

except Exception as e:
    fail(str(e).replace("\n", "; "))

print('Successfully converted {} to {}'.format(ifile, ofile))
