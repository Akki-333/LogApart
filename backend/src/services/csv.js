/**
 * CSV the way a committee opens it, which is in a spreadsheet.
 *
 * Two things a plain join gets wrong. A payee called "Sharma & Sons,
 * Electricals" has to be quoted. And a cell that begins with = + - or @ is run
 * as a formula by Excel and Google Sheets: a visitor name typed at the gate as
 * =HYPERLINK(...) would otherwise execute on the treasurer's laptop. Such text
 * gets a leading apostrophe, which a spreadsheet shows as plain text. Numbers
 * are left alone, so a refund of -500 stays a number.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value) {
  if (value === null || value === undefined) return '';

  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const toCsv = (rows) => rows.map((row) => row.map(cell).join(',')).join('\n');

/** Sends rows as a download. Callers build the filename from safe parts only. */
function sendCsv(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(rows));
}

module.exports = { cell, toCsv, sendCsv };
