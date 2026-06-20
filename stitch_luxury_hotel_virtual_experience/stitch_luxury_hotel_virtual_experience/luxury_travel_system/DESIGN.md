---
name: Luxury Travel System
colors:
  surface: '#121414'
  surface-dim: '#121414'
  surface-bright: '#38393a'
  surface-container-lowest: '#0c0f0f'
  surface-container-low: '#1a1c1c'
  surface-container: '#1e2020'
  surface-container-high: '#282a2b'
  surface-container-highest: '#333535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#d0c5b2'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#2f3131'
  outline: '#99907e'
  outline-variant: '#4d4637'
  surface-tint: '#e6c364'
  primary: '#e6c364'
  on-primary: '#3d2e00'
  primary-container: '#c9a84c'
  on-primary-container: '#503d00'
  inverse-primary: '#755b00'
  secondary: '#bac8dc'
  on-secondary: '#243141'
  secondary-container: '#3a4859'
  on-secondary-container: '#a8b6ca'
  tertiary: '#b9c8dd'
  on-tertiary: '#233242'
  tertiary-container: '#9dadc1'
  on-tertiary-container: '#324152'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffe08f'
  primary-fixed-dim: '#e6c364'
  on-primary-fixed: '#241a00'
  on-primary-fixed-variant: '#584400'
  secondary-fixed: '#d6e4f9'
  secondary-fixed-dim: '#bac8dc'
  on-secondary-fixed: '#0f1c2c'
  on-secondary-fixed-variant: '#3a4859'
  tertiary-fixed: '#d4e4f9'
  tertiary-fixed-dim: '#b8c8dd'
  on-tertiary-fixed: '#0d1d2c'
  on-tertiary-fixed-variant: '#394859'
  background: '#121414'
  on-background: '#e2e2e2'
  surface-variant: '#333535'
typography:
  display-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 64px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  xs: 0.5rem
  sm: 1rem
  md: 1.5rem
  lg: 2.5rem
  xl: 4rem
  container-max: 1280px
  gutter: 2rem
---

## Brand & Style

The design system is anchored in the concept of "Nocturnal Elegance," mimicking the atmosphere of a secluded five-star resort at twilight. It targets a high-net-worth audience seeking exclusivity, discretion, and effortless curation. 

The aesthetic combines **Glassmorphism** with **Minimalism**. It relies on the interplay of deep, dark surfaces and hyper-refined gold accents to create a sense of prestige. Every interaction is designed to feel deliberate and calm, avoiding loud transitions in favor of "shimmer" states and soft pulses that suggest the flickering of a candle or moonlight on water.

## Colors

The palette for the design system is strictly nocturnal and high-contrast. 

- **Base (#0D1B2A):** The infinite background. Used for the lowest layer of the UI.
- **Surface (#1E2D3D):** The container color. Used for cards and elevated sections, often applied with 80-90% opacity.
- **Gold Accent (#C9A84C):** Reserved for moments of high importance—CTAs, active states, and premium badges. 
- **Primary White (#F5F5F5):** An off-white used for high-readability text and primary icons, avoiding the harshness of pure white.
- **Muted Slate (#8A9BB0):** Used for secondary information, borders, and metadata to maintain the calm, low-energy vibe.

## Typography

The design system utilizes **Plus Jakarta Sans** to bridge the gap between technical precision and editorial warmth. 

Headlines use tighter letter spacing and heavier weights to command attention, while body copy is set with generous line heights to ensure a relaxed reading experience. Label styles utilize uppercase tracking to create a "wayfinding" feel similar to luxury boutique signage. All typography should be rendered with high-quality anti-aliasing to maintain the premium feel on high-density displays.

## Layout & Spacing

The layout philosophy follows a **Fixed Grid** model to ensure a curated, "framed" look for high-end photography. 

- **Grid:** A 12-column grid with a 1280px max-width container. 
- **Rhythm:** An 8px linear scale is used for structural spacing, while 4px increments are used for internal component padding.
- **Whitespace:** Emphasize "macro-spacing" between sections (using `xl` units) to allow the editorial content to breathe. No element should feel crowded; white space is treated as a luxury commodity in this design system.

## Elevation & Depth

The design system avoids traditional drop shadows in favor of **Glassmorphism** and **Backdrop Blurs**. 

1.  **Layers:** Depth is created by stacking semi-transparent `#1E2D3D` surfaces. 
2.  **Backdrop Blur:** Use a consistent `20px` to `40px` blur on all container backgrounds to create the "frosted glass" effect.
3.  **Borders:** Every elevated element must have a `1px` solid border using `#8A9BB0` at 20% opacity. This "whisper-thin" line defines the shape without breaking the visual flow.
4.  **Z-Index Shimmers:** Active or hovered elements receive a subtle gold linear-gradient shimmer that moves across the surface at a 45-degree angle.

## Shapes

The design system uses **Soft (Level 1)** roundedness. 

A `4px` base radius (`0.25rem`) is applied to buttons and inputs to maintain a sharp, architectural look that feels engineered rather than playful. Larger containers like cards may use `rounded-lg` (`8px`) to subtly soften the composition. Circles are reserved exclusively for avatars and icon containers to provide a counterpoint to the rectangular grid.

## Components

- **Buttons:** Primary buttons are solid Gold (`#C9A84C`) with Navy (`#0D1B2A`) text. On hover, they should trigger a "pulse" animation where a secondary gold glow expands slightly from the center.
- **Glass Cards:** Used for property listings. Background is `#1E2D3D` at 60% opacity with a `back-drop-filter: blur(12px)`.
- **Inputs:** Underlined or fully enclosed glass fields with `1px` borders. The cursor and focus state should always be Gold.
- **Luxury Badges:** Small, pill-shaped tags with a Gold border and Gold text, used for "Verified" or "Exclusive" tags.
- **The Shimmer:** A global micro-animation applied to gold elements on load or hover, utilizing a CSS keyframe animation that translates a white highlight across the gold surface to simulate light hitting a precious metal.
- **Lists:** Clean, border-bottom separated rows using the Slate color at 10% opacity, ensuring the background photography remains visible through the UI.