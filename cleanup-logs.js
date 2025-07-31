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
  
  // More comprehensive regex to match multiline console statements
  let cleanedContent = content;
  
  // Match single line console statements
  cleanedContent = cleanedContent.replace(/^\s*console\.(log|warn|info|debug)\([^;]*\);?\s*$/gm, '');
  
  // Match multiline console statements
  cleanedContent = cleanedContent.replace(/^\s*console\.(log|warn|info|debug)\([^)]*\)[^;]*;?\s*$/gm, '');
  
  // Match console statements that span multiple lines with complex objects
  cleanedContent = cleanedContent.replace(/\s*console\.(log|warn|info|debug)\([^;]*?\);?\s*/gs, '');
  
  // Remove extra blank lines
  cleanedContent = cleanedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
  cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n');
  
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
