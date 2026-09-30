"""Third animation pass: continuous acting, contact poses and timed dissolves.

Reuses the original vector artwork and score; no external or personal media.
"""
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('starlight',Path(__file__).with_name('make-demo-trailer.py'))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
OUT=ROOT/'output/demo-starlight-v3'
MEDIA=ROOT/'ComfyUI_windows_portable/ComfyUI/input/demo-starlight-v3'
W,H,FPS,RATE=1280,720,30,48000
INK,CREAM,GOLD=base.INK,base.CREAM,base.GOLD
ease=base.smooth


def keys(t, points):
    if t<=points[0][0]:return points[0][1]
    for (a,x),(b,y) in zip(points,points[1:]):
        if t<=b:return x+(y-x)*ease((t-a)/(b-a))
    return points[-1][1]


def bezier(p0,p1,p2,p3,u):
    return tuple((1-u)**3*p0[i]+3*(1-u)**2*u*p1[i]+3*(1-u)*u*u*p2[i]+u**3*p3[i] for i in range(2))


def joint(root,end,l1,l2,side=1):
    dx,dy=end[0]-root[0],end[1]-root[1]
    length=max(.01,min(math.hypot(dx,dy),l1+l2-.01))
    angle=math.atan2(dy,dx)+side*math.acos(max(-1,min(1,(l1*l1+length*length-l2*l2)/(2*l1*length))))
    return root[0]+l1*math.cos(angle),root[1]+l1*math.sin(angle)


class Pen:
    """Draw character parts at twice resolution before downsampling."""
    def __init__(self,im):self.d=ImageDraw.Draw(im)
    def box(self,b):return tuple(v*2 for v in b)
    def line(self,p,color,width):self.d.line([(x*2,y*2) for x,y in p],fill=color,width=round(width*2),joint='curve')
    def oval(self,b,color,outline=None,width=1):self.d.ellipse(self.box(b),fill=color,outline=outline,width=round(width*2))
    def rect(self,b,r,color,outline=None,width=1):self.d.rounded_rectangle(self.box(b),r*2,fill=color,outline=outline,width=round(width*2))
    def poly(self,p,color):self.d.polygon([(x*2,y*2) for x,y in p],fill=color)


