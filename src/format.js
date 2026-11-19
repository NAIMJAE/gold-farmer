export const STATUS = {
  pending: ['미참여', 'pending'], running: ['진행 중', 'running'],
  completed: ['참여 완료', 'completed'], review: ['확인 필요', 'review'],
  skipped: ['건너뜀', 'skipped'], failed: ['실패', 'failed'],
};

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
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
