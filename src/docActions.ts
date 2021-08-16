import * as vscode from 'vscode';

/**
 * Get line of text
 *
 * @param {vscode.TextDocument} doc Document
 * @param {number} line Line number
 *
 * @return {string} Line
 */
export function getDocLine(doc: vscode.TextDocument, line: number): string
{
	const start = new vscode.Position(line, 0);
	const end = doc.positionAt(doc.offsetAt(new vscode.Position(line + 1, 0)) - 1);
	return doc.getText(new vscode.Range(start, end));
}
