# p2pME - 瀏覽器端點對點連線工具

p2pME 是一個基於瀏覽器的點對點連線工具，讓您可以直接分享檔案和資料，無需帳號、安裝或任何中間伺服器。採用類似比特幣的點對點節點架構，支援檔案傳輸和分散式帳本功能。

## 🌟 功能特色

### 📁 檔案傳輸
- **無伺服器檔案分享**: 直接在瀏覽器間傳輸檔案，無需上傳到任何伺服器
- **拖放支援**: 支援拖放檔案進行分享
- **即時進度**: 實時顯示上傳和下載進度
- **多檔案支援**: 同時分享和下載多個檔案
- **檔案驗證**: 使用 SHA-256 哈希驗證檔案完整性

### 🔗 點對點網路
- **WebRTC 連線**: 使用 WebRTC 技術建立直接的點對點連線
- **自動節點發現**: 透過引導伺服器自動發現和連接其他節點
- **網狀網路**: 建立全網狀的點對點網路拓撲
- **連線管理**: 自動處理節點連接和斷開

### ⛓️ 分散式帳本
- **區塊鏈架構**: 實現類似區塊鏈的分散式帳本系統
- **輪值共識**: 白名單節點輪流擔任領導者出塊
- **交易系統**: 支援自定義交易和資料記錄
- **即時同步**: 所有節點即時同步帳本狀態

### 🔐 安全性
- **加密通訊**: 所有點對點通訊都經過加密
- **數位簽名**: 交易和區塊使用數位簽名驗證
- **白名單機制**: 只有白名單節點可以參與共識
- **資料完整性**: 使用哈希和簽名確保資料完整性

## 🚀 快速開始

### 系統需求
- 現代瀏覽器 (Chrome 60+, Firefox 60+, Safari 12+, Edge 79+)
- Node.js 14+ (用於運行信令伺服器)
- 網路連接

### 安裝步驟

1. **克隆專案**
   ```bash
   git clone https://github.com/your-username/p2pME.git
   cd p2pME
   ```

2. **安裝依賴**
   ```bash
   npm install
   ```

3. **啟動信令伺服器**
   ```bash
   npm start
   ```
   信令伺服器將在 `ws://localhost:8080` 運行

4. **啟動 Web 伺服器**
   
   使用任何 HTTP 伺服器提供靜態檔案，例如：
   
   **使用 Python:**
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   ```
   
   **使用 Node.js (http-server):**
   ```bash
   npx http-server -p 8000
   ```
   
   **使用 PHP:**
   ```bash
   php -S localhost:8000
   ```

5. **開啟應用程式**
   
   在瀏覽器中訪問 `http://localhost:8000`

## 📖 使用說明

### 基本操作

1. **連接網路**
   - 點擊「連接網路」按鈕連接到信令伺服器
   - 等待與其他節點建立連接

2. **分享檔案**
   - 切換到「檔案傳輸」標籤
   - 點擊「選擇檔案」或直接拖放檔案到指定區域
   - 檔案將自動分享給所有連接的節點

3. **下載檔案**
   - 在「可下載檔案」列表中查看其他節點分享的檔案
   - 點擊「下載」按鈕開始下載
   - 下載完成後檔案會自動保存到本地

4. **使用區塊鏈**
   - 切換到「分散式帳本」標籤
   - 在交易表單中輸入資料並提交交易
   - 查看區塊鏈狀態和交易記錄

### 高級功能

#### 白名單管理
1. 在「網路狀態」標籤中找到「白名單節點」區域
2. 點擊「添加節點」輸入其他節點的 ID
3. 只有白名單節點可以參與區塊鏈共識

#### 節點配置
- **節點 ID**: 每個節點都有唯一的 ID，可以複製分享給其他人
- **重新生成 ID**: 可以重新生成節點 ID（會斷開所有連接）

## 🏗️ 架構說明

### 系統架構
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   瀏覽器 A      │    │   瀏覽器 B      │    │   瀏覽器 C      │
│                 │    │                 │    │                 │
│  ┌───────────┐  │    │  ┌───────────┐  │    │  ┌───────────┐  │
│  │  p2pME    │  │    │  │  p2pME    │  │    │  │  p2pME    │  │
│  │  應用程式  │  │    │  │  應用程式  │  │    │  │  應用程式  │  │
│  └───────────┘  │    │  └───────────┘  │    │  └───────────┘  │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │         WebRTC P2P 連線                     │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   信令伺服器     │
                    │  (Node.js +     │
                    │   WebSocket)    │
                    └─────────────────┘
