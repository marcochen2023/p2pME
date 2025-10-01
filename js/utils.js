// 工具函數模組
class Utils {
    // 生成隨機 ID
    static generateId(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // 格式化檔案大小
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 格式化時間
    static formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    // 格式化相對時間
    static formatRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days} 天前`;
        if (hours > 0) return `${hours} 小時前`;
        if (minutes > 0) return `${minutes} 分鐘前`;
        return `${seconds} 秒前`;
    }

    // 截斷字串
    static truncateString(str, maxLength = 50) {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    }

    // 截斷雜湊值
    static truncateHash(hash, startLength = 8, endLength = 8) {
        if (hash.length <= startLength + endLength + 3) return hash;
        return hash.substring(0, startLength) + '...' + hash.substring(hash.length - endLength);
    }

    // 深拷貝物件
    static deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => Utils.deepClone(item));
        if (typeof obj === 'object') {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = Utils.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    }

    // 防抖函數
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 節流函數
    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // 驗證檔案類型
    static isValidFileType(file, allowedTypes = []) {
        if (allowedTypes.length === 0) return true;
        return allowedTypes.some(type => {
            if (type.startsWith('.')) {
                return file.name.toLowerCase().endsWith(type.toLowerCase());
            }
            return file.type.startsWith(type);
        });
    }

    // 驗證檔案大小
    static isValidFileSize(file, maxSize = 100 * 1024 * 1024) { // 預設 100MB
        return file.size <= maxSize;
    }

    // 計算檔案雜湊值
    static async calculateFileHash(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const arrayBuffer = e.target.result;
                const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
                const hash = CryptoJS.SHA256(wordArray).toString();
                resolve(hash);
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // 將檔案轉換為 Base64
    static fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // 從 Base64 創建檔案
    static base64ToFile(base64, filename, mimeType) {
        const byteCharacters = atob(base64.split(',')[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new File([byteArray], filename, { type: mimeType });
    }

    // 下載檔案
    static downloadFile(file, filename) {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 複製到剪貼簿
    static async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // 備用方法
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textArea);
            return success;
        }
    }

    // 檢查瀏覽器支援
    static checkBrowserSupport() {
        const support = {
            webrtc: !!(window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection),
            websocket: !!window.WebSocket,
            fileapi: !!(window.File && window.FileReader && window.FileList && window.Blob),
            crypto: !!window.crypto,
            clipboard: !!navigator.clipboard
        };

        const unsupported = Object.keys(support).filter(key => !support[key]);
        
        return {
            supported: unsupported.length === 0,
            unsupported,
            details: support
        };
    }

    // 生成顏色
    static generateColor(seed) {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
        ];
        const hash = seed.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return colors[Math.abs(hash) % colors.length];
    }

    // 驗證 JSON
    static isValidJSON(str) {
        try {
            JSON.parse(str);
            return true;
        } catch (e) {
            return false;
        }
    }

    // 安全的 JSON 解析
    static safeJSONParse(str, defaultValue = null) {
        try {
            return JSON.parse(str);
        } catch (e) {
            return defaultValue;
        }
    }

    // 生成 UUID v4
    static generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // 等待指定時間
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 重試機制
    static async retry(fn, maxAttempts = 3, delay = 1000) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === maxAttempts) throw error;
                await Utils.sleep(delay * attempt);
            }
        }
    }

    // 事件發射器
    static createEventEmitter() {
        const events = {};
        
        return {
            on(event, callback) {
                if (!events[event]) events[event] = [];
                events[event].push(callback);
            },
            
            off(event, callback) {
                if (!events[event]) return;
                events[event] = events[event].filter(cb => cb !== callback);
            },
            
            emit(event, ...args) {
                if (!events[event]) return;
                events[event].forEach(callback => callback(...args));
            },
            
            once(event, callback) {
                const onceCallback = (...args) => {
                    callback(...args);
                    this.off(event, onceCallback);
                };
                this.on(event, onceCallback);
            }
        };
    }
}

// 全域錯誤處理
window.addEventListener('error', (event) => {
    console.error('全域錯誤:', event.error);
    if (window.UI) {
        UI.showNotification('系統發生錯誤', 'error');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('未處理的 Promise 拒絕:', event.reason);
    if (window.UI) {
        UI.showNotification('系統發生錯誤', 'error');
    }
});

// 導出工具類
window.Utils = Utils;