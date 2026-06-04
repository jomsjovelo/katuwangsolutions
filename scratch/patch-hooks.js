const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

const componentsDir = path.join(__dirname, '../src/components/dashboard');

walkDir(componentsDir, (filePath) => {
  if (filePath.endsWith('.tsx')) {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Pattern to catch: const <name>Query = currentTenant ? query(...) : null;
    // or const <name>Query = currentTenant && db ? query(...) : null;
    const regex = /const (\w+Query)\s*=\s*(currentTenant[\s\S]*?\?)\s*query\(([\s\S]*?)\)\s*:\s*null;/g;

    let patched = false;
    content = content.replace(regex, (match, queryName, condition, queryBody) => {
      if (match.includes('useMemo')) return match; // Already memoized
      patched = true;
      return `const ${queryName} = React.useMemo(() => {\n    return ${condition.trim()} query(${queryBody.trim()}) : null;\n  }, [currentTenant?.id, db]);`;
    });

    if (patched) {
      console.log('Patching inline query in ' + path.basename(filePath));
      if (!content.includes("import React") && !content.includes("import * as React")) {
        content = "import React from 'react';\n" + content;
      }
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log('Successfully patched ' + path.basename(filePath));
    }
  }
});
