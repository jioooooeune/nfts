// Основной скрипт для работы приложения
class NFTApp {
    constructor() {
        this.initApp();
        this.loadUserData();
        this.loadNFTs();
        this.setupEventListeners();
    }

    initApp() {
        // Инициализация Telegram Web App
        if (window.Telegram && window.Telegram.WebApp) {
            this.telegramApp = Telegram.WebApp;
            this.telegramApp.ready();
            this.telegramApp.expand();
            
            // Получаем данные пользователя из Telegram
            const user = this.telegramApp.initDataUnsafe?.user;
            if (user) {
                document.getElementById('userName').textContent = user.first_name || 'Пользователь';
                if (user.photo_url) {
                    document.getElementById('userAvatar').src = user.photo_url;
                }
            }
            
            // Настройка темы
            this.setupTheme();
        }
        
        // Инициализация базы данных
        this.initDatabase();
    }

    setupTheme() {
        if (this.telegramApp) {
            const theme = this.telegramApp.themeParams;
            document.documentElement.style.setProperty('--primary-color', theme.button_color || '#8a2be2');
            document.documentElement.style.setProperty('--secondary-color', theme.link_color || '#6a11cb');
            document.documentElement.style.setProperty('--text-primary', theme.text_color || '#ffffff');
        }
    }

    async initDatabase() {
        // Здесь будет инициализация IndexedDB или подключение к серверу
        // Для демо используем localStorage
        if (!localStorage.getItem('userData')) {
            const initialData = {
                stars: 0,
                nfts: [],
                referrals: [],
                upgrades: [],
                lastFreeSpin: null,
                invitedCount: 0,
                earnedStars: 0
            };
            localStorage.setItem('userData', JSON.stringify(initialData));
        }
    }

    loadUserData() {
        const data = JSON.parse(localStorage.getItem('userData') || '{}');
        this.userData = data;
        
        // Обновляем UI
        document.getElementById('starsCount').textContent = data.stars || 0;
        document.getElementById('invitedCount').textContent = data.invitedCount || 0;
        document.getElementById('earnedStars').textContent = data.earnedStars || 0;
        
        // Проверяем бесплатные прокрутки
        this.checkFreeSpins();
        
        // Проверяем условия вывода
        this.checkWithdrawalConditions();
    }

    async loadNFTs() {
        // Загружаем NFT из базы данных
        const nfts = this.userData.nfts || [];
        
        if (nfts.length === 0) {
            document.getElementById('emptyInventory').style.display = 'block';
            document.getElementById('nftGrid').style.display = 'none';
            return;
        }
        
        document.getElementById('emptyInventory').style.display = 'none';
        document.getElementById('nftGrid').style.display = 'grid';
        
        const nftGrid = document.getElementById('nftGrid');
        nftGrid.innerHTML = '';
        
        for (const nft of nfts) {
            const nftCard = this.createNFTCard(nft);
            nftGrid.appendChild(nftCard);
        }
        
        // Также обновляем селектор NFT на странице апгрейдов
        this.updateNFTSelector();
    }

    createNFTCard(nft) {
        const div = document.createElement('div');
        div.className = 'nft-card';
        div.dataset.id = nft.id;
        div.innerHTML = `
            <img src="images/${nft.name}.png" alt="${nft.name}" class="nft-image" onerror="this.src='images/default.png'">
            <div class="nft-name">${nft.name}</div>
            <div class="nft-value">
                <img src="images/c51dbff1-7e57-4ce8-ad0c-efc56255fd3a.webp" alt="Stars" class="small-star">
                ${nft.value || '250'}
            </div>
        `;
        
        div.addEventListener('click', () => this.showNFTDetails(nft));
        return div;
    }

