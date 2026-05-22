/**
 * @module logger
 * @description Beautiful terminal output wrapper around chalk + ora.
 * Provides consistent, polished logging for the entire CLI.
 */

import chalk from 'chalk';
import ora from 'ora';

/** Active spinner instance (singleton to avoid overlapping spinners) */
let activeSpinner = null;

/**
 * Display the ciraft ASCII banner.
 */
export function banner() {
  const logo = chalk.bold.cyan(`
  ╔═══════════════════════════════════════════╗
  ║                                           ║
  ║   🔧  ${chalk.white.bold('C I R A F T')}                        ║
  ║                                           ║
  ║   ${chalk.dim('CI/CD Pipeline Generator')}                ║
  ║   ${chalk.dim('v1.0.0')}                                  ║
  ║                                           ║
  ╚═══════════════════════════════════════════╝
  `);
  console.log(logo);
}

/**
 * Log an informational message.
 * @param {string} message - The message to display.
 */
export function info(message) {
  console.log(`  ${chalk.blue('ℹ')}  ${chalk.dim(message)}`);
}

/**
 * Log a success message.
 * @param {string} message - The message to display.
 */
export function success(message) {
  console.log(`  ${chalk.green('✔')}  ${chalk.green(message)}`);
}

/**
 * Log a warning message.
 * @param {string} message - The message to display.
 */
export function warn(message) {
  console.log(`  ${chalk.yellow('⚠')}  ${chalk.yellow(message)}`);
}

/**
 * Log an error message.
 * @param {string} message - The message to display.
 */
export function error(message) {
  console.log(`  ${chalk.red('✖')}  ${chalk.red(message)}`);
}

/**
 * Log a step in a multi-step process.
 * @param {number} current - Current step number.
 * @param {number} total - Total number of steps.
 * @param {string} message - Step description.
 */
export function step(current, total, message) {
  const label = chalk.cyan(`[${current}/${total}]`);
  console.log(`  ${label}  ${message}`);
}

/**
 * Start an ora spinner with the given message.
 * @param {string} message - Spinner text.
 * @returns {import('ora').Ora} The spinner instance.
 */
export function startSpinner(message) {
  stopSpinner();
  activeSpinner = ora({
    text: message,
    indent: 2,
    color: 'cyan',
  }).start();
  return activeSpinner;
}

/**
 * Stop the active spinner with a success state.
 * @param {string} [message] - Optional success message.
 */
export function stopSpinner(message) {
  if (activeSpinner) {
    if (message) {
      activeSpinner.succeed(message);
    } else {
      activeSpinner.stop();
    }
    activeSpinner = null;
  }
}

/**
 * Stop the active spinner with a failure state.
 * @param {string} [message] - Optional failure message.
 */
export function failSpinner(message) {
  if (activeSpinner) {
    activeSpinner.fail(message);
    activeSpinner = null;
  }
}

/**
 * Print a horizontal divider line.
 */
export function divider() {
  console.log(chalk.dim(`  ${'─'.repeat(45)}`));
}

/**
 * Print a key-value pair in a formatted way.
 * @param {string} key - The label.
 * @param {string} value - The value.
 */
export function keyValue(key, value) {
  console.log(`  ${chalk.dim(key + ':')} ${chalk.white.bold(value)}`);
}

/**
 * Print a blank line for spacing.
 */
export function blank() {
  console.log();
}

/**
 * Print a section header.
 * @param {string} title - Section title.
 */
export function section(title) {
  blank();
  console.log(`  ${chalk.bold.underline(title)}`);
  blank();
}

export default {
  banner,
  info,
  success,
  warn,
  error,
  step,
  startSpinner,
  stopSpinner,
  failSpinner,
  divider,
  keyValue,
  blank,
  section,
};
