<p align="center">
  <img src="https://raw.githubusercontent.com/DhanushNehru/pipeforge/main/assets/logo.png" alt="pipeforge logo" width="200" />
</p>

<h1 align="center">🔥 pipeforge</h1>

<p align="center">
  <strong>Auto-generate CI/CD pipelines from your codebase in seconds.</strong><br/>
  Detect your stack. Generate your pipeline. Ship faster.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/pipeforge"><img src="https://img.shields.io/npm/v/pipeforge?style=flat-square&color=cb3837" alt="npm version" /></a>
  <a href="https://github.com/DhanushNehru/pipeforge/blob/main/LICENSE"><img src="https://img.shields.io/github/license/DhanushNehru/pipeforge?style=flat-square&color=blue" alt="license" /></a>
  <a href="https://github.com/DhanushNehru/pipeforge/stargazers"><img src="https://img.shields.io/github/stars/DhanushNehru/pipeforge?style=flat-square&color=yellow" alt="stars" /></a>
  <a href="https://github.com/DhanushNehru/pipeforge/issues"><img src="https://img.shields.io/github/issues/DhanushNehru/pipeforge?style=flat-square" alt="issues" /></a>
  <a href="https://github.com/DhanushNehru/pipeforge/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" /></a>
  <a href="https://github.com/DhanushNehru/pipeforge"><img src="https://img.shields.io/badge/Hacktoberfest-friendly-orange?style=flat-square&logo=hacktoberfest&logoColor=white" alt="Hacktoberfest" /></a>
  <a href="https://www.npmjs.com/package/pipeforge"><img src="https://img.shields.io/npm/dm/pipeforge?style=flat-square&color=blue" alt="downloads" /></a>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-supported-stacks">Supported Stacks</a> •
  <a href="#-why-pipeforge">Why pipeforge?</a> •
  <a href="#-contributing">Contributing</a>
</p>

---

## 🤔 What is pipeforge?

**pipeforge** scans your project, detects the languages, frameworks, and tools you're using, and instantly generates a production-ready CI/CD pipeline — no YAML wrangling required.

Stop spending hours copying pipeline configs from Stack Overflow. Let pipeforge do it in seconds.

## ⚡ Quick Start

### Install

```bash
# npm
npm install -g pipeforge

# npx (no install needed)
npx pipeforge

# brew
brew install pipeforge
```

### Usage

```bash
# Navigate to your project and run
pipeforge

# Or specify a directory
pipeforge --path ./my-project

# Choose a specific CI provider
pipeforge --provider github

# Dry run — preview without writing files
pipeforge --dry-run
```

### 🎬 Demo

Run `pipeforge` in a Node.js + Docker project and watch the magic happen:

```
$ pipeforge

  🔥 pipeforge v1.0.0
  ─────────────────────────────────────────

  📂 Scanning project: ./my-fullstack-app

  🔍 Detecting stack...
  ✔ Found: package.json        → Node.js (v20)
  ✔ Found: Dockerfile           → Docker
  ✔ Found: docker-compose.yml   → Docker Compose
  ✔ Found: jest.config.js       → Jest (testing)
  ✔ Found: .eslintrc.json       → ESLint (linting)
  ✔ Found: tsconfig.json        → TypeScript

  📋 Stack Summary
  ┌──────────────┬─────────────────────┐
  │ Category     │ Detected            │
  ├──────────────┼─────────────────────┤
  │ Language     │ TypeScript (Node.js)│
  │ Runtime      │ Node.js 20.x        │
  │ Package Mgr  │ npm                 │
  │ Testing      │ Jest                │
  │ Linting      │ ESLint              │
  │ Container    │ Docker + Compose    │
  └──────────────┴─────────────────────┘

  🏗️  Generating pipeline...

  ✔ Provider: GitHub Actions
  ✔ Created: .github/workflows/ci.yml
  ✔ Created: .github/workflows/docker-publish.yml

  📄 Generated Pipeline Preview:
  ┌─────────────────────────────────────────────────┐
  │ ci.yml                                          │
  ├─────────────────────────────────────────────────┤
  │ • Trigger: push to main, pull requests          │
  │ • Matrix: Node.js 20.x, 22.x                   │
  │ • Steps: checkout → install → lint → test       │
  │ • Caching: npm dependencies                     │
  │ • Artifacts: coverage report                    │
  ├─────────────────────────────────────────────────┤
  │ docker-publish.yml                              │
  ├─────────────────────────────────────────────────┤
  │ • Trigger: push to main (tags v*)               │
  │ • Steps: build → scan → push to GHCR            │
  │ • Security: Trivy vulnerability scan            │
  └─────────────────────────────────────────────────┘

  ✅ Done! Pipeline generated in 1.2s
  💡 Run "git add . && git push" to activate your pipeline
```

