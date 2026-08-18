const LANES = ["AI与算力", "机器人与具身智能", "触觉传感"];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function validateMilestones(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("milestones must be a non-empty array");
  for (const item of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) throw new Error(`invalid milestone date: ${item.date}`);
    if (!LANES.includes(item.lane)) throw new Error(`invalid milestone lane: ${item.lane}`);
    if (!item.title || !item.impact || !/^https:\/\//.test(item.source)) throw new Error(`incomplete milestone: ${item.title ?? "unknown"}`);
  }
}

export function renderTimelinePage(items) {
  validateMilestones(items);
  const data = JSON.stringify([...items].sort((a, b) => a.date.localeCompare(b.date))).replace(/</g, "\\u003c");
  const laneButtons = LANES.map((lane) => `<button type="button" class="filter active" data-lane="${esc(lane)}" aria-pressed="true">${esc(lane)}</button>`).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>智能化进程</title>
<style>
:root{color-scheme:light dark;--bg:#f7f7f5;--panel:#fff;--text:#1c1c1a;--muted:#77736c;--line:#dedbd5;--ai:#4d6bfe;--robot:#d16b38;--touch:#16836f}
@media(prefers-color-scheme:dark){:root{--bg:#151514;--panel:#20201e;--text:#f1f0eb;--muted:#aaa69e;--line:#3b3935;--ai:#8ca0ff;--robot:#ef9a6a;--touch:#58bca8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1180px;margin:auto;padding:24px 20px 40px}header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px}h1{font-size:24px;margin:0 0 4px}.sub{margin:0;color:var(--muted);font-size:13px}.back{color:var(--text);text-decoration:none;font-size:14px}.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}.filter,.zoom{border:1px solid var(--line);background:transparent;color:var(--muted);padding:6px 10px;border-radius:7px;cursor:pointer}.filter.active{color:var(--text);background:var(--panel)}.zoom-group{margin-left:auto;display:flex;gap:6px}.stage{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;touch-action:none}.stage svg{display:block;width:100%;height:560px;cursor:grab}.stage svg.dragging{cursor:grabbing}.grid{stroke:var(--line);stroke-width:1}.axis-label,.lane-label{fill:var(--muted);font-size:12px}.lane-label{font-weight:600}.event line{stroke:var(--line)}.event circle{stroke:var(--panel);stroke-width:3}.event text{fill:var(--text);font-size:12px}.event .date{fill:var(--muted);font-size:10px}.event[data-lane="AI与算力"] circle{fill:var(--ai)}.event[data-lane="机器人与具身智能"] circle{fill:var(--robot)}.event[data-lane="触觉传感"] circle{fill:var(--touch)}.event.hidden{display:none}.detail{min-height:74px;padding:14px 16px;border-top:1px solid var(--line)}.detail strong{display:block;margin-bottom:6px}.detail p{margin:0;color:var(--muted);font-size:14px}.detail a{color:inherit}.hint{color:var(--muted);font-size:12px;margin:10px 2px 0}@media(max-width:640px){main{padding:18px 12px}header{align-items:flex-start}.stage svg{height:500px}.zoom-group{margin-left:0}}
</style>
</head>
<body>
<main>
  <header><div><h1>智能化进程</h1><p class="sub">关键节点，不收普通新闻</p></div><a class="back" href="./index.html">返回日报</a></header>
  <div class="toolbar">${laneButtons}<div class="zoom-group"><button class="zoom" type="button" data-zoom="in">放大</button><button class="zoom" type="button" data-zoom="out">缩小</button><button class="zoom" type="button" data-zoom="reset">全部</button></div></div>
  <section class="stage" aria-label="智能化关键历史节点时间轴">
    <svg role="img" aria-labelledby="timeline-title timeline-desc"><title id="timeline-title">智能化进程</title><desc id="timeline-desc">按时间展示AI与算力、机器人与具身智能、触觉传感的关键节点。</desc></svg>
    <div class="detail" aria-live="polite"><strong>选择节点</strong><p>查看影响与来源。</p></div>
  </section>
  <p class="hint">滚轮缩放，拖动平移，点击节点查看来源。</p>
</main>
<script>
const items=${data};
const lanes=${JSON.stringify(LANES)};
const svg=document.querySelector('svg');
const detail=document.querySelector('.detail');
const NS='http://www.w3.org/2000/svg';
const DAY=86400000, start=Date.parse(items[0].date+'T00:00:00Z'), end=Date.parse(items.at(-1).date+'T00:00:00Z');
let viewStart=start-(end-start)*.04, viewEnd=end+(end-start)*.04, defaultStart=viewStart, defaultEnd=viewEnd;
const active=new Set(lanes); let dragging=false,lastX=0;
function el(name,attrs={},text=''){const node=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);if(text)node.textContent=text;return node}
function xScale(date,w){return 116+(Date.parse(date+'T00:00:00Z')-viewStart)/(viewEnd-viewStart)*(w-144)}
function draw(){const w=svg.clientWidth||1000,h=svg.clientHeight||560;svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.replaceChildren();const left=116,right=w-28,top=54,laneGap=(h-110)/lanes.length;
  const y0=top+laneGap*lanes.length;svg.append(el('line',{x1:left,y1:y0,x2:right,y2:y0,class:'grid'}));
  const sy=new Date(viewStart).getUTCFullYear(),ey=new Date(viewEnd).getUTCFullYear();for(let year=sy;year<=ey;year++){const x=xScale(year+'-01-01',w);if(x<left||x>right)continue;svg.append(el('line',{x1:x,y1:top-18,x2:x,y2:y0,class:'grid'}));svg.append(el('text',{x:x+4,y:y0+22,class:'axis-label'},String(year)))}
  lanes.forEach((lane,i)=>{const y=top+i*laneGap+laneGap/2;svg.append(el('text',{x:12,y:y+4,class:'lane-label'},lane));svg.append(el('line',{x1:left,y1:y,x2:right,y2:y,class:'grid'}));});
  const laneOrder=new Map(lanes.map(lane=>[lane,0])),offsets=[-48,-16,16,48];items.forEach(item=>{if(!active.has(item.lane))return;const order=laneOrder.get(item.lane)||0;laneOrder.set(item.lane,order+1);const x=xScale(item.date,w);if(x<left-30||x>right+30)return;const li=lanes.indexOf(item.lane),baseY=top+li*laneGap+laneGap/2,cy=baseY+offsets[order%offsets.length];const g=el('g',{class:'event','data-lane':item.lane,role:'button','aria-label':item.date+' '+item.title});g.append(el('line',{x1:x,y1:baseY,x2:x,y2:cy}));g.append(el('circle',{cx:x,cy:cy,r:7}));const anchor=x>right-150?'end':'start',tx=x+(anchor==='end'?-10:10);g.append(el('text',{x:tx,y:cy-3,'text-anchor':anchor},item.title));g.append(el('text',{x:tx,y:cy+12,'text-anchor':anchor,class:'date'},item.date));g.addEventListener('click',()=>{detail.innerHTML='<strong>'+item.date+' · '+item.title+'</strong><p>'+item.impact+' <a href="'+item.source+'" target="_blank" rel="noopener noreferrer">来源</a></p>'});svg.append(g)});
}
function zoom(factor,anchor=.5){const span=viewEnd-viewStart,next=Math.max(180*DAY,Math.min((defaultEnd-defaultStart)*1.15,span*factor)),point=viewStart+span*anchor;viewStart=point-next*anchor;viewEnd=viewStart+next;draw()}
svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();zoom(e.deltaY>0?1.18:.82,(e.clientX-r.left)/r.width)},{passive:false});
svg.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;svg.classList.add('dragging');svg.setPointerCapture(e.pointerId)});svg.addEventListener('pointermove',e=>{if(!dragging)return;const span=viewEnd-viewStart,dx=(e.clientX-lastX)/svg.clientWidth*span;viewStart-=dx;viewEnd-=dx;lastX=e.clientX;draw()});svg.addEventListener('pointerup',()=>{dragging=false;svg.classList.remove('dragging')});
document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{const lane=btn.dataset.lane;if(active.has(lane))active.delete(lane);else active.add(lane);btn.classList.toggle('active',active.has(lane));btn.setAttribute('aria-pressed',String(active.has(lane)));draw()}));
document.querySelectorAll('[data-zoom]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.zoom==='reset'){viewStart=defaultStart;viewEnd=defaultEnd;draw()}else zoom(btn.dataset.zoom==='in'?.75:1.33)}));
new ResizeObserver(draw).observe(svg);draw();
</script>
</body></html>`;
}
