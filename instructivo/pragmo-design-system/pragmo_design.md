---
name: pragmo-design-system
description: PRAGMO brand colors, typography and visual style, extracted from the live marketing site (pragmo.pe → soporteghelo.github.io/PRGAMO). Use when styling any PRAGMO-branded page, landing site, or admin surface that should match the official PRAGMO identity — dark, futuristic, glassmorphism + neon glow aesthetic.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# PRAGMO Design System

Extracted directly from the production landing page at `https://pragmo.pe/` (which iframes
`https://soporteghelo.github.io/PRGAMO/`) on 2026-07-18. Source: inline Tailwind config +
`<style>` block in that page's `index.html`, plus its compiled CSS bundle.

## Overview

PRAGMO's identity is a **dark, futuristic "tech/industrial" look**: near-black navy backgrounds,
neon cyan/green accents, glass (frosted) cards, soft glow shadows, and animated gradients. It
reads as "digital control room" — appropriate for a company that digitizes industrial/mining
operations.

## When to Use

- Building or restyling a PRAGMO-branded marketing/landing page.
- Any admin or app surface that should visually align with the PRAGMO brand (not necessarily the
  LearnDrive app itself, which has its own theme — ask before applying this globally).
- Choosing accent colors, gradients, card treatments, buttons, or fonts "in the PRAGMO style."

## Color Palette

| Token | Hex | Usage |
|---|---|---|
| `primary` (DEFAULT) | `#00d4ff` | Main accent — cyan. Links, glow, primary buttons, gradient start. |
| `primary-light` | `#38e8ff` | Hover/lighter cyan accent. |
| `primary-dark` | `#0a0f1a` | Also reused as page background (see below). |
| `secondary` (DEFAULT) | `#00ffa3` | Accent green — gradient end, secondary highlights. |
| `secondary-dark` | `#00cc82` | Darker green for hover/contrast. |
| `surface` (DEFAULT) | `#111827` | Card / panel background. |
| `surface-light` | `#1a2332` | Slightly raised surface (nested cards, inputs). |
| `surface-dark` | `#060a12` | Deepest surface (footers, wells). |
| `background` | `#0a0f1a` | Page background — near-black navy. |
| `subtle` | `#94a3b8` | Muted/secondary text (slate gray-blue). |
| `glow-cyan` | `#00d4ff` | Glow/shadow color. |
| `glow-green` | `#00ffa3` | Glow/shadow color. |
| `glow-blue` | `#3b82f6` | Tertiary glow accent. |
| body text | `#e2e8f0` | Default text color on dark background. |

Rule of thumb: **background is always near-black navy** (`#0a0f1a` / `#111827` / `#060a12`), **text
is light slate** (`#e2e8f0`, muted `#94a3b8`), and **cyan→green is the only accent range** — avoid
introducing unrelated hues (red, orange, purple) except for semantic states (errors/warnings).

## Typography

- **Body font:** `Inter` (weights 400–900) — loaded from Google Fonts.
- **Display/heading font:** `Space Grotesk` (weights 400–700) — used for headlines, numbers, logo-type.
- Load via:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
  ```
- Tailwind mapping: `fontFamily.sans = ['Inter', 'sans-serif']`, `fontFamily.display = ['Space Grotesk', 'sans-serif']`.

## Tailwind Config (drop-in)

```js
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#00d4ff', light: '#38e8ff', dark: '#0a0f1a' },
        secondary: { DEFAULT: '#00ffa3', dark: '#00cc82' },
        surface: { DEFAULT: '#111827', light: '#1a2332', dark: '#060a12' },
        background: '#0a0f1a',
        subtle: '#94a3b8',
        glow: { cyan: '#00d4ff', green: '#00ffa3', blue: '#3b82f6' },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(0,212,255,0.3)',
        'glow-lg': '0 0 40px rgba(0,212,255,0.4), 0 0 80px rgba(0,212,255,0.1)',
        'glow-green': '0 0 20px rgba(0,255,163,0.3)',
      },
    },
  },
}
```

## Signature Style Patterns

**Glass card** — frosted, translucent panels over the dark background:
```css
.glass-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.glass-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(0, 212, 255, 0.3);
}
```

**Gradient text** — cyan → green animated headline treatment:
```css
.gradient-text {
  background: linear-gradient(135deg, #00d4ff 0%, #00ffa3 50%, #00d4ff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  background-size: 200% 200%;
  animation: gradient-shift 8s ease infinite;
}
```

**Glow border** — used on hero elements / active cards:
```css
.glow-border {
  box-shadow: 0 0 20px rgba(0, 212, 255, 0.3), inset 0 0 20px rgba(0, 212, 255, 0.05);
}
```

**Grid background** — subtle dotted grid over the dark canvas:
```css
.grid-bg {
  background-image: radial-gradient(circle at 1px 1px, rgba(0, 212, 255, 0.08) 1px, transparent 0);
  background-size: 40px 40px;
}
```

**Neon divider line:**
```css
.neon-line {
  height: 2px;
  background: linear-gradient(90deg, transparent, #00d4ff, transparent);
}
```

**Phone mockup frame** (used to showcase the app inside the marketing site):
```css
.phone-mockup {
  background: #1a1a2e;
  border-radius: 2rem;
  padding: 0.4rem;
  box-shadow: 0 0 30px rgba(0,212,255,0.3), 0 0 60px rgba(0,212,255,0.1), inset 0 0 0 1px rgba(0,212,255,0.2);
}
.phone-screen { background: #000; aspect-ratio: 9/19.5; border-radius: 1.6rem; overflow: hidden; }
```

## Motion

- `scroll-behavior: smooth` on `<html>`.
- Sections fade+slide in on scroll: start at `opacity:0; transform: translateY(1.25rem)`, transition
  to `opacity:1; transform: translateY(0)` over `0.6s ease-out` when an `is-visible` class is added
  (typically via IntersectionObserver).
- `glow-pulse` (2s alternate) on hero CTAs/badges — animates box-shadow spread.
- `float` (3s ease-in-out infinite) — subtle up/down drift on floating icons/badges.
- `spin-slow` (20s linear) / `spin-reverse` (15s linear) — slow-rotating decorative rings.
- Keep durations slow and easing soft (`ease-out`/`ease-in-out`); this brand does not use snappy/bouncy motion.

## Applying This Elsewhere

1. Set page background to `#0a0f1a` (or `surface` `#111827` for panels), text to `#e2e8f0`.
2. Use `Space Grotesk` for headings/numbers, `Inter` for body copy.
3. Reserve cyan `#00d4ff` → green `#00ffa3` gradient for emphasis (headlines, primary CTA, active states) — don't overuse it on body text.
4. Wrap content blocks in `.glass-card` rather than solid opaque cards.
5. Add `shadow-glow` / `.glow-border` sparingly, on the single most important element per view (hero CTA, active card) — glow is a spotlight, not decoration for every card.
6. Don't mix in unrelated accent hues; if a semantic color is needed (error/warning/success), keep it desaturated enough to not compete with the cyan/green brand accents.
