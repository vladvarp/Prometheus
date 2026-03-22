// Функция для проверки доступности YouTube через сервер
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
                        <div><strong>YouTube:</strong> Доступен</div>
                        <div>Статус: ${data.status}</div>
                    </div>
                    <div class="result-time">${data.time} мс</div>
                </div>
            `;
        } else {
            // Отображаем ошибку с деталями
            let errorMessage = `Статус: ${data.status}`;
            if (data.error) {
                errorMessage += `<br>Ошибка: ${data.error}`;
            }
            resultsContainer.innerHTML = `
                <div class="result-item error">
                    <div class="result-info">
                        <div><strong>YouTube:</strong> Недоступен</div>
                        <div>${errorMessage}</div>
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
                    <div><strong>YouTube:</strong> Ошибка проверки</div>
                    <div>Ошибка сети: ${error.message}</div>
                    <div>Убедитесь, что сервер работает и PHP доступен</div>
                </div>
                <div class="result-time">-</div>
            </div>
        `;
    } finally {
        // Восстанавливаем кнопку
        setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Проверить доступность';
        }, 1000);
    }
}

// Функция для проверки доступности Telegram через сервер
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
                        <div><strong>Telegram:</strong> Доступен</div>
                        <div>Статус: ${data.status}</div>
                    </div>
                    <div class="result-time">${data.time} мс</div>
                </div>
            `;
        } else {
            // Отображаем ошибку с деталями
            let errorMessage = `Статус: ${data.status}`;
            if (data.error) {
                errorMessage += `<br>Ошибка: ${data.error}`;
            }
            resultsContainer.innerHTML = `
                <div class="result-item error">
                    <div class="result-info">
                        <div><strong>Telegram:</strong> Недоступен</div>
                        <div>${errorMessage}</div>
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
                    <div><strong>Telegram:</strong> Ошибка проверки</div>
                    <div>Ошибка сети: ${error.message}</div>
                    <div>Убедитесь, что сервер работает и PHP доступен</div>
                </div>
                <div class="result-time">-</div>
            </div>
        `;
    } finally {
        // Восстанавливаем кнопку
        setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Проверить доступность';
        }, 1000);
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('Тестер доступности сайтов загружен');
});