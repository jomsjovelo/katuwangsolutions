# **App Name**: Katuwang Solutions

## Core Features:

- Katuwang SnapDate: Date picker optimized for one-handed mobile use featuring a 7-column grid with 48px touch targets, bottom-weighted navigation, and quick-select chips for Today, Yesterday, and Last 7 Days.
- Isolation Shield Architecture: Multi-tenant data security using Firestore sub-collections for all tenant-specific data including Inventory, Sales, and Customers to ensure 100% data segregation.
- Dynamic Module Router: Global Auth Guard system that redirects users to industry modules such as Benta Snap, Hydro Sync, and Sahod Flow based on their designated moduleType in the root collection.
- Owner Kill-Switch Panel: Centralized master control table for the owner UID to search tenants and instantly set subscriptionStatus to suspended or toggle pricing between promo_99 and standard_199.
- Universal Inventory Engine: Shared inventory logic for tracking stocks and generating low-stock alerts across all supported industry modules including Build Stack and Fresh Tally.
- Hardened Billing Gateway: Subscription enforcement system that blocks access for non-active statuses and displays localized payment requirements with current pricingTier visibility.

## Style Guidelines:

- Primary Background: #051821 (Deep Navy) for a modern, professional SaaS aesthetic.
- Secondary Surface and Navigation: #1A4645 (Deep Teal) for high-contrast interface elements.
- Accent and Active States: #F58800 (Vibrant Orange) for interactive components and highlights.
- Highlights and Success: #F8BC24 (Golden Yellow) for positive status indicators and success alerts.
- Headline font: 'Space Grotesk' for a precise, technical appearance; Body font: 'Inter' for readability in dense data views.
- Icons and text utilizing #266867 (Muted Teal) and White for high readability against dark backgrounds.
- Mobile-first design with 48px minimum touch targets and bottom-weighted layouts for one-handed critical interactions.
- Snappy, spring-based transitions for modal behaviors and status changes.