def robot(im,x,y,t,s=1,walk=0,lean=0,crouch=0,look=(0,0),tilt=0,target=None,wave_hand=0,happy=0,travel=None,settle=0):
    a=Image.new('RGBA',(920,940));d=Pen(a)
    cx,ground=230,430
    cycle=(travel or 0)/48
    bob=math.sin(cycle*4*math.pi)*3 if travel is not None else 0
    by=ground-155+crouch-bob
    bx=cx+lean
    d.oval((cx-84,ground-8,cx+84,ground+13),(4,18,27,65))
    for side in [-1,1]:
        phase=cycle+(0 if side==-1 else .5)
        n=math.floor(phase);u=max(0,(phase-n-.6)/.4)
        shift=48*(n+ease(u))-travel if travel is not None else 0
        spread=8+16*settle if travel is not None else 24
        foot=(cx+side*spread+shift*(1-settle),ground-(math.sin(math.pi*u)*24 if travel is not None else 0)*(1-settle)-math.sin(settle*math.pi)*8)
        hip=(bx+side*(15+16*settle if travel is not None else 31),by+57)
        knee=joint(hip,(foot[0],foot[1]-10),49,52,-1)
        d.line([hip,knee,(foot[0],foot[1]-9)],INK,23)
        d.line([hip,knee,(foot[0],foot[1]-9)],'#577987',14)
        d.line([(hip[0]-3,hip[1]),(knee[0]-3,knee[1]),(foot[0]-3,foot[1]-13)],'#c9ddc5',3)
        d.oval((knee[0]-9,knee[1]-9,knee[0]+9,knee[1]+9),'#d0dcc0',INK,2)
        d.rect((foot[0]-24,foot[1]-17,foot[0]+31,foot[1]+3),9,'#719aa5',INK,3)
        d.line([(foot[0]-15,foot[1]-11),(foot[0]+21,foot[1]-11)],'#b1d5c8',3)
    # Arms solve toward world-space contact targets, keeping hands on the prop.
    for side in [-1,1]:
        shoulder=(bx+side*58,by-29)
        swing=math.sin(cycle*2*math.pi)*24*walk*(-side)
        hand=(bx+side*83+swing,by+65)
        if side==1 and target:
            hand=(cx+(target[0]-x)/s,ground+(target[1]-y)/s)
        if side==-1 and wave_hand:
            hand=(bx-102-16*math.sin(t*7)*wave_hand,by+65-155*wave_hand)
        elbow=joint(shoulder,hand,67,66,side)
        d.line([shoulder,elbow,hand],INK,22)
        d.line([shoulder,elbow,hand],'#6d9699',14)
        d.line([(p[0]-3,p[1]-2) for p in [shoulder,elbow,hand]],'#dae4c7',3)
        d.oval((elbow[0]-8,elbow[1]-8,elbow[0]+8,elbow[1]+8),'#d0dcc0',INK,2)
        d.oval((hand[0]-13,hand[1]-13,hand[0]+13,hand[1]+13),'#d6e4c8',INK,3)
        d.line([(hand[0]+1,hand[1]-6),(hand[0]+7,hand[1]+4)],'#719393',2)
    d.rect((bx-57,by-49,bx+57,by+63),24,'#a9c9b7',INK,4)
    d.rect((bx-48,by-41,bx+48,by+48),20,'#c0d7be')
    d.poly([(bx+23,by-41),(bx+47,by-24),(bx+48,by+34),(bx+35,by+49),(bx-31,by+49),(bx-43,by+36),(bx+23,by+29)],'#719a98')
    d.line([(bx-45,by+28),(bx-45,by-15),(bx-36,by-32),(bx+7,by-35)],'#f2ebc9',3)
    d.line([(bx+49,by-16),(bx+49,by+33)],'#79c4c5',2)
    for i in range(4):
        d.line([(bx-37+i*8,by-22),(bx-33+i*8,by-26)],'#729591',1)
    for i in range(3):d.line([(bx+31,by+i*7-5),(bx+42,by+i*7-5)],'#365767',2)
    d.line([(bx-35,by+39),(bx-14,by+40)],'#466978',1)
    d.rect((bx-30,by-8,bx+30,by+30),10,'#426879',INK,3)
    d.oval((bx-8,by+2,bx+8,by+18),GOLD)
    for xx in [-39,39]:
        d.oval((bx+xx-3,by+44,bx+xx+3,by+50),'#567e87')
    # Scarf trails behind the torso and settles with phase delay.
    path=[bezier((bx-25,by-42),(bx-65,by-23),(bx-82,by-30+math.sin(t*4-.7)*14),(bx-121,by-13+math.sin(t*4-1.4)*18),u) for u in np.linspace(0,1,20)]
    d.line(path,INK,24);d.line(path,'#eeb24d',18)
    d.line([(p[0],p[1]-4) for p in path],GOLD,3)
    # Head is independent of body pose; eyes track the action.
    head=Image.new('RGBA',(420,310));hd=Pen(head)
    hd.line([(105,21),(105,6)],'#71979e',6)
    hd.oval((98,0,112,14),GOLD,INK,2)
    hd.rect((16,24,194,132),33,'#c9ddc8',INK,4)
    hd.poly([(165,30),(185,44),(189,108),(170,125),(51,128),(34,119),(158,117)],'#7baca5')
    hd.line([(31,52),(37,39),(52,32),(133,31)],'#faf2d2',3)
    hd.line([(189,53),(189,103)],'#89d4cd',2)
    hd.rect((30,40,180,111),23,'#173f50')
    hd.line([(47,49),(147,49),(166,56)],'#3c6c78',2)
    hd.line([(49,104),(162,104)],'#081f32',3)
    for xx in [45,51,58]:hd.line([(xx,29),(xx+4,27)],'#6a9293',1)
    for yy in [49,56,63]:hd.line([(20,yy),(25,yy-1)],'#436b79',1)
    blink=abs(math.sin(t*1.07))>.998
    for ex in [70,139]:
        if blink:hd.line([(ex-10,74),(ex+10,74)],'#aaf5dc',4)
        elif happy>.5:
            pts=[(ex-12+u*24,78-9*math.sin(u*math.pi)) for u in np.linspace(0,1,14)]
            hd.line(pts,'#aaf5dc',5)
        else:
            hd.rect((ex-10+look[0]*6,56+look[1]*5,ex+10+look[0]*6,83+look[1]*5),8,'#aaf5dc')
            hd.oval((ex-4+look[0]*6,59+look[1]*5,ex+1+look[0]*6,65+look[1]*5),'#edfff4')
    hd.line([(95,94),(102,98),(111,98),(119,93)],'#aaf5dc',3)
    for xx in [24,186]:hd.oval((xx-3,73,xx+3,79),'#719393')
    head=head.rotate(tilt,resample=Image.Resampling.BICUBIC,expand=False,center=(210,156))
    a.alpha_composite(head,(round((bx-105)*2),round((by-184)*2)))
    d.rect((bx-56,by-53,bx+55,by-32),8,GOLD,INK,3)
    d.poly([(bx-51,by-39),(bx+51,by-43),(bx+49,by-34),(bx-46,by-34)],'#bd793d')
    d.line([(bx-42,by-49),(bx+29,by-49)],'#fff0ad',2)
    for xx in [-35,-28,-21]:d.line([(bx+xx,by-45),(bx+xx+4,by-37)],'#d99242',1)
    a=a.resize((round(a.width*s/2),round(a.height*s/2)),Image.Resampling.LANCZOS)
    im.paste(a,(round(x-cx*s),round(y-ground*s)),a)


