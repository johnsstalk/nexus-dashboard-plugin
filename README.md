# Nexus Dashboard

ASCII art banners + theme-aware dashboard for your vault — stats, MOC cards, and recently modified notes via simple code blocks.

## Features

- **Dashboard View** — Open a full dashboard with vault stats, MOC cards, and recently modified notes
- **Code Blocks** — Use `nexus-dashboard` code blocks to embed dashboards anywhere
- **ASCII Art** — Use `ascii` code blocks to render text with FIGlet fonts
- **Theme-Aware** — Automatically adapts to your Obsidian theme
- **Commands** — Quick access via command palette or ribbon icon

## Installation

### From Obsidian Community Plugins

1. Open Settings → Community Plugins → Browse
2. Search for "Nexus Dashboard"
3. Install and enable

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a folder `nexus-dashboard` in your vault's `.obsidian/plugins/` directory
3. Copy the files into that folder
4. Enable the plugin in Settings → Community Plugins

## Usage

### Dashboard

Open the dashboard via:
- The ribbon icon (layout icon in the sidebar)
- Command palette: `Open dashboard`

### Code Blocks

#### Nexus Dashboard

````markdown
```nexus-dashboard
```
````

#### ASCII Art

````markdown
```ascii
font: slant
text: Hello World
```
````

## Development

```bash
npm install
npm run dev
```

## License

MIT
