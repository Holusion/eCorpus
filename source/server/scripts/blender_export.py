from os import path
from contextlib import redirect_stdout
from sys import argv,stderr
import argparse
import io
import bpy


def fail(msg):
    print(msg, file=stderr)
    exit(1)

def file_name(filepath):
    return path.split(filepath)[1]

def dir_path(filepath):
    return path.split(filepath)[0]

def file_suffix(filepath):
    return path.splitext(file_name(filepath))[1]

def import_func_wrapper(func, filepath):
    func(filepath=filepath)

def import_mesh(filepath):
    import_func = {
        '.obj': bpy.ops.wm.obj_import,
        '.ply': bpy.ops.wm.ply_import,
        '.stl': bpy.ops.import_mesh.stl,
        '.wrl': bpy.ops.import_scene.x3d,
        '.x3d': bpy.ops.import_scene.x3d,
    }

    stdout = io.StringIO()
    with redirect_stdout(stdout):
        import_func_wrapper(import_func[file_suffix(filepath)], filepath=filepath)
        stdout.seek(0)
        return stdout.read()

if "--" not in argv:
    argv = [] # as if no args are passed
else:
    argv = argv[argv.index("--") + 1:]
parser = argparse.ArgumentParser(description='Blender mesh file to GLB conversion tool')
parser.add_argument('-i', '--input', help='mesh file to be converted')
parser.add_argument('-o', '--output', help='output file')
parser.add_argument('--backface', action='store_true')
args = parser.parse_args(argv)

if not (args.input and args.output):
    fail('Command line arguments not supplied or inappropriate')

try: 
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    if len(bpy.data.objects) != 0:
        err_msg = 'Error deleting Blender scene objects'
        exit(1)
    
    stdout = import_mesh(args.input)
    if len(bpy.data.objects) == 0:
        # likely invalid file error, not an easy way to capture this from Blender
        fail(stdout.replace("\n", "; "))
            
    # Disable backface culling
    for eachMat in bpy.data.materials:
        eachMat.use_backface_culling = args.backface
    # Compress later with gltf-transform

    bpy.ops.export_scene.gltf(
      filepath=args.output,
      export_draco_mesh_compression_enable=False
    )

except Exception as e:
    fail(str(e).replace("\n", "; "))

print('Successfully converted')