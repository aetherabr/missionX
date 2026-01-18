# Mission Control - Design Guidelines

## Design Approach
**System-Based Approach**: Enterprise/SaaS aesthetic inspired by Stripe and Vercel - professional, modern, data-dense with sophisticated visual hierarchy.

## Core Design Principles

### Visual Identity
- **Aesthetic**: Premium enterprise dashboard with refined minimalism
- **Brand Color**: Yellow (#facc15) as primary accent - used sparingly for active states, CTAs, and emphasis
- **Secondary**: Blue (#3b82f6) for charts and data visualization
- **Dual Theme**: Full dark/light mode support throughout

### Layout Architecture

**Fixed Sidebar + Sticky Topbar Structure:**
- Sidebar: 295px desktop (80px collapsed) / 280px mobile, fixed left, full height
- Topbar: 80px desktop / 64px mobile, sticky top
- Main content area adjusts based on sidebar state
- Sidebar uses translucent backgrounds with backdrop-blur-md

**Responsive Behavior:**
- Mobile (<1024px): Sidebar slides in/out, topbar shows menu button
- Desktop (≥1024px): Sidebar always visible with collapse toggle, breadcrumbs shown

## Typography System

**Font Stack:**
- Primary: Plus Jakarta Sans (300, 400, 500, 600, 700, 800)
- Monospace: JetBrains Mono (for metrics, data)

**Hierarchy:**
- Page titles: text-xl (20px) font-bold
- Card headers: text-sm (14px) font-medium
- Body text: text-sm (14px) font-normal
- Metrics (large): text-2xl (24px) font-bold
- Labels/badges: text-xs (12px) to text-[11px]
- Letter spacing: tracking-tight for titles, tracking-wide for uppercase labels

## Spacing Primitives

**Primary Units:** 2, 3, 4, 6, 8 (Tailwind scale)
- Component padding: p-3 to p-6
- Card sections: p-4 to p-6
- Gap between elements: gap-2 to gap-6
- Consistent vertical rhythm: py-8 for sections

## Component Library

### Navigation
- **Sidebar Items**: p-3, rounded-xl, active state with yellow accent and glow dot
- **Collapse Toggle**: Absolute positioned, -right-3.5, shadow-lg, 28x28px
- **Breadcrumbs**: Chevron separators, amber-600 for active (light) / brand-yellow (dark)

### Data Display
- **Cards**: Rounded-xl, translucent backgrounds, border-dark-700 (dark) / border-gray-200 (light)
- **Tables**: Striped rows option, hover states, compact text-sm sizing
- **Status Badges**: Pill shaped, colored backgrounds with opacity (bg-green-500/10), uppercase tracking-wide
- **Metrics Cards**: Large bold numbers, descriptive labels below, trend indicators

### Forms & Inputs
- **Height**: h-10 standard
- **Padding**: px-3 py-2
- **Border radius**: rounded-lg
- **Focus**: ring-2 with yellow/amber accent

### Buttons
- **Primary**: Yellow background, dark text, rounded-lg
- **Secondary**: Transparent with border, hover fills
- **Icon buttons**: p-2, squared or rounded
- **Sizes**: Consistent h-10 for standard, h-9 for compact

## Color Application

**Dark Mode Backgrounds:**
- Body: #09090b (dark-900)
- Cards/Sidebar: #18181b (dark-800) with opacity variants
- Borders: #27272a (dark-700)
- Hover states: #3f3f46 (dark-600)

**Light Mode Backgrounds:**
- Body: #f9fafb (gray-50)
- Cards: #ffffff (white)
- Secondary surfaces: #f3f4f6 (gray-100)
- Borders: #e5e7eb (gray-200)

**Status Colors:**
- Success: Green (#22c55e) - Active states
- Warning: Orange (#f97316) - Paused states
- Error: Red (#ef4444) - Failed states
- Info: Blue (#3b82f6) - Processing
- Purple: (#a855f7) - Special states

## Visual Effects

**Minimal Animations:**
- Transition-colors for hover states (duration-200)
- Smooth sidebar collapse (transition-all)
- Subtle backdrop-blur-md on translucent surfaces
- Glow effect on active indicators: shadow-[0_0_8px_#ffcd38]

**No Distracting Motion:**
- Avoid scroll-triggered animations
- No auto-playing carousels
- Subtle micro-interactions only

## Screen-Specific Layouts

**Missions Bank**: Data table with filters, bulk actions toolbar, import/export functionality
**Mission Control**: Split view - queue panel + details panel, worker status cards, progress tracking
**Settings**: Tabbed sections for Workers, Proxies, Storage, Execution configs

## Icons
- Library: Lucide React exclusively
- Size: w-6 h-6 for navigation, w-4 h-4 for inline elements
- Color: Inherits from parent text color

## Data Density
- Enterprise preference: Information-rich displays
- Compact spacing for tables and lists
- Generous whitespace in cards for breathing room
- Balance density with hierarchy