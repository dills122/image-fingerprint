import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

export const runCommand = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error([
      `${command} ${arguments_.join(' ')} failed with exit code ${result.status}`,
      result.stdout.trim(),
      result.stderr.trim(),
    ].filter(Boolean).join('\n'));
  }
  return result;
};

const packagePath = (root, packageName) => join(root, ...packageName.split('/'));

const linkInstalledPackage = async (consumerModules, packageName) => {
  const source = await realpath(packagePath(join(repositoryRoot, 'node_modules'), packageName));
  const target = packagePath(consumerModules, packageName);
  await mkdir(dirname(target), { recursive: true });
  await symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir');
};

export const createPackedConsumer = async ({ includeNodeTypes = false } = {}) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'image-fingerprint-packed-consumer-'));
  const consumerRoot = join(temporaryRoot, 'consumer');
  const consumerModules = join(consumerRoot, 'node_modules');
  const packageRoot = join(consumerModules, 'image-fingerprint');
  const tarball = join(temporaryRoot, 'image-fingerprint.tgz');

  try {
    await mkdir(packageRoot, { recursive: true });
    runCommand('pnpm', ['pack', '--out', tarball]);
    runCommand('tar', [
      '-xzf',
      tarball,
      '-C',
      packageRoot,
      '--strip-components=1',
    ]);

    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    const dependencyNames = Object.keys(manifest.dependencies ?? {});
    if (includeNodeTypes) {
      dependencyNames.push('@types/node');
    }
    for (const dependencyName of dependencyNames) {
      await linkInstalledPackage(consumerModules, dependencyName);
    }

    return {
      consumerRoot,
      packageRoot,
      manifest,
      cleanup: () => rm(temporaryRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
};
