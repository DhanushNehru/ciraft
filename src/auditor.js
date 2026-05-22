/**
 * @module auditor
 * @description Audits existing CI/CD workflow files for best practices.
 * Checks for missing caching, unpinned actions, security scanning gaps,
 * concurrency groups, timeouts, and permission issues.
 * Outputs a scored report with actionable suggestions.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { glob } from 'glob';
import YAML from 'yaml';
import chalk from 'chalk';
import log from './utils/logger.js';

/**
 * @typedef {Object} AuditIssue
 * @property {'error'|'warning'|'info'} severity - Issue severity level.
 * @property {string} rule - Rule identifier.
 * @property {string} message - Human-readable description.
 * @property {string} [suggestion] - Suggested fix.
 * @property {string} [location] - Where the issue was found (job name, step, etc.).
 */

/**
 * @typedef {Object} AuditReport
 * @property {string} file - Path to the audited file.
 * @property {number} score - Score from 0-100.
 * @property {AuditIssue[]} issues - List of issues found.
 * @property {Object} summary - Count by severity.
 */

/** Maximum deduction per rule category */
const RULE_WEIGHTS = {
  'unpinned-actions': 15,
  'missing-cache': 10,
  'missing-timeout': 10,
  'missing-concurrency': 8,
  'missing-permissions': 12,
  'overly-permissive-permissions': 15,
  'missing-security-scan': 10,
  'missing-fail-fast': 5,
  'hardcoded-secrets': 15,
  'missing-checkout-persist': 3,
  'deprecated-node-version': 7,
};

/**
 * Check for unpinned action versions (not using SHA pinning or exact versions).
 * @param {Object} workflow - Parsed YAML workflow.
 * @returns {AuditIssue[]}
 */
function checkUnpinnedActions(workflow) {
  const issues = [];
  const jobs = workflow.jobs || {};

  for (const [jobName, job] of Object.entries(jobs)) {
    const steps = job.steps || [];
    for (const step of steps) {
      if (!step.uses) continue;

      const actionRef = step.uses;

      // Check if pinned to SHA (40-char hex)
      if (actionRef.match(/@[a-f0-9]{40}$/)) continue;

      // Check if using a mutable tag like @v3, @main, @latest
      if (actionRef.match(/@(main|master|latest|v\d+)$/)) {
        issues.push({
          severity: 'warning',
          rule: 'unpinned-actions',
          message: `Action "${actionRef}" uses a mutable tag.`,
          suggestion: `Pin to a specific SHA: \`${actionRef.split('@')[0]}@<commit-sha>\``,
          location: `jobs.${jobName}`,
        });
      } else if (actionRef.match(/@v\d+\.\d+$/)) {
        // Using minor version — acceptable but could be better
        issues.push({
          severity: 'info',
          rule: 'unpinned-actions',
          message: `Action "${actionRef}" uses a minor version tag. Consider SHA pinning for supply-chain safety.`,
          location: `jobs.${jobName}`,
        });
      }
    }
  }

  return issues;
}

/**
 * Check for missing dependency caching.
 * @param {Object} workflow - Parsed YAML workflow.
 * @returns {AuditIssue[]}
 */
