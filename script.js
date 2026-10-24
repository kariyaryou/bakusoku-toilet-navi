
/* ==========================================================
   🚻 爆速トイレナビ
   IBS緊急回避システム
   GPS・周辺施設検索・徒歩ルート案内
   ========================================================== */

// ==============================
// 1. 地図設定
// ==============================

const map = L.map("map").setView(
    [35.1796, 136.9066],
    16
);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: "© OpenStreetMap contributors"
    }
).addTo(map);

// ==============================
// 2. 状態を保存する変数
// ==============================

let currentMarker = null;
let toiletMarker = null;
let routeLine = null;

let nearestFacility = null;

let hasSearched = false;
let hasMovedToDestination = false;

let latestPosition = null;

let routeRequestInProgress = false;
let lastRouteRequestTime = 0;
let lastRouteStart = null;

// ルートの再取得間隔
const ROUTE_UPDATE_INTERVAL = 15000;

// 現在地が前回の取得位置からこの距離以上動いたら再取得
const ROUTE_UPDATE_DISTANCE = 25;

// 徒歩速度（メートル/分）
const WALKING_SPEED = 80;

// ==============================
// 3. HTML要素を取得
// ==============================

const arrowElement =
    document.getElementById("direction-arrow");

const distanceElement =
    document.querySelector(".distance-text");

const alertBadge =
    document.querySelector(".alert-badge");

const arrivalElement =
    document.getElementById("arrival-time");

const targetPlace =
    document.querySelector(".target-place");

const stars =
    document.querySelectorAll(".star-input");

// 案内文を表示する要素
// HTMLに専用要素がなくても自動で作成する
let guidanceElement =
    document.getElementById("route-guidance");

if (!guidanceElement) {
    const mapContainer = document.getElementById("map");

    if (mapContainer) {
        guidanceElement = document.createElement("div");

        guidanceElement.id = "route-guidance";

        guidanceElement.style.cssText = `
            position: absolute;
            z-index: 1000;
            top: 12px;
            left: 50%;
            transform: translateX(-50%);
            width: calc(100% - 32px);
            max-width: 360px;
            box-sizing: border-box;
            padding: 12px 16px;
            border-radius: 12px;
            background: #ffffff;
            color: #183b4e;
            box-shadow: 0 3px 12px rgba(0,0,0,0.18);
            font-size: 15px;
            line-height: 1.6;
            pointer-events: none;
        `;

        mapContainer.appendChild(guidanceElement);
    }
}

// ==============================
// 4. 表示を安全に更新する関数
// ==============================

function setStatus(message, color = "#2563eb") {
    if (alertBadge) {
        alertBadge.textContent = message;
        alertBadge.style.backgroundColor = color;
    }
}

function setGuidance(message) {
    if (guidanceElement) {
        guidanceElement.textContent = message;
    }
}

// ==============================
// 5. GPSを開始
// ==============================

if ("geolocation" in navigator) {
    navigator.geolocation.watchPosition(
        successGPS,
        errorGPS,
        {
            enableHighAccuracy: true,
            maximumAge: 3000,
            timeout: 15000
        }
    );
} else {
    setStatus("❌ この端末はGPSに対応していません", "#ef4444");
}

// ==============================
// 6. GPS取得成功
// ==============================

async function successGPS(position) {
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;

    latestPosition = {
        lat: userLat,
        lng: userLng
    };

    console.log("現在地:", userLat, userLng);
    console.log("GPS精度:", position.coords.accuracy, "m");

    // 現在地マーカーを更新
    if (currentMarker) {
        currentMarker.setLatLng([userLat, userLng]);
    } else {
        currentMarker = L.marker([userLat, userLng])
            .addTo(map)
            .bindPopup("📍 現在地");
    }

    // まだ目的地が決まっていない場合
    if (!nearestFacility) {
        if (!hasSearched) {
            map.setView([userLat, userLng], 18);

            hasSearched = true;

            await searchNearbyToilets(userLat, userLng);
        }

        return;
    }

    // 目的地が決まっている場合は案内を更新
    updateNavigation(userLat, userLng);

    // 徒歩ルートの再取得が必要か確認
    requestRouteIfNeeded(userLat, userLng);
}

