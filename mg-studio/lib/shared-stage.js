'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const WIDTH = 1920;
const HEIGHT = 1080;
const artworks = { 'rain-catchment': '街道与雨水口剖面' };
const range = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const stageId = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(value);

function validRoute(route) {
  return Array.isArray(route) && route.length >= 2 && route.length <= 24 && route.every((point, index) =>
    Array.isArray(point) && (point.length === 2 || (index > 0 && point.length === 4)) &&
    point.every((coordinate, axis) => range(coordinate, 0, axis % 2 ? HEIGHT : WIDTH)) &&
    (index === 0 || point[0] !== route[index - 1][0] || point[1] !== route[index - 1][1]));
}

function validWorlds(worlds) {
  if (!worlds || typeof worlds !== 'object' || Array.isArray(worlds)) return false;
  const entries = Object.entries(worlds);
  return entries.length <= 8 && entries.every(([id, world]) => stageId(id) && world &&
    typeof world.art === 'string' && Object.hasOwn(artworks, world.art) && validRoute(world.route) &&
    (world.routes == null || (typeof world.routes === 'object' && !Array.isArray(world.routes) &&
      Object.keys(world.routes).length <= 4 && Object.entries(world.routes).every(([name, route]) =>
        name !== 'main' && stageId(name) && validRoute(route)))));
}

function validKeyframes(keys, validPoint) {
  return Array.isArray(keys) && keys.length >= 2 && keys.length <= 8 &&
    keys.every((point, index) => point && range(point.t, 0, 1) &&
      (!index || point.t > keys[index - 1].t) && validPoint(point));
}

function validStageShot(stage) {
  const value = point => range(point.value, 0, 1);
  return Boolean(stage && stageId(stage.id) &&
    (stage.route == null || stageId(stage.route)) &&
    validKeyframes(stage.camera, point => range(point.x, 0, WIDTH) && range(point.y, 0, HEIGHT) && range(point.zoom, 1, 2.5)) &&
    validKeyframes(stage.flow, value) && validKeyframes(stage.reveal, value) &&
    ['puddle', 'soil', 'water'].every(key => stage[key] == null || validKeyframes(stage[key], value)) &&
    (stage.compare == null || typeof stage.compare === 'boolean') &&
    Array.isArray(stage.labels) && stage.labels.length <= 4 && stage.labels.every(label =>
      label && typeof label.text === 'string' && label.text.trim().length > 0 && label.text.length <= 16 &&
      range(label.x, 0, WIDTH) && range(label.y, 0, HEIGHT) && range(label.from, 0, 1) && range(label.to, label.from, 1)));
}

function routeOf(world, name = 'main') {
  return name === 'main' ? world?.route : Object.hasOwn(world?.routes || {}, name) ? world.routes[name] : undefined;
}

function readArt(art) {
  return fs.readFileSync(path.join(__dirname, '..', 'templates', 'shared-stages', art + '.svg'), 'utf8');
}

function visualContext(worlds) {
  return Object.fromEntries(Object.entries(worlds).map(([id, world]) =>
    [id, { ...world, artworkHash: createHash('sha256').update(readArt(world.art)).digest('hex') }]));
}

