const fs = require('fs');
let probData = fs.readFileSync('src/components/marketing/problem-first.tsx', 'utf8');
const probObj = `
  {
    id: 'budget',
    emoji: '💸',
    challenge: 'Saan napupunta ang pera at budget ko?',
    solution: 'Ang Budget Mo ay tumutulong upang ma-monitor ang bawat sentimo at makapag-ipon.',
    module: 'Budget Mo',
    moduleId: 'budget-mo',
    color: '#8B5CF6',
  }`;
let probParts = probData.split('const PROBLEMS = [');
if (probParts.length === 2) {
    let probEndIdx = probParts[1].indexOf('];');
    let newProbPart = probParts[1].slice(0, probEndIdx) + ',' + probObj + '\n' + probParts[1].slice(probEndIdx);
    let newProbData = probParts[0] + 'const PROBLEMS = [' + newProbPart;
    fs.writeFileSync('src/components/marketing/problem-first.tsx', newProbData);
    console.log('Updated problem-first.tsx');
}
