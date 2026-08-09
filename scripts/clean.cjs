const fs = require('node:fs');
const path = require('node:path');

const repositoryDirectory = path.resolve(__dirname, '..');
const outputDirectory = path.resolve(repositoryDirectory, 'lib');

if (
  path.dirname(outputDirectory) !== repositoryDirectory
  || path.basename(outputDirectory) !== 'lib'
) {
  throw new Error(`Refusing to clean unexpected output directory: ${outputDirectory}`);
}

fs.rmSync(outputDirectory, { force: true, recursive: true });
