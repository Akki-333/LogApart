/**
 * The CSV writer. Every export a committee opens goes through it, and one of
 * its jobs is security: text that a spreadsheet would run as a formula must
 * arrive as text.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { cell, toCsv } = require('../src/services/csv');

describe('cell', () => {
  it('leaves plain text and numbers alone', () => {
    assert.equal(cell('Home A-2'), 'Home A-2');
    assert.equal(cell(2500.5), '2500.5');
    assert.equal(cell(0), '0');
  });

  it('writes nothing for a missing value', () => {
    assert.equal(cell(null), '');
    assert.equal(cell(undefined), '');
  });

  it('quotes commas, quotes and line breaks', () => {
    assert.equal(cell('Sharma & Sons, Electricals'), '"Sharma & Sons, Electricals"');
    assert.equal(cell('The "big" lift'), '"The ""big"" lift"');
    assert.equal(cell('two\nlines'), '"two\nlines"');
  });

  it('defuses text a spreadsheet would run as a formula', () => {
    for (const attack of ['=HYPERLINK("http://x.test","click")', '+91 98765', '-2+3', '@SUM(A1)', '\tTAB']) {
      const written = cell(attack);
      const unquoted = written.startsWith('"') ? written.slice(1) : written;
      assert.ok(unquoted.startsWith("'"), `${attack} became ${written}`);
    }
  });

  it('keeps a negative number a number', () => {
    assert.equal(cell(-500), '-500');
  });
});

describe('toCsv', () => {
  it('joins cells with commas and rows with line breaks, keeping blank rows', () => {
    assert.equal(toCsv([['a', 1], [], ['b, c', null]]), 'a,1\n\n"b, c",');
  });
});
