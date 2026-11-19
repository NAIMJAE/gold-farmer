import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, formatDate, STATUS } from '../src/format.js';

test('이벤트 링크는 HTTP(S)만 허용', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,example'), null);
  assert.equal(safeUrl('https://user:pass@example.com'), null);
  assert.equal(safeUrl('https://example.com/event'), 'https://example.com/event');
});
test('날짜는 KST이며 빈 날짜는 미표시', () => {
  assert.equal(formatDate('2026-11-18'), '2026.11.18');
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate('invalid'), '—');
  assert.match(formatDate('2026-11-17T16:00:00Z'), /18/);
});
test('DB 참여 상태 모두 표시', () => {
  assert.equal(Object.keys(STATUS).length, 6);
  assert.equal(STATUS.review[0], '확인 필요');
});
