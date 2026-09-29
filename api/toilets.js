export default async function handler(req, res) {

    try {

        const lat =
            Number(req.query.lat);

        const lng =
            Number(req.query.lng);

        // ===============================
        // 緯度・経度チェック
        // ===============================

        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
        ) {

            return res.status(400).json({
                success: false,
                error: "緯度または経度が正しくありません"
            });
        }

        // ===============================
        // 検索範囲
        // ===============================

        const radius = 1000;

        // ===============================
        // 使用するOverpass
        // ===============================

        const OVERPASS_URL =
            "https://overpass.private.coffee/api/interpreter";

        // ===============================
        // ① 公衆トイレを検索
        // ===============================

        const toiletQuery = `
[out:json][timeout:15];
nwr(
    around:${radius},
    ${lat},
    ${lng}
)["amenity"="toilets"];
out center tags;
`;

        let response =
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
                        encodeURIComponent(
                            toiletQuery
                        )
                }
            );

        // ===============================
        // エラー
        // ===============================

        if (!response.ok) {

            console.error(
                "Overpass toilet error:",
                response.status
            );

            throw new Error(
                `Overpass API error: ${response.status}`
            );
        }

        let data =
            await response.json();

        // ===============================
        // 公衆トイレ取得
        // ===============================

        let facilities =
            convertFacilities(
                data.elements || []
            );

        // ===============================
        // 公衆トイレがなければ
        // 他の施設を検索
        // ===============================

        if (
            facilities.length === 0
        ) {

            const facilityQuery = `
[out:json][timeout:15];
(
    nwr(
        around:${radius},
        ${lat},
        ${lng}
    )["shop"="convenience"];

    nwr(
        around:${radius},
        ${lat},
        ${lng}
    )["shop"="supermarket"];

    nwr(
        around:${radius},
        ${lat},
        ${lng}
    )["shop"="chemist"];

    nwr(
        around:${radius},
        ${lat},
        ${lng}
    )["amenity"="pharmacy"];

    nwr(
        around:${radius},
        ${lat},
        ${lng}
    )["shop"="mall"];

    nwr(
        around:${radius},
        ${lat},
        ${lng}
    )["shop"="department_store"];

    nwr(
        around:${radius},
        ${lat},
        ${lng}
    )["railway"="station"];

    nwr(
        around:${radius},
        ${lat},
        ${lng}
    )["public_transport"="station"];

    nwr(
        around:${radius},
        ${lat},
        ${lng}
    )["leisure"="park"];
);
out center tags;
`;

            response =
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
                            encodeURIComponent(
                                facilityQuery
                            )
                    }
                );

            if (!response.ok) {

                console.error(
                    "Overpass facility error:",
                    response.status
                );

                throw new Error(
                    `Overpass API error: ${response.status}`
                );
            }

            data =
                await response.json();

            facilities =
                convertFacilities(
                    data.elements || []
                );
        }

        // ===============================
        // 結果を返す
        // ===============================

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
                "周辺施設の検索に失敗しました"

        });
    }
}

// ==========================================================================
// 施設データ変換
// ==========================================================================

function convertFacilities(
    elements
) {

    return elements

        .map(
            (element) => {

                let facilityLat =
                    element.lat;

                let facilityLng =
                    element.lon;

                // ===============================
                // way / relation
                // ===============================

                if (
                    element.center
                ) {

                    facilityLat =
                        element.center.lat;

                    facilityLng =
                        element.center.lon;
                }

                // ===============================
                // 座標がない場合
                // ===============================

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

                // ===============================
                // 施設タイプ
                // ===============================

                let type =
                    "施設";

                if (
                    tags.amenity ===
                    "toilets"
                ) {

                    type =
                        "公衆トイレ";

                } else if (
                    tags.shop ===
                    "convenience"
                ) {

                    type =
                        "コンビニ";

                } else if (
                    tags.shop ===
                    "supermarket"
                ) {

                    type =
                        "スーパー";

                } else if (
                    tags.shop ===
                    "chemist"
                ) {

                    type =
                        "ドラッグストア";

                } else if (
                    tags.amenity ===
                    "pharmacy"
                ) {

                    type =
                        "薬局";

                } else if (
                    tags.shop ===
                    "mall"
                ) {

                    type =
                        "ショッピングモール";

                } else if (
                    tags.shop ===
                    "department_store"
                ) {

                    type =
                        "百貨店";

                } else if (
                    tags.railway ===
                    "station" ||
                    tags.public_transport ===
                    "station"
                ) {

                    type =
                        "駅";

                } else if (
                    tags.leisure ===
                    "park"
                ) {

                    type =
                        "公園";
                }

                // ===============================
                // 施設名
                // ===============================

                const name =
                    tags.name ||
                    type;

                return {

                    id:
                        element.id,

                    name:
                        name,

                    type:
                        type,

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
}
