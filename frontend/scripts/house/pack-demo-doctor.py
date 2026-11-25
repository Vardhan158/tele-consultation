"""Pack the local Blender renders into small WebP atlases."""
from pathlib import Path
import sys
from PIL import Image

frames = Path(sys.argv[1])
output = Path(__file__).resolve().parents[2] / 'public/assets/house/laptop-ui'
for page in range(2):
    atlas = Image.new('RGB', (2880, 810))
    for tile in range(18):
        with Image.open(frames / f'doctor-{page * 18 + tile:02d}.png') as image:
            atlas.paste(image, (480 * (tile % 6), 270 * (tile // 6)))
    atlas.save(output / f'doctor-{page}.webp', quality=79, method=6)
