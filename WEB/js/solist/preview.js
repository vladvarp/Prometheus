
    // Список подписок редактируется в: js/solist/subs.js
    const updtCache = {};
    const subCache = {};

    const APP_DEEP_LINKS = [
      {
        id: 'happ',
        name: 'Happ',
        store: 'https://www.happ.su/main',
        build: (url) => 'happ://add/' + stripHash(url)
      },
      {
        id: 'hiddify',
        name: 'Hiddify',
        store: 'https://hiddify.com',
        build: (url, name) => 'hiddify://import/' + stripHash(url) + '#' + encodeURIComponent(name || 'Subscription')
      },
      {
        id: 'karing',
        name: 'Karing',
        store: 'https://karing.app/en/download/',
        build: (url, name) => {
          const u = encodeURIComponent(stripHash(url));
          const n = encodeURIComponent(name || 'Subscription');
          return `karing://install-config?url=${u}&name=${n}`;
        }
      },
      {
        id: 'incy',
        name: 'INCY',
        store: 'https://github.com/INCY-DEV/incy-platforms',
        build: (url) => 'incy://add/' + stripHash(url)
      },
      {
        id: 'shadowrocket',
        name: 'Shadowrocket',
        store: 'https://apps.apple.com/ru/app/shadowrocket/id932747118',
        iosOnly: true,
        build: (url, name) => {
          const b64 = btoa(unescape(encodeURIComponent(stripHash(url))));
          return 'sub://' + b64 + '#' + encodeURIComponent(name || 'Subscription');
        }
      }
    ];

    function stripHash(url) {
      const i = url.indexOf('#');
      return i === -1 ? url : url.slice(0, i);
    }

    function parseUpdtSpec(updt) {
      if (!updt) return null;
      const sep = '||';
      const i = updt.indexOf(sep);
      if (i === -1) {
        if (/^https?:\/\//i.test(updt)) return { url: updt, needle: '' };
        return { staticText: updt };
      }
      return { url: updt.slice(0, i).trim(), needle: updt.slice(i + sep.length) };
    }

    function prettyDate(raw) {
      if (!raw) return '';
      let s = raw.replace(/_/g, ' ').replace(/%3A/gi, ':').trim();
      try { s = decodeURIComponent(s); } catch (e) {}
      s = s.replace(/\s+/g, ' ').replace(/[?&#"'<>].*$/, '').replace(/-+$/, '').trim();

      let m = s.match(/^(\d{4})[.\-\/ ](\d{2})[.\-\/ ](\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|\s*(UTC(?:[+\-]?\d+)?))?/i);
      if (m) return `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}${m[6] ? ' ' + m[6].toUpperCase() : ' UTC'}`;

      m = s.match(/^(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})\s+(\d{2}):(\d{2})(?::\d{2})?(?:\s*(UTC(?:[+\-]?\d+)?))?/i);
      if (m) return `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}${m[6] ? ' ' + m[6].toUpperCase() : ''}`;

      return s;
    }

    function extractDate(text, needle) {
      if (!text) return '';
      let slice = text;
      if (needle) {
        const idx = text.indexOf(needle);
        if (idx === -1) return '';
        const start = idx + needle.length;
        const lineEnd = text.indexOf('\n', start);
        slice = text.slice(start, lineEnd === -1 ? start + 240 : lineEnd);
      }
      const decoded = slice.replace(/%3A/gi, ':');
      const patterns = [
        /(\d{4}[_.\-\/]\d{2}[_.\-\/]\d{2}[_ T]\d{2}(?::|%3A)\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|_?UTC(?:[+\-]?\d+)?|\s+UTC(?:[+\-]?\d+)?)?)/i,
        /(\d{2}[.\-\/]\d{2}[.\-\/]\d{4}\s+\d{2}:\d{2}(?::\d{2})?(?:\s*UTC(?:[+\-]?\d+)?)?)/i,
        /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/
      ];
      for (const re of patterns) {
        const m = decoded.match(re);
        if (m) return prettyDate(m[1]);
      }
      return prettyDate(slice.slice(0, 80));
    }

    // Те же CORS-прокси, что в snapper / MTProtoInfo
    function buildFetchCandidates(url) {
      const encoded = encodeURIComponent(url);
      const bust = '_=' + Date.now() + Math.random().toString(36).slice(2, 8);
      const withBust = (u) => u + (u.includes('?') ? '&' : '?') + bust;
      const list = [url];
      if (url.includes('raw.githubusercontent.com')) {
        list.push(url.replace('https://raw.githubusercontent.com/', 'https://raw.githack.com/').replace('/refs/heads/', '/'));
      }
      list.push(
        withBust('https://cors.eu.org/' + url),
        withBust('https://r.jina.ai/' + url),
        withBust('https://corsproxy.io/?' + encoded),
        withBust('https://corsproxy.io/?url=' + encoded),
        withBust('https://api.allorigins.win/raw?url=' + encoded),
        withBust('https://api.allorigins.win/get?url=' + encoded)
      );
      return list;
    }

    function normalizeFetchedText(text, viaUrl) {
      if (!text) return '';
      if (viaUrl.includes('api.allorigins.win/get?')) {
        try {
          const j = JSON.parse(text);
          if (j && typeof j.contents === 'string') return j.contents;
        } catch (e) {}
      }
      return text;
    }

    async function fetchText(url, signal) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const candidates = buildFetchCandidates(url);
      return await new Promise((resolve, reject) => {
        let pending = candidates.length;
        let settled = false;
        const failOne = () => {
          pending -= 1;
          if (pending <= 0 && !settled) {
            settled = true;
            resolve('');
          }
        };
        candidates.forEach((u) => {
          fetch(u, { cache: 'no-store', signal })
            .then(async (r) => {
              if (!r.ok) return failOne();
              const raw = await r.text();
              const text = normalizeFetchedText(raw, u);
              if (!text) return failOne();
              if (!settled) {
                settled = true;
                resolve(text);
              }
            })
            .catch((e) => {
              if (e && e.name === 'AbortError') {
                if (!settled) {
                  settled = true;
                  reject(e);
                }
                return;
              }
              failOne();
            });
        });
      });
    }

    async function fetchTextWithRetries(url, { attempts = 10, timeoutMs = 5000, onAttempt, shouldContinue } = {}) {
      for (let i = 1; i <= attempts; i++) {
        if (shouldContinue && !shouldContinue()) return '';
        if (onAttempt) onAttempt(i, attempts);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const text = await fetchText(url, ctrl.signal);
          clearTimeout(timer);
          if (text) return text;
        } catch (e) {
          clearTimeout(timer);
          if (shouldContinue && !shouldContinue()) return '';
        }
      }
      return '';
    }

    async function loadUpdt(updt) {
      const spec = parseUpdtSpec(updt);
      if (!spec) return '';
      if (spec.staticText) return spec.staticText;
      if (!spec.url) return '';
      if (!updtCache[spec.url]) updtCache[spec.url] = fetchText(spec.url);
      const text = await updtCache[spec.url];
      return extractDate(text, spec.needle);
    }

    function tryDecodeBase64(text) {
      const cleaned = text.replace(/\s+/g, '');
      if (!cleaned || cleaned.length < 16) return null;
      if (!/^[A-Za-z0-9+/=_-]+$/.test(cleaned)) return null;
      try {
        const normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
        const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
        const decoded = decodeURIComponent(escape(atob(normalized + pad)));
        if (/^(vless|vmess|trojan|ss|ssr|hysteria2?|hy2|socks):\/\//im.test(decoded) || decoded.includes('://')) {
          return decoded;
        }
      } catch (e) {}
      return null;
    }

    function extractRemark(uri) {
      const hash = uri.indexOf('#');
      if (hash === -1) return '';
      try { return decodeURIComponent(uri.slice(hash + 1).replace(/\+/g, ' ')); }
      catch (e) { return uri.slice(hash + 1); }
    }

    function parseVmess(uri) {
      try {
        const raw = uri.slice('vmess://'.length);
        const json = JSON.parse(decodeURIComponent(escape(atob(raw.replace(/-/g, '+').replace(/_/g, '/')))));
        return {
          host: json.add || json.host || '',
          port: Number(json.port) || 443,
          name: json.ps || json.remark || json.name || 'VMess',
          protocol: 'VMess'
        };
      } catch (e) {
        return null;
      }
    }

    function parseHostPortUri(uri, protocol) {
      try {
        const withoutScheme = uri.replace(/^[a-z0-9+.-]+:\/\//i, '');
        const main = withoutScheme.split('#')[0].split('?')[0];
        let hostPort = (main.includes('@') ? main.split('@').pop() : main).replace(/\/+$/, '');
        if (hostPort.startsWith('[')) {
          const end = hostPort.indexOf(']');
          const host = hostPort.slice(1, end);
          const port = Number(hostPort.slice(end + 2)) || 443;
          return { host, port, name: extractRemark(uri) || protocol, protocol };
        }
        const lastColon = hostPort.lastIndexOf(':');
        if (lastColon === -1) return { host: hostPort, port: 443, name: extractRemark(uri) || protocol, protocol };
        return {
          host: hostPort.slice(0, lastColon),
          port: Number(hostPort.slice(lastColon + 1)) || 443,
          name: extractRemark(uri) || protocol,
          protocol
        };
      } catch (e) {
        return null;
      }
    }

    function parseShadowsocks(uri) {
      try {
        const body = uri.slice('ss://'.length).split('#')[0];
        if (body.includes('@')) return parseHostPortUri(uri, 'SS');
        const decoded = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
        const rebuilt = 'ss://' + decoded + (uri.includes('#') ? uri.slice(uri.indexOf('#')) : '');
        return parseHostPortUri(rebuilt, 'SS');
      } catch (e) {
        return parseHostPortUri(uri, 'SS');
      }
    }

    function parseServerLine(line) {
      const uri = line.trim();
      if (!uri || uri.startsWith('#') || uri.startsWith('//')) return null;
      const lower = uri.toLowerCase();
      let server = null;
      if (lower.startsWith('vmess://')) server = parseVmess(uri);
      else if (lower.startsWith('vless://')) server = parseHostPortUri(uri, 'VLESS');
      else if (lower.startsWith('trojan://')) server = parseHostPortUri(uri, 'Trojan');
      else if (lower.startsWith('ss://')) server = parseShadowsocks(uri);
      else if (lower.startsWith('ssr://')) server = { host: '', port: 0, name: extractRemark(uri) || 'SSR', protocol: 'SSR' };
      else if (lower.startsWith('hysteria2://') || lower.startsWith('hy2://')) server = parseHostPortUri(uri, 'Hy2');
      else if (lower.startsWith('socks://') || lower.startsWith('socks5://')) server = parseHostPortUri(uri, 'Socks');
      if (server) server.raw = uri;
      return server;
    }

    function decodeMetaValue(val) {
      if (!val) return '';
      let v = val.trim();
      if (/^base64:/i.test(v)) {
        try {
          const raw = v.replace(/^base64:/i, '');
          return decodeURIComponent(escape(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))));
        } catch (e) { return v; }
      }
      return v;
    }

    function parseSubMeta(text) {
      const meta = {};
      if (!text) return meta;
      let content = text.trim();
      const decoded = tryDecodeBase64(content);
      if (decoded) content = decoded;
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^#\s*([a-z0-9_-]+)\s*:\s*(.+)\s*$/i);
        if (!m) continue;
        const key = m[1].toLowerCase();
        const value = decodeMetaValue(m[2]);
        if (key === 'profile-title') meta.title = value;
        else if (key === 'announce') meta.announce = value;
        else if (key === 'announce-url') meta.announceUrl = value;
        else if (key === 'support-url') meta.supportUrl = value;
        else if (key === 'profile-web-page-url') meta.webUrl = value;
        else if (key === 'subscription-userinfo') meta.userinfo = value;
        else if (key === 'sub-info-text') meta.infoText = value;
        else if (key === 'sub-info-button-text') meta.infoBtnText = value;
        else if (key === 'sub-info-button-link') meta.infoBtnLink = value;
      }
      return meta;
    }

    const COUNTRY_NAME_TO_CODE = {
      russia: 'RU', russian: 'RU', россия: 'RU', рф: 'RU',
      usa: 'US', 'united states': 'US', america: 'US', сша: 'US',
      germany: 'DE', deutschland: 'DE', германия: 'DE',
      netherlands: 'NL', holland: 'NL', нидерланды: 'NL', голландия: 'NL',
      france: 'FR', франция: 'FR',
      uk: 'GB', britain: 'GB', england: 'GB', 'united kingdom': 'GB', британия: 'GB', англия: 'GB',
      canada: 'CA', канада: 'CA',
      japan: 'JP', япония: 'JP',
      korea: 'KR', 'south korea': 'KR', корея: 'KR',
      china: 'CN', китай: 'CN', hongkong: 'HK', 'hong kong': 'HK', гонконг: 'HK',
      singapore: 'SG', сингапур: 'SG',
      turkey: 'TR', türkiye: 'TR', турция: 'TR',
      finland: 'FI', финляндия: 'FI',
      sweden: 'SE', швеция: 'SE',
      poland: 'PL', польша: 'PL',
      ukraine: 'UA', украина: 'UA',
      kazakhstan: 'KZ', казахстан: 'KZ',
      latvia: 'LV', латвия: 'LV', lithuania: 'LT', литва: 'LT', estonia: 'EE', эстония: 'EE',
      italy: 'IT', италия: 'IT', spain: 'ES', испания: 'ES', portugal: 'PT', португалия: 'PT',
      switzerland: 'CH', швейцария: 'CH', austria: 'AT', австрия: 'AT',
      czech: 'CZ', czechia: 'CZ', чехия: 'CZ',
      romania: 'RO', румыния: 'RO', bulgaria: 'BG', болгария: 'BG',
      israel: 'IL', израиль: 'IL', uae: 'AE', dubai: 'AE', оаэ: 'AE',
      india: 'IN', индия: 'IN', brazil: 'BR', бразилия: 'BR',
      australia: 'AU', австралия: 'AU', taiwan: 'TW', тайвань: 'TW',
      moldova: 'MD', молдова: 'MD', georgia: 'GE', грузия: 'GE', armenia: 'AM', армения: 'AM',
      belarus: 'BY', беларусь: 'BY', serbia: 'RS', сербия: 'RS'
    };

    function isoToFlag(code) {
      if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
      const cc = code.toUpperCase();
      return String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0)));
    }

    function flagEmojiToCode(emoji) {
      if (!emoji) return '';
      const cps = [...emoji];
      if (cps.length !== 2) return '';
      const a = cps[0].codePointAt(0) - 127397;
      const b = cps[1].codePointAt(0) - 127397;
      if (a < 65 || a > 90 || b < 65 || b > 90) return '';
      return String.fromCharCode(a, b);
    }

    function extractFlagFromName(name) {
      if (!name) return '';
      const m = name.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u);
      return m ? m[0] : '';
    }

    const KNOWN_ISO = new Set(['RU','US','DE','NL','FR','GB','CA','JP','KR','CN','HK','SG','TR','FI','SE','PL','UA','KZ','LV','LT','EE','IT','ES','PT','CH','AT','CZ','RO','BG','IL','AE','IN','BR','AU','TW','MD','GE','AM','BY','RS','NO','DK','IE','BE','MX','AR','CL','NZ','TH','VN','ID','MY','PH','SA','EG','ZA']);

    function detectCountryCode(name) {
      if (!name) return '';
      const fromEmoji = flagEmojiToCode(extractFlagFromName(name));
      if (fromEmoji) return fromEmoji;
      const clean = name.replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
      const codeAtStart = clean.match(/^([A-Za-z]{2})(?:\s|$)/);
      if (codeAtStart) {
        const mapped = COUNTRY_NAME_TO_CODE[codeAtStart[1].toLowerCase()];
        const code = (mapped || codeAtStart[1].toUpperCase());
        if (KNOWN_ISO.has(code)) return code;
      }
      const lower = clean.toLowerCase();
      for (const [country, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
        if (new RegExp('(?:^|\\s)' + country + '(?:\\s|$)', 'i').test(lower)) return code;
      }
      const midCode = clean.match(/(?:^|[\s|\/\-\[\(])([A-Z]{2})(?:[\s|\/\-\]\)]|$)/);
      if (midCode && KNOWN_ISO.has(midCode[1])) return midCode[1];
      return '';
    }

    function detectCountryFlag(name) {
      const code = detectCountryCode(name);
      if (code) return isoToFlag(code);
      return '🌐';
    }

    function flagMarkup(server) {
      const code = server.flagCode || flagEmojiToCode(server.flag);
      if (code) {
        const cc = code.toLowerCase();
        return `<img class="server-flag-img" src="https://flagcdn.com/w40/${cc}.png" srcset="https://flagcdn.com/w80/${cc}.png 2x" width="20" height="15" alt="${code}" loading="lazy" decoding="async">`;
      }
      return server.flag || '🌐';
    }

    // Как в Happ: флаг слева, ISO/эмодзи-флаг из названия убираем
    function displayServerName(server) {
      let name = String(server && server.name != null ? server.name : '');
      if (!name) return (server && server.host) || '';
      name = name.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, ' ');
      const code = (server.flagCode || detectCountryCode(name) || '').toUpperCase();
      if (code) {
        const reCode = new RegExp(
          '(^|[\\s|\\/\\-·•.(])(' + code + ')(?=\\s|[|\\/\\-]|$|\\)|\\]|\\})',
          'gi'
        );
        name = name.replace(reCode, '$1');
      } else {
        name = name.replace(
          /(^|[\s|\/\-·•.(])([A-Za-z]{2})(?=\s|[|\/\-]|$|\)|\]|\})/g,
          (full, pre, cc) => (KNOWN_ISO.has(cc.toUpperCase()) ? pre : full)
        );
      }
      name = name.replace(/\s{2,}/g, ' ').replace(/\s+([|\/\-·•])/g, ' $1').replace(/^[\s|\/\-·•.]+/, '').trim();
      return name || server.name || server.host || '';
    }

    function parseSubscription(text) {
      if (!text) return [];
      let content = text.trim();
      const decoded = tryDecodeBase64(content);
      if (decoded) content = decoded;

      const servers = [];
      const seen = new Set();
      for (const line of content.split(/\r?\n/)) {
        const server = parseServerLine(line);
        if (!server || !server.host) continue;
        // Полный URI: один host:port с разными UUID/параметрами — разные серверы
        const key = server.raw || (server.protocol + '|' + server.host + '|' + server.port + '|' + server.name);
        if (seen.has(key)) continue;
        seen.add(key);
        server.flagCode = detectCountryCode(server.name);
        server.flag = detectCountryFlag(server.name);
        servers.push(server);
      }

      if (!servers.length && /proxies\s*:/i.test(content)) {
        const nameRe = /-\s*name:\s*["']?([^"'#\n]+)["']?/gi;
        const typeRe = /type:\s*["']?([a-z0-9-]+)["']?/i;
        const serverRe = /server:\s*["']?([^"'#\n]+)["']?/i;
        const portRe = /port:\s*(\d+)/i;
        const blocks = content.split(/\n\s*-\s+name:/i).slice(1);
        for (const block of blocks) {
          const full = 'name:' + block;
          const name = (full.match(/^name:\s*["']?([^"'#\n]+)/i) || [])[1] || 'Proxy';
          const type = ((full.match(typeRe) || [])[1] || 'clash').toUpperCase();
          const host = (full.match(serverRe) || [])[1] || '';
          const port = Number((full.match(portRe) || [])[1] || 443);
          if (!host) continue;
          const server = { host, port, name: name.trim(), protocol: type };
          server.flagCode = detectCountryCode(server.name);
          server.flag = detectCountryFlag(server.name);
          servers.push(server);
        }
        void nameRe;
      }
      return servers;
    }

    function pingClass(ms) {
      if (ms == null) return 'ping-bad';
      if (ms < 120) return 'ping-good';
      if (ms < 250) return 'ping-mid';
      return 'ping-slow';
    }

    function formatPing(ms) {
      if (ms == null) return 'timeout';
      return ms + ' ms';
    }

    let pingAbort = null;
    const activePingSockets = new Set();

    function stopAllPings() {
      if (pingAbort) {
        try { pingAbort.abort(); } catch (e) {}
      }
      pingAbort = null;
      activePingSockets.forEach((ws) => {
        try { ws.close(); } catch (e) {}
      });
      activePingSockets.clear();
    }

    function probeLatency(host, port, timeoutMs = 3500, externalSignal) {
      return new Promise((resolve) => {
        if (!host || !port) return resolve(null);
        if (externalSignal && externalSignal.aborted) return resolve(null);

        const start = performance.now();
        let settled = false;
        const localCtrl = new AbortController();
        const finish = (available) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (onAbort) {
            try { externalSignal.removeEventListener('abort', onAbort); } catch (e) {}
          }
          const ms = Math.round(performance.now() - start);
          if (!available) return resolve(null);
          resolve(Math.max(ms, 1));
        };

        const onAbort = () => {
          try { localCtrl.abort(); } catch (e) {}
          fail();
        };
        const timer = setTimeout(() => {
          try { localCtrl.abort(); } catch (e) {}
          finish(false);
        }, timeoutMs);
        const ok = () => finish(true);
        const fail = () => finish(false);

        if (externalSignal) {
          if (externalSignal.aborted) return fail();
          externalSignal.addEventListener('abort', onAbort, { once: true });
        }

        const isTlsPort = [443, 8443, 2053, 2083, 2087, 2096].includes(Number(port));
        const hostPart = host.includes(':') ? `[${host}]` : host;

        if (isTlsPort || Number(port) === 80) {
          const url = Number(port) === 80
            ? `http://${hostPart}/`
            : `https://${hostPart}${Number(port) === 443 ? '' : ':' + port}/`;
          fetch(url, { mode: 'no-cors', cache: 'no-store', signal: localCtrl.signal })
            .then(() => ok())
            .catch((err) => {
              // Abort (закрытие окна / таймаут) = недоступен. Иначе TCP/TLS часто дошёл.
              if (err && err.name === 'AbortError') fail();
              else ok();
            });
          return;
        }

        let ws;
        try {
          ws = new WebSocket(`wss://${hostPart}:${port}`);
        } catch (e) {
          fail();
          return;
        }
        activePingSockets.add(ws);
        const cleanupWs = () => {
          activePingSockets.delete(ws);
          try { ws.close(); } catch (e) {}
        };
        ws.onopen = () => { cleanupWs(); ok(); };
        // onerror после быстрого TCP обычно значит «порт ответил, WS нет» → считаем доступным
        ws.onerror = () => {
          cleanupWs();
          if (externalSignal && externalSignal.aborted) return fail();
          const ms = Math.round(performance.now() - start);
          if (ms < timeoutMs - 100) ok();
          else fail();
        };
        ws.onclose = () => { activePingSockets.delete(ws); };
      });
    }

    async function runPings(servers, onUpdate, isActive, signal) {
      const concurrency = 6;
      let idx = 0;
      async function worker() {
        while (idx < servers.length) {
          if ((isActive && !isActive()) || (signal && signal.aborted)) return;
          const s = servers[idx++];
          const ping = await probeLatency(s.host, s.port, 3500, signal);
          if ((isActive && !isActive()) || (signal && signal.aborted)) return;
          s.ping = ping;
          s.pinging = false;
          onUpdate(s);
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, servers.length) }, () => worker()));
    }

    function showToast(message, isError) {
      let toast = document.getElementById('appToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'appToast';
        toast.className = 'app-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.toggle('app-toast--error', !!isError);
      toast.classList.add('show');
      clearTimeout(showToast._t);
      showToast._t = setTimeout(() => toast.classList.remove('show'), 3200);
    }

    function openDeepLink(deepLink, app) {
      let opened = false;
      const markOpened = () => { opened = true; };
      const onVis = () => { if (document.hidden) markOpened(); };
      window.addEventListener('blur', markOpened);
      document.addEventListener('visibilitychange', onVis);

      const isAndroidChrome = /Android/i.test(navigator.userAgent) && /Chrome\/\d+/i.test(navigator.userAgent);
      let url = deepLink;
      if (isAndroidChrome && /^[a-z][a-z0-9+.-]*:\/\//i.test(deepLink) && !/^https?:/i.test(deepLink)) {
        const scheme = deepLink.slice(0, deepLink.indexOf('://'));
        const rest = deepLink.slice(deepLink.indexOf('://') + 3);
        url = `intent://${rest}#Intent;scheme=${scheme};end`;
      }

      const a = document.createElement('a');
      a.href = url;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => {
        window.removeEventListener('blur', markOpened);
        document.removeEventListener('visibilitychange', onVis);
        if (!opened && !document.hidden) {
          showToast(`${app.name} не установлена на этом устройстве`, true);
        }
      }, 2200);
    }

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise((resolve, reject) => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          resolve();
        } catch (e) {
          reject(e);
        } finally {
          ta.remove();
        }
      });
    }

    let previewState = null;
    let previewSession = 0;

    function isPreviewSession(session) {
      return !!previewState && previewState.session === session && session === previewSession;
    }

    function invalidatePreviewSession() {
      previewSession += 1;
      stopAllPings();
      if (previewState) {
        previewState.pinging = false;
        previewState.session = -1;
        if (previewState.servers) {
          previewState.servers.forEach((s) => { s.pinging = false; });
        }
      }
    }

    function ensurePreviewModal() {
      let overlay = document.getElementById('previewOverlay');
      if (overlay) return overlay;
      overlay = document.createElement('div');
      overlay.id = 'previewOverlay';
      overlay.className = 'preview-overlay';
      overlay.innerHTML = `
        <div class="preview-sheet" role="dialog" aria-modal="true">
          <div class="preview-topbar">
            <button type="button" class="preview-close" id="previewClose" aria-label="Закрыть">✕</button>
            <div class="preview-title-wrap">
              <div class="preview-title" id="previewTitle">Подписка</div>
              <div class="preview-meta" id="previewMeta">Загрузка…</div>
            </div>
            <div class="preview-top-actions">
              <button type="button" class="preview-info-btn" id="previewInfoBtn" title="Протоколы">i</button>
              <button type="button" class="preview-ping-btn" id="previewPingBtn" title="Проверить пинг">⏱</button>
            </div>
          </div>
          <div class="preview-info-panel" id="previewInfoPanel" hidden>
            <div class="preview-subinfo" id="previewSubInfo"></div>
            <div class="preview-proto" id="previewProto"></div>
          </div>
          <div class="preview-stats" id="previewStats"></div>
          <div class="preview-ping-status" id="previewPingStatus" hidden></div>
          <div class="preview-tabs" id="previewTabs"></div>
          <div class="preview-list" id="previewList"></div>
          <div class="preview-actions">
            <button type="button" class="preview-apply-btn" id="previewApplyBtn">Применить подписку</button>
            <div class="preview-apply-panel" id="previewApplyPanel" hidden>
              <button type="button" class="preview-copy-btn" id="previewCopyBtn">Скопировать ссылку</button>
              <div class="preview-apps" id="previewApps"></div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePreview();
      });
      document.getElementById('previewClose').onclick = closePreview;
      document.getElementById('previewApplyBtn').onclick = () => {
        const panel = document.getElementById('previewApplyPanel');
        const btn = document.getElementById('previewApplyBtn');
        const open = panel.hasAttribute('hidden');
        if (open) {
          panel.removeAttribute('hidden');
          btn.classList.add('is-open');
          btn.textContent = 'Скрыть варианты добавления';
        } else {
          panel.setAttribute('hidden', '');
          btn.classList.remove('is-open');
          btn.textContent = 'Применить подписку';
        }
      };
      document.getElementById('previewCopyBtn').onclick = () => {
        if (!previewState) return;
        copyText(previewState.link).then(() => {
          const btn = document.getElementById('previewCopyBtn');
          const prev = btn.textContent;
          btn.textContent = 'Скопировано!';
          setTimeout(() => { btn.textContent = prev; }, 1600);
        }).catch((err) => showToast('Ошибка копирования: ' + err.message, true));
      };
      document.getElementById('previewPingBtn').onclick = () => {
        if (previewState && previewState.servers && !previewState.pinging) {
          startPingPass(previewState.servers, previewState.session);
        }
      };
      document.getElementById('previewInfoBtn').onclick = () => toggleInfoPanel();
      document.getElementById('previewList').addEventListener('click', (e) => {
        const btn = e.target.closest('.server-copy-btn');
        if (!btn || !previewState) return;
        const id = Number(btn.getAttribute('data-id'));
        const server = previewState.servers.find((s) => s.id === id);
        if (!server || !server.raw) {
          showToast('Конфигурация недоступна для копирования', true);
          return;
        }
        copyText(server.raw).then(() => {
          const prev = btn.textContent;
          btn.textContent = '✓';
          btn.classList.add('is-copied');
          setTimeout(() => {
            btn.textContent = prev;
            btn.classList.remove('is-copied');
          }, 1200);
        }).catch((err) => showToast('Ошибка копирования: ' + err.message, true));
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePreview();
      });
      return overlay;
    }

    function closePreview() {
      invalidatePreviewSession();
      const overlay = document.getElementById('previewOverlay');
      if (overlay) overlay.classList.remove('open');
      document.body.style.overflow = '';
      const status = document.getElementById('previewPingStatus');
      if (status) status.hidden = true;
      const pingBtn = document.getElementById('previewPingBtn');
      if (pingBtn) {
        pingBtn.classList.remove('is-pinging');
        pingBtn.disabled = false;
      }
    }

    function resetPreviewChrome(item) {
      document.getElementById('previewTitle').textContent = item.name;
      document.getElementById('previewMeta').textContent = 'Загрузка подписки…';
      document.getElementById('previewStats').innerHTML = '';
      document.getElementById('previewTabs').innerHTML = '';
      document.getElementById('previewList').innerHTML = '<div class="preview-loading">Загрузка списка серверов…</div>';
      document.getElementById('previewSubInfo').innerHTML = '';
      document.getElementById('previewProto').innerHTML = '';
      const infoPanel = document.getElementById('previewInfoPanel');
      infoPanel.setAttribute('hidden', '');
      document.getElementById('previewInfoBtn').classList.remove('is-active');
      document.getElementById('previewPingStatus').hidden = true;
      const pingBtn = document.getElementById('previewPingBtn');
      pingBtn.classList.remove('is-pinging');
      pingBtn.disabled = false;
      const applyPanel = document.getElementById('previewApplyPanel');
      const applyBtn = document.getElementById('previewApplyBtn');
      applyPanel.setAttribute('hidden', '');
      applyBtn.classList.remove('is-open');
      applyBtn.textContent = 'Применить подписку';
    }

    function compareByPing(a, b) {
      const rank = (s) => {
        if (typeof s.ping === 'number') return s.ping;
        if (s.ping === null) return 1e9;
        return 1e9 + 1;
      };
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return (a.id || 0) - (b.id || 0);
    }

    function getVisibleServers() {
      if (!previewState || !previewState.servers) return [];
      const filter = previewState.protocolFilter || 'Все';
      const list = filter === 'Все'
        ? previewState.servers.slice()
        : previewState.servers.filter((s) => s.protocol === filter);
      list.sort(compareByPing);
      return list;
    }

    function refreshServerList() {
      const list = document.getElementById('previewList');
      if (!list || !previewState) return;
      const servers = getVisibleServers();
      if (!servers.length) {
        list.innerHTML = '<div class="preview-loading">Нет серверов в этой вкладке.</div>';
        return;
      }
      list.innerHTML = servers.map((s) => renderServerRow(s)).join('');
    }

    function renderServerRow(server) {
      const ping = server.ping;
      const pingText = server.pinging
        ? '<span class="ping-spinner"></span>'
        : (ping === undefined ? '—' : formatPing(ping));
      const cls = server.pinging ? 'ping-wait' : (ping === undefined ? 'ping-wait' : pingClass(ping));
      const copyDisabled = server.raw ? '' : ' disabled';
      return `
        <div class="server-row" data-id="${server.id}">
          <div class="server-flag" aria-hidden="true">${flagMarkup(server)}</div>
          <div class="server-main">
            <div class="server-name">${escapeHtml(displayServerName(server))}</div>
            <div class="server-sub">${escapeHtml(server.protocol)} · ${escapeHtml(server.host)}${server.port ? ':' + server.port : ''}</div>
          </div>
          <button type="button" class="server-copy-btn" data-id="${server.id}" title="Скопировать конфигурацию"${copyDisabled}>⧉</button>
          <div class="server-ping ${cls}" data-ping>${pingText}</div>
        </div>
      `;
    }

    function renderProtocolTabs(servers) {
      const box = document.getElementById('previewTabs');
      if (!box) return;
      const counts = {};
      (servers || []).forEach((s) => {
        const p = s.protocol || 'Unknown';
        counts[p] = (counts[p] || 0) + 1;
      });
      const protocols = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
      const active = (previewState && previewState.protocolFilter) || 'Все';
      const tabs = [{ name: 'Все', count: (servers || []).length }, ...protocols.map((p) => ({ name: p, count: counts[p] }))];
      box.innerHTML = tabs.map((t) => `
        <button type="button" class="proto-tab${t.name === active ? ' is-active' : ''}" data-proto="${escapeHtml(t.name)}">
          ${escapeHtml(t.name)}<span class="proto-tab-count">${t.count}</span>
        </button>
      `).join('');
      box.querySelectorAll('.proto-tab').forEach((btn) => {
        btn.onclick = () => {
          if (!previewState) return;
          previewState.protocolFilter = btn.getAttribute('data-proto') || 'Все';
          renderProtocolTabs(previewState.servers);
          refreshServerList();
          updateStats(getVisibleServers(), previewState.servers.length);
        };
      });
    }

    function renderSubInfo(meta) {
      const box = document.getElementById('previewSubInfo');
      if (!box) return;
      if (!meta) {
        box.innerHTML = '';
        return;
      }
      const links = [];
      if (meta.webUrl) links.push({ label: 'Сайт', url: meta.webUrl });
      if (meta.supportUrl) links.push({ label: 'Поддержка', url: meta.supportUrl });
      if (meta.announceUrl) links.push({ label: 'Анонс', url: meta.announceUrl });
      if (meta.infoBtnLink) links.push({ label: meta.infoBtnText || 'Подробнее', url: meta.infoBtnLink });

      const announce = meta.announce || meta.infoText || '';
      if (!announce && !links.length) {
        box.innerHTML = '';
        return;
      }

      box.innerHTML = `
        ${announce ? `<div class="subinfo-announce">${escapeHtml(announce)}</div>` : ''}
        ${links.length ? `<div class="subinfo-links">${links.map((l) =>
          `<a class="subinfo-link-btn" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`
        ).join('')}</div>` : ''}
      `;
    }

    function renderProtocolInfo(servers) {
      const box = document.getElementById('previewProto');
      if (!box) return;
      if (!servers || !servers.length) {
        box.innerHTML = '<div class="proto-empty">Нет данных о протоколах</div>';
        return;
      }
      const counts = {};
      servers.forEach((s) => {
        const p = s.protocol || 'Unknown';
        counts[p] = (counts[p] || 0) + 1;
      });
      const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      box.innerHTML = `
        <div class="proto-title">Типы серверов</div>
        <div class="proto-grid">
          ${rows.map(([name, count]) => `
            <div class="proto-row">
              <span class="proto-name">${escapeHtml(name)}</span>
              <span class="proto-count">${count}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    function toggleInfoPanel() {
      const panel = document.getElementById('previewInfoPanel');
      const btn = document.getElementById('previewInfoBtn');
      if (!panel || !btn) return;
      const opening = panel.hasAttribute('hidden');
      if (opening) {
        renderSubInfo(previewState && previewState.meta);
        renderProtocolInfo(previewState && previewState.servers);
        panel.removeAttribute('hidden');
        btn.classList.add('is-active');
      } else {
        panel.setAttribute('hidden', '');
        btn.classList.remove('is-active');
      }
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function updateStats(visibleServers, allTotal) {
      const servers = visibleServers || [];
      const total = typeof allTotal === 'number' ? allTotal : servers.length;
      const shown = servers.length;
      const measured = servers.filter((s) => s.ping !== undefined && !s.pinging);
      const ok = measured.filter((s) => s.ping != null).length;
      const best = measured.reduce((acc, s) => (s.ping != null && (acc == null || s.ping < acc) ? s.ping : acc), null);
      const el = document.getElementById('previewStats');
      el.innerHTML = `
        <div class="stat"><span class="stat-label">Серверов</span><span class="stat-value">${shown}${shown !== total ? '/' + total : ''}</span></div>
        <div class="stat"><span class="stat-label">Доступно</span><span class="stat-value">${measured.length ? ok : '—'}</span></div>
        <div class="stat"><span class="stat-label">Лучший пинг</span><span class="stat-value">${best == null ? '—' : best + ' ms'}</span></div>
      `;
      document.getElementById('previewMeta').textContent = total
        ? `${total} сервер${pluralRu(total)} · интерфейс Happ`
        : 'Нет серверов';
    }

    function setPingUi(active, done, total, session) {
      if (typeof session === 'number' && !isPreviewSession(session)) return;
      const btn = document.getElementById('previewPingBtn');
      const status = document.getElementById('previewPingStatus');
      if (!btn || !status) return;
      btn.classList.toggle('is-pinging', !!active);
      btn.disabled = !!active;
      if (active) {
        status.hidden = false;
        status.innerHTML = `<span class="ping-spinner"></span> Проверка пинга… ${done}/${total}`;
      } else if (total) {
        status.hidden = false;
        status.textContent = `Пинг завершён · проверено ${done}/${total}`;
        clearTimeout(setPingUi._t);
        setPingUi._t = setTimeout(() => {
          if (typeof session === 'number' && !isPreviewSession(session)) return;
          status.hidden = true;
        }, 2500);
      } else {
        status.hidden = true;
      }
    }

    function pluralRu(n) {
      const m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return '';
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'а';
      return 'ов';
    }

    function renderApps(item) {
      const box = document.getElementById('previewApps');
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      box.innerHTML = '';
      APP_DEEP_LINKS.forEach((app) => {
        if (app.iosOnly && !isIOS && !/Mac/i.test(navigator.userAgent)) {
          // Shadowrocket — iOS; на десктопе/Android кнопку всё равно покажем, но пометим
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preview-app-btn' + (app.iosOnly ? ' preview-app-btn--ios' : '');
        btn.textContent = app.name + (app.iosOnly ? ' · iOS' : '');
        btn.onclick = () => {
          const deep = app.build(item.link, item.name);
          openDeepLink(deep, app);
        };
        box.appendChild(btn);
      });
    }

    async function startPingPass(servers, session) {
      if (!servers || !servers.length) return;
      if (!isPreviewSession(session)) return;
      stopAllPings();
      pingAbort = new AbortController();
      const signal = pingAbort.signal;
      previewState.pinging = true;
      let done = 0;
      servers.forEach((s) => { s.pinging = true; delete s.ping; });
      refreshServerList();
      setPingUi(true, 0, servers.length, session);
      updateStats(getVisibleServers(), servers.length);
      await runPings(
        servers,
        (server) => {
          if (!isPreviewSession(session) || signal.aborted) return;
          done += 1;
          refreshServerList();
          setPingUi(true, done, servers.length, session);
          updateStats(getVisibleServers(), servers.length);
        },
        () => isPreviewSession(session) && !signal.aborted,
        signal
      );
      if (!isPreviewSession(session) || signal.aborted) return;
      previewState.pinging = false;
      refreshServerList();
      setPingUi(false, servers.length, servers.length, session);
    }

    function showPreviewLoadError(item, session) {
      const list = document.getElementById('previewList');
      list.innerHTML =
        '<div class="preview-loading preview-loading--error">' +
          '<div>Не удалось загрузить подписку после 10 попыток.</div>' +
          '<button type="button" class="preview-retry-btn" id="previewRetryBtn">Повторить</button>' +
        '</div>';
      document.getElementById('previewMeta').textContent = 'Ошибка загрузки';
      const btn = document.getElementById('previewRetryBtn');
      if (btn) {
        btn.onclick = () => {
          if (!isPreviewSession(session)) return;
          openPreview(item);
        };
      }
    }

    async function openPreview(item) {
      const overlay = ensurePreviewModal();
      invalidatePreviewSession();
      const session = previewSession;
      previewState = {
        link: item.link,
        name: item.name,
        servers: [],
        meta: null,
        pinging: false,
        protocolFilter: 'Все',
        session
      };
      resetPreviewChrome(item);
      renderApps(item);
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';

      const fetchUrl = stripHash(item.link);
      delete subCache[fetchUrl];
      const text = await fetchTextWithRetries(fetchUrl, {
        attempts: 10,
        timeoutMs: 5000,
        shouldContinue: () => isPreviewSession(session),
        onAttempt: (n, total) => {
          if (!isPreviewSession(session)) return;
          document.getElementById('previewMeta').textContent =
            n === 1 ? 'Загрузка подписки…' : `Повтор ${n} из ${total}…`;
          document.getElementById('previewList').innerHTML =
            '<div class="preview-loading">' +
              (n === 1
                ? 'Загрузка списка серверов…'
                : `Не загрузилось за 5 с — попытка ${n} из ${total}…`) +
            '</div>';
        }
      });
      if (!isPreviewSession(session)) return;

      if (!text) {
        showPreviewLoadError(item, session);
        return;
      }

      const meta = parseSubMeta(text);
      const servers = parseSubscription(text);
      servers.forEach((s, i) => { s.id = i; });
      if (!isPreviewSession(session)) return;
      previewState.servers = servers;
      previewState.meta = meta;
      previewState.protocolFilter = 'Все';
      if (meta.title) document.getElementById('previewTitle').textContent = meta.title;
      renderProtocolTabs(servers);
      updateStats(servers, servers.length);

      if (!servers.length) {
        document.getElementById('previewList').innerHTML = '<div class="preview-loading">Серверы не найдены в ответе подписки.</div>';
        return;
      }
      refreshServerList();
      startPingPass(servers, session);
    }

    window.loadUpdt = loadUpdt;
    window.openPreview = openPreview;
    window.fetchText = fetchText;
  