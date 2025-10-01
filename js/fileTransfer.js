// 檔案傳輸管理模組
class FileTransferManager {
    constructor(networkManager) {
        this.networkManager = networkManager;
        this.sharedFiles = new Map(); // fileId -> fileInfo
        this.availableFiles = new Map(); // fileId -> fileInfo from peers
        this.downloadProgress = new Map(); // fileId -> progress
        this.uploadProgress = new Map(); // fileId -> progress
        this.eventEmitter = Utils.createEventEmitter();
        this.chunkSize = 64 * 1024; // 64KB chunks
        this.maxConcurrentTransfers = 3;
        this.activeTransfers = new Set();

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // 監聽網路事件
        this.networkManager.on('file-offer', this.handleFileOffer.bind(this));
        this.networkManager.on('file-request', this.handleFileRequest.bind(this));
        this.networkManager.on('peer-connected', this.handlePeerConnected.bind(this));
        this.networkManager.on('peer-disconnected', this.handlePeerDisconnected.bind(this));
    }

    // 分享檔案
    async shareFile(file) {
        try {
            const fileId = Utils.generateUUID();
            const fileHash = await Utils.calculateFileHash(file);
            
            const fileInfo = {
                id: fileId,
                name: file.name,
                size: file.size,
                type: file.type,
                hash: fileHash,
                file: file,
                sharedAt: Date.now(),
                downloadCount: 0
            };

            this.sharedFiles.set(fileId, fileInfo);
            
            // 廣播檔案提供訊息
            this.broadcastFileOffer(fileInfo);
            
            this.eventEmitter.emit('file-shared', fileInfo);
            this.log(`檔案已分享: ${file.name} (${Utils.formatFileSize(file.size)})`);
            
            return fileId;
        } catch (error) {
            this.log(`分享檔案失敗: ${error.message}`, 'error');
            throw error;
        }
    }

    // 停止分享檔案
    stopSharingFile(fileId) {
        const fileInfo = this.sharedFiles.get(fileId);
        if (fileInfo) {
            this.sharedFiles.delete(fileId);
            
            // 通知所有節點檔案不再可用
            this.networkManager.broadcast({
                type: 'file-unavailable',
                fileId: fileId
            });
            
            this.eventEmitter.emit('file-unshared', fileInfo);
            this.log(`停止分享檔案: ${fileInfo.name}`);
        }
    }

    // 廣播檔案提供
    broadcastFileOffer(fileInfo) {
        const offer = {
            type: 'file-offer',
            fileId: fileInfo.id,
            fileName: fileInfo.name,
            fileSize: fileInfo.size,
            fileType: fileInfo.type,
            fileHash: fileInfo.hash,
            timestamp: Date.now()
        };

        this.networkManager.broadcast(offer);
    }

    // 處理檔案提供
    handleFileOffer(data) {
        const { peerId, fileId, fileName, fileSize, fileType, fileHash } = data;
        
        // 檢查是否已經有這個檔案
        if (this.availableFiles.has(fileId)) {
            return;
        }

        const fileInfo = {
            id: fileId,
            name: fileName,
            size: fileSize,
            type: fileType,
            hash: fileHash,
            peerId: peerId,
            availableAt: Date.now()
        };

        this.availableFiles.set(fileId, fileInfo);
        this.eventEmitter.emit('file-available', fileInfo);
        this.log(`發現可下載檔案: ${fileName} 來自 ${peerId}`);
    }

    // 請求下載檔案
    async requestFile(fileId) {
        const fileInfo = this.availableFiles.get(fileId);
        if (!fileInfo) {
            throw new Error('檔案不存在');
        }

        if (this.activeTransfers.size >= this.maxConcurrentTransfers) {
            throw new Error('達到最大同時傳輸數量限制');
        }

        try {
            this.activeTransfers.add(fileId);
            this.downloadProgress.set(fileId, { received: 0, total: fileInfo.size });
            
            // 發送檔案請求
            const success = this.networkManager.sendToPeer(fileInfo.peerId, {
                type: 'file-request',
                fileId: fileId,
                requesterId: this.networkManager.nodeId
            });

            if (!success) {
                throw new Error('無法發送檔案請求');
            }

            this.eventEmitter.emit('download-started', { fileId, fileInfo });
            this.log(`開始下載檔案: ${fileInfo.name}`);
            
            return fileId;
        } catch (error) {
            this.activeTransfers.delete(fileId);
            this.downloadProgress.delete(fileId);
            throw error;
        }
    }

