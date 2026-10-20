export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function prettyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = WEEK[new Date(y, m - 1, d).getDay()];
  const today = todayStr();
  const suffix = date === today ? '（今天）' : date === shiftDate(today, -1) ? '（昨天）' : '';
  return `${m}月${d}日 周${wd}${suffix}`;
}

export function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
