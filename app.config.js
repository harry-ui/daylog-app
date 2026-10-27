// 在 app.json 的基础上补充需要从环境变量读取的配置（密钥不能写进 app.json 提交到 GitHub）。
// 本地开发时从项目根目录的 .env 读；用 EAS 云端打包时，在 EAS 的环境变量里设置同名变量。
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    // Android 上 react-native-maps 需要 Google Maps 的 Key，否则一打开地图就会崩溃。iOS 用苹果地图，不需要。
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY }],
  ],
});
