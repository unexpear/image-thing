"""Render original, deterministic 2D cutout animation and music for Director.

No model or personal media inputs. Frames stream to FFmpeg, never accumulate.
"""
import json
import math
from pathlib import Path
import subprocess
import wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
MEDIA = ROOT / 'ComfyUI_windows_portable/ComfyUI/input/demo-starlight'
OUT = ROOT / 'output/demo-starlight'
W, H, FPS, RATE = 1280, 720, 24, 48000
INK = '#132638'
CREAM = '#fff0ce'
GOLD = '#f8ca65'
FONTS = {}


def font(size, bold=False):
    key = (size, bold)
    if key not in FONTS:
        FONTS[key] = ImageFont.truetype('C:/Windows/Fonts/' + ('trebucbd.ttf' if bold else 'trebuc.ttf'), size)
    return FONTS[key]


def text(im, xy, words, size=30, color=CREAM, bold=False, anchor=None):
    ImageDraw.Draw(im).text(xy, words, font=font(size, bold), fill=color, anchor=anchor, stroke_width=0)


def smooth(t):
    t = max(0, min(1, t))
    return t*t*(3-2*t)


def sky():
    colors = np.linspace([10, 22, 44], [53, 91, 108], H).astype(np.uint8)
    return Image.fromarray(np.repeat(colors[:, None, :], W, axis=1))


SKY = sky()
STARS = np.random.default_rng(21).uniform([15, 35, 1, 0], [1265, 480, 2.5, 6.28], (95, 4))


def background(t, mountains=True):
    im = SKY.copy()
    d = ImageDraw.Draw(im)
    for x, y, r, phase in STARS:
        v = int(145 + 90 * (.5 + .5*math.sin(t*1.2+phase)))
        d.ellipse((x-r,y-r,x+r,y+r), fill=(v,v,min(255,v+20)))
    d.ellipse((990,70,1090,170),fill='#dce4cb')
    d.ellipse((967,58,1060,151),fill='#142940')
    if mountains:
        d.polygon([(0,480),(180,260),(330,424),(495,230),(680,466),(860,330),(1110,443),(1280,245),(1280,720),(0,720)],fill='#294457')
        d.polygon([(0,555),(230,410),(450,570),(720,355),(1010,557),(1280,434),(1280,720),(0,720)],fill='#203c4b')
        d.polygon([(0,625),(180,568),(420,599),(650,533),(820,590),(1080,527),(1280,580),(1280,720),(0,720)],fill='#152f39')
        for x,y,s in [(45,576,1),(1170,545,1.4),(1235,595,1),(100,632,.6),(1130,630,.6)]:
            d.polygon([(x,y-100*s),(x-35*s,y),(x+35*s,y)],fill='#102a32')
            d.rectangle((x-4,y,x+4,y+50),fill='#102a32')
    return im


def paste_scaled(im, layer, x, y, scale):
    layer = layer.resize((round(layer.width*scale),round(layer.height*scale)),Image.Resampling.LANCZOS)
    im.paste(layer,(round(x-layer.width/2),round(y-layer.height)),layer)


def robot(im,x,y,t,scale=1,walk=False,reach=0,happy=False):
    # Fixed pivots, two-segment arms and independently animated feet.
    a = Image.new('RGBA',(330,420)); d=ImageDraw.Draw(a)
    bob = math.sin(t*9)*4 if walk else math.sin(t*2)*2
    d.ellipse((82,375,253,399),fill=(4,18,27,90))
    for side in [-1,1]:
        xx=165+side*36; step=math.sin(t*9+side*math.pi/2)*18 if walk else 0
        d.line([(xx,289),(xx+step*.3,338),(xx+step,369)],fill=INK,width=24)
        d.line([(xx,295),(xx+step*.3,338)],fill='#94b9b8',width=13)
        d.rounded_rectangle((xx-26+step,360,xx+23+step,383),12,fill='#678d98',outline=INK,width=4)
    for side in [-1,1]:
        shoulder=(165+side*62,221+bob)
        elbow=(165+side*(85+reach*22),265+bob-reach*43)
        hand=(165+side*(89+reach*30),298+bob-reach*93)
        d.line([shoulder,elbow,hand],fill=INK,width=24)
        d.line([shoulder,elbow,hand],fill='#98b7ae',width=14)
        d.ellipse((hand[0]-14,hand[1]-14,hand[0]+14,hand[1]+14),fill='#cae0c7',outline=INK,width=4)
    d.rounded_rectangle((105,199+bob,225,307+bob),26,fill='#abc9b9',outline=INK,width=5)
    d.rounded_rectangle((133,235+bob,197,277+bob),10,fill='#496d79',outline=INK,width=3)
    d.ellipse((152,247+bob,171,266+bob),fill=GOLD)
    d.line((165,62+bob,165,95+bob),fill='#73979e',width=7)
    d.ellipse((156,52+bob,175,71+bob),fill=GOLD)
    d.rounded_rectangle((77,92+bob,253,203+bob),35,fill='#c4daca',outline=INK,width=5)
    d.rounded_rectangle((93,111+bob,237,180+bob),24,fill='#183f50')
    blink = math.sin(t*1.9)>.993
    for ex in [131,199]:
        if blink or happy:
            d.arc((ex-12,132+bob,ex+12,155+bob),190,350,fill='#9cf5dd',width=5)
        else:
            d.rounded_rectangle((ex-9,129+bob,ex+9,155+bob),8,fill='#a9f9df')
    d.arc((154,151+bob,177,168+bob),0,180,fill='#a9f9df',width=3)
    for ex in [86,244]: d.ellipse((ex-3,143+bob,ex+3,149+bob),fill='#688994')
    flutter=math.sin(t*5)*12
    d.polygon([(116,199+bob),(77,226+bob),(49,216+bob+flutter),(72,264+bob+flutter),(127,215+bob)],fill='#e8a53d',outline=INK)
    d.rounded_rectangle((105,193+bob,225,214+bob),9,fill=GOLD,outline=INK,width=3)
    paste_scaled(im,a,x,y,scale)


