// ==========================================================================
// ⚡ 爆速トイレナビ
// GPS連動 ＋ 周辺トイレ検索 ＋ 距離計算 ＋ 方角表示 ＋ 星評価
// ==========================================================================


// ==========================================================================
// 🗺️ 1. 地図設定
// ==========================================================================

const map = L.map('map').setView(
    [35.1796, 136.9066],
    16
);

L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        attribution: '© OpenStreetMap contributors'
    }
).addTo(map);


// 現在地マーカー
let currentMarker = null;

// トイレ候補のマーカーを保存する配列
let toiletMarkers = [];

// 現在選択されている最寄りトイレ
let nearestToilet = null;


// ==========================================================================
// 🚻 2. 周辺施設検索の設定
// ==========================================================================

// 現在地から何m以内を検索するか
const SEARCH_RADIUS = 1000;


// ==========================================================================
// 🔎 3. OpenStreetMap / Overpass API 用の検索条件
// ==========================================================================
//
// 検索するもの
//
// 🚻 公衆トイレ
// 🏪 コンビニ
// 🛒 スーパー
// 💊 薬局・ドラッグストア系
// 🏬 ショッピングモール
// 🏬 百貨店
// 🚉 駅
// 🏞️ 公園
//
// 飲食店は検索対象に入れていない
//
// ==========================================================================

const TOILET_QUERY = `
[out:json][timeout:20];

(
    // 🚻 公衆トイレ
    nwr["amenity"="toilets"]
        (around:${SEARCH_RADIUS},USER_LAT,USER_LNG);

    // 🏪 コンビニ
    nwr["shop"="convenience"]
        (around:${SEARCH_RADIUS},USER_LAT,USER_LNG);

    // 🛒 スーパー
    nwr["shop"="supermarket"]
        (around:${SEARCH_RADIUS},USER_LAT,USER_LNG);

    // 💊 薬局
    nwr["amenity"="pharmacy"]
        (around:${SEARCH_RADIUS},USER_LAT,USER_LNG);

    // 💊 ドラッグストア系
    nwr["shop"="chemist"]
        (around:${SEARCH_RADIUS},USER_LAT,USER_LNG);

    // 🏬 ショッピングモール
    nwr["shop"="mall"]
        (around:${SEARCH_RADIUS},USER_LAT,USER_LNG);

    // 🏬 百貨店
    nwr["shop"="department_store"]
        (around:${SEARCH_RADIUS},USER_LAT,USER_LNG);

    // 🚉 駅
    nwr["railway"="station"]
        (around:${SEARCH_RADIUS},USER_LAT,USER_LNG);

    // 🏞️ 公園
    nwr["leisure"="park"]
        (around:${SEARCH_RADIUS},USER_LAT,USER_LNG);
);

out center;
`;


// ==========================================================================
// 🖥️ 4. HTMLの要素を取得
// ==========================================================================

const arrowElement =
    document.getElementById('direction-arrow');

const distanceElement =
    document.querySelector('.distance-text');

const alertBadge =
    document.querySelector('.alert-badge');

const targetPlaceElement =
    document.querySelector('.target-place');

const stars =
    document.querySelectorAll('.star-input');


// ==========================================================================
// 🧭 5. GPS位置情報の監視
// ==========================================================================

if (navigator.geolocation) {

    navigator.geolocation.watchPosition(
        successGPS,
        errorGPS,
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 20000
        }
    );

} else {

    alertBadge.textContent =
        "❌ GPS非対応のブラウザです";

    alertBadge.style.backgroundColor =
        "#7f8c8d";
}


// ==========================================================================
// 🟢 6. GPS取得成功
// ==========================================================================

function successGPS(position) {

    const userLat =
        position.coords.latitude;

    const userLng =
        position.coords.longitude;
    
　　searchNearbyToilets(userLat, userLng);

    console.log(
        "現在地:",
        userLat,
        userLng
    );


    // ----------------------------------------------------------------------
    // 🗺️ 地図を現在地へ移動
    // ----------------------------------------------------------------------

    map.setView(
        [userLat, userLng],
        18
    );


    // ----------------------------------------------------------------------
    // 📍 現在地マーカーを更新
    // ----------------------------------------------------------------------

    if (currentMarker) {

        map.removeLayer(currentMarker);

    }

    currentMarker =
        L.marker([
            userLat,
            userLng
        ])
        .addTo(map)
        .bindPopup("📍 現在地");


    // ----------------------------------------------------------------------
    // 🚻 周辺のトイレ候補を検索
    // ----------------------------------------------------------------------

    searchNearbyToilets(
        userLat,
        userLng
    );
}


// ==========================================================================
// 🔎 7. 周辺施設を検索
// ==========================================================================