## ✨ Features

- ✅ **Auto-detection** — Scans your project and detects languages, frameworks, and tools automatically
- ✅ **Production-ready** — Generated pipelines include caching, matrix builds, and best practices
- ✅ **Multi-stack support** — Node.js, Python, Go, Rust, Docker, and more
- ✅ **Multiple CI providers** — GitHub Actions (more coming soon!)
- ✅ **Docker-aware** — Detects Dockerfiles and generates build + push workflows
- ✅ **Security built-in** — Includes vulnerability scanning and dependency audits
- ✅ **Dry-run mode** — Preview generated pipelines before writing any files
- ✅ **Interactive mode** — Step-by-step guided pipeline generation
- ✅ **Zero config** — Works out of the box, no configuration files needed
- ✅ **Extensible** — Easy to add support for new languages and frameworks

## 📦 Supported Stacks

| Stack | Detection | CI Pipeline | Docker | Security Scan |
|-------|:---------:|:-----------:|:------:|:-------------:|
| **Node.js** | ✅ | ✅ | ✅ | ✅ |
| **TypeScript** | ✅ | ✅ | ✅ | ✅ |
| **Python** | ✅ | ✅ | ✅ | ✅ |
| **Go** | ✅ | ✅ | ✅ | ✅ |
| **Rust** | ✅ | ✅ | ✅ | ✅ |
| **Docker** | ✅ | ✅ | ✅ | ✅ |
| **Java** | 🔜 | 🔜 | 🔜 | 🔜 |
| **Kotlin** | 🔜 | 🔜 | 🔜 | 🔜 |
| **Ruby** | 🔜 | 🔜 | 🔜 | 🔜 |
| **PHP** | 🔜 | 🔜 | 🔜 | 🔜 |
| **.NET** | 🔜 | 🔜 | 🔜 | 🔜 |
| **Swift** | 🔜 | 🔜 | 🔜 | 🔜 |
| **Flutter** | 🔜 | 🔜 | 🔜 | 🔜 |
| **Elixir** | 🔜 | 🔜 | 🔜 | 🔜 |

> 🔜 = Coming soon! Want to help? Check out our [Contributing Guide](CONTRIBUTING.md).

## 🏆 Why pipeforge?

### Comparison

| Feature | pipeforge | Manual Setup | Starter Templates |
|---------|:---------:|:------------:|:-----------------:|
| Auto-detects your stack | ✅ | ❌ | ❌ |
| Production-ready defaults | ✅ | ⚠️ Depends | ⚠️ Often outdated |
| Docker pipeline generation | ✅ | ❌ Manual | ⚠️ Some templates |
| Security scanning included | ✅ | ❌ Manual | ❌ Rarely |
| Multi-language support | ✅ | N/A | ⚠️ One per template |
| Caching optimized | ✅ | ⚠️ If you know how | ⚠️ Sometimes |
| Time to working pipeline | **~5 seconds** | **30-60 minutes** | **10-15 minutes** |
| Keeps up with CI updates | ✅ | ❌ | ❌ |
| Open source | ✅ | N/A | ⚠️ Sometimes |

### Before pipeforge 😩

