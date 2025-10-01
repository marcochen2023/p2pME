// 信令伺服器 - 用於 WebRTC 節點發現和信令交換
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

class SignalingServer {
    constructor(port = 8080) {
        this.port = port;
        this.clients = new Map(); // nodeId -> WebSocket
        this.server = null;
        this.wss = null;
        
        this.setupServer();
    }

    setupServer() {
        // 創建 HTTP 伺服器
        this.server = http.createServer((req, res) => {
            this.handleHttpRequest(req, res);
        });

        // 創建 WebSocket 伺服器
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.wss.on('connection', (ws, req) => {
            console.log('新的 WebSocket 連線');
            this.handleConnection(ws, req);
        });

        this.wss.on('error', (error) => {
            console.error('WebSocket 伺服器錯誤:', error);
        });
    }

    handleHttpRequest(req, res) {
        // 設置 CORS 標頭
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (req.url === '/status') {
            // 提供伺服器狀態
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'running',
                connectedClients: this.clients.size,
                clients: Array.from(this.clients.keys()),
                timestamp: new Date().toISOString()
            }));
            return;
        }

        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
            return;
        }

        // 404 for other requests
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }

    handleConnection(ws, req) {
        let nodeId = null;
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(ws, message, nodeId);
                
                // 更新 nodeId 如果是註冊訊息
                if (message.type === 'register') {
                    nodeId = message.nodeId;
                }
            } catch (error) {
                console.error('解析訊息失敗:', error);
                this.sendError(ws, 'Invalid message format');
            }
        });

        ws.on('close', () => {
            if (nodeId) {
                console.log(`節點 ${nodeId} 斷開連線`);
                this.clients.delete(nodeId);
                this.broadcastPeerLeft(nodeId);
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket 連線錯誤:', error);
            if (nodeId) {
                this.clients.delete(nodeId);
            }
        });
    }

    handleMessage(ws, message, currentNodeId) {
        switch (message.type) {
            case 'register':
                this.handleRegister(ws, message);
                break;
            case 'offer':
            case 'answer':
            case 'ice-candidate':
                this.handleSignaling(message);
                break;
            case 'get-peers':
                this.handleGetPeers(ws, message.nodeId);
                break;
            case 'ping':
                this.handlePing(ws);
                break;
            default:
                console.log('未知的訊息類型:', message.type);
                this.sendError(ws, 'Unknown message type');
        }
    }

    handleRegister(ws, message) {
        const { nodeId } = message;
        
        if (!nodeId) {
            this.sendError(ws, 'Node ID is required');
            return;
        }

        // 檢查是否已經註冊
        if (this.clients.has(nodeId)) {
            console.log(`節點 ${nodeId} 重複註冊，關閉舊連線`);
            const oldWs = this.clients.get(nodeId);
            if (oldWs !== ws && oldWs.readyState === WebSocket.OPEN) {
                oldWs.close();
            }
        }

        // 註冊新節點
        this.clients.set(nodeId, ws);
        console.log(`節點 ${nodeId} 已註冊，目前共有 ${this.clients.size} 個節點`);

        // 發送當前節點列表給新節點
        const peerList = Array.from(this.clients.keys()).filter(id => id !== nodeId);
        this.send(ws, {
            type: 'peer-list',
            peers: peerList
        });

        // 通知其他節點有新節點加入
        this.broadcastPeerJoined(nodeId);
    }

    handleSignaling(message) {
        const { to, from } = message;
        
        if (!to || !from) {
            console.error('信令訊息缺少 to 或 from 欄位');
            return;
        }

        const targetWs = this.clients.get(to);
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            this.send(targetWs, message);
        } else {
            console.log(`目標節點 ${to} 不在線或連線已關閉`);
            
            // 通知發送者目標節點不可用
            const senderWs = this.clients.get(from);
            if (senderWs && senderWs.readyState === WebSocket.OPEN) {
                this.send(senderWs, {
                    type: 'error',
                    message: `Target peer ${to} is not available`,
                    originalMessage: message
                });
            }
        }
    }

    handleGetPeers(ws, nodeId) {
        const peerList = Array.from(this.clients.keys()).filter(id => id !== nodeId);
        this.send(ws, {
            type: 'peer-list',
            peers: peerList
        });
    }

    handlePing(ws) {
        this.send(ws, {
            type: 'pong',
            timestamp: Date.now()
        });
    }

    broadcastPeerJoined(nodeId) {
        const message = {
            type: 'peer-joined',
            nodeId: nodeId,
            timestamp: Date.now()
        };

        this.broadcast(message, nodeId);
    }

    broadcastPeerLeft(nodeId) {
        const message = {
            type: 'peer-left',
            nodeId: nodeId,
            timestamp: Date.now()
        };

        this.broadcast(message, nodeId);
    }

    broadcast(message, excludeNodeId = null) {
        let sentCount = 0;
        
        for (const [nodeId, ws] of this.clients) {
            if (nodeId !== excludeNodeId && ws.readyState === WebSocket.OPEN) {
                try {
                    this.send(ws, message);
                    sentCount++;
                } catch (error) {
                    console.error(`廣播給節點 ${nodeId} 失敗:`, error);
                    this.clients.delete(nodeId);
                }
            }
        }

        return sentCount;
    }

    send(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    sendError(ws, errorMessage) {
        this.send(ws, {
            type: 'error',
            message: errorMessage,
            timestamp: Date.now()
        });
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, (error) => {
                if (error) {
                    console.error('啟動伺服器失敗:', error);
                    reject(error);
                } else {
                    console.log(`信令伺服器已啟動在端口 ${this.port}`);
                    console.log(`WebSocket 端點: ws://localhost:${this.port}`);
                    console.log(`狀態端點: http://localhost:${this.port}/status`);
                    resolve();
                }
            });
        });
    }

    stop() {
        return new Promise((resolve) => {
            // 關閉所有 WebSocket 連線
            for (const [nodeId, ws] of this.clients) {
                ws.close();
            }
            this.clients.clear();

            // 關閉 WebSocket 伺服器
            this.wss.close(() => {
                // 關閉 HTTP 伺服器
                this.server.close(() => {
                    console.log('信令伺服器已停止');
                    resolve();
                });
            });
        });
    }

    getStats() {
        return {
            connectedClients: this.clients.size,
            clients: Array.from(this.clients.keys()),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        };
    }

    // 清理無效連線
    cleanup() {
        const invalidClients = [];
        
        for (const [nodeId, ws] of this.clients) {
            if (ws.readyState !== WebSocket.OPEN) {
                invalidClients.push(nodeId);
            }
        }

        for (const nodeId of invalidClients) {
            console.log(`清理無效連線: ${nodeId}`);
            this.clients.delete(nodeId);
        }

        return invalidClients.length;
    }
}

// 如果直接執行此檔案，啟動伺服器
if (require.main === module) {
    const port = process.env.PORT || 8080;
    const server = new SignalingServer(port);

    // 處理程序退出
    process.on('SIGINT', async () => {
        console.log('\n正在關閉伺服器...');
        await server.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\n正在關閉伺服器...');
        await server.stop();
        process.exit(0);
    });

    // 定期清理無效連線
    setInterval(() => {
        const cleaned = server.cleanup();
        if (cleaned > 0) {
            console.log(`清理了 ${cleaned} 個無效連線`);
        }
    }, 60000); // 每分鐘清理一次

    // 啟動伺服器
    server.start().catch((error) => {
        console.error('啟動伺服器失敗:', error);
        process.exit(1);
    });
}

module.exports = SignalingServer;