function checkMissingCache(workflow) {
  const issues = [];
  const jobs = workflow.jobs || {};
  const workflowStr = JSON.stringify(workflow);

  for (const [jobName, job] of Object.entries(jobs)) {
    const steps = job.steps || [];
    const stepStr = JSON.stringify(steps);

    // Check if setup-node is used without cache
    const hasNodeSetup = steps.some((s) => s.uses && s.uses.includes('setup-node'));
    if (hasNodeSetup) {
      const nodeStep = steps.find((s) => s.uses && s.uses.includes('setup-node'));
      if (!nodeStep?.with?.cache) {
        issues.push({
          severity: 'warning',
          rule: 'missing-cache',
          message: `Node.js setup in "${jobName}" is missing dependency caching.`,
          suggestion: 'Add `cache: npm` (or yarn/pnpm) to setup-node\'s `with` block.',
          location: `jobs.${jobName}`,
        });
      }
    }

    // Check if setup-python is used without cache
    const hasPythonSetup = steps.some((s) => s.uses && s.uses.includes('setup-python'));
    if (hasPythonSetup) {
      const pyStep = steps.find((s) => s.uses && s.uses.includes('setup-python'));
      if (!pyStep?.with?.cache) {
        issues.push({
          severity: 'warning',
          rule: 'missing-cache',
          message: `Python setup in "${jobName}" is missing dependency caching.`,
          suggestion: 'Add `cache: pip` (or poetry/pipenv) to setup-python\'s `with` block.',
          location: `jobs.${jobName}`,
        });
      }
    }

    // Check if setup-go is used without cache
    const hasGoSetup = steps.some((s) => s.uses && s.uses.includes('setup-go'));
    if (hasGoSetup) {
      const goStep = steps.find((s) => s.uses && s.uses.includes('setup-go'));
      if (!goStep?.with?.cache) {
        // setup-go v4+ has cache enabled by default, but let's flag if explicitly false
        if (goStep?.with?.cache === false) {
          issues.push({
            severity: 'warning',
            rule: 'missing-cache',
            message: `Go setup in "${jobName}" has caching explicitly disabled.`,
            suggestion: 'Remove `cache: false` or set `cache: true` for faster builds.',
            location: `jobs.${jobName}`,
          });
        }
      }
    }

    // Generic: check if actions/cache is used at all
    const hasExplicitCache = steps.some((s) => s.uses && s.uses.includes('actions/cache'));
    const hasSetupActions = steps.some((s) => s.uses && (
      s.uses.includes('setup-node') ||
      s.uses.includes('setup-python') ||
      s.uses.includes('setup-go') ||
      s.uses.includes('setup-java')
    ));

    if (hasSetupActions && !hasExplicitCache) {
      // Only warn if setup action doesn't have built-in cache
      const setupsWithoutCache = steps.filter((s) => {
        if (!s.uses) return false;
        if (!s.uses.includes('setup-')) return false;
        return !s.with?.cache;
      });

      if (setupsWithoutCache.length > 0 && !stepStr.includes('"cache"')) {
        // Already covered by specific checks above, skip generic
      }
    }
  }

  return issues;
}

/**
 * Check for missing job timeouts.
 * @param {Object} workflow - Parsed YAML workflow.
 * @returns {AuditIssue[]}
 */
function checkMissingTimeout(workflow) {
  const issues = [];
  const jobs = workflow.jobs || {};

  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job['timeout-minutes']) {
      issues.push({
        severity: 'warning',
        rule: 'missing-timeout',
        message: `Job "${jobName}" has no timeout-minutes set.`,
        suggestion: 'Add `timeout-minutes: 30` to prevent hung jobs from consuming resources.',
        location: `jobs.${jobName}`,
      });
    }
  }

  return issues;
}

/**
 * Check for missing concurrency groups.
 * @param {Object} workflow - Parsed YAML workflow.
 * @returns {AuditIssue[]}
 */
function checkMissingConcurrency(workflow) {
  const issues = [];

  if (!workflow.concurrency) {
    issues.push({
      severity: 'info',
      rule: 'missing-concurrency',
      message: 'Workflow has no concurrency group defined.',
      suggestion: 'Add a top-level `concurrency` block to cancel in-flight runs on new pushes:\n    concurrency:\n      group: ${{ github.workflow }}-${{ github.ref }}\n      cancel-in-progress: true',
    });
  }

  return issues;
}

/**
 * Check for missing or overly permissive permissions.
 * @param {Object} workflow - Parsed YAML workflow.
 * @returns {AuditIssue[]}
 */
function checkPermissions(workflow) {
  const issues = [];

  // Check top-level permissions
  if (!workflow.permissions) {
    issues.push({
      severity: 'warning',
      rule: 'missing-permissions',
      message: 'Workflow has no top-level `permissions` block. Defaults to broad write access.',
      suggestion: 'Add `permissions: { contents: read }` at the top level and grant specific permissions per-job.',
    });
  } else if (workflow.permissions === 'write-all') {
    issues.push({
      severity: 'error',
      rule: 'overly-permissive-permissions',
      message: 'Workflow uses `permissions: write-all`, granting full write access to all scopes.',
      suggestion: 'Follow the principle of least privilege. Only grant the permissions each job needs.',
    });
  }

  // Check job-level permissions
  const jobs = workflow.jobs || {};
  for (const [jobName, job] of Object.entries(jobs)) {
    if (job.permissions === 'write-all') {
      issues.push({
        severity: 'error',
        rule: 'overly-permissive-permissions',
        message: `Job "${jobName}" uses \`permissions: write-all\`.`,
        suggestion: 'Grant only the specific permissions this job needs.',
        location: `jobs.${jobName}`,
      });
    }
  }

  return issues;
}

