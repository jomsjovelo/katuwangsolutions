const fs = require('fs');

let appData = fs.readFileSync('src/lib/app-data.ts', 'utf8');
const budgetMoObj = `
  {
    id: 'finance',
    label: 'Finance',
    accentColor: '#8B5CF6',
    apps: [
      {
        id: 'budget-mo',
        name: 'Budget Mo',
        icon: Banknote,
        tagline: 'Your personal and business budgeting assistant.',
        imageSrc: '/apps/budget-sense.png',
        features: ['Income Tracking', 'Goal Envelopes', 'Real-time Cash Flow', 'Expense Logging'],
        description: 'Budget Mo helps you monitor every cent. Track your incomes, set goal envelopes, and monitor your cash flow in real-time. Make sure your finances are always on track.',
        benefits: [
          'Visually track all cash flow and expenses',
          'Create strict budget envelopes to limit overspending',
          'Perfect for both personal use and small business expense tracking'
        ],
        stats: [
          { value: '100%', label: 'Budget Visibility' },
          { value: '₱50/mo', label: 'Promo (Was ₱100)' },
          { value: '0', label: 'Lost Expenses' },
        ],
        howItWorks: [
          { step: 'Set Envelopes', detail: 'Create categories and assign budget limits to them.' },
          { step: 'Track Expenses', detail: 'Log every expense and see your remaining balance.' }
        ],
        targetUsers: ['Individuals', 'Small Businesses']
      }
    ]
  }`;

let appDataParts = appData.split('export const appGroups: AppGroup[] = [');
if (appDataParts.length === 2) {
    let secondPart = appDataParts[1];
    let insertIndex = secondPart.lastIndexOf('];');
    if (insertIndex !== -1) {
        let newSecondPart = secondPart.slice(0, insertIndex) + ',' + budgetMoObj + '\n' + secondPart.slice(insertIndex);
        appData = appDataParts[0] + 'export const appGroups: AppGroup[] = [' + newSecondPart;
        fs.writeFileSync('src/lib/app-data.ts', appData);
        console.log('Updated app-data.ts');
    }
}

let carouselData = fs.readFileSync('src/components/marketing/app-suite-carousel.tsx', 'utf8');
const carouselObj = `
  {
    id: 'budget-mo',
    name: 'Budget Mo',
    icon: Banknote,
    tagline: 'Makabagong paraan para mag-budget at mag-ipon.',
    imageSrc: '/apps/budget-sense.png',
    color: '#8B5CF6',
    badge: '₱50 Promo',
  }`;
let carParts = carouselData.split('const FLAGSHIP_APPS = [');
if (carParts.length === 2) {
    let carEndIdx = carParts[1].indexOf('];');
    let newCarPart = carParts[1].slice(0, carEndIdx) + ',' + carouselObj + '\n' + carParts[1].slice(carEndIdx);
    let newCarouselData = carParts[0] + 'const FLAGSHIP_APPS = [' + newCarPart;
    if (!newCarouselData.includes('Banknote,')) {
        newCarouselData = newCarouselData.replace('ShoppingCart, Leaf, Truck, HandCoins, Utensils, Bed', 'ShoppingCart, Leaf, Truck, HandCoins, Utensils, Bed, Banknote');
    }
    fs.writeFileSync('src/components/marketing/app-suite-carousel.tsx', newCarouselData);
    console.log('Updated app-suite-carousel.tsx');
}

let bizData = fs.readFileSync('src/components/marketing/business-finder.tsx', 'utf8');
const bizObj = `  { id: 'finance', label: 'Personal / Business Finance', icon: Banknote, module: 'Budget Mo', moduleId: 'budget-mo', color: '#8B5CF6' },`;
let bizParts = bizData.split('const INDUSTRIES = [');
if (bizParts.length === 2) {
    let bizEndIdx = bizParts[1].indexOf('];');
    let newBizPart = bizParts[1].slice(0, bizEndIdx) + '\n' + bizObj + '\n' + bizParts[1].slice(bizEndIdx);
    let newBizData = bizParts[0] + 'const INDUSTRIES = [' + newBizPart;
    if (!newBizData.includes('Banknote,')) {
        newBizData = newBizData.replace('Scissors, Truck, Hammer, Droplets, ChevronRight, Bed', 'Scissors, Truck, Hammer, Droplets, ChevronRight, Bed, Banknote');
    }
    fs.writeFileSync('src/components/marketing/business-finder.tsx', newBizData);
    console.log('Updated business-finder.tsx');
}

let probData = fs.readFileSync('src/components/marketing/problem-first.tsx', 'utf8');
const probObj = `
  {
    problem: 'Saan napupunta ang pera at budget ko?',
    solution: 'Ang Budget Mo ay tumutulong upang ma-monitor ang bawat sentimo at makapag-ipon.',
    module: 'Budget Mo',
    moduleId: 'budget-mo',
    icon: Banknote,
    color: '#8B5CF6'
  }`;
let probParts = probData.split('const PAIN_POINTS = [');
if (probParts.length === 2) {
    let probEndIdx = probParts[1].indexOf('];');
    let newProbPart = probParts[1].slice(0, probEndIdx) + ',' + probObj + '\n' + probParts[1].slice(probEndIdx);
    let newProbData = probParts[0] + 'const PAIN_POINTS = [' + newProbPart;
    if (!newProbData.includes('Banknote,')) {
        newProbData = newProbData.replace('Leaf, Droplets, Utensils, Hammer, RotateCcw, Box, Truck, Bed', 'Leaf, Droplets, Utensils, Hammer, RotateCcw, Box, Truck, Bed, Banknote');
    }
    fs.writeFileSync('src/components/marketing/problem-first.tsx', newProbData);
    console.log('Updated problem-first.tsx');
}
