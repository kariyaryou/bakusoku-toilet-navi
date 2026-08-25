// ==========================================================================
// ⚡ 爆速トイレナビ - GPS連動＆周辺トイレ検索＆星評価システム
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
let currentMarker;

// トイレ・施設マーカーをまとめて管理
let toiletMarkers = [];


// ==========================================================================
// 🔍 2. 検索設定
// ==========================================================================
// 現在地から何m以内を検索するか
const SEARCH_RADIUS = 1000;


// ==========================================================================
// 🖥️ 3. HTMLの要素を取得
// ==========================================================================
const arrowElement =
    document.getElementById('direction-arrow');

const distanceElement =
    document.querySelector('.distance-text');

const alertBadge =
    document.querySelector('.alert-badge');

const stars =
    document.querySelectorAll('.star-input');


// ==========================================================================
// 🧭 4. GPS位置情報の取得
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
// 🟢 5. GPS取得成功
// ==========================================================================
function successGPS(position) {
    const userLat =
        position.coords.latitude;

    const userLng =
        position.coords.longitude;

    console.log(
        "📍 現在地:",
        userLat,
        userLng
    );
    // --------------------------------------------------
    // 地図を現在地へ移動
    // --------------------------------------------------
    map.setView(
        [userLat, userLng],
        18
    );
    // --------------------------------------------------
    // 前の現在地マーカーを削除
    // --------------------------------------------------
    if (currentMarker) {

        map.removeLayer(
            currentMarker
        );

    }
    // --------------------------------------------------
    // 現在地マーカーを追加
    // --------------------------------------------------
    currentMarker =
        L.marker([
            userLat,
            userLng
        ])
        .addTo(map)
        .bindPopup("📍 現在地");
    // --------------------------------------------------
    // GPSの進行方向
    // --------------------------------------------------
    const userHeading =
        position.coords.heading;
    // --------------------------------------------------
    // 最寄りトイレ検索
    // --------------------------------------------------
    searchNearbyToilets(
        userLat,
        userLng
    );
    // --------------------------------------------------
    // 現在地から検索結果が出るまでの
    // 初期表示
    // --------------------------------------------------
    alertBadge.textContent =
        "🔎 周辺のトイレを検索中...";

    alertBadge.style.backgroundColor =
        "#f39c12";
    // --------------------------------------------------
    // 現在地から仮の目的地方向を計算
    // --------------------------------------------------
    // ※検索結果が取得された後、
    //   実際の最寄りトイレへ更新する
    // --------------------------------------------------
    if (
        toiletMarkers.length > 0
    ) {

        // 後で処理

    } else {

        arrowElement.textContent =
            "⬆";

        distanceElement.innerHTML =
            "検索中...";
    }
    // --------------------------------------------------
    // 星評価などの画面処理
    // --------------------------------------------------
    if (
        userHeading !== null &&
        userHeading !== undefined
    ) {

        // コンパスが取得できる場合
        console.log(
            "🧭 heading:",
            userHeading
        );
    }
}


// ==========================================================================
// 🔴 6. GPS取得失敗
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

    } else if (error.code === 2) {

        message =
            "❌ 現在地を取得できません";

    } else if (error.code === 3) {

        message =
            "⚠️ GPS取得がタイムアウトしました";

    } else {

        message =
            "⚠️ GPSでエラーが発生しました";

    }

    alertBadge.textContent =
        message;

    alertBadge.style.backgroundColor =
        "#e67e22";
}