```yaml
# *googles "github actions node.js"*
# *copies from Stack Overflow*
# *pipeline fails*
# *spends 45 minutes debugging YAML indentation*
# *finally gets it working*
# *realizes you forgot Docker*
# *starts over*
```

### After pipeforge 🚀

```bash
$ npx pipeforge
# Done. Go ship your code.
```

## 🔧 Configuration

pipeforge works with zero configuration, but you can customize it with a `.pipeforgerc.json` file:

```json
{
  "provider": "github",
  "nodeVersions": ["20", "22"],
  "includeDocker": true,
  "includeSecurity": true,
  "caching": true,
  "artifacts": ["coverage"]
}
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--path <dir>` | Project directory to scan | `.` (current) |
| `--provider <name>` | CI provider (`github`) | `github` |
| `--dry-run` | Preview without writing files | `false` |
| `--interactive` | Step-by-step guided mode | `false` |
| `--force` | Overwrite existing pipelines | `false` |
| `--verbose` | Show detailed detection output | `false` |

## 🤝 Contributing

We **love** contributions! pipeforge is designed to be easy to contribute to, especially for adding new language and framework support.

👉 **[Read the Contributing Guide →](CONTRIBUTING.md)**

### Quick Ways to Contribute

- 🌐 **Add a new language** — [See how →](CONTRIBUTING.md#adding-support-for-a-new-language)
- 🐛 **Report a bug** — [Open an issue →](https://github.com/DhanushNehru/pipeforge/issues/new?template=bug_report.yml)
- 💡 **Request a feature** — [Open an issue →](https://github.com/DhanushNehru/pipeforge/issues/new?template=feature_request.yml)
- 📖 **Improve docs** — PRs for documentation are always welcome!
- ⭐ **Star the repo** — It helps more than you think!

### 🎃 Hacktoberfest

pipeforge is **Hacktoberfest friendly**! Look for issues labeled [`hacktoberfest`](https://github.com/DhanushNehru/pipeforge/issues?q=is%3Aissue+is%3Aopen+label%3Ahacktoberfest) and [`good first issue`](https://github.com/DhanushNehru/pipeforge/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## 💖 Sponsors

pipeforge is free and open source. If it saves you time, consider supporting the project:

<p align="center">
  <a href="https://github.com/sponsors/DhanushNehru">
    <img src="https://img.shields.io/badge/Sponsor-❤️-ea4aaa?style=for-the-badge&logo=github-sponsors&logoColor=white" alt="Sponsor" />
  </a>
</p>

<p align="center">
  <em>Your logo here — <a href="https://github.com/sponsors/DhanushNehru">become a sponsor</a></em>
</p>

## 📊 Star History

<p align="center">
  <a href="https://star-history.com/#DhanushNehru/pipeforge&Date">
    <img src="https://api.star-history.com/svg?repos=DhanushNehru/pipeforge&type=Date" alt="Star History Chart" width="600" />
  </a>
</p>

## 📄 License

[MIT](LICENSE) © 2026 [Dhanush Nehru](https://github.com/DhanushNehru)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/DhanushNehru">Dhanush Nehru</a>
</p>

<p align="center">
  <a href="https://github.com/DhanushNehru">
    <img src="https://img.shields.io/badge/GitHub-DhanushNehru-181717?style=flat-square&logo=github" alt="GitHub" />
  </a>
  <a href="https://twitter.com/Dhanush_Nehru">
    <img src="https://img.shields.io/badge/Twitter-@Dhanush__Nehru-1DA1F2?style=flat-square&logo=twitter&logoColor=white" alt="Twitter" />
  </a>
  <a href="https://www.linkedin.com/in/dhanush-nehru/">
    <img src="https://img.shields.io/badge/LinkedIn-Dhanush_Nehru-0A66C2?style=flat-square&logo=linkedin" alt="LinkedIn" />
  </a>
</p>

<p align="center">
  If pipeforge helped you, give it a ⭐ — it means a lot!
</p>
