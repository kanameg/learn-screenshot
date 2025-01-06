async function captureScreenshot(clip) {
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
                scale: 1
            }
        };

        const { data } = await chrome.debugger.sendCommand(
            { tabId: tab.id },
            "Page.captureScreenshot",
            screenshotParams
        );

        // スクリーンショット取得後にデバッガーを切断
        await chrome.debugger.detach({ tabId: tab.id });

        // ダウンロード処理
        await chrome.downloads.download({
            url: `data:image/png;base64,${data}`,
            filename: 'screenshot.png'
        });

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
async function startScreenshotSelection(tab) {
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
                await chrome.tabs.sendMessage(tab.id, { type: 'startSelection' });
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
    if (command === 'take-screenshot') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            startScreenshotSelection(tab);
        }
    }
});

// コンテンツスクリプトからの選択完了メッセージを受け取る
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'selectionComplete') {
        captureScreenshot(message.clip);
    }
});

// アイコンクリックのリスナー
chrome.action.onClicked.addListener(async (tab) => {
    startScreenshotSelection(tab);
});