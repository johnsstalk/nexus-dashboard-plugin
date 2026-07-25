# Changelog

## v1.2.1

### Added

- **Column blocks** — new `column:` code block keyword for vertical stacking layout (replaces old `tabs:` and `stack:` systems)
- **Links block** — new `links:` code block keyword with `- url:` items for quick link grids
- **Stats block** — `stats:` as a renderable block inside `row:`/`column:` layouts
- **Search block** — `search:` as a renderable block inside layouts
- **Heading block** — `heading:` for layout slot headings with configurable text, color, align, size
- **Vault list block** — `vaultlist:` for folder-based file listings inside layouts
- **Section dividers** — `divider:` inside a section attaches it as the section's header divider
- **Per-slot divider labels** — divider content slots in row/column layouts now have a configurable label text input
- **Quick Links divider label** — customizable text for the Quick Links divider (default "Quick Links")
- **Row gap** — `gap:` property on `row:` blocks for custom column spacing
- **Column spacing** — `spacing:` property on `column:` blocks
- **Content slot system** — `RowLayoutEntry` and `ColumnLayoutEntry` use typed `slots` (stats, search, heading, moc-cards, quick-links, recently, vaultlist, divider, none)
- **Search bar** — `search:` code block keyword with vault-wide note search (debounced, keyboard-dismissible)
- **Row column drag** — draggable dividers between row columns to resize proportions in real-time
- **Saved row proportions** — drag-resized proportions persist per source file
- **Graph link injection** — injects paths into `metadataCache.resolvedLinks` instead of hidden wikilinks (cleaner Graph View integration)
- **Expanded icon set** — from 9 to 40 icons (31 new)
- **Searchable icon picker** in MOC card settings
- **Collapse/expand MOC cards** in settings — click heading to toggle
- Dev tooling — `.editorconfig`, `.eslintignore`, `.prettierrc`, `eslint.config.cjs`, `vitest.config.ts`, `src/__tests__/`

### Fixed

- File rename handler now works for all file types — not just `.md`
- Label auto-updates when file basename changes
- Rename handler case-sensitivity: passes original case (not lowercased) to code block matching
- Label no longer gets `.md` appended during rename (cleaned `newBasename`)
- Multiple MOC paths fixed: Projects MOC (9 missing folder prefixes), Tracker Index MOC (typo), Journal MOC (3 wrong paths)
- `recently:` block form vs root boolean — `isRootRecentlyContext` now uses proper indent comparison
- Search bar event listener cleanup — `AbortController` prevents memory leaks on re-render
- Block render errors caught with `console.error` instead of crashing entire dashboard
- Settings import validates each field independently (mocs/stats validated separately)
- Safer `dataTransfer` handling in drag-and-drop

### Changed

- **Replaced Tabs with Column** — `tabs:` block type removed (CSS specificity conflict with themes); replaced by `column:` for vertical stacking
- **Stacks renamed to Columns** — `stack:` keyword renamed to `column:` throughout
- **Code block paths** now require `.md` extension (parser auto-appends for backward compat)
- Card click validates path via `getAbstractFileByPath()` — shows Notice if file not found
- Settings migration auto-appends `.md` to existing extension-free paths on load
- **Types extracted** to `types.ts` — settings interfaces, defaults, and divider presets moved out of `settings.ts` into dedicated modules (`types.ts`, `defaults.ts`, `utils.ts`)
- `DashboardBlock` union type expanded — now includes `VaultListConfig`, `ColumnConfig`, `StatsBlockConfig`, `SearchBlockConfig`, `HeadingBlockConfig`
- `RowConfig.children` widened to `(SectionConfig | ColumnConfig | StatsBlockConfig | SearchBlockConfig | HeadingBlockConfig | VaultListConfig)[]`
- `SectionConfig.columns` widened from `1 | 2 | 3 | 4` to `number`
- Graph links CSS removed (no longer rendering hidden wikilinks)
- Row columns use `flex: 1 1 0` base with override only when custom proportion is set
- Row divider styling improved — transparent default, accent color on hover/drag
- `NexusSettings` expanded — new fields: `columnLayouts`, `vaultLists`, `showQuickLinksDivider`, `quickLinksDividerLabel`, `showHeader`, `showMocCards`, `showQuickLinks`

---

## v1.2.0

### Fixed

- Font selection now actually uses the chosen font (was always using default)
- Column count `1` now works; values outside 1–4 are rejected instead of silently defaulting
- `recentCount: 0` no longer ignored (nullish coalescing fix)
- ASCII block handles non-numeric `size` and invalid `align` gracefully
- Graph link injection uses async/await — no more race condition on file write
- Cards outside any section auto-wrap in an implicit section instead of disappearing
- Settings import validates that MOCs have `path` + `title` and stats have `folder` + `label`
- Settings load rejects corrupted persisted data (wrong types, missing fields)

### Improved

- Mini cards now show descriptions
- Mini-only sections use compact grid layout (10px gap instead of 14px)
- Standalone `divider:` blocks as root-level dashboard elements
- Removed dead CSS classes, dead parser branch, unused `layoutPreset` field

---

## v1.1.0

Initial release.

- ASCII art banners via FIGlet (`ANSI Shadow` and `Small Slant`)
- Dashboard with stat cards, recently modified notes, graph link injection
- Code block driven: `nexus-dashboard` and `ascii` blocks
- Big and mini card types with color accents, icons, descriptions
- Standalone dividers with 5 style presets (default, bold, subtle, gradient, dashed)
- Drag-and-drop MOC card reorder in settings
- Export / import settings as JSON
- Open on startup option
