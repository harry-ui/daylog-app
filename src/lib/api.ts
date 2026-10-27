// 调用你自己的后端（backend/），由后端去调大模型。
// App 里永远不放大模型的 API Key。
import type { Stop } from './cluster';
import { hhmm } from './date';

// 在项目根目录的 .env 里设置：EXPO_PUBLIC_API_URL=http://你Mac的局域网IP:8000
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
// 和 backend/.env 里的 DAYLOG_API_TOKEN 一样。注意 EXPO_PUBLIC_ 开头的变量会被打包进 App，
// 所以它只能挡住"同一个 Wi-Fi 里的陌生人"，不能当成真正的密钥。
const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN ?? '';

export type GenerateRequest = {
  date: string;
  stops: { start: string; end: string; place: string; photoCount: number }[];
  emotions: string[];
  note: string;
  style: string;
};

/** 只发送摘要文本：时间段 + 地名 + 照片数量。不发照片、不发坐标。 */
export function buildRequest(
  date: string,
  stops: Stop[],
  emotions: string[],
  note: string,
  style: string,
): GenerateRequest {
  return {
    date,
    stops: stops.map((s) => ({
      start: hhmm(s.start),
      end: hhmm(s.end),
      place: s.placeName ?? '未知地点',
      photoCount: s.photos.length,
    })),
    emotions,
    note: note.trim(),
    style,
  };
}

export async function generateText(req: GenerateRequest): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${API_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    if (res.status === 401) throw new Error('后端拒绝了请求：检查 .env 里的 EXPO_PUBLIC_API_TOKEN 和后端的 DAYLOG_API_TOKEN 是否一致');
    if (res.status === 429) throw new Error('生成得太频繁了，过几分钟再试');
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`后端返回 ${res.status}${detail ? `：${detail.slice(0, 200)}` : ''}`);
    }
    const data = (await res.json()) as { text: string };
    return data.text;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('请求超时，检查后端是否在运行');
    if (e instanceof TypeError) throw new Error(`连不上后端（${API_URL}）。手机和 Mac 要在同一个 Wi-Fi 下。`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