```

### 核心模組

1. **NetworkManager** (`network.js`)
   - 管理 WebRTC 連線
   - 處理信令交換
   - 維護節點列表

2. **FileTransferManager** (`fileTransfer.js`)
   - 處理檔案分享和下載
   - 管理檔案分塊傳輸
   - 追蹤傳輸進度

3. **BlockchainManager** (`blockchain.js`)
   - 實現區塊鏈邏輯
   - 管理共識機制
   - 處理交易和區塊

4. **CryptoManager** (`crypto.js`)
   - 提供加密功能
   - 處理數位簽名
   - 計算哈希值

5. **Utils** (`utils.js`)
   - 通用工具函數
   - 事件處理
   - 格式化功能

## 🔧 配置選項

### 網路配置
```javascript
// 在 network.js 中修改
const config = {
    signalingServer: 'ws://localhost:8080',
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ],
    heartbeatInterval: 30000,
    reconnectDelay: 5000
};
```

### 檔案傳輸配置
```javascript
// 在 fileTransfer.js 中修改
const config = {
    chunkSize: 64 * 1024,        // 64KB 分塊大小
    maxConcurrentTransfers: 3,    // 最大同時傳輸數
    maxFileSize: 100 * 1024 * 1024 // 100MB 檔案大小限制
};
```

### 區塊鏈配置
```javascript
// 在 blockchain.js 中修改
const config = {
    leaderRotationInterval: 30000, // 30秒領導者輪換
    blockTime: 10000,             // 10秒出塊時間
    maxTransactionsPerBlock: 10,   // 每個區塊最大交易數
    minVotes: 1                   // 最少投票數
};
```

## 🛠️ 開發指南

### 專案結構
```
p2pME/
├── index.html              # 主頁面
├── styles.css             # 樣式表
├── js/
│   ├── app.js            # 主應用程式
│   ├── network.js        # 網路管理
│   ├── fileTransfer.js   # 檔案傳輸
│   ├── blockchain.js     # 區塊鏈管理
│   ├── crypto.js         # 加密功能
│   └── utils.js          # 工具函數
├── signaling-server.js    # 信令伺服器
├── package.json          # Node.js 依賴
└── README.md            # 說明文檔
```

### 添加新功能

1. **擴展網路協議**
   ```javascript
   // 在 network.js 中添加新的消息類型
   handleMessage(peerId, message) {
       switch (message.type) {
           case 'your-new-message-type':
               this.handleYourNewMessage(peerId, message);
               break;
       }
   }
   ```

2. **添加新的交易類型**
   ```javascript
   // 在 blockchain.js 中擴展交易驗證
   validateTransaction(transaction) {
       // 添加您的驗證邏輯
       return true;
   }
   ```

3. **自定義 UI 組件**
   ```javascript
   // 在 app.js 中添加新的 UI 更新方法
   updateYourNewComponent() {
       // 更新 UI 邏輯
   }
   ```

## 🔍 故障排除

### 常見問題

1. **無法連接到信令伺服器**
   - 確認信令伺服器正在運行 (`npm start`)
   - 檢查防火牆設置
   - 確認 WebSocket 連接地址正確

2. **WebRTC 連線失敗**
   - 檢查網路連接
   - 確認瀏覽器支援 WebRTC
   - 嘗試使用不同的 STUN 伺服器

3. **檔案傳輸中斷**
   - 檢查網路穩定性
   - 確認檔案大小未超過限制
   - 重新建立節點連接

4. **區塊鏈同步問題**
   - 確認節點在白名單中
   - 檢查系統時間同步
   - 重新啟動應用程式

### 調試模式

開啟瀏覽器開發者工具查看詳細日誌：
```javascript
// 在控制台中啟用詳細日誌
localStorage.setItem('p2pme-debug', 'true');
location.reload();
```

## 🤝 貢獻指南

歡迎貢獻代碼！請遵循以下步驟：

1. Fork 專案
2. 創建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

### 代碼規範
- 使用 ES6+ 語法
- 遵循現有的代碼風格
- 添加適當的註釋
- 確保所有功能都有錯誤處理

## 📄 授權條款

本專案採用 MIT 授權條款 - 詳見 [LICENSE](LICENSE) 檔案

## 🙏 致謝

- [WebRTC](https://webrtc.org/) - 點對點通訊技術
- [simple-peer](https://github.com/feross/simple-peer) - WebRTC 封裝庫
- [CryptoJS](https://cryptojs.gitbook.io/) - JavaScript 加密庫

## 📞 聯絡方式

如有問題或建議，請：
- 開啟 [Issue](https://github.com/your-username/p2pME/issues)
- 發送郵件至 your-email@example.com

---

**p2pME** - 讓點對點連線變得簡單！ 🚀