def bird(im,x,y,t,scale=1,flying=False):
    a=Image.new('RGBA',(170,150));d=ImageDraw.Draw(a)
    d.polygon([(37,90),(10,53),(15,105),(60,113)],fill='#cb6264',outline=INK)
    if not flying:
        for xx in [80,105]:d.line([(xx,109),(xx,132),(xx+10,132)],fill=GOLD,width=5)
    d.ellipse((39,35,135,119),fill='#ec8779',outline=INK,width=4)
    d.ellipse((79,42,139,96),fill='#f59d82',outline=INK,width=4)
    d.polygon([(128,65),(157,75),(132,84)],fill=GOLD,outline=INK)
    d.ellipse((108,57,116,67),fill=INK)
    d.ellipse((110,57,113,60),fill=CREAM)
    wing=math.sin(t*22)*36 if flying else math.sin(t*3)*4
    d.polygon([(82,67),(44,85+wing),(62,103),(94,92)],fill='#b65261',outline=INK)
    d.polygon([(96,42),(83,15),(110,39)],fill='#ee8c7e',outline=INK)
    paste_scaled(im,a,x,y,scale)


def observatory(im):
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((773,378,1035,590),16,fill='#748a87',outline=INK,width=5)
    d.pieslice((746,265,1062,526),180,360,fill='#9db3a8',outline=INK,width=5)
    d.arc((781,270,1027,513),180,360,fill='#526e75',width=6)
    d.rectangle((865,267,892,393),fill='#274450')
    d.rectangle((744,390,1060,412),fill='#475f6c',outline=INK,width=4)
    d.rounded_rectangle((868,482,937,590),25,fill='#162f3b',outline=INK,width=4)
    d.rounded_rectangle((800,445,840,500),15,fill=GOLD,outline=INK,width=4)
    d.rounded_rectangle((969,445,1009,500),15,fill=GOLD,outline=INK,width=4)
    for yy in [535,566]: d.line((780,yy,861,yy),fill='#607e80',width=3)


def telescope(im,t,power=0):
    d=ImageDraw.Draw(im)
    d.line([(844,365),(765,628)],fill='#526f7c',width=20)
    d.line([(844,365),(966,628)],fill='#526f7c',width=20)
    d.line([(844,365),(841,636)],fill='#9dbab1',width=15)
    d.polygon([(649,373),(684,448),(1060,259),(1026,184)],fill='#97bcb5',outline=INK,width=6)
    d.polygon([(650,368),(673,418),(730,390),(707,340)],fill='#e3c181',outline=INK,width=5)
    d.polygon([(989,188),(1024,265),(1072,244),(1037,165)],fill='#e0c089',outline=INK,width=5)
    d.line([(1033,175),(1064,239)],fill='#7ce8df' if power else '#365469',width=10)
    d.ellipse((800,350,878,428),fill='#e1bf7d',outline=INK,width=5)
    d.ellipse((821,371,857,407),fill='#426577',outline=INK,width=4)


def gear(im,x,y,angle=0):
    d=ImageDraw.Draw(im)
    pts=[]
    for i in range(48):
        a=angle+i*math.pi/24;r=43 if i%4 in (0,1) else 34
        pts.append((x+math.cos(a)*r,y+math.sin(a)*r))
    d.polygon(pts,fill=GOLD,outline=INK,width=3)
    d.ellipse((x-13,y-13,x+13,y+13),fill='#264555',outline=INK,width=3)


