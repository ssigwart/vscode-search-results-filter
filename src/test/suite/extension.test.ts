import * as assert from "assert";
import * as vscode from "vscode";

suite('Extension Test Suite', () => {
	test('Test Filtering', async function () {
		this.timeout(10000);
		const initialText = [
			"6 results - 3 files",
			"",
			"dir1/fileA.txt:",
			"  4: line text",
			"  10: another line",
			"  17: something else",
			"",
			"dir1/fileB.txt:",
			"  1: file B line",
			"  2: more file B",
			"",
			"dir2/fileA.txt:",
			"  1: dir 2 file A line"
		].join("\n");
		await vscode.workspace.openTextDocument({
			language: "search-result"
		}).then(async (doc: vscode.TextDocument) => {
			return vscode.window.showTextDocument(doc).then((editor: vscode.TextEditor) => {
				return editor.edit((editBuilder: vscode.TextEditorEdit) => {
					editBuilder.insert(new vscode.Position(0, 0), initialText);
				}).then((success: boolean) => {
					assert.strictEqual(true, success);
					assert.strictEqual(initialText, doc.getText());
					// Test file exclusion
					return editor.edit((editBuilder: vscode.TextEditorEdit) => {
						editBuilder.insert(new vscode.Position(1, 0), "file-dir1");
					});
				}).then((success: boolean) => {
					assert.strictEqual(true, success);
					const expectedText = [
						"6 results - 3 files (Filtered)",
						"file-dir1",
						"dir2/fileA.txt:",
						"  1: dir 2 file A line"
					].join("\n");
					// TODO: Timeouts probably aren't the best way to test test, but is seems to work okay most of the time
					return new Promise<void>((resolve: () => any) => {
						setTimeout(() => {
							assert.strictEqual(expectedText, doc.getText());
							resolve();
						}, 500);
					});
				}).then(() => {
					// Test file inclusion
					return editor.edit((editBuilder: vscode.TextEditorEdit) => {
						editBuilder.replace(new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 9999)), "file+dir1");
					});
				}).then((success: boolean) => {
					assert.strictEqual(true, success);
					const expectedText = [
						"6 results - 3 files (Filtered)",
						"file+dir1",
						"dir1/fileA.txt:",
						"  4: line text",
						"  10: another line",
						"  17: something else",
						"",
						"dir1/fileB.txt:",
						"  1: file B line",
						"  2: more file B"
					].join("\n");
					return new Promise<void>((resolve: () => any) => {
						setTimeout(() => {
							assert.strictEqual(expectedText, doc.getText().trimEnd());
							resolve();
						}, 500);
					});
				}).then(() => {
					// Test word inclusion
					return editor.edit((editBuilder: vscode.TextEditorEdit) => {
						editBuilder.replace(new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 9999)), "+line");
					});
				}).then((success: boolean) => {
					assert.strictEqual(true, success);
					const expectedText = [
						"6 results - 3 files (Filtered)",
						"+line",
						"dir1/fileA.txt:",
						"  4: line text",
						"  10: another line",
						"",
						"dir1/fileB.txt:",
						"  1: file B line",
						"",
						"dir2/fileA.txt:",
						"  1: dir 2 file A line"
					].join("\n");
					return new Promise<void>((resolve: () => any) => {
						setTimeout(() => {
							assert.strictEqual(expectedText, doc.getText().trimEnd());
							resolve();
						}, 500);
					});
				}).then(() => {
					// Test second word inclusion
					return editor.edit((editBuilder: vscode.TextEditorEdit) => {
						editBuilder.insert(new vscode.Position(1, 9999), "\n+file");
					});
				}).then((success: boolean) => {
					assert.strictEqual(true, success);
					const expectedText = [
						"6 results - 3 files (Filtered)",
						"+line",
						"+file",
						"dir1/fileB.txt:",
						"  1: file B line",
						"",
						"dir2/fileA.txt:",
						"  1: dir 2 file A line"
					].join("\n");
					return new Promise<void>((resolve: () => any) => {
						setTimeout(() => {
							assert.strictEqual(expectedText, doc.getText().trimEnd());
							resolve();
						}, 500);
					});
				}).then(() => {
					// Test edits in body section
					return editor.edit((editBuilder: vscode.TextEditorEdit) => {
						editBuilder.insert(new vscode.Position(4, 5), "Test ");
					});
				}).then((success: boolean) => {
					assert.strictEqual(true, success);
					const expectedText = [
						"6 results - 3 files (Filtered)",
						"+line",
						"+file",
						"dir1/fileB.txt:",
						"  1: Test file B line",
						"",
						"dir2/fileA.txt:",
						"  1: dir 2 file A line"
					].join("\n");
					return new Promise<void>((resolve: () => any) => {
						setTimeout(() => {
							assert.strictEqual(expectedText, doc.getText().trimEnd());
							resolve();
						}, 500);
					});
				});
			});
		});

		// Close editors
		vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});
});
