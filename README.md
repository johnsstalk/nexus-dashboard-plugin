# Nexus Dashboard

ASCII art banners + theme-aware dashboard for your Obsidian vault.

## Install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/johnsstalk/nexus-dashboard-plugin/releases)
2. Create a folder `nexus-dashboard` in `.obsidian/plugins/`
3. Copy the three files into it
4. Enable the plugin in **Settings > Community Plugins**

## Usage

### Dashboard

Create a note with a `nexus-dashboard` code block:

````
```nexus-dashboard
header:
  text: MY VAULT
  color: #8A5CF6

toolbar: true
greeting: true
stats: true

section:
  title: Projects
  divider: true
  columns: 2
  cards:
    - type: big
      label: Project Alpha
      desc: Main project notes
      path: Project/Alpha
      icon: Project
      color: #FF6B6B

recently: true
```
````

### ASCII Art

````
```ascii
font: ANSI Shadow
color: #FF6B6B
size: 1.5
My Vault Title
```
````

### Commands

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
| `toolbar` | `true`, `false` | `false` | Show quick-action buttons |
| `greeting` | `true`, `false` | `false` | Show time-of-day greeting |
| `greetingName` | string | — | Personalized name |
| `recently` | `true`, `false` | `false` | Show recently modified notes |

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
| `font` | `ANSI Shadow` | `ANSI Shadow` |
| `color` | CSS color | `#8A5CF6` |
| `size` | `normal`, `small` | `normal` |
| `align` | `left`, `center`, `right` | `center` |

#### Section

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

| Property | Values | Default |
|----------|--------|---------|
| `title` | string | — |
| `divider` | `true`, `false` | `false` |
| `columns` | `2`, `3`, `4` | `2` |

#### Card

| Property | Values | Default |
|----------|--------|---------|
| `type` | `big`, `mini` | `big` |
| `label` | string | — |
| `desc` | string | — |
| `path` | vault path | — |
| `icon` | icon name | — |
| `color` | CSS color | — |

#### Graph

```
graph:
  exclude: Templates,Attachments
```

---

### `ascii`

| Property | Values | Default |
|----------|--------|---------|
| `font` | `ANSI Shadow` | `ANSI Shadow` |
| `color` | CSS color | `#8A5CF6` |
| `size` | number (em) | `1.0` |
| `align` | `left`, `center`, `right` | `center` |

---

## Settings

Open **Settings > Nexus Dashboard** to configure defaults:

- **General** — open on startup, greeting, toolbar
- **Layout** — 2/3-column, Compact, Wide
- **ASCII Header** — title, font, color, size
- **MOC Cards** — add, remove, reorder (drag-and-drop)
- **Stats Bar** — folder + label pairs
- **Recently Modified** — count, exclude folders
- **Divider Design** — 5 presets + advanced CSS
- **Export/Import** — save/restore settings as JSON

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production build
```

## License

[MIT](LICENSE)
