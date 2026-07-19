const fs = require('fs');

['src/lib/app-data.ts', 'src/components/marketing/app-suite-carousel.tsx', 'src/components/marketing/business-finder.tsx', 'src/components/marketing/problem-first.tsx'].forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  // Fix double commas
  content = content.replace(/,,/g, ',');
  content = content.replace(/, ,/g, ',');
  
  // Fix the comma issue at the start of the inserted objects
  content = content.replace(/},\{/g, '}, {');
  
  // Ensure Banknote is imported
  if (!content.includes('Banknote')) {
    if (content.includes('lucide-react')) {
      content = content.replace(/} from 'lucide-react'/, ', Banknote } from \'lucide-react\'');
      content = content.replace(/} from "lucide-react"/, ', Banknote } from "lucide-react"');
    }
  }

  fs.writeFileSync(f, content);
});

console.log('Fixed syntax errors');
