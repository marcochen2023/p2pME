// p2pME 主應用程式
class P2PMEApp {
    constructor() {
        this.networkManager = null;
        this.fileTransferManager = null;
        this.blockchainManager = null;
        this.cryptoManager = null;
        this.isInitialized = false;
        this.currentTab = 'files';
        this.logs = [];
        this.maxLogs = 100;

        this.initializeApp();
    }

    // 初始化應用程式
    async initializeApp() {
        try {
            this.showLoading('正在初始化 p2pME...');
            
            // 檢查瀏覽器支援
            if (!Utils.checkWebRTCSupport()) {
                throw new Error('您的瀏覽器不支援 WebRTC');
            }

            // 初始化加密管理器
            this.cryptoManager = new CryptoManager();
            await this.cryptoManager.initialize();

            // 初始化網路管理器
            this.networkManager = new NetworkManager();
            
            // 初始化檔案傳輸管理器
            this.fileTransferManager = new FileTransferManager(this.networkManager);
            
            // 初始化區塊鏈管理器
            this.blockchainManager = new BlockchainManager(this.networkManager, this.cryptoManager);

            // 設置事件監聽器
            this.setupEventListeners();
            
            // 初始化 UI
            this.initializeUI();
            
            this.isInitialized = true;
            this.hideLoading();
            this.showNotification('p2pME 初始化完成！', 'success');
            this.log('應用程式初始化完成');

        } catch (error) {
            this.hideLoading();
            this.showNotification(`初始化失敗: ${error.message}`, 'error');
            this.log(`初始化失敗: ${error.message}`, 'error');
        }
    }

    // 設置事件監聽器
    setupEventListeners() {
        // 網路事件
        this.networkManager.on('connected', () => {
            this.updateConnectionStatus('connected');
            this.showNotification('已連接到信令伺服器', 'success');
        });

        this.networkManager.on('disconnected', () => {
            this.updateConnectionStatus('disconnected');
            this.showNotification('與信令伺服器斷開連接', 'warning');
        });

        this.networkManager.on('peer-connected', (peerId) => {
            this.updatePeerList();
            this.showNotification(`節點 ${Utils.truncateString(peerId, 8)} 已連接`, 'info');
        });

        this.networkManager.on('peer-disconnected', (peerId) => {
            this.updatePeerList();
            this.showNotification(`節點 ${Utils.truncateString(peerId, 8)} 已斷開`, 'info');
        });

        this.networkManager.on('log', (logData) => {
            this.addLog(logData);
        });

        // 檔案傳輸事件
        this.fileTransferManager.on('file-shared', (fileInfo) => {
            this.updateSharedFilesList();
            this.showNotification(`檔案 ${fileInfo.name} 已分享`, 'success');
        });

        this.fileTransferManager.on('file-available', (fileInfo) => {
            this.updateAvailableFilesList();
        });

        this.fileTransferManager.on('download-progress', (data) => {
            this.updateDownloadProgress(data);
        });

        this.fileTransferManager.on('download-completed', (data) => {
            this.showNotification(`檔案 ${data.file.name} 下載完成`, 'success');
            this.updateAvailableFilesList();
        });

        this.fileTransferManager.on('log', (logData) => {
            this.addLog(logData);
        });

        // 區塊鏈事件
        this.blockchainManager.on('block-added', (block) => {
            this.updateBlockchainStatus();
            this.updateBlocksList();
            this.showNotification(`新區塊 #${block.index} 已添加`, 'success');
        });

        this.blockchainManager.on('transaction-submitted', (transaction) => {
            this.updateTransactionsList();
            this.showNotification(`交易 ${Utils.truncateString(transaction.id, 8)} 已提交`, 'info');
        });

        this.blockchainManager.on('leader-changed', (data) => {
            this.updateLeaderStatus(data);
        });

        this.blockchainManager.on('log', (logData) => {
            this.addLog(logData);
        });
    }

    // 初始化 UI
    initializeUI() {
        // 標籤切換
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // 連接控制
        document.getElementById('connectBtn').addEventListener('click', () => {
            this.connectToNetwork();
        });

        document.getElementById('disconnectBtn').addEventListener('click', () => {
            this.disconnectFromNetwork();
        });

        // 檔案分享
        this.setupFileSharing();
        
        // 區塊鏈控制
        this.setupBlockchainControls();
        
        // 節點配置
        this.setupNodeConfiguration();

        // 初始化狀態
        this.updateUI();
    }