function stageMarkup(worlds) {
  return Object.entries(worlds).map(([id, world]) => {
    const prefix = 'stage-' + id + '-';
    const art = readArt(world.art).replace(/id="([\w-]+)"/g, 'id="' + prefix + '$1"')
      .replace(/url\(#([\w-]+)\)/g, 'url(#' + prefix + '$1)')
      .replace(/href="#([\w-]+)"/g, 'href="#' + prefix + '$1"');
    const routes = Object.entries({ main: world.route, ...world.routes }).map(([name, points]) => {
      const route = points.map(([x,y,cx,cy], index) => index === 0 ? `M ${x} ${y}`
        : cx == null ? `L ${x} ${y}` : `Q ${cx} ${cy} ${x} ${y}`).join(' ');
      const shade = name === 'garden' ? '#187a82' : '#137fea';
      return `<g class="world-water" data-route="${name}" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path class="world-guide" d="${route}" pathLength="100" stroke="${shade}" stroke-width="8" stroke-dasharray="43 100" stroke-dashoffset="-57" display="none"/>
        <path class="world-wake" d="${route}" stroke="#70d9fa" stroke-width="23"/>
        <path class="world-route" d="${route}" stroke="${shade}" stroke-width="10"/>
        <path class="world-sheen" d="${route}" stroke="#a6f0ff" stroke-width="4"/>
        <path class="world-drop" d="M0-19C4-11 13-3 13 6a13 13 0 1 1-26 0c0-9 9-17 13-25Z" fill="${shade}" stroke="#def9ff" stroke-width="2.5"/>
        <ellipse class="world-ripple" rx="23" ry="8" stroke="#a6f0ff" stroke-width="3"/>
      </g>`;
    }).join('');
    return `<div class="shared-stage" id="world-${id}" hidden><div class="world-art">${art.replace('</svg>', routes + '</svg>')}</div><div class="world-labels"></div></div>`;
  }).join('\n');
}

function initWorlds() {
  return Object.fromEntries([...document.querySelectorAll('.shared-stage')].map(root => {
    const tracks = Object.fromEntries([...root.querySelectorAll('.world-water')].map(group => {
      const route = group.querySelector('.world-route');
      return [group.dataset.route, { group, route, length: route.getTotalLength(), guide: group.querySelector('.world-guide'),
        wake: group.querySelector('.world-wake'), sheen: group.querySelector('.world-sheen'),
        drop: group.querySelector('.world-drop'), ripple: group.querySelector('.world-ripple') }];
    }));
    return [root.id.slice(6), { root, art: root.querySelector('.world-art'), tracks,
      cutaway: root.querySelector('[data-stage-cutaway]'), rim: root.querySelector('[data-stage-rim]'),
      soil: root.querySelector('[data-stage-soil]'), puddle: root.querySelector('[data-stage-puddle]'),
      labels: root.querySelector('.world-labels'), activeLabels: null }];
  }));
}

function worldSample(keys, t, channel, smooth) {
  const i = keys.findIndex(key => key.t >= t);
  if (i <= 0) return (i === 0 ? keys[0] : keys.at(-1))[channel];
  const a = keys[i - 1], b = keys[i];
  let p = seg(t, a.t, b.t);
  if (smooth) p = p * p * (3 - 2 * p);
  return a[channel] + (b[channel] - a[channel]) * p;
}

function updateWorld(world, shot, t, time) {
  const readCamera = channel => worldSample(shot.camera, t, channel, true);
  const zoom = readCamera('zoom');
  const offset = (center, edge) => Math.min(0, Math.max(edge * (1 - zoom), edge / 2 - center * zoom));
  const x = offset(readCamera('x'), 1920), y = offset(readCamera('y'), 1080);
  world.art.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + zoom + ')';
  const p = worldSample(shot.flow, t, 'value', true);
  const cut = worldSample(shot.reveal, t, 'value', true);
  const activeRoute = shot.route ?? 'main';
  const water = shot.water ? worldSample(shot.water, t, 'value', true) : 1;
  const track = world.tracks[activeRoute];
  for (const [name, item] of Object.entries(world.tracks)) {
    const compare = shot.compare && (name === 'main' || name === 'garden');
    item.group.style.display = compare || name === activeRoute ? '' : 'none';
    item.guide.style.display = compare ? 'inline' : 'none';
    if (name === activeRoute && !shot.compare) continue;
    for (const part of [item.route, item.wake, item.sheen, item.drop, item.ripple]) part.style.opacity = 0;
  }
  const distance = track.length * p;
  const tip = track.route.getPointAtLength(distance);
  const spreading = activeRoute === 'main' ? seg(p, .49, .61) * (1 - seg(p, .84, .94)) : 0;
  const tail = 27 + spreading * 141 + cut * 85;
  const drawn = Math.min(distance, tail);
  const sheen = Math.min(drawn, 52 + spreading * 73);
  const dash = (element, width, end) => {
    element.setAttribute('stroke-dasharray', width + ' ' + (track.length + 2));
    element.setAttribute('stroke-dashoffset', width - end);
    element.style.opacity = width > 0 && !shot.compare ? water : 0;
  };
  dash(track.route, drawn, distance);
  const wake = Math.min(distance, drawn * 1.18);
  dash(track.wake, wake, distance);
  track.wake.style.opacity = distance > 0 && !shot.compare ? spreading * water * .58 : 0;
  dash(track.sheen, sheen, distance - Math.min(drawn - sheen, 12 + 5 * Math.sin(time * 9)));
  track.route.setAttribute('stroke-width', 10 + spreading * 6);
  track.drop.setAttribute('transform', 'translate(' + tip.x + ' ' + tip.y + ') scale(' + (1 + .5 * spreading) + ' ' + (1 - .57 * spreading) + ')');
  track.drop.style.opacity = shot.compare ? 0 : water * (1 - seg(p, .78, .88) * .8);
  track.ripple.setAttribute('transform', 'translate(' + tip.x + ' ' + tip.y + ') scale(' + (1 + spreading * .6) + ' 1)');
  track.ripple.style.opacity = shot.compare ? 0 : water * spreading * (.36 + .3 * Math.sin(time * 9) ** 2);
  if (world.soil) world.soil.style.opacity = shot.soil ? worldSample(shot.soil, t, 'value', true) : 0;
  if (world.puddle) world.puddle.style.opacity = shot.puddle ? worldSample(shot.puddle, t, 'value', true) : 0;
  world.cutaway.style.opacity = cut;
  world.rim.style.filter = cut > 0 ? 'drop-shadow(0 0 ' + (17 * cut) + 'px #3bbcf9)' : '';
  if (world.activeLabels !== shot.labels) {
    world.activeLabels = shot.labels;
    world.labels.replaceChildren(...shot.labels.map(label => {
      const el = document.createElement('div');
      el.className = 'world-label';
      el.textContent = label.text;
      return el;
    }));
  }
  shot.labels.forEach((label, index) => {
    const el = world.labels.children[index];
    const left = x + label.x * zoom, top = y + label.y * zoom;
    el.style.transform = 'translate(' + left + 'px,' + top + 'px)';
    el.style.opacity = left < 32 || left > 1720 || top < 125 || top > 936 ? 0
      : Math.min(seg(t, label.from, label.from + .05), 1 - seg(t, label.to - .05, label.to));
  });
}

const css = `
.shared-stage,.world-art,.world-labels { position:absolute; inset:0; pointer-events:none; }
.shared-stage { overflow:hidden; }
.world-art { transform-origin:0 0; }
.world-art svg { width:1920px; height:1080px; display:block; }
.world-label { position:absolute; display:inline-flex; align-items:center; gap:12px; transform-origin:0 0;
  white-space:nowrap; color:#f6fff8; background:#173b3c; border:1px solid #61b9b4; border-radius:14px;
  padding:8px 14px 9px 11px; font:650 29px/1.1 "PingFang SC","Microsoft YaHei",sans-serif;
  box-shadow:0 4px 14px #16363832; }
.world-label::before { content:''; width:12px; height:12px; border-radius:50%; background:#9fedff; }`;

module.exports = { validWorlds, validStageShot, routeOf, visualContext, stageMarkup, css,
  runtime: () => [initWorlds, worldSample, updateWorld].map(fn => fn.toString()).join('\n') };