async function searchNearbyToilets(userLat, userLng) {
    alert.log("🔎 周辺施設検索が実行されました！");

    // 検索する施設
    // 🚻 公衆トイレ
    // 🏪 コンビニ
    // 🛒 スーパー
    // 💊 薬局
    // 🏬 ショッピングモール
    // 🚉 駅
    // 🏞️ 公園

    const query = `
[out:json][timeout:25];

(
  nwr["amenity"="toilets"](around:1000,${userLat},${userLng});

  nwr["shop"="convenience"](around:1000,${userLat},${userLng});

  nwr["shop"="supermarket"](around:1000,${userLat},${userLng});

  nwr["amenity"="pharmacy"](around:1000,${userLat},${userLng});

  nwr["shop"="mall"](around:1000,${userLat},${userLng});

  nwr["shop"="department_store"](around:1000,${userLat},${userLng});

  nwr["railway"="station"](around:1000,${userLat},${userLng});

  nwr["leisure"="park"](around:1000,${userLat},${userLng});
);

out center;
`;


    try {

        alertBadge.textContent =
            "🔎 周辺のトイレを検索中...";

        alertBadge.style.backgroundColor =
            "#3498db";


        // Overpass APIへ送信
        const response = await fetch(
            "https://overpass-api.de/api/interpreter",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    "data=" +
                    encodeURIComponent(query)
            }
        );


        // API通信に失敗した場合
        if (!response.ok) {

            throw new Error(
                "Overpass API HTTPエラー: " +
                response.status
            );

        }


        // JSONに変換
        const data =
            await response.json();


        console.log(
            "Overpass API検索結果:",
            data
        );


        // 検索結果を処理
        processToiletResults(
            data.elements,
            userLat,
            userLng
        );


    } catch (error) {

        console.error(
            "周辺施設検索エラー:",
            error
        );


        alertBadge.textContent =
            "⚠️ トイレ情報を取得できませんでした";

        alertBadge.style.backgroundColor =
            "#e67e22";
    }
}

// ==========================================================================
// 🚻 8. 検索結果を処理
// ==========================================================================

function processToiletResults(
    elements,
    userLat,
    userLng
) {

    // ----------------------------------------------------------------------
    // 前回のトイレマーカーを削除
    // ----------------------------------------------------------------------

    toiletMarkers.forEach(
        marker => map.removeLayer(marker)
    );

    toiletMarkers = [];


    // ----------------------------------------------------------------------
    // 重複を防ぐ
    // ----------------------------------------------------------------------

    const uniqueElements = [];

    const usedIds = new Set();


    elements.forEach(element => {

        if (!usedIds.has(element.id)) {

            usedIds.add(element.id);

            uniqueElements.push(element);

        }

    });


    // ----------------------------------------------------------------------
    // 座標を取得
    // ----------------------------------------------------------------------

    const toilets = [];


    uniqueElements.forEach(element => {

        let lat;
        let lng;


        // nodeの場合
        if (
            element.lat !== undefined &&
            element.lon !== undefined
        ) {

            lat = element.lat;
            lng = element.lon;

        }

        // way / relationの場合
        else if (element.center) {

            lat = element.center.lat;
            lng = element.center.lon;

        }


        // 座標が取得できないものは除外
        if (
            lat === undefined ||
            lng === undefined
        ) {

            return;

        }


        // ------------------------------------------------------------------
        // 施設名
        // ------------------------------------------------------------------

        const tags =
            element.tags || {};


        const name =
            tags.name ||
            "名称不明の施設";


        // ------------------------------------------------------------------
        // 施設タイプを判定
        // ------------------------------------------------------------------

        let type =
            getFacilityType(tags);


        // ------------------------------------------------------------------
        // 現在地からの距離
        // ------------------------------------------------------------------

        const distance =
            calculateDistance(
                userLat,
                userLng,
                lat,
                lng
            );


        toilets.push({

            name: name,

            type: type,

            lat: lat,

            lng: lng,

            distance: distance,

            tags: tags

        });

    });


    // ----------------------------------------------------------------------
    // 距離が近い順に並べる
    // ----------------------------------------------------------------------

    toilets.sort(
        (a, b) =>
            a.distance - b.distance
    );


    console.log(
        "距離順:",
        toilets
    );


    // ----------------------------------------------------------------------
    // 検索結果が0件だった場合
    // ----------------------------------------------------------------------

    if (toilets.length === 0) {

        alertBadge.textContent =
            "⚠️ 周辺にトイレ候補が見つかりません";

        alertBadge.style.backgroundColor =
            "#e67e22";

        targetPlaceElement.textContent =
            "周辺に利用可能な施設がありません";

        distanceElement.innerHTML =
            "---";

        return;

    }


    // ----------------------------------------------------------------------
    // 🥇 一番近い施設を取得
    // ----------------------------------------------------------------------

    nearestToilet =
        toilets[0];


    // ----------------------------------------------------------------------
    // すべての施設を地図に表示
    // ----------------------------------------------------------------------

    toilets.forEach(
        toilet => {

            addToiletMarker(
                toilet
            );

        }
    );


    // ----------------------------------------------------------------------
    // 🥇 最寄り施設を画面に反映
    // ----------------------------------------------------------------------

    updateNearestToilet(
        nearestToilet,
        userLat,
        userLng
    );
}


