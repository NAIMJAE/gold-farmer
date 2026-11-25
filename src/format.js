export const STATUS = {
  pending: ['미참여', 'pending'], queued: ['참여 대기', 'queued'], running: ['진행 중', 'running'],
  completed: ['참여 완료', 'completed'], review: ['확인 필요', 'review'],
  skipped: ['건너뜀', 'skipped'], failed: ['실패', 'failed'],
};

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function kstDay(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function addDays(day, n) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

// 조회 기준별 기본 기간 — 참여일: 오늘-7 ~ 오늘, 발표일: 오늘-7 ~ 오늘+7
export function defaultRange(basis, today) {
  return basis === 'ann' ? [addDays(today, -7), addDays(today, 7)] : [addDays(today, -7), today];
}

export function formatDate(value, includeTime = false) {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll('-', '.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const options = { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' };
  if (includeTime) Object.assign(options, { hour: '2-digit', minute: '2-digit', hour12: false });
  return new Intl.DateTimeFormat('ko-KR', options).format(date);
}
