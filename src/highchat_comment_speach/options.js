// 設定のデフォルト値（NGワードリストのみ）
const defaultNgSettings = {
    ngWords: [] // {word: "string", type: "partial" | "prefix" | "suffix"}
};


// 設定をフォームに読み込む
function loadOptions() {
    // NGワードリストのみ取得・反映
    chrome.storage.local.get(defaultNgSettings, (items) => {
        renderNgWordList(items.ngWords);
    });
}

// NGワードリストを描画
function renderNgWordList(ngWords = []) {
    const listElement = document.getElementById('ngWordList');
    listElement.innerHTML = '';
    
    ngWords.forEach((item, index) => {
        const li = document.createElement('li');
        
        let typeText = "";
        switch(item.type) {
            case "partial": typeText = "部分一致"; break;
            case "prefix": typeText = "前方一致"; break;
            case "suffix": typeText = "後方一致"; break;
        }
        
        li.innerHTML = `
            <span><strong>${item.word}</strong> (${typeText})</span>
            <button data-index="${index}" class="deleteNgWord">削除</button>
        `;
        listElement.appendChild(li);
    });

    // 削除ボタンにイベントリスナーを追加
    document.querySelectorAll('.deleteNgWord').forEach(button => {
        button.addEventListener('click', deleteNgWord);
    });
}

// NGワードを追加
function addNgWord() {
    const wordInput = document.getElementById('ngWordInput');
    const type = document.getElementById('ngMatchType').value;
    const word = wordInput.value.trim();

    if (!word) return;

    chrome.storage.local.get({ ngWords: [] }, (items) => {
        const ngWords = items.ngWords;
        
        // 重複チェック
        const exists = ngWords.some(item => item.word === word && item.type === type);
        
        if (exists) {
            alert("このNGワードはすでに登録されています");
            return; // 登録しない
        }
        
        // 重複がない場合のみ追加
        ngWords.push({ word, type });
        chrome.storage.local.set({ ngWords }, () => {
            renderNgWordList(ngWords); // 即時反映
            wordInput.value = ''; // 入力欄をクリア
        });
    });
}

// NGワードを削除
function deleteNgWord(event) {
    const index = parseInt(event.target.dataset.index, 10);
    chrome.storage.local.get({ ngWords: [] }, (items) => {
        const ngWords = items.ngWords;
        ngWords.splice(index, 1); // 該当インデックスを削除
        chrome.storage.local.set({ ngWords }, () => {
            renderNgWordList(ngWords);
        });
    });
}

// イベントリスナーを設定
document.addEventListener('DOMContentLoaded', loadOptions);

// NGワード追加ボタン
document.getElementById('addNgWord').addEventListener('click', addNgWord);