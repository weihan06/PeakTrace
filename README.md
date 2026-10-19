# PeakTrace 百岳完登紀錄

記錄台灣百岳完登進度、與山友約爬山的網站。純靜態網頁（GitHub Pages），資料存在 Firebase Firestore。

網址：https://weihan06.github.io/PeakTrace/

## Firebase 設定（第一次需要）

1. 到 [Firebase 主控台](https://console.firebase.google.com/) 新增專案（不需要啟用 Google Analytics）。
2. 左側「建構 → Firestore Database」→ 建立資料庫 → 選「以正式版模式啟動」，位置選 `asia-east1`（台灣）。
3. Firestore 的「規則」分頁，把本專案的 `firestore.rules` 全部內容貼上並發布。
4. 「專案設定（齒輪）→ 一般 → 你的應用程式」新增網頁應用程式（`</>` 圖示），複製 `firebaseConfig` 的值，
   填入 `docs/js/firebase-config.js`，commit 並 push。

免費的 Spark 方案即可（每天 5 萬次讀取、2 萬次寫入）。

## 功能

| 功能 | 說明 |
| --- | --- |
| 百岳資料 | `scripts/scrape-peaks.js` 解析中文維基百科「台灣百岳」表格，以 MediaWiki / Wikidata API 補座標。欄位：編號、名稱、高度、縣市、北中南東區域、山脈、路線、國家公園、分級、Google 地圖連結 |
| 多使用者 | 只需輸入帳號即可登入（不驗證密碼），新帳號自動建立；登入狀態存在瀏覽器 |
| 登山紀錄 | Select2 搜尋（依區域分組，可用山名 / 編號 / 縣市搜尋）＋ Leaflet 台灣地圖點選，兩者同步；選好後填完登日期 |
| 儀表板 | 完成數 / 百分比、分區完成度、最高登頂、累積高度、完登地圖、每年新完登、即將出發行程 |
| 約爬山 | 設定日期與目標百岳，其他使用者可報名；行程頁顯示目標資訊、地圖、各成員已完登狀況，以及天氣；行程開始後可一鍵登記完登 |
| 天氣 | Open-Meteo（免金鑰），依山頂高度修正氣溫。出發日在 16 天內 → 逐日預報；更遠 → 過去 5 年同期實際觀測作參考 |
| 山友排行 | 所有使用者完登數排行，可查看他人儀表板 |

區域劃分以百岳所列的第一個縣市為準：北部（臺北、新北、基隆、桃園、新竹）、中部（苗栗、臺中、彰化、南投、雲林）、南部（嘉義、臺南、高雄、屏東）、東部（宜蘭、花蓮、臺東）。

## 安全性

沒有密碼，也沒有 Firebase Auth，`firestore.rules` 只能檢查資料格式，無法確認寫入者身分。
知道帳號名稱就能以該帳號登入；懂技術的人也能直接呼叫 Firestore 刪改資料。適合朋友間使用。

## 本機預覽

`docs/` 是純靜態網站，用任何靜態伺服器開啟即可（ES module 不能用 `file://` 直接開）：

```bash
npx serve docs
```

## 更新百岳資料

```bash
npm run scrape     # 重新從維基百科抓取 → docs/data/peaks.json
```

## 結構

```
docs/                     GitHub Pages 網站根目錄
  *.html                  各頁面（登入、儀表板、紀錄、百岳、行程、排行）
  js/app.js               Firestore 資料存取、登入、版型、統計
  js/weather.js           Open-Meteo 預報 / 歷年同期
  js/peak-map.js          Leaflet 地圖
  js/peak-picker.js       select2 + 地圖挑選器
  js/firebase-config.js   Firebase 設定
  data/peaks.json         百岳資料
firestore.rules           Firestore 安全規則
scripts/scrape-peaks.js   百岳爬蟲
```

## Firestore 資料結構

| 集合 | 文件 ID | 欄位 |
| --- | --- | --- |
| `users` | `u_` + 小寫帳號（URL 編碼） | username, display_name, created_at |
| `climbs` | `使用者ID_百岳編號_日期` | user_id, peak_no, climb_date, note, plan_id, created_at |
| `plans` | 自動 | creator_id, creator_name, title, start_date, end_date, meeting_point, notes, created_at, peak_nos[], member_ids[] |
