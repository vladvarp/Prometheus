// Функция для выполнения теста подключения к YouTube через сервер
async function testYouTube() {
    const button = document.getElementById('youtube-test-btn');
    const resultsContainer = document.getElementById('youtube-results');
    const progressBar = document.getElementById('youtube-progress');
    
    // Отображаем состояние загрузки
    button.disabled = true;
    button.innerHTML = '<span class="loading"></span> Проверка...';
    progressBar.style.width = '0%';
    
    try {
        const response = await fetch('./test.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                service: 'youtube',
                action: 'connect'
            })
        });
        
        const data = await response.json();
        
        // Обновляем прогресс бар
        progressBar.style.width = '100%';
        
        if (data.success) {
            // Отображаем успешный результат
            resultsContainer.innerHTML = `
                <div class="result-item success">
                    <div class="result-info">
                        <div><strong>Подключение к YouTube:</strong> Успешно</div>
                        <div>Статус: ${data.status}</div>
                    </div>
                    <div class="result-time">${data.time} мс</div>
                </div>
            `;
        } else {
            // Отображаем ошибку
            resultsContainer.innerHTML = `
                <div class="result-item error">
                    <div class="result-info">
                        <div><strong>Подключение к YouTube:</strong> Ошибка</div>
                        <div>Статус: ${data.status}</div>
                    </div>
                    <div class="result-time">-</div>
                </div>
            `;
        }
    } catch (error) {
        // Обновляем прогресс бар
        progressBar.style.width = '100%';
        
        // Отображаем ошибку
        resultsContainer.innerHTML = `
            <div class="result-item error">
                <div class="result-info">
                    <div><strong>Подключение к YouTube:</strong> Ошибка</div>
                    <div>Ошибка: ${error.message}</div>
                </div>
                <div class="result-time">-</div>
            </div>
        `;
    } finally {
        // Восстанавливаем кнопку
        setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Тестировать подключение';
        }, 1000);
    }
}

// Функция для тестирования скорости YouTube через сервер
async function testYouTubeSpeed() {
    const button = document.getElementById('youtube-speed-btn');
    const resultsContainer = document.getElementById('youtube-results');
    const progressBar = document.getElementById('youtube-progress');
    
    // Отображаем состояние загрузки
    button.disabled = true;
    button.innerHTML = '<span class="loading"></span> Тестирование...';
    progressBar.style.width = '0%';
    
    try {
        const response = await fetch('./test.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                service: 'youtube',
                action: 'speed'
            })
        });
        
        const data = await response.json();
        
        // Обновляем прогресс бар
        progressBar.style.width = '100%';
        
        if (data.success) {
            // Отображаем успешный результат
            resultsContainer.innerHTML = `
                <div class="result-item success">
                    <div class="result-info">
                        <div><strong>Скорость YouTube:</strong> Успешно</div>
                        <div>Размер: ${data.size} байт</div>
                    </div>
                    <div class="result-time">${data.time} мс</div>
                </div>
            `;
        } else {
            // Отображаем ошибку
            resultsContainer.innerHTML = `
                <div class="result-item error">
                    <div class="result-info">
                        <div><strong>Скорость YouTube:</strong> Ошибка</div>
                        <div>Статус: ${data.status}</div>
                    </div>
                    <div class="result-time">-</div>
                </div>
            `;
        }
    } catch (error) {
        // Обновляем прогресс бар
        progressBar.style.width = '100%';
        
        // Отображаем ошибку
        resultsContainer.innerHTML = `
            <div class="result-item error">
                <div class="result-info">
                    <div><strong>Скорость YouTube:</strong> Ошибка</div>
                    <div>Ошибка: ${error.message}</div>
                </div>
                <div class="result-time">-</div>
            </div>
        `;
    } finally {
        // Восстанавливаем кнопку
        setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Тестировать скорость';
        }, 1000);
    }
}

// Функция для выполнения теста подключения к Telegram через сервер
async function testTelegram() {
    const button = document.getElementById('telegram-test-btn');
    const resultsContainer = document.getElementById('telegram-results');
    const progressBar = document.getElementById('telegram-progress');
    
    // Отображаем состояние загрузки
    button.disabled = true;
    button.innerHTML = '<span class="loading"></span> Проверка...';
    progressBar.style.width = '0%';
    
    try {
        const response = await fetch('./test.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                service: 'telegram',
                action: 'connect'
            })
        });
        
        const data = await response.json();
        
        // Обновляем прогресс бар
        progressBar.style.width = '100%';
        
        if (data.success) {
            // Отображаем успешный результат
            resultsContainer.innerHTML = `
                <div class="result-item success">
                    <div class="result-info">
                        <div><strong>Подключение к Telegram:</strong> Успешно</div>
                        <div>Статус: ${data.status}</div>
                    </div>
                    <div class="result-time">${data.time} мс</div>
                </div>
            `;
        } else {
            // Отображаем ошибку
            resultsContainer.innerHTML = `
                <div class="result-item error">
                    <div class="result-info">
                        <div><strong>Подключение к Telegram:</strong> Ошибка</div>
                        <div>Статус: ${data.status}</div>
                    </div>
                    <div class="result-time">-</div>
                </div>
            `;
        }
    } catch (error) {
        // Обновляем прогресс бар
        progressBar.style.width = '100%';
        
        // Отображаем ошибку
        resultsContainer.innerHTML = `
            <div class="result-item error">
                <div class="result-info">
                    <div><strong>Подключение к Telegram:</strong> Ошибка</div>
                    <div>Ошибка: ${error.message}</div>
                </div>
                <div class="result-time">-</div>
            </div>
        `;
    } finally {
        // Восстанавливаем кнопку
        setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Тестировать подключение';
        }, 1000);
    }
}

// Функция для тестирования скорости Telegram через сервер
async function testTelegramSpeed() {
    const button = document.getElementById('telegram-speed-btn');
    const resultsContainer = document.getElementById('telegram-results');
    const progressBar = document.getElementById('telegram-progress');
    
    // Отображаем состояние загрузки
    button.disabled = true;
    button.innerHTML = '<span class="loading"></span> Тестирование...';
    progressBar.style.width = '0%';
    
    try {
        const response = await fetch('./test.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                service: 'telegram',
                action: 'speed'
            })
        });
        
        const data = await response.json();
        
        // Обновляем прогресс бар
        progressBar.style.width = '100%';
        
        if (data.success) {
            // Отображаем успешный результат
            resultsContainer.innerHTML = `
                <div class="result-item success">
                    <div class="result-info">
                        <div><strong>Скорость Telegram:</strong> Успешно</div>
                        <div>Размер: ${data.size} байт</div>
                    </div>
                    <div class="result-time">${data.time} мс</div>
                </div>
            `;
        } else {
            // Отображаем ошибку
            resultsContainer.innerHTML = `
                <div class="result-item error">
                    <div class="result-info">
                        <div><strong>Скорость Telegram:</strong> Ошибка</div>
                        <div>Статус: ${data.status}</div>
                    </div>
                    <div class="result-time">-</div>
                </div>
            `;
        }
    } catch (error) {
        // Обновляем прогресс бар
        progressBar.style.width = '100%';
        
        // Отображаем ошибку
        resultsContainer.innerHTML = `
            <div class="result-item error">
                <div class="result-info">
                    <div><strong>Скорость Telegram:</strong> Ошибка</div>
                    <div>Ошибка: ${error.message}</div>
                </div>
                <div class="result-time">-</div>
            </div>
        `;
    } finally {
        // Восстанавливаем кнопку
        setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Тестировать скорость';
        }, 1000);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('Тестер подключения загружен');
});