    // 處理檔案請求
    async handleFileRequest(data) {
        const { peerId, fileId, requesterId } = data;
        
        const fileInfo = this.sharedFiles.get(fileId);
        if (!fileInfo) {
            // 檔案不存在，發送錯誤回應
            this.networkManager.sendToPeer(peerId, {
                type: 'file-error',
                fileId: fileId,
                error: 'File not found'
            });
            return;
        }

        try {
            // 開始傳輸檔案
            await this.sendFile(peerId, fileInfo);
            fileInfo.downloadCount++;
            
        } catch (error) {
            this.log(`傳輸檔案失敗: ${error.message}`, 'error');
            this.networkManager.sendToPeer(peerId, {
                type: 'file-error',
                fileId: fileId,
                error: error.message
            });
        }
    }

    // 發送檔案
    async sendFile(peerId, fileInfo) {
        const { file, id: fileId } = fileInfo;
        const totalChunks = Math.ceil(file.size / this.chunkSize);
        
        this.uploadProgress.set(fileId, { sent: 0, total: file.size });
        this.eventEmitter.emit('upload-started', { fileId, peerId, fileInfo });
        
        try {
            // 發送檔案元資料
            this.networkManager.sendToPeer(peerId, {
                type: 'file-metadata',
                fileId: fileId,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                totalChunks: totalChunks,
                chunkSize: this.chunkSize
            });

            // 分塊發送檔案
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * this.chunkSize;
                const end = Math.min(start + this.chunkSize, file.size);
                const chunk = file.slice(start, end);
                
                const chunkData = await this.fileToArrayBuffer(chunk);
                const chunkBase64 = this.arrayBufferToBase64(chunkData);
                
                const success = this.networkManager.sendToPeer(peerId, {
                    type: 'file-chunk',
                    fileId: fileId,
                    chunkIndex: chunkIndex,
                    chunkData: chunkBase64,
                    isLastChunk: chunkIndex === totalChunks - 1
                });

                if (!success) {
                    throw new Error('發送檔案塊失敗');
                }

                // 更新上傳進度
                const progress = this.uploadProgress.get(fileId);
                progress.sent = end;
                this.eventEmitter.emit('upload-progress', {
                    fileId,
                    progress: (progress.sent / progress.total) * 100,
                    sent: progress.sent,
                    total: progress.total
                });

                // 添加小延遲避免網路擁塞
                if (chunkIndex % 10 === 0) {
                    await Utils.sleep(10);
                }
            }

            this.uploadProgress.delete(fileId);
            this.eventEmitter.emit('upload-completed', { fileId, peerId, fileInfo });
            this.log(`檔案上傳完成: ${fileInfo.name} 到 ${peerId}`);
            
        } catch (error) {
            this.uploadProgress.delete(fileId);
            this.eventEmitter.emit('upload-failed', { fileId, peerId, error });
            throw error;
        }
    }

    // 處理檔案元資料
    handleFileMetadata(peerId, data) {
        const { fileId, fileName, fileSize, fileType, totalChunks, chunkSize } = data;
        
        const downloadInfo = {
            fileId,
            fileName,
            fileSize,
            fileType,
            totalChunks,
            chunkSize,
            receivedChunks: new Map(),
            peerId
        };

        this.activeDownloads = this.activeDownloads || new Map();
        this.activeDownloads.set(fileId, downloadInfo);
        
        this.eventEmitter.emit('download-metadata', downloadInfo);
    }

    // 處理檔案塊
    async handleFileChunk(peerId, data) {
        const { fileId, chunkIndex, chunkData, isLastChunk } = data;
        
        const downloadInfo = this.activeDownloads?.get(fileId);
        if (!downloadInfo) {
            this.log(`收到未知檔案的塊: ${fileId}`, 'warning');
            return;
        }

        try {
            // 解碼並儲存塊
            const chunkBuffer = this.base64ToArrayBuffer(chunkData);
            downloadInfo.receivedChunks.set(chunkIndex, chunkBuffer);
            
            // 更新下載進度
            const progress = this.downloadProgress.get(fileId);
            if (progress) {
                progress.received += chunkBuffer.byteLength;
                this.eventEmitter.emit('download-progress', {
                    fileId,
                    progress: (progress.received / progress.total) * 100,
                    received: progress.received,
                    total: progress.total
                });
            }

            // 檢查是否所有塊都已接收
            if (downloadInfo.receivedChunks.size === downloadInfo.totalChunks) {
                await this.assembleFile(downloadInfo);
            }
            
        } catch (error) {
            this.log(`處理檔案塊失敗: ${error.message}`, 'error');
            this.eventEmitter.emit('download-failed', { fileId, error });
        }
    }

    // 組裝檔案
    async assembleFile(downloadInfo) {
        const { fileId, fileName, fileType, receivedChunks, totalChunks } = downloadInfo;
        
        try {
            // 按順序組裝所有塊
            const chunks = [];
            for (let i = 0; i < totalChunks; i++) {
                const chunk = receivedChunks.get(i);
                if (!chunk) {
                    throw new Error(`缺少檔案塊 ${i}`);
                }
                chunks.push(chunk);
            }

            // 創建完整檔案
            const fileBlob = new Blob(chunks, { type: fileType });
            const file = new File([fileBlob], fileName, { type: fileType });
            
            // 清理
            this.activeDownloads?.delete(fileId);
            this.activeTransfers.delete(fileId);
            this.downloadProgress.delete(fileId);
            
            this.eventEmitter.emit('download-completed', { fileId, file, downloadInfo });
            this.log(`檔案下載完成: ${fileName}`);
            
            // 自動下載檔案
            Utils.downloadFile(file, fileName);
            
        } catch (error) {
            this.log(`組裝檔案失敗: ${error.message}`, 'error');
            this.eventEmitter.emit('download-failed', { fileId, error });
        }
    }

    // 處理節點連接
    handlePeerConnected(peerId) {
        // 向新連接的節點廣播我們的檔案
        for (const fileInfo of this.sharedFiles.values()) {
            this.networkManager.sendToPeer(peerId, {
                type: 'file-offer',
                fileId: fileInfo.id,
                fileName: fileInfo.name,
                fileSize: fileInfo.size,
                fileType: fileInfo.type,
                fileHash: fileInfo.hash,
                timestamp: Date.now()
            });
        }
    }

    // 處理節點斷開
    handlePeerDisconnected(peerId) {
        // 移除來自該節點的檔案
        const filesToRemove = [];
        for (const [fileId, fileInfo] of this.availableFiles) {
            if (fileInfo.peerId === peerId) {
                filesToRemove.push(fileId);
            }
        }

        for (const fileId of filesToRemove) {
            const fileInfo = this.availableFiles.get(fileId);
            this.availableFiles.delete(fileId);
            this.eventEmitter.emit('file-unavailable', fileInfo);
        }

        if (filesToRemove.length > 0) {
            this.log(`移除 ${filesToRemove.length} 個來自 ${peerId} 的檔案`);
        }
    }

    // 取消下載
    cancelDownload(fileId) {
        const downloadInfo = this.activeDownloads?.get(fileId);
        if (downloadInfo) {
            this.activeDownloads.delete(fileId);
            this.activeTransfers.delete(fileId);
            this.downloadProgress.delete(fileId);
            
            this.eventEmitter.emit('download-cancelled', { fileId, downloadInfo });
            this.log(`取消下載: ${downloadInfo.fileName}`);
        }
    }

    // 獲取分享的檔案列表
    getSharedFiles() {
        return Array.from(this.sharedFiles.values());
    }

    // 獲取可下載的檔案列表
    getAvailableFiles() {
        return Array.from(this.availableFiles.values());
    }

    // 獲取傳輸狀態
    getTransferStatus() {
        return {
            activeTransfers: this.activeTransfers.size,
            maxConcurrentTransfers: this.maxConcurrentTransfers,
            sharedFiles: this.sharedFiles.size,
            availableFiles: this.availableFiles.size,
            downloadProgress: Object.fromEntries(this.downloadProgress),
            uploadProgress: Object.fromEntries(this.uploadProgress)
        };
    }

    // 工具方法
    async fileToArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // 事件監聽
    on(event, callback) {
        this.eventEmitter.on(event, callback);
    }

    off(event, callback) {
        this.eventEmitter.off(event, callback);
    }

    // 日誌記錄
    log(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[FileTransfer] ${message}`;
        
        console.log(logMessage);
        this.eventEmitter.emit('log', { message: logMessage, level, timestamp });
    }
}

// 導出檔案傳輸管理器
window.FileTransferManager = FileTransferManager;