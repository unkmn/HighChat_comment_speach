let settings = {};

let isEnabled = false; 
let isOneCommeEnabled = false; 
let chatListObserver = null;
const CHAT_LIST_SELECTOR = '#highchat_comment__list';
const USER_ID_ANONYMOUS = "highchat_anonymous";

const REPLACE_TXT_EMOJI = "${{highchatEmoji}}";
const REPLACE_TXT_BR = "${{highchatBr}}";

// 1. 設定の読み込みと監視
function loadAndWatchSettings() {
    chrome.storage.local.get(null, (items) => {
        settings = items;
    });

    chrome.storage.onChanged.addListener((changes) => {
        for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
            if (key !== 'isEnabled') {
                settings[key] = newValue;
            }
            if (key !== 'isOneCommeEnabled') {
                settings[key] = newValue;
            }
        }
    });
}

// 2. 読み上げ有効/無効状態の切り替え
function updateEnabledState(newIsEnabled, oldIsEnabled = undefined) {
    isEnabled = newIsEnabled; 
    
    if (newIsEnabled) { // OFF -> ON
        console.log("読み上げ開始");
        chrome.storage.local.get("startMessage", (items) => {
            sendToBouyomi(items.startMessage);
        });
        startObserver();
    } else { // ON -> OFF
        console.log("読み上げ停止");
        chrome.storage.local.get("stopMessage", (items) => {
            if (items.stopMessage) { // 空文字の場合は送信しない
                sendToBouyomi(items.stopMessage);
            }
        });
        stopObserver();
    }
}

function updateOneCommeEnabledState(newIsOneCommeEnabled, oldIsOneCommeEnabled = undefined) {
    isOneCommeEnabled = newIsOneCommeEnabled; 
    
    // 現在日時からユニークなメッセージIDを生成
    const date = new Date();
    const messageId = date.getFullYear().toString().padStart(4, '0') + (date.getMonth() + 1).toString().padStart(2, '0') + date.getDate().toString().padStart(2, '0') + date.getHours().toString().padStart(2, '0') + date.getMinutes().toString().padStart(2, '0') + date.getMilliseconds().toString().padStart(3, '0');

    if (newIsOneCommeEnabled) { // OFF -> ON
        console.log("わんコメ連携を開始");
        // わんコメへ連携開始メッセージを送信
        chrome.storage.local.get("oneCommeStartMessage", (items) => {
            sendToOneComme(messageId, "highchat_extention_user_id", "", false, "Highchat 読み上げ連携", items.oneCommeStartMessage);
        });
        startObserver();
    } else { // ON -> OFF
        console.log("わんコメ連携を停止");
        // わんコメへ連携停止メッセージを送信
        chrome.storage.local.get("oneCommeStopMessage", (items) => {
            sendToOneComme(messageId, "highchat_extention_user_id", "", false, "Highchat 読み上げ連携", items.oneCommeStopMessage);
        });
        stopObserver();
    }
}

// 3. 棒読みちゃんへのテキスト送信（Backgroundへ依頼）
function sendToBouyomi(text) {
    if (!text) return;
    try {
        // textに改行用の特殊文字が含まれている場合、そこでテキストを分割する
        const textList = text.split(REPLACE_TXT_BR);
        textList.forEach(text => {
            chrome.runtime.sendMessage({ action: "sendToBouyomi", text: text });
        });
    } catch (e) {
        console.error("Backgroundへの送信に失敗:", e);
    }
}

// 3. わんコメのテキスト送信（Backgroundへ依頼）
function sendToOneComme(messageId, userId, profileImage, isOwner, name, text) {
    if (!text) return;
    try {
        chrome.runtime.sendMessage({ action: "sendToOneComme", messageId: messageId, userId: userId, profileImage: profileImage, isOwner: isOwner, name: name, text: text });
    } catch (e) {
        console.error("Backgroundへの送信に失敗:", e);
    }
}

// 4. NGワードチェック
function checkNGWord(text) {
    if (!settings.ngWords || settings.ngWords.length === 0) {
        return false;
    }
    for (const ng of settings.ngWords) {
        const word = ng.word;
        switch (ng.type) {
            case 'partial':
                if (text.includes(word)) return true;
                break;
            case 'prefix':
                if (text.startsWith(word)) return true;
                break;
            case 'suffix':
                if (text.endsWith(word)) return true;
                break;
        }
    }
    return false;
}

