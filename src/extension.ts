import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

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

    constructor() {
        this.dbPath = path.join(os.homedir(), '.sprig', 'sprig.db');
    }

    private async executeQuery(query: string, params: any[] = []): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const script = `
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('${this.dbPath.replace(/\\/g, '\\\\')}');

db.all(\`${query}\`, ${JSON.stringify(params)}, (err, rows) => {
    if (err) {
        process.exit(1);
    }
    console.log(JSON.stringify(rows || []));
    db.close();
});
            `;

            const child = spawn('node', ['-e', script], {
                cwd: path.dirname(__dirname),
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Database query failed: ${stderr}`));
                    return;
                }

                try {
                    const result = JSON.parse(stdout.trim());
                    resolve(result);
                } catch (e) {
                    reject(new Error(`Failed to parse database result: ${stdout}`));
                }
            });

            child.on('error', (err) => {
                reject(new Error(`Failed to spawn database process: ${err.message}`));
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
    
    sprigStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    sprigStatusBar.text = '🌿 Sprig';
    sprigStatusBar.tooltip = 'Sprig Code Manager - Search, Save & Browse your code library';
    sprigStatusBar.command = 'sprig.iconClick';
    sprigStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    sprigStatusBar.show();
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
    vscode.window.onDidChangeTextEditorSelection(event => {
        updateInlineDecorations(event.textEditor);
    }, null, context.subscriptions);
    
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            updateInlineDecorations(editor);
        }
    }, null, context.subscriptions);
    const hoverProvider = vscode.languages.registerHoverProvider('*', {
        provideHover(document, position, token) {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== document || editor.selection.isEmpty) {
                return;
            }

            if (position.line >= editor.selection.start.line && position.line <= editor.selection.end.line) {
                const commandUri = vscode.Uri.parse(`command:sprig.saveSelection`);
                const contents = new vscode.MarkdownString(`[🌿 Save to Sprig](${commandUri})`);
                contents.isTrusted = true;
                return new vscode.Hover(contents);
            }
        }
    });
    vscode.workspace.onDidChangeTextDocument(event => {
        if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
            vscode.commands.executeCommand('vscode.executeCodeLensProvider', event.document.uri);
        }
    }, null, context.subscriptions);
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
            
            const possiblePaths = [
                path.join('C:', 'Program Files', 'Sprig', 'Sprig.exe'),
                path.join('C:', 'Program Files (x86)', 'Sprig', 'Sprig.exe'),
                path.join(process.cwd(), '..', 'sprig', 'build', 'bin', 'Sprig.exe'),
                path.join(os.homedir(), 'AppData', 'Local', 'Sprig', 'Sprig.exe'),
                path.join(os.homedir(), 'Desktop', 'Sprig.exe'),
                path.join(os.homedir(), 'AppData', 'Local', 'sprig', 'sprig.exe'),
                path.join(os.homedir(), 'Desktop', 'sprig.exe'),
                path.join(process.cwd(), '..', 'sprig', 'build', 'bin', 'sprig.exe')
            ];
            
            let sprigPath: string | null = null;
            
            for (const appPath of possiblePaths) {
                if (await fileExists(appPath)) {
                    sprigPath = appPath;
                    break;
                }
            }
            
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
            
            const devPath = path.join(process.cwd(), '..', 'sprig');
            const isDevEnvironment = await fileExists(path.join(devPath, 'wails.json'));
            
            if (sprigPath) {
                try {
                    exec(`start "" "${sprigPath}"`, { shell: true }, (error: any, stdout: string, stderr: string) => {
                        if (error) {
                            exec(`powershell -Command "Start-Process -FilePath '${sprigPath}'"`, (error2: any) => {
                                if (error2) {
                                    exec(`"${sprigPath}"`, (error3: any) => {
                                        if (error3) {
                                            vscode.window.showErrorMessage(`Failed to launch Sprig: ${error3.message}`);
                                        } else {
                                            vscode.window.showInformationMessage('Sprig launched successfully!');
                                        }
                                    });
                                } else {
                                    vscode.window.showInformationMessage('Sprig launched successfully!');
                                }
                            });
                        } else {
                            vscode.window.showInformationMessage('Sprig launched successfully!');
                        }
                    });
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to launch Sprig: ${error}`);
                }
            } else if (isDevEnvironment) {
                try {
                    const child = spawn('wails', ['dev'], {
                        cwd: devPath,
                        detached: true,
                        stdio: 'ignore',
                        shell: true
                    });
                    
                    child.unref();
                    vscode.window.showInformationMessage('Sprig application started in development mode!');
                } catch (error) {
                    vscode.window.showErrorMessage('Development environment found but failed to start. Make sure Wails is installed.');
                }
            } else {
                const action = await vscode.window.showInformationMessage(
                    'Sprig desktop application is not installed on this device.',
                    'Download Sprig Desktop App',
                    'Cancel'
                );
                
                if (action === 'Download Sprig Desktop App') {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/Emmyme/sprig/releases'));
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to check for Sprig installation: ${error}`);
        }
    });

    let insertSnippet = vscode.commands.registerCommand('sprig.insertSnippet', () => {
        vscode.commands.executeCommand('sprig.searchSnippets');
    });

    let quickSave = vscode.commands.registerCommand('sprig.quickSave', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }
        
        if (editor.selection.isEmpty) {
            vscode.window.showInformationMessage('Please select some code first, then use the save command');
            return;
        }
        
        vscode.commands.executeCommand('sprig.saveSelection');
    });
    let sprigIconClick = vscode.commands.registerCommand('sprig.iconClick', () => {
        const actions = [
            { label: '🌿 Search Sprig Library', command: 'sprig.searchSnippets' },
            { label: '🌿 Save Selection', command: 'sprig.saveSelection' },
            { label: '🔍 Browse Sprig Desktop App', command: 'sprig.openBrowser' }
        ];

        vscode.window.showQuickPick(actions, {
            placeHolder: 'What would you like to do with Sprig?'
        }).then(selected => {
            if (selected) {
                vscode.commands.executeCommand(selected.command);
            }
        });
    });
    const codeLensProvider = vscode.languages.registerCodeLensProvider('*', {
        provideCodeLenses: (document: vscode.TextDocument) => {
            const codeLenses: vscode.CodeLens[] = [];
            
            if (document.lineCount > 1 || (document.lineCount === 1 && document.lineAt(0).text.trim().length > 0)) {
                const range = new vscode.Range(0, 0, 0, 0);
                
                const searchCodeLens = new vscode.CodeLens(range);
                searchCodeLens.command = {
                    title: '🌿 Search & Insert from Sprig',
                    command: 'sprig.searchSnippets',
                    tooltip: 'Search Sprig library and insert code'
                };
                codeLenses.push(searchCodeLens);
                
                const saveRange = new vscode.Range(0, 0, 0, 0);
                const saveCodeLens = new vscode.CodeLens(saveRange);
                saveCodeLens.command = {
                    title: '🌿 Save Selection to Sprig',
                    command: 'sprig.quickSave',
                    tooltip: 'Save selected code to Sprig library (select code first)'
                };
                codeLenses.push(saveCodeLens);
                
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

    context.subscriptions.push(searchSnippets, saveSelection, openBrowser, insertSnippet, quickSave, sprigIconClick, sprigStatusBar, codeLensProvider, hoverProvider);
}

export function deactivate() {}