// 加密工具模組
class CryptoUtils {
    constructor() {
        this.keyPair = null;
    }

    // 生成密鑰對
    async generateKeyPair() {
        try {
            this.keyPair = await window.crypto.subtle.generateKey(
                {
                    name: "ECDSA",
                    namedCurve: "P-256"
                },
                true,
                ["sign", "verify"]
            );
            return this.keyPair;
        } catch (error) {
            console.error('生成密鑰對失敗:', error);
            throw error;
        }
    }

    // 獲取公鑰字串
    async getPublicKeyString() {
        if (!this.keyPair) {
            await this.generateKeyPair();
        }
        
        const publicKeyBuffer = await window.crypto.subtle.exportKey(
            "spki",
            this.keyPair.publicKey
        );
        
        return this.arrayBufferToBase64(publicKeyBuffer);
    }

    // 從字串導入公鑰
    async importPublicKey(publicKeyString) {
        const publicKeyBuffer = this.base64ToArrayBuffer(publicKeyString);
        
        return await window.crypto.subtle.importKey(
            "spki",
            publicKeyBuffer,
            {
                name: "ECDSA",
                namedCurve: "P-256"
            },
            false,
            ["verify"]
        );
    }

    // 簽名資料
    async signData(data) {
        if (!this.keyPair) {
            await this.generateKeyPair();
        }

        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(JSON.stringify(data));
        
        const signature = await window.crypto.subtle.sign(
            {
                name: "ECDSA",
                hash: { name: "SHA-256" }
            },
            this.keyPair.privateKey,
            dataBuffer
        );

        return this.arrayBufferToBase64(signature);
    }

    // 驗證簽名
    async verifySignature(data, signature, publicKeyString) {
        try {
            const publicKey = await this.importPublicKey(publicKeyString);
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(JSON.stringify(data));
            const signatureBuffer = this.base64ToArrayBuffer(signature);

            return await window.crypto.subtle.verify(
                {
                    name: "ECDSA",
                    hash: { name: "SHA-256" }
                },
                publicKey,
                signatureBuffer,
                dataBuffer
            );
        } catch (error) {
            console.error('驗證簽名失敗:', error);
            return false;
        }
    }

    // 計算 SHA-256 雜湊
    static sha256(data) {
        if (typeof data === 'string') {
            return CryptoJS.SHA256(data).toString();
        } else if (data instanceof ArrayBuffer) {
            const wordArray = CryptoJS.lib.WordArray.create(data);
            return CryptoJS.SHA256(wordArray).toString();
        } else {
            return CryptoJS.SHA256(JSON.stringify(data)).toString();
        }
    }

    // 計算 Merkle 根
    static calculateMerkleRoot(transactions) {
        if (transactions.length === 0) {
            return CryptoUtils.sha256('');
        }

        if (transactions.length === 1) {
            return CryptoUtils.sha256(transactions[0]);
        }

        let hashes = transactions.map(tx => CryptoUtils.sha256(tx));

        while (hashes.length > 1) {
            const newHashes = [];
            
            for (let i = 0; i < hashes.length; i += 2) {
                if (i + 1 < hashes.length) {
                    newHashes.push(CryptoUtils.sha256(hashes[i] + hashes[i + 1]));
                } else {
                    newHashes.push(CryptoUtils.sha256(hashes[i] + hashes[i]));
                }
            }
            
            hashes = newHashes;
        }

        return hashes[0];
    }

    // 生成隨機 nonce
    static generateNonce() {
        return Math.floor(Math.random() * 1000000);
    }

    // 工作量證明（簡化版）
    static mineBlock(blockData, difficulty = 4) {
        const target = '0'.repeat(difficulty);
        let nonce = 0;
        let hash;

        do {
            nonce++;
            const blockString = JSON.stringify({
                ...blockData,
                nonce
            });
            hash = CryptoUtils.sha256(blockString);
        } while (!hash.startsWith(target));

        return { nonce, hash };
    }

    // 驗證工作量證明
    static verifyProofOfWork(blockData, nonce, hash, difficulty = 4) {
        const target = '0'.repeat(difficulty);
        const blockString = JSON.stringify({
            ...blockData,
            nonce
        });
        const calculatedHash = CryptoUtils.sha256(blockString);
        
        return calculatedHash === hash && hash.startsWith(target);
    }

