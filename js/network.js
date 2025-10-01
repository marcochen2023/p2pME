// 網路管理模組
class NetworkManager {
    constructor() {
        this.nodeId = Utils.generateId(16);
        this.peers = new Map();
        this.isRunning = false;
        this.eventEmitter = Utils.createEventEmitter();
        this.signalingServer = null;
        this.messageHandlers = new Map();
        this.connectionAttempts = new Map();
        this.maxRetries = 3;
        
        // WebRTC 配置
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        this.setupMessageHandlers();
    }

    // 設置訊息處理器
    setupMessageHandlers() {
        this.messageHandlers.set('file-offer', this.handleFileOffer.bind(this));
        this.messageHandlers.set('file-request', this.handleFileRequest.bind(this));
        this.messageHandlers.set('transaction', this.handleTransaction.bind(this));
        this.messageHandlers.set('block', this.handleBlock.bind(this));
        this.messageHandlers.set('blockchain-sync', this.handleBlockchainSync.bind(this));
        this.messageHandlers.set('peer-list', this.handlePeerList.bind(this));
        this.messageHandlers.set('ping', this.handlePing.bind(this));
        this.messageHandlers.set('pong', this.handlePong.bind(this));
    }

    // 啟動節點
    async startNode() {
        if (this.isRunning) return;

        try {
            this.log('正在啟動節點...', 'info');
            
            // 連接到信令伺服器
            await this.connectToSignalingServer();
            
            this.isRunning = true;
            this.eventEmitter.emit('node-started');
            this.log(`節點已啟動，ID: ${this.nodeId}`, 'info');
            
            // 開始心跳檢測
            this.startHeartbeat();
            
        } catch (error) {
            this.log(`啟動節點失敗: ${error.message}`, 'error');
            throw error;
        }
    }

    // 停止節點
    async stopNode() {
        if (!this.isRunning) return;

        this.log('正在停止節點...', 'info');
        
        // 關閉所有連線
        for (const [peerId, peer] of this.peers) {
            this.disconnectPeer(peerId);
        }

        // 關閉信令伺服器連線
        if (this.signalingServer) {
            this.signalingServer.close();
            this.signalingServer = null;
        }

        this.isRunning = false;
        this.eventEmitter.emit('node-stopped');
        this.log('節點已停止', 'info');
    }

    // 連接到信令伺服器
    async connectToSignalingServer() {
        return new Promise((resolve, reject) => {
            // 使用 WebSocket 連接到本地信令伺服器
            const wsUrl = `ws://localhost:8081`;
            this.signalingServer = new WebSocket(wsUrl);

            this.signalingServer.onopen = () => {
                this.log('已連接到信令伺服器', 'info');
                
                // 註冊節點
                this.signalingServer.send(JSON.stringify({
                    type: 'register',
                    nodeId: this.nodeId
                }));
                
                resolve();
            };

            this.signalingServer.onmessage = (event) => {
                this.handleSignalingMessage(JSON.parse(event.data));
            };

            this.signalingServer.onclose = () => {
                this.log('信令伺服器連線已關閉', 'warning');
                if (this.isRunning) {
                    // 嘗試重新連接
                    setTimeout(() => this.connectToSignalingServer(), 5000);
                }
            };

            this.signalingServer.onerror = (error) => {
                this.log('信令伺服器連線錯誤', 'error');
                reject(error);
            };

            // 超時處理
            setTimeout(() => {
                if (this.signalingServer.readyState !== WebSocket.OPEN) {
                    reject(new Error('信令伺服器連線超時'));
                }
            }, 10000);
        });
    }

    // 處理信令訊息
    async handleSignalingMessage(message) {
        switch (message.type) {
            case 'peer-list':
                await this.handlePeerListFromSignaling(message.peers);
                break;
            case 'offer':
                await this.handleOffer(message);
                break;
            case 'answer':
                await this.handleAnswer(message);
                break;
            case 'ice-candidate':
                await this.handleIceCandidate(message);
                break;
            case 'peer-joined':
                this.log(`新節點加入: ${message.nodeId}`, 'info');
                await this.connectToPeer(message.nodeId);
                break;
            case 'peer-left':
                this.log(`節點離開: ${message.nodeId}`, 'info');
                this.disconnectPeer(message.nodeId);
                break;
        }
    }

