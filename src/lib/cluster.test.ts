// 运行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterIntoStops, haversineM, type PhotoPoint } from './cluster.ts';

const t0 = Date.UTC(2026, 9, 18, 13, 0); // 某天上午 9 点（纽约时间）

// BU 校园附近、Boston Public Library、再回到 BU
const BU = { lat: 42.3505, lon: -71.1054 };
const BPL = { lat: 42.3493, lon: -71.0782 };

function p(id: string, offsetMin: number, loc: { lat: number; lon: number } | null): PhotoPoint {
  return { id, uri: `file://${id}.jpg`, time: t0 + offsetMin * 60_000, lat: loc?.lat ?? null, lon: loc?.lon ?? null };
}

test('haversine: BU 到 BPL 大约 2.2 公里', () => {
  const d = haversineM(BU.lat, BU.lon, BPL.lat, BPL.lon);
  assert.ok(d > 2000 && d < 2500, `got ${d}`);
});

test('同一个地方、时间连续的照片合成一个停留点', () => {
  const stops = clusterIntoStops([p('a', 0, BU), p('b', 10, BU), p('c', 25, BU)]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].photos.length, 3);
});

test('换了地方就切开，早晚回到同一个地方算两个停留点', () => {
  const stops = clusterIntoStops([p('a', 0, BU), p('b', 60, BPL), p('c', 80, BPL), p('d', 150, BU)]);
  assert.deepEqual(
    stops.map((s) => s.photos.map((x) => x.id)),
    [['a'], ['b', 'c'], ['d']],
  );
});

test('同一个地方但间隔太久也切开', () => {
  const stops = clusterIntoStops([p('a', 0, BU), p('b', 3 * 60, BU)]);
  assert.equal(stops.length, 2);
});

test('没有定位的照片跟着时间上相邻的停留点', () => {
  const stops = clusterIntoStops([p('a', 0, BPL), p('b', 5, null), p('c', 10, BPL)]);
  assert.equal(stops.length, 1);
  assert.ok(Math.abs((stops[0].lat as number) - BPL.lat) < 1e-9);
});

test('输入乱序也能按时间排好', () => {
  const stops = clusterIntoStops([p('c', 80, BPL), p('a', 0, BU), p('b', 60, BPL)]);
  assert.equal(stops[0].photos[0].id, 'a');
  assert.ok(stops[0].start < stops[1].start);
});

test('全部没有定位', () => {
  const stops = clusterIntoStops([p('a', 0, null), p('b', 30, null)]);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].lat, null);
});

test('中间一张定位漂移的照片不会把同一个地方切成三段', () => {
  const FAR = { lat: 42.3601, lon: -71.0589 }; // 漂到了 3 公里外
  const stops = clusterIntoStops([p('a', 0, BU), p('b', 5, BU), p('x', 8, FAR), p('c', 12, BU)]);
  assert.equal(stops.length, 1);
  assert.deepEqual(stops[0].photos.map((x) => x.id), ['a', 'b', 'x', 'c']);
  // 漂移的那张不参与算中心点
  assert.ok(Math.abs((stops[0].lat as number) - BU.lat) < 1e-9);
});

test('连续两次漂移也能合并', () => {
  const FAR = { lat: 42.3601, lon: -71.0589 };
  const stops = clusterIntoStops([p('a', 0, BU), p('x', 3, FAR), p('b', 6, BU), p('y', 9, BPL), p('c', 12, BU)]);
  assert.equal(stops.length, 1);
});

test('真的出去了一趟（时间够长）不会被当成漂移', () => {
  const stops = clusterIntoStops([p('a', 0, BU), p('b', 45, BPL), p('c', 90, BU)]);
  assert.equal(stops.length, 3);
});

test('空数组', () => {
  assert.deepEqual(clusterIntoStops([]), []);
});
