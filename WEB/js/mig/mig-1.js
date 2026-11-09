
        function copySubscription() {
            const url = "https://raw.githubusercontent.com/vladvarp/Prometheus/refs/heads/main/WhiteList/vless.txt";
            
            navigator.clipboard.writeText(url).then(() => {
                const toast = document.getElementById('toast');
                toast.classList.add('show');
                
                setTimeout(() => {
                    toast.classList.remove('show');
                }, 2500);
            }).catch(err => {
                console.error('Ошибка копирования: ', err);
                alert('Не удалось скопировать автоматически. Скопируйте вручную: ' + url);
            });
        }
    
