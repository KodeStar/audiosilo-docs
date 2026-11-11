---
title: Styling and the design system
description: "How the player is styled: Uniwind className on every platform, cn(), the Stacks colour tokens and their generator, fonts, the Text variants, vendored icons, the react-native-reusables primitives in src/components/ui/ (CoverImage among them), overlays and sheets, theme switching and its default, and the react-native-web patches."
---

`STYLEGUIDE.md` at the root of the frontend repo is **authoritative for the
player's look**. It describes Stacks, the player redesign's design system:
tokens, type, components, platform behaviour and voice. Its section 17 maps the
design onto the code. This page covers the points a contributor trips over
first.

## `className` everywhere

Uniwind styles React Native's own components directly. Metro wires it in through
`withUniwindConfig` in `metro.config.js`; there is no babel preset and no
`tailwind.config.js`. The theme is CSS in `@theme` blocks in `src/global.css`.

A third-party component needs a one-time `withUniwind` wrapper before it accepts
`className`. For example, use `SafeAreaView` from
`@/components/ui/safe-area-view`. Without the wrapper, native silently drops the
classes.

**One set of Uniwind options.** `metro.config.js` and
`scripts/check-styles.cjs` both read the root `uniwind.config.js`, so the style
guard compiles exactly what Metro does.

### Merge caller classes with `cn()`

`cn()` comes from `@/lib/utils` (clsx plus tailwind-merge). Uniwind doesn't
de-duplicate conflicting classes. The web resolves them by stylesheet order and
native by className order. So a component that accepts a `className` override
must merge it with `cn()` for the caller to win everywhere. `cn()` knows the
Stacks radius names: `rounded-control`, `rounded-menu`, `rounded-card`,
`rounded-dialog` and `rounded-sheet`.

### rem

**rem is 14px on native** (Uniwind's rem polyfill, NativeWind's old value) and
the browser's 16px on the web, so layouts keep their size.

## Colour tokens

The colour tokens are the Stacks semantic tokens, with **one source,
`src/theme/tokens.json`**. It has a `themes.light` and a `themes.dark` set with
the same names, plus a fixed `palette` (`white`, `black`).

`npm run gen:tokens` (`scripts/gen-tokens.mjs`) writes two outputs:

- the generated region of `src/global.css`, with each theme token as a Uniwind
  theme variable, `--color-<name>`, under `@variant light` and `@variant dark`;
- `src/theme/tokens.ts`, with `colors.light.<camelName>`,
  `colors.dark.<camelName>`, `colors.white` and `colors.black`.

Never hand-edit either output. `npm test` starts with
`node scripts/gen-tokens.mjs --check`, which fails when either is out of date.

**Use the semantic classes.** They follow the theme with no `dark:` pair:

| Use | Class |
|---|---|
| Page | `bg-background` |
| Surfaces | `bg-card` (sheets and dialogs `bg-popover`) |
| Quiet fills | `bg-muted` |
| Text | `text-foreground`, `text-muted-foreground`, `text-subtle-foreground` |
| Hairlines | `border-border` |
| Pressed and hover | `bg-accent` |
| Status | `text-destructive`, `success`, `warning`, `info` |

Opacity modifiers work (`bg-brand/10`).

**`primary` is ink, and the pink is `brand`.** As in shadcn, `primary` is the
primary-button colour, a deep ink. The pink is `bg-brand`, with
`text-brand-foreground` on it. Pink text is `text-brand-ink` (AA contrast in both
themes). Tinted fills are `bg-brand/10` or `bg-brand-soft`. The rule is **one
pink thing per view**.

**Tailwind's default palette is switched off** (`--color-*: initial` in the
generated region), so `bg-gray-200` or `text-red-500` compiles to nothing. Add a
token to `tokens.json`, in both themes, instead.

**Native props that need a colour string** (the status bar,
`ActivityIndicator`, SVG fills, the navigation theme) read `useThemeColors()`
(`src/theme/use-theme-colors.tsx`). It returns the resolved theme's
`colors.light` or `colors.dark` from a context that `ThemeColorsProvider` fills
inside `ThemeProvider`, so there is one theme subscription, not one per icon.
Don't branch on `scheme === 'dark'` yourself.

