let isSelecting = false;
let startX = 0;
let startY = 0;
let selectionBox = null;
let overlayElement = null;

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
        initializeSelection();
    }
});

// ページ遷移やクローズ時に選択中の状態を解除する
window.addEventListener('beforeunload', cleanup);