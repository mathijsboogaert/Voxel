from PIL import Image, ImageDraw, ImageFont
C={'o':'2a1f1a','k':'141414','P':'c48af5','p':'7a2fc4','u':'3d1670','V':'eedcff','H':'ffe27a','G':'e3a521','D':'a86a12','s':'8a8a8f','S':'b9b9be','t':'5e5e63',
'w':'9c6b3a','W':'c4915a','x':'6b4423','g':'5fa83a','q':'3f7a26','b':'3a7bd5','B':'8fc0f5',
'R':'e86a55','r':'c8402f','v':'8a2620','#':'ffffff','N':'b8452f','n':'8e2a2a','m':'4a1a1a'}
P={k:tuple(int(v[i:i+2],16) for i in (0,2,4)) for k,v in C.items()}
B={
"Road Runner":["oooooooooo","ogggG#Dggo","oggqGGDggo","oggHG#GDgo","ogqHG#GDgo","ogHGGGGGDo","ogHHG#GGDo","oHHGG#GGDo","oHHGGGGDDo","oooooooooo"],
"Bridge Builder":["..........","...oooo...","..oHHHHo..",".oHGGGGDo.","oHGooooGDo","oGo....oDo","ggg....ggg","qqgBbbBgqq","qqqbBbbqqq","qqqbbbbqqq"],
"Shopkeeper":[".oooooooo.","oHrHrHrHro","oooooooooo",".ow....wo.",".ow.HG.wo.",".ow.GD.wo.",".oooooooo.",".oWWWWWWo.",".oxxxxxxo.",".oooooooo."],
"Game Master":[".oooooooo.","oHHHHHHHGo","oHkkGGkkDo","oHkkGGkkDo","oHGGkkGGDo","oHGGkkGGDo","oHkkGGkkDo","oHkkGGkkDo","oDDDDDDDDo",".oooooooo."],
"Highway Builder":[".oHHHHHGo.", ".oHuuppDo.", ".oHupPPDo.", ".oHpPVpDo.", ".oHpVPpDo.", ".oHPPpuDo.", ".oHppuuDo.", ".oGDDDDDo.", "oSSSSSSSSo", "osssssssso"],
"Public Service Agent":["...oooo...",".ooHHGGoo.","oHHHHGGGDo","oooooooooo",".H.H..G.D.",".H.H..G.D.",".H.H..G.D.",".H.H..G.D.","oooooooooo","HHHHHGGGDD"],
"Cleanup Crew":["........o.",".#.....owo","###...owo.",".#...owo..","....oxxo..","...oHGGo..","..oHHGDo..",".oHGGDDo.S",".oHGDDo.SS",".ooooo...."],
}
def img(g,n):
    im=Image.new("RGBA",(n,n),(0,0,0,0)); oy=(n-len(g))//2
    for y,r in enumerate(g):
        assert len(r)==n,(n,r)
        for x,c in enumerate(r):
            if c!='.': im.putpixel((x,y+oy),P[c]+(255,))
    return im
F=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",22)
f=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",16)
fn=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",28)
S=10; XI,XP=320,460; rowh=130; W,H=860,110+rowh*len(B)
sh=Image.new("RGB",(W,H),(30,30,34)); d=ImageDraw.Draw(sh)
d.text((30,28),"Voxel Badges · Gold tier v5 (10×10)",font=F,fill=(255,226,122))
d.text((XI,70),"10×10 zoomed",font=f,fill=(160,160,170)); d.text((XP,70),"Nametag preview (3x)",font=f,fill=(160,160,170))
for j,(name,g) in enumerate(B.items()):
    y=110+j*rowh; d.text((30,y+40),name,font=F,fill=(235,235,240))
    im=img(g,10); im.save(f"/home/claude/badges/v5_{name.lower().replace(' ','_')}.png")
    b=im.resize((100,100),Image.NEAREST); sh.paste(b,(XI,y),b)
    tag=Image.new("RGBA",(330,48),(0,0,0,110)); sh.paste(tag,(XP,y+26),tag)
    d.text((XP+10,y+32),"Mathi_Craft",font=fn,fill=(255,255,255))
    b=im.resize((30,30),Image.NEAREST); sh.paste(b,(XP+190,y+35),b)
sh.save("/home/claude/badges/v5_concepts.png")