## Fonts

The fonts are **Figtree (body), Bricolage Grotesque (display) and JetBrains
Mono**. `ThemeProvider` loads them from `@expo-google-fonts/*`, only the weights
a token uses.

- The Figtree and Bricolage weights hold the splash screen until they are ready.
- JetBrains Mono loads alongside without delaying first paint. The system
  monospace font shows until then.
- On the web, each page's static HTML already carries the gating fonts'
  `@font-face` rules and preload links (`StaticFonts`,
  `src/theme/static-fonts.web.tsx`). So the browser fetches them while the
  script loads. On a slow link a font may swap in from the fallback.

React Native has no font fallback or synthetic weights, so there is **one family
per token**: `font-sans` (Figtree 400), `font-sans-medium`, `font-sans-semibold`,
`font-sans-bold`, `font-display` (Bricolage 700), `font-display-semibold` and
`font-mono` (JetBrains Mono 500). Never pair a font token with `font-medium` or
`font-bold`.

## Text

**Text goes through `<Text variant=… />`** (`src/components/ui/text.tsx`). Its
variants are the Stacks type roles:

- `display-xl`, `display`, `heading`, `title`;
- `body` (the default);
- `muted`;
- `label` (Figtree semibold, for list-row titles);
- `caption`;
- `eyebrow` (an uppercase kicker);
- `mono` and `stat`, both with tabular figures.

Variants use themed tokens, so `<Text variant="caption" className="text-brand-ink">`
recolours both themes.

## Icons

**Never import an icon library.** Use `<Icon name=… />` from
`src/components/ui/icon.tsx`. The glyphs are vendored SVG paths in
`icon-data.ts`. To add or change an icon, edit `scripts/glyphs/manifest.mjs` and
regenerate through the isolated generator in `scripts/glyphs/`. That generator is
the only place a FontAwesome Pro token is ever needed.

## The primitives in `src/components/ui/`

**Compose the primitives** rather than restyling raw RN components ad hoc. They
are **react-native-reusables** (shadcn/ui for React Native, on
`@rn-primitives`; `components.json` selects the Uniwind styling), restyled to
Stacks with every string translated:

- `Button`, with the variants `default` (ink), `brand`, `outline`, `secondary`,
  `ghost`, `destructive`, `destructive-outline` and `link`;
- `Card`, `Input` and `Textarea`;
- `Dialog` and `AlertDialog`, plus the `confirm-dialog` helper. Dialog and
  AlertDialog share one `DialogFrame`;
- `Select`;
- `Tabs`, the underline tabs, optionally `scrollable`;
- `ToggleGroup`, plus the typed `SegmentedControl`, which is the segmented look;
- `Popover`, `DropdownMenu`, `Switch`, `Separator`, `Badge` and `Tooltip`;
- `Skeleton`. On the web it is a CSS keyframe shimmer, the `skeleton-shimmer`
  utility. On native, every skeleton shares one animation clock;
- `Kbd`, a key hint.

These are hand-built on primitives:

- `Slider`: the dock's chapter scrubber and the speed sheet. The full player's
  seek bar shares its `useSliderControl`;
