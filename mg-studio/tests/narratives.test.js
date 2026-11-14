'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadTemplate, IDS } = require('../lib/narratives');

test('IDS 含四套模板', () => {
  assert.deepEqual(IDS.slice().sort(), ['free', 'product', 'science', 'teaching']);
});

test('science：hook 首、必备 role、末 outro', () => {
  const t = loadTemplate('science');
  assert.equal(t.id, 'science');
  assert.equal(t.firstRole, 'hook');
  assert.ok(t.requiredRoles.includes('mechanism'));
  assert.ok(t.requiredRoles.includes('evidence'));
  assert.ok(t.lastRoles.includes('takeaway'));
});

test('teaching：objective 首、steps 必备', () => {
  const t = loadTemplate('teaching');
  assert.equal(t.firstRole, 'objective');
  assert.ok(t.requiredRoles.includes('steps'));
});

test('free：不约束顺序与必备 role', () => {
  const t = loadTemplate('free');
  assert.equal(t.firstRole, null);
  assert.deepEqual(t.requiredRoles, []);
  assert.deepEqual(t.lastRoles, []);
});

test('未知模板报错', () => {
  assert.throws(() => loadTemplate('bogus'), /未知叙事模板/);
});
