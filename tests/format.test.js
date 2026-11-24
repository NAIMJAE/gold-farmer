import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, formatDate, kstDay, addDays, defaultRange, STATUS } from '../src/format.js';

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
test('조회조건용 날짜는 KST 기준 YYYY-MM-DD', () => {
  assert.equal(kstDay('2026-11-30'), '2026-11-30');
  assert.equal(kstDay('2026-11-17T16:00:00Z'), '2026-11-18');
  assert.equal(kstDay('2026-11-17T14:59:00Z'), '2026-11-17');
  assert.equal(kstDay(null), '');
  assert.equal(kstDay('invalid'), '');
});
test('기본 조회 기간: 참여일 -7~오늘, 발표일 -7~+7', () => {
  assert.equal(addDays('2026-11-24', -7), '2026-11-17');
  assert.equal(addDays('2026-12-28', 7), '2027-01-04');
  assert.equal(addDays('2026-03-03', -7), '2026-02-24');
  assert.deepEqual(defaultRange('done', '2026-11-24'), ['2026-11-17', '2026-11-24']);
  assert.deepEqual(defaultRange('ann', '2026-11-24'), ['2026-11-17', '2026-12-01']);
});
test('DB 참여 상태 모두 표시', () => {
  assert.equal(Object.keys(STATUS).length, 6);
  assert.equal(STATUS.review[0], '확인 필요');
});
