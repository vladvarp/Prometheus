// Функция для отображения информации о VPN
function showVPNInfo() {
  // Создаем модальное окно с информацией
  const modal = document.createElement('div');
  modal.id = 'vpn-info-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.8);
    z-index: 10000;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
    box-sizing: border-box;
  `;
  
  modal.innerHTML = `
    <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; max-width: 500px; width: 100%; max-height: 80vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="color: var(--accent); margin: 0;">Информация о VPN</h3>
        <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background: none; border: none; color: var(--text-dim); font-size: 24px; cursor: pointer;">×</button>
      </div>
      <div style="color: var(--text); line-height: 1.6; font-size: 14px;">
        <p><strong>Почему отображается "-" вместо страны?</strong></p>
        <p>Это может происходить по следующим причинам:</p>
        <ul style="margin: 12px 0 12px 20px;">
          <li>Некоторые источники данных не возвращают информацию о стране для определенных IP-адресов</li>
          <li>Используется VPN, который меняет IP-адреса при каждом подключении</li>
          <li>Некоторые источники API могут быть временно недоступны</li>
          <li>Некоторые источники возвращают только IP-адрес без информации о стране</li>
        </ul>
        
        <p><strong>Почему IP-адреса могут меняться?</strong></p>
        <p>При использовании VPN возможны следующие причины изменения IP-адресов:</p>
        <ul style="margin: 12px 0 12px 20px;">
          <li>VPN-провайдеры используют несколько серверов в разных странах</li>
          <li>Источники данных могут возвращать разные IP-адреса для одного и того же VPN-сервера</li>
          <li>Некоторые источники используют IP-адреса, которые не имеют привязки к конкретной стране</li>
          <li>Источники могут временно менять IP-адреса для обеспечения стабильности соединения</li>
          <li>При использовании VPN с несколькими серверами, разные источники могут показывать разные IP-адреса</li>
        </ul>
        
        <p>Это нормальное поведение для VPN-сервисов и не указывает на ошибку в работе системы.</p>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}