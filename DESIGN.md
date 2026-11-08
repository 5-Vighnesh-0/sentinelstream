---
name: SentinelStream
description: A live intrusion-detection console read like a warning bulletin, inked on paper. The level leads, a High is stamped in vermilion, and an alert visibly expires once its 30 s window closes.
colors:
  page: "#f7f7f5"
  surface: "#ffffff"
  sunk: "#eeeeec"
  ink: "#141414"
  muted: "#575757"
  hairline: "#d6d6d4"
  frame: "#e4e4e1"
  edge: "#8c8c8c"
  accent: "#141414"
  accent-tint: "#ececea"
  band: "#1a1a1a"
  band-text: "#e8e8e6"
  band-muted: "#a3a3a0"
  sev-high: "#c0311a"
  sev-high-tint: "#fbe9e6"
  sev-high-ink: "#8f2412"
  sev-medium: "#3d3d3d"
  sev-medium-tint: "#e2e2e0"
  sev-medium-ink: "#262626"
  sev-low: "#707070"
  sev-low-tint: "#f1f1ef"
  sev-low-ink: "#3a3a3a"
  live: "#1f1f1f"
  live-tint: "#ececea"
  stale: "#5c5c5c"
  stale-tint: "#f2f2f0"
  row: "#ececea"
  changed: "#e0e0dc"
typography:
  wordmark:
    fontFamily: "Montserrat Variable, Public Sans Variable, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 800
    letterSpacing: "0.06em"
  band-count:
    fontFamily: "Montserrat Variable, Public Sans Variable, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 800
    lineHeight: 1
  band-heading:
    fontFamily: "Montserrat Variable, Public Sans Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    letterSpacing: "0.18em"
  band-label:
    fontFamily: "Public Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.16em"
  title:
    fontFamily: "Public Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.556
  body:
    fontFamily: "Public Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.429
    fontFeature: "\"tnum\""
  label:
    fontFamily: "Public Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.333
  data:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  ink: "2px"
  sm: "2px"
  md: "2px"
  lg: "3px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  masthead:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "12px 24px"
  band:
    backgroundColor: "{colors.band}"
    textColor: "{colors.band-text}"
    padding: "24px 24px 36px"
  band-flooded:
    backgroundColor: "{colors.sev-high}"
    textColor: "{colors.surface}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.ink}"
    padding: "16px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.ink}"
    padding: "8px 12px"
  button-primary-disabled:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.muted}"
  button-quiet:
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "36px"
  button-quiet-hover:
    backgroundColor: "{colors.accent-tint}"
  button-toggle-pressed:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "36px"
  tab-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "36px"
  level-chip-high-active:
    backgroundColor: "{colors.sev-high}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  level-chip-medium-tint:
    backgroundColor: "{colors.sev-medium-tint}"
    textColor: "{colors.sev-medium-ink}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  level-chip-low-tint:
    backgroundColor: "{colors.sev-low-tint}"
    textColor: "{colors.sev-low-ink}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  level-chip-expired:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  status-pill-live:
    backgroundColor: "{colors.live-tint}"
    textColor: "{colors.live}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  status-pill-stale:
    backgroundColor: "{colors.stale-tint}"
    textColor: "{colors.stale}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  status-pill-offline:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
---

# Design System: SentinelStream

## Overview

**Creative North Star: "The Warning Bulletin, inked on paper"**

Every alert reads as a bulletin in effect. Its level comes first, as a word plus an icon, and it visibly lapses when the backend's 30 s aggregation window after its last activity closes. The console is an ink painting: warm white paper, black ink type, grey washes and hairlines. Vermilion is the seal, the only colour on the page, and it is kept for High alone. When nothing is wrong the screen is black and white, and a red mark always means a High.

