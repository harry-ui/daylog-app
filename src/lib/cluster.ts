// 把一天的照片按"时间 + 地点"切分成若干个停留点（Stop）。
// 纯函数、不依赖 React Native，方便单独测试（见 cluster.test.ts）。
//
// 思路：照片按时间排序后顺序扫描。当前照片和当前停留点的中心距离太远，
// 或者和上一张照片隔了太久，就开一个新的停留点。
// 为什么不用 DBSCAN：DBSCAN 只看空间，早上和晚上去同一个地方会被合并成一个点；
// 日记需要的是"时间线"，所以这里用时空顺序切分。之后你可以试着换成 ST-DBSCAN 做对比。

export type PhotoPoint = {
  id: string;
  uri: string;
  time: number; // 毫秒时间戳
  lat: number | null;
  lon: number | null;
};

export type Stop = {
  id: string;
  start: number;
  end: number;
  lat: number | null;
  lon: number | null;
  photos: PhotoPoint[];
  placeName?: string;
};

export type ClusterOptions = {
  /** 超过这个距离（米）就算换了地方 */
  maxDistanceM?: number;
  /** 两张照片间隔超过这个时间（毫秒）就切开 */
  maxGapMs?: number;
};

const EARTH_RADIUS_M = 6_371_000;

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

function centroid(photos: PhotoPoint[]): { lat: number | null; lon: number | null } {
  const located = photos.filter((p) => p.lat != null && p.lon != null);
  if (located.length === 0) return { lat: null, lon: null };
  const lat = located.reduce((s, p) => s + (p.lat as number), 0) / located.length;
  const lon = located.reduce((s, p) => s + (p.lon as number), 0) / located.length;
  return { lat, lon };
}

export function clusterIntoStops(photos: PhotoPoint[], opts: ClusterOptions = {}): Stop[] {
  const maxDistanceM = opts.maxDistanceM ?? 250;
  const maxGapMs = opts.maxGapMs ?? 90 * 60 * 1000;

  const sorted = [...photos].sort((a, b) => a.time - b.time);
  const groups: PhotoPoint[][] = [];

  for (const photo of sorted) {
    const current = groups[groups.length - 1];
    if (!current) {
      groups.push([photo]);
      continue;
    }
    const last = current[current.length - 1];
    const tooLate = photo.time - last.time > maxGapMs;

    let tooFar = false;
    const c = centroid(current);
    if (photo.lat != null && photo.lon != null && c.lat != null && c.lon != null) {
      tooFar = haversineM(photo.lat, photo.lon, c.lat, c.lon) > maxDistanceM;
    }
    // 没有定位的照片：只要时间上连得上，就归到当前停留点

    if (tooLate || tooFar) groups.push([photo]);
    else current.push(photo);
  }

  return groups.map((g, i) => {
    const c = centroid(g);
    return {
      id: `stop-${i}`,
      start: g[0].time,
      end: g[g.length - 1].time,
      lat: c.lat,
      lon: c.lon,
      photos: g,
    };
  });
}
