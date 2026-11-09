
    const btn = document.getElementById('fullscreenBtn');
    const FS_KEY = 'prometheus_fullscreen';

    function enterFS() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
    function exitFS() {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }

    btn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        localStorage.setItem(FS_KEY, '1');
        enterFS();
      } else {
        localStorage.removeItem(FS_KEY);
        exitFS();
      }
    });

    document.addEventListener('fullscreenchange', () => {
      btn.textContent = document.fullscreenElement ? '✕' : '⛶';
      btn.title = document.fullscreenElement ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим';
    });

    // Скрыть кнопку на iOS — Fullscreen API не поддерживается для страниц
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIOS) {
      btn.style.display = 'none';
    } else if (localStorage.getItem(FS_KEY) === '1') {
      enterFS();
    }

    // Автоскрытие: показать на 3 сек, скрыть, при скролле вверх снова показать
    let hideTimer = null;
    let scrolledDown = false;

    function showBtn3s() {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        btn.style.opacity = '0';
        btn.style.pointerEvents = 'none';
      }, 3000);
    }

    btn.style.transition = '0.3s ease, opacity 0.4s ease';
    showBtn3s();

    window.addEventListener('scroll', () => {
      const sy = window.scrollY || document.documentElement.scrollTop;
      if (sy > 60) {
        scrolledDown = true;
      } else if (scrolledDown && sy <= 60) {
        scrolledDown = false;
        showBtn3s();
      }
    });
  
