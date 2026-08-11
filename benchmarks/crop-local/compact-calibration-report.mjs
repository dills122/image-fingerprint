import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { compactCropLocalCalibrationReport } from './calibration-corpus.mjs';

const parseArguments = (arguments_) => {
  const normalized = arguments_.filter(argument => argument !== '--');
  let input;
  let output;
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === '--input') input = resolve(normalized[index += 1]);
    else if (normalized[index] === '--output') output = resolve(normalized[index += 1]);
    else throw new Error('Usage: compact-calibration-report.mjs --input FILE --output FILE');
  }
  if (input === undefined || output === undefined) {
    throw new Error('Usage: compact-calibration-report.mjs --input FILE --output FILE');
  }
  return { input, output };
};

try {
  const { input, output } = parseArguments(process.argv.slice(2));
  const report = compactCropLocalCalibrationReport(JSON.parse(await readFile(input, 'utf8')));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    output,
    sourceImages: report.counts.sourceImages,
    positivePairs: report.counts.positivePairs,
    negativePairs: report.counts.negativePairs,
    falsePositives: report.falsePositiveEvidence.count,
    pass: report.finalDevelopmentGate.pass,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`compact crop-local calibration report: ${error.message}\n`);
  process.exitCode = 2;
}
