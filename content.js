let isSelecting = false;
let startX = 0;
let startY = 0;
let selectionBox = null;
let overlayElement = null;
let toMode = 'file';

function showMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.5);
        color: white;
        padding: 20px 40px;
        border-radius: 40px;
        font-family: Arial, sans-serif;
        font-size: 32px;
        z-index: 2147483647;
    `;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 2000);
}

function toggleTextSelection(disable) {
    const style = document.createElement('style');
    style.id = 'screenshot-style';
    style.textContent = `
        * {
            user-select: none !important;
            -webkit-user-select: none !important;
        }
    `;
    
    if (disable) {
        document.head.appendChild(style);
    } else {
        const existingStyle = document.getElementById('screenshot-style');
        if (existingStyle) {
            existingStyle.remove();
        }
    }
}

function createOverlay() {
    overlayElement = document.createElement('div');
    overlayElement.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483646;
        background: transparent;
        cursor: crosshair;
    `;
    document.body.appendChild(overlayElement);
}

function createSelectionBox() {
    if (selectionBox) {
        selectionBox.remove();
    }

    selectionBox = document.createElement('div');
    selectionBox.style.cssText = `
        position: fixed;
        border: 2px solid #FFA500;
        background-color: rgba(255, 165, 0, 0.1);
        pointer-events: none;
        z-index: 2147483647;
        display: none;
        box-sizing: border-box;
    `;
    document.body.appendChild(selectionBox);

    const sizeDisplay = document.createElement('div');
    sizeDisplay.id = 'size-display';
    sizeDisplay.style.cssText = `
        position: absolute;
        bottom: -25px;
        right: 0;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-family: Arial;
    `;
    selectionBox.appendChild(sizeDisplay);
}

function updateSelectionBox(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isSelecting || !selectionBox) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
    selectionBox.style.display = 'block';

    // サイズ表示を更新
    const sizeDisplay = selectionBox.querySelector('#size-display');
    if (sizeDisplay) {
        sizeDisplay.textContent = `${Math.round(width)} x ${Math.round(height)}`;
    }
}

function startSelection(e) {
    e.preventDefault();
    e.stopPropagation();
    
    isSelecting = true;
    startX = e.clientX;
    startY = e.clientY;
    createSelectionBox();
}

function endSelection(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isSelecting) return;
    isSelecting = false;

    const endX = e.clientX;
    const endY = e.clientY;
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    console.log('scrollX:', scrollX, 'scrollY:', scrollY); // スクロール量をログに出力

    // より正確な座標計算
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    console.log('left:', left, 'top:', top, 'width:', width, 'height:', height); // 座標とサイズをログに出力

    if (width > 0 && height > 0) {
        // 座標計算を単純化
        chrome.runtime.sendMessage({
            type: 'selectionComplete',
            mode: toMode,
            clip: {
                x: Math.round(left + scrollX),
                y: Math.round(top + scrollY),
                width: Math.round(width),
                height: Math.round(height)
            }
        });
    }

    cleanup();
}

function cleanup() {
    if (selectionBox) {
        selectionBox.remove();
        selectionBox = null;
    }
    if (overlayElement) {
        overlayElement.remove();
        overlayElement = null;
    }

    toggleTextSelection(false);

    // overlayElementは削除済みなので、イベントリスナーも削除されている
}

// video要素の検出関数
function findVideoElement() {
    const video = document.querySelector('video');
    if (!video) return null;

    const rect = video.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    return {
        x: Math.round(rect.left + scrollX),
        y: Math.round(rect.top + scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
    };
}

function initializeSelection() {
    toggleTextSelection(true); // テキストが選択されないように無効化する
    createOverlay(); // クリックが要素に伝わらないようにオーバレイを作成する
    
    // オーバレイにイベントリスナーを追加
    overlayElement.addEventListener('mousedown', startSelection, true);
    overlayElement.addEventListener('mousemove', updateSelectionBox, true);
    overlayElement.addEventListener('mouseup', endSelection, true);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ping') {
        sendResponse({ status: 'ok' });
        return;
    }
    if (message.type === 'startSelection') {
        toMode = message.mode; // モードを取得 (デフォルトはファイルモード)
        initializeSelection();
    }
    if (message.type === 'captureVideo') {
        const videoRect = findVideoElement();
        if (videoRect) {
            chrome.runtime.sendMessage({
                type: 'videoDetected',
                clip: videoRect
            });
        } else {
            showMessage('ビデオの取得に失敗しました');
        }
    }
    if (message.type === 'showMessage') {
        setTimeout(() => {
            showMessage(message.message);
        }, 1000);
    }
});

// ページ遷移やクローズ時に選択中の状態を解除する
window.addEventListener('beforeunload', cleanup);