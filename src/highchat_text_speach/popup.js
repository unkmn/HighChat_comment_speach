// 設定のデフォルト値
const defaultSettings = {
    port: 50080,
    startMessage: "コメントの読み上げを開始します",
    stopMessage: "", 
    readName: true,
    honorific: "さん",
    isBrEnabled: true,
    ngActionNoRead: true,
    ngActionDelete: false, 
    autoStartStreamerName: "",
    oneCommeAutoStartStreamerName: "",
    oneCommeId: "",
    oneCommeStartMessage: "わんコメ連携を開始します",
    oneCommeStopMessage: "",
    oneCommeAnonymous: "匿名",
    oneCommeNotLogin: "(未ログイン)",
    isOneCommeBrEnabled: true
};

const isEnabledCheckbox = document.getElementById('isEnabled');
const isOneCommeEnabledCheckbox = document.getElementById('isOneCommeEnabled');
const ngDeleteCheckbox = document.getElementById('ngActionDelete');
const portInput = document.getElementById('port');
const oneCommeIdInput = document.getElementById('oneCommeId');

// 「自動削除」の有効化条件（配信者権限）をチェックします
async function checkAdminPermission() {
    try {
        const [tab] = await chrome.tabs.query({ 
            active: true, 
            url: "https://ikasekai.com/highchat/live/*" 
        });

        if (!tab) {
             return false;
        }
        
        const response = await Promise.race([
            chrome.tabs.sendMessage(tab.id, { action: "checkAdminPermission" }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 500)) 
        ]);
        
        return response && response.hasPermission;

    } catch (e) {
        console.warn("DOMチェック(checkAdminPermission)に失敗しました:", e.message);
        return false;
    }
}

// 自動削除チェックボックスの有効/無効を更新します
async function updateDeleteCheckboxState() {
    const hasPermission = await checkAdminPermission();
    
    if (hasPermission) {
        ngDeleteCheckbox.disabled = false;
    } else {
        ngDeleteCheckbox.disabled = true;
        ngDeleteCheckbox.checked = false; 
        
        chrome.storage.local.get({ ngActionDelete: false }, (items) => {
            if (items.ngActionDelete) {
                 chrome.storage.local.set({ ngActionDelete: false });
            }
        });
    }
}


// 設定をフォームに読み込む
function loadOptions() {
    // 拡張機能IDを表示
    document.getElementById("extentionId").value = chrome.runtime.id;

    // 1. ストレージから設定を読み込む
    chrome.storage.local.get(defaultSettings, (items) => {
        portInput.value = items.port;
        document.getElementById('startMessage').value = items.startMessage;
        document.getElementById('stopMessage').value = items.stopMessage;
        document.getElementById('readName').checked = items.readName;
        document.getElementById('honorific').value = items.honorific;
        document.getElementById('isBrEnabled').checked = items.isBrEnabled;
        document.getElementById('ngActionNoRead').checked = items.ngActionNoRead;
        document.getElementById('ngActionDelete').checked = items.ngActionDelete;
        document.getElementById('autoStartStreamerName').value = items.autoStartStreamerName;
        document.getElementById('autoStartOneCommeStreamerName').value = items.oneCommeAutoStartStreamerName;
        document.getElementById('oneCommeId').value = items.oneCommeId;
        document.getElementById('oneCommeStartMessage').value = items.oneCommeStartMessage;
        document.getElementById('oneCommeStopMessage').value = items.oneCommeStopMessage;
        document.getElementById('oneCommeAnonymous').value = items.oneCommeAnonymous;
        document.getElementById('oneCommeNotLogin').value = items.oneCommeNotLogin;
        document.getElementById('isOneCommeBrEnabled').checked = items.isOneCommeBrEnabled;
    });

    // 2. アクティブタブのURLをチェックし、状態を反映
    (async () => {
        let isReading = false;
        let isOneComme = false;
        let onTargetSite = false; // ターゲットサイトかどうか
        
        try {
            // 現在アクティブなタブを取得 (URLフィルタなし)
            const [tab] = await chrome.tabs.query({ 
                active: true, 
                currentWindow: true 
            });

            // ターゲットサイトか確認
            if (tab && tab.url && tab.url.startsWith("https://ikasekai.com/highchat/live/")) {
                onTargetSite = true; 
                
                // 状態を問い合わせる
                const response = await Promise.race([
                    chrome.tabs.sendMessage(tab.id, { action: "queryState" }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 300)) 
                ]);
                if (response) {
                    isReading = response.isReading; 
                    isOneComme = response.isOneComme; 
                }
            }
            // ターゲットサイトでない場合: isReading = false, onTargetSite = false
            
        } catch (e) {
            console.warn("状態の問い合わせに失敗 (リロード中など):", e.message);
            // エラー時: isReading = false, onTargetSite = false
        }
        
        // 状態を反映
        isEnabledCheckbox.checked = isReading;
        isEnabledCheckbox.disabled = !onTargetSite;
        isOneCommeEnabledCheckbox.checked = isOneComme;
        isOneCommeEnabledCheckbox.disabled = !onTargetSite;

    })(); // 2. の終わり

    // 3. 自動削除の権限チェック (enabled の設定)
    // (この関数は内部でURLチェックをしているため、
    // ターゲットサイトでなければ自動的に delete チェックボックスも disabled になる)
    updateDeleteCheckboxState();
}