def bird(im,x,y,t,s=.7,flap=1,bank=0,face=1):
    a=Image.new('RGBA',(420,360));d=Pen(a)
    cy=90
    # Far and near wings use different silhouettes and a delayed stroke.
    for far in [True,False]:
        if far:
            angle=math.sin(t*17+.5)*.9*flap-.3
            pts=[(98,cy),(98-56*math.cos(angle),cy-56*math.sin(angle)-15),(68,cy+7)]
            d.poly(pts,'#93485e')
        else:
            d.poly([(55,cy+13),(22,cy-8+math.sin(t*9)*7),(35,cy+36),(70,cy+27)],'#b95c69')
            d.oval((49,cy-30,142,cy+39),'#ec897a',INK,3)
            d.oval((65,cy+8,130,cy+34),'#b96571')
            d.oval((87,cy-36,146,cy+16),'#f7ae8e',INK,3)
            d.line([(95,cy-27),(106,cy-31),(120,cy-29)],'#ffe4b6',2)
            d.poly([(137,cy-12),(166,cy-3),(139,cy+7)],GOLD)
            d.oval((120,cy-22,128,cy-13),INK)
            d.oval((122,cy-22,125,cy-19),CREAM)
            d.poly([(101,cy-31),(89,cy-52),(114,cy-33)],'#ed897c')
            angle=math.sin(t*17)*1.25*flap-.35
            tip=(92-55*math.cos(angle),cy-50*math.sin(angle))
            d.poly([(99,cy-9),tip,(tip[0]+9,tip[1]+18),(82,cy+24),(109,cy+7)],'#b75465')
            d.line([(96,cy),(tip[0]+9,tip[1]+9)],'#e28380',2)
            for k in range(3):d.line([(95+k*3,cy+5+k*3),(tip[0]+12+k*4,tip[1]+10+k*2)],'#efaa92',1)
            for xx in [87,108]:d.line([(xx,cy+33),(xx-5,cy+45),(xx+6,cy+45)],GOLD,3)
    a=a.rotate(bank,resample=Image.Resampling.BICUBIC,center=(210,180))
    if face<0:a=a.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    a=a.resize((round(210*s),round(180*s)),Image.Resampling.LANCZOS)
    im.paste(a,(round(x-105*s),round(y-90*s)),a)


def caption(im,words,t,start,end,xy=(76,87),size=27):
    alpha=ease((t-start)/.7)*(1-ease((t-end+.6)/.6))
    if alpha<=0:return
    layer=Image.new('RGBA',im.size)
    base.text(layer,(xy[0],xy[1]+16*(1-alpha)),words,size,bold=True)
    layer.putalpha(layer.getchannel('A').point(lambda v:round(v*alpha)))
    im.paste(layer,(0,0),layer)


