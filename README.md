# PeakTrace 百岳完登紀錄

記錄台灣百岳完登進度、與山友約爬山的網站。

## 啟動

```bash
npm install
npm start          # http://localhost:3000（PORT 環境變數可改埠號）
npm run dev        # 開發模式，修改程式自動重啟
npm run scrape     # 重新從維基百科抓取百岳資料 → data/peaks.json
```

需求：Node.js 22.13 以上（使用內建 `node:sqlite`，不需編譯原生模組）。

## 功能

| 功能 | 說明 |
| --- | --- |
| 百岳資料 | `scripts/scrape-peaks.js` 解析中文維基百科「台灣百岳」表格，以 MediaWiki / Wikidata API 補座標。欄位：編號、名稱、高度、縣市、北中南東區域、山脈、路線、國家公園、分級、Google 地圖連結。伺服器啟動時自動匯入 SQLite。 |
| 多使用者 | 只需輸入帳號即可登入（不驗證密碼），新帳號自動建立；session 存於 SQLite |
| 登山紀錄 | Select2 搜尋（依區域分組，可用山名 / 編號 / 縣市搜尋）＋ Leaflet 台灣地圖點選，兩者同步；選好後填完登日期 |
| 儀表板 | 完成數 / 百分比、分區完成度、最高登頂、累積高度、完登地圖、每年新完登、即將出發行程 |
| 約爬山 | 設定日期與目標百岳，其他使用者可報名；行程頁顯示目標資訊、地圖、各成員已完登狀況，以及天氣；行程結束後可一鍵登記完登 |
| 天氣 | Open-Meteo（免金鑰），依山頂高度修正氣溫。出發日在 16 天內 → 逐日預報；更遠 → 過去 5 年同期實際觀測作參考 |
| 山友排行 | 所有使用者完登數排行，可查看他人儀表板 |

區域劃分以百岳所列的第一個縣市為準：北部（臺北、新北、基隆、桃園、新竹）、中部（苗栗、臺中、彰化、南投、雲林）、南部（嘉義、臺南、高雄、屏東）、東部（宜蘭、花蓮、臺東）。

## 結構

```
scripts/scrape-peaks.js   百岳爬蟲
src/server.js             Express 進入點
src/db.js                 SQLite schema、百岳匯入
src/weather.js            Open-Meteo 預報 / 歷年同期
src/routes/               auth、main（儀表板/紀錄/百岳）、plans（約爬山）
views/                    EJS 頁面
public/js/                peak-map.js（地圖）、peak-picker.js（select2 + 地圖挑選器）
data/                     peaks.json、peaktrace.db（執行後產生）
```
