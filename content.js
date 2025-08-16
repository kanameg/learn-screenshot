(function () {
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

    // 共通のプレビュー表示関数
    function showPreview(dataUrl, filename, dataType = 'url') {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; left: 0; top: 0; width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.5); z-index: 2147483647;
        `;

        const panel = document.createElement('div');
        panel.style.cssText = `
            background: white; padding: 12px; border-radius: 8px; max-width: 90%; max-height: 90%;
            display: flex; flex-direction: column; gap: 8px; align-items: center;
        `;

        const imgPreview = document.createElement('img');
        imgPreview.src = dataUrl;
        imgPreview.style.cssText = 'max-width: 80vw; max-height: 60vh;';
        panel.appendChild(imgPreview);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:8px;';

        const copyBtn = createButton('コピー');
        const downloadBtn = createButton('ダウンロード');
        const closeBtn = createButton('閉じる');

        btnRow.appendChild(copyBtn);
        btnRow.appendChild(downloadBtn);
        btnRow.appendChild(closeBtn);

        panel.appendChild(btnRow);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const cleanupOverlay = () => { overlay.remove(); };

        // コピーボタンの処理
        copyBtn.addEventListener('click', async () => {
            try {
                let blob;
                if (dataType === 'canvas') {
                    // Canvas データURLの場合
                    const response = await fetch(dataUrl);
                    blob = await response.blob();
                } else {
                    // 通常のデータURLの場合
                    const response = await fetch(dataUrl);
                    blob = await response.blob();
                }
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                showMessage('クリップボードにコピーしました');
                cleanupOverlay();
            } catch (e) {
                console.error('Clipboard write failed:', e);
                showMessage('クリップボードへのコピーに失敗しました');
            }
        });

        // ダウンロードボタンの処理
        downloadBtn.addEventListener('click', () => {
            try {
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = filename || 'screenshot.png';
                document.body.appendChild(a);
                a.click();
                a.remove();
                cleanupOverlay();
            } catch (e) {
                console.error('Download failed:', e);
            }
        });

        closeBtn.addEventListener('click', cleanupOverlay);
    }

    // ボタン作成のヘルパー関数
    function createButton(text) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = 'padding: 10px 16px; background-color: #f0f0f0; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 14px;';
        button.addEventListener('mouseenter', () => { button.style.backgroundColor = '#e0e0e0'; });
        button.addEventListener('mouseleave', () => { button.style.backgroundColor = '#f0f0f0'; });
        return button;
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
            const clip = {
                x: Math.round(left + scrollX),
                y: Math.round(top + scrollY),
                width: Math.round(width),
                height: Math.round(height),
                dpr: window.devicePixelRatio || 1
            };

            // まずオーバーレイや選択表示を消してからキャプチャ要求を送る。
            // ブラウザが DOM の変更を描画する時間を少し待つことで、
            // ラバーバンド（overlay）がキャプチャに含まれるのを防ぐ。
            cleanup();
            // cleanup() の DOM 変更が描画されるまで 2 フレーム待つ（確実にペイントを反映させる）
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    chrome.runtime.sendMessage({
                        type: 'selectionComplete',
                        mode: toMode,
                        clip
                    });
                });
            });
        } else {
            cleanup();
        }
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
        console.log('Video element found:', rect, 'scrollX:', scrollX, 'scrollY:', scrollY); // ビデオ要素の位置とスクロール量をログに出力

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
                        clip: { ...videoRect, dpr: window.devicePixelRatio || 1 },
                    mode: message.mode
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
        if (message.type === 'showPreviewForClipboard') {
            // CDP成功時のプレビュー表示
            showPreview(message.dataUrl, message.filename);
        }
        if (message.type === 'fallbackCapture') {
            (async () => {
                try {
                        const { dataUrl, clip, mode, filename, contentDpr = 1 } = message;
                    // 画像を読み込みキャンバスでクロップ
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.src = dataUrl;
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                    });

                    // dataUrl is based on the visibleTab capture which is in device pixels.
                    // Adjust clip coords by contentDpr so cropping matches capture image size.
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(clip.width * contentDpr);
                    canvas.height = Math.round(clip.height * contentDpr);
                    const ctx = canvas.getContext('2d');
                    // visibleTab dataUrl is in device pixels; convert clip coords to device pixels
                    const sx = Math.round((clip.x - window.scrollX) * contentDpr);
                    const sy = Math.round((clip.y - window.scrollY) * contentDpr);
                    const sWidth = Math.round(clip.width * contentDpr);
                    const sHeight = Math.round(clip.height * contentDpr);
                    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
                    console.log('Captured area (css->device px):', { sx, sy, sWidth, sHeight, contentDpr });

                    if (mode === 'file') {
                        canvas.toBlob((blob) => {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = filename || 'screenshot.png';
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                        }, 'image/png');
                    } else if (mode === 'clipboard') {
                        try {
                            // Canvas のデータを共通のプレビュー関数で表示
                            const canvasDataUrl = canvas.toDataURL('image/png');
                            showPreview(canvasDataUrl, filename, 'canvas');
                        } catch (e) {
                            console.error('Fallback preview handling failed:', e);
                            showMessage('処理に失敗しました');
                        }
                    }
                } catch (e) {
                    console.error('fallbackCapture handling failed:', e);
                }
            })();
        }
    });

    // ページ遷移やクローズ時に選択中の状態を解除する
    window.addEventListener('beforeunload', cleanup);
})();