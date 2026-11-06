# Medal logo for the Voxel Badges advancement tab. Usage: python3 badge_logo.py <outdir>
import sys
from PIL import Image
C={'o':'2a1f1a','H':'ffe27a','G':'e3a521','D':'a86a12','R':'e86a55','r':'c8402f','n':'8e2a2a','#':'fff6c8'}
P={k:tuple(int(v[i:i+2],16) for i in (0,2,4)) for k,v in C.items()}
L=[
"..ooo......ooo..",
"..oRro....orRo..",
"...oRro..orRo...",
"....oRroorRo....",
".....oRrrRo.....",
".....oooooo.....",
"....oHHHGGGo....",
"...oHHGGGGGDo...",
"..oHHGGG#GGGDo..",
"..oHGGG###GGDo..",
"..oHG#######Do..",
"..oHGG#####GDo..",
"..oHGG##G##GDo..",
"...oGGGGGGGDo...",
"....oDDDDDDo....",
".....oooooo.....",
]
im=Image.new("RGBA",(16,16),(0,0,0,0))
for y,r in enumerate(L):
    assert len(r)==16,(y,r)
    for x,c in enumerate(r):
        if c!='.': im.putpixel((x,y),P[c]+(255,))
im.save(sys.argv[1]+"/logo.png")
big=Image.new("RGBA",(256,256),(150,90,60,255)); z=im.resize((256,256),Image.NEAREST); big.paste(z,(0,0),z); big.save(sys.argv[1]+"/logo_preview.png")
