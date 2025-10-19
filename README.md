# Sprig VS Code Extension

A VS Code extension that integrates with the Sprig code manager application, allowing you to save and retrieve code snippets, templates, functions, and components directly within your editor.

## Features

- **Save Code Selections**: Save selected code as snippets, templates, functions, or components to your Sprig database
- **Browse Library**: Search and browse your saved code items
- **Quick Insert**: Quickly insert saved code into your current document
- **Context Menus**: Right-click on selected code to save it to Sprig
- **Keyboard Shortcuts**: Fast access with customizable keybindings
- **Desktop App Integration**: Seamlessly works with the existing Sprig desktop application
- **Real-time Sync**: Items saved in VS Code appear instantly in the desktop app and vice versa

## Usage

### Saving Code
1. Select some code in your editor
2. Right-click and choose "Save Selection to Sprig" OR use `Ctrl+Alt+S`
3. Enter a name for your code item
4. Choose the type: snippet, template, function, or component
5. Optionally add a description

### Finding and Inserting Code
1. Use `Ctrl+Alt+F` or open Command Palette and type "Sprig: Search"
2. Browse through your saved items
3. Select an item to insert it at your cursor position

### Commands
- `Sprig: Save Selection to Sprig` - Save selected code to library
- `Sprig: Search Sprig Snippets` - Search and insert from library  
- `Sprig: Browse Sprig Library` - Open browser interface (coming soon)
- `Sprig: Insert from Sprig` - Alias for search command

### Keyboard Shortcuts
- `Ctrl+Alt+S` - Save selection to Sprig
- `Ctrl+Alt+F` - Search Sprig library

## Database Integration

The extension integrates seamlessly with the Sprig desktop application. It uses the same SQLite database located at `~/.sprig/sprig.db`. 

- If you already have the Sprig app with saved items, the VS Code extension will display them immediately
- Items saved from VS Code will appear in the Sprig desktop app
- Both applications share the same database schema for perfect synchronization

## Requirements

- VS Code 1.105.0 or higher
- Node.js for SQLite database functionality

## Development

To build and test the extension:

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch a new Extension Development Host window for testing.

## Release Notes

### 0.0.1

Initial release of Sprig VS Code Extension
- Save code selections to Sprig database
- Search and insert code from Sprig library
- Desktop app integration
- Context menus and keyboard shortcuts

## License

MIT
