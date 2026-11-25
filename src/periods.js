import { addDays } from './format.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
// 참여 상태 → 표 칸. 아직 참여하지 않은 상태(미참여·참여 대기·진행 중)는 세지 않음
const COLUMN = { completed: 'done', review: 'check', failed: 'check', skipped: 'skipped' };

const dow = day => new Date(`${day}T00:00:00Z`).getUTCDay();

export function weekday(day) { return WEEKDAYS[dow(day)]; }

// 그 날이 든 주의 월요일(한 주 = 월~일)
export function weekStart(day) { return addDays(day, -((dow(day) + 6) % 7)); }

// 참여일(KST) 별 건수. dayOf(item) 은 'YYYY-MM-DD' 또는 ''(날짜 없음)
export function summarizeDays(items, dayOf) {
  const days = new Map();
  for (const item of items) {
    const column = COLUMN[item.participation_status];
    const day = column && dayOf(item);
    if (!day) continue;
    const row = days.get(day) || { day, done: 0, check: 0, skipped: 0 };
    row[column]++;
    days.set(day, row);
  }
  return days;
}

// 참여한 날(참여 완료·확인 필요가 있는 날)만 주 단위로 묶음. 최신 주·최신 날이 앞
export function groupWeeks(days, today) {
  const thisWeek = weekStart(today);
  const weeks = new Map();
  for (const row of days.values()) {
    if (!row.done && !row.check) continue;
    const start = weekStart(row.day);
    if (!weeks.has(start)) weeks.set(start, { start, end: addDays(start, 6), done: 0, check: 0, skipped: 0, days: [] });
    const week = weeks.get(start);
    week.done += row.done; week.check += row.check; week.skipped += row.skipped;
    week.days.push(row);
  }
  return [...weeks.values()].sort((a, b) => b.start.localeCompare(a.start)).map(week => ({
    ...week,
    label: week.start === thisWeek ? '이번 주' : week.start === addDays(thisWeek, -7) ? '지난 주' : `${week.start.slice(5)} 주`,
    days: week.days.sort((a, b) => b.day.localeCompare(a.day)),
  }));
}
