'use strict';
const J = JSON.stringify;
// ECG 函数取自 scene.template.html 注释块（确定性，医学示意）
const ECG_RUNTIME = `
function gauss(x,mu,sig){return Math.exp(-((x-mu)*(x-mu))/(2*sig*sig));}
function normalBeat(p){return 0.13*gauss(p,.16,.03)-0.12*gauss(p,.28,.012)+1.0*gauss(p,.32,.014)-0.22*gauss(p,.36,.014)+0.28*gauss(p,.55,.05);}
function vfWave(u,t){return 0.55*Math.sin(u*23+t*9)+0.35*Math.sin(u*41+t*13+1.7)+0.25*Math.sin(u*67+t*17+.4)+0.15*Math.sin(u*97+t*23);}
function drawECG(ctx,w,h,t,vf,color,scroll){ ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='rgba(110,140,220,0.10)';ctx.lineWidth=1;ctx.beginPath();
  for(let x=0;x<=w;x+=40){ctx.moveTo(x,0);ctx.lineTo(x,h);}for(let y=0;y<=h;y+=40){ctx.moveTo(0,y);ctx.lineTo(w,y);}ctx.stroke();
  const mid=h*0.55,amp=h*0.34;ctx.strokeStyle=color;ctx.lineWidth=3.5;ctx.lineJoin='round';ctx.beginPath();
  for(let x=0;x<=w;x+=3){const u=x/w;const phase=((u*4.2+scroll)%1+1)%1;const v=lerp(normalBeat(phase),vfWave(u*6.28,t),vf);const y=mid-v*amp;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke(); }
`;
module.exports = {
  name: 'waveform',
  css: () => `.wf-canvas { position:absolute; }`,
  runtime: () => ECG_RUNTIME,
  check: (el) => {
    const errs = [];
    if (el.type !== 'waveform') { errs.push(`waveform 不支持元素类型: ${el.type}`); return errs; }
    // 缺省值必须显式给出（waveform 无几何默认值）：x/y/w/h 的类型由通用规则校验，这里只查必填
    for (const k of ['x', 'y', 'w', 'h'])
      if (el.props[k] == null) errs.push(`waveform ${el.id} props.${k} 必填（须为有限数）`);
    if (Number.isFinite(el.props.w) && Number.isFinite(el.props.h) && (el.props.w <= 0 || el.props.h <= 0)) errs.push(`waveform ${el.id} w/h 须为正数`);
    for (const k of ['vf', 'scroll']) if (el.props[k] != null && !Number.isFinite(el.props[k])) errs.push(`waveform ${el.id} props.${k} 须为有限数`);
    if (el.props.color != null && typeof el.props.color !== 'string') errs.push(`waveform ${el.id} props.color 须为色键字符串`);
    return errs;
  },
  build: (sc) => {
    const lines = [`{ const r = H('div','scene'); r.id = 's-${sc.id}';`, `  const els = [];`];
    sc.elements.forEach((el, i) => {
      if (el.type !== 'waveform') throw new Error('waveform 不支持元素类型: ' + el.type);
      const p = el.props, v = `e${i}`;
      lines.push(`  const ${v} = H('canvas','wf-canvas'); ${v}.width=${J(Number(p.w))}; ${v}.height=${J(Number(p.h))}; ${v}.style.left=${J(p.x + 'px')}; ${v}.style.top=${J(p.y + 'px')}; r.append(${v}); els.push({key:${J(el.id)},e:${v}});`);
    });
    lines.push(`  S['${sc.id}'] = { r, els }; scenesEl.append(r); }`);
    return lines.join('\n');
  },
  extraUpdate: (sc) => {
    const lines = [];
    for (const el of sc.elements) {
      if (el.type !== 'waveform') continue;
      lines.push(`{ const el = s.els.find(x => x.key === ${J(el.id)}); const sp = SPECS['${sc.id}'][${J(el.id)}];
  const ctx = el.e.getContext('2d'); const p = eo(seg(lt, 0.3, 1.6));
  ctx.clearRect(0, 0, el.e.width, el.e.height); ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, el.e.width * p, el.e.height); ctx.clip();
  drawECG(ctx, el.e.width, el.e.height, t, sp.props.vf || 0, sp.props.colorHex, (sp.props.scroll || 0.6) * t);
  ctx.restore(); }`);
    }
    return lines.join('\n');
  },
  boxes: (sc) => sc.elements.map(el => ({ id: el.id, x: el.props.x, y: el.props.y, w: el.props.w, h: el.props.h }))
};
