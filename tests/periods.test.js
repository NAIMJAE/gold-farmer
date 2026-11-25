import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kstDay } from '../src/format.js';
import { weekday, weekStart, summarizeDays, groupWeeks } from '../src/periods.js';

const item = (status, at) => ({ participation_status: status, participation: { updated_at: at } });
const dayOf = it => kstDay(it.participation?.updated_at);

test('한 주는 월~일, 요일은 한글', () => {
  assert.equal(weekStart('2026-11-23'), '2026-11-23');   // 월
  assert.equal(weekStart('2026-11-25'), '2026-11-23');   // 수
  assert.equal(weekStart('2026-11-29'), '2026-11-23');   // 일
  assert.equal(weekStart('2026-11-30'), '2026-11-30');   // 다음 월
  assert.equal(weekStart('2027-01-01'), '2026-12-28');   // 해를 넘기는 주
  assert.equal(weekday('2026-11-25'), '수');
  assert.equal(weekday('2026-11-29'), '일');
});

test('참여일별 건수: 참여 완료·확인 필요(실패 포함)·건너뜀만 세고 아직 안 한 것은 뺌', () => {
  const days = summarizeDays([
    item('completed', '2026-11-24T10:00:00Z'), item('completed', '2026-11-24T11:00:00Z'),
    item('review', '2026-11-24T12:00:00Z'), item('failed', '2026-11-24T12:30:00Z'),
    item('skipped', '2026-11-24T13:00:00Z'),
    item('pending', '2026-11-24T14:00:00Z'), item('queued', '2026-11-24T14:00:00Z'), item('running', '2026-11-24T14:00:00Z'),
    item('completed', null),
  ], dayOf);
  assert.deepEqual([...days.values()], [{ day: '2026-11-24', done: 2, check: 2, skipped: 1 }]);
});

test('날짜는 KST 기준: UTC 15시 이후는 다음 날로 센다', () => {
  const days = summarizeDays([item('completed', '2026-11-24T14:59:00Z'), item('completed', '2026-11-24T15:00:00Z')], dayOf);
  assert.equal(days.get('2026-11-24').done, 1);
  assert.equal(days.get('2026-11-25').done, 1);
});

test('주 묶음: 최신 주가 앞, 주 합계·이름·날짜 순서', () => {
  const rows = [
    ['completed', '2026-11-25', 33], ['completed', '2026-11-24', 35], ['completed', '2026-11-23', 38],
    ['completed', '2026-11-18', 33], ['review', '2026-11-17', 2], ['completed', '2026-11-17', 6],
    ['completed', '2026-11-11', 30],
  ];
  const items = rows.flatMap(([s, d, n]) => Array.from({ length: n }, () => item(s, `${d}T03:00:00Z`)));
  items.push(item('skipped', '2026-11-25T03:00:00Z'), item('skipped', '2026-11-20T03:00:00Z'));   // 11-20 은 참여한 날이 아님
  const weeks = groupWeeks(summarizeDays(items, dayOf), '2026-11-25');
  assert.deepEqual(weeks.map(w => [w.label, w.start, w.end, w.done, w.check, w.skipped]), [
    ['이번 주', '2026-11-23', '2026-11-29', 106, 0, 1],
    ['지난 주', '2026-11-16', '2026-11-22', 39, 2, 0],
    ['11-09 주', '2026-11-09', '2026-11-15', 30, 0, 0],
  ]);
  assert.deepEqual(weeks[0].days.map(d => d.day), ['2026-11-25', '2026-11-24', '2026-11-23']);
});

test('참여 기록이 없으면 빈 목록', () => {
  assert.deepEqual(groupWeeks(summarizeDays([], dayOf), '2026-11-25'), []);
});
