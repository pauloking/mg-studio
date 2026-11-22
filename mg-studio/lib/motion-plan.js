'use strict';

const MOTION_MODES = ['classic', 'flow', 'focus'];

function canCompose(scene) {
  if (scene.custom || scene.cues?.length) return false;
  if (scene.layout === 'title-card') {
    return scene.elements.some(el => el.type === 'text' && el.props.role === 'title');
  }
  return scene.layout === 'points' && scene.elements.length === 1 && scene.elements[0].type === 'card';
}

function displayText(text, maxWidth) {
  let width = 0;
  let result = '';
  for (const letter of text.trim()) {
    width += /^[\x00-\x7f]$/.test(letter) ? 0.55 : 1;
    if (width > maxWidth) return result.trimEnd() + '…';
    result += letter;
  }
  return result;
}

function extractNodes(text) {
  if (!/时间节点|依次|阶段|步骤|动作|环节/.test(text)) return [];
  const phrase = /(?:区分了?|依次(?:经过|包括|为)|分别为|三个阶段是)([^。！？；]+?)(?:[两三四]个(?:时间)?(?:节点|阶段|步骤)|[。！？；]|$)/.exec(text)?.[1]
    || /从([^。！？；]{3,50}?)[两三四]个(?:动作|步骤|环节)/.exec(text)?.[1];
  if (!phrase) return [];
  const labels = phrase.trim().split(/\s*(?:、|和|与|→)\s*/);
  return labels.length >= 2 && labels.length <= 4 && labels.every(label => /^[\p{L}\p{N}· ]{1,12}$/u.test(label))
    ? labels : [];
}

function extractComparison(text) {
  const phrase = /(?:比较了?|对比了?|对照了?)([^。！？；，]{3,50})/.exec(text)?.[1];
  const labels = phrase?.trim().split(/\s*(?:与|和|\bvs\.?\s+)\s*/i) || [];
  return labels.length === 2 && labels.every(label => /^[\p{L}\p{N}· -]{2,18}$/u.test(label)) ? labels : [];
}

function composeScenes(project) {
  const mode = project.story.meta.motion;
  if (!mode || mode === 'classic') return project.scenes;
  return project.scenes.map((scene, index) => {
    if (!canCompose(scene)) return scene;
    const opening = scene.layout === 'title-card';
    const closing = ['takeaway', 'summary', 'cta'].includes(project.story.beats[index].role);
    const card = scene.elements[0].props;
    const title = opening ? scene.elements.find(el => el.props.role === 'title').props.content : card.title;
    const text = opening
      ? scene.elements.find(el => el.props.role === 'subtitle')?.props.content || ''
      : card.desc;
    let description = displayText(text, opening ? 38 : 63);
    const nodes = !opening && !closing ? extractNodes(text) : [];
    const comparison = !opening && !closing && !nodes.length ? extractComparison(text) : [];
    // Only feature a single quantity literally present in the author's on-screen text.
    const quantities = !opening && !closing ? [...text.matchAll(/(?<![\d.,])(\d+(?:\.\d+)?)\s*(分钟|小时|秒|天|%|％)/g)] : [];
    const metric = description === text.trim() && quantities.length === 1 && quantities[0][1].length <= 5
      && !/(?:[~～至–—+<>≤≥-]|约|至少|超过|以内)\s*$/.test(text.slice(0, quantities[0].index))
      ? quantities[0] : null;
    const kind = opening ? 'opening' : closing ? 'recap' : nodes.length ? 'chain'
      : comparison.length ? 'comparison' : metric ? 'metric' : 'statement';
    let heading = /^要点\s*\d+$/.test(title) || (closing && title === '小结') ? '' : displayText(title, opening ? 32 : 21);
    if (kind === 'chain' && !heading) {
      heading = /[两三四]个(?:时间)?(?:节点|阶段|步骤|动作|环节)/.exec(text)?.[0] || '';
      const attribution = /^([^，。！？]{6,40}(?:指南|研究|课程|试验))(?=区分|把|中)/.exec(text)?.[1];
      if (heading && attribution) description = attribution;
    }
    return {
      ...scene, layout: 'motion-graphic',
      elements: [{
        id: 'graphic', type: 'graphic', props: {
          mode, kind, title: heading, desc: description,
          nodes: comparison.length ? comparison : nodes,
          number: kind === 'metric' ? metric[1] : '', unit: kind === 'metric' ? metric[2] : ''
        }
      }]
    };
  });
}

module.exports = { MOTION_MODES, canCompose, composeScenes, extractNodes, extractComparison };
