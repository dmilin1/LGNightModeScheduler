"""Regenerate the committed app icons. Requires Pillow only when editing artwork."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
scale = 4
size = 256
image = Image.new('RGBA', (size*scale, size*scale), '#17263d')
draw = ImageDraw.Draw(image)
def box(values): return tuple(int(v*scale) for v in values)
draw.ellipse(box((35,35,221,221)), outline='#7591b4', width=3*scale)
draw.ellipse(box((48,53,183,188)), fill='#efbc84')
draw.ellipse(box((88,31,207,150)), fill='#17263d')
draw.ellipse(box((175,66,187,78)), fill='#c8d8e9')
draw.line(box((182,115,202,115)), fill='#c8d8e9', width=4*scale)
draw.line(box((192,105,192,125)), fill='#c8d8e9', width=4*scale)
for name, output_size in [('icon.png',80), ('largeIcon.png',130)]:
    image.resize((output_size,output_size), Image.Resampling.LANCZOS).save(root / 'app' / name)
