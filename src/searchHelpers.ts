import * as vscode from 'vscode';
import { getDocLine } from './docActions';

const FILE_NAME_LINE_REGEX = /^(\S.*):$/;
const RESULT_LINE_REGEX = /^(\s+)(\d+)(:| ) (.*)$/;
const SEARCH_LINE_SUFFIX = ' (Filtered)';

/**
 * Check if search result filtering has started
 */
export function searchResultFilteringStarted(doc: vscode.TextDocument): boolean
{
	const firstLine = getDocLine(doc, 0);
	return firstLine.endsWith(SEARCH_LINE_SUFFIX);
}

/**
 * Add filtering started text edit
 */
export function addFilteredStartedEdit(doc: vscode.TextDocument, editBuilder: vscode.TextEditorEdit): string
{
	const firstLine = getDocLine(doc, 0);
	if (!firstLine.endsWith(SEARCH_LINE_SUFFIX))
	{
		const line2Pos = new vscode.Position(1, 0);
		const pos = doc.positionAt(doc.offsetAt(line2Pos) - 1);
		editBuilder.insert(pos, SEARCH_LINE_SUFFIX);
		return doc.getText(new vscode.Range(new vscode.Position(0, 0), pos)) + SEARCH_LINE_SUFFIX + "\n" + doc.getText(new vscode.Range(line2Pos, new vscode.Position(doc.lineCount, 0)));
	}
	return doc.getText();
}

/**
 * Should content change trigger re-filter?
 */
export function shouldContentChangeTriggerRefilter(e: vscode.TextDocumentChangeEvent): boolean
{
	// We should always refilter because we need to keep track fo changes to the original search
	return true;
}

export interface SearchFilter
{
	line: number;
	isFilenameFilter: boolean;
	include?: string;
	exclude?: string;
}

/**
 * Get filters
 */
export function getFilters(doc: vscode.TextDocument): SearchFilter[]
{
	let rtn: SearchFilter[] = [];
	for (let line = 0; line < doc.lineCount; line++)
	{
		let lineText = getDocLine(doc, line);

		// Only allow filters before first file line
		if (FILE_NAME_LINE_REGEX.exec(lineText) !== null)
			break;

		// Is this a filename filter?
		const isFilenameFilter = lineText.startsWith("file");
		if (isFilenameFilter)
			lineText = lineText.substring(4);

		// Make sure we have at least one character after +/-
		if (lineText.length > 1)
		{
			if (lineText.startsWith("+"))
			{
				rtn.push({
					line: line,
					isFilenameFilter: isFilenameFilter,
					include: lineText.substring(1)
				});
			}
			else if (lineText.startsWith("-"))
			{
				rtn.push({
					line: line,
					isFilenameFilter: isFilenameFilter,
					exclude: lineText.substring(1)
				});
			}
		}
	}
	return rtn;
}

/**
 * Get next file name line
 */
export function getNextFileNameLine(lines: string[], startLine: number): number|undefined
{
	while (startLine < lines.length)
	{
		if (FILE_NAME_LINE_REGEX.exec(lines[startLine]) !== null)
			return startLine;
		startLine++;
	}
	return undefined;
}

/**
 * Get next file name line
 */
export function getNextFileNameLineInDoc(doc: vscode.TextDocument, startLine: number): number|undefined
{
	while (startLine < doc.lineCount)
	{
		if (FILE_NAME_LINE_REGEX.exec(getDocLine(doc, startLine)) !== null)
			return startLine;
		startLine++;
	}
	return undefined;
}

/**
 * Should text be shown based on filters
 */
export function shouldTextShow(text: string, filters: SearchFilter[]): boolean
{
	if (filters.length === 0)
		return true;

	// Check that the line matches content
	if (FILE_NAME_LINE_REGEX.exec(text) === null && RESULT_LINE_REGEX.exec(text) === null)
		return true;

	// Check filters
	return _shouldTextShow(text, filters);
}

/**
 * Should text be shown based on non-empty filters
 */
function _shouldTextShow(text: string, filters: SearchFilter[]): boolean
{
	// Check filters
	for (const filter of filters)
	{
		if (filter.include !== undefined)
		{
			if (text.indexOf(filter.include) === -1)
				return false;
		}
		else if (filter.exclude !== undefined)
		{
			if (text.indexOf(filter.exclude) !== -1)
				return false;
		}
	}

	return true;
}

/** Removed line */
export interface RemovedLine
{
	line: number;
	offset: number;
	length: number
}

/** Filtered lines info */
export interface FilteredLinesInfo
{
	retainedLines: string[];
	removedLines: RemovedLine[];
}

/**
 * Filter lines
 */
export function filterLines(lines: string[], filters: SearchFilter[]): FilteredLinesInfo
{
	if (filters.length === 0)
	{
		return {
			retainedLines: lines.slice(),
			removedLines: []
		};
	}

	// Split filters into file vs result
	const fileNameFilters = filters.filter(function(filter: SearchFilter) { return filter.isFilenameFilter; });
	const resultFilters = filters.filter(function(filter: SearchFilter) { return !filter.isFilenameFilter; });

	let retainedLines: string[] = [];
	let retainedLineNums: number[] = [];
	let removeOnNextFileLineCnt = 0;
	let removeUntilNextFileLine = false;
	let lineNum = 0;
	for (const lineText of lines)
	{
		// Check that the line matches content
		if (FILE_NAME_LINE_REGEX.exec(lineText) !== null)
		{
			// Should previous lines be removed if we see the next file line before content?
			while (removeOnNextFileLineCnt > 0)
			{
				retainedLines.pop();
				retainedLineNums.pop();
				removeOnNextFileLineCnt--;
			}

			// Check file name filter
			removeUntilNextFileLine = (fileNameFilters.length > 0 && !_shouldTextShow(lineText, fileNameFilters));
			if (!removeUntilNextFileLine)
			{
				retainedLines.push(lineText);
				retainedLineNums.push(lineNum);

				// We should remove this line if we see another file line with no result between
				removeOnNextFileLineCnt = 1;
			}
		}
		else if (RESULT_LINE_REGEX.exec(lineText) !== null)
		{
			if (!removeUntilNextFileLine)
			{
				if (resultFilters.length === 0 || _shouldTextShow(lineText, resultFilters))
				{
					retainedLines.push(lineText);
					retainedLineNums.push(lineNum);
					removeOnNextFileLineCnt = 0;
				}
			}
		}
		else
		{
			retainedLines.push(lineText);
			retainedLineNums.push(lineNum);

			// Should this line be removed if we see the next file line before content?
			if (removeOnNextFileLineCnt > 0 || removeUntilNextFileLine)
			{
				if (lineText === "")
					removeOnNextFileLineCnt++;
				else
					removeOnNextFileLineCnt = 0;
			}
		}
		lineNum++;
	}

	// Should previous lines be removed if we see the next file line before content?
	while (removeOnNextFileLineCnt > 0)
	{
		retainedLines.pop();
		retainedLineNums.pop();
		removeOnNextFileLineCnt--;
	}

	// Build removed lines
	let removedLines: RemovedLine[] = [];
	lineNum = 0;
	let nextRetainedLineNum = retainedLineNums.shift();
	let offset = 0;
	for (const lineText of lines)
	{
		if (lineNum === nextRetainedLineNum)
			nextRetainedLineNum = retainedLineNums.shift();
		else
		{
			removedLines.push({
				line: lineNum,
				offset: offset,
				length: lineText.length
			});
		}
		offset += lineText.length;
		lineNum++;
	}

	return {
		retainedLines: retainedLines,
		removedLines: removedLines
	};
}
