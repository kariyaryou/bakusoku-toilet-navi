// ==========================================================================
// ⚡ 爆速トイレナビ - GPS連動＆星評価システム（script.js）
// ==========================================================================

// --- 🎯 設定：目的地のトイレの位置情報（例：渋谷駅近くのダミー位置） ---
// ※実機テストやデモの際は、あなたの学校や現在地の近くの緯度・経度に変えるとリアルに動きます！
const map = L.map('map').setView([35.1796,136.9066],16);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© OpenStreetMap contributors'
}).addTo(map);
let currentMarker;

const TARGET_LAT = 35.658034;   // 目的地の緯度
const TARGET_LNG = 139.701636;  // 目的地の経度

// トイレ位置マーカー
const toiletMarker = L.marker([TARGET_LAT, TARGET_LNG])
.addTo(map)
.bindPopup("🚻 渋谷東口ビル 2F公衆トイレ");

// --- 🖥️ HTMLから書き換える要素を捕まえる ---
const arrowElement = document.getElementById('direction-arrow');
const distanceElement = document.querySelector('.distance-text');
const alertBadge = document.querySelector('.alert-badge');
const stars = document.querySelectorAll('.star-input');

// ==========================================================================
// 🧭 1. GPS位置情報の監視とリアルタイム計算
// ==========================================================================

// ブラウザがGPS（位置情報機能）に対応しているかチェック
if (navigator.geolocation) {
    // ユーザーの現在地をリアルタイムに継続監視（移動すると自動で実行される）
    navigator.geolocation.watchPosition(successGPS, errorGPS, {
        enableHighAccuracy: true, // 高精度なGPSを要求（スマホ向け）
        maximumAge: 0,            // キャッシュを使わず常に最新の情報を取得
        timeout: 20000             // 5秒応答がなければタイムアウト
    });
} else {
    alertBadge.textContent = "❌ GPS非対応のブラウザです";
    alertBadge.style.backgroundColor = "#7f8c8d";
}

// 🟢 GPSの取得に成功したときの処理
function successGPS(position) {
    const userLat = position.coords.latitude;  // 現在地の緯度
    const userLng = position.coords.longitude; // 現在地の経度
    // 地図を現在地へ移動
    map.setView([userLat, userLng], 18);

    // 前のマーカーを削除
    if (currentMarker) {
    map.removeLayer(currentMarker);
    }

    // 新しい現在地マーカーを追加
    currentMarker = L.marker([userLat, userLng]).addTo(map);

    currentMarker
    .bindPopup("現在地")
    .openPopup();
    
    const userHeading = position.coords.heading; // ユーザーが進んでいる方角（0〜360度）

    // ① 現在地から目的地までの「距離（メートル）」を計算
    const distance = calculateDistance(userLat, userLng, TARGET_LAT, TARGET_LNG);
    
    // ② 現在地から目的地への「方角」を計算
    const targetBearing = calculateBearing(userLat, userLng, TARGET_LAT, TARGET_LNG);

    // ③ 画面の「距離」の文字を書き換える
    distanceElement.innerHTML = `直進 ${Math.round(distance)}<span>m</span>`;
    alertBadge.textContent = "🟢 最寄りトイレに接続中";
    alertBadge.style.backgroundColor = "#27ae60";

    // ④ 【重要】進むべき「矢印の向き」を決定する
    // スマホの電子コンパス（heading）が取れる場合は、自分の向きに合わせて矢印を回転させる
    if (userHeading !== null && userHeading !== undefined) {
        // 目的地の方角と、自分が向いている方角の「差」を出す
        const relativeBearing = (targetBearing - userHeading + 360) % 360;
        setArrowByBearing(relativeBearing);
    } else {
        // コンパスが取れない（PCなど）の場合は、北を基準とした単純な方位で矢印を出す
        setArrowByBearing(targetBearing);
    }
}

// 🔴 GPSの取得に失敗したとき（屋内や権限拒否など）の処理
function errorGPS(error) {
    console.error("GPSエラー:", error);

    let message = "";

    if (error.code === 1) {
        message = "❌ 位置情報の使用が許可されていません";
    } else if (error.code === 2) {
        message = "❌ 現在地を取得できません";
    } else if (error.code === 3) {
        message = "⚠️ GPS取得がタイムアウトしました";
    } else {
        message = "⚠️ GPSでエラーが発生しました";
    }

    alertBadge.textContent = message;
    alertBadge.style.backgroundColor = "#e67e22";
}

// --- 📐 計算用サブ関数：2点間の距離を求める（ヒュベニの公式） ---
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // 地球の半径（メートル）
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// --- 📐 計算用サブ関数：目的地への方角を求める ---
function calculateBearing(lat1, lng1, lat2, lng2) {
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const dLngRad = (lng2 - lng1) * Math.PI / 180;

    const y = Math.sin(dLngRad) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLngRad);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // 0度(北)〜360度の範囲に変換
}

// --- 🧭 方角から画面の矢印（⬇ ➡️ ⬆ ⬅）を切り替える処理 ---
function setArrowByBearing(bearing) {
    if (bearing >= 337.5 || bearing < 22.5) {
        arrowElement.textContent = "⬆"; // 北（前進）
    } else if (bearing >= 22.5 && bearing < 67.5) {
        arrowElement.textContent = "↗";
    } else if (bearing >= 67.5 && bearing < 112.5) {
        arrowElement.textContent = "➡️"; // 東（右折）
    } else if (bearing >= 112.5 && bearing < 157.5) {
        arrowElement.textContent = "↘";
    } else if (bearing >= 157.5 && bearing < 202.5) {
        arrowElement.textContent = "⬇"; // 南（後退・反転）
    } else if (bearing >= 202.5 && bearing < 247.5) {
        arrowElement.textContent = "↙";
    } else if (bearing >= 247.5 && bearing < 292.5) {
        arrowElement.textContent = "⬅️"; // 西（左折）
    } else if (bearing >= 292.5 && bearing < 337.5) {
        arrowElement.textContent = "↖";
    }
}


// ==========================================================================
// ⭐ 2. 星評価レビュー連動システム（前回の処理も合体）
// ==========================================================================
stars.forEach((star) => {
    star.addEventListener('click', () => {
        const selectedValue = parseInt(star.getAttribute('data-value'));

        stars.forEach((s) => {
            const starValue = parseInt(s.getAttribute('data-value'));
            if (starValue <= selectedValue) {
                s.classList.add('active');
                s.textContent = '★';
            } else {
                s.classList.remove('active');
                s.textContent = '☆';
            }
        });

        setTimeout(() => {
            alert(`星 ${selectedValue} 個でレビューを送信しました。ご協力ありがとうございました！`);
        }, 300);
    });
});
