#!/bin/bash

# Simple test script for Claude Code Wrapper

echo "🧪 Testing Claude Code Wrapper"
echo "=============================="
echo

# Test 1: Help command
echo "1. Testing help command..."
node src/cli.js --help
echo

# Test 2: Version command
echo "2. Testing version command..."
node src/cli.js --version
echo

# Test 3: Quick test with echo
echo "3. Testing wrapper mechanics with echo..."
CLAUDE_WRAPPER_TEST_MODE=true node src/cli.js echo '{"type":"response","content":"Hello from test!"}'
echo

# Test 4: Run manual test
echo "4. Running manual quick test..."
npm run test:manual
echo

echo "✅ Basic tests completed!"
echo
echo "To test with real Claude Code:"
echo "  1. npm link"
echo "  2. claude-code-wrapper 'What is 2+2?'"