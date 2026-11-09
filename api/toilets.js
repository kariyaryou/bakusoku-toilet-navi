import { tajimiParks } from "../data/tajimi_parks.js";

const SEARCH_RADIUS = 1000;
const TIMEOUT_MS = 12000;

// 2点間の距離を計算（メートル）
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(
    Math.sqrt(a),
    Math.sqrt(1 - a)
  );
}

// 保存済みの多治見市公園データを取得
function getLocalParks(userLat, userLng) {
  const facilities = [];

  for (const park of tajimiParks) {
    const lat = Number(park.lat);
    const lng = Number(park.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      continue;
    }

    const distance = calculateDistance(
      userLat,
      userLng,
      lat,
      lng
    );

    // 1km以内の公園だけを追加
    if (distance > SEARCH_RADIUS) {
      continue;
    }

    facilities.push({
      id: `tajimi-park-${park.id ?? facilities.length}`,
      name: park.name || "公園",
      type: "park",
      lat,
      lng,
      distance: Math.round(distance)
    });
  }

  return facilities;
}

// Overpass APIでコンビニを検索
async function searchConvenienceStores(lat, lng) {
  const query = `
[out:json][timeout:10];
(
  nwr(around:${SEARCH_RADIUS},${lat},${lng})
    ["shop"="convenience"];
);
out center tags;
`;

  const controller = new AbortController();

  const timeoutId = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
  );

  try {
    // GET形式でOverpass APIにアクセス
    const url =
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter" +
      encodeURIComponent(query);

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `Overpass API HTTP ${response.status}`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data.elements)) {
      throw new Error(
        "Overpassから施設データを取得できませんでした"
      );
    }

    // VercelのLogsで検索結果の件数を確認できる
    console.log(
      "Overpass コンビニ検索結果:",
      data.elements.length
    );

    return data.elements;

  } finally {
    clearTimeout(timeoutId);
  }
}

// Overpassのコンビニデータをアプリ用に変換
function convertConvenienceStores(
  elements,
  userLat,
  userLng
) {
  const facilities = [];

  for (const element of elements) {
    // nodeの場合はlat/lon、
    // wayやrelationの場合はcenterを使用
    const lat =
      element.lat ?? element.center?.lat;

    const lng =
      element.lon ?? element.center?.lon;

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      continue;
    }

    const distance = calculateDistance(
      userLat,
      userLng,
      lat,
      lng
    );

    if (distance > SEARCH_RADIUS) {
      continue;
    }

    const tags = element.tags || {};

    facilities.push({
      id: `osm-${element.type}-${element.id}`,
      name: tags.name || "コンビニ",
      type: "convenience",
      lat,
      lng,
      distance: Math.round(distance)
    });
  }

  return facilities;
}

// 公園とコンビニを統合
function mergeFacilities(
  localParks,
  convenienceStores
) {
  const facilities = [
    ...localParks,
    ...convenienceStores
  ];

  // 現在地から近い順に並べる
  facilities.sort(
    (a, b) => a.distance - b.distance
  );

  return facilities;
}

// API本体
export default async function handler(req, res) {
  // GET以外のアクセスは受け付けない
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "GETリクエストのみ対応しています"
    });
  }

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  // 緯度・経度をチェック
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return res.status(400).json({
      success: false,
      error: "緯度または経度が正しくありません"
    });
  }

  try {
    // ① 保存済みの公園データを取得
    const localParks = getLocalParks(lat, lng);

    // ② Overpass APIからコンビニを取得
    let convenienceStores = [];

    try {
      const elements =
        await searchConvenienceStores(lat, lng);

      convenienceStores =
        convertConvenienceStores(
          elements,
          lat,
          lng
        );

    } catch (error) {
      // コンビニ検索に失敗しても
      // 公園データは返す
      console.error(
        "コンビニ検索エラー:",
        error.message
      );
    }

    // ③ 公園とコンビニをまとめる
    const facilities = mergeFacilities(
      localParks,
      convenienceStores
    );

    // Vercel Logsで最終結果を確認
    console.log(
      "最終検索結果:",
      facilities.map(
        (facility) => ({
          name: facility.name,
          type: facility.type
        })
      )
    );

    return res.status(200).json({
      success: true,
      count: facilities.length,
      facilities
    });

  } catch (error) {
    console.error(
      "施設検索エラー:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "施設の検索に失敗しました"
    });
  }
}
