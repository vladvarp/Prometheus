/**
 * =============================================================================
 *  SOLIST — список публичных подписок
 *  Файл: WEB/solist-subs.js
 * =============================================================================
 *
 *  БЫСТРОЕ РЕДАКТИРОВАНИЕ
 *  ----------------------
 *  Откройте WEB/solist-admin.html в браузере — добавление, удаление, скрытие,
 *  порядок и превью. Потом «Скачать solist-subs.js» и замените этот файл.
 *
 *  ПОЛЯ: name, link, updt, updtAlt (//updt), hidden
 *  ФОРМАТЫ updt: '' | 'текст' | 'URL' | 'URL||фрагмент'
 * =============================================================================
 */

window.SOLIST_SUBS = [
  {
    name: "🥥KokosVPN🏝",
    link: "https://raw.githubusercontent.com/vladvarp/Prometheus/refs/heads/main/WhiteList/vless.txt",
    updt: "https://raw.githubusercontent.com/vladvarp/Prometheus/refs/heads/main/WhiteList/vless.txt||Обновлено",
    updtAlt: "https://api.github.com/repos/vladvarp/Prometheus/commits||\"date\":"
  },
  {
    name: "🚀 Динамичный список 50 серверов",
    link: "https://random.solovyov-jenya2004.workers.dev/?n=50#🚀 all_subs",
    updt: "https://api.github.com/repos/solovyov-jenya2004/all_subs/commits||\"date\":"
  },
  {
    name: "🚀 Динамичный список 100 серверов",
    link: "https://random.solovyov-jenya2004.workers.dev/?n=100#🚀 all_subs",
    updt: "https://api.github.com/repos/solovyov-jenya2004/all_subs/commits||\"date\":"
  },
  {
    name: "🚀 Динамичный список 200 серверов",
    link: "https://random.solovyov-jenya2004.workers.dev/?n=200#🚀 all_subs",
    updt: "https://api.github.com/repos/solovyov-jenya2004/all_subs/commits||\"date\":"
  },
  {
    name: "Igareck",
    link: "https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/refs/heads/main/WHITE-CIDR-RU-all.txt#igareck",
    updt: "https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/refs/heads/main/WHITE-CIDR-RU-all.txt||Date/Time:",
    updtAlt: "https://api.github.com/repos/igareck/vpn-configs-for-russia/commits||\"date\":"
  },
  {
    name: "Aviamastersgh-RU",
    link: "https://raw.githubusercontent.com/aviamastersgh/vpn-free-russia/main/ru_configs.txt#Aviamaster-RU",
    updt: "https://raw.githubusercontent.com/aviamastersgh/vpn-free-russia/main/ru_configs.txt||Обновлено",
    updtAlt: "https://api.github.com/repos/aviamastersgh/vpn-free-russia/commits||\"date\":"
  },
  {
    name: "Aviamastersgh-✅",
    link: "https://raw.githubusercontent.com/aviamastersgh/vpn-free-russia/main/verified_configs.txt#Aviamaster-✅",
    updt: "https://raw.githubusercontent.com/aviamastersgh/vpn-free-russia/main/verified_configs.txt||Обновлено",
    updtAlt: "https://api.github.com/repos/aviamastersgh/vpn-free-russia/commits||\"date\":"
  },
  {
    name: "Aviamastersgh-all",
    link: "https://raw.githubusercontent.com/aviamastersgh/vpn-free-russia/main/all_configs.txt#Aviamaster-all",
    updt: "https://raw.githubusercontent.com/aviamastersgh/vpn-free-russia/main/all_configs.txt||Обновлено",
    updtAlt: "https://api.github.com/repos/aviamastersgh/vpn-free-russia/commits||\"date\":"
  },
  {
    name: "FreeProxyList",
    link: "https://raw.githubusercontent.com/nikita29a/FreeProxyList/refs/heads/main/mirror/1.txt",
    updt: "https://api.github.com/repos/nikita29a/FreeProxyList/commits||\"date\":",
    hidden: true
  },
  {
    name: "✨AsperaVPN",
    link: "https://raw.githubusercontent.com/v0id9/vpn-configs/refs/heads/main/vpn.txt#✨AsperaVPN",
    updt: "https://api.github.com/repos/v0id9/vpn-configs/commits||\"date\":",
    hidden: true
  },
  {
    name: "Jsxta",
    link: "https://gbr.mydan.online/configs#Jsxta",
    updt: "https://api.github.com/repos/jsxta/whitelist-russia/commits||\"date\":",
    hidden: true
  }
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
