import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
const forbiddenPaths = [
  /(^|\/)(agent-secrets\.json|Cookies|Local State|Preferences|WebStorage|Session Storage)(\/|$)/i,
  /(^|\/)(node_modules|\.venv|work|downloads|release|dist)(\/|$)/i,
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)Browser$/
];
const sensitiveText = [
  { name: 'local home path', pattern: /\/home\/(?:sketch|sketc)(?:\/|\b)/i },
  { name: 'Windows user path', pattern: /C:\\Users\\sketc(?:\\|\b)/i },
  { name: 'personal email', pattern: /sketchotp@gmail\.com/i },
  { name: 'personal legal name', pattern: new RegExp(['Tym', 'Huseby'].join(' '), 'i') },
  { name: 'private key', pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: 'OpenAI-style key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ }
];
const textExtensions = new Set(['.cjs', '.css', '.html', '.ini', '.js', '.json', '.md', '.mjs', '.py', '.sh', '.txt', '.yaml', '.yml']);
const failures = [];

for (const relativePath of tracked) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  if (forbiddenPaths.some((pattern) => pattern.test(relativePath))) failures.push(`forbidden tracked path: ${relativePath}`);
  if (!textExtensions.has(path.extname(relativePath).toLowerCase()) && !['LICENSE', '.gitignore'].includes(relativePath)) continue;
  const content = fs.readFileSync(absolutePath, 'utf8');
  for (const rule of sensitiveText) if (rule.pattern.test(content)) failures.push(`${rule.name} in ${relativePath}`);
}

if (failures.length) {
  console.error(`Release audit failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}

console.log(`Release audit passed: ${tracked.length} tracked files contain no forbidden runtime state or known sensitive values.`);
