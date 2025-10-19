import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

interface SprigItem {
    id: number;
    title: string;
    content: string;
    language: string;
    type: 'snippet' | 'template' | 'function' | 'component';
    tags?: string;
    created_at?: string;
}

class SprigManager {
    private dbPath: string;
    private sqlite3: any = null;

    constructor() {
        this.dbPath = path.join(os.homedir(), '.sprig', 'sprig.db');
    }

    private getSqlite3() {
        if (!this.sqlite3) {
            try {
                this.sqlite3 = require('sqlite3').verbose();
            } catch (error) {
                throw new Error(`Failed to load sqlite3: ${error}`);
            }
        }
        return this.sqlite3;
    }

    private async executeQuery(query: string, params: any[] = []): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const sqlite3 = this.getSqlite3();
            const db = new sqlite3.Database(this.dbPath, (err: any) => {
                if (err) {
                    reject(new Error(`Failed to open database: ${err.message}`));
                    return;
                }
            });

            db.all(query, params, (err: any, rows: any[]) => {
                if (err) {
                    db.close();
                    reject(new Error(`Database query failed: ${err.message}`));
                    return;
                }
                
                db.close(() => {
                    resolve(rows || []);
                });
            });
        });
    }

    async searchItems(): Promise<SprigItem[]> {
        try {
            const sql = 'SELECT * FROM items ORDER BY created_at DESC';
            const rows = await this.executeQuery(sql);

            return rows;
        } catch (error) {
            return [];
        }
    }

    async saveItem(item: Omit<SprigItem, 'id'>): Promise<void> {
        try {
            const sql = `INSERT INTO items (title, content, language, type, tags, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`;
            await this.executeQuery(sql, [item.title, item.content, item.language, item.type, item.tags]);

        } catch (error) {
            throw error;
        }
    }
}

let sprigManager: SprigManager;
let sprigStatusBar: vscode.StatusBarItem;
let sprigInlineDecorations: vscode.TextEditorDecorationType;

function updateInlineDecorations(editor: vscode.TextEditor) {
    if (!editor) {
        return;
    }

    const decorations: vscode.DecorationOptions[] = [];
    
    // Show decoration only if text is selected
    if (!editor.selection.isEmpty) {
        const decoration: vscode.DecorationOptions = {
            range: new vscode.Range(editor.selection.end, editor.selection.end),
            hoverMessage: 'Click to save selected code to Sprig library'
        };
        decorations.push(decoration);
    }

    editor.setDecorations(sprigInlineDecorations, decorations);
}

