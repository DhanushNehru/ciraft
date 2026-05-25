/**
 * @module detector
 * @description Stack detection engine. Scans the project directory to identify
 * languages, package managers, frameworks, Docker usage, tests, and more.
 * Returns a structured detection result for pipeline generation.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { glob } from 'glob';
import log from './utils/logger.js';

/**
 * @typedef {Object} DetectionResult
 * @property {string[]} languages - Detected programming languages.
 * @property {string|null} packageManager - Primary package manager (npm, yarn, pnpm, pip, poetry, cargo, go, swift).
 * @property {string[]} frameworks - Detected frameworks (React, Next.js, Express, Django, etc.).
 * @property {boolean} hasDocker - Whether Dockerfile or docker-compose is present.
 * @property {boolean} hasDockerCompose - Whether docker-compose.yml is present.
 * @property {boolean} hasTests - Whether test files or test scripts exist.
 * @property {boolean} hasLinting - Whether linting config exists.
 * @property {boolean} hasTypeScript - Whether TypeScript is used.
 * @property {boolean} isMonorepo - Whether the project is a monorepo.
 * @property {string|null} nodeVersion - Detected or suggested Node.js version.
 * @property {string|null} pythonVersion - Detected or suggested Python version.
 * @property {string|null} goVersion - Detected Go version from go.mod.
 * @property {string|null} rustEdition - Detected Rust edition from Cargo.toml.
 * @property {Object} meta - Additional metadata about the project.
 */

/**
 * Safely read and parse a JSON file.
 * @param {string} filePath - Absolute path to the JSON file.
 * @returns {Promise<Object|null>} Parsed object or null on failure.
 */
