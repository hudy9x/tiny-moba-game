"""Seeded seasonal layouts: reproducible random cover, buildings, rivers and cliffs."""
import json, math, random
from pathlib import Path
path=Path(__file__).resolve().parents[1]/'src/maps/layouts.json'
maps=json.loads(path.read_text())
for index,m in enumerate(maps):
    n=m['size'];c=n//2;rng=random.Random(1907+index*371)
    m['mine']={'x':c,'z':c};m['dummy']={'x':c+3,'z':c}
    m['arena']={'x':c,'z':c,'radiusX':14 if index==3 else 13,'radiusZ':11 if index==3 else 13}
    m['spawns']=[{'x':c+1,'z':c+2},{'x':c+1,'z':c-2},{'x':c-8,'z':c},{'x':c+8,'z':c},{'x':c,'z':c-8},{'x':c,'z':c+8}]
    m['layoutDescription']=['Northern winding stream and woodland cottages','Western oasis and stepped sandstone ridge','Mid-map river with three wide timber bridges and a village','Northern meltwater and snowy mountain passes'][index]
    grid=[['.' for _ in range(n)] for _ in range(n)]
    clusters=[(rng.randrange(5,n-5),rng.randrange(5,n-5),rng.uniform(1,2.5)) for _ in range(22)]
    for z in range(n):
        for x in range(n):
            dx=x-c;dz=z-c;edge=min(x,z,n-1-x,n-1-z)
            ellipse=(dx/m['arena']['radiusX'])**2+(dz/m['arena']['radiusZ'])**2
            if edge<4 and rng.random()<.83:grid[z][x]='T'
            elif ellipse>1.08 and any(math.hypot(x-a,z-b)<r for a,b,r in clusters):grid[z][x]='T'
            river=(abs(z-(7+round(2*math.sin(x/6))))<=1 if index==0 else
                   ((x-6)/3)**2+((z-19)/12)**2<1 if index==1 else
                   abs(z-(c-4+round(math.sin(x/8))))<=1 if index==2 else
                   abs(z-(8+round(2*math.cos(x/5))))<=1)
            if river:grid[z][x]='~'
            # Different paths: winding spring road, desert ring, village crossings, alpine switchback.
            road=(abs(dx)<=1 or abs(dz)<=1 if index==0 else
                  abs(math.hypot(dx,dz)-9)<1.3 or abs(dz)<=1 or abs(dx)<=1 if index==1 else
                  any(abs(x-(c+d))<=2 for d in [-10,0,10]) or abs(dz)<=1 if index==2 else
                  abs(dx)<=1 or abs(z-(c+round(3*math.sin(x/7))))<=1 or abs(dz)<=1)
            if road and edge>=2:grid[z][x]='B' if river else ':'
    # Solid mountain terraces and cottage footprints stay outside the combat ellipse.
    peaks=[[(8,32,3)],[(n-7,11,4),(n-7,29,3)],[(7,7,3)],[(10,5,5),(n-9,6,4),(n-5,29,3)]][index]
    heights={}
    for px,pz,r in peaks:
        for z in range(max(0,pz-r),min(n,pz+r+1)):
            for x in range(max(0,px-r),min(n,px+r+1)):
                d=math.hypot(x-px,z-pz)
                if d<=r and ((x-c)/13)**2+((z-c)/13)**2>1.15 and abs(x-c)>2 and abs(z-c)>2:
                    grid[z][x]='M';heights[f'{x},{z}']=round(1+(r-d)*.8,1)
    houses=[[(9,10),(33,30)],[(12,7)],[(9,30),(13,33),(33,9)],[(7,31),(32,32)]][index]
    m['houses']=[]
    for hx,hz in houses:
        if ((hx-c)/13)**2+((hz-c)/13)**2<1.15:continue
        m['houses'].append({'x':hx,'z':hz})
        for z in range(hz-1,hz+2):
            for x in range(hx-1,hx+2):grid[z][x]='H'
    # Guarantee generous safe spawn pads and connections.
    for spawn in [m['mine'],m['dummy'],*m['spawns']]:
        for z in range(spawn['z']-1,spawn['z']+2):
            for x in range(spawn['x']-1,spawn['x']+2):
                if grid[z][x]=='~':grid[z][x]='B'
                elif grid[z][x] in 'TMH':grid[z][x]='.'
    m['mountainHeights']=heights;m['rows']=[''.join(row) for row in grid]
path.write_text(json.dumps(maps,indent=2)+'\n')