def telescope(im,t):
    d=ImageDraw.Draw(im)
    for end in [(765,632),(966,632),(841,642)]:
        d.line([(839,389),end],fill=INK,width=22);d.line([(839,389),end],fill='#769da3',width=14)
    a=Image.new('RGBA',(W,H));p=ImageDraw.Draw(a)
    p.polygon([(649,373),(684,448),(1060,259),(1026,184)],fill='#9bbdb1',outline=INK,width=5)
    p.polygon([(684,430),(1048,246),(1056,259),(684,448)],fill='#4f7c83')
    p.line([(700,382),(1014,222)],fill='#ebebc7',width=5)
    p.line([(701,394),(1016,234)],fill='#739b97',width=1)
    for xx,yy in [(742,390),(853,333),(962,278)]:
        p.line([(xx,yy),(xx+5,yy+10)],fill='#3f6778',width=2)
    for poly in [[(649,368),(673,418),(730,390),(707,340)],[(989,188),(1024,265),(1072,244),(1037,165)]]:
        p.polygon(poly,fill='#ddbf86',outline=INK,width=5)
    p.line([(1033,175),(1064,239)],fill='#9aeadd' if t>19.1 else '#365469',width=10)
    angle=keys(t,[(0,0),(17.8,0),(18.3,-2),(20,10),(21,8)])
    a=a.rotate(angle,resample=Image.Resampling.BICUBIC,center=(839,389))
    im.paste(a,(0,0),a)
    d=ImageDraw.Draw(im);d.ellipse((800,350,878,428),fill='#ddbf86',outline=INK,width=4)
    d.ellipse((820,370,858,408),fill='#274958',outline=INK,width=4)


def work_scene(t):
    im=base.background(t);d=ImageDraw.Draw(im)
    d.rectangle((0,557,W,H),fill='#29444f')
    for yy in [579,611,661]:d.line((0,yy,W,yy),fill='#35515a',width=1)
    for xx in range(20,1280,173):
        d.line((xx,612,xx+27,661),fill='#1d3542',width=1)
        d.line((xx+3,613,xx+21,616),fill='#537078',width=1)
    d.arc((540,-155,1370,700),170,350,fill='#526f7d',width=23)
    d.line((568,256,1230,45),fill='#506e7a',width=13)
    # Bench grounds the loose gear and gives the action a clear workspace.
    d.rounded_rectangle((694,578,816,596),7,fill='#a28b68',outline=INK,width=3)
    d.line((709,596,706,650),fill='#57747a',width=9);d.line((802,596,807,650),fill='#57747a',width=9)
    telescope(im,t)
    u=ease((t-12.4)/4.3)
    gx,gy=bezier((752,548),(750,466),(774,363),(839,389),u)
    anticipation=keys(t,[(0,0),(10.8,0),(11.8,19),(12.5,7),(14,0)])
    rx=keys(t,[(5,486),(6.6,486),(10.5,650),(12.1,650),(14.5,675),(19,675),(21.4,645),(24,645)])
    walking=(ease((t-6.6)/.5)*(1-ease((t-10.1)/.4)))
    hand=(gx-29,gy+9)
    contact=ease((t-10.2)/1.2)*(1-ease((t-19.8)/1.3))
    neutral=(rx+80,565)
    target=(neutral[0]+contact*(hand[0]-neutral[0]),neutral[1]+contact*(hand[1]-neutral[1]))
    if t>17.1:
        twist=ease((t-17.1)/.4)*(1-ease((t-19.1)/.6))
        target=(target[0]+math.sin((t-17.1)*10)*9*twist,target[1]+math.cos((t-17.1)*10)*9*twist)
    robot(im,rx,660,t,.91,travel=(min(rx,650)-486)/.91 if t<11.2 else None,settle=ease((t-10.5)/.7),walk=walking,lean=keys(t,[(6,0),(11,11),(12,18),(14,10),(19,8),(21,-9),(23,0)]),crouch=anticipation,look=(.8,-.4 if t>14 else .6),tilt=keys(t,[(6,-6),(10,-6),(12,9),(16,-10),(19,-10),(20.4,8),(22,0)]),target=target if contact>0 else None,wave_hand=keys(t,[(6,0),(20.5,0),(21.3,.9),(22.3,.35),(24,.5)]),happy=float(t>20.5))
    base.gear(im,gx,gy,.1 if t<12.4 else u*3 if t<17 else 3+ease((t-17)/2)*2)
    if t<11.8:
        v=ease((t-7)/4.8)
        px,py=bezier((972,265),(1110,318),(822,318),(796,501),v)
        bank=math.sin(v*math.pi)*-22
        bird(im,px,py,t,.72,bank=bank,face=-1)
    elif t<17.5:
        # Pip's beak follows the upper-left tooth of the carried gear.
        bird(im,gx+44,gy-35,t,.72,bank=0,face=-1)
    else:
        v=ease((t-17.5)/4.6)
        px,py=bezier((883,354),(950,170),(540,245),(645,341),v)
        settled=ease((t-21.5)/.6)
        bird(im,px,py-4*math.sin(t*3)*(1-settled),t,.72,flap=1-settled,bank=math.sin(v*math.pi)*19)
    glow=ease((t-19.2)/1.5)
    if glow:
        layer=Image.new('RGBA',(W,H));g=ImageDraw.Draw(layer)
        g.polygon([(1020,180),(1130,28),(1252,28)],fill=(140,245,223,round(72*glow)))
        for i in range(22):
            phase=(t-19.2)*.6+i*.34
            xx=1020+math.cos(phase)*((i*17)%170);yy=180-((t-19.2)*29+i*11)%150
            g.ellipse((xx-2,yy-2,xx+2,yy+2),fill=(253,222,150,round(200*glow)))
        im=Image.alpha_composite(im.convert('RGBA'),layer).convert('RGB')
    zoom=keys(t,[(6,1.02),(10,1.04),(15,1.12),(18,1.12),(23,1.02)])
    im=camera(im,zoom,730,370)
    caption(im,'One broken telescope.',t,6.8,10.2)
    caption(im,'A little teamwork.',t,13.2,16.4)
    caption(im,'A whole sky of possibility.',t,20.1,23.6)
    return im


