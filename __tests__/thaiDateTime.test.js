/* eslint-env jest */

const { formatThaiDateTime } = require('../helpers/thaiDateTime');

describe('formatThaiDateTime', () => {
  test('preserves SQL Server wall-clock components and adds Thai offset', () => {
    expect(formatThaiDateTime(new Date('2026-09-23T10:16:49.673Z')))
      .toBe('2026-09-23T10:16:49.673+07:00');
  });

  test('returns null for an invalid date', () => {
    expect(formatThaiDateTime('invalid-date')).toBeNull();
  });
});
