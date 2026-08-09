#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildSolringManifest,
  parseGitLfsPointer,
  parseSolringCornersCsv,
  validateMatchingManifest,
} from './matching-quality-corpus.mjs';

const PINNED_DATASET_REVISION = '11f4c7ba2201dfc67df88093ed49ca8013f23b14';

const usage = () => [
  'Usage: node benchmarks/pdq/prepare-solring-corpus.mjs --dataset <directory> --output <json>',
  '',
  'The dataset must be HanClinto/solring-eval at the pinned revision with Git LFS',
  'objects present. Source images remain in that local clone and are never copied here.',
].join('\n');

const parseArguments = (arguments_) => {
  const options = { dataset: undefined, output: undefined, help: false };
  const seen = new Set();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!['--dataset', '--output', '--help'].includes(argument)) {
      throw new Error(`unknown argument: ${argument}`);
    }
    if (seen.has(argument)) throw new Error(`duplicate argument: ${argument}`);
    seen.add(argument);
    if (argument === '--help') {
      options.help = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${argument} requires a value`);
    index += 1;
    options[argument === '--dataset' ? 'dataset' : 'output'] = resolve(value);
  }
  if (!options.help && (options.dataset === undefined || options.output === undefined)) {
    throw new Error('--dataset and --output are required');
  }
  return options;
};

const readDatasetRevision = (datasetDirectory) => {
  const result = spawnSync('git', ['-C', datasetDirectory, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`could not read dataset Git revision: ${result.stderr.trim()}`);
  return result.stdout.trim();
};

const prepare = async (datasetDirectory, outputPath) => {
  const revision = readDatasetRevision(datasetDirectory);
  if (revision !== PINNED_DATASET_REVISION) {
    throw new Error(`dataset must be checked out at pinned revision ${PINNED_DATASET_REVISION}`);
  }
  const rows = parseSolringCornersCsv(
    await readFile(resolve(datasetDirectory, 'corners.csv'), 'utf8'),
  );
  const fileMetadata = {};
  for (const row of rows) {
    const bytes = await readFile(resolve(datasetDirectory, row.imagePath));
    const pointer = parseGitLfsPointer(bytes);
    if (pointer !== null) {
      throw new Error(
        `${row.imagePath} is still a Git LFS pointer (${pointer.byteLength} bytes expected); run git lfs pull in the dataset clone`,
      );
    }
    fileMetadata[row.imagePath] = {
      byteLength: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }
  const manifest = validateMatchingManifest(buildSolringManifest(rows, {
    datasetRevision: revision,
    fileMetadata,
  }));
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    output: outputPath,
    revision,
    fixtures: manifest.fixtures.length,
    pairs: manifest.pairs.length,
  };
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await prepare(options.dataset, options.output), null, 2)}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n\n${usage()}\n`);
  process.exitCode = 1;
});
