import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { detect } from '../src/detector.js';

async function runTests() {
  const tempDir = path.join(process.cwd(), 'temp-test-project');

  try {
    console.log('Running test: detect Node.js project');
    // Setup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir);

    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-node-project',
        dependencies: {
          express: '^4.18.0',
        },
        devDependencies: {
          jest: '^29.0.0',
          eslint: '^8.0.0',
        },
        engines: {
          node: '>=20.0.0',
        },
      }),
      'utf8'
    );
    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}', 'utf8');

    const result = await detect(tempDir);
    assert.ok(result.languages.includes('Node.js'));
    assert.strictEqual(result.packageManager, 'npm');
    assert.ok(result.frameworks.includes('Express'));
    assert.strictEqual(result.hasTests, true);
    assert.strictEqual(result.hasLinting, true);
    assert.strictEqual(result.nodeVersion, '20');
    console.log('✓ detect Node.js project passed');

    console.log('Running test: detect Python project');
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir);

    fs.writeFileSync(
      path.join(tempDir, 'requirements.txt'),
      'django>=4.0\npytest>=7.0\n',
      'utf8'
    );

    const result2 = await detect(tempDir);
    assert.ok(result2.languages.includes('Python'));
    assert.strictEqual(result2.packageManager, 'pip');
    assert.ok(result2.frameworks.includes('Django'));
    assert.strictEqual(result2.hasTests, true);
    console.log('✓ detect Python project passed');

    console.log('Running test: detect Flutter project');
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir);

    fs.writeFileSync(
      path.join(tempDir, 'pubspec.yaml'),
      `name: test_flutter_app
description: A test Flutter project.
environment:
  sdk: '>=3.0.0 <4.0.0'
dependencies:
  flutter:
    sdk: flutter
dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0
`,
      'utf8'
    );
    fs.mkdirSync(path.join(tempDir, 'android'));
    fs.mkdirSync(path.join(tempDir, 'ios'));
    fs.mkdirSync(path.join(tempDir, 'test'));

    const result3 = await detect(tempDir);
    assert.ok(result3.languages.includes('Flutter'));
    assert.strictEqual(result3.packageManager, 'flutter');
    assert.ok(result3.frameworks.includes('Flutter'));
    assert.strictEqual(result3.hasTests, true);
    assert.strictEqual(result3.hasLinting, true);
    assert.ok(result3.meta.flutterPlatforms.includes('android'));
    assert.ok(result3.meta.flutterPlatforms.includes('ios'));
    console.log('✓ detect Flutter project passed');

    console.log('\n🎉 All tests passed successfully!');
  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

runTests();