// ==============================
// 7. 周辺施設を検索
// ==============================

async function searchNearbyToilets(userLat, userLng) {
    setStatus("🔎 周辺施設を検索中...", "#f59e0b");
    setGuidance("近くの施設を探しています...");

    try {
        const url =
            `/api/toilets?lat=${encodeURIComponent(userLat)}` +
            `&lng=${encodeURIComponent(userLng)}`;

        const response = await fetch(url);

        console.log("施設APIステータス:", response.status);

        const data = await response.json();

        console.log("施設検索結果:", data);

        if (!response.ok || !data.success) {
            throw new Error(data.error || `APIエラー: ${response.status}`);
        }

        if (!Array.isArray(data.facilities) || data.facilities.length === 0) {
            setStatus("⚠️ 周辺施設が見つかりません", "#f59e0b");
            setGuidance("周辺に案内できる施設が見つかりませんでした。");
            return;
        }

        // 有効な座標を持つ施設だけを候補にする
        const validFacilities = data.facilities.filter((facility) => {
            return (
                Number.isFinite(Number(facility.lat)) &&
                Number.isFinite(Number(facility.lng)) &&
                Number(facility.lat) >= -90 &&
                Number(facility.lat) <= 90 &&
                Number(facility.lng) >= -180 &&
                Number(facility.lng) <= 180
            );
        });

        if (validFacilities.length === 0) {
            setStatus("⚠️ 有効な施設情報がありません", "#f59e0b");
            return;
        }

        // 直線距離で最も近い施設を選択
        // 徒歩ルートAPIができた後は、必要に応じて
        // 実際の徒歩距離を使った選択に改善できる
        let closestFacility = null;
        let closestDistance = Infinity;

        for (const facility of validFacilities) {
            const distance = calculateDistance(
                userLat,
                userLng,
                Number(facility.lat),
                Number(facility.lng)
            );

            if (distance < closestDistance) {
                closestDistance = distance;
                closestFacility = {
                    ...facility,
                    lat: Number(facility.lat),
                    lng: Number(facility.lng)
                };
            }
        }

        if (!closestFacility) {
            setStatus("⚠️ 目的地を決められませんでした", "#f59e0b");
            return;
        }

        nearestFacility = closestFacility;

        console.log("選択した施設:", nearestFacility);

        showNearestFacility(
            userLat,
            userLng,
            nearestFacility
        );

    } catch (error) {
        console.error("周辺施設検索エラー:", error);

        setStatus(
            "❌ 周辺施設の検索に失敗しました",
            "#ef4444"
        );

        setGuidance(
            "施設を検索できませんでした。通信状況を確認してください。"
        );

        // 失敗時は次のGPS更新で再検索できるようにする
        hasSearched = false;
    }
}

// ==============================
// 8. 目的地を地図に表示
// ==============================

function showNearestFacility(userLat, userLng, facility) {
    if (toiletMarker) {
        map.removeLayer(toiletMarker);
    }

    toiletMarker = L.marker([
        facility.lat,
        facility.lng
    ])
        .addTo(map)
        .bindPopup(
            `📍 ${escapeHTML(facility.name || "周辺施設")}`
        );

    const bounds = L.latLngBounds(
        [userLat, userLng],
        [facility.lat, facility.lng]
    );

    map.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 18
    });

    hasMovedToDestination = true;

    updateNavigation(userLat, userLng);

    // 目的地決定後に徒歩ルートを取得
    requestRouteIfNeeded(userLat, userLng, true);
}

// ==============================
// 9. 徒歩ルート取得の必要性を確認
// ==============================

function requestRouteIfNeeded(userLat, userLng, force = false) {
    if (!nearestFacility || routeRequestInProgress) {
        return;
    }

    const now = Date.now();

    if (!force && now - lastRouteRequestTime < ROUTE_UPDATE_INTERVAL) {
        return;
    }

    if (!force && lastRouteStart) {
        const movedDistance = calculateDistance(
            lastRouteStart.lat,
            lastRouteStart.lng,
            userLat,
            userLng
        );

        if (movedDistance < ROUTE_UPDATE_DISTANCE) {
            return;
        }
    }

    getWalkingRoute(userLat, userLng);
}

