
    let subs = [];
    let editIndex = -1;
    let fileHandle = null;
    let savedSnapshot = '';
    let baselineLabel = 'содержимое страницы';
    let lastSavedAt = null;
    let saving = false;
    const IDB_NAME = 'solist-admin';
    const IDB_STORE = 'handles';
    const IDB_KEY = 'solist-subs-js';

    function cloneSubs(list) {
      return JSON.parse(JSON.stringify(list || []));
    }

    function normalizeSubs(list) {
      return (list || []).map((item) => ({
        name: item.name || '',
        link: item.link || '',
        updt: item.updt || '',
        updtAlt: item.updtAlt || '',
        hidden: !!item.hidden
      }));
    }

    function snapshotOf(list) {
      return JSON.stringify(normalizeSubs(list));
    }

    function isDirty() {
      return snapshotOf(subs) !== savedSnapshot;
    }

    function formatTime(date) {
      if (!date) return '';
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function updateSaveIndicator(opts) {
      const bar = document.getElementById('saveBar');
      const pill = document.getElementById('savePillText');
      const meta = document.getElementById('saveMeta');
      const btn = document.getElementById('btnSaveCurrent');
      const dirty = isDirty();
      bar.classList.remove('is-dirty', 'is-clean', 'is-saving');
      btn.classList.remove('is-dirty-glow', 'is-saved-flash');

      if (saving || (opts && opts.saving)) {
        bar.classList.add('is-saving');
        pill.textContent = 'Сохранение…';
        meta.textContent = 'Запись в ' + (fileHandle ? (fileHandle.name || 'subs.js') : 'файл') + '…';
        return;
      }

      if (dirty) {
        bar.classList.add('is-dirty');
        pill.textContent = 'Не сохранено';
        meta.textContent = 'Список отличается от эталона («' + baselineLabel + '»). Нажмите «Сохранить в subs.js».'
          + (lastSavedAt ? ' Последнее сохранение: ' + formatTime(lastSavedAt) + '.' : '');
        btn.classList.add('is-dirty-glow');
        btn.textContent = '💾 Сохранить';
        btn.title = 'Есть несохранённые изменения — записать в привязанный subs.js';
      } else {
        bar.classList.add('is-clean');
        pill.textContent = 'Сохранено';
        meta.textContent = (lastSavedAt
          ? ('Совпадает с эталоном · сохранено в ' + formatTime(lastSavedAt))
          : ('Совпадает с эталоном («' + baselineLabel + '»)'))
          + (fileHandle ? ' · файл: ' + (fileHandle.name || 'subs.js') : '');
        btn.textContent = '💾 Сохранить';
        btn.title = fileHandle
          ? ('Записать в привязанный файл «' + (fileHandle.name || 'subs.js') + '»')
          : 'Сначала привяжите WEB/js/solist/subs.js, затем сохраните';
        if (opts && opts.justSaved) {
          btn.classList.add('is-saved-flash');
          setTimeout(() => btn.classList.remove('is-saved-flash'), 1600);
        }
      }
    }

    function markClean(label) {
      savedSnapshot = snapshotOf(subs);
      if (label) baselineLabel = label;
      lastSavedAt = new Date();
      updateSaveIndicator({ justSaved: true });
    }

    function markDirty() {
      updateSaveIndicator();
    }

    function setStatus(msg, isError) {
      const el = document.getElementById('status');
      el.textContent = msg || '';
      el.classList.toggle('error', !!isError);
    }

    function setBindStatus(msg, kind) {
      const el = document.getElementById('fileBindStatus');
      el.textContent = msg;
      el.classList.remove('ok', 'warn');
      if (kind) el.classList.add(kind);
    }

    function openIdb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async function idbGet(key) {
      const db = await openIdb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    async function idbSet(key, value) {
      const db = await openIdb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    async function ensureWritePermission(handle) {
      const opts = { mode: 'readwrite' };
      if ((await handle.queryPermission(opts)) === 'granted') return true;
      if ((await handle.requestPermission(opts)) === 'granted') return true;
      return false;
    }

    async function writeToHandle(handle) {
      const writable = await handle.createWritable();
      await writable.write(buildSolistSubsFile(subs));
      await writable.close();
    }

    async function restoreBoundFile() {
      if (!window.showOpenFilePicker) {
        setBindStatus('Этот браузер не умеет писать в файл напрямую (нужен Chrome/Edge). Используйте «Скачать копию».', 'warn');
        updateSaveIndicator();
        return;
      }
      try {
        const handle = await idbGet(IDB_KEY);
        if (!handle) {
          updateSaveIndicator();
          return;
        }
        const ok = await ensureWritePermission(handle);
        if (!ok) {
          setBindStatus('Ранее привязанный файл найден, но нет разрешения на запись — нажмите «Привязать…» снова.', 'warn');
          updateSaveIndicator();
          return;
        }
        fileHandle = handle;
        setBindStatus('Привязан файл: ' + (handle.name || 'subs.js') + ' — можно сохранять напрямую.', 'ok');
        // Сравнить редактор с содержимым файла на диске
        try {
          const file = await handle.getFile();
          const diskSubs = parseSubsFromSource(await file.text());
          savedSnapshot = snapshotOf(diskSubs);
          baselineLabel = handle.name || 'subs.js';
          if (isDirty()) {
            setStatus('Редактор отличается от файла на диске — есть несохранённые изменения', true);
          }
          updateSaveIndicator();
        } catch (e) {
          updateSaveIndicator();
        }
      } catch (e) {
        setBindStatus('Не удалось восстановить привязку файла. Нажмите «Привязать subs.js…».', 'warn');
        updateSaveIndicator();
      }
    }

    async function bindCurrentFile() {
      try {
        if (!window.showOpenFilePicker) {
          setStatus('Прямое сохранение недоступно в этом браузере — скачайте копию файла', true);
          return;
        }
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: 'subs.js', accept: { 'text/javascript': ['.js'] } }]
        });
        if (!handle) return;
        if (handle.name && handle.name !== 'subs.js' && handle.name !== 'solist-subs.js') {
          const go = confirm('Выбран «' + handle.name + '». Обычно нужен WEB/js/solist/subs.js. Продолжить?');
          if (!go) return;
        }
        const ok = await ensureWritePermission(handle);
        if (!ok) {
          setStatus('Нет разрешения на запись в файл', true);
          return;
        }
        const file = await handle.getFile();
        await loadFromText(await file.text(), handle.name || 'subs.js');
        fileHandle = handle;
        await idbSet(IDB_KEY, handle);
        setBindStatus('Привязан файл: ' + handle.name + ' — «Сохранить в subs.js» будет писать сюда.', 'ok');
        setStatus('Файл привязан и загружен');
        updateSaveIndicator();
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        setStatus('Не удалось привязать файл: ' + e.message, true);
      }
    }

    async function saveToCurrentFile() {
      try {
        if (!window.showOpenFilePicker && !fileHandle) {
          downloadFile();
          setStatus('Браузер не поддерживает прямую запись — скачана копия subs.js', true);
          return;
        }
        if (!fileHandle) {
          setStatus('Сначала привяжите WEB/js/solist/subs.js');
          await bindCurrentFile();
          if (!fileHandle) return;
        }
        const ok = await ensureWritePermission(fileHandle);
        if (!ok) {
          setStatus('Нет разрешения на запись — привяжите файл заново', true);
          fileHandle = null;
          updateSaveIndicator();
          return;
        }
        saving = true;
        updateSaveIndicator({ saving: true });
        await writeToHandle(fileHandle);
        saving = false;
        markClean(fileHandle.name || 'subs.js');
        setStatus('✓ Сохранено в ' + (fileHandle.name || 'subs.js') + ' · ' + formatTime(lastSavedAt));
        setBindStatus('Привязан файл: ' + (fileHandle.name || 'subs.js') + ' — сохранено только что.', 'ok');
      } catch (e) {
        saving = false;
        updateSaveIndicator();
        if (e && e.name === 'AbortError') return;
        setStatus('Ошибка сохранения: ' + e.message, true);
      }
    }

    function fillForm(item, index, opts) {
      editIndex = typeof index === 'number' ? index : -1;
      document.getElementById('fName').value = item?.name || '';
      document.getElementById('fLink').value = item?.link || '';
      document.getElementById('fUpdt').value = item?.updt || '';
      document.getElementById('fUpdtAlt').value = item?.updtAlt || '';
      if (!opts || opts.render !== false) renderList();
    }

    function readForm() {
      const name = document.getElementById('fName').value.trim();
      const link = document.getElementById('fLink').value.trim();
      const item = {
        name: name || 'Новая подписка',
        link
      };
      const updt = document.getElementById('fUpdt').value.trim();
      const updtAlt = document.getElementById('fUpdtAlt').value.trim();
      if (updt) item.updt = updt;
      if (updtAlt) item.updtAlt = updtAlt;
      // hidden управляется только глазиком на плитке
      if (editIndex >= 0 && subs[editIndex] && subs[editIndex].hidden) item.hidden = true;
      return item;
    }

    function applyFormToList() {
      if (editIndex < 0 || editIndex >= subs.length) return;
      const next = readForm();
      const prevSnap = snapshotOf([subs[editIndex]]);
      const nextSnap = snapshotOf([next]);
      if (prevSnap === nextSnap) return;
      subs[editIndex] = next;
      renderList();
      markDirty();
      setStatus('Поле обновлено в списке (не сохранено в файл)');
    }

    function addNewItem() {
      applyFormToList();
      const item = { name: 'Новая подписка', link: '' };
      subs.unshift(item);
      editIndex = 0;
      fillForm(item, editIndex);
      markDirty();
      setStatus('Добавлена новая подписка');
      const nameInput = document.getElementById('fName');
      nameInput.focus();
      nameInput.select();
    }

    function moveSub(from, to) {
      if (from === to || from < 0 || to < 0 || from >= subs.length || to >= subs.length) return;
      const [item] = subs.splice(from, 1);
      subs.splice(to, 0, item);
      if (editIndex === from) editIndex = to;
      else if (from < editIndex && to >= editIndex) editIndex -= 1;
      else if (from > editIndex && to <= editIndex) editIndex += 1;
      renderList();
      markDirty();
      setStatus('Порядок изменён (не сохранено в файл)');
    }

    function bindCardDrag(card) {
      const handle = card.querySelector('.drag-handle');
      if (!handle) return;
      handle.addEventListener('dragstart', (e) => {
        applyFormToList();
        const i = Number(card.getAttribute('data-i'));
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
        card.classList.add('is-dragging');
        // небольшой прозрачный drag-image выглядит стабильнее
        try { e.dataTransfer.setDragImage(card, 20, 20); } catch (err) {}
      });
      handle.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        document.querySelectorAll('.card.drag-over').forEach((el) => el.classList.remove('drag-over'));
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const from = Number(e.dataTransfer.getData('text/plain'));
        const to = Number(card.getAttribute('data-i'));
        if (Number.isNaN(from) || Number.isNaN(to)) return;
        moveSub(from, to);
      });
    }

    function renderList() {
      const box = document.getElementById('subsList');
      box.innerHTML = subs.map((item, i) => `
        <div class="card${item.hidden ? ' is-hidden' : ''}${editIndex === i ? ' is-active' : ''}" data-i="${i}">
          <span class="drag-handle" draggable="true" title="Зажмите и перетащите, чтобы изменить порядок">⋮⋮</span>
          <div class="card-name" title="${item.link ? ('Ссылка: ' + escapeHtml(item.link)) : 'Ссылка не задана'}">
            ${escapeHtml(item.name)}
            ${item.hidden ? '<span class="badge" title="Не показывается на SOLIST.html">скрыта</span>' : ''}
          </div>
          <div class="card-actions">
            <button type="button" class="btn" data-act="edit" title="Редактировать в форме сверху">${iconPen()}</button>
            <button type="button" class="btn" data-act="dup" title="Создать копию этой подписки">${iconCopy()}</button>
            <button type="button" class="btn" data-act="hide" title="${item.hidden ? 'Показать на SOLIST' : 'Скрыть на SOLIST (останется в файле)'}">${item.hidden ? iconEyeOff() : iconEye()}</button>
            <button type="button" class="btn" data-act="up" title="Переместить выше">↑</button>
            <button type="button" class="btn" data-act="down" title="Переместить ниже">↓</button>
            <button type="button" class="btn btn-danger" data-act="del" title="Удалить из списка">${iconTrash()}</button>
          </div>
        </div>
      `).join('') || '<div class="preview-note">Список пуст — добавьте подписку.</div>';

      box.querySelectorAll('.card').forEach((card) => {
        const i = Number(card.getAttribute('data-i'));
        card.querySelectorAll('[data-act]').forEach((btn) => {
          btn.onclick = () => onCardAction(btn.getAttribute('data-act'), i);
        });
        bindCardDrag(card);
      });
      renderPreview();
    }

    function iconPen() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    }
    function iconCopy() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    }
    function iconEye() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
    function iconEyeOff() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.9 21.9 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';
    }
    function iconTrash() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
    }

    function onCardAction(act, i) {
      if (act === 'edit') {
        applyFormToList();
        fillForm(subs[i], i);
        return;
      }
      if (act === 'dup') {
        applyFormToList();
        const copy = cloneSubs([subs[i]])[0];
        copy.name = (copy.name || 'Подписка') + ' (копия)';
        subs.splice(i + 1, 0, copy);
        editIndex = i + 1;
        fillForm(subs[editIndex], editIndex);
        markDirty();
        setStatus('Создана копия (не сохранено в файл)');
        return;
      }
      if (act === 'hide') {
        if (subs[i].hidden) delete subs[i].hidden;
        else subs[i].hidden = true;
        renderList();
        markDirty();
        setStatus(subs[i].hidden ? 'Подписка скрыта (не сохранено в файл)' : 'Подписка снова видима (не сохранено в файл)');
        return;
      }
      if (act === 'up' && i > 0) {
        [subs[i - 1], subs[i]] = [subs[i], subs[i - 1]];
        if (editIndex === i) editIndex = i - 1;
        else if (editIndex === i - 1) editIndex = i;
        renderList();
        markDirty();
        return;
      }
      if (act === 'down' && i < subs.length - 1) {
        [subs[i + 1], subs[i]] = [subs[i], subs[i + 1]];
        if (editIndex === i) editIndex = i + 1;
        else if (editIndex === i + 1) editIndex = i;
        renderList();
        markDirty();
        return;
      }
      if (act === 'del') {
        if (!confirm('Удалить «' + subs[i].name + '»?')) return;
        subs.splice(i, 1);
        if (editIndex === i) fillForm(null, -1);
        else if (editIndex > i) editIndex -= 1;
        renderList();
        markDirty();
        setStatus('Удалено из списка (не сохранено в файл)');
      }
    }

    async function fetchTextShared(url) {
      if (typeof window.fetchText === 'function') return window.fetchText(url);
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.ok) return await r.text();
      } catch (e) {}
      return '';
    }

    function renderPreview() {
      const box = document.getElementById('previewBox');
      const token = (renderPreview._token = (renderPreview._token || 0) + 1);
      box.innerHTML = subs.map((item, i) => `
        <button type="button" class="proxy-button${item.hidden ? ' is-dim' : ''}" data-i="${i}">
          <span class="proxy-button-name">${escapeHtml(item.name)}</span>
          ${item.updt ? `<span class="proxy-button-updt" data-updt="${i}">обновлено …</span>` : ''}
          ${item.hidden ? '<span class="proxy-button-updt">скрыта</span>' : ''}
        </button>
      `).join('') || '<div class="preview-note">Нет кнопок</div>';
      box.querySelectorAll('.proxy-button').forEach((btn) => {
        btn.onclick = () => {
          applyFormToList();
          const idx = Number(btn.getAttribute('data-i'));
          const item = subs[idx];
          if (!item) return;
          fillForm(item, idx, { render: false });
          if (typeof window.openPreview === 'function') window.openPreview(item);
          else setStatus('Предпросмотр не загружен (js/solist/preview.js)', true);
        };
      });
      subs.forEach((item, i) => {
        if (!item.updt) return;
        const load = typeof window.loadUpdt === 'function' ? window.loadUpdt : null;
        if (!load) return;
        load(item.updt).then((text) => {
          if (token !== renderPreview._token) return;
          const el = box.querySelector(`[data-updt="${i}"]`);
          if (!el) return;
          if (text) el.textContent = 'обновлено ' + text;
          else el.remove();
        });
      });
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    const SEARCH_PRESETS = [
      { label: 'vless russia', q: 'vless russia' },
      { label: 'whitelist russia', q: 'whitelist russia vpn' },
      { label: 'free vless', q: 'free vless configs' },
      { label: 'vpn-configs', q: 'vpn-configs vless' },
      { label: 'CIDR RU', q: 'WHITE-CIDR RU vless' },
      { label: 'hysteria', q: 'hysteria2 free config' }
    ];

    const FILE_NAME_HINT = /(?:vless|vpn|proxy|config|sub|list|mirror|white|cidr|nodes?|servers?)/i;
    const FILE_EXT_OK = /\.(txt|yaml|yml|conf|list|sub)$/i;
    const searchCache = new Map();

    function setSearchStatus(msg, isError) {
      const el = document.getElementById('subSearchStatus');
      el.textContent = msg || '';
      el.classList.toggle('is-error', !!isError);
    }

    function formatAgo(iso) {
      if (!iso) return '—';
      const t = new Date(iso).getTime();
      if (!Number.isFinite(t)) return iso.slice(0, 10);
      const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
      if (sec < 60) return sec + ' с назад';
      const min = Math.round(sec / 60);
      if (min < 60) return min + ' мин назад';
      const h = Math.round(min / 60);
      if (h < 48) return h + ' ч назад';
      const d = Math.round(h / 24);
      if (d < 60) return d + ' дн назад';
      return new Date(t).toLocaleDateString('ru-RU');
    }

    function parseGithubRepoRef(input) {
      const raw = String(input || '').trim();
      if (!raw) return null;
      let m = raw.match(/^https?:\/\/github\.com\/([^\/\s#]+)\/([^\/\s#]+)(?:\/.*)?$/i);
      if (m) return { owner: m[1], repo: m[2].replace(/\.git$/i, '') };
      m = raw.match(/^([^\/\s#]+)\/([^\/\s#]+)$/);
      if (m && !raw.includes(' ')) return { owner: m[1], repo: m[2].replace(/\.git$/i, '') };
      return null;
    }

    function rawGithubUrl(owner, repo, branch, path) {
      return 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/' + path.split('/').map(encodeURIComponent).join('/');
    }

    function commitsUpdt(owner, repo) {
      return 'https://api.github.com/repos/' + owner + '/' + repo + '/commits||"date":';
    }

    function linkAlreadyInList(link) {
      const base = String(link || '').split('#')[0];
      return subs.some((s) => String(s.link || '').split('#')[0] === base);
    }

    async function ghFetchJson(url) {
      const r = await fetch(url, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      });
      if (r.status === 403) {
        const reset = r.headers.get('X-RateLimit-Reset');
        const when = reset ? new Date(Number(reset) * 1000).toLocaleTimeString('ru-RU') : '';
        throw new Error('Лимит GitHub API' + (when ? ' (сброс ~' + when + ')' : '') + '. Подождите или откройте репо по URL.');
      }
      if (!r.ok) throw new Error('GitHub HTTP ' + r.status);
      return r.json();
    }

    function countProtocols(text) {
      if (!text) return { total: 0, kinds: {} };
      let content = text;
      try {
        const cleaned = text.replace(/\s+/g, '');
        if (cleaned.length > 32 && /^[A-Za-z0-9+/=_-]+$/.test(cleaned)) {
          const decoded = atob(cleaned.replace(/-/g, '+').replace(/_/g, '/'));
          if (/vless:\/\/|vmess:\/\/|trojan:\/\/|ss:\/\/|hysteria2?:\/\//i.test(decoded)) content = decoded;
        }
      } catch (e) {}
      const kinds = {
        VLESS: (content.match(/vless:\/\//gi) || []).length,
        VMess: (content.match(/vmess:\/\//gi) || []).length,
        Trojan: (content.match(/trojan:\/\//gi) || []).length,
        SS: (content.match(/(?:^|[\s"'])ss:\/\//gim) || []).length,
        Hy2: (content.match(/hysteria2?:\/\//gi) || []).length
      };
      const total = Object.values(kinds).reduce((a, b) => a + b, 0);
      return { total, kinds };
    }

    function scoreFilePath(path) {
      const name = path.split('/').pop() || path;
      let score = 0;
      if (FILE_EXT_OK.test(name)) score += 3;
      if (FILE_NAME_HINT.test(path)) score += 4;
      if (/readme|license|changelog|\.md$/i.test(path)) score -= 5;
      if (path.split('/').length <= 2) score += 1;
      return score;
    }

    function pickCandidateFiles(tree) {
      return (tree || [])
        .filter((n) => n.type === 'blob')
        .filter((n) => FILE_EXT_OK.test(n.path) || FILE_NAME_HINT.test(n.path))
        .filter((n) => !/\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|rar|7z|exe|dll)$/i.test(n.path))
        .map((n) => ({ path: n.path, score: scoreFilePath(n.path), size: n.size || 0 }))
        .filter((n) => n.score > 0)
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
        .slice(0, 18);
    }

    function renderSearchChips() {
      const box = document.getElementById('subSearchChips');
      box.innerHTML = SEARCH_PRESETS.map((p, i) =>
        `<button type="button" class="search-chip" data-i="${i}">${escapeHtml(p.label)}</button>`
      ).join('');
      box.querySelectorAll('.search-chip').forEach((btn) => {
        btn.onclick = () => {
          const preset = SEARCH_PRESETS[Number(btn.getAttribute('data-i'))];
          document.getElementById('subSearchQ').value = preset.q;
          box.querySelectorAll('.search-chip').forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          runSubscriptionSearch();
        };
      });
    }

    async function searchGithubRepos(query, sort) {
      const q = encodeURIComponent(query + ' in:name,description,readme');
      const url = 'https://api.github.com/search/repositories?q=' + q + '&sort=' + encodeURIComponent(sort || 'updated') + '&order=desc&per_page=12';
      const data = await ghFetchJson(url);
      return data.items || [];
    }

    async function loadRepoFiles(owner, repo) {
      const key = owner + '/' + repo;
      if (searchCache.has(key)) return searchCache.get(key);
      const info = await ghFetchJson('https://api.github.com/repos/' + owner + '/' + repo);
      const branch = info.default_branch || 'main';
      const tree = await ghFetchJson(
        'https://api.github.com/repos/' + owner + '/' + repo + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1'
      );
      const files = pickCandidateFiles(tree.tree || []);
      const payload = { owner, repo, branch, files, info };
      searchCache.set(key, payload);
      return payload;
    }

    function addSubscriptionFromSearch({ name, link, updt, updtAlt }) {
      applyFormToList();
      if (linkAlreadyInList(link)) {
        setStatus('Эта ссылка уже есть в списке', true);
        return false;
      }
      const item = {
        name: name || 'Новая подписка',
        link: link || '',
        updt: updt || '',
        updtAlt: updtAlt || '',
        hidden: false
      };
      subs.unshift(item);
      fillForm(item, 0);
      renderList();
      markDirty();
      setStatus('Добавлено в список: ' + item.name);
      return true;
    }

    function renderRepoFiles(container, payload) {
      if (!payload.files.length) {
        container.innerHTML = '<div class="preview-note">Подходящих .txt / config файлов не найдено.</div>';
        return;
      }
      container.innerHTML = payload.files.map((f, i) => `
        <div class="repo-file" data-fi="${i}">
          <div class="repo-file-path">${escapeHtml(f.path)}</div>
          <span class="repo-file-badge" data-badge>не проверен</span>
          <button type="button" class="btn" data-act="probe">Проверить</button>
          <button type="button" class="btn" data-act="preview">Превью</button>
          <button type="button" class="btn btn-primary" data-act="add">Добавить</button>
        </div>
      `).join('');

      container.querySelectorAll('.repo-file').forEach((row) => {
        const file = payload.files[Number(row.getAttribute('data-fi'))];
        const badge = row.querySelector('[data-badge]');
        const raw = rawGithubUrl(payload.owner, payload.repo, payload.branch, file.path);
        const already = linkAlreadyInList(raw);
        if (already) {
          badge.textContent = 'уже в списке';
          badge.className = 'repo-file-badge inlist';
        }
        row.querySelector('[data-act="probe"]').onclick = async () => {
          badge.textContent = '…';
          badge.className = 'repo-file-badge';
          try {
            const text = await fetchTextShared(raw);
            const stats = countProtocols(text);
            if (stats.total > 0) {
              const parts = Object.entries(stats.kinds).filter(([, n]) => n > 0).map(([k, n]) => k + ' ' + n);
              badge.textContent = parts.join(' · ') || (stats.total + ' шт');
              badge.className = 'repo-file-badge ok';
              file._probeOk = true;
              file._probeLabel = badge.textContent;
            } else {
              badge.textContent = text ? '0 протоколов' : 'пусто / ошибка';
              badge.className = 'repo-file-badge warn';
              file._probeOk = false;
            }
          } catch (e) {
            badge.textContent = 'ошибка';
            badge.className = 'repo-file-badge warn';
          }
        };
        row.querySelector('[data-act="preview"]').onclick = () => {
          const baseName = (file.path.split('/').pop() || file.path).replace(/\.[^.]+$/, '');
          const name = payload.repo + '/' + baseName;
          if (typeof window.openPreview === 'function') {
            window.openPreview({
              name,
              link: raw,
              updt: commitsUpdt(payload.owner, payload.repo)
            });
          } else {
            setStatus('Предпросмотр не загружен', true);
          }
        };
        row.querySelector('[data-act="add"]').onclick = () => {
          const baseName = (file.path.split('/').pop() || file.path).replace(/\.[^.]+$/, '');
          const name = payload.repo + '/' + baseName;
          const hash = encodeURIComponent(baseName);
          addSubscriptionFromSearch({
            name,
            link: raw + '#' + hash,
            updt: raw + '||Обновлено',
            updtAlt: commitsUpdt(payload.owner, payload.repo)
          });
          badge.textContent = 'уже в списке';
          badge.className = 'repo-file-badge inlist';
        };
      });
    }

    function renderRepoCard(repo, index) {
      const pushed = formatAgo(repo.pushed_at || repo.updated_at);
      const stars = repo.stargazers_count != null ? repo.stargazers_count : '—';
      return `
        <div class="repo-card" data-ri="${index}">
          <div class="repo-card-top">
            <div class="repo-title"><a href="${escapeHtml(repo.html_url)}" target="_blank" rel="noopener">${escapeHtml(repo.full_name)}</a></div>
            <div class="repo-meta">
              <span>★ ${stars}</span>
              <span>обн. ${escapeHtml(pushed)}</span>
              ${repo.language ? '<span>' + escapeHtml(repo.language) + '</span>' : ''}
            </div>
          </div>
          ${repo.description ? '<div class="repo-desc">' + escapeHtml(repo.description) + '</div>' : ''}
          <div class="repo-actions">
            <button type="button" class="btn btn-primary" data-act="files">Показать файлы</button>
            <button type="button" class="btn" data-act="open">GitHub ↗</button>
          </div>
          <div class="repo-files" hidden></div>
        </div>
      `;
    }

    async function runSubscriptionSearch() {
      const input = document.getElementById('subSearchQ').value.trim();
      const sort = document.getElementById('subSearchSort').value || 'updated';
      const box = document.getElementById('subSearchResults');
      if (!input) {
        setSearchStatus('Введите запрос или owner/repo', true);
        return;
      }
      const btn = document.getElementById('btnSubSearch');
      btn.disabled = true;
      box.innerHTML = '';
      try {
        const ref = parseGithubRepoRef(input);
        if (ref) {
          setSearchStatus('Сканирую ' + ref.owner + '/' + ref.repo + '…');
          const payload = await loadRepoFiles(ref.owner, ref.repo);
          box.innerHTML = renderRepoCard({
            full_name: payload.owner + '/' + payload.repo,
            html_url: 'https://github.com/' + payload.owner + '/' + payload.repo,
            description: (payload.info && payload.info.description) || '',
            pushed_at: payload.info && payload.info.pushed_at,
            stargazers_count: payload.info && payload.info.stargazers_count,
            language: payload.info && payload.info.language
          }, 0);
          const card = box.querySelector('.repo-card');
          const filesBox = card.querySelector('.repo-files');
          filesBox.hidden = false;
          renderRepoFiles(filesBox, payload);
          card.querySelector('[data-act="files"]').textContent = 'Обновить файлы';
          card.querySelector('[data-act="files"]').onclick = async () => {
            searchCache.delete(ref.owner + '/' + ref.repo);
            setSearchStatus('Обновляю файлы…');
            const next = await loadRepoFiles(ref.owner, ref.repo);
            renderRepoFiles(filesBox, next);
            setSearchStatus('Файлы: ' + next.files.length);
          };
          card.querySelector('[data-act="open"]').onclick = () => window.open(card.querySelector('a').href, '_blank');
          setSearchStatus('Найдено файлов-кандидатов: ' + payload.files.length);
          return;
        }

        setSearchStatus('Ищу на GitHub: «' + input + '»…');
        const items = await searchGithubRepos(input, sort);
        if (!items.length) {
          setSearchStatus('Ничего не найдено. Попробуйте другой запрос или owner/repo.', true);
          return;
        }
        box.innerHTML = items.map((repo, i) => renderRepoCard(repo, i)).join('');
        box.querySelectorAll('.repo-card').forEach((card) => {
          const repo = items[Number(card.getAttribute('data-ri'))];
          const filesBox = card.querySelector('.repo-files');
          card.querySelector('[data-act="open"]').onclick = () => window.open(repo.html_url, '_blank');
          card.querySelector('[data-act="files"]').onclick = async () => {
            const btnFiles = card.querySelector('[data-act="files"]');
            btnFiles.disabled = true;
            btnFiles.textContent = 'Загрузка…';
            try {
              const [owner, name] = repo.full_name.split('/');
              const payload = await loadRepoFiles(owner, name);
              filesBox.hidden = false;
              renderRepoFiles(filesBox, payload);
              btnFiles.textContent = 'Обновить файлы';
              setSearchStatus(repo.full_name + ': ' + payload.files.length + ' файл(ов)');
            } catch (e) {
              setSearchStatus(e.message || String(e), true);
              btnFiles.textContent = 'Показать файлы';
            } finally {
              btnFiles.disabled = false;
            }
          };
        });
        setSearchStatus('Найдено репозиториев: ' + items.length + ' (сортировка: ' + (sort === 'stars' ? 'звёзды' : 'обновление') + ')');
      } catch (e) {
        setSearchStatus(e.message || String(e), true);
      } finally {
        btn.disabled = false;
      }
    }

    function jsString(value) {
      return JSON.stringify(value == null ? '' : String(value));
    }

    function buildSolistSubsFile(list) {
      const header = `/**
 * =============================================================================
 *  SOLIST — список публичных подписок
 *  Файл: WEB/js/solist/subs.js
 * =============================================================================
 *
 *  БЫСТРОЕ РЕДАКТИРОВАНИЕ
 *  ----------------------
 *  Откройте WEB/solist-admin.html в браузере — добавление, удаление, скрытие,
 *  порядок и превью. Потом сохраните в WEB/js/solist/subs.js.
 *
 *  ПОЛЯ: name, link, updt, updtAlt (//updt), hidden
 *  ФОРМАТЫ updt: '' | 'текст' | 'URL' | 'URL||фрагмент'
 * =============================================================================
 */

window.SOLIST_SUBS = [
`;
      const items = (list || []).map((item) => {
        const props = [
          `    name: ${jsString(item.name)}`,
          `    link: ${jsString(item.link)}`
        ];
        if (item.updt) props.push(`    updt: ${jsString(item.updt)}`);
        if (item.hidden) props.push('    hidden: true');
        if (item.updtAlt) props.push(`    updtAlt: ${jsString(item.updtAlt)}`);
        return '  {\n' + props.join(',\n') + '\n  }';
      }).join(',\n');

      const footer = `
];

function createProxyButtons() {
  const buttonsContainer = document.querySelector('.buttons-container');
  if (!buttonsContainer) return;

  const proxyData = (window.SOLIST_SUBS || []).filter((item) => !item.hidden);

  const existingButtons = buttonsContainer.querySelectorAll('.proxy-button');
  existingButtons.forEach((button) => button.remove());

  proxyData.forEach((item) => {
    const button = document.createElement('button');
    button.className = 'proxy-button';

    const nameEl = document.createElement('span');
    nameEl.className = 'proxy-button-name';
    nameEl.textContent = item.name;
    button.appendChild(nameEl);

    let updtEl = null;
    if (item.updt && typeof window.loadUpdt === 'function') {
      updtEl = document.createElement('span');
      updtEl.className = 'proxy-button-updt';
      updtEl.textContent = 'обновлено …';
      button.appendChild(updtEl);
      window.loadUpdt(item.updt).then((text) => {
        if (text) updtEl.textContent = 'обновлено ' + text;
        else updtEl.remove();
      });
    }

    button.onclick = () => {
      if (typeof window.openPreview === 'function') window.openPreview(item);
    };
    buttonsContainer.insertBefore(button, buttonsContainer.lastElementChild);
  });
}

document.addEventListener('DOMContentLoaded', createProxyButtons);
`;
      return header + items + footer;
    }

    function parseSubsFromSource(text) {
      const start = text.indexOf('window.SOLIST_SUBS');
      if (start === -1) throw new Error('Не найден window.SOLIST_SUBS');
      const eq = text.indexOf('=', start);
      const arrStart = text.indexOf('[', eq);
      if (arrStart === -1) throw new Error('Не найден массив подписок');
      let depth = 0;
      let end = -1;
      for (let i = arrStart; i < text.length; i++) {
        const ch = text[i];
        if (ch === '[') depth++;
        else if (ch === ']') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end === -1) throw new Error('Массив подписок не закрыт');
      let literal = text.slice(arrStart, end + 1);
      // //updt: '...' → updtAlt: '...'
      literal = literal.replace(/^\s*\/\/\s*updt\s*:\s*/gm, 'updtAlt: ');
      const parsed = new Function('return (' + literal + ')')();
      if (!Array.isArray(parsed)) throw new Error('SOLIST_SUBS должен быть массивом');
      return parsed;
    }

    function downloadFile() {
      const content = buildSolistSubsFile(subs);
      const blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'subs.js';
      a.click();
      URL.revokeObjectURL(a.href);
      if (!fileHandle) {
        markClean('скачанная копия');
        setStatus('Копия subs.js скачана (эталон обновлён)');
      } else {
        setStatus('Копия скачана. Привязанный файл на диске ещё не обновлён — нажмите «Сохранить в subs.js»', true);
        updateSaveIndicator();
      }
    }

    async function loadWithFs() {
      document.getElementById('fileInput').click();
    }

    async function loadFromText(text, label) {
      const parsed = parseSubsFromSource(text);
      subs = cloneSubs(parsed);
      editIndex = -1;
      fillForm(null, -1);
      renderList();
      markClean(label || 'загруженный файл');
      setStatus('Загружено подписок: ' + subs.length);
    }

    document.getElementById('btnSwapUpdt').onclick = () => {
      const a = document.getElementById('fUpdt');
      const b = document.getElementById('fUpdtAlt');
      const tmp = a.value;
      a.value = b.value;
      b.value = tmp;
      applyFormToList();
      setStatus('updt и updtAlt поменяны местами');
    };

    ['fName', 'fLink', 'fUpdt', 'fUpdtAlt'].forEach((id) => {
      document.getElementById(id).addEventListener('blur', applyFormToList);
    });

    document.getElementById('btnNewItem').onclick = addNewItem;

    document.getElementById('btnSaveCurrent').onclick = saveToCurrentFile;
    document.getElementById('btnBindFile').onclick = bindCurrentFile;
    document.getElementById('btnDownload').onclick = downloadFile;
    document.getElementById('btnLoadFs').onclick = loadWithFs;
    document.getElementById('btnSubSearch').onclick = runSubscriptionSearch;
    document.getElementById('subSearchQ').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSubscriptionSearch();
      }
    });
    renderSearchChips();

    document.getElementById('fileInput').onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        if (isDirty() && !confirm('Есть несохранённые изменения. Загрузить другой файл?')) {
          e.target.value = '';
          return;
        }
        await loadFromText(await file.text(), file.name || 'файл');
      } catch (err) {
        setStatus('Ошибка разбора файла: ' + err.message, true);
      }
      e.target.value = '';
    };

    window.addEventListener('beforeunload', (e) => {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = '';
    });

    // init
    subs = cloneSubs(window.SOLIST_SUBS || []);
    savedSnapshot = snapshotOf(subs);
    baselineLabel = 'содержимое страницы';
    renderList();
    updateSaveIndicator();
    setStatus('Готово к редактированию · ' + subs.length + ' подписок');
    restoreBoundFile();
  