The top of the page is a clean white masthead strip (wordmark, view tabs, connection status). Under it sits the ink band, a full-bleed charcoal wash where the in-effect counts are the headline, set huge in a display face. While a High is in effect the seal floods across the band from the left. Below the band is a 2:1 grid with the alert table on the left and a stack of evidence panels on the right. State is carried by form as well as tone. A solid chip means in effect and an outline chip means expired, a draining rail counts down the window, and a row whose count grew stays lit until someone looks at it. Every number in the data is mono, and every score names the detector that produced it. A fact about the capture (demo mode on loopback) is set as the band's caption, below the counts, in the band's quiet text; the selected view tab is inked and unselected tabs are muted text that turn ink on a sunk hover.

Brushwork is visible but rare, and never on data. It lives in two places: the ink band (grain and torn edge) and the Alerts panel, whose frame is a 2.5px ink stroke drawn on a separate layer run through an SVG displacement filter, so its edge looks inked while the table stays crisp. Every other panel has a plain frame (`frame`, lighter than a hairline), and headings carry no strokes. Light only. Public Sans, JetBrains Mono and Montserrat are self-hosted, icons are lucide-react, motion is GSAP, and nothing loads from outside (strict CSP; the textures are inline SVG filters).

**Key Characteristics:**
- Warm paper page, white panels in hairline frames (the Alerts panel alone in a brushed ink frame), ink text, no shadows.
- Black and white. Pressables are inked. Vermilion is the seal, reserved for High.
- Severity by word, icon shape and form: a High is solid vermilion, a Medium is a grey wash, a Low is an ink outline.
- A charcoal ink band under a white masthead carries the counts in Montserrat 800 and floods vermilion while a High is in effect.
- Motion reports change: the flood, rows sliding into place, rails draining, counts ticking in. All of it respects reduced motion.

## Colors

Achromatic warm greys from paper to ink, plus one vermilion seal and its tint and ink.

### Primary
- **Ink** (`accent`, the same value as `ink`): pressables are inked. It fills the selected view tab, the pressed state of the Needs attention and Show muted toggles, and the plain fill of the primary buttons (Analyse, Save, Acknowledge). It also sets the text of quiet buttons (Clear filters, Export, Cancel, Choose file, Mute), the 2px focus outline, the caret and native accent-color. **Ink Tint** (`accent-tint`) is the hover ground for quiet buttons, the upload panel's ground while a file is dragged over it, and the text selection colour.

### Secondary (the seal)
- **Vermilion Seal** (`sev-high`): an in-effect High chip, the High icon in an expired chip, the High rail, and the flood layer of the ink band while a High is in effect. **Seal Tint / Seal Ink** (`sev-high-tint`, `sev-high-ink`) pair for tinted High chips (history). Seal Ink also sets error text and failed upload status.