def frame(shot,t):
    im=background(t+shot*6)
    d=ImageDraw.Draw(im)
    if shot==0:
        observatory(im)
        robot(im,540+75*smooth(t/5),623,t,.42,True)
        bird(im,610+80*smooth(t/5),461+math.sin(t*4)*9,t,.42,True)
        text(im,(85,238),'EVERY STAR',49,bold=True)
        text(im,(85,296),'HAS A STORY.',49,bold=True)
        text(im,(88,384),'Some just need a little help.',25,color='#abc4c6')
    elif shot in (1,2,3):
        d.rectangle((0,530,W,H),fill='#2c4550')
        for xx in range(-400,1800,210):d.line((640,380,xx,720),fill='#385663',width=2)
        d.arc((590,-115,1370,685),180,355,fill='#617d86',width=22)
        d.line((592,265,1230,45),fill='#496674',width=12)
        if shot==3:
            strength=smooth((t-1)/2)
            beam=Image.new('RGBA',(W,H));bd=ImageDraw.Draw(beam)
            bd.polygon([(1050,208),(1280,20),(1280,180)],fill=(116,234,219,int(strength*100)))
            im=Image.alpha_composite(im.convert('RGBA'),beam).convert('RGB')
        telescope(im,t,shot==3 and t>1)
        robot(im,435,653,t,.96,reach=(.3 if shot==1 else .9 if shot==2 else smooth(t/2)),happy=shot==3 and t>2)
        if shot==1:
            bird(im,760+math.sin(t*2)*35,290+math.sin(t*4)*13,t,.75,True)
            # The missing gear on the telescope mount is the visible obstacle.
            gear(im,606,600,math.sin(t)*.3)
            text(im,(78,77),'ONE BROKEN TELESCOPE.',29,bold=True)
        elif shot==2:
            progress=smooth(t/4)
            gx=606+(839-606)*progress;gy=572+(389-572)*progress
            gear(im,gx,gy,t*1.3)
            bird(im,gx-20,gy-28,t,.72,True)
            text(im,(78,77),'TWO VERY SMALL ENGINEERS.',29,bold=True)
        else:
            gear(im,839,389,t*.8)
            bird(im,580,421+math.sin(t*3)*7,t,.72,True)
            for i in range(16):
                a=i*2.399+t*.3;r=40+(t*45+i*17)%240
                x=1045+math.cos(a)*r;y=208+math.sin(a)*r
                if t>1:ImageDraw.Draw(im).ellipse((x-2,y-2,x+2,y+2),fill=GOLD)
            text(im,(78,77),'A LITTLE COURAGE.',29,bold=True)
    elif shot==4:
        points=[(450,198),(532,145),(618,215),(675,129),(795,164),(866,256),(766,290),(618,215)]
        d.line(points[:max(2,min(8,int(t*2)+2))],fill='#a8e2d9',width=2)
        for x,y in points[:max(2,min(8,int(t*2)+2))]:
            d.ellipse((x-5,y-5,x+5,y+5),fill=GOLD)
        robot(im,952,661,t,.68,reach=.5,happy=True)
        bird(im,1050,421+math.sin(t*3)*8,t,.5,True)
        text(im,(85,420),'SMALL FRIENDS.',42,bold=True)
        text(im,(85,474),'INFINITE POSSIBILITIES.',42,bold=True)
    else:
        text(im,(640,120),'A LITTLE LIGHT GOES A LONG WAY',22,color='#a9c5c6',anchor='mt')
        text(im,(605,211),'THE LAST',57,bold=True,anchor='mt')
        text(im,(605,282),'STARLIGHT',105,color=GOLD,bold=True,anchor='mt')
        text(im,(605,415),'MIRA & PIP',26,color=CREAM,bold=True,anchor='mt')
        robot(im,997,673,t,.62,reach=.7+math.sin(t*4)*.2,happy=True)
        bird(im,1086,430+math.sin(t*3)*8,t,.5,True)
        text(im,(605,589),'AN ORIGINAL LOCAL STUDIO DEMO',19,color='#a9c5c6',anchor='mt')
    # Gentle push-in, restrained film matte and entrance/exit fades.
    zoom=1+.025*smooth(t/6)
    cw,ch=round(W/zoom),round(H/zoom)
    im=im.crop(((W-cw)//2,(H-ch)//2,(W+cw)//2,(H+ch)//2)).resize((W,H),Image.Resampling.BICUBIC)
    d=ImageDraw.Draw(im);d.rectangle((0,0,W,27),fill='#091722');d.rectangle((0,H-27,W,H),fill='#091722')
    fade=min(1,t/.4) if shot==0 else 1
    if shot==5:fade*=min(1,(6-t)/.8)
    if fade<1:im=Image.blend(Image.new('RGB',(W,H),'#091722'),im,fade)
    return im


def soundtrack():
    song=np.zeros((36*RATE,2),dtype=np.float32)
    def note(start,midi,length,gain,pan=0,soft=False):
        a=int(start*RATE);n=min(int(length*RATE),len(song)-a)
        tt=np.arange(n)/RATE;hz=440*2**((midi-69)/12)
        env=np.minimum(tt/.02,1)*np.exp(-tt/(1.2 if soft else .35))*np.minimum((length-tt)/.1,1)
        wave=np.sin(2*np.pi*hz*tt)+.23*np.sin(2*np.pi*hz*2*tt)
        song[a:a+n,0]+=wave*env*gain*(1-pan*.5)
        song[a:a+n,1]+=wave*env*gain*(1+pan*.5)
    chords=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]]
    for beat in range(72):
        chord=chords[(beat//6)%4]
        note(beat*.5,chord[beat%3]+12,1.4,.10,math.sin(beat)*.4)
        if beat%6==0:
            for pitch in chord:note(beat*.5,pitch,3,.055,soft=True)
            note(beat*.5,chord[0]-12,2.7,.10,soft=True)
    for start in [18.9,24,30]:
        for j,pitch in enumerate([76,79,84,88]):note(start+j*.16,pitch,1.8,.10,j*.15)
    fade=np.minimum(np.arange(len(song))/RATE/1.5,1)*np.minimum((len(song)-np.arange(len(song)))/RATE/2,1)
    song*=fade[:,None];song*=.75/max(float(np.max(np.abs(song))),.75)
    return (song*32767).astype('<i2')


def main():
    MEDIA.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    audio=soundtrack()
    titles=['A light on the mountain','The broken telescope','Small engineers','First light','A sky full of possibility','The Last Starlight']
    actions=['Mira walks toward the observatory as Pip flies ahead.','Mira and Pip discover the telescope mount is missing its gear.','Pip carries the golden gear into the telescope mount while Mira reaches to help.','The repaired telescope lights up. Mira celebrates as Pip hovers.','The friends watch a constellation appear above the mountain.','Mira waves beside the title while Pip flutters nearby.']
    shots=[];contact=Image.new('RGB',(960,810),'#0a1724')
    for i in range(6):
        wav=MEDIA/f'shot-{i+1:02}.wav';clip=MEDIA/f'shot-{i+1:02}.mp4'
        with wave.open(str(wav),'wb') as f:
            f.setnchannels(2);f.setsampwidth(2);f.setframerate(RATE);f.writeframes(audio[i*6*RATE:(i+1)*6*RATE].tobytes())
        args=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-i',str(wav),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-b:a','160k','-t','6','-movflags','+faststart',str(clip)]
        with subprocess.Popen(args,stdin=subprocess.PIPE) as proc:
            for n in range(6*FPS):proc.stdin.write(frame(i,n/FPS).tobytes())
            proc.stdin.close()
            if proc.wait():raise RuntimeError(f'Encoding shot {i+1} failed')
        still=frame(i,3);still.save(OUT/f'board-{i+1:02}.png')
        contact.paste(still.resize((480,270)),((i%2)*480,(i//2)*270))
        shots.append({'id':f'starlight-shot-{i+1}','title':titles[i],'seconds':6,'action':actions[i],'camera':'Wide or medium staging; gentle 2.5% push-in.','dialogue':'No spoken dialogue. Original synthesized celesta and warm chord bed.','media':{'name':clip.name,'subfolder':'demo-starlight','type':'input'},'production':{'Animation':'Ready for review','Sound':'Ready for review'}})
        print(f'Rendered shot {i+1}/6',flush=True)
    project={'version':1,'id':'demo-starlight','title':'The Last Starlight · demo trailer','style':'Original 2D cutout cartoon. Midnight teal, warm gold, coral. Mira is a silent mint-metal robot with a yellow scarf, always grounded. Pip is a coral bird.','synopsis':'A broken observatory. Two small friends. A sky waiting to shine. A 36-second authored animation demo with six shots and original instrumental music.','assets':[{'id':'mira-demo','kind':'character','name':'Mira','brief':'Silent mint robot, yellow scarf, cyan eyes. Cannot fly.'},{'id':'pip-demo','kind':'character','name':'Pip','brief':'Small coral bird with a gold beak.'},{'id':'observatory-demo','kind':'set','name':'Mountain observatory','brief':'Teal night, distant mountains and a warm-lit dome.'}], 'scenes':[{'id':'starlight-scene','title':'Trailer · 36 seconds','shots':shots}]}
    (OUT/'cartoon-project.json').write_text(json.dumps(project,indent=2),encoding='utf-8')
    contact.save(OUT/'storyboard.png')
    frame(5,3).save(OUT/'poster.png')
    print('Project and storyboards ready.',flush=True)


if __name__=='__main__':main()