    // ArrayBuffer 轉 Base64
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Base64 轉 ArrayBuffer
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // 生成隨機密鑰
    static generateRandomKey(length = 32) {
        const array = new Uint8Array(length);
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // AES 加密
    static async encryptAES(data, key) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const keyBuffer = encoder.encode(key);

        const cryptoKey = await window.crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            cryptoKey,
            dataBuffer
        );

        return {
            encrypted: Array.from(new Uint8Array(encrypted)),
            iv: Array.from(iv)
        };
    }

    // AES 解密
    static async decryptAES(encryptedData, key, iv) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const keyBuffer = encoder.encode(key);

        const cryptoKey = await window.crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );

        const decrypted = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(iv) },
            cryptoKey,
            new Uint8Array(encryptedData)
        );

        return decoder.decode(decrypted);
    }

    // 生成地址（基於公鑰）
    async generateAddress() {
        const publicKeyString = await this.getPublicKeyString();
        const hash = CryptoUtils.sha256(publicKeyString);
        return hash.substring(0, 40); // 取前 40 個字符作為地址
    }

    // 驗證地址格式
    static isValidAddress(address) {
        return /^[a-f0-9]{40}$/i.test(address);
    }

    // 生成交易 ID
    static generateTransactionId(transaction) {
        const txData = {
            from: transaction.from,
            to: transaction.to,
            amount: transaction.amount,
            timestamp: transaction.timestamp,
            memo: transaction.memo || ''
        };
        return CryptoUtils.sha256(txData);
    }

    // 驗證交易
    async verifyTransaction(transaction) {
        if (!transaction.signature || !transaction.from) {
            return false;
        }

        const txData = {
            to: transaction.to,
            amount: transaction.amount,
            timestamp: transaction.timestamp,
            memo: transaction.memo || ''
        };

        return await this.verifySignature(txData, transaction.signature, transaction.from);
    }

    // 創建創世區塊
    static createGenesisBlock() {
        const genesisData = {
            index: 0,
            timestamp: Date.now(),
            transactions: [],
            previousHash: '0',
            merkleRoot: CryptoUtils.sha256('genesis'),
            nonce: 0
        };

        const hash = CryptoUtils.sha256(genesisData);
        
        return {
            ...genesisData,
            hash
        };
    }

    // 驗證區塊
    static verifyBlock(block, previousBlock = null) {
        // 驗證區塊結構
        if (!block.index || !block.timestamp || !block.hash || !block.previousHash) {
            return false;
        }

        // 驗證前一個區塊的雜湊
        if (previousBlock && block.previousHash !== previousBlock.hash) {
            return false;
        }

        // 驗證區塊雜湊
        const blockData = {
            index: block.index,
            timestamp: block.timestamp,
            transactions: block.transactions,
            previousHash: block.previousHash,
            merkleRoot: block.merkleRoot,
            nonce: block.nonce
        };

        const calculatedHash = CryptoUtils.sha256(blockData);
        if (calculatedHash !== block.hash) {
            return false;
        }

        // 驗證 Merkle 根
        const calculatedMerkleRoot = CryptoUtils.calculateMerkleRoot(
            block.transactions.map(tx => CryptoUtils.generateTransactionId(tx))
        );
        
        return calculatedMerkleRoot === block.merkleRoot;
    }

    // 驗證區塊鏈
    static verifyBlockchain(blockchain) {
        if (blockchain.length === 0) return true;

        // 驗證創世區塊
        const genesisBlock = blockchain[0];
        if (genesisBlock.index !== 0 || genesisBlock.previousHash !== '0') {
            return false;
        }

        // 驗證每個區塊
        for (let i = 1; i < blockchain.length; i++) {
            const currentBlock = blockchain[i];
            const previousBlock = blockchain[i - 1];

            if (!CryptoUtils.verifyBlock(currentBlock, previousBlock)) {
                return false;
            }

            if (currentBlock.index !== previousBlock.index + 1) {
                return false;
            }
        }

        return true;
    }
}

// 導出加密工具類
window.CryptoUtils = CryptoUtils;