// ==========================================================================
// 🏷️ 9. 施設タイプを判定
// ==========================================================================

function getFacilityType(tags) {

    if (
        tags.amenity === "toilets"
    ) {

        return "🚻 公衆トイレ";

    }


    if (
        tags.shop === "convenience"
    ) {

        return "🏪 コンビニ";

    }


    if (
        tags.shop === "supermarket"
    ) {

        return "🛒 スーパー";

    }


    if (
        tags.amenity === "pharmacy"
    ) {

        return "💊 薬局・ドラッグストア";

    }


    if (
        tags.shop === "chemist"
    ) {

        return "💊 ドラッグストア";

    }


    if (
        tags.shop === "mall"
    ) {

        return "🏬 ショッピングモール";

    }


    if (
        tags.shop === "department_store"
    ) {

        return "🏬 百貨店";

    }


    if (
        tags.railway === "station"
    ) {

        return "🚉 駅";

    }


    if (
        tags.leisure === "park"
    ) {

        return "🏞️ 公園";

    }


    return "🚻 トイレ候補";
}


// ==========================================================================
// 📍 10. トイレ候補を地図に表示
// ==========================================================================

function addToiletMarker(toilet) {

    const marker =
        L.marker([
            toilet.lat,
            toilet.lng
        ])
        .addTo(map);


    // 距離表示
    const distanceText =
        formatDistance(
            toilet.distance
        );


    // 公衆トイレの場合
    let toiletInfo = "";


    if (
        toilet.tags.amenity === "toilets"
    ) {

        if (
            toilet.tags.fee === "no"
        ) {

            toiletInfo =
                "<br>💰 無料";

        } else if (
            toilet.tags.fee === "yes"
        ) {

            toiletInfo =
                "<br>💰 有料";

        } else {

            toiletInfo =
                "<br>💰 利用料金不明";

        }

    } else {

        // 店舗などは「トイレがある可能性のある候補」
        toiletInfo =
            "<br>🚻 トイレ利用候補";

    }


    marker.bindPopup(`
        <strong>${toilet.type}</strong><br>
        ${toilet.name}<br>
        📏 ${distanceText}
        ${toiletInfo}
    `);


    marker.addTo(map);


    toiletMarkers.push(
        marker
    );
}


// ==========================================================================
// 🥇 11. 最寄りトイレを画面に表示
// ==========================================================================

function updateNearestToilet(
    toilet,
    userLat,
    userLng
) {

    // ----------------------------------------------------------------------
    // 距離
    // ----------------------------------------------------------------------

    const distance =
        toilet.distance;


    distanceElement.innerHTML =
        `直進 ${Math.round(distance)}<span>m</span>`;


    // ----------------------------------------------------------------------
    // 施設名
    // ----------------------------------------------------------------------

    targetPlaceElement.textContent =
        `${toilet.type} ${toilet.name}`;


    // ----------------------------------------------------------------------
    // 接続状態
    // ----------------------------------------------------------------------

    alertBadge.textContent =
        "🟢 最寄りトイレを発見";

    alertBadge.style.backgroundColor =
        "#27ae60";


    // ----------------------------------------------------------------------
    // 方角
    // ----------------------------------------------------------------------

    const targetBearing =
        calculateBearing(
            userLat,
            userLng,
            toilet.lat,
            toilet.lng
        );


    // スマホの進行方向
    const userHeading =
        currentHeading;


    if (
        userHeading !== null &&
        userHeading !== undefined
    ) {

        const relativeBearing =
            (
                targetBearing -
                userHeading +
                360
            ) % 360;


        setArrowByBearing(
            relativeBearing
        );

    } else {

        setArrowByBearing(
            targetBearing
        );

    }
}


// ==========================================================================
// 🧭 12. スマホの進行方向
// ==========================================================================

let currentHeading = null;


// GPSが更新されたときに進行方向を取得
function updateHeading(position) {

    if (
        position.coords.heading !== null &&
        position.coords.heading !== undefined
    ) {

        currentHeading =
            position.coords.heading;

    }

}


