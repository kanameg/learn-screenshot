function generateScreenshotFileName(format = 'png') {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    console.log(`LearnShot-${year}${month}${day}-${hours}${minutes}${seconds}.${format}`);
    
    return `LearnShot-${year}${month}${day}-${hours}${minutes}${seconds}.${format}`;
}

async function copyImageToClipboard(base64Data, tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: async (base64Data) => {
                const response = await fetch(`data:image/png;base64,${base64Data}`);
                const blob = await response.blob();
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'image/png': blob
                    })
                ]);
            },
            args: [base64Data]
        });
        console.log('画像をクリップボードにコピーしました');
    return true;
    } catch (error) {
        console.error('クリップボードへのコピーに失敗:', error);
    return false;
    }
}

// Try to send a showMessage to the tab; if the content script isn't present, inject it and retry.
function sendShowMessage(tabId, message) {
    return new Promise((resolve) => {
        try {
            chrome.tabs.sendMessage(tabId, { type: 'showMessage', message }, (resp) => {
                const last = chrome.runtime.lastError;
                if (!last) return resolve(true);
                // try injecting content script then resend
                try {
                    chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
                        // ignore errors from injection
                        try { chrome.tabs.sendMessage(tabId, { type: 'showMessage', message }, () => resolve(true)); } catch (e) { resolve(false); }
                    });
                } catch (e) {
                    resolve(false);
                }
            });
        } catch (e) {
            // fallback: try to inject then send
            try {
                chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
                    try { chrome.tabs.sendMessage(tabId, { type: 'showMessage', message }, () => resolve(true)); } catch (e) { resolve(false); }
                });
            } catch (ee) {
                resolve(false);
            }
        }
    });
}

async function captureScreenshot(tabId, clip, toMode = 'file') {
    let attached = false;
    try {
        const tab = await chrome.tabs.get(tabId);

        const url = tab.url || '';
        // 特殊なURLにはデバッガーをアタッチしない
        if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.startsWith('file://')) {
            throw new Error('cannot-attach-to-special-url');
        }

        // try attach debugger and capture via CDP
        await new Promise((resolve, reject) => {
            chrome.debugger.attach({ tabId: tabId }, '1.3', () => {
                const last = chrome.runtime.lastError;
                if (last) reject(last); else resolve();
            });
        });
        attached = true;

        const storage = await new Promise((resolve) => chrome.storage.sync.get(['scale', 'quality', 'format'], resolve));
        const scale = storage.scale || 1;
        const quality = storage.quality || 100;
        const format = storage.format || 'png';

        // account for devicePixelRatio sent from the page so coordinates map correctly
        const contentDpr = (clip && clip.dpr) ? clip.dpr : 1;
        const clipForCDP = {
            x: Math.round((clip.x || 0) * contentDpr),
            y: Math.round((clip.y || 0) * contentDpr),
            width: Math.round((clip.width || 0) * contentDpr),
            height: Math.round((clip.height || 0) * contentDpr),
            scale: scale
        };

        console.log('captureScreenshot: using clip', { original: clip, contentDpr, clipForCDP });

        const params = {
            format: format,
            quality: quality,
            clip: clipForCDP
        };

        const result = await new Promise((resolve, reject) => {
            chrome.debugger.sendCommand({ tabId: tabId }, 'Page.captureScreenshot', params, (resp) => {
                const last = chrome.runtime.lastError;
                if (last) reject(last); else resolve(resp);
            });
        });

        // detach
        try { await new Promise((r) => chrome.debugger.detach({ tabId: tabId }, r)); } catch (e) { /* ignore */ }
        attached = false;


        const data = result && result.data;
        if (toMode === 'clipboard') {
            // CDP成功時もプレビュー画面を表示するため、content.jsにデータを送信
            const dataUrl = `data:image/${format};base64,${data}`;
            chrome.tabs.sendMessage(tabId, {
                type: 'showPreviewForClipboard',
                dataUrl: dataUrl,
                filename: generateScreenshotFileName(format)
            });
        } else {
            try { 
                await chrome.downloads.download({ url: `data:image/${format};base64,${data}`, filename: generateScreenshotFileName(format) });
                // ブラウザ側でダウンロード通知が行われるため、成功メッセージは表示しない
            } catch (dlErr) {
                console.error('downloads.download failed:', dlErr);
                await sendShowMessage(tabId, 'ファイルの保存に失敗しました');
            }
        }

        return;
    } catch (err) {
        console.warn('CDP capture failed or skipped, falling back to visibleTab capture:', err);

        // ensure debugger detached if left attached
        if (attached) {
            try { await new Promise((r) => chrome.debugger.detach({ tabId: tabId }, r)); } catch (e) { /* ignore */ }
            attached = false;
        }

        // visibleTab fallback
        try {
            const storage = await new Promise((resolve) => chrome.storage.sync.get(['format', 'quality'], resolve));
            const format = storage.format || 'png';
            const quality = storage.quality || 100;

            const tab = await chrome.tabs.get(tabId);
            const dataUrl = await new Promise((resolve, reject) => {
                chrome.tabs.captureVisibleTab(tab.windowId, { format: format, quality: quality }, (dataUrl) => {
                    const last = chrome.runtime.lastError;
                    if (last) reject(last); else resolve(dataUrl);
                });
            });

            const message = { type: 'fallbackCapture', dataUrl, clip, mode: toMode, filename: generateScreenshotFileName(format), contentDpr: (clip && clip.dpr) ? clip.dpr : 1 };

            const sendMessageToTab = (tid, msg) => new Promise((resolve) => {
                chrome.tabs.sendMessage(tid, msg, (resp) => {
                    const last = chrome.runtime.lastError;
                    if (last) {
                        if (typeof last.message === 'string' && last.message.includes('The message port closed before a response was received')) {
                            resolve({ ok: true });
                        } else {
                            resolve({ ok: false, error: last });
                        }
                    } else {
                        resolve({ ok: true, resp });
                    }
                });
            });

            let res = await sendMessageToTab(tabId, message);
            if (!res.ok) {
                // try focusing window/tab and retry
                try { await new Promise(r => chrome.windows.update(tab.windowId, { focused: true }, r)); await new Promise(r => chrome.tabs.update(tabId, { active: true }, r)); } catch (e) { /* ignore */ }
                res = await sendMessageToTab(tabId, message);
            }

            if (!res.ok) {
                // final fallback: download the full visible image
                try {
                    await chrome.downloads.download({ url: dataUrl, filename: message.filename });
                    if (toMode === 'clipboard') {
                        try { chrome.tabs.sendMessage(tabId, { type: 'showMessage', message: 'ページにフォーカスを当ててから再試行してください。画像はダウンロードしました。' }); } catch (e) { /* ignore */ }
                    }
                } catch (dlErr) {
                    console.error('downloads.download failed in fallback:', dlErr);
                }
            }

            return;
        } catch (fbErr) {
            console.error('visibleTab fallback failed:', fbErr);
            return;
        }
    }
}