export function activate(context: vscode.ExtensionContext) {
    sprigManager = new SprigManager();
    
    // Create inline decorations for when text is selected
    sprigInlineDecorations = vscode.window.createTextEditorDecorationType({
        after: {
            contentText: ' 🌿 Save to Sprig',
            color: '#4CAF50',
            fontStyle: 'italic',
            margin: '0 0 0 10px',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            border: '1px solid rgba(76, 175, 80, 0.3)'
        },
        cursor: 'pointer'
    });
    
    // Show inline decoration when text is selected
    vscode.window.onDidChangeTextEditorSelection(event => {
        updateInlineDecorations(event.textEditor);
    }, null, context.subscriptions);
    
    // Update decorations when active editor changes
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            updateInlineDecorations(editor);
        }
    }, null, context.subscriptions);

    // Add hover provider to show save action when text is selected
    const hoverProvider = vscode.languages.registerHoverProvider('*', {
        provideHover(document, position, token) {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== document || editor.selection.isEmpty) {
                return;
            }

            // Only show hover if cursor is near the selection
            if (position.line >= editor.selection.start.line && position.line <= editor.selection.end.line) {
                const commandUri = vscode.Uri.parse(`command:sprig.saveSelection`);
                const contents = new vscode.MarkdownString(`[🌿 Save to Sprig](${commandUri})`);
                contents.isTrusted = true;
                return new vscode.Hover(contents);
            }
        }
    });
    
    // Refresh CodeLens when document content changes (user types)
    vscode.workspace.onDidChangeTextDocument(event => {
        // Trigger CodeLens refresh when user types
        if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
            vscode.commands.executeCommand('vscode.executeCodeLensProvider', event.document.uri);
        }
    }, null, context.subscriptions);

    // Search command
    let searchSnippets = vscode.commands.registerCommand('sprig.searchSnippets', async () => {
        try {
            const items = await sprigManager.searchItems();
            
            if (items.length === 0) {
                vscode.window.showInformationMessage('No items found in Sprig library');
                return;
            }

            const quickPickItems = items.map(item => ({
                label: item.title,
                description: `${item.type} - ${item.language || 'unknown'}`,
                detail: item.tags || '',
                item: item
            }));

            const selected = await vscode.window.showQuickPick(quickPickItems, {
                placeHolder: 'Select a code item to insert'
            });

            if (selected) {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    editor.edit(editBuilder => {
                        editBuilder.insert(editor.selection.active, selected.item.content);
                    });
                    vscode.window.showInformationMessage(`Inserted "${selected.item.title}"`);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to search Sprig library: ${error}`);
        }
    });

    // Save command
    let saveSelection = vscode.commands.registerCommand('sprig.saveSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !editor.selection || editor.selection.isEmpty) {
            vscode.window.showWarningMessage('Please select some code to save to Sprig');
            return;
        }

        const selectedCode = editor.document.getText(editor.selection);
        const language = editor.document.languageId;

        const title = await vscode.window.showInputBox({
            prompt: 'Enter a title for this code item',
            placeHolder: 'My awesome snippet'
        });

        if (!title) {
            return;
        }

        const type = await vscode.window.showQuickPick(
            ['snippet', 'template', 'function', 'component'],
            { placeHolder: 'Select the type of code item' }
        ) as SprigItem['type'];

        if (!type) {
            return;
        }

        const tags = await vscode.window.showInputBox({
            prompt: 'Enter tags (optional, comma-separated)',
            placeHolder: 'react, utility, helper'
        });

        try {
            await sprigManager.saveItem({
                title,
                content: selectedCode,
                language,
                type,
                tags: tags || ''
            });

            vscode.window.showInformationMessage(`Saved "${title}" to Sprig library!`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save to Sprig: ${error}`);
        }
    });

    let openBrowser = vscode.commands.registerCommand('sprig.openBrowser', async () => {
        try {
            const { spawn, exec } = require('child_process');
            const path = require('path');
            const os = require('os');
            const fs = require('fs');
            
            // Function to check if file exists
            const fileExists = (filePath: string): Promise<boolean> => {
                return new Promise((resolve) => {
                    fs.access(filePath, fs.constants.F_OK, (err: any) => {
                        resolve(!err);
                    });
                });
            };
            
            // Common paths where Sprig might be installed
            const possiblePaths = [
                path.join('C:', 'Program Files', 'Sprig', 'Sprig.exe'),
                path.join('C:', 'Program Files (x86)', 'Sprig', 'Sprig.exe'),
                path.join('C:', 'Program Files', 'Sprig', 'sprig.exe'),
                path.join('C:', 'Program Files (x86)', 'Sprig', 'sprig.exe'),
                path.join(os.homedir(), 'AppData', 'Local', 'Sprig', 'Sprig.exe'),
                path.join(os.homedir(), 'Desktop', 'Sprig.exe')
            ];
            
            let sprigPath = null;
            
            // Check if Sprig is installed in any common location
            for (const appPath of possiblePaths) {
                if (await fileExists(appPath)) {
                    sprigPath = appPath;
                    break;
                }
            }
            
            // Check if it's available in PATH
            if (!sprigPath) {
                await new Promise<void>((resolve) => {
                    exec('where Sprig.exe', (error: any, stdout: string) => {
                        if (!error && stdout.trim()) {
                            sprigPath = stdout.trim().split('\n')[0];
                        } else {
                            exec('where sprig.exe', (error2: any, stdout2: string) => {
                                if (!error2 && stdout2.trim()) {
                                    sprigPath = stdout2.trim().split('\n')[0];
                                }
                                resolve();
                            });
                            return;
                        }
                        resolve();
                    });
                });
            }
            
            if (sprigPath) {
                // Sprig is installed, launch it
                try {
                    const child = spawn(sprigPath, [], { 
                        detached: true, 
                        stdio: 'ignore',
                        shell: true 
                    });
                    
                    child.unref();
                    vscode.window.showInformationMessage('Sprig application launched!');
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to launch Sprig: ${error}`);
                }
            } else {
                // Sprig not installed, show download option
                const action = await vscode.window.showInformationMessage(
                    'Sprig desktop application is not installed on this device.',
                    'Download Sprig Desktop App',
                    'Cancel'
                );
                
                if (action === 'Download Sprig Desktop App') {
                    // Open download page in browser
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/Emmyme/sprig/releases')); // Update with actual download URL
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to check for Sprig installation: ${error}`);
        }
    });

    let insertSnippet = vscode.commands.registerCommand('sprig.insertSnippet', () => {
        vscode.commands.executeCommand('sprig.searchSnippets');
    });

    // Register a command for quick save from CodeLens
    let quickSave = vscode.commands.registerCommand('sprig.quickSave', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }
        
        if (editor.selection.isEmpty) {
            // If no selection, offer to save entire file or show info
            vscode.window.showInformationMessage('Please select some code first, then use the save command');
            return;
        }
        
        // Execute the regular save command
        vscode.commands.executeCommand('sprig.saveSelection');
    });

    // Register command to handle Sprig icon clicks
    let sprigIconClick = vscode.commands.registerCommand('sprig.iconClick', () => {
        // Show quick pick menu for Sprig actions
        const actions = [
            { label: '🌿 Search Sprig Library', command: 'sprig.searchSnippets' },
            { label: '🌿 Save Selection', command: 'sprig.saveSelection' },
            { label: '� Browse Sprig Desktop App', command: 'sprig.openBrowser' }
        ];

        vscode.window.showQuickPick(actions, {
            placeHolder: 'What would you like to do with Sprig?'
        }).then(selected => {
            if (selected) {
                vscode.commands.executeCommand(selected.command);
            }
        });
    });

    // Register CodeLens provider to show Sprig actions as soon as user starts typing
    const codeLensProvider = vscode.languages.registerCodeLensProvider('*', {
        provideCodeLenses: (document: vscode.TextDocument) => {
            const codeLenses: vscode.CodeLens[] = [];
            
            // Show Sprig actions if document has any content or user is actively editing
            if (document.lineCount > 1 || (document.lineCount === 1 && document.lineAt(0).text.trim().length > 0)) {
                // Add CodeLens at the top of the document for easy access
                const range = new vscode.Range(0, 0, 0, 0);
                
                const searchCodeLens = new vscode.CodeLens(range);
                searchCodeLens.command = {
                    title: '🌿 Search & Insert from Sprig',
                    command: 'sprig.searchSnippets',
                    tooltip: 'Search Sprig library and insert code'
                };
                codeLenses.push(searchCodeLens);
                
                // Always show save option (it will check for selection when clicked)
                const saveRange = new vscode.Range(0, 0, 0, 0);
                const saveCodeLens = new vscode.CodeLens(saveRange);
                saveCodeLens.command = {
                    title: '🌿 Save Selection to Sprig',
                    command: 'sprig.quickSave',
                    tooltip: 'Save selected code to Sprig library (select code first)'
                };
                codeLenses.push(saveCodeLens);
                
                // Check if Sprig is installed to show appropriate browse option
                // For now, just show browse option (installation detection handled in command)
                const browseRange = new vscode.Range(0, 0, 0, 0);
                const browseCodeLens = new vscode.CodeLens(browseRange);
                
                browseCodeLens.command = {
                    title: '🔍 Browse Sprig App',
                    command: 'sprig.openBrowser',
                    tooltip: 'Browse Sprig desktop application to manage your library'
                };
                codeLenses.push(browseCodeLens);
            }
            
            return codeLenses;
        }
    });

    // Create status bar item with Sprig icon (after commands are registered)
    sprigStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    sprigStatusBar.text = '🌿 Sprig';
    sprigStatusBar.tooltip = 'Sprig Code Manager - Search, Save & Browse your code library';
    sprigStatusBar.command = 'sprig.iconClick';
    sprigStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    sprigStatusBar.show();

    context.subscriptions.push(searchSnippets, saveSelection, openBrowser, insertSnippet, quickSave, sprigIconClick, sprigStatusBar, codeLensProvider, hoverProvider);
}

export function deactivate() {
    // Clean up
}