def camera(im,zoom,cx=640,cy=360):
    w,h=W/zoom,H/zoom
    left=max(0,min(W-w,cx-w/2));top=max(0,min(H-h,cy-h/2))
    return im.transform((W,H),Image.Transform.EXTENT,(left,top,left+w,top+h),Image.Resampling.BICUBIC)


def scene(index,t):
    if index==1:return work_scene(t)
    im=base.background(t);d=ImageDraw.Draw(im)
    if index==0:
        base.observatory(im)
        move=ease((t-.3)/5.5)
        robot(im,460+220*move,632,t,.44,travel=(220*move)/.44,walk=ease(t/.7)*(1-ease((t-5)/.8)),lean=6,look=(1,-.3),tilt=-5)
        bx,by=bezier((570,456),(625,320),(780,450),(844,394),move)
        bird(im,bx,by,t,.4,bank=math.sin(move*math.pi)*-15)
        caption(im,'EVERY STAR',t,.5,5.9,(83,239),48)
        caption(im,'HAS A STORY.',t,.85,5.9,(83,299),48)
        return camera(im,1+.035*move)
    title=index==3
    hero_x=975
    settle=keys(t,[(23,0),(25,0),(26,.5),(29,.5),(31,.25),(32.2,.9),(33,.7),(34,.9),(35,.5)])
    robot(im,hero_x,660,t,.66,look=(-.6,-.9),tilt=keys(t,[(24,11),(27,8),(30,0),(32,-6),(34,0)]),wave_hand=settle,happy=float(t>29))
    launch=ease((t-26.8)/3.2)
    bx,by=bezier((hero_x,435),(hero_x+90,346),(1180,380),(1077,459),launch)
    bird(im,bx,by+math.sin(t*4)*3*launch,t,.48,flap=launch,bank=math.sin(launch*math.pi)*-12)
    points=[(435,187),(517,134),(603,204),(660,118),(780,153),(851,245),(751,279),(603,204)]
    if not title:
        progress=max(0,min(7,(t-24.2)*1.8))
        for i in range(7):
            u=max(0,min(1,progress-i))
            if not u:continue
            a,b=points[i],points[i+1]
            d.line([a,(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u)],fill='#abe8df',width=2)
            d.ellipse((a[0]-4,a[1]-4,a[0]+4,a[1]+4),fill=GOLD)
        caption(im,'SMALL FRIENDS.',t,24.4,30,(77,425),39)
        caption(im,'INFINITE POSSIBILITIES.',t,24.9,30,(77,478),39)
    else:
        caption(im,'A LITTLE LIGHT GOES A LONG WAY',t,29.7,36,(290,137),22)
        caption(im,'THE LAST',t,30,36,(348,225),53)
        caption(im,'STARLIGHT',t,30.25,36,(184,293),99)
        caption(im,'MIRA & PIP',t,30.9,36,(390,431),24)
        caption(im,'AN ORIGINAL LOCAL STUDIO DEMO',t,31.3,36,(276,590),18)
    return im


