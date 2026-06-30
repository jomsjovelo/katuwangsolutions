import os
import re

dashboards = [
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
]

for file_path in dashboards:
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        continue

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Add import
    if "usePinApproval" not in content:
        content = re.sub(
            r"(import .*? from 'lucide-react';)",
            r"\1\nimport { usePinApproval } from '@/hooks/use-pin-approval';",
            content
        )
    
    # 2. Add hook initialization inside component. Look for `const db = useFirestore();` or `const { toast } = useToast();`
    if "const { requireApproval } = usePinApproval();" not in content:
        content = re.sub(
            r"(const { toast } = useToast\(\);)",
            r"\1\n  const { requireApproval } = usePinApproval();",
            content
        )

    # 3. Modify deletion logic to require PIN. This is harder to regex safely for all.
    # We will look for `handleDelete` or similar functions and insert the check if it has a window.confirm.
    # Example: if (!window.confirm("...")) return;
    
    pin_check = """
    // Phase 2: Require Manager PIN for Deletions
    const approved = await requireApproval("Deleting a record requires Manager authorization.");
    if (!approved) return;
"""
    
    content = re.sub(
        r"(\s+if \(!window\.confirm\([^\)]+\)\) return;)",
        lambda m: "\n" + pin_check + m.group(1),
        content
    )

    # 4. Remove `isOwner && (` around the delete button
    # Because `isOwner && (` is used in multiple places, we need to be careful.
    # Usually it's:
    # {isOwner && (
    #   <Button ... onClick={() => onDelete(order.id)}>
    #     <Trash2 ... />
    #   </Button>
    # )}
    # We will just do a simpler search and replace for `{isOwner && (` to `<div className="inline-block">`
    # No, that's too hacky. Let's just write the modified content back and let TS catch any unbalanced braces.
    # Actually, replacing `{isOwner && (` with nothing leaves a stray `)}` which breaks TSX.
    
    # Let's write a regex that specifically targets the Trash2 button wrapped in isOwner.
    content = re.sub(
        r"\{isOwner && \(\s*(<Button[^>]+onClick=\{[^>]+>\s*<Trash2[^>]+>\s*</Button>)\s*\)\}",
        r"\1",
        content
    )

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Done modifying dashboards!")