// ==============================
// 10. 徒歩ルートを取得
// ==============================
//
// ここでは /api/route が次の形式を返す想定：
//
// {
//   "success": true,
//   "distance": 850,
//   "duration": 720,
//   "coordinates": [[緯度, 経度], ...],
//   "instructions": [
//     { "text": "右に曲がる", "distance": 100 }
//   ]
// }
//
// api/route.js は次の段階で作成する。
// APIが未作成、または失敗した場合は、
// 従来の直線距離・方向表示に切り替える。

async function getWalkingRoute(userLat, userLng) {
    if (!nearestFacility) {
        return;
    }

    routeRequestInProgress = true;
    lastRouteRequestTime = Date.now();

    lastRouteStart = {
        lat: userLat,
        lng: userLng
    };

    try {
        const params = new URLSearchParams({
            startLat: String(userLat),
            startLng: String(userLng),
            endLat: String(nearestFacility.lat),
            endLng: String(nearestFacility.lng)
        });

        const response = await fetch(`/api/route?${params.toString()}`);

        if (!response.ok) {
            throw new Error(`ルートAPIエラー: ${response.status}`);
        }

        const data = await response.json();

        if (
            !data.success ||
            !Array.isArray(data.coordinates) ||
            data.coordinates.length < 2
        ) {
            throw new Error("徒歩ルートのデータが正しくありません");
        }

        // APIから受け取った座標を検証
        const coordinates = data.coordinates
            .filter((point) => {
                return (
                    Array.isArray(point) &&
                    point.length >= 2 &&
                    Number.isFinite(Number(point[0])) &&
                    Number.isFinite(Number(point[1])) &&
                    Math.abs(Number(point[0])) <= 90 &&
                    Math.abs(Number(point[1])) <= 180
                );
            })
            .map((point) => [
                Number(point[0]),
                Number(point[1])
            ]);

        if (coordinates.length < 2) {
            throw new Error("表示できるルート座標がありません");
        }

        // 以前のルート線を削除
        if (routeLine) {
            map.removeLayer(routeLine);
        }

        // 徒歩ルートを地図に描画
        routeLine = L.polyline(coordinates, {
            color: "#1677ff",
            weight: 6,
            opacity: 0.85,
            lineCap: "round",
            lineJoin: "round"
        }).addTo(map);

        // ルート距離・所要時間を表示
        if (Number.isFinite(Number(data.distance))) {
            const routeDistance = Number(data.distance);

            if (distanceElement) {
                distanceElement.innerHTML =
                    `徒歩ルート ${Math.round(routeDistance)} <span>m</span>`;
            }
        }

        if (Number.isFinite(Number(data.duration))) {
            const minutes = Math.max(
                1,
                Math.ceil(Number(data.duration) / 60)
            );

            if (arrivalElement) {
                arrivalElement.textContent = `徒歩 約${minutes}分`;
            }
        }

        // 次に進む方向を表示
        const instructions = Array.isArray(data.instructions)
            ? data.instructions
            : [];

        if (instructions.length > 0) {
            const firstInstruction = instructions[0];

            const text =
                firstInstruction.text ||
                firstInstruction.instruction ||
                "ルートに沿って進んでください";

            const stepDistance = Number(firstInstruction.distance);

            const distanceText = Number.isFinite(stepDistance)
                ? `（約${Math.round(stepDistance)}m）`
                : "";

            setGuidance(`${text}${distanceText}`);
        } else {
            setGuidance("青い線に沿って進んでください");
        }

        console.log("徒歩ルート取得成功:", data);

    } catch (error) {
        console.warn(
            "徒歩ルートを取得できません。直線案内に切り替えます。",
            error
        );

        // ルート取得に失敗しても従来の案内は維持
        updateNavigation(userLat, userLng);

        setGuidance(
            "徒歩ルートを取得できません。矢印と距離を参考にしてください。"
        );

    } finally {
        routeRequestInProgress = false;
    }
}

// ==============================
// 11. ナビゲーション表示を更新
// ==============================

