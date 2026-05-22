/**
 * @module config
 * @description Loads user configuration from .ciraftrc (JSON/YAML) or
 * ciraft.config.js. Merges user overrides with sensible defaults.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import log from './logger.js';

/**
 * Default configuration values.
 * @type {CiraftConfig}
 */
const DEFAULTS = {
  target: 'github-actions',
  output: null,               // auto-determined based on target
  interactive: false,
  force: false,
  dryRun: false,
  nodeVersion: '20',
  pythonVersion: '3.12',
  goVersion: '1.22',
  rustVersion: 'stable',
  enableCache: true,
  enableSecurity: true,
  enableConcurrency: true,
  timeout: 30,
  branches: ['main'],
};

/**
 * @typedef {Object} CiraftConfig
 * @property {'github-actions'|'gitlab-ci'} target - CI platform target.
 * @property {string|null} output - Output file path.
 * @property {boolean} interactive - Whether to prompt the user.
 * @property {boolean} force - Overwrite existing files without asking.
 * @property {boolean} dryRun - Print output instead of writing files.
 * @property {string} nodeVersion - Default Node.js version.
 * @property {string} pythonVersion - Default Python version.
 * @property {string} goVersion - Default Go version.
 * @property {string} rustVersion - Default Rust toolchain.
 * @property {boolean} enableCache - Enable dependency caching.
 * @property {boolean} enableSecurity - Enable security scanning steps.
 * @property {boolean} enableConcurrency - Enable concurrency groups.
 * @property {number} timeout - Job timeout in minutes.
 * @property {string[]} branches - Branches to trigger on.
 */

/** Ordered list of config file names to search for. */
const CONFIG_FILES = [
  '.ciraftrc',
  '.ciraftrc.json',
  '.ciraftrc.yaml',
  '.ciraftrc.yml',
  'ciraft.config.js',
  'ciraft.config.mjs',
];

/**
 * Attempt to parse a file as JSON, then YAML.
 * @param {string} content - File content.
 * @returns {Object} Parsed configuration object.
 */
function parseRcFile(content) {
  // Try JSON first
  try {
    return JSON.parse(content);
  } catch {
    // Fall through to YAML
  }

  // Try YAML
  try {
    const parsed = YAML.parse(content);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // Fall through
  }

  return {};
}

/**
 * Load a JavaScript config file via dynamic import.
 * @param {string} filePath - Absolute path to the JS config file.
 * @returns {Promise<Object>} The exported configuration.
 */
async function loadJsConfig(filePath) {
  try {
    const fileUrl = pathToFileURL(filePath).href;
    const mod = await import(fileUrl);
    return mod.default || mod;
  } catch (err) {
    log.warn(`Failed to load config from ${filePath}: ${err.message}`);
    return {};
  }
}

/**
 * Search for and load user configuration from the project root.
 * @param {string} [cwd=process.cwd()] - Directory to search in.
 * @returns {Promise<CiraftConfig>} Merged configuration.
 */
export async function loadConfig(cwd = process.cwd()) {
  let userConfig = {};

  for (const fileName of CONFIG_FILES) {
    const filePath = resolve(cwd, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    log.info(`Loading config from ${fileName}`);

    if (fileName.endsWith('.js') || fileName.endsWith('.mjs')) {
      userConfig = await loadJsConfig(filePath);
    } else {
      try {
        const content = await readFile(filePath, 'utf-8');
        userConfig = parseRcFile(content);
      } catch (err) {
        log.warn(`Failed to read ${fileName}: ${err.message}`);
      }
    }

    break; // Use the first config file found
  }

  return { ...DEFAULTS, ...userConfig };
}

/**
 * Merge CLI options into the loaded config. CLI flags take precedence.
 * @param {CiraftConfig} config - Loaded config.
 * @param {Object} cliOptions - Options parsed from commander.
 * @returns {CiraftConfig} Final merged config.
 */
export function mergeCliOptions(config, cliOptions = {}) {
  const merged = { ...config };

  if (cliOptions.target !== undefined) merged.target = cliOptions.target;
  if (cliOptions.output !== undefined) merged.output = cliOptions.output;
  if (cliOptions.interactive !== undefined) merged.interactive = cliOptions.interactive;
  if (cliOptions.force !== undefined) merged.force = cliOptions.force;
  if (cliOptions.dryRun !== undefined) merged.dryRun = cliOptions.dryRun;

  // Determine default output path based on target
  if (!merged.output) {
    merged.output = merged.target === 'gitlab-ci'
      ? '.gitlab-ci.yml'
      : '.github/workflows/ci.yml';
  }

  return merged;
}

export default { loadConfig, mergeCliOptions };
