// ==========================================================================
// 🚻 爆速トイレナビ
// IBS緊急回避システム JavaScript
// ==========================================================================

// ===============================
// 地図設定
// ===============================

const map = L.map("map").setView(
    [35.1796, 136.9066],
    16
);

// OpenStreetMap表示

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: "© OpenStreetMap contributors"
    }
).addTo(map);

// ===============================
// マーカー保存用
// ===============================

let currentMarker;
let toiletMarker;

// ===============================
// 最寄りトイレ保存
// ===============================

// 一度検索したトイレを保存する
// GPSが更新されてもOverpassへ再検索しない
let nearestFacility = null;

// ===============================
// 初回検索フラグ
// ===============================

let hasSearched = false;

// ===============================
// 初回地図移動フラグ
// ===============================

let hasMovedToDestination = false;

// ===============================
// HTML取得
// ===============================

const arrowElement =
    document.getElementById("direction-arrow");

const distanceElement =
    document.querySelector(".distance-text");

const alertBadge =
    document.querySelector(".alert-badge");

const arrivalElement =
    document.getElementById("arrival-time");

const stars =
    document.querySelectorAll(".star-input");

// ===============================
// GPS開始
// ===============================

if (navigator.geolocation) {

    navigator.geolocation.watchPosition(
        successGPS,
        errorGPS,
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        }
    );

} else {

    alertBadge.textContent =
        "❌ GPSに対応していません";
}

// ==========================================================================
// 📍 GPS成功
// ==========================================================================

async function successGPS(position) {

    const userLat =
        position.coords.latitude;

    const userLng =
        position.coords.longitude;

    console.log("現在地");
    console.log("緯度:", userLat);
    console.log("経度:", userLng);
    console.log(
        "GPS精度:",
        position.coords.accuracy,
        "m"
    );

    // ===============================
    // 現在地マーカー更新
    // ===============================

    if (currentMarker) {

        map.removeLayer(
            currentMarker
        );
    }

    currentMarker =
        L.marker([
            userLat,
            userLng
        ])
        .addTo(map)
        .bindPopup(
            "📍 現在地"
        );

    // ===============================
    // まだ目的地がない場合
    // ===============================

    if (!nearestFacility) {

        // 最初だけ現在地を表示
        if (!hasSearched) {

            map.setView(
                [userLat, userLng],
                18
            );
        }

        // ===============================
        // 周辺施設検索
        // 最初の1回だけ
        // ===============================

        if (!hasSearched) {

            hasSearched = true;

            await searchNearbyToilets(
                userLat,
                userLng
            );
        }

        return;
    }

    // ===============================
    // 目的地が決まった後
    // ===============================

    updateNavigation(
        userLat,
        userLng
    );
}

// ==========================================================================
// 🔎 周辺施設検索
// ==========================================================================

async function searchNearbyToilets(
    userLat,
    userLng
) {

    alertBadge.textContent =
        "🔎 周辺施設を検索中...";

    alertBadge.style.backgroundColor =
        "#f59e0b";

    try {

        console.log(
            "周辺施設検索開始"
        );

        // ===============================
        // Vercel API
        // ===============================

        const response =
            await fetch(
                `/api/toilets?lat=${encodeURIComponent(userLat)}&lng=${encodeURIComponent(userLng)}`
            );

        console.log(
            "APIステータス:",
            response.status
        );

        if (!response.ok) {

            throw new Error(
                `APIエラー: ${response.status}`
            );
        }

        const data =
            await response.json();

        console.log(
            "施設検索結果:",
            data
        );

        // ===============================
        // 施設がない場合
        // ===============================

        if (
            !data.success ||
            !data.facilities ||
            data.facilities.length === 0
        ) {

            alertBadge.textContent =
                "⚠️ 周辺施設が見つかりません";

            alertBadge.style.backgroundColor =
                "#f59e0b";

            return;
        }

        // ===============================
        // 一番近い施設を探す
        // ===============================

        let closestFacility =
            null;

        let closestDistance =
            Infinity;

        data.facilities.forEach(
            (facility) => {

                const distance =
                    calculateDistance(
                        userLat,
                        userLng,
                        facility.lat,
                        facility.lng
                    );

                facility.distance =
                    distance;

                if (
                    distance <
                    closestDistance
                ) {

                    closestDistance =
                        distance;

                    closestFacility =
                        facility;
                }
            }
        );

        // ===============================
        // 最寄りトイレを保存
        // ===============================

        nearestFacility =
            closestFacility;

        console.log(
            "最寄りトイレ:",
            nearestFacility
        );

        // ===============================
        // 最寄りトイレを表示
        // ===============================

        showNearestFacility(
            userLat,
            userLng,
            nearestFacility
        );

    } catch (error) {

        console.error(
            "周辺施設検索エラー:",
            error
        );

        alertBadge.textContent =
            "❌ 周辺施設の検索に失敗しました";

        alertBadge.style.backgroundColor =
            "#ef4444";
    }
}

// ==========================================================================
// 📍 最寄り施設を表示
// ==========================================================================