// 4-2. コメント削除処理
async function deleteComment(liElement) {
    try {
        const header = liElement.querySelector('.highchat_comment__list_header');
        if (!header) return;
        
        const manageLink = Array.from(header.querySelectorAll('small a'))
                              .find(a => a.textContent && a.textContent.includes('管理'));
        if (!manageLink) return;

        manageLink.click();

        let attempts = 0;
        const maxAttempts = 3;
        const delay = 300; 

        for (attempts = 0; attempts < maxAttempts; attempts++) {
            if (attempts > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            console.log(`削除フォームを検索します... (${attempts + 1}/${maxAttempts})`);
            const modalContent = document.getElementById('app_modal_content'); 
            const form = modalContent ? modalContent.querySelector('form[action="/highchat_comment/hide"]') : null;

            if (form) {
                const submitButton = form.querySelector('input[type="submit"]');
                if (submitButton) {
                    submitButton.click();
                    console.log("NGワードコメントを削除しました（submitクリック）。");

                    try {
                        const closeButtonContainer = document.getElementById('app_modal_closebutton');
                        if (closeButtonContainer) {
                            const closeLink = closeButtonContainer.querySelector('a[onclick="modal.close()"]');
                            if (closeLink) {
                                closeLink.click();
                                console.log("モーダルを閉じました。");
                            } else {
                                console.warn("モーダル閉じるリンク (a[onclick='modal.close()']) が見つかりません。");
                            }
                        } else {
                            console.warn("モーダル閉じるボタンのコンテナ (p#app_modal_closebutton) が見つかりません。");
                        }
                    } catch (e) {
                        console.error("モーダルを閉じる処理中にエラー:", e);
                    }
                    
                    return; 
                } else {
                    console.warn("削除フォームは見つかりましたが、送信ボタン(input[type=submit])が見つかりません。");
                }
            }
        }
        console.warn("NGワードを含むチャットの削除に失敗しました。（フォームまたは送信ボタンが見つかりません）");
        alert("NGワードを含むチャットの削除に失敗しました。");

    } catch (e) {
        console.error("コメントの自動削除処理中にエラーが発生しました:", e);
        alert("NGワードを含むチャットの削除に失敗しました。");
    }
}

// 5. 新規コメント処理
async function processNewComment(liElement) {
    if (!(isEnabled || isOneCommeEnabled)) return;

    // 1. コメント本文取得
    const contentElement = liElement.querySelector('p.highchat_comment__content');
    if (!contentElement) return;

    const contentClone = contentElement.cloneNode(true);    //棒読みちゃんに送るNode
    const oneCommeClone = contentElement.cloneNode(true);   //わんコメに送るNode

    // コメント内容がAAかをチェック (class=aaを持つかどうかで判別)
    if (contentElement.classList.contains("aa")) {
        // AAの場合は全文を "(アスキーアート省略)" に変換
        contentClone.textContent = "(アスキーアート省略)";
        oneCommeClone.textContent = "(アスキーアート省略)";
    }

    // わんコメ連携用 後で差し戻すカスタム絵文字ノードリスト
    const oneCommeEmojiNodes = oneCommeClone.querySelectorAll('img.emoji');

    // 特定タグの置換処理
    let aLink = null;
    // 棒読みちゃん連携が有効な場合
    if (isEnabled) {
        // 絵文字置換処理
        // カスタム絵文字をtitleプロパティの値に置換
        const emojis = contentClone.querySelectorAll('img.emoji');
        emojis.forEach(emoji => {
            const title = emoji.getAttribute('title');
            if (title) {
                // <img> タグを "title" というテキストノードに置換する
                const emojiText = document.createTextNode(title);
                emoji.parentNode.replaceChild(emojiText, emoji);
            } else {
                emoji.parentNode.removeChild(emoji);
            }
        });

        // URL置換処理
        aLink = contentClone.querySelectorAll('a');
        aLink.forEach(linkElement => {
            const linkText = linkElement.textContent;
            // URLを検知したら"(URL省略)"に置換
            if (linkText.startsWith("https://") || linkText.startsWith("http://")) {
                linkElement.replaceWith(document.createTextNode('(URL省略)'));
            }
        });

        // <br>タグをあとで置換できるよう特殊文字列に置換
        if (settings.isOneCommeBrEnabled) {
            const brs = contentClone.querySelectorAll('br');
            brs.forEach(br => {
                // <br> タグを "${{highchatBr}}" というテキストノードに置換する
                const replaceBrText = document.createTextNode(REPLACE_TXT_BR);
                br.parentNode.replaceChild(replaceBrText, br);
            });
        }
    }
    // わんコメ連携が有効な場合
    if (isOneCommeEnabled) {
        // カスタム絵文字をあとで置換できるよう特殊文字列に置換（わんコメだけ対応）
        const oneCommeEmojis = oneCommeClone.querySelectorAll('img.emoji');
        oneCommeEmojis.forEach(oneCommeEmoji => {
            const title = oneCommeEmoji.getAttribute('title');
            if (title) {
                // <img> タグを "${{highchatEmoji}}" というテキストノードに置換する
                const replaceText = document.createTextNode(REPLACE_TXT_EMOJI);
                oneCommeEmoji.parentNode.replaceChild(replaceText, oneCommeEmoji);
            } else {
                oneCommeEmoji.parentNode.removeChild(oneCommeEmoji);
            }
        });

        // URL置換処理
        aLink = oneCommeClone.querySelectorAll('a');
        aLink.forEach(linkElement => {
            const linkText = linkElement.textContent;
            // URLを検知したら"(URL省略)"に置換
            if (linkText.startsWith("https://") || linkText.startsWith("http://")) {
                linkElement.replaceWith(document.createTextNode('(URL省略)'));
            }
        });
        // <br>タグをあとで置換できるよう特殊文字列に置換
        if (settings.isOneCommeBrEnabled) {
            const oneCommebrs = oneCommeClone.querySelectorAll('br');
            oneCommebrs.forEach(oneCommeBr => {
                // <br> タグを "${{highchatBr}}" というテキストノードに置換する
                const replaceBrText = document.createTextNode(REPLACE_TXT_BR);
                oneCommeBr.parentNode.replaceChild(replaceBrText, oneCommeBr);
            });
        }
    }    
    
    // チェック用にコメントtextContentを取得
    let commentText = ""; 
    if (isEnabled) {
        commentText = contentClone.textContent.trim();
    } else if (isOneCommeEnabled) {
        commentText = oneCommeClone.textContent.trim();
    }
    
    if (!commentText) return; 

    // 2. NGワードチェック
    const isNG = checkNGWord(commentText);

    if (isNG) {
        // NGコメントを検知した場合
        if (settings.ngActionNoRead) {
            // 読み上げない
        }
        
        // NGコメント自動削除
        if (settings.ngActionDelete) {
            deleteComment(liElement);
        }
    } else {
        // NGワードなし
        let name = "";
        let userId = "";
        let isOwner = false;
        let messageId = "";
        let profileImage = "";
        
        // わんコメ連携が有効の場合
        if (isOneCommeEnabled) {
            // <br>タグをあとで置換できるよう特殊文字列に置換
            if (settings.isOneCommeBrEnabled) {
                const oneCommebrs = oneCommeClone.querySelectorAll('br');
                oneCommebrs.forEach(oneCommeBr => {
                    // <br> タグを "${{highchatBr}}" というテキストノードに置換する
                    const replaceBrText = document.createTextNode(REPLACE_TXT_BR);
                    oneCommeBr.parentNode.replaceChild(replaceBrText, oneCommeBr);
                });
            }
            
            // 絵文字対応のため棒読みちゃんとは異なるTextContentを利用
            let oneCommeText = oneCommeClone.textContent;
            // コメント内にカスタム絵文字が存在する場合は置換処理を行う
            oneCommeEmojiNodes.forEach(oneCommeEmoji => {
                // 置換する<img>タグを文字列として生成する
                const imgSrc = oneCommeEmoji.src;
                const imgTitle = oneCommeEmoji.getAttribute("title");
                // わんコメはaltパラメータを読み上げるので、HighChatでの読み上げ対象であるtitleのプロパティをaltにセットする
                const replaceTag = `<img src="${imgSrc}" alt="${imgTitle}">`;
                // 置換処理（先頭から１つずつ）
                oneCommeText = oneCommeText.replace(REPLACE_TXT_EMOJI, replaceTag);
            });
            // コメント内に<br>置換対象の特殊文字列が存在する場合は置換処理を行う
            oneCommeText = oneCommeText.replaceAll(REPLACE_TXT_BR, " <br>");

            // ユーザー名を取得
            const nameElement = liElement.querySelector('b.highchat_comment__name');
            if (nameElement) {
                name = nameElement.textContent.trim();
            }

            // ユーザーIDを取得（わんコメ用）
            const userIdElement = liElement.querySelector('b.highchat_comment__name a');
            if (userIdElement) {
                userId = userIdElement.getAttribute("href");
                userId = userId.replace("/highchat/user/", "").trim();
                // 配信者本人かを判断
                const streamerElement = document.getElementById("highchat__stream_header__name")
                if (streamerElement) {
                    // 配信者のユーザーIDを取得
                    let streamerId = streamerElement.getAttribute("href");
                    streamerId = streamerId.replace("/highchat/user/", "").trim();
                    // 発言者と配信者のユーザーIDが一致したらオーナーフラグをtrueにする
                    if (userId === streamerId) {
                        isOwner = true;
                    }
                }
            } else {
                // <a>付きユーザー名を取得できない場合はユーザーIDを一括りに匿名ユーザーとする
                userId = USER_ID_ANONYMOUS;
                // ユーザー名が空白の場合
                if (name === "" && settings.oneCommeAnonymous !== "") {
                    name = settings.oneCommeAnonymous;
                }
                // ユーザー名の後方に" (未ログイン)"を付与
                if (settings.oneCommeNotLogin) {
                    name = name + " " + settings.oneCommeNotLogin
                }
            }

            // メッセージIDを取得（わんコメ用）
            messageId = liElement.id;
            // プロフィール画像を取得
            const profileImageElement = liElement.querySelector("div.highchat_comment__icon img");
            if (profileImageElement) {
                // 画像srcを取得
                profileImage = profileImageElement.src;
                // 画像取得の処理を軽減するため?の位置を取得
                const paramIndex = profileImage.indexOf("?");
                // ?以降を削除（変動パラメータを除去してキャッシュを活かす）
                profileImage = profileImage.slice(0, paramIndex);
            } else {
                // アイコンが存在しない場合は固定の画像を指定
                profileImage = "https://ikasekai.com/emoji/ika16.png";
            }

            // わんコメへ送る
            sendToOneComme(messageId, userId, profileImage, isOwner, name, oneCommeText);
        }

        // 棒読みちゃん連携が有効の場合
        if (isEnabled) {
            // 最終出力用テキスト
            let finalTest = contentClone.textContent.trim();

            // 名称を取得する設定の場合は名前を取得
            if (settings.readName) {
                // 名前を取得
                const nameElement = liElement.querySelector('b.highchat_comment__name');
                if (nameElement) {
                    name = nameElement.textContent.trim();
                }
            }
            // 名前と敬称を連結
            if (name && settings.honorific) {
                name += settings.honorific;
            }

            // <br>タグをあとで置換できるよう特殊文字列に置換
            if (settings.isOneCommeBrEnabled) {
                const brs = contentClone.querySelectorAll('br');
                brs.forEach(br => {
                    // <br> タグを "${{highchatBr}}" というテキストノードに置換する
                    const replaceBrText = document.createTextNode(REPLACE_TXT_BR);
                    br.parentNode.replaceChild(replaceBrText, br);
                });
            }

            // 名前とコメントを連結
            if (name) {
                finalTest = name + " " + commentText;
            }

            // 棒読みちゃんへ送る
            sendToBouyomi(finalTest);
        }
        
    }
}

// 6. DOM監視 (MutationObserver)
function startObserver() {
    if (chatListObserver) return; 

    const targetNode = document.querySelector(CHAT_LIST_SELECTOR);
    if (!targetNode) {
        console.warn("チャットリストが見つかりません。監視を開始できません。");
        setTimeout(startObserverIfEnabled, 1000); 
        return;
    }

    chatListObserver = new MutationObserver(async (mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(async node => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'LI') {
                        // コメント欄の子要素に<li>の追加を検知したら処理を実施
                        await processNewComment(node);
                    }
                });
            }
        }
    });

    const config = { childList: true };
    chatListObserver.observe(targetNode, config);
    console.log("チャットリストの監視を開始しました。");
}

