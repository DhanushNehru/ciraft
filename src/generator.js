/**
 * @module generator
 * @description Pipeline generator that loads Handlebars templates based on the
 * detected stack, fills in context variables, and writes YAML output.
 * Handles single-language and composite multi-stack projects.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import chalk from 'chalk';
import log from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Path to the templates directory */
const TEMPLATES_DIR = join(__dirname, 'templates');

/**
 * Register custom Handlebars helpers for template rendering.
 */
function registerHelpers() {
  // Indent helper: indents multi-line strings by N spaces
  Handlebars.registerHelper('indent', function (count, text) {
    if (typeof text !== 'string') return '';
    const pad = ' '.repeat(count);
    return text.split('\n').map((line) => (line.trim() ? pad + line : line)).join('\n');
  });

  // Equality check
  Handlebars.registerHelper('eq', function (a, b) {
    return a === b;
  });

  // Not-equal check
  Handlebars.registerHelper('neq', function (a, b) {
    return a !== b;
  });

  // Array includes check
  Handlebars.registerHelper('includes', function (arr, value) {
    if (!Array.isArray(arr)) return false;
    return arr.includes(value);
  });

  // Join array
  Handlebars.registerHelper('join', function (arr, separator) {
    if (!Array.isArray(arr)) return '';
    return arr.join(typeof separator === 'string' ? separator : ', ');
  });

  // Lowercase helper
  Handlebars.registerHelper('lower', function (str) {
    return typeof str === 'string' ? str.toLowerCase() : '';
  });

  // Conditional block — if any value in array
  Handlebars.registerHelper('ifAny', function (...args) {
    const options = args.pop();
    return args.some(Boolean) ? options.fn(this) : options.inverse(this);
  });
}

/**
 * Build the install command based on the package manager.
 * @param {string} pm - Package manager name.
 * @returns {string} Install command.
 */
function getInstallCommand(pm) {
  const commands = {
    npm: 'npm ci',
    yarn: 'yarn install --frozen-lockfile',
    pnpm: 'pnpm install --frozen-lockfile',
    bun: 'bun install --frozen-lockfile',
    pip: 'pip install -r requirements.txt',
    pipenv: 'pipenv install --deploy',
    poetry: 'poetry install --no-interaction',
    pdm: 'pdm install',
    hatch: 'hatch env create',
    flit: 'flit install',
    cargo: 'cargo build',
    go: 'go mod download',
  };
  return commands[pm] || 'npm ci';
}

/**
 * Build the test command based on the package manager and language.
 * @param {string} pm - Package manager name.
 * @param {string} lang - Primary language.
 * @returns {string} Test command.
 */
function getTestCommand(pm, lang) {
  const commands = {
    npm: 'npm test',
    yarn: 'yarn test',
    pnpm: 'pnpm test',
    bun: 'bun test',
    pip: 'pytest',
    pipenv: 'pipenv run pytest',
    poetry: 'poetry run pytest',
    pdm: 'pdm run pytest',
    cargo: 'cargo test',
    go: 'go test ./...',
  };
  return commands[pm] || 'npm test';
}

/**
 * Build the lint command based on the package manager.
 * @param {string} pm - Package manager name.
 * @returns {string} Lint command.
 */
function getLintCommand(pm) {
  const commands = {
    npm: 'npm run lint',
    yarn: 'yarn lint',
    pnpm: 'pnpm lint',
    bun: 'bun lint',
    pip: 'ruff check .',
    pipenv: 'pipenv run ruff check .',
    poetry: 'poetry run ruff check .',
    cargo: 'cargo clippy -- -D warnings',
    go: 'golangci-lint run',
  };
  return commands[pm] || 'npm run lint';
}

/**
 * Build the build command based on the package manager.
 * @param {string} pm - Package manager name.
 * @returns {string} Build command.
 */
function getBuildCommand(pm) {
  const commands = {
    npm: 'npm run build',
    yarn: 'yarn build',
    pnpm: 'pnpm build',
    bun: 'bun run build',
    cargo: 'cargo build --release',
    go: 'go build ./...',
  };
  return commands[pm] || '';
}

/**
 * Get the cache identifier for the setup action.
 * @param {string} pm - Package manager.
 * @returns {string} Cache string for `with.cache`.
 */
function getCacheKey(pm) {
  const keys = {
    npm: 'npm',
    yarn: 'yarn',
    pnpm: 'pnpm',
    pip: 'pip',
    pipenv: 'pipenv',
    poetry: 'poetry',
  };
  return keys[pm] || pm;
}

/**
 * Determine which template(s) to use based on detection results.
 * @param {import('./detector.js').DetectionResult} detection - Detection results.
 * @param {import('./utils/config.js').CiraftConfig} config - User config.
 * @returns {string} Template name (without extension).
 */
