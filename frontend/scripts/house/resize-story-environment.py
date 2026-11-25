from pathlib import Path
import bpy
source = Path('public/assets/house/daylight.hdr').resolve()
image = bpy.data.images.load(str(source))
if image.size[0] > 512:
    image.scale(512, 256)
    image.file_format = 'HDR'
    image.save()
