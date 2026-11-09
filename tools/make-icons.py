"""Regenerate the centered-moon app icons. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
size, scale = 256, 4
background, moon = '#17263d', '#efbc84'
mask = Image.new('L', (size * scale, size * scale), 0)
draw = ImageDraw.Draw(mask)
def box(values): return tuple(int(v * scale) for v in values)
draw.ellipse(box((48, 53, 183, 188)), fill=255)
draw.ellipse(box((88, 31, 207, 150)), fill=0)
bounds = mask.getbbox()
cropped = mask.crop(bounds)
left = (size * scale - cropped.width) // 2
top = (size * scale - cropped.height) // 2
centered = Image.new('L', mask.size, 0)
centered.paste(cropped, (left, top))
image = Image.new('RGB', mask.size, background)
image.paste(moon, (0, 0, *image.size), centered)
for name, output_size in [('icon.png', 80), ('largeIcon.png', 130)]:
    image.resize((output_size, output_size), Image.Resampling.LANCZOS).save(root / 'app' / name)
# Keep the vector source consistent with the same centered silhouette.
dx, dy = (left - bounds[0]) / scale, (top - bounds[1]) / scale
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><mask id="moon"><rect width="256" height="256" fill="black"/><circle cx="115.5" cy="120.5" r="67.5" fill="white"/><circle cx="147.5" cy="90.5" r="59.5" fill="black"/></mask></defs><rect width="256" height="256" fill="{background}"/><g transform="translate({dx:g} {dy:g})"><rect width="256" height="256" fill="{moon}" mask="url(#moon)"/></g></svg>
'''
(root / 'app/icon.svg').write_text(svg, encoding='utf-8', newline='\n')