function resolveTemplateName(detection, config) {
  const { languages, hasDocker } = detection;
  const target = config.target;
  const prefix = target === 'gitlab-ci' ? 'gitlab' : 'github';

  // Multi-language project
  if (languages.length > 1) {
    return `${prefix}-multi`;
  }

  // Single language
  const lang = languages[0]?.toLowerCase().replace('.', '') || 'node';

  const templateMap = {
    'node.js': `${prefix}-node`,
    'nodejs': `${prefix}-node`,
    'python': `${prefix}-python`,
    'go': `${prefix}-go`,
    'rust': `${prefix}-rust`,
  };

  return templateMap[lang] || `${prefix}-node`;
}

/**
 * Build the template context from detection results and config.
 * @param {import('./detector.js').DetectionResult} detection - Detection results.
 * @param {import('./utils/config.js').CiraftConfig} config - User config.
 * @returns {Object} Template context variables.
 */
function buildContext(detection, config) {
  const primaryLang = detection.languages[0] || 'Node.js';
  const pm = detection.packageManager || 'npm';

  return {
    // Languages & stack
    languages: detection.languages,
    primaryLanguage: primaryLang,
    packageManager: pm,
    frameworks: detection.frameworks,
    isMultiStack: detection.languages.length > 1,

    // Version info
    nodeVersion: detection.nodeVersion || config.nodeVersion,
    pythonVersion: detection.pythonVersion || config.pythonVersion,
    goVersion: detection.goVersion || config.goVersion,
    rustEdition: detection.rustEdition || 'stable',
    rustVersion: config.rustVersion,

    // Feature flags
    hasDocker: detection.hasDocker,
    hasDockerCompose: detection.hasDockerCompose,
    hasTests: detection.hasTests,
    hasLinting: detection.hasLinting,
    hasTypeScript: detection.hasTypeScript,
    isMonorepo: detection.isMonorepo,
    hasDeploy: detection.meta?.hasDeploy || false,

    // Commands
    installCommand: getInstallCommand(pm),
    testCommand: getTestCommand(pm, primaryLang),
    lintCommand: getLintCommand(pm),
    buildCommand: getBuildCommand(pm),
    cacheKey: getCacheKey(pm),

    // Config
    enableCache: config.enableCache,
    enableSecurity: config.enableSecurity,
    enableConcurrency: config.enableConcurrency,
    timeout: config.timeout,
    branches: config.branches,
    target: config.target,

    // Python-specific
    pythonPackageManager: detection.meta?.pythonPackageManager || 'pip',

    // Rust-specific
    rustWorkspace: detection.meta?.rustWorkspace || false,

    // Docker-specific
    dockerfileStages: detection.meta?.dockerfileStages || [],

    // Multi-stack (for composite templates)
    hasNode: detection.languages.includes('Node.js'),
    hasPython: detection.languages.includes('Python'),
    hasGo: detection.languages.includes('Go'),
    hasRust: detection.languages.includes('Rust'),
  };
}

/**
 * Load a Handlebars template from the templates directory.
 * If the specific template doesn't exist, falls back to inline generation.
 * @param {string} templateName - Template name (without extension).
 * @returns {Promise<Handlebars.TemplateDelegate>} Compiled template.
 */
async function loadTemplate(templateName) {
  const templatePath = join(TEMPLATES_DIR, `${templateName}.hbs`);

  if (existsSync(templatePath)) {
    const content = await readFile(templatePath, 'utf-8');
    return Handlebars.compile(content, { noEscape: true });
  }

  // Fallback: use built-in inline templates
  log.info(`Template "${templateName}.hbs" not found, using built-in generator`);
  const inlineTemplate = getInlineTemplate(templateName);
  return Handlebars.compile(inlineTemplate, { noEscape: true });
}

/**
 * Get a built-in inline template string for common configurations.
 * These serve as defaults when .hbs template files haven't been created yet.
 * @param {string} name - Template name.
 * @returns {string} Handlebars template string.
 */
function getInlineTemplate(name) {
  if (name.startsWith('gitlab')) {
    return getGitLabTemplate(name);
  }
  return getGitHubTemplate(name);
}

/**
 * Generate a GitHub Actions template string.
 * @param {string} name - Template identifier.
 * @returns {string} Template content.
 */