- `Toast`: an imperative `toast({ title, description, action })`, rendered by
  the root `ShellToastHost` (see [Toasts](shell.md#toasts));
- `RowSurface` and `PressableRow`: the quiet hairline list row. The book page's
  chapter rows use it too.

A primitive that renders its own text node reuses `EYEBROW_CLASS` for the
eyebrow style.

Also in `src/components/ui/`: `Sheet`, `Stepper`, `TimeStepper`, `EmptyState`,
`SectionHeader`, `AnimatedPressable` (a `className`-aware `Pressable` with a
press-in scale that respects reduce motion) and `CoverImage`.

To add another reusables component, generate it into a scratch directory with
the reusables CLI and port it, because the CLI would overwrite our same-named
files. The steps are in the frontend `CLAUDE.md`.

### `CoverImage`

Every cover, artwork or backdrop image from a server goes through `CoverImage`
(`cover-image.tsx`), never expo-image directly. `Cover`, `CoverBackdrop` and
`DiscoveryArtwork` use it.

- **On native** it is expo-image as before, with its disk cache,
  `source.headers` and `blurRadius`.
- **On the web** (`cover-image.web.tsx`) it is a plain `<img>`: cover fit, lazy,
  async decode, and a fade in over `transition` ms, keyed by its URI.
  expo-image's web image takes no `crossOrigin`. The `<img>` sets
  `crossOrigin="anonymous"` for another origin's URL (`corsModeFor`, see
  [the web engine](playback.md#web-engine-servicewebts)) and sends no headers,
  because server image URLs carry `?token=`.

## Overlays

**Overlays portal.** Dialog, AlertDialog, Select, Popover, DropdownMenu and
Tooltip portal into the root `<PortalHost />` on native, and into
`document.body` on the web. On iOS they are wrapped in `FullWindowOverlay`
(`overlay.tsx`). So they can open from inside a card, a list row or a
ScrollView. On a phone (`useLayout()`), a dialog or alert dialog rises from the
bottom edge like a sheet.

**Overlays read the window's safe-area insets.** `RootInsetsProvider`
(`overlay.tsx`, mounted once directly inside the root `SafeAreaProvider`)
captures them. `useRootInsets`, `useRootFrame`, `useOverlayInsets` and
`useDialogFrame` read them wherever the overlay is opened from. A tab page's own
safe-area context counts the native tab bar in `insets.bottom`, which made phone
sheets about 100pt too tall and pushed menus up on iOS.

**The bottom sheets are still hand-rolled** (`sheet.tsx` on `OverlayHost`). A
sheet renders in place, so it must be mounted at screen level, never inside a
clipped container. Every sheet the app shows today is a player sheet: speed,
sleep, chapters, the companion and Up next. A screen requests one through
`usePlayerSheets`, and the active `PlayerSheetHost` renders it through
`PlayerSheet`: a `Sheet` on phone and tablet, a centred `Dialog` on desktop (see
[Player UI](player-ui.md#player-sheets-and-overlays)).

**On the web, Content's style is flattened.** rn-primitives hands Content's
props to Radix DOM nodes through a Slot that merges `style` by object spread, and
a style array crashed react-native-web's style setter. Every Content part is
wrapped once in `withFlatStyle` (`overlay.tsx`), so a style array is fine at the
call site.

## Theme switching

Theme switching goes through `ThemeProvider`. It calls
`Uniwind.setTheme('light' | 'dark' | 'system')` and reads the resolved scheme
back from `useUniwind()`. On the web Uniwind puts the theme class on `<html>`, so
the theme also reaches content portaled to `<body>`.
`useTheme().toggleScheme()` flips between light and dark.

### The default theme

The launch migration `migrateStorage()` (`src/lib/storage-migration.ts`) writes
**the default**. It is one memoised run that both `bootstrapPlayback` and
`ThemeProvider` await, so no effect-order contract is involved.

The migration acts only when nothing is stored under `THEME_STORAGE_KEY`
(`audiosilo.theme`):

1. It reads `hasExistingInstall()` (`src/stores/session.ts`: a persisted
   connection, a known server, or a legacy session), **before**
   `resetStaleStorage` can rewrite the session keys.
2. It writes `defaultSchemePref()` (`src/theme/scheme-pref.ts`): `system` for a
   **new** install, `dark` for an **existing** one. The app used to be
   dark-first, so nobody's app turns light after the update.

`ThemeProvider` then only reads the stored value through
`restoredSchemePref()`. It keeps a stored pick, and reads an unknown value as
`dark` without writing it.

## The react-native-web seam

`src/lib/rnw-button-fix.web.ts`, which the root layout imports first, patches
react-native-web twice:

- `role="button"` renders a `<div role="button">` instead of a real `<button>`.
  A real button nests illegally and trips an older-Safari flex bug.
- Its press responder lets **Space** press any role-bearing pressable: `tab`,
  `radio`, `switch`, `checkbox`, `option` and menu items. react-native-web only
  did this for `button`. A `role="button"` pressable with no `onPress` leaves
  Space to its own handlers, so Radix opens a Select.

There are no per-primitive Space shims. The native `rnw-button-fix.ts` is a
no-op.
