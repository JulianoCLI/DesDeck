#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/renderer/app.js');
let content = fs.readFileSync(filePath, 'utf8');

console.log('Applying Phase 4 patches...\n');

// Patch 1: Add bootHeadless to DEFAULT_SETTINGS
const patch1old = "  economy: true,\n};";
const patch1new = "  economy: true,\n  bootHeadless: false,\n};";
content = content.replace(patch1old, patch1new);
console.log('✓ Patch 1: Added bootHeadless to DEFAULT_SETTINGS');

// Patch 2: Update createRuntime to skip webview if headless or bootHeadless
const patch2old = `  const wv = document.createElement('webview');
  wv.setAttribute('partition', partitionOf(id));
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('webpreferences', 'backgroundThrottling=yes');
  r.wv = wv;`;

const patch2new = `  // Phase 4: Boot headless
  const bootHeadless = state?.settings?.bootHeadless || false;
  if (acc.headless || bootHeadless) {
    r.wv = null;
    r.ready = true;
  } else {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', partitionOf(id));
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('webpreferences', 'backgroundThrottling=yes');
    r.wv = wv;
  }`;

content = content.replace(patch2old, patch2new);
console.log('✓ Patch 2: Modified createRuntime to skip webview in headless/bootHeadless mode');

// Patch 3: Ensure headless socket starts on boot
const patch3old = `  if (acc.headless) {
    deck.headlessStart(id).catch(err => console.error('[headless] erro ao iniciar:', err));
  }`;

const patch3new = `  if (acc.headless || state?.settings?.bootHeadless) {
    deck.headlessStart(id).catch(err => console.error('[headless] boot start:', err));
  }`;

content = content.replace(patch3old, patch3new);
console.log('✓ Patch 3: Updated headless socket startup logic');

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nPhase 4 patches applied successfully!');
