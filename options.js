document.addEventListener('DOMContentLoaded', () => {
    const scaleInput = document.getElementById('scale');
    const saveButton = document.getElementById('save');

    // 設定値の読み込み
    chrome.storage.sync.get(['scale'], (result) => {
        if (result.scale) {
            scaleInput.value = result.scale;
        } else {
            scaleInput.value = 1.0; // デフォルト値を設定
        }
    });

    // 保存メッセージの表示
    function showSavedMessage() {
        const message = document.createElement('div');
        message.textContent = '設定を保存しました';
        message.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 128, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            font-size: 14px;
        `;
        document.body.appendChild(message);
        setTimeout(() => message.remove(), 2000);
    }

    // 設定値の保存
    saveButton.addEventListener('click', () => {
        const scale = parseFloat(scaleInput.value);
        if (isNaN(scale) || scale <= 0 || scale > 2) {
            alert('スケール値は0.1から2.0の間で入力してください');
            return;
        }
        chrome.storage.sync.set({ scale }, () => {
            showSavedMessage();
        });
    });
});