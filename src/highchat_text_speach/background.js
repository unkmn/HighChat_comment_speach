// デフォルト設定
const defaultSettings = {
    isEnabled: false,
    port: 50080,
    startMessage: "コメントの読み上げを開始します",
    stopMessage: "",
    readName: false,
    honorific: "さん",
    ngWords: [],
    ngActionNoRead: true,
    ngActionDelete: false, 
    autoStartStreamerName: ""
};

// 拡張機能インストール時にデフォルト設定を保存
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(defaultSettings, (items) => {
        chrome.storage.local.set(items);
    });
});

// 棒読みちゃんへテキストを送信する関数
async function sendToBouyomi(text) {
    if (!text) return;
    try {
        const { port } = await chrome.storage.local.get("port");
        const url = `http://localhost:${port}/Talk?text=${encodeURIComponent(text)}`;
        
        await fetch(url, {
            method: 'GET',
            mode: 'no-cors' 
        });
        return true;
    } catch (e) {
        console.error("棒読みちゃんへの送信に失敗しました:", e);
        return false;
    }
}

// わんコメへテキストを送信する関数
async function sendToOneComme(messageId, userId, profileImage, isOwner, name, text) {
    if (!text) return;
    try {
        const { oneCommeId } = await chrome.storage.local.get("oneCommeId");
        const url = "http://localhost:11180/api/comments";
        
        await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                service: {
                    id: oneCommeId
                },
                comment: {
                    id: messageId,
                    userId: userId,
                    badges: [],
                    isOwner: isOwner,
                    profileImage: profileImage,
                    name: name,
                    comment: text
                }
            })
        })
        .then(response => {
            if (response.status !== 200) {
                console.error("わんコメへの送信に失敗しました:" + response.statusText);
                return false;
            }
        });
        return true;
    } catch (e) {
        console.error("わんコメへの送信に失敗しました:", e);
        return false;
    }
}

// content.js からのメッセージを受け取る
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "sendToBouyomi") {
        if(sendToBouyomi(request.text)) {
            sendResponse({ status: "sent" });
        }        
        return true; 
    }
    else if (request.action === "sendToOneComme") {
        if(sendToOneComme(request.messageId, request.userId, request.profileImage, request.isOwner, request.name, request.text)) {
            sendResponse({ status: "sent" });
        }        
        return true; 
    }
});