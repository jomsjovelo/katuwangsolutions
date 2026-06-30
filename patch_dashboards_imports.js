const fs = require('fs');

const dashboards = [
    "src/components/dashboard/events/ganap-dashboard.tsx",
    "src/components/dashboard/farm/farm-dashboard.tsx",
    "src/components/dashboard/finance/ledger-dashboard.tsx",
    "src/components/dashboard/finance/payroll-dashboard.tsx",
    "src/components/dashboard/food/food-dashboard.tsx",
    "src/components/dashboard/food/timpla-dashboard.tsx",
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

    // 1. Add import (if not already properly imported)
    if (!content.includes("import { usePinApproval } from '@/hooks/use-pin-approval';")) {
        // Just put it right after the first line (usually "use client")
        content = content.replace(
            /("use client"|'use client')\n?/,
            "$1\nimport { usePinApproval } from '@/hooks/use-pin-approval';\n"
        );
        
        // If it didn't have use client for some reason, just prepend
        if (!content.includes("import { usePinApproval }")) {
             content = "import { usePinApproval } from '@/hooks/use-pin-approval';\n" + content;
        }
    }

    fs.writeFileSync(filePath, content, 'utf-8');
}

console.log("Done fixing imports!");
