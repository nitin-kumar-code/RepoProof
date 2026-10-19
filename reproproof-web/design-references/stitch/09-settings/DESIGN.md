---
name: ReproProof Blueprint
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434655'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#0058be'
  on-secondary: '#ffffff'
  secondary-container: '#2170e4'
  on-secondary-container: '#fefcff'
  tertiary: '#4e565d'
  on-tertiary: '#ffffff'
  tertiary-container: '#676e76'
  on-tertiary-container: '#eaf1fa'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#dce3ec'
  tertiary-fixed-dim: '#c0c7d0'
  on-tertiary-fixed: '#151c23'
  on-tertiary-fixed-variant: '#40484f'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: '700'
    lineHeight: 2.5rem
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '700'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1rem
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: 0em
  label-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.02em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: 0em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1rem
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
The brand personality centers on absolute precision, reproducibility, diagnostic rigor, and engineering trust. Designed specifically for developer diagnostics, QA automation pipelines, and mission-critical enterprise telemetry, the interface communicates structural reliability through crisp organization and high legibility.

The aesthetic follows modern technical minimalism: bright, high-contrast canvas structures, disciplined line architecture, and an absence of ornamental visual noise. Information hierarchy takes precedence over decorative styling. The visual environment feels deliberate, clinical, and calm under high incident loads, instilling confidence during root-cause analysis and release verification.

## Colors
The color architecture operates on a high-clarity light mode default, utilizing clinical slate neutrals and vivid chromatic markers to distinguish system states immediately.

### Core Canvas & Structure
- **Main App Background**: `#F8FAFC` (Canvas background)
- **Sidebar & Card Background**: `#FFFFFF` (Elevated modules, controls, containers)
- **Subtle Section / Hover**: `#F1F5F9` (Row states, inset panels, code blocks)
- **Borders & Dividers**: `#E2E8F0` (Structural rules, table cell divisions)

### Interactive Blues
- **Primary Blue**: `#2563EB` (Primary actions, brand anchors, active focus rings)
- **Primary Blue Hover**: `#1D4ED8` (Button hover, active interactive click)
- **Secondary Blue**: `#3B82F6` (Badges, interactive icons, active tab underlines)
- **Light Blue Background / Accent**: `#EFF6FF` (Subtle selection washes, highlights)
- **Selected Nav Background**: `#DBEAFE` (Persistent active states in navigation)

### Typography Neutrals
- **Primary Text & Headings**: `#0F172A` (900–600 weight text, terminal headers)
- **Secondary Text**: `#475569` (Body text, subheadings, key metadata)
- **Muted Text**: `#64748B` (Timestamps, empty states, disabled indicators)

### Status & Diagnostic Tokens
- **Reproduced / Success**: Text `#15803D`, Surface `#DCFCE7`, Border `#86EFAC`
- **Not Reproduced / Neutral**: Text `#475569`, Surface `#F1F5F9`, Border `#CBD5E1`
- **Inconclusive / Warning**: Text `#B45309`, Surface `#FEF3C7`, Border `#FDE68A`
- **Failed / Destructive / Error**: Text `#B91C1C`, Surface `#FEE2E2`, Border `#FCA5A5`
- **Running / Info**: Text `#1D4ED8`, Surface `#DBEAFE`, Border `#93C5FD`

## Typography
The typography pairing balances human factor legibility with developer ergonomics:
- **Inter** handles all narrative hierarchy, controls, table content, and headings. It renders with crisp kerning and optimal vertical metrics across varying pixel densities.
- **JetBrains Mono** is reserved strictly for operational parameters: commit hashes, stack traces, raw test output, payload previews, and key-value telemetry data.

Headings (`headline-xl` through `headline-sm`) utilize tighter tracking (`-0.025em` to `-0.01em`) and deep navy `#0F172A` coloring to maintain a strong typographic anchor. Body and label roles preserve standard geometric metrics for rapid scanning.

## Layout & Spacing
The layout leverages a disciplined 8pt grid logic paired with a 12-column fluid grid system.

### Responsive Breakpoints & Margin Rules
- **Desktop (≥ 1280px)**: Collapsible fixed-width sidebar (240px default, 64px collapsed) with fluid application canvas. Canvas uses `margin-desktop` (2rem) and `gutter-desktop` (1.5rem).
- **Tablet (768px – 1279px)**: Floating overlay sidebar or compacted icon rail. Canvas margins compress to `gutter` (1rem). Grid collapses to 6 columns.
- **Mobile (< 768px)**: Single column flow. Canvas margin conforms to `margin` (1rem). Navigation moves to an off-canvas drawer with top header integration.

