// 分散式帳本和區塊鏈管理模組
class BlockchainManager {
    constructor(networkManager, cryptoManager) {
        this.networkManager = networkManager;
        this.crypto = cryptoManager;
        this.blockchain = [];
        this.mempool = new Map(); // 交易池
        this.whitelistedPeers = new Set(); // 白名單節點
        this.currentLeader = null;
        this.leaderRotationInterval = 30000; // 30秒輪換
        this.blockTime = 10000; // 10秒出塊時間
        this.eventEmitter = Utils.createEventEmitter();
        this.isLeader = false;
        this.leaderTimer = null;
        this.blockTimer = null;
        this.consensusState = 'idle'; // idle, proposing, voting
        this.pendingBlock = null;
        this.votes = new Map(); // blockHash -> votes
        this.minVotes = 1; // 最少需要的投票數

        this.setupEventHandlers();
        this.initializeBlockchain();
    }

    setupEventHandlers() {
        // 監聽網路事件
        this.networkManager.on('transaction', this.handleTransaction.bind(this));
        this.networkManager.on('block-proposal', this.handleBlockProposal.bind(this));
        this.networkManager.on('block-vote', this.handleBlockVote.bind(this));
        this.networkManager.on('blockchain-sync', this.handleBlockchainSync.bind(this));
        this.networkManager.on('peer-connected', this.handlePeerConnected.bind(this));
        this.networkManager.on('peer-disconnected', this.handlePeerDisconnected.bind(this));
        this.networkManager.on('leader-announcement', this.handleLeaderAnnouncement.bind(this));
    }

    // 初始化區塊鏈
    initializeBlockchain() {
        if (this.blockchain.length === 0) {
            const genesisBlock = this.createGenesisBlock();
            this.blockchain.push(genesisBlock);
            this.log('創建創世區塊');
        }
        
        // 開始領導者輪換
        this.startLeaderRotation();
    }

    // 創建創世區塊
    createGenesisBlock() {
        return {
            index: 0,
            timestamp: Date.now(),
            transactions: [],
            previousHash: '0',
            hash: this.crypto.calculateHash('genesis'),
            nonce: 0,
            author: 'genesis',
            signature: null
        };
    }

    // 添加白名單節點
    addWhitelistedPeer(peerId) {
        this.whitelistedPeers.add(peerId);
        this.log(`添加白名單節點: ${peerId}`);
        this.eventEmitter.emit('whitelist-updated', Array.from(this.whitelistedPeers));
    }

    // 移除白名單節點
    removeWhitelistedPeer(peerId) {
        this.whitelistedPeers.delete(peerId);
        this.log(`移除白名單節點: ${peerId}`);
        this.eventEmitter.emit('whitelist-updated', Array.from(this.whitelistedPeers));
    }

    // 檢查是否為白名單節點
    isWhitelistedPeer(peerId) {
        return this.whitelistedPeers.has(peerId);
    }

    // 開始領導者輪換
    startLeaderRotation() {
        this.updateLeader();
        this.leaderTimer = setInterval(() => {
            this.updateLeader();
        }, this.leaderRotationInterval);
    }

    // 更新領導者
    updateLeader() {
        const whitelistedArray = Array.from(this.whitelistedPeers);
        if (whitelistedArray.length === 0) {
            this.currentLeader = null;
            this.isLeader = false;
            return;
        }

        // 基於時間戳和區塊高度計算領導者
        const blockHeight = this.blockchain.length;
        const timeSlot = Math.floor(Date.now() / this.leaderRotationInterval);
        const leaderIndex = (blockHeight + timeSlot) % whitelistedArray.length;
        
        const newLeader = whitelistedArray[leaderIndex];
        const wasLeader = this.isLeader;
        
        this.currentLeader = newLeader;
        this.isLeader = (newLeader === this.networkManager.nodeId);

        if (this.isLeader && !wasLeader) {
            this.log('成為領導者，開始出塊');
            this.startBlockProduction();
            this.announceLeadership();
        } else if (!this.isLeader && wasLeader) {
            this.log('不再是領導者，停止出塊');
            this.stopBlockProduction();
        }

        this.eventEmitter.emit('leader-changed', {
            leader: this.currentLeader,
            isLeader: this.isLeader
        });
    }

    // 宣布領導權
    announceLeadership() {
        this.networkManager.broadcast({
            type: 'leader-announcement',
            leader: this.networkManager.nodeId,
            blockHeight: this.blockchain.length,
            timestamp: Date.now()
        });
    }

