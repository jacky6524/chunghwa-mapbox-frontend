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
| `scripts/fetch-offline-map.mjs` | 下載離線底圖(樣式、圖磚、sprite、字型)到 `public/map/` |

離線底圖:

```bash
npm run fetch-map                                   # 約 24 MB,下載到 public/map/(gitignored)
echo VITE_MAP_STYLE=map/style.json > .env.local
npm run dev
```

各手法的原因見上一層的 `README.md` 第 4 節。
