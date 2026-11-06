from PIL import Image, ImageDraw, ImageFont
C={'o':'2a1f1a','H':'ffe27a','G':'e3a521','D':'a86a12','g':'5fa83a','q':'3f7a26','e':'7a5230','E':'5c3c22',
's':'8a8a8f','S':'b9b9be','t':'5e5e63','#':'ffffff','k':'141414','P':'c48af5','p':'7a2fc4','u':'3d1670','V':'eedcff',
'n':'8e2a2a','N':'b8452f','b':'3a7bd5','B':'8fc0f5','w':'9c6b3a','x':'6b4423','W':'c4915a','O':'1d1428','Q':'ece6dc','Z':'d8d0c3','z':'bdb4a5','R':'e86a55','r':'c8402f','K':'2b2f3a','J':'454c5e'}
P={k:tuple(int(v[i:i+2],16) for i in (0,2,4)) for k,v in C.items()}
GB=["HHHHHHHG","HGGGGGGD","HGGGGGGD","HGGGGGGD","HGGGGGGD","HGGGGGGD","HGGGGGGD","GDDDDDDD"]
RIM=["HHHHHHHG","H......D","H......D","H......D","H......D","H......D","H......D","GDDDDDDD"]
E8=["........"]*8
GRASS=["gqggqggq","g.q..g.q"]+["........"]*6
SW=["uupp","upPP","pPVp","pVPp","PPpu","ppuu"]
# Style A: gold block, icon on front, raised rim on hat layer
roadA=["gggHGggg","ggqHGggg","ggHGGDgg","gqHGGDgg","gHGGGGDg","gHGGGGDq","HGGGGGGD","HGGGGGGD"]
portA=["sHHHHHGs"]+["sH"+r+"Ds" for r in SW]+["sGDDDDDs"]
dieF=["HHHHHHHG","HkkGGkkD","HkkGGkkD","HGGkkGGD","HGGkkGGD","HkkGGkkD","HkkGGkkD","GDDDDDDD"]
dieT=["HHHHHHHG","HGGGGGGD","HGGGGGGD","HGGkkGGD","HGGkkGGD","HGGGGGGD","HGGGGGGD","GDDDDDDD"]
dieR=["HHHHHHHG","HkkGGGGD","HkkGGGGD","HGGGGGGD","HGGGGGGD","HGGGGkkD","HGGGGkkD","GDDDDDDD"]
# Style B: diorama block, scene on top, raised details on hat layer
roadBtop=["gggGGggg","gqgGGgqg","ggg##ggg","gggGGggg","gqgGGggg","ggg##gqg","gggGGggg","gqgGGggg"]
roadBside=["gqgggqgg","qqqqqqqq","eeeEeeee","eEeeeeEe","eeeeEeee","eEeeeeee","eeeEeeEe","EEEEEEEE"]
roadBfront=["gqgGGgqg","qqqDDqqq","eeeEeeee","eEeeeeEe","eeeeEeee","eEeeeeee","eeeEeeEe","EEEEEEEE"]
roadBhatTop=["...HG...","...HG...","........","...HG...","...HG...","........","...HG...","...HG..."]
portBtop=["NnNnnNnN","nOOOOOOn","nOOOOOOn","NnNnnNnN","nNnNNnNn","NnnNnNnN","nNnNnnNn","NnNnNnNn"]
portBfront=["nHHHHHGn"]+["nH"+r+"Dn" for r in SW]+["nGDDDDDn"]
portBside=["NnNnnNnN","nNnNNnNn","NnnNnNnN","nNnNnnNn","NnNnNnNn","nnNnNNnN","NnNnnNnn","nNnNNnNn"]
portBhatF=[".HHHHHG.",".H....D.",".H....D.",".H....D.",".H....D.",".H....D.",".H....D.",".GDDDDD."]
# Style C: trophy plinth, gold top half, dark wood base with gold plate; hat layer raises the plate
plinth=["HHHHHHHG","HGGGGGGD","HGGGGGGD","HGGGGGGD","oooooooo","xwwwwwwx","xwwwwwwx","xxxxxxxx"]
def plF(icon5): return [ "H"+r+"D" if i<4 else plinth[i] for i,r in enumerate(icon5)] 
roadC=["HGgHGgGD","HggHGgqD","HgHGGDgD","HHGGGGDD","oooooooo","xwHHHGwx","xwGDDDwx","xxxxxxxx"]
portC=["HsHHGsGD","HsHVpDsD","HsHpPDsD","HsGDDDsD","oooooooo","xwHHHGwx","xwGDDDwx","xxxxxxxx"]
plateHat=["........","........","........","........","........",".HHHHHG.",".GDDDDD.","........"]

