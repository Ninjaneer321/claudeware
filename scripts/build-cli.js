#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Copy JavaScript files that aren't compiled by TypeScript
const filesToCopy = ['wrapper.js', 'sdk.js', 'index.js'];
filesToCopy.forEach(file => {
  const srcPath = path.join(__dirname, '../src', file);
  const distPath = path.join(__dirname, '../dist', file);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, distPath);
    console.log(`Copied ${file} to dist/`);
  }
});

// Path to the compiled CLI file
const cliPath = path.join(__dirname, '../dist/cli.js');

// Check if the file exists
if (fs.existsSync(cliPath)) {
  // Read the file
  let content = fs.readFileSync(cliPath, 'utf8');
  
  // Add shebang if not present
  if (!content.startsWith('#!/usr/bin/env node')) {
    content = '#!/usr/bin/env node\n' + content;
    fs.writeFileSync(cliPath, content);
  }
  
  // Make the file executable
  fs.chmodSync(cliPath, '755');
  
  console.log('CLI build completed: Added shebang and made executable');
} else {
  console.error('Error: dist/cli.js not found. Run "npm run build" first.');
  process.exit(1);
}