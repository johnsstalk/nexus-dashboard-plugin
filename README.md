# Nexus Dashboard

ASCII art banners + theme-aware dashboard for your Obsidian vault.

## Install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/johnsstalk/nexus-dashboard-plugin/releases)
2. Create a folder `nexus-dashboard` in `.obsidian/plugins/`
3. Copy the three files into it
4. Enable the plugin in **Settings > Community Plugins**

## Quick Start

Create a note with a `nexus-dashboard` code block:

````md
```nexus-dashboard
stats: true
recently: true
showGraph: false

header:
  text: MY VAULT
  color: #8A5CF6

section:
  cards:
    - type: big
      label: My Note
      path: folder/Note
      icon: Note
      color: #FF6B6B
    - type: mini
      label: Quick Link
      path: folder/Link
      icon: Link
```
````

## Standalone Dividers

Place a `divider:` block at the root level (outside any section):

````md
```nexus-dashboard
divider:
  type: bold
  title: Projects
```
````

Available types: `default`, `bold`, `subtle`, `gradient`, `dashed`

## ASCII Art

````md
```ascii
font: ANSI Shadow
color: #FF6B6B
size: 1.5
My Title
```
````

## Commands

Open **Ctrl+P** / **Cmd+P** and search:

- `Open dashboard`
- `Insert Nexus Dashboard code block`
- `Insert ASCII art block`
- `Render selection as ASCII art`

---

## Code Block Reference

### `nexus-dashboard`

#### Root Keys

| Key | Values | Default | Description |
|-----|--------|---------|-------------|
| `stats` | `true`, `false` | `false` | Show stats bar |
| `recently` | `true`, `false` | `false` | Show recently modified notes |
| `showGraph` | `true`, `false` | `false` | Show graph links |
| `recentCount` | number | `9` | Number of recently modified notes |

#### Header

```
header:
  text: NEXUS
  font: ANSI Shadow
  color: #8A5CF6
  size: normal
  align: center
```

| Property | Values | Default |
|----------|--------|---------|
| `text` | string | `NEXUS` |
| `font` | `ANSI Shadow`, `Small Slant` | `ANSI Shadow` |
| `color` | CSS color | `#8A5CF6` |
| `size` | `normal`, `small` | `normal` |
| `align` | `left`, `center`, `right` | `center` |

#### Section

```
section:
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
| `columns` | `1`, `2`, `3`, `4` | `2` | Number of card columns |

#### Card

| Property | Values | Default |
|----------|--------|---------|
| `type` | `big`, `mini` | `big` |
| `label` | string | — |
| `desc` | string | — |
| `path` | vault path | — |
| `icon` | icon name | — |
| `color` | CSS color | — |

#### Divider

```
divider:
  type: bold
  title: Section Title
```

| Property | Values | Default |
|----------|--------|---------|
| `type` | `default`, `bold`, `subtle`, `gradient`, `dashed` | `default` |
| `title` | string | — |

#### Graph

```
graph:
  exclude: Templates,Attachments
```

---

### `ascii`

| Property | Values | Default |
|----------|--------|---------|
| `font` | `ANSI Shadow`, `Small Slant` | `ANSI Shadow` |
| `color` | CSS color | `#8A5CF6` |
| `size` | number (em) | `1.0` |
| `align` | `left`, `center`, `right` | `center` |

---

## Settings

Open **Settings > Nexus Dashboard** to configure defaults:

- **General** — open on startup, graph links toggle
- **Layout** — MOC cards (drag-and-drop reorder)
- **ASCII Header** — title, font, color, size
- **Stats Bar** — folder + label pairs (click folder to select)
- **Recently Modified** — count, exclude folders
- **Divider Design** — 5 presets (default, bold, subtle, gradient, dashed)
- **Export / Import** — save / restore settings as JSON

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production build
```

## License

[MIT](LICENSE)