// ==========================================================================
// 🚻 7. 周辺のトイレ・施設を検索
// ==========================================================================
async function searchNearbyToilets(
    userLat,
    userLng
) {
    // --------------------------------------------------
    // 検索開始確認
    // --------------------------------------------------
    alert(
        "🔎 周辺施設検索を開始します！"
    );
    // --------------------------------------------------
    // Overpass APIに送る検索条件
    // --------------------------------------------------
    //
    // 検索対象
    //
    // ・公衆トイレ
    // ・コンビニ
    // ・スーパー
    // ・ドラッグストア
    // ・薬局
    // ・ショッピングモール
    // ・百貨店
    // ・駅
    // ・公園
    //
    // 飲食店は検索対象にしない
    // --------------------------------------------------
    const query = `
[out:json][timeout:30];
(
    nwr["amenity"="toilets"]
        (around:${SEARCH_RADIUS},${userLat},${userLng});

    nwr["shop"="convenience"]
        (around:${SEARCH_RADIUS},${userLat},${userLng});

    nwr["shop"="supermarket"]
        (around:${SEARCH_RADIUS},${userLat},${userLng});

    nwr["amenity"="pharmacy"]
        (around:${SEARCH_RADIUS},${userLat},${userLng});

    nwr["shop"="chemist"]
        (around:${SEARCH_RADIUS},${userLat},${userLng});

    nwr["shop"="mall"]
        (around:${SEARCH_RADIUS},${userLat},${userLng});

    nwr["shop"="department_store"]
        (around:${SEARCH_RADIUS},${userLat},${userLng});

    nwr["railway"="station"]
        (around:${SEARCH_RADIUS},${userLat},${userLng});

    nwr["leisure"="park"]
        (around:${SEARCH_RADIUS},${userLat},${userLng});
);

out center;
`;

    try {
        const controller = new AbortController();
 
        const timeoutId = setTimeout(() => {
        controller.abort();
        }, 10000);
        // --------------------------------------------------
        // 検索中表示
        // --------------------------------------------------
        alert("🌐 周辺施設の検索中...");
        alert("fetch開始!")
        // --------------------------------------------------
        // Overpass APIへアクセス
        // --------------------------------------------------
        const response =
            await fetch(
                "https://overpass.kumi.systems/api/interpreter",
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
       　　 alert("② fetch完了");
            clearTimeout(timeoutId);
        // --------------------------------------------------
        // HTTPエラー確認
        // --------------------------------------------------
        if (!response.ok) {

            throw new Error(
                "HTTPエラー: " +
                response.status
            );
        }
        // --------------------------------------------------
        // JSONデータ取得
        // --------------------------------------------------
        const data =
            await response.json();
        // --------------------------------------------------
        // 検索結果件数を確認
        // --------------------------------------------------
        console.log(
            "Overpass API検索結果:",
            data
        );

        alert("取得件数：" + data.elements.length);
        // --------------------------------------------------
        // 検索結果を処理
        // --------------------------------------------------
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
        alert("エラー内容：" + error.message);
        // --------------------------------------------------
        // エラー内容を表示
        // --------------------------------------------------
        alert(
            "❌ 周辺施設の検索に失敗しました\n" +
            error.message
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

    console.log(
        "🚻 検索結果を処理:",
        elements
    );
    // --------------------------------------------------
    // 以前のマーカーを削除
    // --------------------------------------------------
    toiletMarkers.forEach(
        marker => {

            map.removeLayer(
                marker
            );
        }
    );

    toiletMarkers = [];
    // --------------------------------------------------
    // 検索結果が0件の場合
    // --------------------------------------------------
    if (
        elements.length === 0
    ) {

        alertBadge.textContent =
            "⚠️ 周辺に施設が見つかりませんでした";

        alertBadge.style.backgroundColor =
            "#e67e22";

        distanceElement.innerHTML =
            "検索結果なし";

        arrowElement.textContent =
            "⬆";

        return;
    }
    // --------------------------------------------------
    // 最も近い施設を探す
    // --------------------------------------------------
    let nearestPlace = null;

    let nearestDistance =
        Infinity;
    // --------------------------------------------------
    // 検索結果を1件ずつ処理
    // --------------------------------------------------
    elements.forEach(
        element => {

            let lat;
            let lng;
            // --------------------------------------------------
            // nodeの場合
            // --------------------------------------------------
            if (
                element.type === "node"
            ) {
                lat =
                    element.lat;

                lng =
                    element.lon;
            }
            // --------------------------------------------------
            // way / relationの場合
            // --------------------------------------------------
            else if (
                element.center
            ) {
                lat =
                    element.center.lat;

                lng =
                    element.center.lon;
            }
            // 座標が取得できなければスキップ
            if (
                lat === undefined ||
                lng === undefined
            ) {
                return;
            }
            // --------------------------------------------------
            // 施設名
            // --------------------------------------------------
            const tags =
                element.tags || {};

            let name =
                tags.name ||
                "名称不明の施設";
            // --------------------------------------------------
            // 施設の種類
            // --------------------------------------------------
            let type =
                "施設";

            if (
                tags.amenity === "toilets"
            ) {
                type =
                    "🚻 公衆トイレ";

            } else if (
                tags.shop === "convenience"
            ) {
                type =
                    "🏪 コンビニ";

            } else if (
                tags.shop === "supermarket"
            ) {
                type =
                    "🛒 スーパー";

            } else if (
                tags.amenity === "pharmacy" ||
                tags.shop === "chemist"
            ) {
                type =
                    "💊 ドラッグストア・薬局";

            } else if (
                tags.shop === "mall"
            ) {
                type =
                    "🏬 ショッピングモール";

            } else if (
                tags.shop === "department_store"
            ) {
                type =
                    "🏬 百貨店";

            } else if (
                tags.railway === "station"
            ) {
                type =
                    "🚉 駅";

            } else if (
                tags.leisure === "park"
            ) {
                type =
                    "🌳 公園";

            }
            // --------------------------------------------------
            // 現在地からの距離を計算
            // --------------------------------------------------
            const distance =
                calculateDistance(
                    userLat,
                    userLng,
                    lat,
                    lng
                );
            // --------------------------------------------------
            // 地図上にマーカーを追加
            // --------------------------------------------------
            const marker =
                L.marker([
                    lat,
                    lng
                ])
                .addTo(map)
                .bindPopup(
                    `<b>${type}</b><br>${name}<br>${Math.round(distance)}m`
                );

            toiletMarkers.push(
                marker
            );
            // --------------------------------------------------
            // 一番近い施設を記録
            // --------------------------------------------------
            if (
                distance <
                nearestDistance
            ) {
                nearestDistance =
                    distance;

                nearestPlace = {
                    lat: lat,
                    lng: lng,
                    name: name,
                    type: type,
                    distance: distance
                };
            }
        }
    );
    // --------------------------------------------------
    // 最寄り施設がなかった場合
    // --------------------------------------------------
    if (
        nearestPlace === null
    ) {
        alertBadge.textContent =
            "⚠️ 施設の位置情報を取得できませんでした";

        alertBadge.style.backgroundColor =
            "#e67e22";

        return;
    }
    // --------------------------------------------------
    // 最寄り施設を画面に表示
    // --------------------------------------------------
    alertBadge.textContent =
        "🟢 最寄り施設を捕捉しました";

    alertBadge.style.backgroundColor =
        "#27ae60";

    distanceElement.innerHTML =
        `${Math.round(nearestPlace.distance)}<span>m</span>`;
    // --------------------------------------------------
    // 目的地方向を計算
    // --------------------------------------------------
    const bearing =
        calculateBearing(
            userLat,
            userLng,
            nearestPlace.lat,
            nearestPlace.lng
        );

    setArrowByBearing(
        bearing
    );
    // --------------------------------------------------
    // 最寄り施設をポップアップ表示
    // --------------------------------------------------
    const nearestMarker =
        L.marker([
            nearestPlace.lat,
            nearestPlace.lng
        ])
        .addTo(map)
        .bindPopup(
            `<b>${nearestPlace.type}</b><br>${nearestPlace.name}<br>約${Math.round(nearestPlace.distance)}m`
        )
        .openPopup();

    toiletMarkers.push(
        nearestMarker
    );

    console.log(
        "⭐ 最寄り施設:",
        nearestPlace
    );
}
// =========-================================================================
// 📐 9. 2点間の距離を計算
// ==========================================================================
function calculateDistance(
    lat1,
    lng1,
    lat2,
    lng2
) {
    const R =
        6371000;

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
// 🧭 10. 目的地への方角を計算
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
        Math.sin(lat2Rad) -

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
// 🧭 11. 方角から矢印を変更
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

    } else if (
        bearing >= 22.5 &&
        bearing < 67.5
    ) {
        arrowElement.textContent =
            "↗";

    } else if (
        bearing >= 67.5 &&
        bearing < 112.5
    ) {
        arrowElement.textContent =
            "➡️";

    } else if (
        bearing >= 112.5 &&
        bearing < 157.5
    ) {
        arrowElement.textContent =
            "↘";

    } else if (
        bearing >= 157.5 &&
        bearing < 202.5
    ) {
        arrowElement.textContent =
            "⬇";

    } else if (
        bearing >= 202.5 &&
        bearing < 247.5
    ) {
        arrowElement.textContent =
            "↙";

    } else if (
        bearing >= 247.5 &&
        bearing < 292.5
    ) {
        arrowElement.textContent =
            "⬅️";

    } else if (
        bearing >= 292.5 &&
        bearing < 337.5
    ) {
        arrowElement.textContent =
            "↖";

    }
}
// ==========================================================================
// ⭐ 12. 星評価レビュー
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

                        } else {
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
