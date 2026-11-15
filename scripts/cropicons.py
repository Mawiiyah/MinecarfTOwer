from PIL import Image
import numpy as np, os
src=r"C:/Users/`/.gemini/antigravity-cli/brain/3c3e09ae-ffc3-4b3f-8117-48eaf9a4a257/.user_uploaded/uploaded_media_0_1794659379894.jpg"
out=r"C:/Users/`/MinecarfTOwer/public/gifts"
os.makedirs(out,exist_ok=True)
im=Image.open(src).convert("RGB")
boxes={"rose":(60,70,195,181),"tnt":(345,60,455,181),"fingerheart":(90,220,185,328),"tntrain":(335,220,445,326),
"iloveyou":(50,380,205,535),"dragon":(325,390,455,535),"doughnut":(570,65,705,190),"emptybox":(830,75,970,190),
"perfume":(580,260,695,390),"fillbox":(835,255,975,385),"hat":(585,430,700,540),"win":(845,420,965,535)}
for n,b in boxes.items():
    a=np.array(im.crop(b)).astype(int)
    r,g,bl=a[...,0],a[...,1],a[...,2]
    d=g-np.maximum(r,bl)
    alpha=np.clip((70-d)*255/40,0,255)
    alpha[d<30]=255
    # despill
    g2=np.minimum(g,np.maximum(r,bl)+10)
    rgba=np.dstack([r,g2,bl,alpha]).astype(np.uint8)
    img=Image.fromarray(rgba,"RGBA")
    bb=img.getchannel("A").point(lambda v:255 if v>128 else 0).getbbox()
    img=img.crop(bb)
    s=max(img.size); c=Image.new("RGBA",(s,s),(0,0,0,0)); c.paste(img,((s-img.width)//2,(s-img.height)//2))
    c.resize((256,256),Image.LANCZOS).save(f"{out}/{n}.png")
sheet=Image.new("RGBA",(256*6,512),(60,60,60,255))
for i,n in enumerate(boxes):
    t=Image.open(f"{out}/{n}.png"); sheet.alpha_composite(t,((i%6)*256,(i//6)*256))
sheet.save(r"C:/Users/`/.gemini/antigravity-cli/brain/3c3e09ae-ffc3-4b3f-8117-48eaf9a4a257/scratch_sheet.png")


