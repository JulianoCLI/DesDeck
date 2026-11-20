#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/renderer/styles.css');
let content = fs.readFileSync(filePath, 'utf8');

console.log('Adding Phase 4 CSS...\n');

const css = `
.tile.headless-mode.connecting::after {
  content: "⚡ Offline Loading...";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px;
  color: var(--cyan);
  animation: pulse 1s infinite;
  z-index: 10;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}`;

content += css;

fs.writeFileSync(filePath, content, 'utf8');
console.log('✓ Phase 4 CSS added successfully!');