// スクリーンショット開始処理を関数に切り出し
async function startScreenshotSelection(tab, toMode) {
    try {
        try {
            await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
        } catch (error) {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
        }
        
        setTimeout(async () => {
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'startSelection',
                    mode: toMode
                });
            } catch (error) {
                console.error('Error starting selection:', error);
            }
        }, 100);
    } catch (error) {
        console.error('Error in handling screenshot:', error);
    }
}

// コマンドのリスナーを追加
chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // 特殊なURLをスキップ
    const url = tab.url;
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:') || url.startsWith('file://')) {
        //console.error('Cannot inject content script into special URL:', url);
        return;
    }

    // コンテンツスクリプトが挿入されているか確認
    // 応答がない場合は再度コンテンツスクリプトを挿入
    try {
        await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
    } catch (error) {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });
    }

    switch (command) {
        case 'screenshot-to-file':
            startScreenshotSelection(tab, 'file');
            break;
        case 'screenshot-to-clipboard':
            startScreenshotSelection(tab, 'clipboard');
            break;
        case 'video-to-clipboard':
            // video要素の検出を要求
            chrome.tabs.sendMessage(tab.id, { type: 'captureVideo', mode: 'clipboard' });
            break;
        case 'video-to-file':
            chrome.tabs.sendMessage(tab.id, { type: 'captureVideo', mode: 'file' });
            break;
    }
});

// コンテンツスクリプトからの選択完了メッセージを受け取る
chrome.runtime.onMessage.addListener((message, sender) => {
    const tabId = sender && sender.tab && sender.tab.id;
    if (message.type === 'selectionComplete' || message.type === 'videoDetected') {
        if (tabId) {
            captureScreenshot(tabId, message.clip, message.mode);
        } else {
            // sender.tab がない場合のフォールバック: アクティブタブを探す
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0] && tabs[0].id) {
                    captureScreenshot(tabs[0].id, message.clip, message.mode);
                } else {
                    console.error('onMessage: no sender.tab and no active tab found');
                }
            });
        }
    }
    // note: do not send success messages here. captureScreenshot will notify on real success.
});

// アイコンクリックのリスナー
chrome.action.onClicked.addListener(async (tab) => {
    startScreenshotSelection(tab, 'file');
});