function getGitHubTemplate(name) {
  return `name: CI

on:
  push:
    branches: [{{#each branches}}'{{this}}'{{#unless @last}}, {{/unless}}{{/each}}]
  pull_request:
    branches: [{{#each branches}}'{{this}}'{{#unless @last}}, {{/unless}}{{/each}}]

{{#if enableConcurrency}}
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true
{{/if}}

permissions:
  contents: read

jobs:
{{#if hasNode}}
  build-node:
    name: Build & Test (Node.js)
    runs-on: ubuntu-latest
    timeout-minutes: {{timeout}}

    strategy:
      matrix:
        node-version: [{{nodeVersion}}]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

{{#if (eq packageManager 'pnpm')}}
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: latest

{{/if}}
      - name: Setup Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
{{#if enableCache}}
          cache: '{{cacheKey}}'
{{/if}}

      - name: Install dependencies
        run: {{installCommand}}

{{#if hasLinting}}
      - name: Lint
        run: {{lintCommand}}

{{/if}}
{{#if hasTests}}
      - name: Run tests
        run: {{testCommand}}

{{/if}}
      - name: Build
        run: {{buildCommand}}

{{#if enableSecurity}}
      - name: Security audit
        run: npm audit --audit-level=moderate
        continue-on-error: true
{{/if}}

{{/if}}
{{#if hasPython}}
  build-python:
    name: Build & Test (Python)
    runs-on: ubuntu-latest
    timeout-minutes: {{timeout}}

    strategy:
      matrix:
        python-version: ['{{pythonVersion}}']

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Python \${{ matrix.python-version }}
        uses: actions/setup-python@v5
        with:
          python-version: \${{ matrix.python-version }}
{{#if enableCache}}
          cache: '{{pythonPackageManager}}'
{{/if}}

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          {{installCommand}}

{{#if hasLinting}}
      - name: Lint
        run: {{lintCommand}}

{{/if}}
{{#if hasTests}}
      - name: Run tests
        run: {{testCommand}}

{{/if}}
{{#if enableSecurity}}
      - name: Security check
        run: pip install safety && safety check
        continue-on-error: true
{{/if}}

{{/if}}
{{#if hasGo}}
  build-go:
    name: Build & Test (Go)
    runs-on: ubuntu-latest
    timeout-minutes: {{timeout}}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: '{{goVersion}}'
{{#if enableCache}}
          cache: true
{{/if}}

      - name: Download dependencies
        run: go mod download

      - name: Verify dependencies
        run: go mod verify

{{#if hasLinting}}
      - name: Lint
        uses: golangci/golangci-lint-action@v6
        with:
          version: latest

{{/if}}
{{#if hasTests}}
      - name: Run tests
        run: go test -race -coverprofile=coverage.out ./...

{{/if}}
      - name: Build
        run: go build -v ./...

{{/if}}
{{#if hasRust}}
  build-rust:
    name: Build & Test (Rust)
    runs-on: ubuntu-latest
    timeout-minutes: {{timeout}}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Cache cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: \${{ runner.os }}-cargo-\${{ hashFiles('**/Cargo.lock') }}
          restore-keys: |
            \${{ runner.os }}-cargo-

{{#if hasLinting}}
      - name: Check formatting
        run: cargo fmt --all -- --check

      - name: Clippy
        run: cargo clippy -- -D warnings

{{/if}}
{{#if hasTests}}
      - name: Run tests
        run: cargo test --all-features

{{/if}}
      - name: Build
        run: cargo build --release

{{#if enableSecurity}}
      - name: Security audit
        run: cargo install cargo-audit && cargo audit
        continue-on-error: true
{{/if}}

{{/if}}
{{#if hasDocker}}
  docker:
    name: Docker Build
    runs-on: ubuntu-latest
    timeout-minutes: {{timeout}}
{{#if isMultiStack}}
    needs: [{{#if hasNode}}build-node{{/if}}{{#if hasPython}}{{#if hasNode}}, {{/if}}build-python{{/if}}{{#if hasGo}}{{#ifAny hasNode hasPython}}, {{/ifAny}}build-go{{/if}}{{#if hasRust}}{{#ifAny hasNode hasPython hasGo}}, {{/ifAny}}build-rust{{/if}}]
{{/if}}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build
        uses: docker/build-push-action@v6
        with:
          context: .
          push: false
          tags: \${{ github.repository }}:test
          cache-from: type=gha
          cache-to: type=gha,mode=max
{{/if}}
`;
}

/**
 * Generate a GitLab CI template string.
 * @param {string} name - Template identifier.
 * @returns {string} Template content.
 */
