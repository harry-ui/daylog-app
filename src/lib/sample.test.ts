// 运行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleEvenly } from './sample.ts';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

test('不超过上限就原样返回', () => {
  assert.deepEqual(sampleEvenly(range(5), 10), range(5));
});

test('超过上限时均匀抽取，保留首尾', () => {
  const out = sampleEvenly(range(1000), 200);
  assert.equal(out.length, 200);
  assert.equal(out[0], 0);
  assert.equal(out[out.length - 1], 999);
  assert.equal(new Set(out).size, 200);
  // 后半天的照片也有一半左右
  assert.ok(out.filter((x) => x >= 500).length >= 99);
});

test('刚好多一张也不会重复', () => {
  const out = sampleEvenly(range(201), 200);
  assert.equal(new Set(out).size, 200);
});

test('边界', () => {
  assert.deepEqual(sampleEvenly(range(10), 1), [0]);
  assert.deepEqual(sampleEvenly(range(10), 0), []);
  assert.deepEqual(sampleEvenly([], 3), []);
});
