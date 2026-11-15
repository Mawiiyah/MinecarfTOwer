from PIL import Image, ImageDraw
import numpy as np, os, sys

# Cuts the animated dragon sheet (green screen) into sprites:
#   dragon_breath_right / dragon_breath_left : the "BUGA" pose, with the painted fireball
#   dragon_idle_right  / dragon_idle_left    : the "STOP" pose (smoke cut off)
src = sys.argv[1]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "gifts")
im = Image.open(src).convert("RGB")
print(im.size)
# paint over the timeline arrows
ImageDraw.Draw(im).rectangle((495, 418, 548, 455), fill=(0, 255, 0))


def key(box, right_cut=None):
    a = np.array(im.crop(box)).astype(int)
    r, g, bl = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, bl)
    alpha = np.clip((70 - d) * 255 / 40, 0, 255)
    alpha[d < 30] = 255
    g2 = np.minimum(g, np.maximum(r, bl) + 10)
    img = Image.fromarray(np.dstack([r, g2, bl, alpha]).astype(np.uint8), "RGBA")
    if right_cut is not None:
        img = img.crop((0, 0, right_cut, img.height))
    bb = img.getchannel("A").point(lambda v: 255 if v > 128 else 0).getbbox()
    return img.crop(bb)


sprites = {
    "dragon_breath_right": key((0, 42, 488, 284)),
    "dragon_breath_left": key((520, 318, 1010, 532)),
}
idle = key((15, 318, 512, 532), right_cut=352 - 15)
sprites["dragon_idle_right"] = idle
sprites["dragon_idle_left"] = idle.transpose(Image.FLIP_LEFT_RIGHT)
for n, img in sprites.items():
    print(n, img.size)
    img.save(os.path.join(out, n + ".png"))
    # preview with a 50px grid for measuring
    bg = Image.new("RGBA", img.size, (40, 40, 40, 255))
    bg.alpha_composite(img)
    dr = ImageDraw.Draw(bg)
    for x in range(0, img.width, 50):
        dr.line([(x, 0), (x, img.height)], fill=(255, 255, 255, 120))
        dr.text((x + 2, 2), str(x), fill=(255, 255, 0))
    for y in range(0, img.height, 50):
        dr.line([(0, y), (img.width, y)], fill=(255, 255, 255, 120))
        dr.text((2, y + 2), str(y), fill=(255, 255, 0))
    bg.convert("RGB").save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "preview_" + n + ".png"))