    updateNFTSelector() {
        const selector = document.getElementById('nftSelector');
        if (!selector) return;
        
        const nfts = this.userData.nfts || [];
        
        if (nfts.length === 0) {
            selector.innerHTML = `
                <div class="no-nfts-message">
                    <i class="fas fa-box-open"></i>
                    <p>У вас нет NFT для апгрейда</p>
                    <a href="index.html" class="go-to-inventory">Перейти в инвентарь</a>
                </div>
            `;
            document.getElementById('startUpgradeBtn').disabled = true;
            return;
        }
        
        selector.innerHTML = '';
        nfts.forEach(nft => {
            const div = document.createElement('div');
            div.className = 'nft-selector-item';
            div.dataset.id = nft.id;
            div.innerHTML = `
                <img src="images/${nft.name}.png" alt="${nft.name}" class="nft-image-small">
                <span>${nft.name}</span>
            `;
            
            div.addEventListener('click', () => this.selectNFTForUpgrade(nft.id));
            selector.appendChild(div);
        });
        
        document.getElementById('startUpgradeBtn').disabled = false;
    }

    setupEventListeners() {
        // Обработчики для кнопок
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('close-modal')) {
                const modalId = e.target.closest('.modal').id;
                this.closeModal(modalId);
            }
            
            if (e.target.classList.contains('target-option')) {
                this.selectUpgradeTarget(e.target);
            }
        });
        
        // Обработка ввода звёзд
        const starsInput = document.getElementById('starsInput');
        if (starsInput) {
            starsInput.addEventListener('input', (e) => {
                const value = parseInt(e.target.value) || 0;
                e.target.value = Math.min(value, 100000);
            });
        }
        
        // Обработка выбора NFT для апгрейда
        this.selectedNFT = null;
        this.selectedTarget = 'stars';
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
    }

    showDepositInstructions() {
        this.showModal('depositModal');
    }

    addStars() {
        const input = document.getElementById('starsInput');
        const amount = parseInt(input.value) || 0;
        
        if (amount <= 0) {
            this.showNotification('Введите корректное количество звёзд', 'error');
            return;
        }
        
        // В реальном приложении здесь будет запрос к API
        this.userData.stars = (this.userData.stars || 0) + amount;
        localStorage.setItem('userData', JSON.stringify(this.userData));
        
        document.getElementById('starsCount').textContent = this.userData.stars;
        input.value = '';
        
        this.showNotification(`Добавлено ${amount} звёзд!`, 'success');
    }

    selectNFTForUpgrade(nftId) {
        const nfts = this.userData.nfts || [];
        this.selectedNFT = nfts.find(nft => nft.id === nftId);
        
        // Обновляем UI выбранного NFT
        document.querySelectorAll('.nft-selector-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === nftId);
        });
        
        this.updateChanceDisplay();
    }

    selectUpgradeTarget(element) {
        document.querySelectorAll('.target-option').forEach(option => {
            option.classList.remove('active');
        });
        
        element.classList.add('active');
        this.selectedTarget = element.dataset.target;
        this.updateChanceDisplay();
    }

    updateChanceDisplay() {
        if (!this.selectedNFT) {
            document.getElementById('currentChance').textContent = '1%';
            document.getElementById('chanceFill').style.width = '1%';
            return;
        }
        
        // Рассчитываем шанс на основе выбранной цели и NFT
        let baseChance = 1;
        
        switch (this.selectedTarget) {
            case 'rare':
                baseChance = 10;
                break;
            case 'legendary':
                baseChance = 5;
                break;
            default:
                baseChance = 15;
        }
        
        // Увеличиваем шанс в зависимости от стоимости NFT
        const nftValue = this.selectedNFT.value || 250;
        const valueBonus = Math.min(Math.floor(nftValue / 100), 15);
        
        const totalChance = Math.min(baseChance + valueBonus, 30);
        
        document.getElementById('currentChance').textContent = `${totalChance}%`;
        document.getElementById('chanceFill').style.width = `${totalChance}%`;
    }

    async startUpgrade() {
        if (!this.selectedNFT) {
            this.showNotification('Выберите NFT для апгрейда', 'error');
            return;
        }
        
        const confirmUpgrade = confirm(`Вы уверены, что хотите вложить NFT "${this.selectedNFT.name}" для апгрейда? Процесс займет 5 часов.`);
        
        if (!confirmUpgrade) return;
        
        // Создаем запись об апгрейде
        const upgrade = {
            id: Date.now(),
            nftId: this.selectedNFT.id,
            nftName: this.selectedNFT.name,
            target: this.selectedTarget,
            startTime: Date.now(),
            endTime: Date.now() + (5 * 60 * 60 * 1000), // 5 часов
            status: 'in_progress'
        };
        
        // Удаляем NFT из инвентаря
        this.userData.nfts = this.userData.nfts.filter(nft => nft.id !== this.selectedNFT.id);
        
        // Добавляем апгрейд в список
        if (!this.userData.upgrades) {
            this.userData.upgrades = [];
        }
        this.userData.upgrades.push(upgrade);
        
        // Сохраняем данные
        localStorage.setItem('userData', JSON.stringify(this.userData));
        
        // Обновляем UI
        this.loadNFTs();
        this.updateActiveUpgrades();
        
        this.showNotification('Апгрейд начат! Через 5 часов узнаете результат.', 'success');
        
        // Сбрасываем выбор
        this.selectedNFT = null;
        document.getElementById('startUpgradeBtn').disabled = true;
        document.querySelectorAll('.nft-selector-item').forEach(item => {
            item.classList.remove('active');
        });
    }

    updateActiveUpgrades() {
        const container = document.getElementById('activeUpgrades');
        if (!container) return;
        
        const upgrades = this.userData.upgrades || [];
        const now = Date.now();
        
        // Проверяем завершенные апгрейды
        upgrades.forEach(upgrade => {
            if (upgrade.status === 'in_progress' && upgrade.endTime <= now) {
                this.completeUpgrade(upgrade);
            }
        });
        
        const activeUpgrades = upgrades.filter(u => u.status === 'in_progress');
        
        if (activeUpgrades.length === 0) {
            container.innerHTML = `
                <div class="no-active-upgrades">
                    <i class="fas fa-hourglass-start"></i>
                    <p>Нет активных апгрейдов</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        activeUpgrades.forEach(upgrade => {
            const remainingTime = upgrade.endTime - now;
            const hours = Math.floor(remainingTime / (60 * 60 * 1000));
            const minutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));
            
            const div = document.createElement('div');
            div.className = 'active-upgrade-item';
            div.innerHTML = `
                <div class="upgrade-info">
                    <strong>${upgrade.nftName}</strong>
                    <span>→ ${this.getTargetName(upgrade.target)}</span>
                </div>
                <div class="upgrade-timer">
                    <i class="fas fa-clock"></i>
                    ${hours}ч ${minutes}м
                </div>
            `;
            container.appendChild(div);
        });
    }

    getTargetName(target) {
        switch (target) {
            case 'stars': return 'Звёзды';
            case 'rare': return 'Редкая NFT';
            case 'legendary': return 'Легендарная NFT';
            default: return target;
        }
    }

    completeUpgrade(upgrade) {
        // Определяем результат апгрейда
        const success = Math.random() * 100 < 30; // 30% шанс успеха
        
        upgrade.status = 'completed';
        upgrade.success = success;
        upgrade.completedAt = Date.now();
        
        if (success) {
            // Начисляем награду
            switch (upgrade.target) {
                case 'stars':
                    this.userData.stars = (this.userData.stars || 0) + 100;
                    break;
                case 'rare':
                    // Добавляем редкую NFT
                    break;
                case 'legendary':
                    // Добавляем легендарную NFT
                    break;
            }
            
            // Показываем окно с результатом
            this.showUpgradeResult(upgrade, true);
        } else {
            // Показываем окно с неудачей и предлагаем прокрутку
            this.showUpgradeResult(upgrade, false);
        }
        
        localStorage.setItem('userData', JSON.stringify(this.userData));
    }

    showUpgradeResult(upgrade, success) {
        const modal = document.getElementById('upgradeResultModal');
        const content = document.getElementById('upgradeResultContent');
        
        if (success) {
            content.innerHTML = `
                <div class="upgrade-result success">
                    <i class="fas fa-trophy fa-3x"></i>
                    <h3>Апгрейд успешен!</h3>
                    <p>Вы успешно улучшили ${upgrade.nftName}</p>
                    <div class="reward-info">
                        Вы получили: ${this.getRewardDescription(upgrade.target)}
                    </div>
                    <button class="ok-btn" onclick="app.closeModal('upgradeResultModal')">
                        Отлично!
                    </button>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="upgrade-result failed">
                    <i class="fas fa-times-circle fa-3x"></i>
                    <h3>Апгрейд не удался</h3>
                    <p>К сожалению, улучшение ${upgrade.nftName} не удалось</p>
                    <div class="retry-info">
                        <p>Вы можете попробовать выбить NFT в бесплатной прокрутке</p>
                        <button class="free-spin-btn" onclick="app.openFreeSpinAfterUpgrade()">
                            <i class="fas fa-redo"></i> Бесплатная прокрутка
                        </button>
                    </div>
                    <button class="ok-btn" onclick="app.closeModal('upgradeResultModal')">
                        Закрыть
                    </button>
                </div>
            `;
        }
        
        this.showModal('upgradeResultModal');
    }

    getRewardDescription(target) {
        switch (target) {
            case 'stars': return '100 Телеграм Звёзд';
            case 'rare': return 'Редкая NFT';
            case 'legendary': return 'Легендарная NFT';
            default: return 'Награда';
        }
    }

    openFreeSpinAfterUpgrade() {
        this.closeModal('upgradeResultModal');
        this.openSpinWheel(true); // true = бесплатная прокрутка после неудачи
    }

    checkFreeSpins() {
        const now = new Date();
        const today = now.toDateString();
        const lastSpin = this.userData.lastFreeSpin;
        
        if (!lastSpin || new Date(lastSpin).toDateString() !== today) {
            // Есть бесплатная прокрутка
            document.getElementById('freeSpins').textContent = '1/1';
            document.getElementById('spinActionBtn').innerHTML = '<i class="fas fa-play"></i> Бесплатная прокрутка';
            document.getElementById('spinActionBtn').onclick = () => this.performSpin(true);
        } else {
            // Бесплатная прокрутка использована
            document.getElementById('freeSpins').textContent = '0/1';
            document.getElementById('spinActionBtn').innerHTML = '<i class="fas fa-play"></i> Крутить за 50 звёзд';
            document.getElementById('spinActionBtn').onclick = () => this.performSpin(false);
        }
    }

    openSpinWheel(isFree = false) {
        this.isFreeSpin = isFree;
        this.showModal('spinModal');
        
        // Инициализируем колесо
        this.initSpinWheel();
    }

    initSpinWheel() {
        const wheel = document.getElementById('spinWheel');
        wheel.innerHTML = '';
        
        // Создаем простое колесо для демо
        const sectors = [
            { text: 'Ничего', color: '#ff6b6b' },
            { text: 'Ничего', color: '#4ecdc4' },
            { text: 'Ничего', color: '#ff6b6b' },
            { text: 'NFT 1%', color: '#4ecdc4' },
            { text: 'Ничего', color: '#ff6b6b' },
            { text: 'Ничего', color: '#4ecdc4' },
            { text: 'Ничего', color: '#ff6b6b' },
            { text: 'Ничего', color: '#4ecdc4' }
        ];
        
        // Здесь будет код создания колеса
        // Для демо просто покажем текст
        wheel.innerHTML = `
            <div class="wheel-placeholder">
                <i class="fas fa-redo fa-4x"></i>
                <p>Колесо удачи</p>
                <small>Шанс выиграть NFT: 1%</small>
            </div>
        `;
    }

    async performSpin(isFree = false) {
        if (!isFree) {
            // Проверяем баланс
            if ((this.userData.stars || 0) < 50) {
                this.showNotification('Недостаточно звёзд для прокрутки', 'error');
                return;
            }
            
            // Списываем звёзды
            this.userData.stars -= 50;
        } else {
            // Отмечаем использование бесплатной прокрутки
            this.userData.lastFreeSpin = new Date().toISOString();
        }
        
        // Сохраняем данные
        localStorage.setItem('userData', JSON.stringify(this.userData));
        document.getElementById('starsCount').textContent = this.userData.stars;
        
        // Имитация вращения колеса
        const resultDiv = document.getElementById('spinResult');
        resultDiv.innerHTML = '<div class="loading-spinner"></div><p>Крутим...</p>';
        
        setTimeout(() => {
            // Результат
            const win = Math.random() < 0.01; // 1% шанс
            let resultHTML = '';
            
            if (win) {
                // Определяем какую NFT выиграли
                const nftNames = [
                    'Astral Shard', 'B-Day Candle', 'Berry Box', 'Crystal Ball',
                    'Diamond Ring', 'Eternal Rose', 'Gem Signet', 'Magic Potion'
                ];
                const wonNFT = nftNames[Math.floor(Math.random() * nftNames.length)];
                
                // Добавляем NFT в инвентарь
                if (!this.userData.nfts) {
                    this.userData.nfts = [];
                }
                
                const newNFT = {
                    id: Date.now(),
                    name: wonNFT,
                    value: 250,
                    source: 'spin'
                };
                
                this.userData.nfts.push(newNFT);
                localStorage.setItem('userData', JSON.stringify(this.userData));
                
                resultHTML = `
                    <div class="spin-win">
                        <i class="fas fa-trophy fa-2x"></i>
                        <h4>Поздравляем!</h4>
                        <p>Вы выиграли NFT: <strong>${wonNFT}</strong></p>
                        <p>Она добавлена в ваш инвентарь</p>
                    </div>
                `;
            } else {
                resultHTML = `
                    <div class="spin-lose">
                        <i class="fas fa-times-circle fa-2x"></i>
                        <h4>Повезёт в следующий раз!</h4>
                        <p>К сожалению, вы ничего не выиграли</p>
                        ${!isFree ? '<p>Попробуйте ещё раз завтра бесплатно</p>' : ''}
                    </div>
                `;
            }
            
            resultDiv.innerHTML = resultHTML;
            
            // Обновляем данные
            this.checkFreeSpins();
            
            if (win) {
                this.loadNFTs();
            }
            
        }, 2000);
    }

    openDemoSpin() {
        // Демо-режим прокрутки
        const resultDiv = document.getElementById('spinResult');
        resultDiv.innerHTML = '<div class="loading-spinner"></div><p>Демо-режим...</p>';
        
        setTimeout(() => {
            const win = Math.random() < 0.01;
            
            if (win) {
                resultDiv.innerHTML = `
                    <div class="spin-win">
                        <i class="fas fa-trophy fa-2x"></i>
                        <h4>Демо: Вы бы выиграли NFT!</h4>
                        <p>В реальной игре она бы добавилась в инвентарь</p>
                    </div>
                `;
            } else {
                resultDiv.innerHTML = `
                    <div class="spin-lose">
                        <i class="fas fa-times-circle fa-2x"></i>
                        <h4>Демо: Ничего не выиграно</h4>
                        <p>В реальной игре тоже может не повезти</p>
                    </div>
                `;
            }
        }, 1500);
    }

    copyReferralLink() {
        const linkInput = document.getElementById('referralLink');
        linkInput.select();
        linkInput.setSelectionRange(0, 99999);
        
        navigator.clipboard.writeText(linkInput.value)
            .then(() => {
                this.showNotification('Ссылка скопирована!', 'success');
            })
            .catch(() => {
                // Fallback
                document.execCommand('copy');
                this.showNotification('Ссылка скопирована!', 'success');
            });
    }

    checkWithdrawalConditions() {
        const nfts = this.userData.nfts || [];
        const eligibleNFTs = nfts.filter(nft => (nft.value || 250) >= 250);
        
        const hasMinNFTs = nfts.length >= 3;
        const hasValuableNFTs = eligibleNFTs.length >= 3;
        const totalValue = eligibleNFTs.reduce((sum, nft) => sum + (nft.value || 250), 0);
        const hasMinValue = totalValue >= 750;
        
        const canWithdraw = hasMinNFTs && hasValuableNFTs && hasMinValue;
        
        const withdrawBtn = document.getElementById('withdrawBtn');
        const withdrawHint = document.getElementById('withdrawHint');
        
        if (withdrawBtn) {
            withdrawBtn.disabled = !canWithdraw;
        }
        
        if (withdrawHint) {
            if (!canWithdraw) {
                let reason = '';
                if (!hasMinNFTs) reason = 'Необходимо минимум 3 NFT';
                else if (!hasValuableNFTs) reason = 'NFT должны стоить от 250 звёзд';
                else if (!hasMinValue) reason = 'Общая стоимость должна быть от 750 звёзд';
                withdrawHint.textContent = `Для вывода необходимо выполнить все условия: ${reason}`;
            } else {
                withdrawHint.textContent = 'Все условия для вывода выполнены!';
            }
        }
    }

    checkWithdrawal() {
        this.showModal('withdrawModal');
        
        const nfts = this.userData.nfts || [];
        const eligibleNFTs = nfts.filter(nft => (nft.value || 250) >= 250);
        const totalValue = eligibleNFTs.reduce((sum, nft) => sum + (nft.value || 250), 0);
        
        const infoDiv = document.getElementById('withdrawInfo');
        infoDiv.innerHTML = `
            <div class="withdraw-summary">
                <h4>Детали вывода</h4>
                <div class="summary-item">
                    <span>NFT для вывода:</span>
                    <strong>${eligibleNFTs.length} шт.</strong>
                </div>
                <div class="summary-item">
                    <span>Общая стоимость:</span>
                    <strong>${totalValue} звёзд</strong>
                </div>
                <div class="summary-item">
                    <span>Комиссия:</span>
                    <strong>5% (${Math.floor(totalValue * 0.05)} звёзд)</strong>
                </div>
                <div class="summary-item total">
                    <span>К получению:</span>
                    <strong>${Math.floor(totalValue * 0.95)} звёзд</strong>
                </div>
                <div class="warning-box">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>После вывода выбранные NFT будут удалены из инвентаря</p>
                </div>
            </div>
        `;
    }

    processWithdrawal() {
        const nfts = this.userData.nfts || [];
        const eligibleNFTs = nfts.filter(nft => (nft.value || 250) >= 250);
        const totalValue = eligibleNFTs.reduce((sum, nft) => sum + (nft.value || 250), 0);
        const amountToReceive = Math.floor(totalValue * 0.95);
        
        // В реальном приложении здесь будет запрос к API для обработки вывода
        // Для демо просто удаляем NFT и добавляем звёзды
        
        // Удаляем NFT
        this.userData.nfts = this.userData.nfts.filter(nft => (nft.value || 250) < 250);
        
        // Добавляем звёзды
        this.userData.stars = (this.userData.stars || 0) + amountToReceive;
        
        // Сохраняем
        localStorage.setItem('userData', JSON.stringify(this.userData));
        
        // Обновляем UI
        this.loadNFTs();
        document.getElementById('starsCount').textContent = this.userData.stars;
        this.checkWithdrawalConditions();
        
        this.closeModal('withdrawModal');
        this.showNotification(`Вывод успешен! Получено ${amountToReceive} звёзд`, 'success');
    }

    showNFTDetails(nft) {
        // Показываем детали NFT
        alert(`NFT: ${nft.name}\nСтоимость: ${nft.value || 250} звёзд\n\nИспользуйте эту NFT для апгрейда или вывода.`);
    }

    showNFTInfo() {
        this.showNotification('NFT - это уникальные цифровые активы. В этом приложении вы можете хранить, улучшать и обменивать их на звёзды.', 'info');
    }

    showNotification(message, type = 'info') {
        // Создаем уведомление
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Удаляем через 3 секунды
        setTimeout(() => {
            notification.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Инициализация приложения при загрузке страницы
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new NFTApp();
    
    // Обновляем активные апгрейды каждую минуту
    setInterval(() => {
        app.updateActiveUpgrades();
    }, 60000);
    
    // Инициализируем активные апгрейды
    app.updateActiveUpgrades();
});

// Глобальные функции для вызова из HTML
window.showDepositInstructions = () => app.showDepositInstructions();
window.closeModal = (modalId) => app.closeModal(modalId);
window.openSpinWheel = (isFree) => app.openSpinWheel(isFree);
window.openDemoSpin = () => app.openDemoSpin();
window.addStars = () => app.addStars();
window.copyReferralLink = () => app.copyReferralLink();
window.checkWithdrawal = () => app.checkWithdrawal();
window.processWithdrawal = () => app.processWithdrawal();
window.startUpgrade = () => app.startUpgrade();
window.performSpin = (isFree) => app.performSpin(isFree);