function showNearestFacility(
    userLat,
    userLng,
    facility
) {

    // ===============================
    // 以前の目的地マーカー削除
    // ===============================

    if (toiletMarker) {

        map.removeLayer(
            toiletMarker
        );
    }

    // ===============================
    // 目的地マーカー
    // ===============================

    toiletMarker =
        L.marker([
            facility.lat,
            facility.lng
        ])
        .addTo(map)
        .bindPopup(
            `📍 ${facility.name}<br>${facility.type}`
        );

    // ===============================
    // 現在地と目的地が両方見えるようにする
    // ===============================

    const bounds =
        L.latLngBounds(
            [
                userLat,
                userLng
            ],
            [
                facility.lat,
                facility.lng
            ]
        );

    map.fitBounds(
        bounds,
        {
            padding: [
                50,
                50
            ],
            maxZoom: 18
        }
    );

    hasMovedToDestination =
        true;

    // ===============================
    // 距離・方向を更新
    // ===============================

    updateNavigation(
        userLat,
        userLng
    );
}

// ==========================================================================
// 🧭 ナビゲーション更新
// ==========================================================================

function updateNavigation(
    userLat,
    userLng
) {

    if (!nearestFacility) {
        return;
    }

    // ===============================
    // 距離を再計算
    // ===============================

    const distance =
        calculateDistance(
            userLat,
            userLng,
            nearestFacility.lat,
            nearestFacility.lng
        );

    // 保存している距離も更新
    nearestFacility.distance =
        distance;

    // ===============================
    // 距離表示
    // ===============================

    distanceElement.innerHTML =
        `直進 ${Math.round(distance)} <span>m</span>`;

    // ===============================
    // 徒歩時間
    // ===============================

    const walkingSpeed =
        80;

    const minutes =
        Math.max(
            1,
            Math.ceil(
                distance /
                walkingSpeed
            )
        );

    arrivalElement.textContent =
        `徒歩 約${minutes}分`;

    // ===============================
    // 施設名
    // ===============================

    const targetPlace =
        document.querySelector(
            ".target-place"
        );

    if (targetPlace) {

        targetPlace.textContent =
            `📍 ${nearestFacility.name}`;
    }

    // ===============================
    // 状態表示
    // ===============================

    if (distance < 10) {

        alertBadge.textContent =
            "🎉 目的地に到着しました";

        alertBadge.style.backgroundColor =
            "#16a34a";

    } else if (distance < 50) {

        alertBadge.textContent =
            "🚻 まもなく到着します";

        alertBadge.style.backgroundColor =
            "#22c55e";

    } else {

        alertBadge.textContent =
            `🟢 ${nearestFacility.type}を案内中`;

        alertBadge.style.backgroundColor =
            "#2563eb";
    }

    // ===============================
    // 目的地の方向
    // ===============================

    const bearing =
        calculateBearing(
            userLat,
            userLng,
            nearestFacility.lat,
            nearestFacility.lng
        );

    setArrowByBearing(
        bearing
    );
}

// ==========================================================================
// 📏 2点間の距離計算
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
        (lat2 - lat1)
        * Math.PI
        / 180;

    const dLng =
        (lng2 - lng1)
        * Math.PI
        / 180;

    const a =
        Math.sin(dLat / 2)
        *
        Math.sin(dLat / 2)
        +
        Math.cos(
            lat1 * Math.PI / 180
        )
        *
        Math.cos(
            lat2 * Math.PI / 180
        )
        *
        Math.sin(dLng / 2)
        *
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
// 🧭 目的地の方向計算
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

    const dLng =
        (lng2 - lng1)
        * Math.PI
        / 180;

    const y =
        Math.sin(dLng)
        *
        Math.cos(lat2Rad);

    const x =
        Math.cos(lat1Rad)
        *
        Math.sin(lat2Rad)
        -
        Math.sin(lat1Rad)
        *
        Math.cos(lat2Rad)
        *
        Math.cos(dLng);

    const bearing =
        Math.atan2(y, x)
        *
        180
        /
        Math.PI;

    return (
        bearing + 360
    )
    % 360;
}

// ==========================================================================
// ⬆ 矢印変更
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
        bearing < 67.5
    ) {

        arrowElement.textContent =
            "↗";

    } else if (
        bearing < 112.5
    ) {

        arrowElement.textContent =
            "➡";

    } else if (
        bearing < 157.5
    ) {

        arrowElement.textContent =
            "↘";

    } else if (
        bearing < 202.5
    ) {

        arrowElement.textContent =
            "⬇";

    } else if (
        bearing < 247.5
    ) {

        arrowElement.textContent =
            "↙";

    } else if (
        bearing < 292.5
    ) {

        arrowElement.textContent =
            "⬅";

    } else {

        arrowElement.textContent =
            "↖";
    }
}

// ==========================================================================
// ❌ GPSエラー処理
// ==========================================================================

function errorGPS(error) {

    console.error(
        "GPSエラー:",
        error
    );

    alertBadge.textContent =
        "⚠️ GPS取得できません";

    alertBadge.style.backgroundColor =
        "#f59e0b";

    arrivalElement.textContent =
        "位置情報待機中";
}

// ==========================================================================
// ⭐ 星評価機能
// ==========================================================================

stars.forEach(
    (star) => {

        star.addEventListener(
            "click",
            () => {

                const value =
                    Number(
                        star.dataset.value
                    );

                stars.forEach(
                    (s) => {

                        const starValue =
                            Number(
                                s.dataset.value
                            );

                        if (
                            starValue <= value
                        ) {

                            s.textContent =
                                "★";

                            s.classList.add(
                                "active"
                            );

                        } else {

                            s.textContent =
                                "☆";

                            s.classList.remove(
                                "active"
                            );
                        }
                    }
                );

                setTimeout(
                    () => {

                        alert(
                            `星${value}個で評価しました！`
                        );

                    },
                    300
                );
            }
        );
    }
);
