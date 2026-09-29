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


// ===============================
// GPS成功
// ===============================

async function successGPS(position) {

    const userLat =
        position.coords.latitude;

    const userLng =
        position.coords.longitude;


    console.log("現在地");
    console.log("緯度:", userLat);
    console.log("経度:", userLng);
    console.log("GPS精度:", position.coords.accuracy, "m");


    // ===============================
    // 地図を現在地へ移動
    // ===============================

    map.setView(
        [userLat, userLng],
        18
    );


    // ===============================
    // 前の現在地マーカー削除
    // ===============================

    if (currentMarker) {

        map.removeLayer(currentMarker);

    }


    // ===============================
    // 現在地表示
    // ===============================

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
    // 周辺施設検索
    // ===============================

    await searchNearbyToilets(
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

        console.log("周辺施設検索開始");


        // Vercel中継API
        const response =
            await fetch(
                `/api/toilets?lat=${userLat}&lng=${userLng}`
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

        let nearestFacility =
            null;

        let nearestDistance =
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
                    nearestDistance
                ) {

                    nearestDistance =
                        distance;

                    nearestFacility =
                        facility;
                }

            }
        );


        console.log(
            "最寄り施設:",
            nearestFacility
        );


        // ===============================
        // 最寄り施設を表示
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
    // 距離表示
    // ===============================

    distanceElement.innerHTML =
        `直進 ${Math.round(facility.distance)}
        <span>m</span>`;


    // ===============================
    // 到着時間
    // ===============================

    const walkingSpeed =
        80;


    const minutes =
        Math.max(
            1,
            Math.ceil(
                facility.distance /
                walkingSpeed
            )
        );


    arrivalElement.textContent =
        `徒歩 約${minutes}分`;


    // ===============================
    // 施設名表示
    // ===============================

    const targetPlace =
        document.querySelector(
            ".target-place"
        );


    targetPlace.textContent =
        `📍 ${facility.name}`;


    // ===============================
    // 状態表示
    // ===============================

    if (facility.distance < 10) {

        alertBadge.textContent =
            "🎉 目的地に到着しました";

        alertBadge.style.backgroundColor =
            "#16a34a";


    } else if (facility.distance < 50) {

        alertBadge.textContent =
            "🚻 まもなく到着します";

        alertBadge.style.backgroundColor =
            "#22c55e";


    } else {

        alertBadge.textContent =
            `🟢 ${facility.type}を案内中`;

        alertBadge.style.backgroundColor =
            "#2563eb";
    }


    // ===============================
    // 方角計算
    // ===============================

    const bearing =
        calculateBearing(
            userLat,
            userLng,
            facility.lat,
            facility.lng
        );


    setArrowByBearing(
        bearing
    );
}


// ==========================================================================
// 📏 2点間の距離計算（メートル）
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
    %
    360;
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