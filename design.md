# Atlas Art Minerals — Design System

> **CURRENT DIRECTION (2026-11-21, client's choice): "Design Gallery". This block overrides everything below it, including the Lithic Light notes.**
> - **Idea:** a bright, product-first international design store for the trade. Soft grey tiles, bold modern type, a clear catalogue and quick "+ Add" on every piece.
> - **Palette:** bg `oklch(0.975 0.004 80)`, tile `oklch(0.94 0.006 80)`, ink `oklch(0.22 0.01 60)`, mute `oklch(0.52 0.01 60)`, line = ink at 10%. **Copper** `oklch(0.60 0.15 50)` is the single accent (quote badge, "+ Add to list", slideshow progress, active nav underline, step numbers). Primary buttons are ink.
> - **Type:** **Manrope** 600 for headings (tracking −0.035em) and 400–600 for body; **DM Mono** 11px uppercase for small labels and the top bar.
> - **Shape:** 6px radius tiles and buttons, pill chips. Product photos sit on grey tiles (white-background photos are multiplied).
> - **Header:** a black top bar ("Trade only · Private label · Worldwide shipping from Agadir"), then nav on the left, logo in the centre, and **search icon + quote-list icon with copper badge** on the right.
> - **Home:** an intro tile on the left, a **photo slideshow** in the big tile (`assets/js/slides.js`, 8 photos, auto 5s, ←/→/pause), two family tiles, family chips, a 6-wide bestsellers grid, 4 trust tiles, a workshop photo + text tile, 4 step tiles, a private-label ink tile and a contact tile.
> - **Files:** `assets/css/gallery.css` (the only stylesheet). The mockups for every direction tried are in `mockups/` and `mockups2/`. The Lithic Light philosophy remains in `design-concept/`.

> **CURRENT DIRECTION (2026-11-21): "Lithic Light", applied site-wide. This block overrides everything below it.**
> - **Idea:** every section is a plate from an imaginary natural-history book about stone that holds light. It uses plate numbers ("Pl. 01"), figure labels ("fig. 01"), crop marks, millimetre rulers and mono annotations. The philosophy is in `design-concept/lithic-light-philosophy.md`.
> - **Palette:** paper `oklch(0.945 0.018 68)`, paper-2 `oklch(0.92 0.024 68)` behind product photos, ink umber `oklch(0.28 0.035 340)`, mute `oklch(0.52 0.03 330)`, rule = ink at 16% alpha, amber glow `oklch(0.82 0.10 70)` (only inside the specimen drawing), and **flame** `oklch(0.70 0.17 55)`, the single accent for primary buttons, the badge, the active tab and the hero flame.
> - **Type (casual, per the client):** display **Bricolage Grotesque 500** (opsz 48, tracking −0.025em), body **Instrument Sans**, labels **DM Mono** 10–12px uppercase. Italiana was tried and rejected as too formal.
> - **Hero (client's choice, 2026-11-21):** a photo slideshow, `assets/js/slides.js`, replaced the drawn selenite specimen. It shows 8 photos (lit tealights, the workshop, lit product scenes, the artisan at the bench) in a 4:5 plate with crop marks. They crossfade every 5s with a slow zoom and a thin progress line. The caption reads "fig. nn — …" and there are ←/→, counter and Pause controls. It pauses on hover/focus, supports swipe and arrow keys, and doesn't auto-play with reduced motion. Other signature details: a 46-tick year strip (1981–2026), family plates with crop marks, and "fig. nn" counters on product cards.
> - **Header:** logo, four text links, and the **quote list as a clipboard icon** with a flame count badge (hidden at zero).
> - **Files:** a single stylesheet `assets/css/lithic.css`. `site.js` and `products.js` are unchanged in behaviour. The minimal "Index" mockups are kept in `mockups/` for reference.

Direction: **Lit From Within** palette, applied in the minimal **"Index"** layout (client chose it on 2026-11-19 after asking for "minimalist, clean, no huge images"). This file is the source of truth. Every later step reads it before touching the site.

> **Index overrides: these win wherever sections 3–8 below disagree.**
> - **Palette (quieter):** `bg` `oklch(0.97 0.012 70)`, `ink` `oklch(0.27 0.03 340)`, `mute` `oklch(0.50 0.03 330)`, `field` `oklch(0.93 0.02 68)`, `field-2` `oklch(0.905 0.025 68)` (behind white-background photos), `accent` flame `oklch(0.72 0.16 62)`, and `line` = ink at 10% alpha. The flame is used only for the primary button, the link underline, the active tab and small dots.
> - **Type:** Figtree for everything readable. Headlines use Figtree 500 at 32–44px, tracking −0.025em, with no heavy display weights. DM Mono 11–12px uppercase for labels, counts and numbers. Bricolage Grotesque is retired.
> - **Layout:** 1120px max width. Numbered index rows separated by 10% lines, generous white space, two-column hero of text only. No dark bands, no tinted section backgrounds.
> - **Images stay small:** product thumbnails are 64px in rows and square cards in a grid of 6 on desktop. Supporting photos are at most 480px wide at 4:3. **One exception, the client's choice on 2026-11-19:** the home page has a single hero photo of selenite being carved (`assets/photos/workshop-carving.webp`) under the headline. It sits inside the 1120px column (min-height 520–660px), with rounded corners and a mono caption below, and it replaced the range list. The headline, lede and links are set on the photo in light text. A bottom-up umber scrim (`oklch(0.18 0.03 340)` at 88% fading to 0) keeps them readable. If the client sends a workshop video, it goes in the same spot. No other large photos. White-background product photos are shown first, multiplied onto `field-2`.
> - **Signature element:** the **index row**: a mono number, the name, a mono count, three tiny thumbnails and an arrow. It's used for the range on the home page and echoed in the steps, team and FAQ lists. The glow halo and arched frames from the earlier draft are retired.
> - **Components:** text links with a 2px flame underline for secondary actions; the add-to-list control is a text button ("+ Add to list") that becomes a 32px quantity stepper with an "In list" dot.
> - **Motion:** an 8px fade-up on entry only, with nothing looping. Reduced motion is respected.

---

## 1. Brand & thesis

- **Name:** Atlas Art Minerals (logo lockup: "ATLAS ART" over "Minerals", inside a hand-drawn mountain frame).
- **What it is:** an Agadir family workshop (Habbad family, founded 1981) supplying hand-carved selenite and natural stone to the trade.
- **Verified facts (atlasart.net, Nov 2026):** founded 1981 · 7,000+ customers · 50+ companies supplied · 3 offices · 100+ team members · 4 warehouses · MOQ varies by product · customisation available · worldwide shipping, cost by destination and size · workshop/showroom visits by appointment. Use no other numbers without the client's confirmation.
- **Thesis line:** *Moroccan selenite at the source: carved in Agadir, shipped to your shelves.*
- **Lede (two sentences):** For over 30 years we've supplied hand-carved selenite and natural stone to distributors worldwide. Order in bulk, under your own label, straight from the workshop in Agadir.
- **The feeling:** stone lit from inside at dusk. Warm, quiet, tactile. Never mystical, never "crystal healing" kitsch.

## 2. Audience & the one job

- **Primary:** international trade buyers: distributors, home-décor retailers, concept stores, interior and hospitality buyers.
- **Secondary:** individual buyers who find a piece they love.
- **The one job:** get a trade buyer to **order / request trade prices** for selenite pieces.
- **Supporting actions:** request a quote (custom or private label), contact (phone / WhatsApp +212 661 685 382), and sign up for a trade account to see prices.
- Every page has exactly one primary CTA, in the accent colour.

## 3. Palette (OKLCH, named roles)

Taken from the tealight photo: selenite glowing on raw wood, an engraved mauve pot behind, a straw tassel.

| Role | Name | OKLCH | Use |
|---|---|---|---|
| `bg` | Selenite milk | `oklch(0.95 0.022 62)` | Page background. Never pure white. |
| `ink` | Pot umber | `oklch(0.28 0.035 340)` | Text, icons, rules. Never pure black. |
| `accent` | Flame | `oklch(0.74 0.16 62)` | **The only saturated colour.** Primary CTA fills, the one live highlight per view. |
| `on-accent` | Wick | `oklch(0.24 0.04 40)` | Text on flame buttons. |
| `wood` | Raw wood | `oklch(0.80 0.055 72)` | Surfaces, cards, image backdrops, table stripes. |
| `mauve` | Carved mauve | `oklch(0.62 0.04 320)` | Secondary text, captions, metadata, borders. |
| `glow` | Inner glow | `oklch(0.97 0.035 70)` | Lighter halo behind hero images only. |

Rules:
- All neutrals lean warm (hue 40–75) or toward the pot (hue 320–340). No grey at chroma 0.
- Flame is **never** used for body text on `bg`, because the contrast is too low. As text it may only appear at 24px+ and bold, or on `ink`.
- Mauve text on `bg` is for 14px+ only. Check AA contrast before using it smaller.
- One flame element per screen-height. If two things are flame, one of them is wrong.

## 4. Type

- **Display:** Bricolage Grotesque, 700–800, optical size 96, tracking −0.025em, line-height 1.0–1.05.
- **Body:** Figtree, 400/500, line-height 1.55, measure 60–68ch.
- **Utility:** DM Mono, 400/500, uppercase, tracking +0.1em. Used for SKUs, MOQs, dimensions, weights, origin and labels.

Scale (fluid, 1.25 ratio):

| Token | Size |
|---|---|
| `display-xl` | clamp(44px, 7vw, 104px) |
| `display-l` | clamp(34px, 4.5vw, 64px) |
| `h2` | clamp(26px, 3vw, 40px) |
| `h3` | 22px |
| `body-l` | 19px |
| `body` | 17px |
| `small` | 15px |
| `util` | 12px |

Do:
- Let the thesis line be the biggest thing on the page.
- Use DM Mono for every number a buyer needs (MOQ, size, price, lead time). It reads as "spec sheet".
- Set product names in sentence case in Figtree 500.

Don't:
- No serif display face, and no Inter.
- No all-caps display headlines (the current site shouts; we don't).
- No more than three weights on one screen.
- No gradient or outlined text.

## 5. Layout & spacing

- 4px base. Spacing steps: 4, 8, 12, 16, 24, 32, 48, 64, 96, 144.
- Content max-width 1240px; text measure max 68ch.
- Side gutter: 16px on mobile, 24px on tablet, 48px on desktop.
- Layout is asymmetric. Text sits left on a 12-column grid and images bleed right. Products sit on generous wood-tone fields with lots of air, never a dense grid of 5 per row.
- Sections are separated by space and tone shifts (`bg` to `wood` at 30%), not by hairlines.

## 6. Signature element

**The glow halo.** Every selenite product photo sits on a soft radial `glow`-to-`bg` halo placed where the flame would be, so the stone looks lit from within the page itself. It's used once per product image and nowhere else: not on text, buttons or cards. Pill-shaped CTAs (fully rounded) echo the round tealight holders.

## 7. Motion

- **Structural:** sections fade up 12px on entry (240ms, `cubic-bezier(.2,.7,.2,1)`). Product images settle from scale 1.02 to 1.
- **Polish:** the hero halo breathes very slowly (opacity 0.85 ↔ 1 over 6s), like a candle, on the hero only.
- **Restraint rule:** at most one moving thing on screen at a time, and nothing loops except the hero halo. With `prefers-reduced-motion: reduce`, everything is static and the halo is fixed at full opacity.

## 8. Components

- **Primary button:** pill, flame fill, wick text, Figtree 500 16px, 14px × 22px padding. Hover darkens to `oklch(0.68 0.16 58)`. Focus shows a 3px `ink` outline with 3px offset.
- **Secondary button:** pill, 1.5px `ink` border, transparent fill.
- **Product card:** `wood` 30% field, halo image, name (Figtree 500), spec line (DM Mono: size · MOQ · ref), and a "Request price" text link. No stars, no badges stacked on images.
- **Spec table:** DM Mono, rows striped with `wood` at 20%, right-aligned numbers.
- **Trade strip:** one line in DM Mono: `PRIVATE LABEL · BULK PRICING · WORLDWIDE SHIPPING`. Never state a fixed MOQ: it varies by piece.
- **Quote form:** at most four fields (name, company, country, what you need) plus an optional file upload for a reference image.
- **Header:** logo left, 4 links max, one flame CTA right. It's sticky and gets a `bg` fill after scrolling.

## 9. Copy rules

- Plain, specific, trade-literate. Say what it is, its size, the minimum order, and where it ships from.
- Name the material and place: "selenite carved in Agadir", not "premium natural crystals".
- Second person for buyers ("your shelves", "your label").
- Banned: "healing", "energy", "magical", "elevate", "curated", "unleash", "world-class", "powerful ecommerce", exclamation marks, and fake discounts like "30% off".
- Sentence case everywhere except utility labels.
- English first. French is a likely second language, so plan for it.

## 10. Assets plan

| Asset | Look | Source |
|---|---|---|
| Logo | Hand-drawn mountain frame, "ATLAS ART / Minerals". Recolour to `ink`, with a `bg` version for dark fields. | `assets/logo-net.webp`, `assets/logo.png` (from atlasart.net / atlasart.com). An SVG redraw is needed. |
| Hero | Lit selenite tealight trio on raw wood, engraved pot behind, warm dusk light. | `assets/selenite-tealights.webp` (supplied by the client). |
| Product range | Each selenite piece (tealight round, logs, cube, icicle, bookend, bath jar, lamp) shot on the same raw-wood surface in the same warm light, 3:4 crop, with some lit and some unlit. | Pull existing photos from atlasart.net / atlasart.com. Re-shoot or re-grade where the light doesn't match. |
| Material close-up | Macro of the fibrous selenite grain with a backlight. | Shoot in the workshop. |
| Workshop | Hands carving or sanding selenite in Agadir, with dust in daylight. | Shoot in the workshop. This is the proof of "at the source". |
| Packing/shipping | Wrapped pieces in cartons, export pallets. | Shoot in the workshop. Proves trade capacity. |

Image grade: warm white balance, lifted shadows toward umber, never cool or blue. No stock photos and no AI-generated people.

## 11. Conversion essentials

- Flame CTA "Request trade prices" visible in the header and the hero, and repeated at the end of every page.
- WhatsApp / phone link (+212 661 685 382) always one tap away on mobile.
- Show MOQ, lead time and shipping regions near every CTA. Trade buyers decide on these.
- Proof: "30+ years", countries shipped to, private-label examples. Use only real numbers from the client.
- Address: NR 23, Aga Artisania, Lakhyam, Agadir, Morocco.
- Prices stay behind trade sign-up (current behaviour), but the sign-up is one short form.
- Never show "MAD 0.00" or "Out of stock" on a showcase product.

## 12. Anti-patterns

- Cream + serif + terracotta; near-black + acid accent; broadsheet hairlines.
- Gradient text, glassmorphism, neon glows, purple "crystal" mysticism.
- Inter as the body face; pure `#000` / `#fff`.
- Carousels in the hero, auto-playing sliders, and pop-ups on load.
- Dense 5-across product grids with sale badges (the current atlasart.com look).
- More than one saturated colour.

## 13. References

- Client photo: `assets/selenite-tealights.webp`, the palette source.
- Client logo: `assets/logo-net.webp`.
- Current sites (content source, not style source): https://www.atlasart.com, https://www.atlasart.net
- Direction preview: `design-preview.html` (Direction 1).

## 14. Site map & build (v1, 2026-11-19)

Static HTML, no build step. Pages share `assets/css/site.css` and `assets/js/site.js`. The product data is in `assets/js/products.js`: 54 pieces in 5 families, with photos in `assets/products/`.

- `index.html`: hero, proof numbers, the five families, featured pieces, materials, workshop, how ordering works, private label, and a closing CTA.
- `collection.html`: filter by family (URL hash, e.g. `#bowls`), by material, and by search. Each card adds to the quote list, and a quick-view dialog shows more detail.
- `quote.html`: the quote list (quantity and a note per piece) and a buyer form. "Send" opens WhatsApp (+212 661 685 382) or email (info@atlasart.com) with the message pre-written. There is no server; the list is kept in the browser's localStorage.
- `workshop.html`: the family story, the craft, the team, and visits by appointment.
- `trade.html`: how ordering works, what a quote includes, private label, packing and shipping, and the FAQ.

Product photos come in three kinds: studio white (blended into a `field-2` card with a glow behind, using multiply), grey cloth (warmed slightly with sepia), and styled scenes (shown as cover crops). Reshooting everything on raw wood in warm light (section 10) is still the long-term goal.

## Quality floor

Responsive down to 360px, visible focus on every interactive element, `prefers-reduced-motion` respected, AA contrast on all text, and alt text on every product image.
