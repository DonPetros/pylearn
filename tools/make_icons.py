"""Generate PyLearn icons (cyberpunk style) with Pillow. Run: python3 tools/make_icons.py"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")
ORB = "/usr/share/fonts/truetype/sand-box/google/Orbitron/Orbitron-VariableFont_wght.ttf"
MONO = "/usr/share/fonts/truetype/sand-box/google/JetBrains Mono/JetBrainsMono-VariableFont_wght.ttf"
BG, CY, MG, YL = (10, 10, 18), (0, 240, 255), (255, 43, 214), (249, 248, 113)

def glow_layer(size, draw_fn, radius):
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer))
    g = layer.filter(ImageFilter.GaussianBlur(radius))
    return g, layer

def make(size=1024, pad=0.0):
    S = size
    img = Image.new("RGBA", (S, S), BG + (255,))
    d = ImageDraw.Draw(img)
    # grid
    step = S // 16
    for x in range(0, S, step):
        d.line([(x, 0), (x, S)], fill=(0, 240, 255, 22), width=2)
        d.line([(0, x), (S, x)], fill=(0, 240, 255, 22), width=2)
    # magenta haze top-left, cyan bottom-right
    haze = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(haze)
    hd.ellipse([-S*0.3, -S*0.3, S*0.6, S*0.5], fill=MG + (70,))
    hd.ellipse([S*0.45, S*0.55, S*1.3, S*1.3], fill=CY + (60,))
    img = Image.alpha_composite(img, haze.filter(ImageFilter.GaussianBlur(S*0.12)))
    inset = int(S * (0.12 + pad))
    def frame(dr, col=CY + (255,)):
        dr.rounded_rectangle([inset, inset, S - inset, S - inset], radius=int(S*0.09), outline=col, width=int(S*0.018))
    g, l = glow_layer(S, frame, S*0.02)
    img = Image.alpha_composite(img, g); img = Image.alpha_composite(img, g); img = Image.alpha_composite(img, l)
    font = ImageFont.truetype(ORB, int(S * (0.36 - pad*0.9)))
    try: font.set_variation_by_name("Black")
    except Exception: pass
    text = "Py"
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx, ty = (S - tw) / 2 - bbox[0] - S*0.03, (S - th) / 2 - bbox[1] - S*0.04
    off = S * 0.018
    def shadow(dr): dr.text((tx + off, ty + off), text, font=font, fill=MG + (255,))
    def main(dr): dr.text((tx, ty), text, font=font, fill=CY + (255,))
    g, l = glow_layer(S, shadow, S*0.012); img = Image.alpha_composite(img, g); img = Image.alpha_composite(img, l)
    g, l = glow_layer(S, main, S*0.02); img = Image.alpha_composite(img, g); img = Image.alpha_composite(img, g); img = Image.alpha_composite(img, l)
    # yellow cursor block
    cx0 = tx + tw + S*0.035; cy1 = ty + bbox[3]; cw = S*0.075; ch = S*0.03
    def cur(dr): dr.rectangle([cx0, cy1 - ch, cx0 + cw, cy1], fill=YL + (255,))
    g, l = glow_layer(S, cur, S*0.015); img = Image.alpha_composite(img, g); img = Image.alpha_composite(img, l)
    # small mono tag
    mf = ImageFont.truetype(MONO, int(S * (0.055 - pad*0.15)))
    lab = ">_ learn"
    lb = d.textbbox((0, 0), lab, font=mf)
    def tag(dr): dr.text(((S - (lb[2]-lb[0]))/2, S - inset - S*0.13), lab, font=mf, fill=YL + (255,))
    g, l = glow_layer(S, tag, S*0.008); img = Image.alpha_composite(img, g); img = Image.alpha_composite(img, l)
    return img.convert("RGB")

big = make()
for n in (180, 192, 512):
    big.resize((n, n), Image.LANCZOS).save(os.path.join(OUT, f"icon-{n}.png"), optimize=True)
big.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, "favicon-32.png"))
make(pad=0.07).resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-maskable-512.png"), optimize=True)
print("icons written")
