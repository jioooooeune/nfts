const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// База данных (для демо используем простой объект)
let db = {
    users: {},
    nfts: {},
    upgrades: {}
};

// API эндпоинты
app.post('/api/user', (req, res) => {
    const { telegramId } = req.body;
    if (!telegramId) {
        return res.status(400).json({ error: 'Telegram ID required' });
    }
    
    if (!db.users[telegramId]) {
        db.users[telegramId] = {
            id: telegramId,
            stars: 0,
            nfts: [],
            referrals: [],
            upgrades: [],
            createdAt: new Date().toISOString()
        };
    }
    
    res.json(db.users[telegramId]);
});

app.post('/api/deposit', (req, res) => {
    const { telegramId, nftName, nftId } = req.body;
    
    if (!telegramId || !nftName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const user = db.users[telegramId];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Проверяем, не отправлял ли пользователь уже эту NFT
    const existingNFT = user.nfts.find(nft => nft.originalId === nftId);
    if (existingNFT) {
        return res.status(400).json({ error: 'NFT already deposited' });
    }
    
    // Добавляем NFT в инвентарь пользователя
    const newNFT = {
        id: Date.now().toString(),
        name: nftName.replace('.png', ''),
        originalId: nftId,
        value: 250, // Базовая стоимость
        depositedAt: new Date().toISOString()
    };
    
    user.nfts.push(newNFT);
    
    res.json({
        success: true,
        nft: newNFT,
        message: 'NFT успешно добавлен в инвентарь'
    });
});

app.post('/api/upgrade', (req, res) => {
    const { telegramId, nftId, target } = req.body;
    
    const user = db.users[telegramId];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Находим NFT
    const nftIndex = user.nfts.findIndex(nft => nft.id === nftId);
    if (nftIndex === -1) {
        return res.status(404).json({ error: 'NFT not found' });
    }
    
    const nft = user.nfts[nftIndex];
    
    // Создаем запись об апгрейде
    const upgrade = {
        id: Date.now().toString(),
        userId: telegramId,
        nftId: nft.id,
        nftName: nft.name,
        target: target || 'stars',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(), // 5 часов
        status: 'in_progress'
    };
    
    // Удаляем NFT из инвентаря
    user.nfts.splice(nftIndex, 1);
    
    // Добавляем апгрейд
    if (!db.upgrades[telegramId]) {
        db.upgrades[telegramId] = [];
    }
    db.upgrades[telegramId].push(upgrade);
    
    res.json({
        success: true,
        upgrade,
        message: 'Апгрейд начат. Завершится через 5 часов.'
    });
});

app.get('/api/upgrades/:telegramId', (req, res) => {
    const { telegramId } = req.params;
    const upgrades = db.upgrades[telegramId] || [];
    
    // Проверяем завершенные апгрейды
    const now = new Date();
    upgrades.forEach(upgrade => {
        if (upgrade.status === 'in_progress' && new Date(upgrade.endTime) <= now) {
            upgrade.status = 'completed';
            upgrade.completedAt = new Date().toISOString();
            
            // Генерируем результат
            const success = Math.random() * 100 < 30; // 30% шанс
            
            upgrade.success = success;
            upgrade.result = success ? 'Выигрыш' : 'Проигрыш';
            
            if (success && upgrade.target === 'stars') {
                // Начисляем звёзды
                const user = db.users[telegramId];
                if (user) {
                    user.stars = (user.stars || 0) + 100;
                }
            }
        }
    });
    
    res.json(upgrades);
});

app.post('/api/spin', (req, res) => {
    const { telegramId, isFree } = req.body;
    
    const user = db.users[telegramId];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (!isFree) {
        if ((user.stars || 0) < 50) {
            return res.status(400).json({ error: 'Недостаточно звёзд' });
        }
        user.stars -= 50;
    }
    
    // Генерируем результат
    const win = Math.random() < 0.01; // 1% шанс
    
    let result = {
        success: win,
        isFree: isFree
    };
    
    if (win) {
        // Список доступных NFT для выигрыша
        const availableNFTs = [
            'Astral Shard', 'B-Day Candle', 'Berry Box', 'Crystal Ball',
            'Diamond Ring', 'Eternal Rose', 'Gem Signet', 'Magic Potion'
        ];
        
        const wonNFTName = availableNFTs[Math.floor(Math.random() * availableNFTs.length)];
        
        const newNFT = {
            id: Date.now().toString(),
            name: wonNFTName,
            value: 250,
            source: 'spin',
            wonAt: new Date().toISOString()
        };
        
        user.nfts.push(newNFT);
        result.nft = newNFT;
        result.message = `Вы выиграли NFT: ${wonNFTName}`;
    } else {
        result.message = 'К сожалению, вы ничего не выиграли';
    }
    
    res.json(result);
});

app.post('/api/referral', (req, res) => {
    const { telegramId, referrerId } = req.body;
    
    const referrer = db.users[referrerId];
    if (!referrer) {
        return res.status(404).json({ error: 'Referrer not found' });
    }
    
    // Добавляем реферала
    if (!referrer.referrals) {
        referrer.referrals = [];
    }
    
    // Проверяем, не был ли уже приглашен
    if (!referrer.referrals.includes(telegramId)) {
        referrer.referrals.push(telegramId);
        
        // Начисляем награду за каждых 3-х приглашенных
        if (referrer.referrals.length % 3 === 0) {
            referrer.stars = (referrer.stars || 0) + 25;
            referrer.earnedStars = (referrer.earnedStars || 0) + 25;
        }
    }
    
    res.json({
        success: true,
        referrals: referrer.referrals.length,
        earnedStars: referrer.earnedStars || 0
    });
});

app.post('/api/withdraw', (req, res) => {
    const { telegramId } = req.body;
    
    const user = db.users[telegramId];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Проверяем условия вывода
    const nfts = user.nfts || [];
    const eligibleNFTs = nfts.filter(nft => (nft.value || 250) >= 250);
    
    if (nfts.length < 3 || eligibleNFTs.length < 3) {
        return res.status(400).json({ error: 'Необходимо минимум 3 NFT стоимостью от 250 звёзд каждая' });
    }
    
    const totalValue = eligibleNFTs.reduce((sum, nft) => sum + (nft.value || 250), 0);
    if (totalValue < 750) {
        return res.status(400).json({ error: 'Общая стоимость NFT должна быть не менее 750 звёзд' });
    }
    
    // Рассчитываем сумму для вывода (с комиссией 5%)
    const withdrawAmount = Math.floor(totalValue * 0.95);
    
    // Удаляем использованные NFT
    user.nfts = user.nfts.filter(nft => (nft.value || 250) < 250);
    
    // Начисляем звёзды
    user.stars = (user.stars || 0) + withdrawAmount;
    
    res.json({
        success: true,
        withdrawAmount,
        message: `Вывод успешен. Начислено ${withdrawAmount} звёзд.`
    });
});

// Статические файлы
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});