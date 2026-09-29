export default async function handler(req, res) {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({
                error: "緯度または経度が正しくありません"
            });
        }

        // 検索範囲：現在地から1000m
        const radius = 1000;

        // Overpass APIの検索条件
        const query = `
[out:json][timeout:25];
(
    nwr(around:${radius},${lat},${lng})["amenity"="toilets"];
    nwr(around:${radius},${lat},${lng})["shop"="convenience"];
    nwr(around:${radius},${lat},${lng})["shop"="supermarket"];
    nwr(around:${radius},${lat},${lng})["shop"="chemist"];
    nwr(around:${radius},${lat},${lng})["amenity"="pharmacy"];
    nwr(around:${radius},${lat},${lng})["shop"="mall"];
    nwr(around:${radius},${lat},${lng})["shop"="department_store"];
    nwr(around:${radius},${lat},${lng})["railway"="station"];
    nwr(around:${radius},${lat},${lng})["public_transport"="station"];
    nwr(around:${radius},${lat},${lng})["leisure"="park"];
);
out center tags;
`;

        const response = await fetch(
            "https://overpass.private.coffee/api/interpreter",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: "data=" + encodeURIComponent(query)
            }
        );

        if (!response.ok) {
            throw new Error(
                `Overpass API error: ${response.status}`
            );
        }

        const data = await response.json();

        const facilities = data.elements
            .map((element) => {

                let facilityLat = element.lat;
                let facilityLng = element.lon;

                // way / relationの場合
                if (element.center) {
                    facilityLat = element.center.lat;
                    facilityLng = element.center.lon;
                }

                if (
                    typeof facilityLat !== "number" ||
                    typeof facilityLng !== "number"
                ) {
                    return null;
                }

                const tags = element.tags || {};

                let type = "施設";

                if (tags.amenity === "toilets") {
                    type = "公衆トイレ";
                } else if (tags.shop === "convenience") {
                    type = "コンビニ";
                } else if (tags.shop === "supermarket") {
                    type = "スーパー";
                } else if (tags.shop === "chemist") {
                    type = "ドラッグストア";
                } else if (tags.amenity === "pharmacy") {
                    type = "薬局";
                } else if (tags.shop === "mall") {
                    type = "ショッピングモール";
                } else if (tags.shop === "department_store") {
                    type = "百貨店";
                } else if (
                    tags.railway === "station" ||
                    tags.public_transport === "station"
                ) {
                    type = "駅";
                } else if (tags.leisure === "park") {
                    type = "公園";
                }

                return {
                    id: element.id,
                    name: tags.name || type,
                    type: type,
                    lat: facilityLat,
                    lng: facilityLng
                };
            })
            .filter((facility) => facility !== null);

        return res.status(200).json({
            success: true,
            count: facilities.length,
            facilities: facilities
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            error: "周辺施設の検索に失敗しました"
        });
    }
}
