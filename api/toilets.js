import { tajimiParks } from "../data/tajimi_parks.js";

const SEARCH_RADIUS = 1000;
const TIMEOUT_MS = 12000;
const CACHE_TTL = 60 * 1000;

const cache = new Map();
const pendingRequests = new Map();

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

function createCacheKey(lat, lng) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

// 保存済みの多治見市公園データを取得
function getLocalParks(userLat, userLng) {
  const parks = Array.isArray(tajimiParks) ? tajimiParks : [];
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

    if (distance > SEARCH_RADIUS) continue;

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

// Overpass APIで公園・公衆トイレ・コンビニを検索
async function searchOverpass(lat, lng) {
  const query = `
[out:json][timeout:10];
(
  node(around:${SEARCH_RADIUS},${lat},${lng})["amenity"="toilets"];
  way(around:${SEARCH_RADIUS},${lat},${lng})["amenity"="toilets"];
  relation(around:${SEARCH_RADIUS},${lat},${lng})["amenity"="toilets"];

  node(around:${SEARCH_RADIUS},${lat},${lng})["shop"="convenience"];
  way(around:${SEARCH_RADIUS},${lat},${lng})["shop"="convenience"];
  relation(around:${SEARCH_RADIUS},${lat},${lng})["shop"="convenience"];

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
      throw new Error(
        "施設データの形式が正しくありません"
      );
    }

    return data.elements;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Overpassのデータをアプリ用に変換
function convertOverpassFacilities(
  elements,
  userLat,
  userLng
) {
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

    const tags = element.tags || {};

    let type = null;

    if (tags.amenity === "toilets") {
      type = "toilet";
    } else if (tags.shop === "convenience") {
      type = "convenience";
    } else if (tags.leisure === "park") {
      type = "park";
    }

    if (!type) continue;

    const distance = calculateDistance(
      userLat,
      userLng,
      lat,
      lng
    );

    if (distance > SEARCH_RADIUS) continue;

    let defaultName = "施設";

    if (type === "toilet") {
      defaultName = "公衆トイレ";
    } else if (type === "convenience") {
      defaultName = "コンビニ";
    } else if (type === "park") {
      defaultName = "公園";
    }

    facilities.push({
      id: `osm-${element.type}-${element.id}`,
      name: tags.name || defaultName,
      type,
      lat,
      lng,
      distance: Math.round(distance)
    });
  }

  return facilities;
}

// 保存済み公園とOverpassの施設を統合
function mergeFacilities(localParks, onlineFacilities) {
  const facilities = [...localParks];

  for (const facility of onlineFacilities) {
    const duplicate = facilities.some((existing) => {
      // 公園同士だけ、近い場所なら重複と判断する
      if (
        existing.type !== "park" ||
        facility.type !== "park"
      ) {
        return false;
      }

      return (
        calculateDistance(
          existing.lat,
          existing.lng,
          facility.lat,
          facility.lng
        ) < 40
      );
    });

    if (!duplicate) {
      facilities.push(facility);
    }
  }

  facilities.sort(
    (a, b) => a.distance - b.distance
  );

  return facilities;
}

// API本体
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
  const cached = cache.get(cacheKey);

  // キャッシュがあれば使用
  if (
    cached &&
    Date.now() - cached.time < CACHE_TTL
  ) {
    return res.status(200).json({
      success: true,
      count: cached.facilities.length,
      facilities: cached.facilities,
      cached: true
    });
  }

  // 同じ場所への同時リクエストを防止
  let searchPromise =
    pendingRequests.get(cacheKey);

  if (!searchPromise) {
    searchPromise = (async () => {
      // まず多治見市の保存済み公園データを取得
      const localParks = getLocalParks(
        lat,
        lng
      );

      let onlineFacilities = [];

      try {
        const elements =
          await searchOverpass(lat, lng);

        onlineFacilities =
          convertOverpassFacilities(
            elements,
            lat,
            lng
          );
      } catch (error) {
        console.error(
          "施設の外部検索に失敗:",
          {
            message: error.message,
            status: error.status
          }
        );
      }

      // データを統合
      const facilities =
        mergeFacilities(
          localParks,
          onlineFacilities
        );

      // キャッシュに保存
      cache.set(cacheKey, {
        time: Date.now(),
        facilities
      });

      return facilities;
    })();

    pendingRequests.set(
      cacheKey,
      searchPromise
    );
  }

  try {
    const facilities =
      await searchPromise;

    return res.status(200).json({
      success: true,
      count: facilities.length,
      facilities,
      cached: false
    });
  } catch (error) {
    console.error(
      "施設検索エラー:",
      error.message
    );

    return res.status(500).json({
      success: false,
      error: "施設の検索に失敗しました"
    });
  } finally {
    if (
      pendingRequests.get(cacheKey) ===
      searchPromise
    ) {
      pendingRequests.delete(cacheKey);
    }
  }
}
