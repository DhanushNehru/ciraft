/**
 * @module index
 * @description Main orchestrator for pipeforge. Ties together the detect → generate
 * flow with interactive prompts, dry-run support, and polished output.
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import log from './utils/logger.js';
import { loadConfig, mergeCliOptions } from './utils/config.js';
import { detect, printDetectionSummary } from './detector.js';
import { generate, writePipeline, printDryRun } from './generator.js';
import { auditFile, auditAll, printAuditReport } from './auditor.js';

/**
 * Run the full detect + generate pipeline flow.
 * @param {Object} [cliOptions={}] - Options from commander.
 * @param {string} [cwd=process.cwd()] - Working directory.
 */
export async function run(cliOptions = {}, cwd = process.cwd()) {
  log.banner();

  try {
    // Load config
    const config = mergeCliOptions(await loadConfig(cwd), cliOptions);

    // Step 1: Detect
    log.step(1, 3, 'Scanning project...');
    const detection = await detect(cwd);
    printDetectionSummary(detection);

    if (detection.languages.length === 0) {
      log.error('Could not detect any project stack.');
      log.info('Make sure you run pipeforge from your project root directory.');
      process.exitCode = 1;
      return;
    }

    // Interactive mode: confirm and customize
    if (config.interactive) {
      const proceed = await promptConfirmation(detection, config);
      if (!proceed) {
        log.info('Generation cancelled.');
        return;
      }
    }

    // Step 2: Generate
    log.step(2, 3, 'Generating pipeline...');
    const result = await generate(detection, config);

    // Step 3: Output
    log.step(3, 3, 'Writing output...');

    if (config.dryRun) {
      printDryRun(result.content);
    } else {
      const absPath = await writePipeline(result.content, result.outputPath, cwd, config.force);
      log.blank();
      log.success(`Pipeline written to ${chalk.bold(result.outputPath)}`);
      log.info(`Full path: ${absPath}`);
    }

    // Summary
    log.blank();
    log.divider();
    log.blank();
    log.success('Done! Your CI/CD pipeline is ready. 🚀');
    log.blank();

    if (!config.dryRun) {
      log.info(`Next steps:`);
      log.info(`  1. Review the generated file: ${chalk.cyan(result.outputPath)}`);
      log.info(`  2. Commit and push to trigger your pipeline`);
      log.info(`  3. Run ${chalk.cyan('pipeforge audit')} to check for best practices`);
      log.blank();
    }
  } catch (err) {
    log.failSpinner();
    log.error(err.message);

    if (process.env.DEBUG || process.env.PIPEFORGE_DEBUG) {
      console.error(err);
    }

    process.exitCode = 1;
  }
}

/**
 * Run only the detection step and display results.
 * @param {Object} [cliOptions={}] - Options from commander.
 * @param {string} [cwd=process.cwd()] - Working directory.
 */
export async function runDetect(cliOptions = {}, cwd = process.cwd()) {
  log.banner();

  try {
    const detection = await detect(cwd);
    printDetectionSummary(detection);

    if (detection.languages.length === 0) {
      log.warn('No project stack detected in this directory.');
      log.info('Ensure you run this from a project root with recognizable config files.');
    } else {
      log.success(`Detected ${detection.languages.length} language(s): ${detection.languages.join(', ')}`);
    }

    log.blank();
  } catch (err) {
    log.failSpinner();
    log.error(err.message);
    process.exitCode = 1;
  }
}

/**
 * Run only the generate step (skips detection display).
 * @param {Object} [cliOptions={}] - Options from commander.
 * @param {string} [cwd=process.cwd()] - Working directory.
 */
export async function runGenerate(cliOptions = {}, cwd = process.cwd()) {
  log.banner();

  try {
    const config = mergeCliOptions(await loadConfig(cwd), cliOptions);

    log.step(1, 2, 'Detecting stack...');
    const detection = await detect(cwd);

    if (detection.languages.length === 0) {
      log.error('No languages detected. Cannot generate pipeline.');
      process.exitCode = 1;
      return;
    }

    log.step(2, 2, 'Generating pipeline...');
    const result = await generate(detection, config);

    if (config.dryRun) {
      printDryRun(result.content);
    } else {
      const absPath = await writePipeline(result.content, result.outputPath, cwd, config.force);
      log.blank();
      log.success(`Pipeline written to ${chalk.bold(result.outputPath)}`);
      log.info(`Full path: ${absPath}`);
    }

    log.blank();
  } catch (err) {
    log.failSpinner();
    log.error(err.message);
    process.exitCode = 1;
  }
}

/**
 * Run the audit command on a specific file or all workflow files.
 * @param {string} [file] - Specific file to audit (optional).
 * @param {Object} [cliOptions={}] - Options from commander.
 * @param {string} [cwd=process.cwd()] - Working directory.
 */
export async function runAudit(file, cliOptions = {}, cwd = process.cwd()) {
  log.banner();

  try {
    let reports;

    if (file) {
      const report = await auditFile(file);
      reports = [report];
    } else {
      reports = await auditAll(cwd);
    }

    if (reports.length === 0) {
      log.warn('No workflow files to audit.');
      log.info('Run `pipeforge` first to generate a workflow, then audit it.');
      return;
    }

    for (const report of reports) {
      printAuditReport(report);
    }

    // Overall summary if multiple files
    if (reports.length > 1) {
      const avgScore = Math.round(
        reports.reduce((sum, r) => sum + r.score, 0) / reports.length
      );
      log.divider();
      log.blank();
      log.keyValue('Files audited', String(reports.length));
      log.keyValue('Average score', `${avgScore}/100`);
      log.blank();
    }
  } catch (err) {
    log.failSpinner();
    log.error(err.message);
    process.exitCode = 1;
  }
}

/**
 * Prompt the user for confirmation and customization in interactive mode.
 * @param {import('./detector.js').DetectionResult} detection - Detection results.
 * @param {import('./utils/config.js').PipeforgeConfig} config - Current config.
 * @returns {Promise<boolean>} Whether to proceed with generation.
 */
async function promptConfirmation(detection, config) {
  log.blank();

  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Generate pipeline with the detected stack?',
      default: true,
    },
    {
      type: 'list',
      name: 'target',
      message: 'Which CI platform?',
      choices: [
        { name: 'GitHub Actions', value: 'github-actions' },
        { name: 'GitLab CI', value: 'gitlab-ci' },
      ],
      default: config.target,
      when: (a) => a.proceed,
    },
    {
      type: 'input',
      name: 'output',
      message: 'Output file path:',
      default: config.output,
      when: (a) => a.proceed,
    },
    {
      type: 'checkbox',
      name: 'features',
      message: 'Enable features:',
      choices: [
        { name: 'Dependency caching', value: 'cache', checked: config.enableCache },
        { name: 'Security scanning', value: 'security', checked: config.enableSecurity },
        { name: 'Concurrency groups', value: 'concurrency', checked: config.enableConcurrency },
      ],
      when: (a) => a.proceed,
    },
  ]);

  if (!answers.proceed) return false;

  // Apply interactive answers back to config
  if (answers.target) config.target = answers.target;
  if (answers.output) config.output = answers.output;
  if (answers.features) {
    config.enableCache = answers.features.includes('cache');
    config.enableSecurity = answers.features.includes('security');
    config.enableConcurrency = answers.features.includes('concurrency');
  }

  return true;
}

export default { run, runDetect, runGenerate, runAudit };