function stopObserver() {
    if (chatListObserver) {
        chatListObserver.disconnect();
        chatListObserver = null;
        console.log("チャットリストの監視を停止しました。");
    }
}

// 7. メッセージ受信
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.action === "queryState") {
        sendResponse({ 
            isReading: isEnabled,
            isOneComme: isOneCommeEnabled
        });
        return true; 
    }

    if (request.action === "toggleReading") {
        updateEnabledState(request.value);
        sendResponse({ status: "ok" });
        return true;
    }

    if (request.action === "toggleOneComme") {
        updateOneCommeEnabledState(request.value);
        sendResponse({ status: "ok" });
        return true;
    }
    
    if (request.action === "checkAdminPermission") {
        const buttonArea = document.getElementById('highchat_comment__button');
        const hasPermission = !!(buttonArea && buttonArea.querySelector('a[href="/highchat/stop"]'));
        
        sendResponse({ hasPermission: hasPermission });
        return true;
    }
});

// 8. ユーティリティ (指定要素が表示されるまで待機)
function waitForElement(selector, timeout = 500) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(interval);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(interval);
                reject(new Error(`Element not found: ${selector}`));
            }
        }, 50); // 50msごとにチェック
    });
}

// 監視開始（有効なら）(変更なし)
function startObserverIfEnabled() {
    if(isEnabled) {
        startObserver();
    }
}

