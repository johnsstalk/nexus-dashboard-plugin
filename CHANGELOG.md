# Changelog

## WIP

### Fixed

- File rename handler now works for all file types — not just `.md`
- Label auto-updates when file basename changes
- Rename handler case-sensitivity: passes original case (not lowercased) to code block matching
- Label no longer gets `.md` appended during rename (cleaned `newBasename`)
- Multiple MOC paths fixed: Projects MOC (9 missing folder prefixes), Tracker Index MOC (typo), Journal MOC (3 wrong paths)
- Renamed vault files to match code block paths (`MOsC` → `MOC`, `MOCw` → `MOC`)

### Added

- Expanded icon set from 9 to 40 icons (31 new)
- Searchable icon picker in settings

### Changed

- Code block paths now require `.md` extension (parser auto-appends for backward compat)
- Card click validates path via `getAbstractFileByPath()` — shows Notice if file not found
- Settings migration auto-appends `.md` to existing extension-free paths on load

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
