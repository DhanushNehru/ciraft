import fs from 'fs';
import path from 'path';

const targetDir = '/Users/dhanus/Documents/Utility/ciraft';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        results = results.concat(walk(fullPath));
      }
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

const files = walk(targetDir);

files.forEach(filePath => {
  if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || filePath.endsWith('.gif')) {
    return;
  }
  if (path.basename(filePath) === 'rename.js') {
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace case-insensitively while preserving cases where possible
  // We'll replace exact variations
  content = content.replace(/pipeforge/g, 'ciraft');
  content = content.replace(/Pipeforge/g, 'Ciraft');
  content = content.replace(/PIPEFORGE/g, 'CIRAFT');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
});
