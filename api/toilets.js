export default async function handler(req, res) {

    try {

        const lat =
            Number(req.query.lat);

        const lng =
            Number(req.query.lng);

        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
        ) {

            return res.status(400).json({
                success: false,
                error: "緯度または経度が正しくありません"
            });
        }

        const radius = 500;

        const query = `
[out:json][timeout:10];

(
    node["amenity"="toilets"](around:${radius},${lat},${lng});
    way["amenity"="toilets"](around:${radius},${lat},${lng});
);

out center tags;
`;

        // =====================================================
        // Overpass候補
        // =====================================================

        const endpoints = [

            "https://overpass.private.coffee/api/interpreter",

            "https://overpass-api.de/api/interpreter"

        ];

        let lastError = null;

        // =====================================================
        // Overpassを順番に試す
        // =====================================================

        for (
            const endpoint of endpoints
        ) {

            try {

                console.log(
                    "Overpass接続開始:",
                    endpoint
                );

                const response =
                    await fetch(
                        endpoint,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/x-www-form-urlencoded",

                                "User-Agent":
                                    "BakusokuToiletNavi/1.0"
                            },

                            body:
                                "data=" +
                                encodeURIComponent(query),

                            signal:
                                AbortSignal.timeout(12000)
                        }
                    );

                console.log(
                    "Overpassステータス:",
                    endpoint,
                    response.status
                );

                if (!response.ok) {

                    const errorText =
                        await response.text();

                    console.error(
                        "Overpass HTTPエラー:",
                        endpoint,
                        response.status,
                        errorText
                    );

                    lastError =
                        new Error(
                            `Overpass ${response.status}`
                        );

                    continue;
                }

                const data =
                    await response.json();

                console.log(
                    "Overpass成功:",
                    endpoint,
                    data.elements?.length || 0
                );

                // =================================================
                // 施設データ変換
                // =================================================

                const facilities =
                    (data.elements || [])
                        .map(
                            (element) => {

                                let facilityLat =
                                    element.lat;

                                let facilityLng =
                                    element.lon;

                                if (
                                    element.center
                                ) {

                                    facilityLat =
                                        element.center.lat;

                                    facilityLng =
                                        element.center.lon;
                                }

                                if (
                                    typeof facilityLat !==
                                        "number" ||
                                    typeof facilityLng !==
                                        "number"
                                ) {

                                    return null;
                                }

                                const tags =
                                    element.tags || {};

                                return {

                                    id:
                                        element.id,

                                    name:
                                        tags.name ||
                                        "公衆トイレ",

                                    type:
                                        "公衆トイレ",

                                    lat:
                                        facilityLat,

                                    lng:
                                        facilityLng
                                };
                            }
                        )
                        .filter(
                            (facility) =>
                                facility !== null
                        );

                // =================================================
                // 成功
                // =================================================

                return res.status(200).json({

                    success: true,

                    count:
                        facilities.length,

                    facilities:
                        facilities

                });

            } catch (error) {

                console.error(
                    "Overpass接続失敗:",
                    endpoint,
                    error.message
                );

                lastError =
                    error;

            }
        }

        // =====================================================
        // 全サーバー失敗
        // =====================================================

        throw new Error(
            lastError?.message ||
            "Overpass APIに接続できませんでした"
        );

    } catch (error) {

        console.error(
            "周辺施設検索エラー:",
            error
        );

        return res.status(500).json({

            success: false,

            error:
                error.message ||
                "周辺施設の検索に失敗しました"

        });
    }
}
