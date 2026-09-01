import fs from 'node:fs';
import path from 'node:path';
import { extractAll } from '@electron/asar';

const root = path.resolve(import.meta.dirname, '..');
const candidates = [
  path.join(root, 'release', 'linux-unpacked', 'resources', 'app.asar'),
  path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar')
];
const asarPath = candidates.find((candidate) => fs.existsSync(candidate));
if (!asarPath) throw new Error('No unpacked ATLAS package found. Run `pnpm run package:dir` first.');

const extractRoot = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'atlas-package-audit-'));
try {
  extractAll(asarPath, extractRoot);
  const forbidden = [
    ['sketchotp', 'gmail.com'].join('@'),
    ['/home', 'sketch'].join('/'),
    ['C:', 'Users', 'sketc'].join('\\')
  ];
  const stack = [extractRoot];
  const files = [];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute); else files.push(absolute);
    }
  }
  const failures = [];
  for (const file of files) {
    const relative = path.relative(extractRoot, file);
    if (/(^|\/)(Cookies|Local State|Preferences|WebStorage|Session Storage|Browser)(\/|$)/i.test(relative)) failures.push(`runtime state: ${relative}`);
    if (fs.statSync(file).size > 2_000_000) continue;
    const content = fs.readFileSync(file).toString('utf8');
    for (const marker of forbidden) if (content.includes(marker)) failures.push(`sensitive marker ${JSON.stringify(marker)} in ${relative}`);
  }
  if (failures.length) throw new Error(`Packaged application audit failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  console.log(`Packaged application audit passed: ${files.length} files, no profile state or sensitive markers.`);
} finally {
  fs.rmSync(extractRoot, { recursive: true, force: true });
}
