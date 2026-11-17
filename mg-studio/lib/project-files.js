'use strict';
const fs = require('fs');
const path = require('path');
const ir = require('./ir');
const { normalizeScene } = require('./compile');
const { LAYOUT_NAMES } = require('./components');

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// Validate before touching the filesystem, including existing symlink targets.
function projectFilePath(projectDir, name) {
  if (path.basename(name) !== name) throw badRequest('Invalid project filename');
  const target = path.join(projectDir, name);
  try {
    if (fs.lstatSync(target).isSymbolicLink()) throw badRequest('Project files must not be symlinks');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return target;
}

function sceneFilePath(projectDir, id) {
  if (!ir.isSafeId(id)) throw badRequest('Invalid scene ID');
  const scenesDir = path.join(projectDir, 'scenes');
  const target = path.join(scenesDir, id + '.json');
  for (const file of [scenesDir, target]) {
    try {
      if (fs.lstatSync(file).isSymbolicLink()) throw badRequest('Scene paths must not be symlinks');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return target;
}

function validateSceneUpdate(scene, story) {
  const ids = story.beats.map(b => b.id);
  if (!ids.includes(scene.id)) throw badRequest('Unknown scene ID');
  const validation = ir.validateScene(scene, ids, LAYOUT_NAMES);
  if (!validation.ok) throw badRequest(validation.errors.join('; '));
  try { normalizeScene(scene); } catch (err) { throw badRequest(err.message); }
}

module.exports = { projectFilePath, sceneFilePath, validateSceneUpdate };
