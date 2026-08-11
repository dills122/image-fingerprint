#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_SECTIONS = [
  'At a glance',
  'Install or upgrade',
  "What's changed",
  'Examples',
  'Breaking changes',
  'Experimental',
  'Compatibility',
  'Full changelog',
];

const parseArguments = (arguments_) => {
  let root = process.cwd();

  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === '--root') {
      root = arguments_[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arguments_[index]}`);
  }

  return { root: resolve(root) };
};

const fail = (message) => {
  console.error(`Release notes validation failed: ${message}`);
  process.exitCode = 1;
};

const sectionBody = (contents, heading) => {
  const marker = `## ${heading}`;
  const start = contents.indexOf(marker);
  if (start === -1) {
    return undefined;
  }

  const bodyStart = start + marker.length;
  const nextHeading = contents.indexOf('\n## ', bodyStart);
  return contents.slice(bodyStart, nextHeading === -1 ? undefined : nextHeading).trim();
};

let root;
try {
  ({ root } = parseArguments(process.argv.slice(2)));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (root !== undefined) {
  const packagePath = resolve(root, 'package.json');
  if (!existsSync(packagePath)) {
    fail(`package.json was not found under ${root}`);
  } else {
    const packageMetadata = JSON.parse(readFileSync(packagePath, 'utf8'));
    const { name, version } = packageMetadata;
    const notesPath = resolve(root, 'docs', 'releases', `${version}.md`);

    if (!existsSync(notesPath)) {
      fail(`missing docs/releases/${version}.md; copy docs/releases/TEMPLATE.md and complete it`);
    } else {
      const contents = readFileSync(notesPath, 'utf8');
      const expectedTitle = `# ${name} ${version}`;

      if (contents.split('\n', 1)[0] !== expectedTitle) {
        fail(`docs/releases/${version}.md must begin with "${expectedTitle}"`);
      }

      for (const heading of REQUIRED_SECTIONS) {
        const body = sectionBody(contents, heading);
        if (body === undefined) {
          fail(`docs/releases/${version}.md is missing "## ${heading}"`);
        } else if (body.length === 0 || /\b(?:TODO|TBD)\b/.test(body)) {
          fail(`docs/releases/${version}.md has an incomplete "## ${heading}" section`);
        }
      }

      if (process.exitCode !== 1) {
        console.log(`Validated curated release notes: docs/releases/${version}.md`);
      }
    }
  }
}