// GPS成功時にheadingも更新するため、元のsuccessGPSを拡張
const originalSuccessGPS =
    successGPS;


// ==========================================================================
// 📏 13. 距離表示
// ==========================================================================

function formatDistance(distance) {

    if (distance < 1000) {

        return `${Math.round(distance)}m`;

    }


    return `${(distance / 1000).toFixed(1)}km`;
}


// ==========================================================================
// 📐 14. 2地点間の距離を計算
// ==========================================================================

function calculateDistance(
    lat1,
    lng1,
    lat2,
    lng2
) {

    const R = 6371000;


    const dLat =
        (lat2 - lat1) *
        Math.PI / 180;


    const dLng =
        (lng2 - lng1) *
        Math.PI / 180;


    const a =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +

        Math.cos(
            lat1 * Math.PI / 180
        ) *

        Math.cos(
            lat2 * Math.PI / 180
        ) *

        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);


    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );


    return R * c;
}


// ==========================================================================
// 📐 15. 目的地への方角を計算
// ==========================================================================

function calculateBearing(
    lat1,
    lng1,
    lat2,
    lng2
) {

    const lat1Rad =
        lat1 * Math.PI / 180;

    const lat2Rad =
        lat2 * Math.PI / 180;

    const dLngRad =
        (lng2 - lng1) *
        Math.PI / 180;


    const y =
        Math.sin(dLngRad) *
        Math.cos(lat2Rad);


    const x =
        Math.cos(lat1Rad) *
        Math.sin(lat2Rad)

        -

        Math.sin(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.cos(dLngRad);


    const bearing =
        Math.atan2(y, x) *
        180 / Math.PI;


    return (
        bearing + 360
    ) % 360;
}


// ==========================================================================
// 🧭 16. 方角から矢印を変更
// ==========================================================================

function setArrowByBearing(
    bearing
) {

    if (
        bearing >= 337.5 ||
        bearing < 22.5
    ) {

        arrowElement.textContent =
            "⬆";

    }

    else if (
        bearing >= 22.5 &&
        bearing < 67.5
    ) {

        arrowElement.textContent =
            "↗";

    }

    else if (
        bearing >= 67.5 &&
        bearing < 112.5
    ) {

        arrowElement.textContent =
            "➡️";

    }

    else if (
        bearing >= 112.5 &&
        bearing < 157.5
    ) {

        arrowElement.textContent =
            "↘";

    }

    else if (
        bearing >= 157.5 &&
        bearing < 202.5
    ) {

        arrowElement.textContent =
            "⬇";

    }

    else if (
        bearing >= 202.5 &&
        bearing < 247.5
    ) {

        arrowElement.textContent =
            "↙";

    }

    else if (
        bearing >= 247.5 &&
        bearing < 292.5
    ) {

        arrowElement.textContent =
            "⬅️";

    }

    else if (
        bearing >= 292.5 &&
        bearing < 337.5
    ) {

        arrowElement.textContent =
            "↖";

    }
}


// ==========================================================================
// 🔴 17. GPSエラー
// ==========================================================================

function errorGPS(error) {

    console.error(
        "GPSエラー:",
        error
    );


    let message = "";


    if (error.code === 1) {

        message =
            "❌ 位置情報の使用が許可されていません";

    }

    else if (error.code === 2) {

        message =
            "❌ 現在地を取得できません";

    }

    else if (error.code === 3) {

        message =
            "⚠️ GPS取得がタイムアウトしました";

    }

    else {

        message =
            "⚠️ GPSでエラーが発生しました";

    }


    alertBadge.textContent =
        message;

    alertBadge.style.backgroundColor =
        "#e67e22";
}


// ==========================================================================
// ⭐ 18. 星評価レビュー
// ==========================================================================

stars.forEach(
    (star) => {

        star.addEventListener(
            'click',
            () => {

                const selectedValue =
                    parseInt(
                        star.getAttribute(
                            'data-value'
                        )
                    );


                stars.forEach(
                    (s) => {

                        const starValue =
                            parseInt(
                                s.getAttribute(
                                    'data-value'
                                )
                            );


                        if (
                            starValue <=
                            selectedValue
                        ) {

                            s.classList.add(
                                'active'
                            );

                            s.textContent =
                                '★';

                        }

                        else {

                            s.classList.remove(
                                'active'
                            );

                            s.textContent =
                                '☆';

                        }

                    }
                );


                setTimeout(
                    () => {

                        alert(
                            `星 ${selectedValue} 個でレビューを送信しました。ご協力ありがとうございました！`
                        );

                    },
                    300
                );

            }
        );

    }
);