    // 處理領導者宣布
    handleLeaderAnnouncement(data) {
        const { peerId, leader, blockHeight, timestamp } = data;
        
        if (this.isWhitelistedPeer(leader) && blockHeight >= this.blockchain.length) {
            this.currentLeader = leader;
            this.isLeader = (leader === this.networkManager.nodeId);
            
            this.eventEmitter.emit('leader-changed', {
                leader: this.currentLeader,
                isLeader: this.isLeader
            });
        }
    }

    // 開始出塊
    startBlockProduction() {
        if (this.blockTimer) {
            clearInterval(this.blockTimer);
        }

        this.blockTimer = setInterval(() => {
            if (this.isLeader && this.consensusState === 'idle') {
                this.proposeBlock();
            }
        }, this.blockTime);
    }

    // 停止出塊
    stopBlockProduction() {
        if (this.blockTimer) {
            clearInterval(this.blockTimer);
            this.blockTimer = null;
        }
    }

    // 創建交易
    createTransaction(from, to, data, amount = 0) {
        const transaction = {
            id: Utils.generateUUID(),
            from: from,
            to: to,
            data: data,
            amount: amount,
            timestamp: Date.now(),
            signature: null
        };

        // 簽名交易
        if (from === this.networkManager.nodeId) {
            transaction.signature = this.crypto.signData(JSON.stringify({
                from: transaction.from,
                to: transaction.to,
                data: transaction.data,
                amount: transaction.amount,
                timestamp: transaction.timestamp
            }));
        }

        return transaction;
    }

    // 提交交易
    submitTransaction(transaction) {
        // 驗證交易
        if (!this.validateTransaction(transaction)) {
            throw new Error('無效的交易');
        }

        // 添加到交易池
        this.mempool.set(transaction.id, transaction);
        
        // 廣播交易
        this.networkManager.broadcast({
            type: 'transaction',
            transaction: transaction
        });

        this.eventEmitter.emit('transaction-submitted', transaction);
        this.log(`提交交易: ${transaction.id}`);
        
        return transaction.id;
    }

    // 處理接收到的交易
    handleTransaction(data) {
        const { peerId, transaction } = data;
        
        // 驗證交易
        if (!this.validateTransaction(transaction)) {
            this.log(`收到無效交易: ${transaction.id}`, 'warning');
            return;
        }

        // 檢查是否已存在
        if (this.mempool.has(transaction.id)) {
            return;
        }

        // 添加到交易池
        this.mempool.set(transaction.id, transaction);
        this.eventEmitter.emit('transaction-received', transaction);
        this.log(`收到交易: ${transaction.id} 來自 ${peerId}`);
    }

    // 驗證交易
    validateTransaction(transaction) {
        try {
            // 檢查必要欄位
            if (!transaction.id || !transaction.from || !transaction.timestamp) {
                return false;
            }

            // 檢查簽名（如果有）
            if (transaction.signature) {
                const dataToVerify = JSON.stringify({
                    from: transaction.from,
                    to: transaction.to,
                    data: transaction.data,
                    amount: transaction.amount,
                    timestamp: transaction.timestamp
                });
                
                return this.crypto.verifySignature(dataToVerify, transaction.signature, transaction.from);
            }

            return true;
        } catch (error) {
            this.log(`交易驗證失敗: ${error.message}`, 'error');
            return false;
        }
    }

    // 提議新區塊
    async proposeBlock() {
        if (this.consensusState !== 'idle') {
            return;
        }

        this.consensusState = 'proposing';
        
        try {
            // 從交易池選擇交易
            const transactions = Array.from(this.mempool.values()).slice(0, 10);
            
            // 創建新區塊
            const previousBlock = this.blockchain[this.blockchain.length - 1];
            const newBlock = {
                index: previousBlock.index + 1,
                timestamp: Date.now(),
                transactions: transactions,
                previousHash: previousBlock.hash,
                hash: null,
                nonce: 0,
                author: this.networkManager.nodeId,
                signature: null
            };

            // 計算區塊哈希
            newBlock.hash = this.calculateBlockHash(newBlock);
            
            // 簽名區塊
            newBlock.signature = this.crypto.signData(newBlock.hash);

            this.pendingBlock = newBlock;
            this.votes.clear();

            // 廣播區塊提議
            this.networkManager.broadcast({
                type: 'block-proposal',
                block: newBlock
            });

            this.log(`提議新區塊 #${newBlock.index}，包含 ${transactions.length} 筆交易`);
            
            // 自動投票給自己的區塊
            this.voteForBlock(newBlock.hash, true);
            
            // 設置投票超時
            setTimeout(() => {
                if (this.consensusState === 'proposing') {
                    this.finalizeBlock();
                }
            }, 5000); // 5秒投票時間

        } catch (error) {
            this.log(`提議區塊失敗: ${error.message}`, 'error');
            this.consensusState = 'idle';
        }
    }

