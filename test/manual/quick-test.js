#!/usr/bin/env node

/**
 * Quick test script for Claudeware
 * 
 * This tests the core functionality without requiring Claude Code to be installed.
 * It uses echo as a mock Claude command to verify the wrapper mechanics.
 */

const path = require('path');
const { spawn } = require('child_process');

async function quickTest() {
  console.log('🧪 Claudeware Quick Test\n');
  console.log('This test verifies the wrapper mechanics using mock commands.\n');

  // Test 1: Basic passthrough
  console.log('Test 1: Stream passthrough');
  console.log('─'.repeat(40));
  
  await runTest('node', ['-e', 'console.log(\'{"type":"response","content":"Hello from mock Claude!"}\'); process.exit(0);'], {
    expectedOutput: 'Hello from mock Claude!'
  });

  // Test 2: Multiple messages
  console.log('\nTest 2: Multiple messages');
  console.log('─'.repeat(40));
  
  const multiMessage = [
    '{"type":"query","messages":[{"content":"What is 2+2?"}]}',
    '{"type":"response","content":"2 + 2 = 4"}'
  ].join('\\n');
  
  await runTest('node', ['-e', `console.log('${multiMessage}'); process.exit(0);`], {
    expectedOutput: '2 + 2 = 4'
  });

  // Test 3: Plugin loading
  console.log('\nTest 3: Plugin system');
  console.log('─'.repeat(40));
  
  // Create a minimal test plugin
  const testPluginDir = path.join(__dirname, 'test-plugin');
  await createTestPlugin(testPluginDir);
  
  process.env.CLAUDE_WRAPPER_PLUGINS_DIR = __dirname;
  process.env.CLAUDE_WRAPPER_LOG_LEVEL = 'debug';
  
  await runTest('node', ['-e', 'console.log(\'{"type":"test","content":"Plugin test"}\'); process.exit(0);'], {
    expectedOutput: 'Plugin test',
    checkLogs: true
  });

  // Cleanup
  const fs = require('fs').promises;
  await fs.rm(testPluginDir, { recursive: true, force: true });

  console.log('\n✅ All tests passed!\n');
  console.log('Next steps:');
  console.log('1. Install the wrapper: npm link');
  console.log('2. Test with real Claude: claudeware "What is 2+2?"');
  console.log('3. Check the database: sqlite3 ~/.claude-code/queries.db');
}

async function runTest(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const wrapperPath = path.join(__dirname, '../../src/cli.js');
    const child = spawn('node', [wrapperPath, command, ...args], {
      env: { ...process.env, CLAUDE_WRAPPER_TEST_MODE: 'true' }
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
      if (!options.silent) {
        process.stdout.write(data);
      }
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
      if (options.checkLogs || !options.silent) {
        process.stderr.write(data);
      }
    });

    child.on('exit', (code) => {
      if (code !== 0 && !options.allowFailure) {
        reject(new Error(`Process exited with code ${code}`));
        return;
      }

      if (options.expectedOutput && !output.includes(options.expectedOutput)) {
        reject(new Error(`Expected output not found: ${options.expectedOutput}`));
        return;
      }

      if (options.checkLogs && errorOutput.includes('Plugin loaded')) {
        console.log('✓ Plugin system working');
      }

      resolve({ output, errorOutput, code });
    });
  });
}

async function createTestPlugin(dir) {
  const fs = require('fs').promises;
  
  await fs.mkdir(dir, { recursive: true });
  
  const manifest = {
    name: 'test-plugin',
    version: '1.0.0',
    description: 'Test plugin for quick test',
    main: './index.js'
  };
  
  const plugin = `
class TestPlugin {
  constructor() {
    this.name = 'test-plugin';
    this.version = '1.0.0';
    this.manifest = require('./manifest.json');
  }

  async initialize(context) {
    context.logger.info('Test plugin initialized');
  }

  async onEvent(event, context) {
    context.logger.debug('Test plugin received event:', event.type);
  }

  async shutdown() {
    // Cleanup
  }
}

module.exports = TestPlugin;
`;

  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(dir, 'index.js'), plugin);
}

// Run the test
quickTest().catch(error => {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
});