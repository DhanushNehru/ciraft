#!/usr/bin/env node

/**
 * @file ciraft CLI entry point
 * @description Parses command-line arguments and dispatches to the appropriate
 * subcommand: detect, generate, audit, or the default full flow.
 */

import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run, runDetect, runGenerate, runAudit } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Read version from package.json.
 * @returns {Promise<string>}
 */
async function getVersion() {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
    return pkg.version;
  } catch {
    return '1.0.0';
  }
}

/**
 * Build and execute the CLI program.
 */
async function main() {
  const version = await getVersion();

  const program = new Command();

  program
    .name('ciraft')
    .description('Generate production-grade CI/CD pipelines in seconds')
    .version(version, '-v, --version')
    .option('--dry-run', 'Preview output without writing files', false)
    .option('-o, --output <path>', 'Output file path')
    .option('-t, --target <platform>', 'CI platform target (github-actions, gitlab-ci)', 'github-actions')
    .option('-i, --interactive', 'Enable interactive prompts', false)
    .option('-f, --force', 'Overwrite existing files without confirmation', false)
    .action(async (options) => {
      // Default command: full detect + generate flow
      await run(normalizeOptions(options));
    });

  program
    .command('detect')
    .description('Scan the project and display the detected stack')
    .action(async () => {
      const opts = program.opts();
      await runDetect(normalizeOptions(opts));
    });

  program
    .command('generate')
    .description('Detect stack and generate a CI/CD pipeline')
    .option('--dry-run', 'Preview output without writing files', false)
    .option('-o, --output <path>', 'Output file path')
    .option('-t, --target <platform>', 'CI platform target', 'github-actions')
    .option('-f, --force', 'Overwrite existing files', false)
    .action(async (cmdOptions) => {
      const globalOpts = program.opts();
      const mergedOpts = { ...globalOpts, ...cmdOptions };
      await runGenerate(normalizeOptions(mergedOpts));
    });

  program
    .command('audit [file]')
    .description('Audit an existing workflow file for best practices')
    .action(async (file) => {
      const opts = program.opts();
      await runAudit(file, normalizeOptions(opts));
    });

  // Parse and execute
  await program.parseAsync(process.argv);
}

/**
 * Normalize commander options to the internal config format.
 * @param {Object} opts - Raw commander options.
 * @returns {Object} Normalized options.
 */
function normalizeOptions(opts) {
  return {
    dryRun: opts.dryRun || false,
    output: opts.output || undefined,
    target: opts.target || undefined,
    interactive: opts.interactive || false,
    force: opts.force || false,
  };
}

// Run the CLI
main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exitCode = 1;
});
