'use strict';
// props 校验：把「作者 JSON 里的值」在进入 IR 之前收敛成确定类型。
// 背景：组件 build() 会把 props 拼进生成的 JS，未校验的字符串可以打断字符串字面量；
// 未校验的数字（如 "130px"）会让 SCREEN_BOUNDS 走字符串比较而静默放行。
// 因此：数值类 props 必须 Number.isFinite，文本类必须 string，未知枚举必须报错。
const NUMERIC_KEYS = ['x', 'y', 'w', 'h', 'value', 'minSec', 'at', 'dur'];
const TEXT_KEYS = ['title', 'desc', 'label', 'unit', 'content', 'text'];

function checkGenericProps(el) {
  const errs = [];
  const p = el.props || {};
  for (const k of NUMERIC_KEYS) {
    if (p[k] == null) continue;
    if (!Number.isFinite(p[k])) errs.push(`element ${el.id} props.${k} 须为有限数（收到 ${JSON.stringify(p[k])}，不允许带单位或字符串）`);
  }
  for (const k of TEXT_KEYS) {
    if (p[k] == null) continue;
    if (typeof p[k] !== 'string') errs.push(`element ${el.id} props.${k} 须为字符串（收到 ${JSON.stringify(p[k])}）`);
  }
  return errs;
}

function checkElementProps(layout, el, components) {
  const errs = [];
  if (!el || typeof el !== 'object') return [`element 须为对象`];
  if (el.props == null || typeof el.props !== 'object') {
    errs.push(`element ${el.id} props 须为对象`);
    return errs;
  }
  const comp = components && components[layout];
  if (!comp) return [`未知 layout: ${layout}`];
  errs.push(...checkGenericProps(el));
  if (typeof comp.check === 'function') errs.push(...comp.check(el));
  return [...new Set(errs)];
}

function checkSceneProps(sc, components) {
  const errs = [];
  for (const el of sc.elements || []) errs.push(...checkElementProps(sc.layout, el, components));
  return errs;
}

module.exports = { NUMERIC_KEYS, TEXT_KEYS, checkElementProps, checkSceneProps };
