// 把坐标转成地名（用 iOS 系统自带的地理编码，不需要 API Key）。
// 系统对短时间内的请求次数有限制，所以这里一个一个查，并做简单缓存。
import * as Location from 'expo-location';
import type { Stop } from './cluster';

const cache = new Map<string, string>();

function key(lat: number, lon: number) {
  // 保留 3 位小数 ≈ 100 米，附近的点共用一个结果
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function formatAddress(a: Location.LocationGeocodedAddress): string {
  // name 往往是兴趣点名称（比如某个图书馆），没有就退回到街道/街区
  const parts = [a.name, a.district ?? a.subregion, a.city].filter(
    (x, i, arr): x is string => !!x && arr.indexOf(x) === i,
  );
  return parts.slice(0, 2).join('，') || '未知地点';
}

export async function nameStops(stops: Stop[]): Promise<Stop[]> {
  const perm = await Location.requestForegroundPermissionsAsync();
  const out: Stop[] = [];
  for (const stop of stops) {
    if (stop.lat == null || stop.lon == null) {
      out.push({ ...stop, placeName: '没有定位的照片' });
      continue;
    }
    const k = key(stop.lat, stop.lon);
    let name = cache.get(k);
    if (!name && perm.granted) {
      try {
        const [addr] = await Location.reverseGeocodeAsync({ latitude: stop.lat, longitude: stop.lon });
        name = addr ? formatAddress(addr) : undefined;
        if (name) cache.set(k, name);
      } catch {
        // 网络不好或被限流：不影响主流程
      }
    }
    out.push({ ...stop, placeName: name ?? `${stop.lat.toFixed(4)}, ${stop.lon.toFixed(4)}` });
  }
  return out;
}
