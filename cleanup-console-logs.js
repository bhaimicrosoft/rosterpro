const fs = require('fs');
const path = require('path');

// Function to recursively find all TypeScript files
function findTSFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      findTSFiles(fullPath, files);
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Function to clean console logs from a file
function cleanConsoleLogsFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Remove console.log, console.warn, console.info, console.debug but keep console.error
  const cleanedContent = content
    .replace(/^\s*console\.(log|warn|info|debug)\(.*?\);?\s*$/gm, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove extra blank lines
    .replace(/\n{3,}/g, '\n\n'); // Limit consecutive newlines to 2
  
  if (content !== cleanedContent) {
    fs.writeFileSync(filePath, cleanedContent, 'utf8');
    console.log(`Cleaned: ${filePath}`);
    return true;
  }
  
  return false;
}

// Main execution
const srcDir = path.join(__dirname, 'src');
const tsFiles = findTSFiles(srcDir);

let filesModified = 0;

console.log(`Found ${tsFiles.length} TypeScript files to check...`);

for (const file of tsFiles) {
  if (cleanConsoleLogsFromFile(file)) {
    filesModified++;
  }
}

console.log(`\nCleaning complete! Modified ${filesModified} files.`);