### Neutral
- **Paper** (`page`): the page, the "Expired" divider row, and the fill of the torn edge where the band meets the paper.
- **White Panel** (`surface`): the masthead, panels, inputs, outline chips.
- **Sunk Wash** (`sunk`): detail well, hover ground for neutral icon buttons and Choose file, offline pill and banner, disabled primary fill.
- **Ink** (`ink`): text, the Alerts panel's brushed frame, the Choose file button's border, both chart series, bar labels.
- **Ash** (`muted`): secondary text, expired-row text, axis ticks.
- **Frame** (`frame`, #e4e4e1, 1.28:1 on white): panel frames only, a whisper so the page reads as panels, not a grid of boxes.
- **Hairline** (`hairline`): masthead rule, the table header rule, the traffic chart grid, outline chips, rail track.
- **Edge** (`edge`): borders on inputs and selects, rings on quiet bordered buttons, scrollbars, the frozen rail (3.3:1 on white).
- **Charcoal Band** (`band`), **Band Text** (`band-text`), **Band Ash** (`band-muted`): the ink band's ground, its text, and its quiet text (empty counts, the expired note). When the band floods, quiet text turns white, because grey on vermilion falls below 4.5:1.
- **Severity washes**: Medium is a grey wash with a 1px inset `sev-medium` ring, so it holds its edge against the white panel (`sev-medium-tint` with `sev-medium-ink`; `sev-medium` for its icon and rail). Low is an ink outline on white (a 1px inset ink ring; `sev-low` for its icon and rail, `sev-low-tint` kept with `sev-low-ink`). The "no model loaded" banner uses the Medium pair.
- **Connection status**: Live (`live` on `live-tint`) with its pulsing dot, Stale (`stale` on `stale-tint`) for the stale pill and a stopped chart's label. Both are greys: the pill says its state in words and an icon.
- **Row Rule** (`row`, #ececea): table row dividers only, 3-7% darker than white so rows read as rows, not a grid. The table header has no fill band; its hairline rule underneath is the table's one strong line. Evidence and times are grey; the attack name, endpoints and repeat count carry the ink, and a count of 1 prints as a grey `×1` (a value is never left blank).
- **Changed** (`changed`, #e0e0dc): the ground of a row that is new or grew, held until it is hovered for 700 ms or focused. Deeper than the paper ground of an open row, so the two never read alike.

### Named Rules
**The Seal Rule.** Vermilion is the only colour on the page, and it means High. Nothing else may be chromatic: not pressables, not status, not charts, not decoration.

**The Inked Pressable Rule.** Things you can press are drawn in ink: an ink fill for primary and selected states, ink text for quiet ones. There is no blue anywhere.

**The Mirrored Literal Rule.** Recharts cannot read CSS variables, so `TrafficChart.tsx` (INK, MUTED, HAIRLINE) and `AttackDistribution.tsx` (INK, MUTED, HAIRLINE, SUNK) declare literal hex constants that mirror `index.css` `@theme`. A token change in `index.css` must be made in both chart files in the same commit.

## Typography

**Display Font:** Montserrat Variable (with Public Sans Variable), for the ink band and the wordmark only.
**Body Font:** Public Sans Variable (with ui-sans-serif, system-ui)
**Label/Mono Font:** JetBrains Mono Variable (with ui-monospace, SFMono-Regular, Menlo)

**Character:** Montserrat at 800 is the bulletin's headline voice, used where the page shouts. Public Sans is a sober civic sans for words. JetBrains Mono is a tool face for what gets compared digit by digit. Tabular numerals are set globally on body.

### Hierarchy
- **Wordmark** (Montserrat 800, 18px, 0.06em, uppercase): "SentinelStream" in the masthead. Used once.
- **Band Count** (Montserrat 800, 48px on phones and 72px from 640px, line-height 1): the in-effect number for each level in the band.
- **Band Heading** (Montserrat 700, 14px, 0.18em, uppercase): "In effect now", "High in effect", "In effect as of HH:MM:SS", "In this capture".
- **Band Label** (Public Sans 600, 12px, 0.16em, uppercase): the level word with its icon above each band count.
- **Title** (Public Sans 600, 18px): panel headings (Alerts, Attack types, Analyse a capture file, Muted patterns). No underline strokes. The traffic chart's label is 14px sans.
- **Body** (400, 14px): table cells, panel descriptions, banners, buttons (500 to 600 on controls). `p` and `li` use `text-wrap: pretty`.
- **Label** (500, 12px): filter labels, table header, detail `dt` labels, chip text (600), rail text.
- **Data** (mono 400, 13px): endpoints, times, repeat counts, file names, chart labels. Chart ticks are mono at 12px.

### Named Rules
**The Display Stays In The Band Rule.** Montserrat is used only for the ink band and the wordmark. Panel titles and everything below the band are Public Sans.

**The Mono Means Data Rule.** JetBrains Mono is used only for addresses, ports, times, counts in the feed, file names and code paths. Labels and prose are Public Sans.

**The Sentence Case Rule.** Below the band, labels, headings and chips are sentence case with normal tracking. Tracked uppercase belongs to the band's own heading and level labels and to the wordmark, and to nothing else.

## Layout

The masthead is a full-width white strip over a hairline rule. Its content is a centred column up to 1440px, 12px vertical padding, 16px horizontal (24px from 640px), as one wrapping flex row with a 32px column gap: wordmark, view tabs, status pill pushed right. The ink band runs full bleed directly under it, with its content in the same 1440px column (24px top, 36px bottom), and a 14px torn brush edge at its foot. Its counts sit in three equal columns divided by 15% white rules, and the first column has no left padding so the counts align with the page edge.

Below the band, the page is the same 1440px column with 16px padding (24px horizontal from 640px) and a 16px vertical stack. From 1024px the main grid splits `minmax(0,2fr) minmax(0,1fr)`: the alert timeline above the alerts on the left; on the right, a 16px stack of the attack map, Capture (hidden on upload tabs), top talkers, attack types, upload and muted patterns. Below that the grid is one column. `grid-cols-1` is required so the table cannot widen the column on phones.

The Alerts panel's title row carries Export CSV and the "?" keys list on its right; the filters sit on their own row below. The feed shows 25 rows at a time with a full-width "Show 25 more" bar under the table (up to the 200 it holds), so it ends near the evidence column instead of running screens past it. From 1280px the alert table has six columns: Level | Attack | Source → destination | Repeats | Evidence | Last activity. Below 1280px each row becomes a two-line grid (level, attack, time, then endpoints and evidence), with the header kept for screen readers only, so nothing time-critical is cut off. Panels pad 16px, the token form pads 24px, controls pad 8 to 12px, and the gap between chips and buttons is 8px.

## Elevation & Depth

Flat. There are no box shadows anywhere. Depth is tonal (paper, then white panel, then sunk wells) and drawn: the band is the one dark mass on the page, and the Alerts panel the one brushed frame. The band carries a faint SVG grain (`#ink-grain`, white noise at 9% alpha). Rings stand in for borders on pills, quiet buttons and banners.

### Named Rules
**The Ink Not Shadow Rule.** Separate surfaces with a drawn ink frame, a 1px hairline or a tonal step, never with a shadow.

**The Brush On Frames Rule.** Brushwork (the `#ink-brush` displacement filter: low-frequency turbulence, scale 4) is applied only to the separate frame layer of the Alerts panel (`.ink-panel-brush`). Never filter text, numbers, icons, chips, buttons or charts, and don't spread it to other panels: rare is what keeps it visible.

## Shapes

Nearly square. Panel frames and primary-button fills have a 2px radius; the Alerts frame frays under the brush filter. Chips, inputs, selects and quiet buttons use 4px. View tabs, the detail card, banners and the mute editor use 6px. The status pill is fully round from 640px (12px on phones, where it can wrap). Bars have a 3px radius on the value end only. There are no dashed borders. One drawn shape: the torn brushstroke along the band's bottom edge.

## Components

### Buttons
- **Shape:** 2px plain ink fill for primary, 4px for quiet.
- **Primary:** a plain ink fill with white 14px semibold text, 8px by 12 to 16px (6px by 12px in the detail and mute editor). Hover lifts the fill to #2e2e2e. Disabled fills with sunk and muted text.
- **Quiet:** ink text, no fill, at least 36px tall, accent-tint ground on hover. The bordered variant (Export, Mute) adds a 1px edge ring; Choose file has a 1px ink border. Toggles (Needs attention, Show muted) are bordered quiet buttons that fill with ink and white text when pressed.
- **Icon:** 32px square, muted, sunk on hover (close details, delete rule).
- **Focus:** a 2px ink outline with a 2px offset everywhere.

### Chips (level chips)
- **Style:** a word plus a lucide icon whose shape differs per level (ShieldAlert, TriangleAlert, Info), 12px semibold, 2px by 8px, 4px radius.
- **State:** an in-effect High is solid vermilion with white text. In-effect Medium and uploaded Medium history use the grey wash; Low (in effect or history) is an ink outline on white. Expired is a white outline with a hairline border, muted text, and only the icon in the level tone.

### Cards / Containers
- **Corner Style:** 2px, brushed.
- **Background:** white on paper.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** a 1px `frame` line. The Alerts panel instead draws a 2.5px ink border on a separate layer through `#ink-brush`.
- **Internal Padding:** 16px. Panel titles are 18px semibold, plus an optional 14px muted line below.
- **Upload panel:** no drop box. The whole panel takes a dropped file (its ground turns accent-tint and the line reads "Drop it here to choose it."). One wrapping row: a bordered Choose file button, the chosen name in mono (or "No file chosen" in muted), and the primary Analyse button, shown only once a valid file is chosen.

### Inputs / Fields
- **Style:** 1px edge border, white, 4px radius, at least 36px tall. The token input is mono.
- **Focus:** the global ink outline.
- **Error:** a 14px message in `sev-high-ink`, announced with role=alert. The upload's Analyse button is hidden while the file is invalid. A failed acknowledgement or rule delete says so in visible Seal Ink text; success stays a screen-reader announcement.

### Navigation
- **Masthead:** a white strip with the Montserrat wordmark, the view tabs and the status pill.
- **View tabs:** Live, plus one tab per finished upload. 14px medium, 6px radius, truncated at 192px. Selected is ink with white text. Arrow keys move between tabs.
- **Status pill:** 14px medium, an icon plus words. Live is a grey tint with a pulsing ink dot. Stale is a paler tint. Offline is sunk with an edge ring. Waiting is white with a hairline ring. The visible text changes every second, so the live region gets only the state word.

### The Ink Band (signature)
A full-bleed charcoal band, directly under the masthead, with an inline SVG grain and a torn brushstroke bottom edge filled with paper. It shows a heading and a note, then three level counts in Montserrat 800. Counts are 36px (48px from 640px) while nothing High is up, so a lone Low never becomes the loudest thing on a quiet page, and 48px (72px from 640px) while a High is in effect. Only a true zero turns band-ash at 70% opacity; a count held while frozen keeps its ink. Focus rings on the band are band-text, not ink. Each count is a toggle filter (`aria-pressed`): hover lifts it with a 5% white ground, and pressed underlines it (2px, 8px offset). The counts tick in from above when they change (`count-tick`, 0.25s, `cubic-bezier(0.16, 1, 0.3, 1)`).

**The flood.** While a High is in effect (live or frozen, never a capture; a dropped connection must not look like an all-clear, so a frozen flood just holds still), a vermilion layer wipes across the band from the left by animating `clip-path` (0.7s `expo.out`) and the heading reads "High in effect". It exits to the right, faster (0.35s `power2.in`). With reduced motion it cross-fades in 0.2s. While flooded, the band's quiet text turns white.

### Alert Row and Expiry Rail (signature)
Expired rows mute their text, and one "Expired: no activity for 30 s" divider row on the paper ground separates them from live ones. An in-effect row shows a 48 by 2px rail in its level tone that drains over the window with a 1s linear `scaleX` transition, with "N s left" beside it. The rail turns edge grey and says "held" while frozen. A new or grown row takes the `changed` ground and a plain 12px semibold "New" or "Updated" word until it is seen (hovered or focused for 700 ms; tabbing past does not count). When activity reorders the feed, rows slide to their new place with GSAP Flip (0.45s `expo.out`), and new rows fade down 8px into place (0.3s). The attack name is a disclosure button, underlined only on hover, that opens the detail in place. Flip and the rail transition are off under reduced motion.

### Evidence Detail
A white 6px card in a sunk well under its row. Labelled segments sit in a 2-column grid (3 from 640px) with hairline rules, a 12px muted label over a 14px value, and spans chosen so no row ends in an empty cell. Evidence always spells out its detector's meaning. Acknowledge is a primary button and Mute is a bordered quiet button.

### Charts
Every chart sits straight on its panel, with no box or ground, and every mark is linear in its value from zero: no perspective, no 3D, no log or root scales. Depth comes from layering and motion only. Each panel's description says its scope ("across the N alerts in this view"), because the dashboard holds the latest 200 live alerts (500 per upload), not the whole database.

- **Capture:** the packets/s line (1.75px, straight segments, hairline grid, no animation: the 60 s window sliding is the motion; the y-axis steps are round whole numbers with the top above the peak), then three mono figures under a row rule: active flows, queue drops and kernel drops, each drop a share of everything that arrived (processed + queue drops + kernel drops). Kernel drops above 5% turn vermilion and semibold, with a spoken note. The figures update in place, with no tick (they change every second). Frozen, the panel dims to 50% and its label reads "as of HH:MM:SS". Hidden on upload tabs.
- **Alert timeline:** 80px of buckets, new alerts per minute (per 2 minutes below 640px) over the last hour, or over an upload's own span. Each bucket stacks High (vermilion, at the bottom), Medium (charcoal) and Low (grey). New buckets rise from the baseline (`tl-grow`, 0.5s); the current one breathes (`tl-now`, 2s). The scope line adds "older alerts not loaded" when the backend holds more than the view. The time axis is labelled on one step, every quarter of the window (start and middle only on phones), so you can tell when things happened.
- **Attack map:** sources (IP) left, services (IP:port) right, top 8 each plus a "+N more" node, one ink stroke per pair: weight linear in detections (4px for the heaviest, 0.75px floor), vermilion while a High on the pair is in effect, edge grey at 60% once all of it expired, expired strokes layered beneath. New strokes draw from source to target (GSAP stroke-dash, 0.8s `power2.out`, total stagger capped at 0.6s). Node labels are mono 12px buttons that truncate, with the count beside them.
- **Top talkers:** top 5 sources and top 5 destination ports, mono 12px, each over a 2px ink bar on a hairline track.
- **Attack types:** 16px ink bars with mono counts; when the ranking changes, rows slide to their new place (GSAP Flip, 0.45s `expo.out`) and bars ease to their new length (0.5s); counts tick.

### Focus filter and search
Clicking a timeline bucket, a map node or a talker sets one focus (a minute, a source, a service or a port) and presses that control (ink fill, white text). The focus shows as an ink chip with an ×, under the Alerts title; it combines with the other filters and the search box (IP, port or attack name), and Clear filters or switching view removes it. Keys: `/` search, `j`/`k` next and previous row, Enter opens, `a` acknowledges or undoes, Esc closes; a "?" button lists them. Keys do nothing while typing in a field.

## Do's and Don'ts

### Do:
- **Do** put the level first, as a word plus its icon, and keep vermilion for High alone.
- **Do** show state by form as well as tone: solid, wash or outline chips, the draining rail, the held "New / Updated" marks, and the flooded band.
- **Do** draw pressables in ink (`accent`, #141414): an ink fill for primary and selected, ink text for quiet.
- **Do** keep brushwork to the band and the Alerts panel's frame layer (`#ink-brush`), and keep text and data crisp.
- **Do** keep Montserrat to the ink band and the wordmark.
- **Do** give every animation a reduced-motion path: a cross-fade for the flood, and no Flip, rail transition, count tick, timeline grow or breathe, or stroke draw-in.
- **Do** update the literal hex constants in `TrafficChart.tsx` (Recharts needs literal colours) whenever an `index.css` colour token changes.
- **Do** freeze, rather than decay, any "in effect" judgement while data is not arriving, and say so in words.

### Don't:
- **Don't** use vermilion, or any hue, for anything but High, with one exception: kernel drops above 5%, where the alert counts themselves stop being trustworthy.
- **Don't** reintroduce a blue or any other chromatic accent for pressables, focus or status.
- **Don't** colour-code chart series or categories. Bars encode magnitude in ink; only the timeline's severity stack uses the level tones.
- **Don't** fake depth with perspective, 3D or non-linear scales. Every mark is linear from zero.
- **Don't** add shadows. Depth is tonal and drawn.
- **Don't** run the brush filter over text, numbers, chips, icons or charts.
- **Don't** show a detector score as one bare percentage. Each score names its detector and its meaning.
- **Don't** add uppercase or tracked-out labels outside the band and wordmark, or eyebrow text above headings.
- **Don't** add a dark theme (AGENTS.md: light only).
