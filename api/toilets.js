
import { tajimiParks } from "../data/tajimi_parks.js";

// ==============================
// 設定
// ==============================

// 検索範囲：現在地から1km
const SEARCH_RADIUS = 1000;

// 通信タイムアウト：12秒
const TIMEOUT_MS = 12000;

// 検索結果の保存時間：60秒
const CACHE_TTL = 60 * 1000;

// キャッシュ
const cache = new Map();

// 同じ検索の重複実行を防ぐ
const pendingRequests = new Map();

// ==============================
// 距離を計算（メートル）
// ==============================

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

// ==============================
// キャッシュキー
// ==============================

function createCacheKey(lat, lng) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

// ==============================
// 多治見市の公園データを取得
// ==============================

function getLocalParks(userLat, userLng) {
  const parks = Array.isArray(tajimiParks)
    ? tajimiParks
    : [];

  const facilities = [];

  for (const park of parks) {
    const lat = Number(park.lat);
    const lng = Number(park.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
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

// ==============================
// Overpass APIで公園だけを検索
// ==============================

async function searchOverpassParks(lat, lng) {
  const query = `
[out:json][timeout:10];
(
  node(around:${SEARCH_RADIUS},${lat},${lng})["leisure"="park"];
  way(around:${SEARCH_RADIUS},${lat},${lng})["leisure"="park"];
  relation(around:${SEARCH_RADIUS},${lat},${lng})["leisure"="park"];
);
out center tags;
`;

  const controller = new AbortController();

  const timeoutId = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
  );

  try {
    const response = await fetch(
      "https://overpass.private.coffee/api/interpreter",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
      }
    );

    if (!response.ok) {
      const error = new Error(
        `Overpass API HTTP ${response.status}`
      );

      error.status = response.status;
      throw error;
    }

    const data = await response.json();

    if (!Array.isArray(data.elements)) {
      throw new Error("公園データの形式が正しくありません");
    }

    return data.elements;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ==============================
// Overpassの公園データを変換
// ==============================

function convertOverpassParks(elements, userLat, userLng) {
  const facilities = [];

  for (const element of elements) {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;

    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
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

    facilities.push({
      id: `osm-park-${element.type}-${element.id}`,
      name: element.tags?.name || "公園",
      type: "park",
      lat,
      lng,
      distance: Math.round(distance)
    });
  }

  return facilities;
}

// ==============================
// 公園を統合して重複を除外
// ==============================

function mergeParks(localParks, onlineParks) {
  const facilities = [...localParks];

  for (const park of onlineParks) {
    const duplicate = facilities.some((existing) => {
      return calculateDistance(
        existing.lat,
        existing.lng,
        park.lat,
        park.lng
      ) < 40;
    });

    if (!duplicate) {
      facilities.push(park);
    }
  }

  facilities.sort((a, b) => a.distance - b.distance);

  return facilities;
}

// ==============================
// Vercel API本体
// ==============================

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      success: false,
      error: "GETリクエストのみ対応しています"
    });
  }

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (
    req.query.lat === undefined ||
    req.query.lng === undefined ||
    req.query.lat === "" ||
    req.query.lng === "" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return res.status(400).json({
      success: false,
      error: "緯度または経度が正しくありません"
    });
  }

  const cacheKey = createCacheKey(lat, lng);
  const now = Date.now();

  // キャッシュを確認
  const cached = cache.get(cacheKey);

  if (cached && now - cached.time < CACHE_TTL) {
    return res.status(200).json({
      success: true,
      count: cached.facilities.length,
      facilities: cached.facilities,
      cached: true
    });
  }

  // 同じ場所を検索中なら、その結果を共有
  let searchPromise = pendingRequests.get(cacheKey);

  if (!searchPromise) {
    searchPromise = (async () => {
      // まず保存済みの多治見市の公園データを使う
      const localParks = getLocalParks(lat, lng);

      // Overpassが失敗しても、保存済みデータは利用する
      let onlineParks = [];

      try {
        const elements = await searchOverpassParks(lat, lng);

        onlineParks = convertOverpassParks(
          elements,
          lat,
          lng
        );
      } catch (error) {
        console.error("公園の外部検索に失敗:", {
          message: error.message,
          status: error.status
        });
      }

      const facilities = mergeParks(
        localParks,
        onlineParks
      );

      cache.set(cacheKey, {
        time: Date.now(),
        facilities
      });

      // 古いキャッシュを削除
      for (const [key, value] of cache.entries()) {
        if (Date.now() - value.time >= CACHE_TTL) {
          cache.delete(key);
        }
      }

      return facilities;
    })();

    pendingRequests.set(cacheKey, searchPromise);
  }

  try {
    const facilities = await searchPromise;

    return res.status(200).json({
      success: true,
      count: facilities.length,
      facilities,
      cached: false
    });
  } catch (error) {
    console.error("公園検索エラー:", error.message);

    return res.status(500).json({
      success: false,
      error: "公園の検索に失敗しました"
    });
  } finally {
    if (pendingRequests.get(cacheKey) === searchPromise) {
      pendingRequests.delete(cacheKey);
    }
  }
}
