
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "GETリクエストのみ対応しています"
    });
  }

  const apiKey = process.env.ORS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "APIキーが設定されていません"
    });
  }

  const startLat = Number(req.query.startLat);
  const startLng = Number(req.query.startLng);
  const endLat = Number(req.query.endLat);
  const endLng = Number(req.query.endLng);

  const values = [startLat, startLng, endLat, endLng];

  if (
    values.some(value => !Number.isFinite(value)) ||
    Math.abs(startLat) > 90 ||
    Math.abs(endLat) > 90 ||
    Math.abs(startLng) > 180 ||
    Math.abs(endLng) > 180
  ) {
    return res.status(400).json({
      success: false,
      error: "緯度または経度が正しくありません"
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(
      "https://api.openrouteservice.org/v2/directions/foot-walking/geojson",
      {
        method: "POST",
        headers: {
          "Authorization": apiKey,
          "Content-Type": "application/json",
          "Accept": "application/geo+json, application/json"
        },
        body: JSON.stringify({
          coordinates: [
            [startLng, startLat],
            [endLng, endLat]
          ],
          instructions: true,
          language: "ja",
          units: "m"
        }),
        signal: controller.signal
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("徒歩ルートAPIエラー:", response.status, data);

      return res.status(502).json({
        success: false,
        error: "徒歩ルートを取得できませんでした",
        detail: data.error?.message || data.error || response.status
      });
    }

    const feature = data.features?.[0];

    if (!feature || !feature.geometry?.coordinates) {
      return res.status(502).json({
        success: false,
        error: "ルート情報が見つかりませんでした"
      });
    }

    const properties = feature.properties || {};
    const summary = properties.summary || {};
    const segments = properties.segments || [];

    const coordinates = feature.geometry.coordinates.map(point => [
      point[1],
      point[0]
    ]);

    const instructions = segments.flatMap(segment =>
      (segment.steps || []).map(step => ({
        text: step.instruction || "そのまま進んでください",
        distance: step.distance || 0
      }))
    );

    return res.status(200).json({
      success: true,
      distance: summary.distance,
      duration: summary.duration,
      coordinates,
      instructions
    });
  } catch (error) {
    console.error("徒歩ルート取得エラー:", error.message);

    return res.status(502).json({
      success: false,
      error: error.name === "AbortError"
        ? "徒歩ルートの取得がタイムアウトしました"
        : "徒歩ルートAPIとの通信に失敗しました"
    });
  } finally {
    clearTimeout(timeout);
  }
}