async function readJson(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Safely read a file as text.
 * @param {string} filePath - Absolute path.
 * @returns {Promise<string|null>} File content or null on failure.
 */
async function readText(filePath) {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Detect Node.js project details.
 * @param {string} cwd - Project root.
 * @returns {Promise<Object>} Node detection info.
 */
async function detectNode(cwd) {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return null;

  const pkg = await readJson(pkgPath);
  if (!pkg) return null;

  const result = {
    language: 'Node.js',
    packageManager: 'npm',
    frameworks: [],
    hasTests: false,
    hasLinting: false,
    hasTypeScript: false,
    isMonorepo: false,
    nodeVersion: null,
  };

  // Detect package manager
  if (existsSync(join(cwd, 'pnpm-lock.yaml')) || existsSync(join(cwd, 'pnpm-workspace.yaml'))) {
    result.packageManager = 'pnpm';
  } else if (existsSync(join(cwd, 'yarn.lock'))) {
    result.packageManager = 'yarn';
  } else if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) {
    result.packageManager = 'bun';
  } else if (existsSync(join(cwd, 'package-lock.json'))) {
    result.packageManager = 'npm';
  }

  // Detect monorepo
  if (existsSync(join(cwd, 'pnpm-workspace.yaml')) ||
      existsSync(join(cwd, 'lerna.json')) ||
      (pkg.workspaces && Array.isArray(pkg.workspaces))) {
    result.isMonorepo = true;
  }

  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  // Detect frameworks
  const frameworkMap = {
    'next': 'Next.js',
    'nuxt': 'Nuxt.js',
    'react': 'React',
    'vue': 'Vue.js',
    'svelte': 'Svelte',
    '@sveltejs/kit': 'SvelteKit',
    'angular': 'Angular',
    '@angular/core': 'Angular',
    'express': 'Express',
    'fastify': 'Fastify',
    'nestjs': 'NestJS',
    '@nestjs/core': 'NestJS',
    'gatsby': 'Gatsby',
    'remix': 'Remix',
    '@remix-run/node': 'Remix',
    'astro': 'Astro',
    'hono': 'Hono',
    'electron': 'Electron',
  };

  for (const [dep, framework] of Object.entries(frameworkMap)) {
    if (allDeps[dep]) {
      result.frameworks.push(framework);
    }
  }

  // Detect TypeScript
  if (allDeps['typescript'] || existsSync(join(cwd, 'tsconfig.json'))) {
    result.hasTypeScript = true;
  }

  // Detect testing
  const testDeps = ['jest', 'mocha', 'vitest', 'ava', 'tap', 'cypress', 'playwright', '@playwright/test'];
  result.hasTests = testDeps.some((dep) => dep in allDeps) ||
    !!(pkg.scripts && (pkg.scripts.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1'));

  // Detect linting
  const lintDeps = ['eslint', 'biome', '@biomejs/biome', 'prettier', 'oxlint'];
  result.hasLinting = lintDeps.some((dep) => dep in allDeps) ||
    existsSync(join(cwd, '.eslintrc.json')) ||
    existsSync(join(cwd, '.eslintrc.js')) ||
    existsSync(join(cwd, 'eslint.config.js')) ||
    existsSync(join(cwd, 'biome.json'));

  // Detect Node version
  if (pkg.engines && pkg.engines.node) {
    const match = pkg.engines.node.match(/(\d+)/);
    if (match) result.nodeVersion = match[1];
  }
  if (existsSync(join(cwd, '.nvmrc'))) {
    const nvmrc = await readText(join(cwd, '.nvmrc'));
    if (nvmrc) {
      const match = nvmrc.trim().match(/(\d+)/);
      if (match) result.nodeVersion = match[1];
    }
  }
  if (existsSync(join(cwd, '.node-version'))) {
    const nodeVer = await readText(join(cwd, '.node-version'));
    if (nodeVer) {
      const match = nodeVer.trim().match(/(\d+)/);
      if (match) result.nodeVersion = match[1];
    }
  }

  return result;
}

/**
 * Detect Python project details.
 * @param {string} cwd - Project root.
 * @returns {Promise<Object|null>} Python detection info.
 */
async function detectPython(cwd) {
  const hasPyproject = existsSync(join(cwd, 'pyproject.toml'));
  const hasRequirements = existsSync(join(cwd, 'requirements.txt'));
  const hasPipfile = existsSync(join(cwd, 'Pipfile'));
  const hasSetupPy = existsSync(join(cwd, 'setup.py'));
  const hasSetupCfg = existsSync(join(cwd, 'setup.cfg'));

  if (!hasPyproject && !hasRequirements && !hasPipfile && !hasSetupPy && !hasSetupCfg) {
    return null;
  }

  const result = {
    language: 'Python',
    packageManager: 'pip',
    frameworks: [],
    hasTests: false,
    hasLinting: false,
    pythonVersion: null,
  };

  // Detect package manager
  if (hasPipfile) {
    result.packageManager = 'pipenv';
  } else if (hasPyproject) {
    const content = await readText(join(cwd, 'pyproject.toml'));
    if (content) {
      if (content.includes('[tool.poetry]')) {
        result.packageManager = 'poetry';
      } else if (content.includes('[tool.pdm]') || content.includes('[tool.pdm.')) {
        result.packageManager = 'pdm';
      } else if (content.includes('[tool.hatch]') || content.includes('[tool.hatch.')) {
        result.packageManager = 'hatch';
      } else if (content.includes('[build-system]') && content.includes('flit')) {
        result.packageManager = 'flit';
      }

      // Detect frameworks from pyproject.toml
      if (content.includes('django') || content.includes('Django')) result.frameworks.push('Django');
      if (content.includes('flask') || content.includes('Flask')) result.frameworks.push('Flask');
      if (content.includes('fastapi') || content.includes('FastAPI')) result.frameworks.push('FastAPI');
      if (content.includes('starlette')) result.frameworks.push('Starlette');
      if (content.includes('celery')) result.frameworks.push('Celery');

      // Detect testing
      if (content.includes('pytest') || content.includes('[tool.pytest')) result.hasTests = true;

      // Detect linting
      if (content.includes('ruff') || content.includes('[tool.ruff')) result.hasLinting = true;
      if (content.includes('flake8') || content.includes('black') || content.includes('mypy')) result.hasLinting = true;

      // Detect Python version
      const pyVerMatch = content.match(/python_requires\s*=\s*["']>=?\s*(\d+\.\d+)/);
      if (pyVerMatch) result.pythonVersion = pyVerMatch[1];
    }
  }

  // Detect frameworks from requirements.txt
  if (hasRequirements) {
    const content = await readText(join(cwd, 'requirements.txt'));
    if (content) {
      const lines = content.toLowerCase();
      if (lines.includes('django')) result.frameworks.push('Django');
      if (lines.includes('flask')) result.frameworks.push('Flask');
      if (lines.includes('fastapi')) result.frameworks.push('FastAPI');
      if (lines.includes('pytest')) result.hasTests = true;
    }
  }

  // Detect test directories
  if (existsSync(join(cwd, 'tests')) || existsSync(join(cwd, 'test'))) {
    result.hasTests = true;
  }

  // Deduplicate frameworks
  result.frameworks = [...new Set(result.frameworks)];

  return result;
}

/**
 * Detect Go project details.
 * @param {string} cwd - Project root.
 * @returns {Promise<Object|null>} Go detection info.
 */
async function detectGo(cwd) {
  const goModPath = join(cwd, 'go.mod');
  if (!existsSync(goModPath)) return null;

  const result = {
    language: 'Go',
    packageManager: 'go',
    frameworks: [],
    hasTests: false,
    goVersion: null,
  };

  const content = await readText(goModPath);
  if (content) {
    // Detect Go version
    const versionMatch = content.match(/^go\s+(\d+\.\d+)/m);
    if (versionMatch) result.goVersion = versionMatch[1];

    // Detect frameworks
    if (content.includes('github.com/gin-gonic/gin')) result.frameworks.push('Gin');
    if (content.includes('github.com/gofiber/fiber')) result.frameworks.push('Fiber');
    if (content.includes('github.com/labstack/echo')) result.frameworks.push('Echo');
    if (content.includes('github.com/gorilla/mux')) result.frameworks.push('Gorilla Mux');
    if (content.includes('github.com/go-chi/chi')) result.frameworks.push('Chi');
    if (content.includes('google.golang.org/grpc')) result.frameworks.push('gRPC');
  }

  // Detect test files
  const testFiles = await glob('**/*_test.go', { cwd, maxDepth: 4, ignore: ['vendor/**'] });
  result.hasTests = testFiles.length > 0;

  return result;
}

/**
 * Detect Rust project details.
 * @param {string} cwd - Project root.
 * @returns {Promise<Object|null>} Rust detection info.
 */
async function detectRust(cwd) {
  const cargoPath = join(cwd, 'Cargo.toml');
  if (!existsSync(cargoPath)) return null;

  const result = {
    language: 'Rust',
    packageManager: 'cargo',
    frameworks: [],
    hasTests: false,
    rustEdition: null,
    isWorkspace: false,
  };

  const content = await readText(cargoPath);
  if (content) {
    // Detect edition
    const editionMatch = content.match(/edition\s*=\s*["'](\d{4})["']/);
    if (editionMatch) result.rustEdition = editionMatch[1];

    // Detect workspace
    if (content.includes('[workspace]')) result.isWorkspace = true;

    // Detect frameworks
    if (content.includes('actix-web')) result.frameworks.push('Actix Web');
    if (content.includes('axum')) result.frameworks.push('Axum');
    if (content.includes('rocket')) result.frameworks.push('Rocket');
    if (content.includes('warp')) result.frameworks.push('Warp');
    if (content.includes('tokio')) result.frameworks.push('Tokio');
    if (content.includes('tauri')) result.frameworks.push('Tauri');
  }

  // Rust projects always have tests (built-in)
  result.hasTests = true;

  return result;
}

/**
 * Detect Swift, iOS, or macOS project details.
 * @param {string} cwd - Project root.
 * @returns {Promise<Object|null>} Swift detection info.
 */
async function detectSwift(cwd) {
  const hasPackageSwift = existsSync(join(cwd, 'Package.swift'));
  const xcodeProjects = await glob('**/*.xcodeproj', {
    cwd,
    maxDepth: 4,
    ignore: ['**/.build/**', '**/DerivedData/**', '**/Pods/**'],
  });
  const xcodeWorkspaces = await glob('**/*.xcworkspace', {
    cwd,
    maxDepth: 4,
    ignore: ['**/.build/**', '**/DerivedData/**', '**/Pods/**'],
  });

  if (!hasPackageSwift && xcodeProjects.length === 0 && xcodeWorkspaces.length === 0) {
    return null;
  }

  const schemeSource = xcodeWorkspaces[0] || xcodeProjects[0] || 'Package.swift';
  const schemeName = basename(schemeSource, extname(schemeSource));
  const testFiles = await glob('**/*Tests.swift', {
    cwd,
    maxDepth: 6,
    ignore: ['**/.build/**', '**/DerivedData/**', '**/Pods/**'],
  });

  const frameworks = [];
  if (hasPackageSwift) frameworks.push('Swift Package Manager');
  if (xcodeProjects.length > 0 || xcodeWorkspaces.length > 0) frameworks.push('Xcode');

  return {
    language: 'Swift',
    packageManager: 'swift',
    frameworks,
    hasTests: hasPackageSwift || xcodeProjects.length > 0 || xcodeWorkspaces.length > 0 || testFiles.length > 0,
    hasPackageSwift,
    xcodeProjects,
    xcodeWorkspaces,
    xcodeScheme: schemeName,
  };
}

/**
 * Detect Docker usage in the project.
 * @param {string} cwd - Project root.
 * @returns {Promise<Object|null>} Docker detection info.
 */
async function detectDocker(cwd) {
  const hasDockerfile = existsSync(join(cwd, 'Dockerfile'));
  const hasCompose = existsSync(join(cwd, 'docker-compose.yml')) ||
                     existsSync(join(cwd, 'docker-compose.yaml')) ||
                     existsSync(join(cwd, 'compose.yml')) ||
                     existsSync(join(cwd, 'compose.yaml'));

  if (!hasDockerfile && !hasCompose) return null;

  const result = {
    hasDocker: hasDockerfile,
    hasDockerCompose: hasCompose,
    dockerfileStages: [],
  };

  // Parse Dockerfile for multi-stage builds
  if (hasDockerfile) {
    const content = await readText(join(cwd, 'Dockerfile'));
    if (content) {
      const stages = content.match(/^FROM\s+.+/gim);
      if (stages) {
        result.dockerfileStages = stages.map((s) => s.trim());
      }
    }
  }

  return result;
}

/**
 * Detect deployment configuration.
 * @param {string} cwd - Project root.
 * @returns {Object} Deployment detection info.
 */
function detectDeploy(cwd) {
  return {
    hasVercel: existsSync(join(cwd, 'vercel.json')),
    hasNetlify: existsSync(join(cwd, 'netlify.toml')),
    hasHeroku: existsSync(join(cwd, 'Procfile')),
    hasFly: existsSync(join(cwd, 'fly.toml')),
    hasKubernetes: existsSync(join(cwd, 'k8s')) || existsSync(join(cwd, 'kubernetes')),
    hasTerraform: existsSync(join(cwd, 'main.tf')) || existsSync(join(cwd, 'terraform')),
    hasCloudflare: existsSync(join(cwd, 'wrangler.toml')),
  };
}

/**
 * Run the full stack detection suite against a project directory.
 * @param {string} [cwd=process.cwd()] - Project root to scan.
 * @returns {Promise<DetectionResult>} Complete detection result.
 */
export async function detect(cwd = process.cwd()) {
  log.startSpinner('Scanning project structure...');

  /** @type {DetectionResult} */
  const result = {
    languages: [],
    packageManager: null,
    frameworks: [],
    hasDocker: false,
    hasDockerCompose: false,
    hasTests: false,
    hasLinting: false,
    hasTypeScript: false,
    isMonorepo: false,
    nodeVersion: null,
    pythonVersion: null,
    goVersion: null,
    rustEdition: null,
    meta: {},
  };

  // Run all detectors concurrently
  const [node, python, goLang, rust, swift, docker] = await Promise.all([
    detectNode(cwd),
    detectPython(cwd),
    detectGo(cwd),
    detectRust(cwd),
    detectSwift(cwd),
    detectDocker(cwd),
  ]);

  const deploy = detectDeploy(cwd);

  // Merge Node.js results
  if (node) {
    result.languages.push(node.language);
    result.packageManager = node.packageManager;
    result.frameworks.push(...node.frameworks);
    result.hasTests = result.hasTests || node.hasTests;
    result.hasLinting = result.hasLinting || node.hasLinting;
    result.hasTypeScript = node.hasTypeScript;
    result.isMonorepo = node.isMonorepo;
    result.nodeVersion = node.nodeVersion;
  }

  // Merge Python results
  if (python) {
    result.languages.push(python.language);
    if (!result.packageManager) result.packageManager = python.packageManager;
    result.frameworks.push(...python.frameworks);
    result.hasTests = result.hasTests || python.hasTests;
    result.hasLinting = result.hasLinting || python.hasLinting;
    result.pythonVersion = python.pythonVersion;
    result.meta.pythonPackageManager = python.packageManager;
  }

  // Merge Go results
  if (goLang) {
    result.languages.push(goLang.language);
    if (!result.packageManager) result.packageManager = goLang.packageManager;
    result.frameworks.push(...goLang.frameworks);
    result.hasTests = result.hasTests || goLang.hasTests;
    result.goVersion = goLang.goVersion;
  }

  // Merge Rust results
  if (rust) {
    result.languages.push(rust.language);
    if (!result.packageManager) result.packageManager = rust.packageManager;
    result.frameworks.push(...rust.frameworks);
    result.hasTests = result.hasTests || rust.hasTests;
    result.rustEdition = rust.rustEdition;
    result.meta.rustWorkspace = rust.isWorkspace;
  }

  // Merge Swift results
  if (swift) {
    result.languages.push(swift.language);
    if (!result.packageManager) result.packageManager = swift.packageManager;
    result.frameworks.push(...swift.frameworks);
    result.hasTests = result.hasTests || swift.hasTests;
    result.meta.swift = {
      hasPackageSwift: swift.hasPackageSwift,
      xcodeProjects: swift.xcodeProjects,
      xcodeWorkspaces: swift.xcodeWorkspaces,
      xcodeScheme: swift.xcodeScheme,
    };
  }

  // Merge Docker results
  if (docker) {
    result.hasDocker = docker.hasDocker;
    result.hasDockerCompose = docker.hasDockerCompose;
    result.meta.dockerfileStages = docker.dockerfileStages;
  }

  // Merge deploy results
  result.meta.deploy = deploy;
  result.meta.hasDeploy = Object.values(deploy).some(Boolean);

  // Check for existing CI/CD configs
  result.meta.hasGitHubActions = existsSync(join(cwd, '.github', 'workflows'));
  result.meta.hasGitLabCI = existsSync(join(cwd, '.gitlab-ci.yml'));

  log.stopSpinner('Project scan complete');

  return result;
}

/**
 * Print a formatted summary of the detection results.
 * @param {DetectionResult} result - Detection results to display.
 */
export function printDetectionSummary(result) {
  log.section('🔍 Detected Stack');

  if (result.languages.length > 0) {
    log.keyValue('Languages', result.languages.join(', '));
  } else {
    log.warn('No languages detected');
  }

  if (result.packageManager) {
    log.keyValue('Package Manager', result.packageManager);
  }

  if (result.frameworks.length > 0) {
    log.keyValue('Frameworks', result.frameworks.join(', '));
  }

  if (result.nodeVersion) log.keyValue('Node.js Version', `v${result.nodeVersion}`);
  if (result.pythonVersion) log.keyValue('Python Version', result.pythonVersion);
  if (result.goVersion) log.keyValue('Go Version', result.goVersion);
  if (result.rustEdition) log.keyValue('Rust Edition', result.rustEdition);

  log.blank();
  log.divider();
  log.blank();

  const features = [
    ['Docker', result.hasDocker],
    ['Docker Compose', result.hasDockerCompose],
    ['Tests', result.hasTests],
    ['Linting', result.hasLinting],
    ['TypeScript', result.hasTypeScript],
    ['Monorepo', result.isMonorepo],
    ['Deployment Config', result.meta.hasDeploy],
  ];

  for (const [name, detected] of features) {
    const icon = detected ? '✅' : '⬜';
    log.info(`${icon}  ${name}`);
  }

  log.blank();
}

export default { detect, printDetectionSummary };