/**
 * Check for missing security scanning steps.
 * @param {Object} workflow - Parsed YAML workflow.
 * @returns {AuditIssue[]}
 */
function checkSecurityScanning(workflow) {
  const issues = [];
  const workflowStr = JSON.stringify(workflow).toLowerCase();

  const securityActions = [
    'codeql', 'snyk', 'trivy', 'grype', 'sonarqube', 'sonarcloud',
    'semgrep', 'ossf/scorecard', 'dependency-review', 'npm audit',
    'safety', 'bandit', 'gosec', 'cargo-audit', 'audit-ci',
  ];

  const hasSecurityScan = securityActions.some((action) => workflowStr.includes(action));

  if (!hasSecurityScan) {
    issues.push({
      severity: 'info',
      rule: 'missing-security-scan',
      message: 'No security scanning step detected in the workflow.',
      suggestion: 'Consider adding a security scanner like CodeQL, Snyk, or Trivy.',
    });
  }

  return issues;
}

/**
 * Check for potential hardcoded secrets.
 * @param {string} rawContent - Raw workflow file content.
 * @returns {AuditIssue[]}
 */
function checkHardcodedSecrets(rawContent) {
  const issues = [];

  // Patterns that might indicate hardcoded secrets
  const suspiciousPatterns = [
    { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^$][^'"]{8,}/gi, name: 'API key' },
    { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^$][^'"]{4,}/gi, name: 'password' },
    { pattern: /(?:secret|token)\s*[:=]\s*['"][^$][^'"]{8,}/gi, name: 'secret/token' },
    { pattern: /(?:aws_access_key_id)\s*[:=]\s*['"]?AKIA[A-Z0-9]{16}/gi, name: 'AWS access key' },
  ];

  for (const { pattern, name } of suspiciousPatterns) {
    if (pattern.test(rawContent)) {
      issues.push({
        severity: 'error',
        rule: 'hardcoded-secrets',
        message: `Possible hardcoded ${name} detected in workflow file.`,
        suggestion: `Use GitHub Secrets instead: \`\${{ secrets.YOUR_SECRET_NAME }}\``,
      });
    }
  }

  return issues;
}

/**
 * Check for deprecated Node.js versions.
 * @param {Object} workflow - Parsed YAML workflow.
 * @returns {AuditIssue[]}
 */
function checkDeprecatedVersions(workflow) {
  const issues = [];
  const jobs = workflow.jobs || {};

  const deprecatedNodeVersions = ['10', '12', '14', '15', '16', '17', '19'];

  for (const [jobName, job] of Object.entries(jobs)) {
    const strategy = job.strategy?.matrix;
    if (!strategy) continue;

    const nodeVersions = strategy['node-version'] || strategy['node_version'] || [];
    for (const ver of nodeVersions) {
      const major = String(ver).split('.')[0];
      if (deprecatedNodeVersions.includes(major)) {
        issues.push({
          severity: 'warning',
          rule: 'deprecated-node-version',
          message: `Node.js ${ver} in job "${jobName}" is EOL/deprecated.`,
          suggestion: 'Upgrade to an active LTS version (18 or 20).',
          location: `jobs.${jobName}`,
        });
      }
    }
  }

  return issues;
}

/**
 * Calculate the audit score based on issues found.
 * @param {AuditIssue[]} issues - List of audit issues.
 * @returns {number} Score from 0 to 100.
 */
function calculateScore(issues) {
  let deductions = 0;
  const deductedRules = new Set();

  for (const issue of issues) {
    const weight = RULE_WEIGHTS[issue.rule] || 5;
    let multiplier = 1;

    if (issue.severity === 'error') multiplier = 1;
    else if (issue.severity === 'warning') multiplier = 0.7;
    else multiplier = 0.3;

    // Cap deductions per rule category
    if (!deductedRules.has(issue.rule)) {
      deductions += weight * multiplier;
      deductedRules.add(issue.rule);
    } else {
      deductions += (weight * multiplier) * 0.3; // Diminishing returns for same rule
    }
  }

  return Math.max(0, Math.round(100 - deductions));
}

/**
 * Audit a single workflow file.
 * @param {string} filePath - Path to the workflow YAML file.
 * @returns {Promise<AuditReport>} The audit report.
 */
export async function auditFile(filePath) {
  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  log.startSpinner(`Auditing ${filePath}...`);

  const rawContent = await readFile(resolvedPath, 'utf-8');

  let workflow;
  try {
    workflow = YAML.parse(rawContent);
  } catch (err) {
    log.failSpinner(`Failed to parse ${filePath}`);
    throw new Error(`Invalid YAML in ${filePath}: ${err.message}`);
  }

  if (!workflow || typeof workflow !== 'object') {
    log.failSpinner(`Invalid workflow`);
    throw new Error(`${filePath} does not appear to be a valid workflow file.`);
  }

  // Run all checks
  const issues = [
    ...checkUnpinnedActions(workflow),
    ...checkMissingCache(workflow),
    ...checkMissingTimeout(workflow),
    ...checkMissingConcurrency(workflow),
    ...checkPermissions(workflow),
    ...checkSecurityScanning(workflow),
    ...checkHardcodedSecrets(rawContent),
    ...checkDeprecatedVersions(workflow),
  ];

  const score = calculateScore(issues);

  const summary = {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
    total: issues.length,
  };

  log.stopSpinner('Audit complete');

  return { file: filePath, score, issues, summary };
}

/**
 * Audit all workflow files in the .github/workflows directory.
 * @param {string} [cwd=process.cwd()] - Project root.
 * @returns {Promise<AuditReport[]>} Array of audit reports.
 */
export async function auditAll(cwd = process.cwd()) {
  const workflowDir = join(cwd, '.github', 'workflows');

  if (!existsSync(workflowDir)) {
    log.warn('No .github/workflows directory found.');
    return [];
  }

  const files = await glob('*.{yml,yaml}', { cwd: workflowDir });

  if (files.length === 0) {
    log.warn('No workflow files found in .github/workflows/');
    return [];
  }

  const reports = [];
  for (const file of files) {
    const report = await auditFile(join(workflowDir, file));
    reports.push(report);
  }

  return reports;
}

/**
 * Print a formatted audit report to the console.
 * @param {AuditReport} report - The audit report to display.
 */
export function printAuditReport(report) {
  log.section(`📋 Audit Report: ${report.file}`);

  // Score display with color coding
  let scoreColor;
  let grade;
  if (report.score >= 90) { scoreColor = chalk.green; grade = 'A'; }
  else if (report.score >= 80) { scoreColor = chalk.green; grade = 'B'; }
  else if (report.score >= 70) { scoreColor = chalk.yellow; grade = 'C'; }
  else if (report.score >= 60) { scoreColor = chalk.yellow; grade = 'D'; }
  else { scoreColor = chalk.red; grade = 'F'; }

  console.log(`  ${chalk.bold('Score:')} ${scoreColor.bold(`${report.score}/100`)} ${scoreColor(`(${grade})`)}`);
  log.blank();

  // Summary counts
  if (report.summary.errors > 0) {
    console.log(`  ${chalk.red(`✖ ${report.summary.errors} error(s)`)}`);
  }
  if (report.summary.warnings > 0) {
    console.log(`  ${chalk.yellow(`⚠ ${report.summary.warnings} warning(s)`)}`);
  }
  if (report.summary.infos > 0) {
    console.log(`  ${chalk.blue(`ℹ ${report.summary.infos} suggestion(s)`)}`);
  }

  if (report.issues.length === 0) {
    log.blank();
    log.success('No issues found! Your workflow looks great. 🎉');
    return;
  }

  log.blank();
  log.divider();

  // Group issues by severity
  const grouped = {
    error: report.issues.filter((i) => i.severity === 'error'),
    warning: report.issues.filter((i) => i.severity === 'warning'),
    info: report.issues.filter((i) => i.severity === 'info'),
  };

  for (const [severity, issues] of Object.entries(grouped)) {
    if (issues.length === 0) continue;

    log.blank();
    const severityLabel = severity === 'error'
      ? chalk.red.bold('ERRORS')
      : severity === 'warning'
        ? chalk.yellow.bold('WARNINGS')
        : chalk.blue.bold('SUGGESTIONS');

    console.log(`  ${severityLabel}`);
    log.blank();

    for (const issue of issues) {
      const icon = severity === 'error' ? chalk.red('✖') :
                   severity === 'warning' ? chalk.yellow('⚠') :
                   chalk.blue('ℹ');

      console.log(`  ${icon}  ${issue.message}`);
      if (issue.location) {
        console.log(`     ${chalk.dim(`at ${issue.location}`)}`);
      }
      if (issue.suggestion) {
        console.log(`     ${chalk.dim('→')} ${chalk.dim(issue.suggestion)}`);
      }
      log.blank();
    }
  }

  log.divider();
  log.blank();
}

export default { auditFile, auditAll, printAuditReport };
