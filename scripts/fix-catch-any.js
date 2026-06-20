const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(path.join(__dirname, '../src'));
let changedFiles = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  content = content.replace(/catch\s*\(\s*(error|err)\s*:\s*any\s*\)\s*\{/g, (match, p1) => {
    return `catch (e) {\n      const ${p1} = e as Error & { code?: string };`;
  });

  if (content !== original) {
    fs.writeFileSync(file, content);
    changedFiles++;
    console.log(`Fixed ${file}`);
  }
});

console.log(`Fixed ${changedFiles} files.`);
