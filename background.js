function generateScreenshotFileName() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `LearnShot-${year}${month}${day}-${hours}${minutes}${seconds}.png`;
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
    } catch (error) {
        console.error('クリップボードへのコピーに失敗:', error);
    }
}

async function captureScreenshot(clip, toMode = 'file') {
    let attachedTab = null;
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        attachedTab = tab.id;

        // 既存のデバッガー接続を確認して切断
        try {
            const debuggerInfo = await chrome.debugger.getTargets();
            const isAttached = debuggerInfo.some(d => d.tabId === tab.id && d.attached);
            if (isAttached) {
                await chrome.debugger.detach({ tabId: tab.id });
            }
        } catch (e) {
            // エラーを無視（デバッガーが接続されていない場合など）
        }

        // 新しいデバッガー接続を確立
        await chrome.debugger.attach({ tabId: tab.id }, "1.3");

        const screenshotParams = {
            format: "png",
            quality: 100,
            clip: {
                ...clip,
                scale: 0.5 // 0.5で実ピクセルサイズになる
            }
        };

        const { data } = await chrome.debugger.sendCommand(
            { tabId: tab.id },
            "Page.captureScreenshot",
            screenshotParams
        );

        // スクリーンショット取得後にデバッガーを切断
        await chrome.debugger.detach({ tabId: tab.id });
        
        if (toMode === 'clipboard') {
            // クリップボードにコピー
            await copyImageToClipboard(data, tab.id);
        } else if (toMode === 'file') {
            // ダウンロード処理
            await chrome.downloads.download({
                url: `data:image/png;base64,${data}`,
                filename: generateScreenshotFileName()
            });
        }

    } catch (error) {
        console.error('Screenshot capture error:', error);
        // エラー発生時にデバッガーが接続されていれば切断
        if (attachedTab !== null) {
            try {
                const debuggerInfo = await chrome.debugger.getTargets();
                const isAttached = debuggerInfo.some(d => d.tabId === attachedTab && d.attached);
                if (isAttached) {
                    await chrome.debugger.detach({ tabId: attachedTab });
                }
            } catch (e) {
                // エラーを無視
            }
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

    switch (command) {
        case 'screenshot-to-file':
            startScreenshotSelection(tab, 'file');
            break;
        case 'screenshot-to-clipboard':
            startScreenshotSelection(tab, 'clipboard');
            break;
        case 'video-to-clipboard':
            // video要素の検出を要求
            chrome.tabs.sendMessage(tab.id, { type: 'captureVideo' });
            break;
    }
});

// コンテンツスクリプトからの選択完了メッセージを受け取る
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'selectionComplete') {
        if (message.mode === 'clipboard') {
            captureScreenshot(message.clip, 'clipboard');
            chrome.tabs.sendMessage(sender.tab.id, {
                type: 'showMessage',
                message: 'クリップボードにコピーしました'
            });
        } else {
            captureScreenshot(message.clip, 'file');
            chrome.tabs.sendMessage(sender.tab.id, {
                type: 'showMessage',
                message: 'ファイルに保存しました'
            });
        }
    } else if (message.type === 'videoDetected') {
        captureScreenshot(message.clip, 'clipboard');
        chrome.tabs.sendMessage(sender.tab.id, {
            type: 'showMessage',
            message: 'クリップボードにコピーしました'
        });
    }
});

// アイコンクリックのリスナー
chrome.action.onClicked.addListener(async (tab) => {
    startScreenshotSelection(tab);
});