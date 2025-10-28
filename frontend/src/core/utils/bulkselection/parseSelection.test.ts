import { describe, it, expect } from 'vitest';
import { parseSelection } from '@app/utils/bulkselection/parseSelection';

describe('parseSelection', () => {
  const max = 120;

  it('1) parses single numbers', () => {
    expect(parseSelection('5', max)).toEqual([5]);
  });

  it('2) parses simple range', () => {
    expect(parseSelection('3-7', max)).toEqual([3,4,5,6,7]);
  });

  it('3) parses multiple numbers and ranges via comma OR', () => {
    expect(parseSelection('1,3-5,10', max)).toEqual([1,3,4,5,10]);
  });

  it('4) respects bounds (clamps to 1..max and filters invalid)', () => {
    expect(parseSelection('0, -2, 1-2, 9999', max)).toEqual([1,2]);
  });

  it('5) supports even keyword', () => {
    expect(parseSelection('even', 10)).toEqual([2,4,6,8,10]);
  });

  it('6) supports odd keyword', () => {
    expect(parseSelection('odd', 10)).toEqual([1,3,5,7,9]);
  });

  it('7) supports 2n progression', () => {
    expect(parseSelection('2n', 12)).toEqual([2,4,6,8,10,12]);
  });

  it('8) supports kn±c progression (3n+1)', () => {
    expect(parseSelection('3n+1', 10)).toEqual([1,4,7,10]);
  });

  it('9) supports kn±c progression (4n-1)', () => {
    expect(parseSelection('4n-1', 15)).toEqual([3,7,11,15]);
  });

  it('10) supports logical AND (&) intersection', () => {
    // even AND 1-10 => even numbers within 1..10
    expect(parseSelection('even & 1-10', 20)).toEqual([2,4,6,8,10]);
  });

  it('11) supports logical OR with comma', () => {
    expect(parseSelection('1-3, 8-9', 20)).toEqual([1,2,3,8,9]);
  });

  it('12) supports logical OR with | and word or', () => {
    expect(parseSelection('1-2 | 9-10 or 5', 20)).toEqual([1,2,5,9,10]);
  });

  it('13) supports NOT operator !', () => {
    // !1-5 within max=10 -> 6..10
    expect(parseSelection('!1-5', 10)).toEqual([6,7,8,9,10]);
  });

  it('14) supports combination: 1-10 & 2n & !5-7', () => {
    expect(parseSelection('1-10 & 2n & !5-7', 20)).toEqual([2,4,8,10]);
  });

  it('15) preserves precedence: AND over OR', () => {
    // 1-10 & even, 15 OR => ( (1-10 & even) , 15 )
    expect(parseSelection('1-10 & even, 15', 20)).toEqual([2,4,6,8,10,15]);
  });

  it('16) handles whitespace and case-insensitive keywords', () => {
    expect(parseSelection('  OdD  & 1-7  ', 10)).toEqual([1,3,5,7]);
  });

  it('17) progression plus range: 2n | 9-11 within 12', () => {
    expect(parseSelection('2n | 9-11', 12)).toEqual([2,4,6,8,9,10,11,12]);
  });

  it('18) complex: (2n-1 & 1-20) & ! (5-7)', () => {
    expect(parseSelection('2n-1 & 1-20 & !5-7', 20)).toEqual([1,3,9,11,13,15,17,19]);
  });

  it('19) falls back to CSV when expression malformed', () => {
    // malformed: "2x" -> fallback should treat as CSV tokens -> only 2 ignored -> result empty
    expect(parseSelection('2x', 10)).toEqual([]);
    // malformed middle; still fallback handles CSV bits
    expect(parseSelection('1, 3-5, foo, 9', 10)).toEqual([1,3,4,5,9]);
  });

  it('20) clamps ranges that exceed bounds', () => {
    expect(parseSelection('0-5, 9-10', 10)).toEqual([1,2,3,4,5,9,10]);
  });

  it('21) supports parentheses to override precedence', () => {
    // Without parentheses: 1-10 & even, 15 => [2,4,6,8,10,15]
    // With parentheses around OR: 1-10 & (even, 15) => [2,4,6,8,10]
    expect(parseSelection('1-10 & (even, 15)', 20)).toEqual([2,4,6,8,10]);
  });

  it('22) NOT over a grouped intersection', () => {
    // !(10-20 & !2n) within 1..25
    // Inner: 10-20 & !2n => odd numbers from 11..19 plus 10,12,14,16,18,20 excluded
    // Complement in 1..25 removes those, keeping others
    const result = parseSelection('!(10-20 & !2n)', 25);
    expect(result).toEqual([1,2,3,4,5,6,7,8,9,10,12,14,16,18,20,21,22,23,24,25]);
  });

  it('23) nested parentheses with progressions', () => {
    expect(parseSelection('(2n | 3n+1) & 1-20', 50)).toEqual([
      1,2,4,6,7,8,10,12,13,14,16,18,19,20
    ]);
  });

  it('24) parentheses with NOT directly on group', () => {
    expect(parseSelection('!(1-5, odd)', 10)).toEqual([6,8,10]);
  });

  it('25) whitespace within parentheses is ignored', () => {
    expect(parseSelection('(  1 - 3  ,  6  )', 10)).toEqual([1,2,3,6]);
  });

  it('26) malformed missing closing parenthesis falls back to CSV', () => {
    // Expression parse should fail; fallback CSV should pick numbers only
    expect(parseSelection('(1-3, 6', 10)).toEqual([6]);
  });

  it('27) nested NOT and AND with parentheses', () => {
    // !(odd & 5-9) within 1..12 => remove odd numbers 5,7,9
    expect(parseSelection('!(odd & 5-9)', 12)).toEqual([1,2,3,4,6,8,10,11,12]);
  });

  it('28) deep nesting and mixing operators', () => {
    const expr = '(1-4 & 2n) , ( (5-10 & odd) & !(7) ), (3n+1 & 1-20)';
    expect(parseSelection(expr, 20)).toEqual([1,2,4,5,7,9,10,13,16,19]);
  });

  it('31) word NOT works like ! for terms', () => {
    expect(parseSelection('not 1-3', 6)).toEqual([4,5,6]);
  });

  it('32) word NOT works like ! for groups', () => {
    expect(parseSelection('not (odd & 1-6)', 8)).toEqual([2,4,6,7,8]);
  });

  it('29) parentheses around a single term has no effect', () => {
    expect(parseSelection('(even)', 8)).toEqual([2,4,6,8]);
  });

  it('30) redundant nested parentheses', () => {
    expect(parseSelection('(((1-3))), ((2n))', 6)).toEqual([1,2,3,4,6]);
  });

  // Additional edge cases and comprehensive coverage
  it('33) handles empty input gracefully', () => {
    expect(parseSelection('', 10)).toEqual([]);
    expect(parseSelection('   ', 10)).toEqual([]);
  });

  it('34) handles zero or negative maxPages', () => {
    expect(parseSelection('1-10', 0)).toEqual([]);
    expect(parseSelection('1-10', -5)).toEqual([]);
  });

  it('35) handles large progressions efficiently', () => {
    expect(parseSelection('100n', 1000)).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
  });

  it('36) handles progressions with large offsets', () => {
    expect(parseSelection('5n+97', 100)).toEqual([97]);
    expect(parseSelection('3n-2', 10)).toEqual([1, 4, 7, 10]);
  });

  it('37) mixed case keywords work correctly', () => {
    expect(parseSelection('EVEN & Odd', 6)).toEqual([]);
    expect(parseSelection('Even OR odd', 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('38) complex nested expressions with all operators', () => {
    const expr = '(1-20 & even) | (odd & !5-15) | (3n+1 & 1-10)';
    // (1-20 & even) = [2,4,6,8,10,12,14,16,18,20]
    // (odd & !5-15) = odd numbers not in 5-15 = [1,3,17,19] 
    // (3n+1 & 1-10) = [1,4,7,10]
    // Union of all = [1,2,3,4,6,7,8,10,12,14,16,17,18,19,20]
    expect(parseSelection(expr, 20)).toEqual([1, 2, 3, 4, 6, 7, 8, 10, 12, 14, 16, 17, 18, 19, 20]);
  });

  it('39) multiple NOT operators in sequence', () => {
    expect(parseSelection('not not 1-5', 10)).toEqual([1, 2, 3, 4, 5]);
    expect(parseSelection('!!!1-3', 10)).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });

  it('40) edge case: single page selection', () => {
    expect(parseSelection('1', 1)).toEqual([1]);
    expect(parseSelection('5', 3)).toEqual([]);
  });

  it('41) backwards ranges are handled correctly', () => {
    expect(parseSelection('10-5', 15)).toEqual([5, 6, 7, 8, 9, 10]);
  });

  it('42) progressions that start beyond maxPages', () => {
    expect(parseSelection('10n+50', 40)).toEqual([]);
    expect(parseSelection('5n+35', 40)).toEqual([35, 40]);
  });

  it('43) complex operator precedence with mixed syntax', () => {
    // AND has higher precedence than OR
    expect(parseSelection('1-3, 5-7 & even', 10)).toEqual([1, 2, 3, 6]);
    expect(parseSelection('1-3 | 5-7 and even', 10)).toEqual([1, 2, 3, 6]);
  });

  it('44) whitespace tolerance in complex expressions', () => {
    const expr1 = '1-5&even|odd&!3';
    const expr2 = '  1 - 5  &  even  |  odd  &  ! 3  ';
    expect(parseSelection(expr1, 10)).toEqual(parseSelection(expr2, 10));
  });

  it('45) fallback behavior with partial valid expressions', () => {
    // Should fallback and extract valid CSV parts
    expect(parseSelection('1, 2-4, invalid, 7', 10)).toEqual([1, 2, 3, 4, 7]);
    expect(parseSelection('1-3, @#$, 8-9', 10)).toEqual([1, 2, 3, 8, 9]);
  });

  it('46) progressions with k=1 (equivalent to n)', () => {
    expect(parseSelection('1n', 5)).toEqual([1, 2, 3, 4, 5]);
    expect(parseSelection('1n+2', 5)).toEqual([2, 3, 4, 5]);
  });

  it('47) very large ranges are clamped correctly', () => {
    expect(parseSelection('1-999999', 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Note: -100-5 would fallback to CSV and reject -100, but 0-5 should work
    expect(parseSelection('0-5', 10)).toEqual([1, 2, 3, 4, 5]);
  });

  it('48) multiple comma-separated ranges', () => {
    expect(parseSelection('1-2, 4-5, 7-8, 10', 10)).toEqual([1, 2, 4, 5, 7, 8, 10]);
  });

  it('49) combination of all features in one expression', () => {
    const expr = '(1-10 & even) | (odd & 15-25) & !(3n+1 & 1-30) | 50n';
    const result = parseSelection(expr, 100);
    // This should combine: even numbers 2,4,6,8,10 with odd 15-25 excluding 3n+1 matches, plus 50n
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain(50);
    expect(result).toContain(100);
  });

  it('50) stress test with deeply nested parentheses', () => {
    const expr = '((((1-5)))) & ((((even)))) | ((((odd & 7-9))))';
    expect(parseSelection(expr, 10)).toEqual([2, 4, 7, 9]);
  });
});


