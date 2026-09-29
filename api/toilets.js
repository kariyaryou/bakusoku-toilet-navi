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

        // 検索範囲を1kmから500mに縮小
        const radius = 500;

        // 日本向けOverpass
        const OVERPASS_URL =
            "https://overpass.osm.jp/api/interpreter";

        // =====================================================
        // 公衆トイレを検索
        // =====================================================

        const query = `
[out:json][timeout:10];

(
    node["amenity"="toilets"](around:${radius},${lat},${lng});
    way["amenity"="toilets"](around:${radius},${lat},${lng});
);

out center tags;
`;

        console.log(
            "Overpass検索開始",
            lat,
            lng
        );

        const response =
            await fetch(
                OVERPASS_URL,
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
                        encodeURIComponent(query)
                }
            );

        console.log(
            "Overpassステータス:",
            response.status
        );

        if (!response.ok) {

            const errorText =
                await response.text();

            console.error(
                "Overpassエラー:",
                response.status,
                errorText
            );

            throw new Error(
                `Overpass API error: ${response.status}`
            );
        }

        const data =
            await response.json();

        console.log(
            "Overpass結果:",
            data.elements?.length || 0
        );

        // =====================================================
        // 施設データ変換
        // =====================================================

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

        // =====================================================
        // 結果
        // =====================================================

        return res.status(200).json({

            success: true,

            count:
                facilities.length,

            facilities:
                facilities

        });

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
