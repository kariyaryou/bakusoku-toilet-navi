import { tajimiParks } from "../data/tajimi_parks.js";

function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (value) => value * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function handler(req, res) {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);

        if (
            !Number.isFinite(lat) || !Number.isFinite(lng) ||
            lat < -90 || lat > 90 || lng < -180 || lng > 180
        ) {
            return res.status(400).json({
                success: false,
                error: "緯度または経度が正しくありません"
            });
        }

        const radius = 1000;
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
                body: "data=" + encodeURIComponent(query),
                signal: AbortSignal.timeout(30000)
            }
        );

        if (!response.ok) {
            throw new Error(`Overpass API error: ${response.status}`);
        }

        const data = await response.json();
        if (!Array.isArray(data.elements)) {
            throw new Error("Overpass APIから施設一覧を取得できませんでした");
        }

        const osmFacilities = data.elements.map((element) => {
            let facilityLat = element.lat;
            let facilityLng = element.lon;

            if (element.center) {
                facilityLat = element.center.lat;
                facilityLng = element.center.lon;
            }

            if (typeof facilityLat !== "number" || typeof facilityLng !== "number") {
                return null;
            }

            const tags = element.tags || {};
            let type = "施設";

            if (tags.amenity === "toilets") type = "公衆トイレ";
            else if (tags.shop === "convenience") type = "コンビニ";
            else if (tags.shop === "supermarket") type = "スーパー";
            else if (tags.shop === "chemist") type = "ドラッグストア";
            else if (tags.amenity === "pharmacy") type = "薬局";
            else if (tags.shop === "mall") type = "ショッピングモール";
            else if (tags.shop === "department_store") type = "百貨店";
            else if (tags.railway === "station" || tags.public_transport === "station") type = "駅";
            else if (tags.leisure === "park") type = "公園";

            return {
                id: `${element.type || "facility"}-${element.id}`,
                name: tags.name || type,
                type,
                lat: facilityLat,
                lng: facilityLng
            };
        }).filter(Boolean);

        // Excel由来の公園データを追加する。トイレとしては登録しない。
        // 現在地から1km以内の公園だけを候補にする。
        const municipalParks = tajimiParks
            .filter((park) =>
                Number.isFinite(park.lat) && Number.isFinite(park.lng) &&
                calculateDistance(lat, lng, park.lat, park.lng) <= radius
            )
            .map((park, index) => ({
                id: `tajimi-park-${index}`,
                name: park.name || "公園",
                type: "公園",
                lat: park.lat,
                lng: park.lng
            }));

        // OSMとExcelの公園が近接している場合は重複を避ける。
        const facilities = [...osmFacilities];
        for (const park of municipalParks) {
            const duplicate = facilities.some((facility) =>
                facility.type === "公園" &&
                calculateDistance(facility.lat, facility.lng, park.lat, park.lng) < 40
            );
            if (!duplicate) facilities.push(park);
        }

        return res.status(200).json({
            success: true,
            count: facilities.length,
            facilities
        });
    } catch (error) {
        console.error("周辺施設検索エラー:", error);
        return res.status(500).json({
            success: false,
            error: "周辺施設の検索に失敗しました"
        });
    }
}