// ポート番号のバリデーション関数
function validatePort() {
    const portValue = portInput.value;
    if (portValue === "" || 
        !Number.isInteger(Number(portValue)) || 
        Number(portValue) < 0 || 
        Number(portValue) > 65535) {
        
        return false;
    }
    return true;
}

// ポート番号のフォーカスアウト処理
function handlePortBlur() {
    if (!validatePort()) {
        alert("ポート番号が不正です。0〜65535の範囲で入力してください。");
        chrome.storage.local.get("port", (items) => {
            portInput.value = items.port || defaultSettings.port;
        });
    }
}

// わんコメIDのフォーカスアウト処理
function handleOneCommeIdBlur() {
    chrome.storage.local.get("oneCommeId", (items) => {
        oneCommeIdInput.value = items.oneCommeId || defaultSettings.oneCommeId;
    });
}

// 設定を保存する
function saveOptions() {
    
    if (!validatePort()) {
        console.warn("ポート番号が不正なため、保存をスキップしました。");
        return; 
    }
    
    const settings = {
        port: parseInt(portInput.value, 10),
        startMessage: document.getElementById('startMessage').value,
        stopMessage: document.getElementById('stopMessage').value,
        readName: document.getElementById('readName').checked,
        honorific: document.getElementById('honorific').value,
        isBrEnabled: document.getElementById('isBrEnabled').checked,
        ngActionNoRead: document.getElementById('ngActionNoRead').checked,
        ngActionDelete: document.getElementById('ngActionDelete').checked,
        autoStartStreamerName: document.getElementById('autoStartStreamerName').value.trim(),
        oneCommeAutoStartStreamerName: document.getElementById('autoStartOneCommeStreamerName').value,
        oneCommeId: document.getElementById('oneCommeId').value,
        oneCommeStartMessage: document.getElementById('oneCommeStartMessage').value,
        oneCommeStopMessage: document.getElementById('oneCommeStopMessage').value,
        oneCommeAnonymous: document.getElementById('oneCommeAnonymous').value,
        oneCommeNotLogin: document.getElementById('oneCommeNotLogin').value,
        isOneCommeBrEnabled: document.getElementById('isOneCommeBrEnabled').checked        
    };
    
    chrome.storage.local.set(settings);
}

// イベントリスナーを設定
document.addEventListener('DOMContentLoaded', loadOptions);

// 「読み上げを有効にする」チェックボックスのリスナー
isEnabledCheckbox.addEventListener('change', (event) => {
    chrome.tabs.query({ active: true, url: "https://ikasekai.com/highchat/live/*" }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { 
                action: "toggleReading", 
                value: event.target.checked 
            });
        }
    });
});

// 「わんコメへの転送を有効にする」チェックボックスのリスナー
isOneCommeEnabledCheckbox.addEventListener('change', (event) => {
    chrome.tabs.query({ active: true, url: "https://ikasekai.com/highchat/live/*" }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { 
                action: "toggleOneComme", 
                value: event.target.checked 
            });
        }
    });
});

// 「自動削除」チェックボックスのリスナー
ngDeleteCheckbox.addEventListener('change', (event) => {
    saveOptions();
});


// 他のフォーム要素の変更を監視して保存
portInput.addEventListener('change', saveOptions);
document.getElementById('startMessage').addEventListener('change', saveOptions);
document.getElementById('stopMessage').addEventListener('change', saveOptions);
document.getElementById('readName').addEventListener('change', saveOptions);
document.getElementById('honorific').addEventListener('change', saveOptions);
document.getElementById('isBrEnabled').addEventListener('change', saveOptions);
document.getElementById('autoStartStreamerName').addEventListener('change', saveOptions); 
document.getElementById('ngActionNoRead').addEventListener('change', saveOptions);
document.getElementById('autoStartOneCommeStreamerName').addEventListener('change', saveOptions); 
document.getElementById('oneCommeStartMessage').addEventListener('change', saveOptions); 
document.getElementById('oneCommeStopMessage').addEventListener('change', saveOptions); 
document.getElementById('oneCommeAnonymous').addEventListener('change', saveOptions); 
document.getElementById('oneCommeNotLogin').addEventListener('change', saveOptions); 
document.getElementById('isOneCommeBrEnabled').addEventListener('change', saveOptions);
oneCommeIdInput.addEventListener('change', saveOptions);

portInput.addEventListener('blur', handlePortBlur);
oneCommeIdInput.addEventListener('blur', handleOneCommeIdBlur);

// NGワード設定ページへのリンク
document.getElementById('ngSettingsLink').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});