    // 處理區塊提議
    handleBlockProposal(data) {
        const { peerId, block } = data;
        
        // 檢查是否來自當前領導者
        if (peerId !== this.currentLeader) {
            this.log(`收到非領導者的區塊提議: ${peerId}`, 'warning');
            return;
        }

        // 驗證區塊
        if (!this.validateBlock(block)) {
            this.log(`收到無效區塊提議: ${block.hash}`, 'warning');
            this.voteForBlock(block.hash, false);
            return;
        }

        this.log(`收到區塊提議 #${block.index} 來自領導者 ${peerId}`);
        
        // 投票
        this.voteForBlock(block.hash, true);
    }

    // 投票
    voteForBlock(blockHash, approve) {
        const vote = {
            blockHash: blockHash,
            voter: this.networkManager.nodeId,
            approve: approve,
            timestamp: Date.now()
        };

        // 廣播投票
        this.networkManager.broadcast({
            type: 'block-vote',
            vote: vote
        });

        // 記錄自己的投票
        this.recordVote(vote);
    }

    // 處理投票
    handleBlockVote(data) {
        const { peerId, vote } = data;
        
        // 檢查是否為白名單節點
        if (!this.isWhitelistedPeer(peerId)) {
            return;
        }

        this.recordVote(vote);
    }

    // 記錄投票
    recordVote(vote) {
        if (!this.votes.has(vote.blockHash)) {
            this.votes.set(vote.blockHash, new Map());
        }

        const blockVotes = this.votes.get(vote.blockHash);
        blockVotes.set(vote.voter, vote);

        this.log(`收到投票: ${vote.voter} ${vote.approve ? '贊成' : '反對'} ${Utils.truncateHash(vote.blockHash)}`);
    }

    // 完成區塊
    finalizeBlock() {
        if (!this.pendingBlock) {
            this.consensusState = 'idle';
            return;
        }

        const blockVotes = this.votes.get(this.pendingBlock.hash);
        if (!blockVotes) {
            this.consensusState = 'idle';
            return;
        }

        // 計算投票結果
        let approveCount = 0;
        let rejectCount = 0;
        
        for (const vote of blockVotes.values()) {
            if (vote.approve) {
                approveCount++;
            } else {
                rejectCount++;
            }
        }

        const totalVotes = approveCount + rejectCount;
        const requiredVotes = Math.max(this.minVotes, Math.ceil(this.whitelistedPeers.size / 2));

        this.log(`區塊投票結果: ${approveCount} 贊成, ${rejectCount} 反對 (需要 ${requiredVotes} 票)`);

        // 檢查是否達到共識
        if (approveCount >= requiredVotes) {
            this.addBlock(this.pendingBlock);
        } else {
            this.log('區塊被拒絕，未達到共識');
        }

        this.pendingBlock = null;
        this.consensusState = 'idle';
    }

    // 添加區塊到鏈
    addBlock(block) {
        // 最終驗證
        if (!this.validateBlock(block)) {
            this.log(`無法添加無效區塊: ${block.hash}`, 'error');
            return false;
        }

        // 添加到區塊鏈
        this.blockchain.push(block);
        
        // 從交易池移除已確認的交易
        for (const transaction of block.transactions) {
            this.mempool.delete(transaction.id);
        }

        this.eventEmitter.emit('block-added', block);
        this.log(`添加新區塊 #${block.index}，哈希: ${Utils.truncateHash(block.hash)}`);
        
        // 廣播新區塊
        this.networkManager.broadcast({
            type: 'new-block',
            block: block
        });

        return true;
    }

    // 驗證區塊
    validateBlock(block) {
        try {
            // 檢查基本結構
            if (!block.index || !block.timestamp || !block.hash || !block.previousHash) {
                return false;
            }

            // 檢查區塊索引
            const expectedIndex = this.blockchain.length;
            if (block.index !== expectedIndex) {
                return false;
            }

            // 檢查前一個區塊哈希
            const previousBlock = this.blockchain[this.blockchain.length - 1];
            if (block.previousHash !== previousBlock.hash) {
                return false;
            }

            // 檢查區塊哈希
            const calculatedHash = this.calculateBlockHash(block);
            if (block.hash !== calculatedHash) {
                return false;
            }

            // 檢查簽名
            if (block.signature && !this.crypto.verifySignature(block.hash, block.signature, block.author)) {
                return false;
            }

            // 驗證交易
            for (const transaction of block.transactions) {
                if (!this.validateTransaction(transaction)) {
                    return false;
                }
            }

            return true;
        } catch (error) {
            this.log(`區塊驗證失敗: ${error.message}`, 'error');
            return false;
        }
    }