def proj(x,y,z,S,ox,oy): return (ox+(x-z)*S*0.866, oy+(x+z)*S*0.5-y*S)
def face(d,tex,which,S,ox,oy,scale=1.0,shade=1.0):
    c=4; k=scale
    def p(x,y,z): return proj(c+(x-c)*k,c+(y-c)*k,c+(z-c)*k,S,ox,oy)
    for j in range(8):
        for i in range(8):
            ch=tex[j][i]
            if ch=='.': continue
            if which=='top': q=[(i,8,j),(i+1,8,j),(i+1,8,j+1),(i,8,j+1)]
            elif which=='front': q=[(i,8-j,8),(i+1,8-j,8),(i+1,7-j,8),(i,7-j,8)]
            else: q=[(8,8-j,8-i),(8,8-j,7-i),(8,7-j,7-i),(8,7-j,8-i)]
            col=tuple(int(v*shade) for v in P[ch])
            d.polygon([p(*v) for v in q],fill=col)
def head(top,front,right,hat=None,S=14):
    im=Image.new("RGBA",(int(S*16),int(S*17)),(0,0,0,0)); d=ImageDraw.Draw(im)
    ox,oy=S*8,S*9.6
    for w,t,sh in (('top',top,1.0),('front',front,0.82),('right',right,0.64)): face(d,t,w,S,ox,oy,1.0,sh)
    if hat:
        for w,t,sh in (('top',hat[0],1.0),('front',hat[1],0.82),('right',hat[2],0.64)): face(d,t,w,S,ox,oy,9/8,sh)
    return im

