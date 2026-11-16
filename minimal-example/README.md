# MapLibre 疊加標記最小範例

```bash
npm install
npm run dev      # 開發
npm run build    # 型別檢查 + 打包到 dist/
```

| 檔案 | 內容 |
|---|---|
| `src/MapView.tsx` | 地圖、DOM 標記疊加、fitBounds / flyTo、離線樣式解析、錯誤處理 |
| `src/MapView.css` | 標記與疊加層樣式 |
| `src/points.ts` | 範例點位(世運周邊號誌路口 + 2 個假事件) |

離線底圖：把主專案 `scripts/fetch-offline-map.mjs` 產出的 `offline-map/` 複製成 `public/map/`,
建立 `.env.local` 寫入 `VITE_MAP_STYLE=map/style.json`。

各手法的原因見上一層的 `README.md` 第 4 節。
