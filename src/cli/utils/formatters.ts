import { DateTime } from 'luxon';

export function formatDuration(startedAt: string): string {
  const start = DateTime.fromISO(startedAt, { zone: 'utc' });
  if (!start.isValid) return '-';
  const diff = DateTime.utc().diff(start, ['hours', 'minutes']);
  const hours = Math.floor(diff.hours || 0);
  const minutes = Math.floor(diff.minutes || 0);
  if (hours <= 0 && minutes <= 0) return '<1m';
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function formatIsoDate(value: string): string {
  if (!value) return '-';
  const dt = DateTime.fromISO(value);
  if (!dt.isValid) return value;
  return dt.toFormat('yyyy-LL-dd HH:mm');
}

export function formatPlainTable(rows: Array<[string, string]>): string {
  const longest = rows.reduce((len, [label]) => Math.max(len, label.length), 0);
  return rows.map(([label, value]) => `${label.padEnd(longest + 2, ' ')}${value}`).join('\n');
}

export function renderTable(headers: string[], rows: Array<(string | number | undefined)[]>): string {
  const matrix = [headers, ...rows];
  const columnWidths = headers.map((_, index) =>
    matrix.reduce((max, row) => Math.max(max, String(row[index] ?? '').length), 0)
  );
  const renderRow = (row: (string | number | undefined)[]) =>
    row
      .map((cell, idx) => String(cell ?? '').padEnd(columnWidths[idx] + 2, ' '))
      .join('')
      .trimEnd();
  const lines = [renderRow(headers), renderRow(columnWidths.map((w) => '-'.repeat(w)))];
  rows.forEach((row) => lines.push(renderRow(row)));
  return lines.join('\n');
}

export function humanFileSize(size: number): string {
  if (!size || Number.isNaN(size)) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let value = size;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)}${units[index]}`;
}
