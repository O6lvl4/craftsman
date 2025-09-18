import yaml from 'js-yaml';
import type { CommandResult, ParsedCommand } from './types.js';
import { renderTable } from './utils/formatters.js';

export function formatResult(result: CommandResult, command: ParsedCommand): string {
  switch (command.format) {
    case 'json':
      return JSON.stringify(serializeResult(result), null, 2);
    case 'yaml':
      return yaml.dump(serializeResult(result));
    case 'csv':
      return formatCsv(result);
    case 'quiet':
      return formatQuiet(result);
    case 'plain':
      return formatPlain(result);
    case 'table':
    default:
      return formatTable(result);
  }
}

function serializeResult(result: CommandResult): unknown {
  return {
    success: result.success,
    message: result.message,
    table: result.table,
    list: result.list,
    data: result.data,
    stream: result.stream,
    meta: result.meta
  };
}

function formatTable(result: CommandResult): string {
  if (result.table) {
    return renderTable(result.table.headers, result.table.rows);
  }
  if (result.list) {
    return result.list.join('\n');
  }
  if (result.stream) {
    return result.stream.join('\n');
  }
  if (result.message) {
    return result.message;
  }
  return JSON.stringify(serializeResult(result), null, 2);
}

function formatPlain(result: CommandResult): string {
  const chunks: string[] = [];
  if (result.message) chunks.push(result.message);
  if (result.stream) chunks.push(result.stream.join('\n'));
  if (result.table) {
    const rows = result.table.rows
      .map((row) => row.map((cell) => String(cell ?? '')).join(':'))
      .join('\n');
    if (chunks.length > 0) chunks.push('');
    chunks.push(result.table.headers.join(':'));
    if (rows) chunks.push(rows);
  }
  if (result.list) chunks.push(result.list.join('\n'));
  if (chunks.length > 0) return chunks.filter(Boolean).join('\n');
  return JSON.stringify(serializeResult(result));
}

function formatQuiet(result: CommandResult): string {
  if (result.table) {
    return result.table.rows.map((row) => String(row[0] ?? '')).join('\n');
  }
  if (result.list) {
    return result.list.join('\n');
  }
  return result.message ?? '';
}

function formatCsv(result: CommandResult): string {
  if (result.table) {
    const lines = [result.table.headers.join(',')];
    for (const row of result.table.rows) {
      lines.push(row.map((cell) => wrapCsv(String(cell ?? ''))).join(','));
    }
    return lines.join('\n');
  }
  throw new Error('CSV format requires tabular data');
}

function wrapCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
