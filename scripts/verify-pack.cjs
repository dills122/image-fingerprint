const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const packageJson = require('../package.json');

function collectExportPaths(value) {
  if (typeof value === 'string') {
    return value.includes('*') ? [] : [value.replace(/^\.\//, '')];
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectExportPaths);
  }

  return [];
}

const expectedFiles = new Set([
  'LICENSE',
  'README.md',
  'package.json',
  packageJson.main,
  packageJson.types,
  ...collectExportPaths(packageJson.exports),
]);

const output = execFileSync(
  'npm',
  ['pack', '--dry-run', '--json', '--ignore-scripts'],
  {
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: path.join(os.tmpdir(), 'image-fingerprint-npm-cache'),
      npm_config_ignore_scripts: 'true',
    },
  },
);

const packResult = JSON.parse(output);
if (packResult[0].name !== 'image-fingerprint') {
  throw new Error(`Unexpected package name: ${packResult[0].name}`);
}

const files = new Set(packResult[0].files.map(({ path: filePath }) => filePath));
const missing = [...expectedFiles].filter((file) => !files.has(file));
const unexpected = [...files].filter(
  (file) => !expectedFiles.has(file) && !file.startsWith('lib/'),
);

if (missing.length > 0 || unexpected.length > 0) {
  const problems = [];

  if (missing.length > 0) {
    problems.push(`Missing expected files: ${missing.sort().join(', ')}`);
  }

  if (unexpected.length > 0) {
    problems.push(`Unexpected files: ${unexpected.sort().join(', ')}`);
  }

  throw new Error(problems.join('\n'));
}

process.stdout.write(`Verified ${files.size} files in the npm package.\n`);
