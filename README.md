# Nexus Dashboard

ASCII art banners + theme-aware dashboard for your Obsidian vault — stats, MOC cards, and recently modified notes via simple code blocks.

## Features

- **Dashboard code block** — embed a full dashboard (header, stats, MOC cards, recently modified) in any note
- **ASCII art code block** — render FIGlet text banners with configurable font, color, size, alignment
- **Time-aware greeting** — "Good morning/afternoon/evening" with optional personalized name
- **Quick-action toolbar** — New note, Open daily note, Search, Random note
- **Live stats bar** — real-time vault file counts from native Obsidian API
- **Animated card grid** — hover lift, shine sweep, accent transitions
- **Recently modified notes** — mini-card grid with folder-aware icons and relative timestamps
- **Configurable dividers** — 5 style presets (Default, Bold, Subtle, Gradient, Dashed) + advanced CSS
- **Layout presets** — 2-column, 3-column, Compact, Wide
- **Card context menu** — right-click to Open, Copy path, Move up, Move down
- **Card drag-and-drop** — reorder MOC cards in settings
- **Custom DSL parser** — YAML-like syntax for code block configuration
- **Export/Import settings** — save and restore as JSON
- **Ribbon icon** — quick access from sidebar
- **Auto-open on startup** — configurable in settings
- **Theme-aware** — adapts to your Obsidian theme automatically

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/johnsstalk/nexus-dashboard-plugin/releases)
2. Create a folder `nexus-dashboard` in your vault's `.obsidian/plugins/` directory
3. Copy the three files into that folder
4. Enable the plugin in **Settings → Community Plugins**

## Usage

### Quick Start

Create a note with a code block:

````markdown
```nexus-dashboard
header:
  text: MY VAULT
  color: #FF6B6B

toolbar: true
greeting: true
greetingName: Raspsec

stats: true

section:
  title: Work
  divider: true
  columns: 2
  cards:
    - type: big
      label: Project Alpha
      desc: Main project notes
      path: Project/Alpha
      icon: Project
      color: #FF6B6B
    - type: big
      label: Research
      desc: Reading list and notes
      path: Research
      icon: Book
      color: #4ECDC4

recently: true
```
````

### Commands

| Command | Description |
|---------|-------------|
| `Open dashboard` | Opens the dashboard note (creates it if missing) |
| `Insert Nexus Dashboard code block` | Inserts an empty `nexus-dashboard` block |
| `Insert ASCII art block` | Inserts an empty `ascii` block |
| `Render selection as ASCII art` | Wraps selected text in an ASCII block |

Access via **Ctrl+P** (or **Cmd+P** on Mac).

### Ribbon Icon

Click the layout icon in the sidebar to open the dashboard.

---

## Code Block Reference

### `nexus-dashboard`

The main dashboard code block. Supports a custom DSL (not full YAML).

#### Root-Level Keys

| Key | Values | Default | Description |
|-----|--------|---------|-------------|
| `toolbar` | `true`, `false` | `false` | Show quick-action buttons (must be explicitly set) |
| `greeting` | `true`, `false` | `false` | Show time-of-day greeting (must be explicitly set) |
| `greetingName` | any string | — | Personalized name in greeting |
| `recently` | `true`, `false` | `false` | Show recently modified notes section |

#### Header Block

```
header:
  text: MY VAULT
  font: ANSI Shadow
  color: #8A5CF6
  size: normal
  align: center
```

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `text` | any string | `NEXUS` | Text rendered as ASCII art |
| `font` | `ANSI Shadow` | `ANSI Shadow` | FIGlet font |
| `color` | CSS color | `#8A5CF6` | Text color |
| `size` | `normal`, `small` | `normal` | Font size |
| `align` | `left`, `center`, `right` | `center` | Text alignment |

#### Stats Block

```
stats: true

stats:
  show: true
```

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `show` | `true`, `false` | `false` | Show stats bar |

Stats items are configured in the Settings tab (folder + label pairs).

#### Section Block

```
section:
  title: My Section
  divider: true
  columns: 2
  cards:
    - type: big
      label: Note Title
      desc: Short description
      path: folder/Note
      icon: Note
      color: #FF6B6B
```

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `title` | any string | — | Section/divider label |
| `divider` | `true`, `false` | `false` | Show divider line above section |
| `columns` | `2`, `3`, `4` | `2` | Number of grid columns |

#### Card Properties

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `type` | `big`, `mini` | `big` | Card size |
| `label` | any string | — | Card title |
| `desc` | any string | — | Card description (big cards only) |
| `path` | vault path | — | Note/folder path to open |
| `icon` | icon name | — | Obsidian icon name |
| `color` | CSS color | — | Accent color |

#### Graph Block

```
graph:
  exclude: Templates,Attachments
```

| Property | Values | Default | Description |
|----------|--------|---------|-------------|
| `exclude` | comma-separated folders | — | Folders to exclude from graph links |

#### Multiple Sections

You can define multiple sections:

```
section:
  title: Projects
  divider: true
  columns: 2
  cards:
    - type: big
      label: Alpha
      path: Project/Alpha
      icon: Project

section:
  title: Resources
  divider: true
  columns: 3
  cards:
    - type: mini
      label: Templates
      path: Templates
      icon: File
    - type: mini
      label: Attachments
      path: Attachments
      icon: Paperclip
```

#### Full Example

````markdown
```nexus-dashboard
header:
  text: RASPSEC
  font: ANSI Shadow
  color: #8A5CF6
  size: normal
  align: center

toolbar: true
greeting: true
greetingName: Raspsec

stats: true

section:
  title: Projects
  divider: true
  columns: 2
  cards:
    - type: big
      label: Nexus Dashboard
      desc: Obsidian plugin
      path: Project/Nexus Dashboard
      icon: Project
      color: #8A5CF6
    - type: big
      label: Research
      desc: Reading notes
      path: Research
      icon: Book
      color: #4ECDC4

section:
  title: Resources
  divider: true
  columns: 3
  cards:
    - type: mini
      label: Templates
      path: Templates
      icon: File
    - type: mini
      label: Inbox
      path: Inbox
      icon: Inbox
    - type: mini
      label: Archive
      path: Archive
      icon: Archive

recently: true
graph:
  exclude: Templates,Attachments
```
````

---

### `ascii`

Render FIGlet text banners.

#### Parameters

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `font` | `ANSI Shadow` | `ANSI Shadow` | FIGlet font |
| `color` | CSS color | `#8A5CF6` | Text color |
| `size` | number (em) | `1.0` | Font size multiplier |
| `align` | `left`, `center`, `right` | `center` | Text alignment |

#### Examples

**Basic:**

````markdown
```ascii
Hello World
```
````

**With parameters:**

````markdown
```ascii
font: ANSI Shadow
color: #FF6B6B
size: 1.5
align: center
My Vault Title
```
````

**Multiple blocks per note:**

````markdown
```ascii
color: #8A5CF6
Welcome
```

Some text between banners.

```ascii
color: #4ECDC4
Let's Go
```
````

---

## Settings

Open **Settings → Nexus Dashboard** to configure defaults.

### General
- **Open on startup** — auto-open dashboard when Obsidian launches
- **Show greeting** — code-block only: set `greeting: true` to enable
- **Greeting name** — personalized name shown in greeting
- **Show toolbar** — code-block only: set `toolbar: true` to enable

### Layout
- **Layout preset** — 2-column, 3-column, Compact, Wide
- **MOC grid columns** — 1 to 4 columns (default: 2)
- **Mini grid columns** — 1 to 4 columns (default: 3)

### ASCII Header
- **Dashboard title text** — ASCII art title (default: "NEXUS")
- **Default font** — FIGlet font (default: ANSI Shadow)
- **Default color** — CSS color (default: `#8A5CF6`)
- **Default size** — font size multiplier (0.3x to 3.0x, default: 1.0)
- **Default alignment** — left, center, right

### MOC Cards
Add, remove, and reorder MOC cards with:
- **Title** — card heading
- **Description** — subtitle text
- **Path** — vault path to open
- **Icon** — Obsidian icon (dropdown picker)
- **Color** — accent color (color picker)

Drag-and-drop or use arrow buttons to reorder.

### Stats Bar
- **Show/hide** — toggle stats bar
- **Add stat** — select folder + label (dropdown picker)
- **Remove stat** — delete stat entry

### Recently Modified
- **Show/hide** — toggle recently modified section
- **Count** — number of notes to show (1-20)
- **Exclude folders** — comma-separated folder names

### Divider Design
- **Label** — divider text (default: "Recently Modified")
- **Preset** — Default, Bold, Subtle, Gradient, Dashed
- **Advanced** — gradient, line width, label size/weight/color/spacing

### Export/Import
- **Export** — download all settings as JSON
- **Import** — upload a JSON file to restore settings
- **Reset** — restore all defaults

---

## Merge Strategy

Code block content merges on top of settings defaults:

- **Empty code block** → header + stats + cards + recently from Settings tab
- **Populated code block** → only the sections you define are overridden
- **`toolbar` and `greeting`** → code-block only, must be explicitly set to `true`

Example: if your Settings have 3 MOC cards but your code block defines 2 sections with 4 cards, the code block wins — you get 4 cards in 2 sections, not 3 cards.

---

## Development

```bash
npm install
npm run dev      # watches for changes, builds to main.js
npm run build    # production build
```

The plugin files are:
- `src/main.ts` — plugin entry, code block processors, commands
- `src/renderer.ts` — dashboard rendering (header, toolbar, stats, cards, recently)
- `src/parser.ts` — custom DSL parser for code block configuration
- `src/settings.ts` — settings tab UI
- `src/types.ts` — TypeScript interfaces
- `src/icons.ts` — Obsidian icon mappings
- `src/figlet.ts` — FIGlet text renderer
- `src/fonts/ansi-shadow.ts` — font definitions
- `styles.css` — all plugin styles
- `preview.html` — live reload preview page
- `dev.mjs` — dev server (esbuild + SSE)
- `version-bump.mjs` — bumps `versions.json` from `manifest.json`

---

## License

[MIT](LICENSE)
