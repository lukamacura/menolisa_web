# MenoLisa Performance Optimization – Baseline

**Date:** 2025-01-24  
**Branch:** `performance-optimization` (create manually if `git checkout -b` fails)

## 1. Baseline Build

- **Command:** `npm run build`
- **Result:** ✓ Success (Next.js 16.1.3, Turbopack)
- **Compile time:** ~6s; static pages: ~206ms

## 2. Image Audit (Phase 1 Prep)

| Location | Source | Role | Current | Phase 1 Actions |
|----------|--------|------|---------|-----------------|
| **Navbar** | `/lisa_profile.webp` | Logo (above-fold) | `fill`, sizes | `priority`, `quality={60}`, `placeholder="blur"`, `blurDataURL`, explicit container |
| **LandingFooter** | `/lisa_profile.webp` | Logo (below-fold) | `fill`, sizes=32px | `loading="lazy"`, `quality={60}` |
| **LandingHero** | Video only (test2.webm) | Hero media | preload=metadata | Phase 2 |
| **Hero.tsx** | `/hero1.svg` | (unused on /) | priority, eager | `sizes`; keep as-is if ever used |
| **MenopauseResetHero** | `/services.svg` | (unused on /) | width/height | `loading="lazy"` if used |
| **chat/lisa** | Markdown `img` | RAG/user images | via `...rest` | `loading="lazy"`, `sizes` |

## 3. Video Audit (Phase 2 Prep)

| Location | File | Current | Phase 2 Actions |
|----------|------|---------|-----------------|
| **LandingHero** | `/test2.webm` | autoPlay, loop, muted, preload=metadata | preload=none on mobile, poster, conditional load |
| **QuestionStorm** | `/test2.webm` | in `<video>` | same |
| **chat/lisa** | `/test2.webm` | background video | same |

## 4. next.config.ts (Existing)

- `images.formats`: `['image/avif', 'image/webp']` ✓  
- `images.deviceSizes`, `imageSizes` ✓  
- `compress: true` ✓  
- `optimizePackageImports`: framer-motion, lucide-react, @supabase/supabase-js ✓  

## 5. Fonts (Layout)

- `next/font` (local + Google): satoshi, Dancing_Script, Poppins, Lora  
- `display: "swap"` ✓  

## 6. Branch Note

`git checkout -b performance-optimization` failed with “Permission denied” on `.git/refs/heads/...`. Create the branch manually if needed.
