"""Deterministic arena matrices; rendering assets and materials remain unchanged."""
import json, math
from pathlib import Path
path=Path(__file__).resolve().parents[1]/'src/maps/layouts.json'
maps=json.loads(path.read_text())
for index,m in enumerate(maps):
    n=m['size']; c=n//2
    m['mine']={'x':c,'z':c};m['dummy']={'x':c+3,'z':c}
    m['arena']={'x':c,'z':c,'radiusX':13 if index!=3 else 14,'radiusZ':13 if index!=3 else 11}
    m['spawns']=[{'x':c+1,'z':c+2},{'x':c+1,'z':c-2},{'x':c-8,'z':c},{'x':c+8,'z':c},{'x':c,'z':c-8},{'x':c,'z':c+8}]
    grid=[]
    for z in range(n):
        row=[]
        for x in range(n):
            dx=x-c;dz=z-c;r=math.hypot(dx,dz)
            edge=min(x,z,n-1-x,n-1-z)
            h=((x*73+z*97+index*31)%101)/100
            value='.'
            if edge<4 and h<.83 or z<7 and h<.6:value='T'
            # Different edge channels, never crossing the central arena.
            channel = (abs(x-(6+round(2*math.sin(z/7))))<=1 if index==0 else
                       abs(z-(6+round(math.sin(x/5))))<=1 if index==1 else
                       abs(x-(n-8+round(2*math.sin(z/6))))<=1 if index==2 else
                       abs(z-(n-7+round(2*math.sin(x/8))))<=1)
            if channel:value='~'
            if 14<r<17 and any(math.hypot(dx-ox,dz-oz)<1.6 for ox,oz in [(-11,-10),(11,10),(-11,10),(11,-10)]):value='T'
            # Broad paths and bridges connect the clearing to each edge.
            if (abs(dx)<=1 or abs(dz)<=1) and edge>=2:value=':'
            ellipse=(dx/m['arena']['radiusX'])**2+(dz/m['arena']['radiusZ'])**2
            if ellipse<=1:
                value=':' if (abs(dx)<=1 or abs(dz)<=1 or (index==1 and r<5)) else '.'
            row.append(value)
        grid.append(''.join(row))
    m['rows']=grid
path.write_text(json.dumps(maps,indent=2)+'\n')
