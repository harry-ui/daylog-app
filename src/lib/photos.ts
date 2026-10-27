// 读取某一天相册里的照片（时间 + GPS），全部在手机本地完成。
import { Asset, Query, AssetField, MediaType, MediaSubtype, requestPermissionsAsync } from 'expo-media-library';
import type { PhotoPoint } from './cluster';
import { sampleEvenly } from './sample';

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

/** 一天最多读这么多张照片的定位，再多就均匀抽样 */
export const MAX_PHOTOS_PER_DAY = 200;

export type DayPhotos = {
  photos: PhotoPoint[];
  /** 当天一共有多少张照片（不算截图） */
  total: number;
  /** total 超过上限，photos 是抽样出来的 */
  sampled: boolean;
};

export async function loadPhotosForDay(date: string, maxPhotos = MAX_PHOTOS_PER_DAY): Promise<DayPhotos> {
  const { start, end } = dayRange(date);

  // 先只读轻量的元数据（不解析文件、不读定位），拿到当天的全部照片
  const all = await new Query()
    .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
    .gte(AssetField.CREATION_TIME, start)
    .lt(AssetField.CREATION_TIME, end)
    .orderBy({ key: AssetField.CREATION_TIME, ascending: true })
    .exeForMetadata();

  // 截图一般不代表"去了哪里"，跳过（mediaSubtypes 只有 iOS 有）
  const candidates = all.filter((m) => !m.mediaSubtypes?.includes(MediaSubtype.SCREENSHOT));
  // 照片太多时在一整天里均匀抽，而不是只取前面的，免得晚上去的地方整个消失
  const picked = sampleEvenly(candidates, maxPhotos);

  const points = await Promise.all(
    picked.map(async (m): Promise<PhotoPoint | null> => {
      const time = toMs(m.creationTime);
      if (time == null) return null;
      try {
        const asset = new Asset(m.id);
        const [uri, location] = await Promise.all([asset.getUri(), asset.getLocation()]);
        return {
          id: m.id,
          uri,
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

  return {
    photos: points.filter((p): p is PhotoPoint => p !== null),
    total: candidates.length,
    sampled: picked.length < candidates.length,
  };
}
