import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Sprig Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start Sprig extension tests.');

	test('Extension should be present', async () => {
		const extension = vscode.extensions.getExtension('Emmyme.sprig');
		assert.ok(extension);
	});

	test('Extension should activate', async () => {
		const extension = vscode.extensions.getExtension('Emmyme.sprig');
		if (extension && !extension.isActive) {
			await extension.activate();
		}
		assert.ok(extension?.isActive);
	});

	test('Commands should be registered', async () => {
		const commands = await vscode.commands.getCommands();
		assert.ok(commands.includes('sprig.saveSelection'));
		assert.ok(commands.includes('sprig.openBrowser'));
		assert.ok(commands.includes('sprig.searchSnippets'));
		assert.ok(commands.includes('sprig.insertSnippet'));
	});
});
