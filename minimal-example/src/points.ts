// 範例資料。正式專案的點位來自 Kit hotspot 的 jsonData(lat / long),
// 見主專案 src/demo/demoScenes.ts 與 src/demo/MapPage.tsx 的 toGeo()。
export interface GeoPoint {
    id: string;
    kind: 'alert' | 'intersection';
    label: string;
    lng: number;
    lat: number;
}

export const POINTS: GeoPoint[] = [
    { id: 'S25', kind: 'intersection', label: '外環西路&左楠路', lat: 22.7121264, lng: 120.3026463 },
    { id: 'S40', kind: 'intersection', label: '國光中學&後昌路', lat: 22.7079588, lng: 120.3048537 },
    { id: 'S43', kind: 'intersection', label: '左楠路&後昌路', lat: 22.7079132, lng: 120.3023032 },
    { id: 'S48', kind: 'intersection', label: '軍校路&世運大道', lat: 22.7006821, lng: 120.2924987 },
    { id: 'S54', kind: 'intersection', label: '左營大路&屏山新村', lat: 22.6972228, lng: 120.3016898 },
    { id: 'S70', kind: 'intersection', label: '左楠路&世運大道', lat: 22.7008975, lng: 120.3024416 },
    { id: 'A1', kind: 'alert', label: '交通事故', lat: 22.7042, lng: 120.2990 },
    { id: 'A2', kind: 'alert', label: '路段封閉', lat: 22.6990, lng: 120.2960 },
];
