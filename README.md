# Nexus Dashboard

Code-block driven MOC dashboard for Obsidian.

## Install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/johnsstalk/nexus-dashboard-plugin/releases)
2. Create a folder `nexus-dashboard` in `.obsidian/plugins/`
3. Copy the three files into it
4. Enable the plugin in **Settings > Community Plugins**

## Quick Start

Create a note with a `nexus-dashboard` code block:

````
```nexus-dashboard
```
````

You can configure default settings in **Settings > Community Plugins > Nexus Dashboard**.

## Dashboard Components

### ASCII header
An ASCII art banner at the top of your dashboard.

Properties: `text`, `font`, `color`, `size`, `mobileSize`, `align`

````
```nexus-dashboard
header:
  text: MY VAULT
  font: ANSI Shadow
  color: #8A5CF6
  size: 1.0
  mobileSize: 0.5
  align: center
```
````

### Stats bar
Shows file/folder counts from selected folders.

Properties: `show` (true/false)

````
```nexus-dashboard
stats: true
```
````

### Section
A card grid area.

Properties: `columns` (1–4)

````
```nexus-dashboard
section:
  columns: 2
```
````

### Card
A navigation link inside a section.

Card entries start with `- type:` (big or mini). Each section must contain only one card type — the section picks a single grid (mini-grid or big-grid) based on the first card, mixing types forces all cards into the wrong layout.

Properties: `type` (big/mini), `label`, `desc`, `path`, `icon`, `color`, `columns` (1–4 on parent section)

Big cards:

````
```nexus-dashboard
section:
  columns: 2
  cards:
    - type: big
      label: Journal
      desc: Daily reflections
      path: MOC/Journal MOC.md
      icon: Journal
      color: #8A5CF6
```
````

Mini cards:

````
```nexus-dashboard
section:
  columns: 3
  cards:
    - type: mini
      label: Quick Link
      path: MOC/Book Notes MOC.md
      icon: Book
```
````

### Divider
A horizontal separator between sections.

Properties: `title`, `type` (default, bold, subtle, gradient, dashed)

````
```nexus-dashboard
divider:
  type: bold
  title: Archive
```
````

### Recently modified
Shows the N most recently modified notes.

````
```nexus-dashboard
recently: true
```
````

### Graph links
Injects wiki links at the bottom for visual navigation.

Properties: `showGraph`, `exclude` (comma-separated folder names)

````
```nexus-dashboard
graph:
  showGraph: true
  exclude: Templates,Attachments
```
````

## Commands

Open **Ctrl+P** / **Cmd+P** and search:

- `Open dashboard` — opens the full dashboard view
- `Insert Nexus Dashboard code block` — inserts an empty code block
- `Insert ASCII art block` — inserts a header code block
- `Render selection as ASCII art` — wraps selected text in a header block

## Settings

Open **Settings > Community Plugins > Nexus Dashboard** to configure:

- **General** — open on startup
- **ASCII header** — title, font, color, size, mobile size, alignment
- **Layout** — MOC grid columns, mini grid columns, show graph links, add/reorder/edit MOC cards
- **Stats** — show stats bar, add/edit/remove stat entries
- **Recently modified** — show toggle, count, exclude folders, divider label, divider design presets
- **Export / Import** — save / restore settings as JSON
- **Reset** — reset to defaults

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production build
```

## License

[MIT](LICENSE)
