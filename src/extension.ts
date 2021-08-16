import * as vscode from 'vscode';
import { addFilteredStartedEdit, filterLines, getFilters, getNextFileNameLine, getNextFileNameLineInDoc, RemovedLine, searchResultFilteringStarted, shouldContentChangeTriggerRefilter } from './searchHelpers';

// Original search results text per doc
let docOriginalSearchResults = new Map<vscode.Uri, string>();
let docLastRemovedLines = new Map<vscode.Uri, RemovedLine[]>();

/** Activate document closed handler */
function activateDocClosed(context: vscode.ExtensionContext): void
{
	const disposable = vscode.workspace.onDidCloseTextDocument((doc: vscode.TextDocument) => {
		if (docOriginalSearchResults.has(doc.uri))
			docOriginalSearchResults.delete(doc.uri);
		if (docLastRemovedLines.has(doc.uri))
			docLastRemovedLines.delete(doc.uri);
	});
	context.subscriptions.push(disposable);
}

// Was the last change a filter operation?
let lastChangeWasFilter = false;

/** Activate text change handler */
function activateTextChange(context: vscode.ExtensionContext): void
{
	const disposable = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
		const doc = e.document;
		// Is this a search result?
		if (doc.languageId === "search-result")
		{
			const editor = vscode.window.activeTextEditor;
			if (editor)
			{
				// Save text if we haven't started filtering
				const filteringStarted = searchResultFilteringStarted(doc);
				if (!filteringStarted)
				{
					docOriginalSearchResults.set(doc.uri, doc.getText());
					docLastRemovedLines.set(doc.uri, []);
				}

				// Get original text
				let origSearchText = docOriginalSearchResults.get(doc.uri);

				// If we started filtering, apply changes to search results back to original search
				if (!lastChangeWasFilter && filteringStarted && origSearchText !== undefined)
				{
					const removedLines = docLastRemovedLines.get(doc.uri) ?? [];
					for (const contentChange of e.contentChanges)
					{
						// Update range offset for removed lines
						let offsetAdjust = 0;
						let lastHiddenLine = -1;
						let visibleLineCnt = 0;
						let breakOnNextVisibleLine = false;
						for (let removedLine of removedLines)
						{
							const visibleLineCounBetween = (removedLine.line - (lastHiddenLine + 1));
							if (breakOnNextVisibleLine && visibleLineCounBetween > 0)
								break;
							visibleLineCnt += visibleLineCounBetween;
							lastHiddenLine = removedLine.line;
							if (visibleLineCnt >= contentChange.range.start.line)
							{
								if (visibleLineCnt === contentChange.range.start.line)
									breakOnNextVisibleLine = true;
								else
									break;
							}
							offsetAdjust += removedLine.length + 1;
						}

						// Set replaced text
						const rangeOffset = contentChange.rangeOffset + offsetAdjust;
						origSearchText = origSearchText.substring(0, rangeOffset) + contentChange.text + origSearchText.substring(rangeOffset + contentChange.rangeLength);
					}
					docOriginalSearchResults.set(doc.uri, origSearchText);
				}
				lastChangeWasFilter = false;

				// Should we filter?
				if (shouldContentChangeTriggerRefilter(e))
				{
					editor.edit((editBuilder: vscode.TextEditorEdit) => {
						// Get original text
						if (origSearchText !== undefined)
						{
							// Mark filtered as started
							const filters = getFilters(doc);
							if (!filteringStarted && filters.length > 0)
							{
								origSearchText = addFilteredStartedEdit(doc, editBuilder);
								docOriginalSearchResults.set(doc.uri, origSearchText);
							}

							// Figure out lines to replace
							const docReplaceStartLine = getNextFileNameLineInDoc(doc, 0) ?? doc.lineCount;
							const replaceStartPos = new vscode.Position(docReplaceStartLine, 0);
							const replaceEndPos = new vscode.Position(doc.lineCount, 0);
							const replaceRange = new vscode.Range(replaceStartPos, replaceEndPos);

							// Set replacement
							let origSearchLines = origSearchText.split("\n");
							let origSearchFirstResultsLine = getNextFileNameLine(origSearchLines, 0) ?? origSearchLines.length;
							origSearchLines = origSearchLines.slice(origSearchFirstResultsLine);
							const filteredLineInfo = filterLines(origSearchLines, filters);
							let filteredLines = filteredLineInfo.retainedLines;
							const newText = filteredLines.join("\n");
							if (doc.getText(replaceRange) !== newText)
							{
								editBuilder.replace(replaceRange, newText);
								lastChangeWasFilter = true;
							}

							// Build list of original text removed line offsets
							let removedLineOffsets: RemovedLine[] = [];
							let offsetAdjust = 0;
							for (let i = 0; i < origSearchFirstResultsLine; i++)
								offsetAdjust += origSearchLines[i].length + 1; // +1 for \n
							for (const removedLine of filteredLineInfo.removedLines)
							{
								removedLineOffsets.push({
									line: removedLine.line + origSearchFirstResultsLine,
									offset: removedLine.offset + offsetAdjust,
									length: removedLine.length
								});
							}
							docLastRemovedLines.set(doc.uri, removedLineOffsets);
						}
					});
				}
			}
		}
	});
	context.subscriptions.push(disposable);
}

/** Activate */
export function activate(context: vscode.ExtensionContext)
{
	activateDocClosed(context);
	activateTextChange(context);
}

/** Deactivate */
export function deactivate()
{
}
