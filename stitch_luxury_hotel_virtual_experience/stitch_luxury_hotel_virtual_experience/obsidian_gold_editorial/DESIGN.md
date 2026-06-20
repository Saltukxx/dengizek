---
name: Obsidian & Gold Editorial
colors:
  surface: '#121315'
  surface-dim: '#121315'
  surface-bright: '#38393a'
  surface-container-lowest: '#0d0e0f'
  surface-container-low: '#1b1c1d'
  surface-container: '#1f2021'
  surface-container-high: '#292a2b'
  surface-container-highest: '#343536'
  on-surface: '#e3e2e3'
  on-surface-variant: '#d0c5af'
  inverse-surface: '#e3e2e3'
  inverse-on-surface: '#303032'
  outline: '#99907c'
  outline-variant: '#4d4635'
  surface-tint: '#e9c349'
  primary: '#f2ca50'
  on-primary: '#3c2f00'
  primary-container: '#d4af37'
  on-primary-container: '#554300'
  inverse-primary: '#735c00'
  secondary: '#cac6be'
  on-secondary: '#32302b'
  secondary-container: '#494741'
  on-secondary-container: '#b9b5ad'
  tertiary: '#ceced1'
  on-tertiary: '#2f3133'
  tertiary-container: '#b2b3b5'
  on-tertiary-container: '#444547'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffe088'
  primary-fixed-dim: '#e9c349'
  on-primary-fixed: '#241a00'
  on-primary-fixed-variant: '#574500'
  secondary-fixed: '#e7e2da'
  secondary-fixed-dim: '#cac6be'
  on-secondary-fixed: '#1d1c17'
  on-secondary-fixed-variant: '#494741'
  tertiary-fixed: '#e2e2e5'
  tertiary-fixed-dim: '#c6c6c9'
  on-tertiary-fixed: '#1a1c1e'
  on-tertiary-fixed-variant: '#454749'
  background: '#121315'
  on-background: '#e3e2e3'
  surface-variant: '#343536'
typography:
  display-xl:
    fontFamily: Noto Serif
    fontSize: 80px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg:
    fontFamily: Noto Serif
    fontSize: 64px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Noto Serif
    fontSize: 32px
    fontWeight: '400'
    lineHeight: '1.2'
    letterSpacing: 0em
  headline-sm:
    fontFamily: Noto Serif
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
    letterSpacing: 0.02em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '300'
    lineHeight: '1.6'
    letterSpacing: 0.01em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '300'
    lineHeight: '1.6'
    letterSpacing: 0.01em
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.15em
spacing:
  unit: 8px
  gutter: 24px
  margin: 64px
  section-gap: 160px
  container-max: 1440px
---

## Brand & Style

This design system is anchored in the concept of "The Luxury of Space." It merges the high-contrast, rhythmic layouts of avant-garde fashion journalism with the silent, attentive service of five-star hospitality. The brand personality is authoritative yet understated, appealing to a discerning clientele that values curation over volume.

The visual direction follows an **Editorial Minimalism** style. It prioritizes extreme white space to signify exclusivity—mimicking the expensive "dead space" of a printed luxury broadsheet. Elements are grounded in a rigid grid, yet softened by organic grain textures and fluid motion, creating a digital experience that feels bespoke, tactile, and permanent.

## Colors

The palette uses a high-contrast foundation to evoke nighttime sophistication and private-lounge exclusivity. 

- **Deepest Obsidian (#08090A):** The primary canvas. It provides a void-like depth that allows imagery and gold accents to luminescence.
- **Champagne Gold (#D4AF37):** Used sparingly for interactive highlights, key iconography, and delicate borders. It represents the "golden thread" of service.
- **Muted Sand (#E5E0D8):** The primary typographic color for body text. It is softer on the eyes than pure white, providing a parchment-like quality.
- **Charcoal Slate (#1A1C1E):** Used for subtle UI layering, card backgrounds, and secondary surfaces to create depth without breaking the dark-mode immersion.

## Typography

The typographic scale relies on a dramatic contrast between the timeless Noto Serif and the utilitarian Inter. 

Headlines should be treated as hero elements. Use `display-xl` for editorial splash pages, allowing text to overlap images slightly to create a layered, magazine feel. Body copy utilizes Inter with light weights (300) to maintain an airy, modern aesthetic. `label-caps` are reserved for navigation, breadcrumbs, and eyebrow headers, using wide letter spacing to denote prestige.

## Layout & Spacing

This design system employs a **Fixed Grid** model for desktop and a fluid model for mobile. The layout is built on a 12-column grid with generous 64px outer margins to "frame" the content like a work of art.

Whitespace is the primary driver of hierarchy. Section gaps are intentionally oversized (160px+) to allow the user to pause and digest one curated offer at a time. Layouts should utilize asymmetrical compositions, where imagery occupies specific grid spans (e.g., columns 1-7) and text floats in the remaining space (e.g., columns 9-12), creating a sophisticated, non-linear flow.

## Elevation & Depth

Hierarchy is achieved through **Low-contrast Outlines** and tonal layering rather than shadows. 

- **The Layering Logic:** Surfaces move from Obsidian (base) to Charcoal Slate (elevated). 
- **Ultra-thin Borders:** Use 0.5px borders in Champagne Gold (at 30% opacity) or Charcoal Slate to define sections. These lines should feel like "hairlines" in print design.
- **Grain & Texture:** A global, low-opacity noise overlay (subtle grain) is applied to the background to eliminate the flat "digital" look and add a filmic quality.
- **Parallax:** Scrolling should trigger soft, independent movement of image layers versus text layers, giving a sense of physical depth and "parallax-ready" immersion.

## Shapes

The shape language is **Sharp (0)**. 

To maintain the architectural and high-fashion aesthetic, all buttons, image containers, and input fields utilize 90-degree corners. This sharpness conveys precision, discipline, and a modern edge. Avoid any rounded corners, as they soften the professional and exclusive tone of the system.

## Components

- **Buttons:** Rectangular with 0.5px borders. Default state is ghost-style (no fill). Hover state involves a slow, elegant color fill of Champagne Gold with text transitioning to Obsidian. No shadows are permitted.
- **Inputs:** Minimalist bottom-border only (0.5px). Labels use the `label-caps` style and sit above the line. Focus state transitions the border color to full-opacity Champagne Gold.
- **Cards:** Defined by their content and whitespace rather than containers. If a container is necessary, use the Charcoal Slate background with no border. Images within cards should have a subtle zoom-on-hover effect.
- **Chips/Tags:** Small, all-caps text with a vertical separator line or a simple 0.5px border box.
- **Navigation:** A hidden "hamburger" or "concierge" menu to keep the main interface clean. The navigation trigger is a simple text label "MENU" in `label-caps`.
- **Editorial Pull-Quotes:** Large Serif text centered in the layout, flanked by thin horizontal Gold lines to break up long-form property descriptions.