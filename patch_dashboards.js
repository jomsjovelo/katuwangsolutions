const fs = require('fs');

const dashboards = [
    "src/components/dashboard/events/ganap-dashboard.tsx",
    "src/components/dashboard/farm/farm-dashboard.tsx",
    "src/components/dashboard/finance/ledger-dashboard.tsx",
    "src/components/dashboard/finance/payroll-dashboard.tsx",
    "src/components/dashboard/food/food-dashboard.tsx",
    "src/components/dashboard/food/timpla-dashboard.tsx",
    "src/components/dashboard/rental/rental-dashboard.tsx",
    "src/components/dashboard/service/auto-boss-dashboard.tsx",
    "src/components/dashboard/service/hydro-dashboard.tsx",
    "src/components/dashboard/service/rep-sync-dashboard.tsx",
    "src/components/dashboard/service/service-dashboard.tsx",
    "src/components/dashboard/service/trim-track-dashboard.tsx",
    "src/components/dashboard/service/wellness-dashboard.tsx",
    "src/components/dashboard/trucking/fleet-dashboard.tsx",
];

for (const filePath of dashboards) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        continue;
    }

    let content = fs.readFileSync(filePath, 'utf-8');

    // 1. Add import
    if (!content.includes("usePinApproval")) {
        content = content.replace(
            /(import .*? from 'lucide-react';)/,
            "$1\nimport { usePinApproval } from '@/hooks/use-pin-approval';"
        );
    }
    
    // 2. Add hook initialization
    if (!content.includes("const { requireApproval } = usePinApproval();")) {
        content = content.replace(
            /(const { toast } = useToast\(\);)/,
            "$1\n  const { requireApproval } = usePinApproval();"
        );
    }

    // 3. Modify deletion logic
    const pinCheck = `\n    // Phase 2: Require Manager PIN for Deletions
    const approved = await requireApproval("Deleting a record requires Manager authorization.");
    if (!approved) return;\n`;
    
    content = content.replace(
        /(\s+if \(!window\.confirm\([^\)]+\)\) return;)/g,
        (match) => pinCheck + match
    );

    // 4. Remove `isOwner && (` around the delete button
    content = content.replace(
        /\{isOwner && \(\s*(<Button[^>]+onClick=\{[^>]+>\s*<Trash2[^>]+>\s*<\/Button>)\s*\)\}/g,
        "$1"
    );

    fs.writeFileSync(filePath, content, 'utf-8');
}

console.log("Done modifying dashboards!");