    // 設置檔案分享
    setupFileSharing() {
        const fileInput = document.getElementById('fileInput');
        const shareBtn = document.getElementById('shareFileBtn');
        const dropZone = document.getElementById('fileDropZone');

        // 檔案選擇
        shareBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => this.shareFile(file));
        });

        // 拖放功能
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files);
            files.forEach(file => this.shareFile(file));
        });
    }

    // 設置區塊鏈控制
    setupBlockchainControls() {
        const transactionForm = document.getElementById('transactionForm');
        const addPeerBtn = document.getElementById('addWhitelistPeerBtn');

        // 交易表單
        transactionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitTransaction();
        });

        // 添加白名單節點
        addPeerBtn.addEventListener('click', () => {
            this.addWhitelistPeer();
        });
    }

    // 設置節點配置
    setupNodeConfiguration() {
        const regenerateBtn = document.getElementById('regenerateNodeId');
        const copyIdBtn = document.getElementById('copyNodeId');

        regenerateBtn.addEventListener('click', () => {
            this.regenerateNodeId();
        });

        copyIdBtn.addEventListener('click', () => {
            this.copyNodeId();
        });

        // 顯示節點 ID
        this.updateNodeInfo();
    }

    // 連接到網路
    async connectToNetwork() {
        try {
            this.showLoading('正在連接到網路...');
            await this.networkManager.start();
            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            this.showNotification(`連接失敗: ${error.message}`, 'error');
        }
    }

    // 斷開網路連接
    disconnectFromNetwork() {
        this.networkManager.stop();
        this.updateConnectionStatus('disconnected');
    }

    // 分享檔案
    async shareFile(file) {
        try {
            if (!this.isInitialized) {
                throw new Error('應用程式尚未初始化');
            }

            await this.fileTransferManager.shareFile(file);
        } catch (error) {
            this.showNotification(`分享檔案失敗: ${error.message}`, 'error');
        }
    }

    // 下載檔案
    async downloadFile(fileId) {
        try {
            await this.fileTransferManager.requestFile(fileId);
        } catch (error) {
            this.showNotification(`下載檔案失敗: ${error.message}`, 'error');
        }
    }

    // 提交交易
    submitTransaction() {
        try {
            const form = document.getElementById('transactionForm');
            const formData = new FormData(form);
            
            const transaction = this.blockchainManager.createTransaction(
                this.networkManager.nodeId,
                formData.get('to') || 'system',
                formData.get('data'),
                parseFloat(formData.get('amount')) || 0
            );

            this.blockchainManager.submitTransaction(transaction);
            form.reset();
        } catch (error) {
            this.showNotification(`提交交易失敗: ${error.message}`, 'error');
        }
    }

    // 添加白名單節點
    addWhitelistPeer() {
        const peerId = prompt('請輸入節點 ID:');
        if (peerId && peerId.trim()) {
            this.blockchainManager.addWhitelistedPeer(peerId.trim());
            this.updateWhitelistDisplay();
        }
    }

    // 重新生成節點 ID
    regenerateNodeId() {
        if (confirm('確定要重新生成節點 ID 嗎？這將斷開所有連接。')) {
            this.networkManager.regenerateNodeId();
            this.updateNodeInfo();
        }
    }

    // 複製節點 ID
    copyNodeId() {
        Utils.copyToClipboard(this.networkManager.nodeId)
            .then(() => {
                this.showNotification('節點 ID 已複製到剪貼板', 'success');
            })
            .catch(() => {
                this.showNotification('複製失敗', 'error');
            });
    }

    // 切換標籤
    switchTab(tabName) {
        this.currentTab = tabName;
        
        // 更新標籤按鈕
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // 更新內容面板
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`).classList.add('active');
        
        // 更新對應的數據
        this.updateTabContent(tabName);
    }

    // 更新標籤內容
    updateTabContent(tabName) {
        switch (tabName) {
            case 'files':
                this.updateSharedFilesList();
                this.updateAvailableFilesList();
                break;
            case 'blockchain':
                this.updateBlockchainStatus();
                this.updateBlocksList();
                this.updateTransactionsList();
                break;
            case 'network':
                this.updatePeerList();
                this.updateNetworkStats();
                break;
        }
    }

    // 更新 UI
    updateUI() {
        this.updateConnectionStatus();
        this.updateNodeInfo();
        this.updateTabContent(this.currentTab);
    }

    // 更新連接狀態
    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connectionStatus');
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        
        if (!status) {
            status = this.networkManager?.isConnected ? 'connected' : 'disconnected';
        }
        
        statusElement.textContent = status === 'connected' ? '已連接' : '未連接';
        statusElement.className = `status ${status}`;
        
        connectBtn.disabled = status === 'connected';
        disconnectBtn.disabled = status !== 'connected';
    }

    // 更新節點資訊
    updateNodeInfo() {
        if (this.networkManager) {
            document.getElementById('nodeId').textContent = 
                Utils.truncateString(this.networkManager.nodeId, 16);
        }
    }

    // 更新對等節點列表
    updatePeerList() {
        const peerList = document.getElementById('peerList');
        const peerCount = document.getElementById('peerCount');
        
        if (!this.networkManager) return;
        
        const peers = this.networkManager.getConnectedPeers();
        peerCount.textContent = peers.length;
        
        peerList.innerHTML = '';
        peers.forEach(peerId => {
            const peerItem = document.createElement('div');
            peerItem.className = 'peer-item';
            peerItem.innerHTML = `
                <span class="peer-id">${Utils.truncateString(peerId, 12)}</span>
                <span class="peer-status">已連接</span>
            `;
            peerList.appendChild(peerItem);
        });
        
        if (peers.length === 0) {
            peerList.innerHTML = '<div class="empty-state">沒有連接的節點</div>';
        }
    }

    // 更新網路統計
    updateNetworkStats() {
        if (!this.networkManager) return;
        
        const stats = this.networkManager.getNetworkStats();
        document.getElementById('networkStats').innerHTML = `
            <div class="stat-item">
                <span class="stat-label">連接數:</span>
                <span class="stat-value">${stats.connectedPeers}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">發送消息:</span>
                <span class="stat-value">${stats.messagesSent}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">接收消息:</span>
                <span class="stat-value">${stats.messagesReceived}</span>
            </div>
        `;
    }

    // 更新分享檔案列表
    updateSharedFilesList() {
        const filesList = document.getElementById('sharedFilesList');
        
        if (!this.fileTransferManager) return;
        
        const sharedFiles = this.fileTransferManager.getSharedFiles();
        
        filesList.innerHTML = '';
        sharedFiles.forEach(fileInfo => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-name">${fileInfo.name}</div>
                    <div class="file-details">
                        ${Utils.formatFileSize(fileInfo.size)} • 
                        ${fileInfo.downloadCount} 次下載
                    </div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="app.stopSharingFile('${fileInfo.id}')">
                    停止分享
                </button>
            `;
            filesList.appendChild(fileItem);
        });
        
        if (sharedFiles.length === 0) {
            filesList.innerHTML = '<div class="empty-state">沒有分享的檔案</div>';
        }
    }

    // 更新可用檔案列表
    updateAvailableFilesList() {
        const filesList = document.getElementById('availableFilesList');
        
        if (!this.fileTransferManager) return;
        
        const availableFiles = this.fileTransferManager.getAvailableFiles();
        
        filesList.innerHTML = '';
        availableFiles.forEach(fileInfo => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-name">${fileInfo.name}</div>
                    <div class="file-details">
                        ${Utils.formatFileSize(fileInfo.size)} • 
                        來自 ${Utils.truncateString(fileInfo.peerId, 8)}
                    </div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="app.downloadFile('${fileInfo.id}')">
                    下載
                </button>
            `;
            filesList.appendChild(fileItem);
        });
        
        if (availableFiles.length === 0) {
            filesList.innerHTML = '<div class="empty-state">沒有可下載的檔案</div>';
        }
    }

    // 停止分享檔案
    stopSharingFile(fileId) {
        this.fileTransferManager.stopSharingFile(fileId);
        this.updateSharedFilesList();
    }

    // 更新區塊鏈狀態
    updateBlockchainStatus() {
        if (!this.blockchainManager) return;
        
        const status = this.blockchainManager.getBlockchainStatus();
        document.getElementById('blockCount').textContent = status.height;
        
        const blockchainInfo = document.getElementById('blockchainInfo');
        blockchainInfo.innerHTML = `
            <div class="info-item">
                <span class="info-label">區塊高度:</span>
                <span class="info-value">${status.height}</span>
            </div>
            <div class="info-item">
                <span class="info-label">交易池:</span>
                <span class="info-value">${status.mempoolSize}</span>
            </div>
            <div class="info-item">
                <span class="info-label">當前領導者:</span>
                <span class="info-value">${status.currentLeader ? Utils.truncateString(status.currentLeader, 8) : '無'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">我是領導者:</span>
                <span class="info-value">${status.isLeader ? '是' : '否'}</span>
            </div>
        `;
    }

    // 更新領導者狀態
    updateLeaderStatus(data) {
        const leaderStatus = document.getElementById('leaderStatus');
        if (leaderStatus) {
            leaderStatus.textContent = data.isLeader ? '領導者' : '跟隨者';
            leaderStatus.className = `status ${data.isLeader ? 'leader' : 'follower'}`;
        }
    }

    // 更新區塊列表
    updateBlocksList() {
        const blocksList = document.getElementById('blocksList');
        
        if (!this.blockchainManager) return;
        
        const blockchain = this.blockchainManager.blockchain;
        const recentBlocks = blockchain.slice(-10).reverse(); // 最近 10 個區塊
        
        blocksList.innerHTML = '';
        recentBlocks.forEach(block => {
            const blockItem = document.createElement('div');
            blockItem.className = 'block-item';
            blockItem.innerHTML = `
                <div class="block-header">
                    <span class="block-index">#${block.index}</span>
                    <span class="block-time">${Utils.formatTime(block.timestamp)}</span>
                </div>
                <div class="block-hash">${Utils.truncateHash(block.hash)}</div>
                <div class="block-transactions">${block.transactions.length} 筆交易</div>
            `;
            blocksList.appendChild(blockItem);
        });
        
        if (recentBlocks.length === 0) {
            blocksList.innerHTML = '<div class="empty-state">沒有區塊</div>';
        }
    }

    // 更新交易列表
    updateTransactionsList() {
        const transactionsList = document.getElementById('transactionsList');
        
        if (!this.blockchainManager) return;
        
        const mempool = this.blockchainManager.getMempool();
        
        transactionsList.innerHTML = '';
        mempool.forEach(transaction => {
            const txItem = document.createElement('div');
            txItem.className = 'transaction-item';
            txItem.innerHTML = `
                <div class="tx-header">
                    <span class="tx-id">${Utils.truncateString(transaction.id, 8)}</span>
                    <span class="tx-time">${Utils.formatTime(transaction.timestamp)}</span>
                </div>
                <div class="tx-details">
                    從 ${Utils.truncateString(transaction.from, 8)} 
                    到 ${Utils.truncateString(transaction.to, 8)}
                </div>
                <div class="tx-data">${transaction.data}</div>
            `;
            transactionsList.appendChild(txItem);
        });
        
        if (mempool.length === 0) {
            transactionsList.innerHTML = '<div class="empty-state">沒有待處理的交易</div>';
        }
    }

    // 更新白名單顯示
    updateWhitelistDisplay() {
        const whitelistElement = document.getElementById('whitelistPeers');
        
        if (!this.blockchainManager) return;
        
        const whitelist = Array.from(this.blockchainManager.whitelistedPeers);
        
        whitelistElement.innerHTML = '';
        whitelist.forEach(peerId => {
            const peerItem = document.createElement('div');
            peerItem.className = 'whitelist-peer';
            peerItem.innerHTML = `
                <span class="peer-id">${Utils.truncateString(peerId, 12)}</span>
                <button class="btn btn-danger btn-xs" onclick="app.removeWhitelistPeer('${peerId}')">
                    移除
                </button>
            `;
            whitelistElement.appendChild(peerItem);
        });
        
        if (whitelist.length === 0) {
            whitelistElement.innerHTML = '<div class="empty-state">沒有白名單節點</div>';
        }
    }

    // 移除白名單節點
    removeWhitelistPeer(peerId) {
        if (confirm(`確定要移除節點 ${Utils.truncateString(peerId, 8)} 嗎？`)) {
            this.blockchainManager.removeWhitelistedPeer(peerId);
            this.updateWhitelistDisplay();
        }
    }

    // 更新下載進度
    updateDownloadProgress(data) {
        // 這裡可以添加進度條顯示邏輯
        console.log(`下載進度: ${data.progress.toFixed(1)}%`);
    }

    // 添加日誌
    addLog(logData) {
        this.logs.unshift(logData);
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }
        
        this.updateLogDisplay();
    }

    // 更新日誌顯示
    updateLogDisplay() {
        const logContainer = document.getElementById('logContainer');
        if (!logContainer) return;
        
        logContainer.innerHTML = '';
        this.logs.slice(0, 20).forEach(log => { // 只顯示最近 20 條
            const logItem = document.createElement('div');
            logItem.className = `log-item log-${log.level}`;
            logItem.innerHTML = `
                <span class="log-time">${log.timestamp}</span>
                <span class="log-message">${log.message}</span>
            `;
            logContainer.appendChild(logItem);
        });
    }

    // 顯示通知
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // 動畫顯示
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // 自動隱藏
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // 顯示載入中
    showLoading(message = '載入中...') {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.querySelector('.loading-text').textContent = message;
            overlay.classList.remove('hidden');
        }
    }

    // 隱藏載入中
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    // 記錄日誌
    log(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logData = { message: `[App] ${message}`, level, timestamp };
        
        console.log(logData.message);
        this.addLog(logData);
    }
}

// 全域應用程式實例
let app;

// DOM 載入完成後初始化應用程式
document.addEventListener('DOMContentLoaded', () => {
    app = new P2PMEApp();
    window.app = app; // 供全域存取
});