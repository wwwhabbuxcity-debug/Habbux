#!/usr/bin/env python3
"""Original vector skin limbs. Reads only Habbux's existing manifest/sheets.
SPDX-License-Identifier: MIT
No Gallaxys files, artwork, palette or animation tables are imported.
Pillow is an optional offline dependency, never a client/runtime dependency.
"""
import copy
import json
import math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'apps/client/public/assets/avatar/v1'
MANIFEST = BASE / 'manifest/avatar-manifest-v1.json'
m = json.loads(MANIFEST.read_text())
sheet = 'habbux_hands_original_v1'
# Idempotent regeneration without changing legacy image files.
m['regions'] = {k:v for k,v in m['regions'].items() if not k.startswith(sheet+':')}
images = {k:Image.open(BASE/v['src']).convert('RGBA') for k,v in m['sheets'].items() if k!=sheet}
WIDTH, CELL_W, CELL_H = 320,32,48
shapes=[]
count=0

def selected(part,gender,action,direction,frame):
    p=m['parts'][part];a=p['actions'].get(action,p['actions']['std'])
    f=a['genders'][gender]['directions'][str(direction)]['frames'][str(frame if a['frameCount']>1 else 0)]
    return p,f,m['regions'][f['region']]

def cuff(gender,part,action,direction,frame):
    p,f,r=selected(part,gender,action,direction,frame)
    crop=images[p['sheet']].crop((r['x'],r['y'],r['x']+r['width'],r['y']+r['height']))
    opaque=[(x,y) for y in range(crop.height) for x in range(crop.width) if crop.getpixel((x,y))[3]>=128]
    bottom=max(y for x,y in opaque)
    xs=[x for x,y in opaque if y>=bottom-1]
    return -f['offset']['x']+sum(xs)/len(xs),-f['offset']['y']+bottom+1

for part,sleeve in [('lh','ls'),('rh','rs')]:
    actions={}
    for action,frames in [('std',1),('wlk',4)]:
        genders={}
        for gender in ['male','female']:
            directions={}
            for direction in [0,1,2,3,7]:
                rendered={}
                for frame in range(frames):
                    top_x,top_y=cuff(gender,sleeve,action,direction,frame)
                    wrist_x,wrist_y=cuff('male',sleeve,action,direction,frame)
                    _,_,head=selected('hd',gender,'std',direction,0)
                    hand_height=max(3,round(head['height']/6))
                    half_width=1.5
                    end_y=max(top_y+hand_height,wrist_y+hand_height)
                    # Tube and palm connect to the opaque sleeve edge, with a
                    # one-pixel overlap. Forearm length follows the complete
                    # existing sleeve pose, not a character-specific offset.
                    left=math.floor(min(top_x,wrist_x)-half_width-1)
                    top=math.floor(top_y-2)
                    right=math.ceil(max(top_x,wrist_x)+half_width+1)
                    bottom=math.ceil(end_y+1)
                    width,height=right-left,bottom-top
                    assert width<=CELL_W and height<=CELL_H,(part,gender,direction,frame,width,height)
                    atlas_x=(count%10)*CELL_W;atlas_y=(count//10)*CELL_H;count+=1
                    def pt(x,y):return f'{x-left+atlas_x:.2f},{y-top+atlas_y:.2f}'
                    points=[pt(top_x-half_width,top_y-1),pt(top_x+half_width,top_y-1),pt(wrist_x+half_width,end_y-1),pt(wrist_x,end_y),pt(wrist_x-half_width,end_y-1)]
                    shapes.append(f'<polygon points="{" ".join(points)}" fill="white" stroke="#252525" stroke-width="1"/>')
                    shapes.append(f'<path d="M {wrist_x-left+atlas_x:.2f} {end_y-top+atlas_y-2:.2f} v 1" stroke="#777" stroke-width="1"/>')
                    name=f'{sheet}:own_{action}_{part}_{gender}_{direction}_{frame}'
                    m['regions'][name]={'x':atlas_x,'y':atlas_y,'width':width,'height':height}
                    rendered[str(frame)]={'region':name,'offset':{'x':-left,'y':-top}}
                directions[str(direction)]={'renderDirection':direction,'mirrored':False,'frames':rendered}
            for target,source in [(4,2),(5,1),(6,0)]:
                directions[str(target)]=copy.deepcopy(directions[str(source)]);directions[str(target)]['mirrored']=True
            genders[gender]={'sourceGender':1,'directions':directions}
        actions[action]={'frameCount':frames,'genders':genders}
    m['parts'][part]={'sheet':sheet,'layer':4,'actions':actions}

# The same head bounds already have valid, existing eyes in each front sector.
# Reuse that *same orientation* rather than substitute profile pixels in front.
ey=m['parts']['ey']['actions']['std']['genders']
for gender,other,render in [('male','female',3),('female','male',1)]:
    for direction in range(8):
        source=ey[other]['directions'].get(str(direction))
        if source and source['renderDirection']==render:
            value=copy.deepcopy(source)
            for f in value['frames'].values():f['sourceFallback']=f['region'].split(':')[1]
            ey[gender]['directions'][str(direction)]=value
m['layerOrder']=['bd','lg','sh','lh','ls','ch','rh','rs','hrb','hd','fc','ey','hr']
height=math.ceil(count/10)*CELL_H
m['sheets'][sheet]={'src':'sheets/habbux_hands_original_v1.svg','width':WIDTH,'height':height}
svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height}" viewBox="0 0 {WIDTH} {height}" shape-rendering="crispEdges"><!-- Original Habbux vector limbs. SPDX-License-Identifier: MIT. -->'+''.join(shapes)+'</svg>\n'
(BASE/'sheets/habbux_hands_original_v1.svg').write_text(svg)
MANIFEST.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
print(f'Original limbs: {count} regions, {WIDTH}x{height}, {len(svg)} bytes; legacy PNGs unchanged.')