    // 計算區塊哈希
    calculateBlockHash(block) {
        const blockData = {
            index: block.index,
            timestamp: block.timestamp,
            transactions: block.transactions,
            previousHash: block.previousHash,
            nonce: block.nonce,
            author: block.author
        };
        
        return this.crypto.calculateHash(JSON.stringify(blockData));
    }

    // 同步區塊鏈
    syncBlockchain(peerId) {
        const request = {
            type: 'blockchain-sync-request',
            fromIndex: this.blockchain.length,
            requestId: Utils.generateUUID()
        };

        this.networkManager.sendToPeer(peerId, request);
        this.log(`請求同步區塊鏈，從索引 ${this.blockchain.length} 開始`);
    }

    // 處理區塊鏈同步
    handleBlockchainSync(data) {
        const { peerId, type } = data;

        if (type === 'blockchain-sync-request') {
            this.handleSyncRequest(peerId, data);
        } else if (type === 'blockchain-sync-response') {
            this.handleSyncResponse(peerId, data);
        }
    }

    // 處理同步請求
    handleSyncRequest(peerId, data) {
        const { fromIndex, requestId } = data;
        
        const blocksToSend = this.blockchain.slice(fromIndex);
        
        this.networkManager.sendToPeer(peerId, {
            type: 'blockchain-sync-response',
            requestId: requestId,
            blocks: blocksToSend,
            totalBlocks: this.blockchain.length
        });

        this.log(`發送 ${blocksToSend.length} 個區塊給 ${peerId}`);
    }

    // 處理同步回應
    handleSyncResponse(peerId, data) {
        const { blocks, totalBlocks } = data;
        
        let addedBlocks = 0;
        for (const block of blocks) {
            if (this.validateBlock(block)) {
                this.blockchain.push(block);
                addedBlocks++;
                
                // 從交易池移除已確認的交易
                for (const transaction of block.transactions) {
                    this.mempool.delete(transaction.id);
                }
            }
        }

        if (addedBlocks > 0) {
            this.log(`同步了 ${addedBlocks} 個區塊，當前高度: ${this.blockchain.length}`);
            this.eventEmitter.emit('blockchain-synced', {
                addedBlocks,
                currentHeight: this.blockchain.length
            });
        }
    }

    // 處理節點連接
    handlePeerConnected(peerId) {
        // 如果是白名單節點，請求同步
        if (this.isWhitelistedPeer(peerId)) {
            setTimeout(() => {
                this.syncBlockchain(peerId);
            }, 1000);
        }
    }

    // 處理節點斷開
    handlePeerDisconnected(peerId) {
        // 如果斷開的是當前領導者，重新選舉
        if (peerId === this.currentLeader) {
            this.updateLeader();
        }
    }

    // 獲取區塊鏈狀態
    getBlockchainStatus() {
        return {
            height: this.blockchain.length,
            latestBlock: this.blockchain[this.blockchain.length - 1],
            mempoolSize: this.mempool.size,
            whitelistedPeers: Array.from(this.whitelistedPeers),
            currentLeader: this.currentLeader,
            isLeader: this.isLeader,
            consensusState: this.consensusState
        };
    }

    // 獲取區塊
    getBlock(index) {
        return this.blockchain[index];
    }

    // 獲取交易池
    getMempool() {
        return Array.from(this.mempool.values());
    }

    // 搜索交易
    findTransaction(transactionId) {
        // 在區塊鏈中搜索
        for (const block of this.blockchain) {
            for (const transaction of block.transactions) {
                if (transaction.id === transactionId) {
                    return { transaction, block };
                }
            }
        }

        // 在交易池中搜索
        const mempoolTx = this.mempool.get(transactionId);
        if (mempoolTx) {
            return { transaction: mempoolTx, block: null };
        }

        return null;
    }

    // 事件監聽
    on(event, callback) {
        this.eventEmitter.on(event, callback);
    }

    off(event, callback) {
        this.eventEmitter.off(event, callback);
    }

    // 清理資源
    destroy() {
        if (this.leaderTimer) {
            clearInterval(this.leaderTimer);
        }
        if (this.blockTimer) {
            clearInterval(this.blockTimer);
        }
    }

    // 日誌記錄
    log(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[Blockchain] ${message}`;
        
        console.log(logMessage);
        this.eventEmitter.emit('log', { message: logMessage, level, timestamp });
    }
}

// 導出區塊鏈管理器
window.BlockchainManager = BlockchainManager;