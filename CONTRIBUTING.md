# 🤝 Contributing to ciraft

First off, **thank you** for considering contributing to ciraft! Every contribution matters — whether it's fixing a typo, adding support for a new language, or improving the docs.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Adding Support for a New Language](#adding-support-for-a-new-language)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Good First Issues](#good-first-issues)
- [Need Help?](#need-help)

---

## Getting Started

### Prerequisites

- **Node.js** 20.x or higher
- **npm** 9.x or higher
- **Git**

### Development Setup

1. **Fork the repository**

   Click the "Fork" button at the top of [https://github.com/DhanushNehru/ciraft](https://github.com/DhanushNehru/ciraft).

2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/ciraft.git
   cd ciraft
   ```

3. **Install dependencies**

   ```bash
   npm install
   ```

4. **Create a branch**

   ```bash
   git checkout -b feature/add-java-support
   ```

5. **Run the project locally**

   ```bash
   # Run ciraft from source
   npm run dev

   # Run tests
   npm test

   # Run linter
   npm run lint

   # Build
   npm run build
   ```

6. **Make your changes, test, and submit a PR!**

---

## Project Structure

```
ciraft/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── cli/
│   │   ├── commands.ts       # CLI command definitions
│   │   └── interactive.ts    # Interactive mode prompts
│   ├── detectors/
│   │   ├── index.ts          # Detector registry
│   │   ├── node.ts           # Node.js detector
│   │   ├── python.ts         # Python detector
│   │   ├── go.ts             # Go detector
│   │   ├── rust.ts           # Rust detector
│   │   └── docker.ts         # Docker detector
│   ├── generators/
│   │   ├── index.ts          # Generator registry
│   │   ├── github/
│   │   │   ├── index.ts      # GitHub Actions generator
│   │   │   ├── node.ts       # Node.js workflow template
│   │   │   ├── python.ts     # Python workflow template
│   │   │   ├── go.ts         # Go workflow template
│   │   │   ├── rust.ts       # Rust workflow template
│   │   │   └── docker.ts     # Docker workflow template
│   │   └── templates/
│   │       └── ...           # Shared templates
│   ├── types/
│   │   └── index.ts          # TypeScript type definitions
│   └── utils/
│       ├── fs.ts             # File system utilities
│       ├── logger.ts         # Logging utilities
│       └── yaml.ts           # YAML utilities
├── tests/
│   ├── detectors/
│   ├── generators/
│   └── fixtures/             # Test project fixtures
├── package.json
├── tsconfig.json
└── README.md
```

---

## Adding Support for a New Language

This is the **most common and easiest** way to contribute! Here's a step-by-step guide using **Java** as an example.

### Step 1: Create a Detector

Create a new file `src/detectors/java.ts`:

```typescript
import { Detector, DetectionResult } from '../types';
import { fileExists, readJsonFile } from '../utils/fs';

export const javaDetector: Detector = {
  name: 'java',
  displayName: 'Java',

  async detect(projectPath: string): Promise<DetectionResult | null> {
    // Check for common Java project files
    const hasPomXml = await fileExists(projectPath, 'pom.xml');
    const hasBuildGradle = await fileExists(projectPath, 'build.gradle');
    const hasBuildGradleKts = await fileExists(projectPath, 'build.gradle.kts');

    if (!hasPomXml && !hasBuildGradle && !hasBuildGradleKts) {
      return null; // Not a Java project
    }

    const buildTool = hasPomXml ? 'maven' : 'gradle';
    const javaVersion = await detectJavaVersion(projectPath, buildTool);

    return {
      language: 'java',
      displayName: 'Java',
      version: javaVersion,
      buildTool,
      detectedFiles: [
        hasPomXml && 'pom.xml',
        hasBuildGradle && 'build.gradle',
        hasBuildGradleKts && 'build.gradle.kts',
      ].filter(Boolean) as string[],
      // Additional metadata for pipeline generation
      metadata: {
        buildTool,
        hasTests: true, // Assume tests exist
        buildCommand: buildTool === 'maven' ? 'mvn verify' : './gradlew build',
        testCommand: buildTool === 'maven' ? 'mvn test' : './gradlew test',
      },
    };
  },
};

async function detectJavaVersion(
  projectPath: string,
  buildTool: string
): Promise<string> {
  // Logic to detect Java version from pom.xml or build.gradle
  // Default to Java 17 if not detected
  return '17';
}
```

### Step 2: Register the Detector

Add your detector to `src/detectors/index.ts`:

```typescript
import { javaDetector } from './java';

export const detectors: Detector[] = [
  nodeDetector,
  pythonDetector,
  goDetector,
  rustDetector,
  dockerDetector,
  javaDetector, // ← Add your detector here
];
```

### Step 3: Create a Pipeline Generator

Create `src/generators/github/java.ts`:

```typescript
import { PipelineGenerator, DetectionResult } from '../../types';

export const javaGitHubGenerator: PipelineGenerator = {
  name: 'java-github',
  language: 'java',
  provider: 'github',

  generate(detection: DetectionResult): string {
    const { buildTool, version } = detection.metadata;
    const isMaven = buildTool === 'maven';

    return `name: Java CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        java-version: [${version}, '21']

    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK \${{ matrix.java-version }}
        uses: actions/setup-java@v4
        with:
          java-version: \${{ matrix.java-version }}
          distribution: 'temurin'
${isMaven ? `
      - name: Cache Maven dependencies
        uses: actions/cache@v4
        with:
          path: ~/.m2/repository
          key: \${{ runner.os }}-maven-\${{ hashFiles('**/pom.xml') }}
          restore-keys: |
            \${{ runner.os }}-maven-

      - name: Build with Maven
        run: mvn -B verify

      - name: Run tests
        run: mvn test
` : `
      - name: Cache Gradle dependencies
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: \${{ runner.os }}-gradle-\${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}
          restore-keys: |
            \${{ runner.os }}-gradle-

      - name: Build with Gradle
        run: ./gradlew build

      - name: Run tests
        run: ./gradlew test
`}`;
  },
};
```

### Step 4: Register the Generator

Add your generator to `src/generators/index.ts`:

```typescript
import { javaGitHubGenerator } from './github/java';

export const generators: PipelineGenerator[] = [
  // ... existing generators
  javaGitHubGenerator, // ← Add your generator here
];
```

### Step 5: Add Tests

Create `tests/detectors/java.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { javaDetector } from '../../src/detectors/java';

describe('Java Detector', () => {
  it('should detect Maven projects', async () => {
    const result = await javaDetector.detect('./tests/fixtures/java-maven');
    expect(result).not.toBeNull();
    expect(result?.language).toBe('java');
    expect(result?.metadata.buildTool).toBe('maven');
  });

  it('should detect Gradle projects', async () => {
    const result = await javaDetector.detect('./tests/fixtures/java-gradle');
    expect(result).not.toBeNull();
    expect(result?.language).toBe('java');
    expect(result?.metadata.buildTool).toBe('gradle');
  });

  it('should return null for non-Java projects', async () => {
    const result = await javaDetector.detect('./tests/fixtures/node-basic');
    expect(result).toBeNull();
  });
});
```

Create test fixtures in `tests/fixtures/java-maven/` (a minimal `pom.xml`) and `tests/fixtures/java-gradle/` (a minimal `build.gradle`).

### Step 6: Update Documentation

- Update the **Supported Stacks** table in `README.md`
- Add an entry in the **Supported Stacks** section

### Step 7: Submit Your PR! 🎉

---

## Code Style Guidelines

We use **ESLint** and **Prettier** to maintain consistent code style.

### Rules

- **TypeScript** for all source code
- **2-space indentation**
- **Single quotes** for strings
- **Semicolons** required
- **Trailing commas** in multi-line structures
- **Meaningful variable names** — avoid single letters except in loops
- **JSDoc comments** for public functions and types

### Formatting

```bash
# Check formatting
npm run lint

# Auto-fix formatting issues
npm run lint:fix

# Format with Prettier
npm run format
```

### File Naming

- Use **kebab-case** for filenames: `my-detector.ts`
- Use **PascalCase** for types/interfaces: `DetectionResult`
- Use **camelCase** for variables and functions: `detectJavaVersion`

---

## Testing

We use [Vitest](https://vitest.dev/) for testing.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run a specific test file
npm test -- tests/detectors/java.test.ts
```

### Test Structure

- Each detector should have a corresponding test file in `tests/detectors/`
- Each generator should have a corresponding test file in `tests/generators/`
- Use fixtures in `tests/fixtures/` for realistic project structures
- Aim for **>80% code coverage** for new features

---

## Pull Request Process

1. **Ensure your code passes all checks:**
   ```bash
   npm run lint
   npm test
   npm run build
   ```

2. **Update documentation** if your change affects the public API or supported features.

3. **Write descriptive commit messages:**
   ```
   feat: add Java/Maven detection support
   fix: handle missing package.json gracefully
   docs: add Java example to README
   test: add fixtures for Gradle projects
   ```

4. **Fill out the PR template** completely.

5. **Keep PRs focused** — one feature or fix per PR.

6. **Be responsive** to review feedback.

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use for |
|--------|---------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `docs:` | Documentation changes |
| `test:` | Adding/updating tests |
| `chore:` | Maintenance tasks |
| `refactor:` | Code refactoring |
| `style:` | Formatting changes |
| `ci:` | CI/CD changes |

---

## Good First Issues

New to open source? We've got you covered! Look for issues tagged:

- 🏷️ [`good first issue`](https://github.com/DhanushNehru/ciraft/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) — Perfect for beginners
- 🏷️ [`hacktoberfest`](https://github.com/DhanushNehru/ciraft/issues?q=is%3Aissue+is%3Aopen+label%3Ahacktoberfest) — Eligible for Hacktoberfest
- 🏷️ [`help wanted`](https://github.com/DhanushNehru/ciraft/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) — We'd love your help

Most language support issues are **great first contributions** because:
- The pattern is well-established (copy an existing detector/generator)
- Each one is self-contained
- Tests are straightforward to write
- You learn the full codebase contribution workflow

---

## Need Help?

- 💬 [Open a discussion](https://github.com/DhanushNehru/ciraft/discussions)
- 🐛 [Report a bug](https://github.com/DhanushNehru/ciraft/issues/new?template=bug_report.yml)
- 💡 [Request a feature](https://github.com/DhanushNehru/ciraft/issues/new?template=feature_request.yml)
- 🐦 [Reach out on Twitter](https://twitter.com/Dhanush_Nehru)

---

**Thank you for helping make ciraft better! 🔥**
