import sys, json
from PIL import Image, ImageChops
dir_a, dir_b = sys.argv[1], sys.argv[2]
report = []
for idx in sys.argv[3:]:
    i = int(idx)
    a = Image.open(f"{dir_a}/f_{i:04d}.png").convert("RGB")
    b = Image.open(f"{dir_b}/f_{i:04d}.png").convert("RGB")
    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    mx = max(ext[1] for ext in diff.getextrema()) if bbox else 0
    if bbox:
        r, g, bl = diff.split()
        mask = ImageChops.lighter(ImageChops.lighter(r, g), bl).point(lambda p: 255 if p > 0 else 0)
        changed = mask.histogram()[255]
    else:
        changed = 0
    report.append({"frame": i, "identical": bbox is None, "max": mx, "changed": changed, "total": a.width * a.height})
print(json.dumps(report))