Data tables, code panels, and diff comparisons remain horizontal-scroll containers to prevent truncation of log lines and multi-column test runs.

## Elevation & Depth
Depth is created primarily through surface borders combined with subtle, low-blur ambient shadows (`shadow-sm`) to ensure that contrast remains high and interfaces do not appear muddy.

### Elevation Levels
- **Level 0 (Flat Canvas)**: Background `#F8FAFC`, no shadow, no border.
- **Level 1 (Cards, Tables, Panels)**: Background `#FFFFFF`, border `1px solid #E2E8F0`, shadow `0 1px 2px 0 rgba(15, 23, 42, 0.05)`.
- **Level 2 (Popovers, Dropdowns, Flyouts)**: Background `#FFFFFF`, border `1px solid #CBD5E1`, shadow `0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.06)`.
- **Level 3 (Modals, Slide-over Diagnostic Drawers)**: Background `#FFFFFF`, border `1px solid #CBD5E1`, shadow `0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.08)`. Overlay scrim uses `#0F172A` at 40% opacity.

## Shapes
The design system enforces a disciplined geometric structure with compact corner radii. This preserves maximum information density while avoiding aggressive sharp edges:
- Standard interactive elements (buttons, inputs, status pills, table headers) use `0.375rem` (rounded-md).
- Large modular containers, modals, and primary diagnostic cards use `0.5rem` (rounded-lg).
- Fully circular roundedness (`9999px`) is strictly limited to avatar badges, presence pips, and standalone circular action triggers.

## Components

### Buttons
- **Primary**: Background `#2563EB`, text `#FFFFFF`, border `none`, radius `0.375rem`. Hover `#1D4ED8`. Active `#1E40AF`. Focus visible uses a `2px` offset ring in `#2563EB`.
- **Secondary / Outline**: Background `#FFFFFF`, text `#0F172A`, border `1px solid #E2E8F0`, radius `0.375rem`. Hover `#F8FAFC` with border `#CBD5E1`.
- **Tertiary / Ghost**: Background transparent, text `#475569`. Hover background `#F1F5F9`, text `#0F172A`.
- **Destructive**: Background `#B91C1C`, text `#FFFFFF`. Hover `#991B1B`.

### Status Badges & Chips
Composed with an inner layout of `4px` padding vertical, `8px` horizontal, using `label-sm` or `code-sm`:
- **Reproduced**: Background `#DCFCE7`, border `1px solid #86EFAC`, text `#15803D`.
- **Failed**: Background `#FEE2E2`, border `1px solid #FCA5A5`, text `#B91C1C`.
- **Running**: Background `#DBEAFE`, border `1px solid #93C5FD`, text `#1D4ED8`.
- **Inconclusive**: Background `#FEF3C7`, border `1px solid #FDE68A`, text `#B45309`.
- **Not Reproduced**: Background `#F1F5F9`, border `1px solid #CBD5E1`, text `#475569`.

### Data Cards & Trace Containers
- Surface `#FFFFFF`, border `1px solid #E2E8F0`, radius `0.5rem`, ambient shadow `0 1px 2px 0 rgba(15, 23, 42, 0.05)`.
- Internal card headers use a subtle lower border `1px solid #E2E8F0` and padding `1rem`. Inset trace blocks employ background `#F1F5F9` with monospaced typography and horizontal scrolling.

### Inputs & Selectors
- Default: Height `36px`, background `#FFFFFF`, border `1px solid #CBD5E1`, radius `0.375rem`, text `#0F172A`, placeholder `#64748B`.
- Focus state: Border `#2563EB`, box-shadow `0 0 0 1px #2563EB`.
- Error state: Border `#B91C1C`, focus ring `#B91C1C`.

### Checkboxes & Radios
- Box dimensions `16px × 16px`, radius `0.25rem` (checkbox) or `9999px` (radio).
- Unchecked: Border `1px solid #CBD5E1`, background `#FFFFFF`.
- Checked: Border `#2563EB`, background `#2563EB`, inner check/pip `#FFFFFF`.

### Log Viewers & Step List
- Clean alternating rows utilizing `#FFFFFF` and `#F8FAFC`. Active log line highlight uses `#EFF6FF` with a left border indicator `3px solid #2563EB`.