// 配信者名をチェックしてローカルの isEnabled を設定
async function checkAndEnableAutoStart() {
    let shouldBeEnabled = false; // デフォルトはOFF

    try {
        const { autoStartStreamerName } = await chrome.storage.local.get({ autoStartStreamerName: "" }); 
        
        if (autoStartStreamerName) {
            const nameElement = await waitForElement('#highchat__stream_header__name', 10000);
            const currentStreamerName = nameElement ? nameElement.textContent.trim() : "";

            if (currentStreamerName === autoStartStreamerName) {
                console.log(`自動開始（配信者名一致: ${currentStreamerName}）。読み上げをONにします。`);
                shouldBeEnabled = true; 
            } else {
                 console.log(`自動開始（配信者名不一致: ${currentStreamerName} / 設定: ${autoStartStreamerName}）。読み上げをOFFにします。`);
            }
        } else {
             console.log("自動開始（配信者名未設定）。読み上げをOFFにします。");
        }
    } catch (e) {
        console.error("自動開始チェック中にエラー（タイムアウト等）:", e.message);
    } 
    
    updateEnabledState(shouldBeEnabled);
}

// 配信者名をチェックしてローカルの isOneCommeEnabled を設定
async function checkAndOneCommeEnableAutoStart() {
    let shouldBeOneCommeEnabled = false; // デフォルトはOFF

    try {
        const { oneCommeAutoStartStreamerName } = await chrome.storage.local.get({ oneCommeAutoStartStreamerName: "" }); 
        
        if (oneCommeAutoStartStreamerName) {
            const nameElement = await waitForElement('#highchat__stream_header__name', 10000);
            const currentStreamerName = nameElement ? nameElement.textContent.trim() : "";

            if (currentStreamerName === oneCommeAutoStartStreamerName) {
                console.log(`自動開始（配信者名一致: ${currentStreamerName}）。わんコメ連携をONにします。`);
                shouldBeOneCommeEnabled = true; 
            } else {
                 console.log(`自動開始（配信者名不一致: ${currentStreamerName} / 設定: ${oneCommeAutoStartStreamerName}）。わんコメ連携をOFFにします。`);
            }
        } else {
             console.log("自動開始（配信者名未設定）。わんコメ連携をOFFにします。");
        }
    } catch (e) {
        console.error("自動開始チェック中にエラー（タイムアウト等）:", e.message);
    } 
    
    updateOneCommeEnabledState(shouldBeOneCommeEnabled);
}

// メイン処理の開始
async function main() {
    try {
        loadAndWatchSettings();
        waitForElement('#highchat__chat_container', 10000)
            .catch((e) => {
                 console.error("チャットコンテナが見つかりません:", e);
            });
        await checkAndEnableAutoStart();
        await checkAndOneCommeEnableAutoStart();
    } catch (e) {
        console.error("拡張機能の初期化に失敗しました:", e);
    }
}

// 実行
main();