#!/usr/bin/env python3

file_path = r'C:\Users\pc\Desktop\DesDeck-Dev\dd-src\src\renderer\app.js'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Patch 1: Find and add bootHeadless to DEFAULT_SETTINGS
for i, line in enumerate(lines):
    if line.strip() == 'economy: true,':
        lines[i] = '  economy: true,\n'
        lines.insert(i + 1, '  bootHeadless: false,\n')
        break

# Patch 2: Fix webview creation
new_lines = []
i = 0
while i < len(lines):
    if 'const wv = document.createElement' in lines[i] and 'webview' in lines[i]:
        # Found it - replace next 5 lines
        # Look for context
        if i > 0 and 'const bootHeadless' not in lines[i-1]:
            # This is the webview creation in createRuntime
            new_lines.append('  const bootHeadless = state?.settings?.bootHeadless || false;\n')
            new_lines.append('  if (acc.headless || bootHeadless) {\n')
            new_lines.append('    r.wv = null;\n')
            new_lines.append('    r.ready = true;\n')
            new_lines.append('  } else {\n')
            new_lines.append('    const wv = document.createElement(\'webview\');\n')
            # Skip next 4 lines and copy them into the else block
            for j in range(1, 5):
                if i + j < len(lines):
                    new_lines.append('    ' + lines[i + j])
            new_lines.append('  }\n')
            i += 5
            continue
    
    new_lines.append(lines[i])
    i += 1

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("OK - Phase 4 patches applied")