function getGitLabTemplate(name) {
  return `stages:
{{#if hasLinting}}
  - lint
{{/if}}
  - build
{{#if hasTests}}
  - test
{{/if}}
{{#if enableSecurity}}
  - security
{{/if}}
{{#if hasDocker}}
  - docker
{{/if}}

default:
  interruptible: true

variables:
  GIT_DEPTH: 0

{{#if hasNode}}
build-node:
  stage: build
  image: node:{{nodeVersion}}-alpine
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - node_modules/
  script:
    - {{installCommand}}
    - {{buildCommand}}

{{#if hasTests}}
test-node:
  stage: test
  image: node:{{nodeVersion}}-alpine
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - node_modules/
  script:
    - {{installCommand}}
    - {{testCommand}}
  coverage: '/All files[^|]*\\|[^|]*\\s+([\\d.]+)/'
{{/if}}

{{#if hasLinting}}
lint-node:
  stage: lint
  image: node:{{nodeVersion}}-alpine
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - node_modules/
  script:
    - {{installCommand}}
    - {{lintCommand}}
{{/if}}

{{/if}}
{{#if hasPython}}
build-python:
  stage: build
  image: python:{{pythonVersion}}-slim
  cache:
    key:
      files:
        - requirements.txt
    paths:
      - .cache/pip
  variables:
    PIP_CACHE_DIR: "$CI_PROJECT_DIR/.cache/pip"
  script:
    - python -m pip install --upgrade pip
    - {{installCommand}}

{{#if hasTests}}
test-python:
  stage: test
  image: python:{{pythonVersion}}-slim
  script:
    - python -m pip install --upgrade pip
    - {{installCommand}}
    - {{testCommand}}
{{/if}}

{{/if}}
{{#if hasGo}}
build-go:
  stage: build
  image: golang:{{goVersion}}-alpine
  variables:
    GOPATH: "$CI_PROJECT_DIR/.go"
  cache:
    key:
      files:
        - go.sum
    paths:
      - .go/pkg/mod/
  script:
    - go mod download
    - go build -v ./...

{{#if hasTests}}
test-go:
  stage: test
  image: golang:{{goVersion}}-alpine
  script:
    - go test -race -coverprofile=coverage.out ./...
{{/if}}

{{/if}}
{{#if hasRust}}
build-rust:
  stage: build
  image: rust:latest
  cache:
    key:
      files:
        - Cargo.lock
    paths:
      - target/
      - $CARGO_HOME/registry/
  script:
    - cargo build --release

{{#if hasTests}}
test-rust:
  stage: test
  image: rust:latest
  script:
    - cargo test --all-features
{{/if}}

{{/if}}
{{#if hasDocker}}
docker-build:
  stage: docker
  image: docker:latest
  services:
    - docker:dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA .
{{/if}}
`;
}

/**
 * Generate the CI/CD pipeline file.
 * @param {import('./detector.js').DetectionResult} detection - Detection results.
 * @param {import('./utils/config.js').CiraftConfig} config - Merged configuration.
 * @returns {Promise<{content: string, outputPath: string}>} Generated content and output path.
 */
export async function generate(detection, config) {
  registerHelpers();

  if (detection.languages.length === 0) {
    throw new Error('No languages detected. Cannot generate a pipeline without knowing the project stack.');
  }

  log.startSpinner('Generating pipeline configuration...');

  // Resolve template
  const templateName = resolveTemplateName(detection, config);
  const template = await loadTemplate(templateName);

  // Build context
  const context = buildContext(detection, config);

  // Render template
  let content = template(context);

  // Clean up extra blank lines (cosmetic)
  content = content.replace(/\n{3,}/g, '\n\n').trim() + '\n';

  log.stopSpinner('Pipeline generated');

  return {
    content,
    outputPath: config.output,
    templateUsed: templateName,
    context,
  };
}

/**
 * Write the generated pipeline to disk.
 * @param {string} content - YAML content.
 * @param {string} outputPath - Relative path for the output file.
 * @param {string} [cwd=process.cwd()] - Project root.
 * @param {boolean} [force=false] - Overwrite existing files.
 * @returns {Promise<string>} Absolute path of the written file.
 */
export async function writePipeline(content, outputPath, cwd = process.cwd(), force = false) {
  const absPath = resolve(cwd, outputPath);
  const dir = dirname(absPath);

  // Check if file already exists
  if (existsSync(absPath) && !force) {
    throw new Error(
      `Output file already exists: ${outputPath}\n` +
      `Use --force to overwrite or --output to specify a different path.`
    );
  }

  // Ensure directory exists
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  await writeFile(absPath, content, 'utf-8');

  return absPath;
}

/**
 * Pretty-print the generated YAML content to console (dry-run mode).
 * @param {string} content - YAML content.
 */
export function printDryRun(content) {
  log.section('📄 Generated Pipeline (Dry Run)');
  console.log(chalk.dim('─'.repeat(50)));
  console.log(content);
  console.log(chalk.dim('─'.repeat(50)));
  log.blank();
  log.info('Dry run mode — no files were written.');
}

export default { generate, writePipeline, printDryRun };
