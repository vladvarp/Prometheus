
    const fsBtn = document.getElementById('fullscreenBtn');
    const FS_KEY = 'prometheus_fullscreen';
    function enterFS() { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); }
    function exitFS() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
    fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) { localStorage.setItem(FS_KEY, '1'); enterFS(); }
      else { localStorage.removeItem(FS_KEY); exitFS(); }
    });
    document.addEventListener('fullscreenchange', () => {
      fsBtn.textContent = document.fullscreenElement ? '✕' : '⛶';
      fsBtn.title = document.fullscreenElement ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим';
    });
    if (!/iPhone|iPad|iPod/i.test(navigator.userAgent) && localStorage.getItem(FS_KEY) === '1') enterFS();
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) fsBtn.style.display = 'none';

    // Автоскрытие: показать на 3 сек, скрыть, при скролле вверх снова показать
    let hideTimer = null;
    let scrolledDown = false;
    function showBtn3s() {
      fsBtn.style.opacity = '1';
      fsBtn.style.pointerEvents = 'auto';
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { fsBtn.style.opacity = '0'; fsBtn.style.pointerEvents = 'none'; }, 3000);
    }
    fsBtn.style.transition = '0.3s ease, opacity 0.4s ease';
    showBtn3s();
    window.addEventListener('scroll', () => {
      const sy = window.scrollY || document.documentElement.scrollTop;
      if (sy > 60) scrolledDown = true;
      else if (scrolledDown && sy <= 60) { scrolledDown = false; showBtn3s(); }
    });
  