    // 處理來自信令伺服器的節點列表
    async handlePeerListFromSignaling(peerList) {
        for (const peerId of peerList) {
            if (peerId !== this.nodeId && !this.peers.has(peerId)) {
                await this.connectToPeer(peerId);
            }
        }
    }

    // 連接到指定節點
    async connectToPeer(peerId) {
        if (this.peers.has(peerId) || peerId === this.nodeId) return;

        const attemptKey = `${this.nodeId}-${peerId}`;
        if (this.connectionAttempts.has(attemptKey)) return;

        this.connectionAttempts.set(attemptKey, true);

        try {
            this.log(`正在連接到節點: ${peerId}`, 'info');
            
            const peer = new SimplePeer({
                initiator: this.nodeId > peerId, // 避免雙向連接
                trickle: false,
                config: this.rtcConfig
            });

            this.setupPeerEvents(peer, peerId);
            this.peers.set(peerId, peer);

            // 如果是發起者，創建 offer
            if (peer.initiator) {
                peer.on('signal', (data) => {
                    this.signalingServer.send(JSON.stringify({
                        type: 'offer',
                        from: this.nodeId,
                        to: peerId,
                        signal: data
                    }));
                });
            }

        } catch (error) {
            this.log(`連接節點 ${peerId} 失敗: ${error.message}`, 'error');
            this.connectionAttempts.delete(attemptKey);
        }
    }

