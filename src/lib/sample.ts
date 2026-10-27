// 从按时间排好的列表里均匀抽 n 个，保留第一个和最后一个。
// 照片太多时用它，而不是只取前 n 张——那样晚上的照片会全部丢掉。
export function sampleEvenly<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  if (n <= 0) return [];
  if (n === 1) return [items[0]];
  const step = (items.length - 1) / (n - 1); // items.length > n，所以 step > 1，下标不会重复
  return Array.from({ length: n }, (_, i) => items[Math.round(i * step)]);
}