GT=["gggggqgg","ggqggggg","gggggggg","gqgggggq","gggggggg","ggggqggg","qggggggg","gggggggq"]
GS=["gggggggg","gqgggqgg","egeeeqee","eeeeeEee","eEeeeeee","eeeeeeEe","eeeEeeee","eeeeeeee"]
NR=["NNnNNNNN","NnnNNNnN","NNNNnNNN","nNNNnnNN","NNNNNNNn","NnNNNNNN","NNNnNNnN","NNNNNNNN"]
QZ=["QQQQQQQQ","QQQQQQQZ","QQQQQQQZ","QQQQQQQZ","QQQQQQQZ","QQQQQQQZ","QQQQQQQZ","ZZZZZZZZ"]
PL=["WWWWWWWW","wwwwwwwW","wwwwwwww","xxxxxxxx","WWWWWWWW","wwWwwwww","wwwwwwww","xxxxxxxx"]
OV=["gqggqggq","g..g...q"]+["........"]*6
# road
roadT=["ggggHGDg","gqgHGDgg","ggHGDggg","ggHGDggg","gggHGDgg","ggggHGDg","gqggHGDg","gggHGDgg"]
roadF=["gggHGDgg","gqgDDDgg"]+GS[2:]
road=head(roadT,roadF,GS,(E8,["gqg...gq","g......q"]+["........"]*6,OV),S=16)
# bridge
brT=["ggbBbbgg","gqbbBbgg","ggBbbbqg","ggbbBbgg","gqbBbbgg","ggbbbBgg","gHHHHGDg","gHHGGGDg"]
brF=["gHHGGGDg","gHbbbbDq","eGbBbbDe","eebbBbee","eEbbbbee","eeebbeEe","eeeeeeee","eeeEeeee"]
bridge=head(brT,brF,GS,(E8,["g......g"]+["........"]*7,OV),S=16)
# shop
shT=["RR##RR##"]*8
shF=["RR##RR##","rr##rr##","WxxxxxxW","WxxHGxxW","WxxGDxxW","oooooooo","WWWWWWWW","wwwwwwww"]
shR=["RR##RR##","rr##rr##"]+PL[2:]
shop=head(shT,shF,shR,(E8,["RR##RR##"]+["........"]*7,["RR##RR##"]+["........"]*7),S=16)
# die
die=head(dieT,dieF,dieR,None,S=16)
# portal
pF=["NHHHHHGN"]+["NH"+r+"DN" for r in SW]+["NGDDDDDN"]
pT=["NNnNNNNN","NOOOOOON","NOOOOOON","nNNNnnNN","NNNNNNNn","NnNNNNNN","NNNnNNnN","NNNNNNNN"]
portal=head(pT,pF,NR,None,S=16)
# temple
tF=["QQQQQQQQ","QQQHGQQQ","QHHHGGDQ","QGGGGGDQ","QHQHGQDQ","QHQHGQDQ","HHHHGGGD","GGGGGGDD"]
sF=["KJ#HG#JK","KK#HG#KK","KKJHGJKK","KKKHGKKK","KKKHGKKK","KKHHGDKK","KKKHDKKK","KKKKKKKK"]
sS=["JJJJJJJJ","KKKKKKKJ","KKKKKKKJ","KKKKKKKJ","KKKKKKKJ","KKKKKKKJ","KKKKKKKJ","KKKKKKKK"]
temple=head(sS,sF,sS,None,S=16)
# cleanup
cT=['gggggqgg', 'ggqggggg', 'gggggggg', 'gqgggggq', 'gggggDgg', 'ggggqGgg', 'qggDGGgg', 'ggggGggq']
cF=['ggggGggg', 'gqDgGqGD', 'egGeGqGe', 'eeGGGGGe', 'eEeGHGee', 'eeeeHeEe', 'eeeDGeee', 'eeeHGeee']
cR=['gggggggg', 'gqgggqgg', 'egeDDqee', 'eeeGGEee', 'eEeeGeee', 'eeeeGGEe', 'eeeEeGee', 'eeeeeHee']
OVF=['gqgg.ggq','g..g...q']+['........']*6
OVR=OV
clean=head(cT,cF,cR,(E8,OVF,OVR),S=16)
items=[("Road Runner",road),("Bridge Builder",bridge),("Shopkeeper",shop),("Game Master",die),("Highway Builder",portal),("Public Service Agent",temple),("Cleanup Crew",clean)]
F=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",22); f=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",16)
cw,rh=290,330; sh=Image.new("RGB",(30+cw*4,90+rh*2),(30,30,34)); d=ImageDraw.Draw(sh)
d.text((30,26),"Voxel trophy heads · all badges (gold)",font=F,fill=(255,226,122))
for k,(n,im) in enumerate(items):
    c,r=k%4,k//4; x=20+c*cw; y=70+r*rh
    sh.paste(im,(x,y),im); d.text((x+40,y+290),n,font=f,fill=(170,170,180))
sh.save("/home/claude/badges/heads/trophy_all.png")

T={"Bronze":('f0b27a','c47a3a','7d4520'),"Silver":('f4f6f8','b8c0c8','6f7a85'),"Gold":('ffe27a','e3a521','a86a12'),"Diamond":('c9fbff','4fd8e0','1f8a9a')}
sh=Image.new("RGB",(30+290*4,380),(30,30,34)); d=ImageDraw.Draw(sh)
d.text((30,26),"Cleanup Crew trophy · all tiers",font=F,fill=(255,226,122))
for i,(t,cols) in enumerate(T.items()):
    P['H'],P['G'],P['D']=[tuple(int(c[k:k+2],16) for k in (0,2,4)) for c in cols]
    im=head(cT,cF,cR,(E8,OVF,OVR),S=16); sh.paste(im,(20+i*290,60),im); d.text((60+i*290,345),t,font=f,fill=(170,170,180))
sh.save("/home/claude/badges/heads/cleanup_tiers.png")