function updateNavigation(userLat, userLng) {
    if (!nearestFacility) {
        return;
    }

    const distance = calculateDistance(
        userLat,
        userLng,
        nearestFacility.lat,
        nearestFacility.lng
    );

    nearestFacility.distance = distance;

    // 直線距離を表示
    // 徒歩ルート取得成功時はルート距離に置き換わる
    if (distanceElement) {
        distanceElement.innerHTML =
            `直線距離 ${Math.round(distance)} <span>m</span>`;
    }

    const minutes = Math.max(
        1,
        Math.ceil(distance / WALKING_SPEED)
    );

    if (arrivalElement) {
        arrivalElement.textContent = `徒歩 約${minutes}分`;
    }

    if (targetPlace) {
        targetPlace.textContent =
            `📍 ${nearestFacility.name || "周辺施設"}`;
    }

    // 到着状態
    if (distance < 10) {
        setStatus("🎉 目的地に到着しました", "#16a34a");
        setGuidance("目的地に到着した可能性があります。");

    } else if (distance < 50) {
        setStatus("🚻 まもなく到着します", "#22c55e");

    } else {
        setStatus(
            `🟢 ${nearestFacility.name || "施設"}を案内中`,
            "#2563eb"
        );
    }

    // 目的地の方角を表示
    const bearing = calculateBearing(
        userLat,
        userLng,
        nearestFacility.lat,
        nearestFacility.lng
    );

    setArrowByBearing(bearing);
}

// ==============================
// 12. 2地点間の距離（メートル）
// ==============================

function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;

    const toRadians = (degrees) => degrees * Math.PI / 180;

    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) ** 2;

    return R * 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );
}

// ==============================
// 13. 目的地の方角を計算
// ==============================

function calculateBearing(lat1, lng1, lat2, lng2) {
    const toRadians = (degrees) => degrees * Math.PI / 180;

    const lat1Rad = toRadians(lat1);
    const lat2Rad = toRadians(lat2);
    const dLng = toRadians(lng2 - lng1);

    const y = Math.sin(dLng) * Math.cos(lat2Rad);

    const x =
        Math.cos(lat1Rad) * Math.sin(lat2Rad) -
        Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

    return (
        Math.atan2(y, x) * 180 / Math.PI + 360
    ) % 360;
}

// ==============================
// 14. 方向矢印を変更
// ==============================

function setArrowByBearing(bearing) {
    if (!arrowElement) {
        return;
    }

    if (bearing >= 337.5 || bearing < 22.5) {
        arrowElement.textContent = "⬆";
    } else if (bearing < 67.5) {
        arrowElement.textContent = "↗";
    } else if (bearing < 112.5) {
        arrowElement.textContent = "➡";
    } else if (bearing < 157.5) {
        arrowElement.textContent = "↘";
    } else if (bearing < 202.5) {
        arrowElement.textContent = "⬇";
    } else if (bearing < 247.5) {
        arrowElement.textContent = "↙";
    } else if (bearing < 292.5) {
        arrowElement.textContent = "⬅";
    } else {
        arrowElement.textContent = "↖";
    }
}

// ==============================
// 15. GPSエラー処理
// ==============================

function errorGPS(error) {
    console.error("GPSエラー:", error);

    let message = "⚠️ GPSを取得できません";

    if (error.code === 1) {
        message = "⚠️ 位置情報の使用を許可してください";
    } else if (error.code === 2) {
        message = "⚠️ 現在地を確認できません";
    } else if (error.code === 3) {
        message = "⚠️ GPS取得がタイムアウトしました";
    }

    setStatus(message, "#f59e0b");

    if (arrivalElement) {
        arrivalElement.textContent = "位置情報待機中";
    }
}

// ==============================
// 16. 星評価機能
// ==============================

stars.forEach((star) => {
    star.addEventListener("click", () => {
        const value = Number(star.dataset.value);

        stars.forEach((item) => {
            const starValue = Number(item.dataset.value);

            if (starValue <= value) {
                item.textContent = "★";
                item.classList.add("active");
            } else {
                item.textContent = "☆";
                item.classList.remove("active");
            }
        });

        setTimeout(() => {
            alert(`星${value}個で評価しました！`);
        }, 300);
    });
});

// ==============================
// 17. 施設名をHTMLとして扱わないための処理
// ==============================

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return replacements[character];
    });
}
