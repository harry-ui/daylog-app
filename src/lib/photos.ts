// 读取某一天相册里的照片（时间 + GPS），全部在手机本地完成。
import { Query, AssetField, MediaType, MediaSubtype, requestPermissionsAsync } from 'expo-media-library';
import type { PhotoPoint } from './cluster';

export type PhotoPermission = 'all' | 'limited' | 'denied';

export async function ensurePhotoPermission(): Promise<PhotoPermission> {
  // iOS 会在返回值里带上 accessPrivileges（全部 / 部分照片），库的类型声明里暂时漏了这个字段
  const res = (await requestPermissionsAsync()) as Awaited<ReturnType<typeof requestPermissionsAsync>> & {
    accessPrivileges?: 'all' | 'limited' | 'none';
  };
  if (!res.granted) return 'denied';
  return res.accessPrivileges === 'limited' ? 'limited' : 'all';
}

/** date 是本地时间的 'YYYY-MM-DD' */
export function dayRange(date: string): { start: number; end: number } {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0).getTime();
  return { start, end };
}

// 媒体库返回的时间戳在不同平台/版本上可能是秒或毫秒，统一成毫秒
function toMs(t: number | null): number | null {
  if (t == null) return null;
  return t < 1e12 ? t * 1000 : t;
}

export async function loadPhotosForDay(date: string, maxPhotos = 200): Promise<PhotoPoint[]> {
  const { start, end } = dayRange(date);

  const assets = await new Query()
    .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
    .gte(AssetField.CREATION_TIME, start)
    .lt(AssetField.CREATION_TIME, end)
    .orderBy({ key: AssetField.CREATION_TIME, ascending: true })
    .limit(maxPhotos)
    .exe();

  const points = await Promise.all(
    assets.map(async (asset): Promise<PhotoPoint | null> => {
      try {
        const [info, location] = await Promise.all([asset.getInfo(), asset.getLocation()]);
        const time = toMs(info.creationTime);
        if (time == null) return null;
        // 截图一般不代表"去了哪里"，跳过
        if (info.mediaSubtypes?.includes(MediaSubtype.SCREENSHOT)) return null;
        return {
          id: asset.id,
          uri: info.uri,
          time,
          lat: location?.latitude ?? null,
          lon: location?.longitude ?? null,
        };
      } catch {
        // 比如还在 iCloud 里没下载下来的照片，读取可能失败，跳过即可
        return null;
      }
    }),
  );

  return points.filter((p): p is PhotoPoint => p !== null);
}
