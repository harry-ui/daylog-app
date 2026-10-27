# DayLog

根据当天的照片（时间 + GPS）自动整理出一天去过的地方，再根据你选的情绪词，让 AI 写一段属于这一天的文字。

照片和坐标只在手机上处理；发给 AI 的只有「时间段 + 地名 + 照片数量 + 情绪词 + 你写的话」。

```
iPhone App (Expo / React Native)                    你的 Mac
┌──────────────────────────────────────┐          ┌───────────────────────┐
│ 相册照片 → 时间 + GPS                 │          │ backend/ (FastAPI)    │
│   → 聚类成停留点 (src/lib/cluster.ts)  │  摘要文本  │   prompt.py 组织 prompt │
│   → 系统地理编码查地名                 │ ───────► │   调用 Claude API      │
│   → 地图 + 时间线                     │ ◄─────── │   返回文字             │
│ 选情绪词 / 写一句话 → 生成 → 存 SQLite  │   文字    └───────────────────────┘
└──────────────────────────────────────┘
```

## 第一次运行

需要：Mac、iPhone、两者连同一个 Wi-Fi；Mac 上装好 [Node.js](https://nodejs.org)（LTS 版）和 Python 3。

### 1. 启动后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # 先不填 Key 也行，会进入 mock 模式
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

浏览器打开 http://localhost:8000/health ，看到 `"mode": "mock"` 就说明后端好了。
想接真正的 AI：

1. 去 https://console.anthropic.com 申请 API Key，填到 `backend/.env` 的 `ANTHROPIC_API_KEY`
2. 再生成一个访问口令填到 `DAYLOG_API_TOKEN`（接了真 AI 必须设置，否则后端会拒绝生成）：
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(24))"
   ```
3. 重启后端，`mode` 会变成 `llm`，`auth` 是 `true`

> 为什么要口令：后端监听的是整个局域网，学校、咖啡店的 Wi-Fi 里别人也能连到你的 Mac。没有口令的话，谁都能用你的 Key 生成文字。后端还对每台设备做了限流（默认 10 分钟 20 次，`DAYLOG_RATE_LIMIT` 可调）。

### 2. 启动 App

另开一个终端，在项目根目录：

```bash
npm install
npx expo install --fix        # 把依赖版本对齐到当前 Expo SDK（这一步需要联网）
cp .env.example .env          # 把 IP 改成你 Mac 的局域网 IP；EXPO_PUBLIC_API_TOKEN 填成和后端一样的口令
npx expo start
```

Mac 的 IP：系统设置 → Wi-Fi → 当前网络旁边的「详细信息」。

### 3. 在 iPhone 上打开

1. App Store 安装 **Expo Go**
2. 用 iPhone 相机扫终端里的二维码
3. 第一次会要照片权限和位置权限（位置只用来把坐标转成地名）

> Android：在 Expo Go 里可以直接用。打 Android 开发版时，地图需要 Google Maps 的 Key：在 [Google Cloud Console](https://console.cloud.google.com/google/maps-apis) 开通 Maps SDK for Android，把 Key 填到 `.env` 的 `GOOGLE_MAPS_ANDROID_API_KEY`（用 EAS 云端打包时在 EAS 的环境变量里设置同名变量），由 `app.config.js` 读进去。iOS 用的是苹果地图，不需要。

> 如果 Expo Go 提示版本不兼容或某个模块不可用，改用开发版：`npx expo run:ios --device`（需要装 Xcode），或者 `npx eas-cli@latest build --profile development --platform ios`。

## 代码结构

```
src/
  app/                    页面（Expo Router：一个文件就是一个页面）
    _layout.tsx           导航
    index.tsx             首页：选日期 + 已保存的日记
    day/[date].tsx        某一天：地图、时间线、情绪词、生成、保存
  lib/
    photos.ts             读取某天的照片和定位
    cluster.ts            照片 → 停留点，合并 GPS 漂移（有单元测试）
    sample.ts             照片太多时均匀抽样（有单元测试）
    geocode.ts            坐标 → 地名
    db.ts                 本地 SQLite
    api.ts                调后端（只发摘要）
  constants/emotions.ts   情绪词和文字风格
backend/
  main.py                 /generate 接口
  prompt.py               prompt，调效果主要改这里
```

## 测试

```bash
npm test                  # 停留点聚类 + 抽样
npm run typecheck         # TypeScript 类型检查
cd backend && pytest -q   # 后端（不会真的调用 AI）
```

## 可以调的地方

- **停留点切分**：`cluster.ts` 里的 `maxDistanceM`（默认 250 米）和 `maxGapMs`（默认 90 分钟）。拿自己几天的照片试，看切得是否合理。
- **GPS 漂移**：夹在同一个地方中间、只有 1 张（`outlierMaxPhotos`）、前后间隔不到 20 分钟（`outlierMaxMs`）的停留点会被当成定位漂移合并掉。
- **每天读多少张照片**：`photos.ts` 里的 `MAX_PHOTOS_PER_DAY`（默认 200）。超过时在一整天里均匀抽样，界面上会提示。
- **文字效果**：`backend/prompt.py`。改完重启后端就生效，不用重新打包 App。
- **情绪词**：`src/constants/emotions.ts`。

## 下一步可以做什么

- 情绪统计：哪些地方、哪些时间段你的情绪更好
- 「一年前的今天」回顾
- 后台低频定位（iOS 的 significant location change），补上没拍照时的路线
- 上线前：现在的口令是打包进 App 里的，限流也只存在内存里，只适合自己用。给别人用之前要换成真正的用户登录，限流换成 Redis 之类

## 注意

- `backend/.env` 里有 API Key，已经在 `.gitignore` 里，不要提交到 GitHub。
- 截图会被自动跳过；还在 iCloud 里没下载的照片可能读不到。