def frame(t):
    # Centered dissolve handles preserve the full 36-second soundtrack/runtime.
    boundaries=[(6,0,1,.9),(24,1,2,1.1),(30,2,3,1.0)]
    im=None
    for boundary,before,after,length in boundaries:
        if boundary-length/2<=t<=boundary+length/2:
            u=ease((t-boundary+length/2)/length)
            im=Image.blend(scene(before,t),scene(after,t),u)
            break
    if im is None:im=scene(0 if t<6 else 1 if t<24 else 2 if t<30 else 3,t)
    d=ImageDraw.Draw(im);d.rectangle((0,0,W,26),fill='#091722');d.rectangle((0,H-26,W,H),fill='#091722')
    fade=ease(t/.7)*(1-ease((t-35.1)/.9))
    return Image.blend(Image.new('RGB',(W,H),'#091722'),im,fade) if fade<1 else im


def main():
    OUT.mkdir(parents=True,exist_ok=True);MEDIA.mkdir(parents=True,exist_ok=True)
    audio=base.soundtrack();wav=OUT/'score.wav'
    with wave.open(str(wav),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(RATE);f.writeframes(audio.tobytes())
    movie=OUT/'the-last-starlight-v3.mp4'
    args=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size','1280x720','-framerate',str(FPS),'-i','pipe:0','-i',str(wav),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-b:a','192k','-t','36','-movflags','+faststart',str(movie)]
    with subprocess.Popen(args,stdin=subprocess.PIPE) as proc:
        for n in range(36*FPS):
            proc.stdin.write(frame(n/FPS).tobytes())
            if n%(6*FPS)==0:print(f'Animated {n//FPS}/36 seconds',flush=True)
        proc.stdin.close()
        if proc.wait():raise RuntimeError('Trailer encode failed.')
    project=json.loads((ROOT/'output/demo-starlight/cartoon-project.json').read_text(encoding='utf-8'))
    project['id']='demo-starlight-v3';project['title']='The Last Starlight · animation pass 3'
    project['synopsis']='36-second third animation pass: distance-driven planted feet, lifted passing poses, reflected edges, cel shadows, selective surface marks and smooth scene dissolves. Authored animation is baked into six clips; keep their order for continuity.'
    contact=Image.new('RGB',(960,810))
    for i,shot in enumerate(project['scenes'][0]['shots']):
        clip=MEDIA/f'shot-{i+1:02}.mp4'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(i*6),'-i',str(movie),'-t','6','-c:v','libx264','-preset','veryfast','-crf','18','-threads','2','-c:a','aac','-b:a','192k','-movflags','+faststart',str(clip)],check=True)
        shot['media']={'name':clip.name,'subfolder':'demo-starlight-v3','type':'input'}
        shot['camera']='Continuous repair staging with eased push-in; centered scene dissolves baked into boundary clips.'
        still=frame(i*6+3);still.save(OUT/f'board-{i+1:02}.png');contact.paste(still.resize((480,270)),((i%2)*480,(i//2)*270))
    (OUT/'cartoon-project.json').write_text(json.dumps(project,indent=2),encoding='utf-8')
    contact.save(OUT/'storyboard.png');frame(33).save(OUT/'poster.png')
    print('Third pass, six clips and project ready.',flush=True)


if __name__=='__main__':main()