    // 設置節點事件
    setupPeerEvents(peer, peerId) {
        peer.on('connect', () => {
            this.log(`已連接到節點: ${peerId}`, 'info');
            this.eventEmitter.emit('peer-connected', peerId);
            this.connectionAttempts.delete(`${this.nodeId}-${peerId}`);
            
            // 發送初始同步請求
            this.sendToPeer(peerId, {
                type: 'blockchain-sync',
                request: 'get-latest-block'
            });
        });

        peer.on('data', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handlePeerMessage(peerId, message);
            } catch (error) {
                this.log(`解析來自 ${peerId} 的訊息失敗: ${error.message}`, 'error');
            }
        });

        peer.on('close', () => {
            this.log(`與節點 ${peerId} 的連線已關閉`, 'warning');
            this.peers.delete(peerId);
            this.eventEmitter.emit('peer-disconnected', peerId);
        });

        peer.on('error', (error) => {
            this.log(`與節點 ${peerId} 的連線錯誤: ${error.message}`, 'error');
            this.peers.delete(peerId);
            this.connectionAttempts.delete(`${this.nodeId}-${peerId}`);
        });
    }

    // 處理 WebRTC offer
    async handleOffer(message) {
        if (message.to !== this.nodeId) return;

        try {
            let peer = this.peers.get(message.from);
            
            if (!peer) {
                peer = new SimplePeer({
                    initiator: false,
                    trickle: false,
                    config: this.rtcConfig
                });
                
                this.setupPeerEvents(peer, message.from);
                this.peers.set(message.from, peer);
            }

            peer.signal(message.signal);

            peer.on('signal', (data) => {
                this.signalingServer.send(JSON.stringify({
                    type: 'answer',
                    from: this.nodeId,
                    to: message.from,
                    signal: data
                }));
            });

        } catch (error) {
            this.log(`處理 offer 失敗: ${error.message}`, 'error');
        }
    }

    // 處理 WebRTC answer
    async handleAnswer(message) {
        if (message.to !== this.nodeId) return;

        try {
            const peer = this.peers.get(message.from);
            if (peer) {
                peer.signal(message.signal);
            }
        } catch (error) {
            this.log(`處理 answer 失敗: ${error.message}`, 'error');
        }
    }

    // 處理 ICE candidate
    async handleIceCandidate(message) {
        if (message.to !== this.nodeId) return;

        try {
            const peer = this.peers.get(message.from);
            if (peer) {
                peer.signal(message.signal);
            }
        } catch (error) {
            this.log(`處理 ICE candidate 失敗: ${error.message}`, 'error');
        }
    }

    // 斷開與指定節點的連線
    disconnectPeer(peerId) {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.destroy();
            this.peers.delete(peerId);
            this.eventEmitter.emit('peer-disconnected', peerId);
        }
    }

    // 處理來自節點的訊息
    handlePeerMessage(peerId, message) {
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            handler(peerId, message);
        } else {
            this.log(`未知的訊息類型: ${message.type}`, 'warning');
        }
    }

    // 發送訊息給指定節點
    sendToPeer(peerId, message) {
        const peer = this.peers.get(peerId);
        if (peer && peer.connected) {
            try {
                peer.send(JSON.stringify(message));
                return true;
            } catch (error) {
                this.log(`發送訊息給 ${peerId} 失敗: ${error.message}`, 'error');
                return false;
            }
        }
        return false;
    }

    // 廣播訊息給所有連接的節點
    broadcast(message, excludePeerId = null) {
        let sentCount = 0;
        for (const [peerId, peer] of this.peers) {
            if (peerId !== excludePeerId && peer.connected) {
                if (this.sendToPeer(peerId, message)) {
                    sentCount++;
                }
            }
        }
        return sentCount;
    }

    // 訊息處理器
    handleFileOffer(peerId, message) {
        this.eventEmitter.emit('file-offer', { peerId, ...message });
    }

    handleFileRequest(peerId, message) {
        this.eventEmitter.emit('file-request', { peerId, ...message });
    }

    handleTransaction(peerId, message) {
        this.eventEmitter.emit('transaction-received', { peerId, transaction: message.transaction });
    }

    handleBlock(peerId, message) {
        this.eventEmitter.emit('block-received', { peerId, block: message.block });
    }

    handleBlockchainSync(peerId, message) {
        this.eventEmitter.emit('blockchain-sync', { peerId, ...message });
    }

    handlePeerList(peerId, message) {
        // 處理節點列表更新
    }

    handlePing(peerId, message) {
        this.sendToPeer(peerId, {
            type: 'pong',
            timestamp: Date.now(),
            originalTimestamp: message.timestamp
        });
    }

    handlePong(peerId, message) {
        const latency = Date.now() - message.originalTimestamp;
        this.eventEmitter.emit('peer-latency', { peerId, latency });
    }

    // 開始心跳檢測
    startHeartbeat() {
        setInterval(() => {
            if (this.isRunning) {
                for (const peerId of this.peers.keys()) {
                    this.sendToPeer(peerId, {
                        type: 'ping',
                        timestamp: Date.now()
                    });
                }
            }
        }, 30000); // 每 30 秒發送一次心跳
    }

    // 獲取連接的節點列表
    getConnectedPeers() {
        return Array.from(this.peers.keys()).filter(peerId => {
            const peer = this.peers.get(peerId);
            return peer && peer.connected;
        });
    }

    // 獲取網路狀態
    getNetworkStatus() {
        return {
            nodeId: this.nodeId,
            isRunning: this.isRunning,
            connectedPeers: this.getConnectedPeers().length,
            totalPeers: this.peers.size,
            signalingConnected: this.signalingServer && this.signalingServer.readyState === WebSocket.OPEN
        };
    }

    // 日誌記錄
    log(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        console.log(logMessage);
        this.eventEmitter.emit('log', { message: logMessage, level, timestamp });
    }

    // 事件監聽
    on(event, callback) {
        this.eventEmitter.on(event, callback);
    }

    off(event, callback) {
        this.eventEmitter.off(event, callback);
    }

    // 重新生成節點 ID
    regenerateNodeId() {
        if (this.isRunning) {
            throw new Error('無法在節點運行時重新生成 ID');
        }
        this.nodeId = Utils.generateId(16);
        this.eventEmitter.emit('node-id-changed', this.nodeId);
    }

    // 獲取節點統計資訊
    getStats() {
        const connectedPeers = this.getConnectedPeers();
        return {
            nodeId: this.nodeId,
            isRunning: this.isRunning,
            connectedPeers: connectedPeers.length,
            peerList: connectedPeers,
            uptime: this.isRunning ? Date.now() - this.startTime : 0,
            messagesSent: this.messagesSent || 0,
            messagesReceived: this.messagesReceived || 0
        };
    }
}

// 導出網路管理器
window.NetworkManager = NetworkManager;