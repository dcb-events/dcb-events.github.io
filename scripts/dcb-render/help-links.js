#!/usr/bin/env node
// Prints, as a JSON array, every dcb.events URL the DCB Playground's help links to
// (`helpReferenceLinks` in the playground's help.js), so the build can check that each page
// and anchor exists (hooks/playground.py).
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.resolve(process.env.DCB_PLAYGROUND_DIR || path.join(__dirname, '../../playground'), 'app');

const context = vm.createContext({});
vm.runInContext(`${fs.readFileSync(path.join(APP, 'help.js'), 'utf8')}\n;globalThis.links = helpReferenceLinks();`,
  context, { filename: 'help.js' });
process.stdout.write(JSON.stringify(context.links));
