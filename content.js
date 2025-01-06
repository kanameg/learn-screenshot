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
        border: 2px solid #1a73e8;
        background-color: rgba(26, 115, 232, 0.1);
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

    // より正確な座標計算
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);

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

    document.removeEventListener('mousemove', updateSelectionBox, true);
    document.removeEventListener('mouseup', endSelection, true);
}

function initializeSelection() {
    toggleTextSelection(true);
    createOverlay();
    
    overlayElement.addEventListener('mousedown', startSelection, true);
    document.addEventListener('mousemove', updateSelectionBox, true);
    document.addEventListener('mouseup', endSelection, true);
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

window.addEventListener('beforeunload', cleanup);