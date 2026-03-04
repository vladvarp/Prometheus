import sys
import logging
from datetime import datetime
from pathlib import Path
import re
from collections import Counter
import requests
from urllib.parse import urlparse
import threading
import queue
import os
import json
import time

from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QLabel, QLineEdit, QPushButton, 
                             QTextEdit, QFileDialog, QMessageBox, QGroupBox,
                             QProgressBar, QFrame, QListWidget, QListWidgetItem)
from PyQt5.QtCore import Qt, QTimer, pyqtSignal, QObject
from PyQt5.QtGui import QFont, QIcon, QPalette, QColor, QTextCursor

# Настройка логирования
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('vless_processor.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)


class WorkerSignals(QObject):
    """Сигналы для обмена данными между потоками"""
    log_message = pyqtSignal(str, str)  # message, level
    show_error = pyqtSignal(str)
    show_success = pyqtSignal(str)
    finished = pyqtSignal()
    update_file_info = pyqtSignal(int)  # servers_count
    show_url_preview = pyqtSignal(str)  # готовый текст для окна "Данные об источниках"


class VLESSProcessorGUI(QMainWindow):
    def __init__(self):
        super().__init__()
        self.current_file = None
        self.current_servers_count = 0
        self.stop_event = threading.Event()
        self.processing_thread = None
        self.message_queue = queue.Queue()
        self.signals = WorkerSignals()
        self.settings_file = 'vless_settings.json'
        
        # Подключение сигналов
        self.signals.log_message.connect(self.log_to_ui)
        self.signals.show_error.connect(self.show_error_dialog)
        self.signals.show_success.connect(self.show_success_dialog)
        self.signals.finished.connect(self.on_processing_finished)
        self.signals.update_file_info.connect(self.update_file_info_label)
        self.signals.show_url_preview.connect(self._show_url_preview_dialog)
        
        logging.info("Программа запущена")
        self.init_ui()
        
        # Загрузка сохраненных настроек
        self.load_settings()
        
    def init_ui(self):
        """Инициализация пользовательского интерфейса"""
        self.setWindowTitle("VLESS Links Processor")
        self.setGeometry(100, 100, 1200, 700)
        
        # Применение стилей
        self.apply_styles()
        
        # Центральный виджет
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setSpacing(15)
        main_layout.setContentsMargins(20, 20, 20, 20)
        
        # Заголовок
        self.create_header(main_layout)
        
        # Создаем двухколоночный layout
        columns_layout = QHBoxLayout()
        columns_layout.setSpacing(15)
        
        # Левая колонка
        left_column = QVBoxLayout()
        left_column.setSpacing(15)
        
        # Настройки профиля
        self.create_profile_settings(left_column)
        
        # Работа с файлами
        self.create_file_section(left_column)
        
        # Операции с логами
        self.create_log_operations(left_column)
        
        left_column.addStretch()
        
        # Правая колонка
        right_column = QVBoxLayout()
        right_column.setSpacing(15)
        
        # Ввод URL
        self.create_url_input(right_column)
        
        # Кнопки обработки
        self.create_processing_buttons(right_column)
        
        # Прогресс-бар
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setTextVisible(False)
        right_column.addWidget(self.progress_bar)
        
        # Лог операций
        self.create_log_section(right_column)
        
        # Добавляем колонки в основной layout
        columns_layout.addLayout(left_column, 1)
        columns_layout.addLayout(right_column, 1)
        
        main_layout.addLayout(columns_layout)
        
    def apply_styles(self):
        """Применение современных стилей"""
        self.setStyleSheet("""
            QMainWindow {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 #4d4d4d, stop:1 #000000);
            }
            QWidget {
                color: #2d3748;
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 10pt;
            }
            QGroupBox {
                background-color: white;
                border-radius: 12px;
                padding: 15px;
                margin-top: 10px;
                font-weight: bold;
                border: 2px solid #e2e8f0;
            }
            QGroupBox::title {
                color: #4a5568;
                subcontrol-origin: margin;
                subcontrol-position: top left;
                padding: 5px 10px;
                background-color: white;
                border-radius: 5px;
            }
            QLineEdit {
                padding: 10px 15px;
                border: 2px solid #e2e8f0;
                border-radius: 8px;
                background-color: #f7fafc;
                font-size: 10pt;
            }
            QLineEdit:focus {
                border: 2px solid #667eea;
                background-color: white;
            }
            QPushButton {
                padding: 10px 20px;
                border: none;
                border-radius: 8px;
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #667eea, stop:1 #764ba2);
                color: white;
                font-weight: bold;
                font-size: 10pt;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #5568d3, stop:1 #6b3f8f);
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #4c5fc7, stop:1 #5f3880);
            }
            QPushButton:disabled {
                background: #cbd5e0;
                color: #a0aec0;
            }
            QPushButton.secondary {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #48bb78, stop:1 #38a169);
            }
            QPushButton.secondary:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #38a169, stop:1 #2f855a);
            }
            QPushButton.danger {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #f56565, stop:1 #e53e3e);
            }
            QPushButton.danger:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #e53e3e, stop:1 #c53030);
            }
            QTextEdit {
                border: 2px solid #e2e8f0;
                border-radius: 8px;
                background-color: #f7fafc;
                padding: 10px;
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 9pt;
            }
            QTextEdit:focus {
                border: 2px solid #667eea;
                background-color: white;
            }
            QProgressBar {
                border: 2px solid #e2e8f0;
                border-radius: 8px;
                text-align: center;
                background-color: #f7fafc;
                height: 25px;
            }
            QProgressBar::chunk {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #667eea, stop:1 #764ba2);
                border-radius: 6px;
            }
            QLabel {
                color: #2d3748;
            }
        """)
        
    def create_header(self, layout):
        """Создание заголовка"""
        header = QLabel("🔐 VLESS Links Processor")
        header.setAlignment(Qt.AlignCenter)
        header.setStyleSheet("""
            QLabel {
                color: white;
                font-size: 24pt;
                font-weight: bold;
                padding: 15px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                margin-bottom: 10px;
            }
        """)
        layout.addWidget(header)
        
    def create_profile_settings(self, layout):
        """Создание секции настроек профиля"""
        group = QGroupBox("⚙️ Настройки профиля")
        group_layout = QVBoxLayout()
        
        # Название профиля
        profile_layout = QHBoxLayout()
        profile_label = QLabel("Название профиля:")
        profile_label.setFixedWidth(150)
        self.profile_title_input = QLineEdit("My VLESS Config")
        self.profile_title_input.textChanged.connect(self.save_settings)
        profile_layout.addWidget(profile_label)
        profile_layout.addWidget(self.profile_title_input)
        group_layout.addLayout(profile_layout)
        
        # URL профиля
        url_layout = QHBoxLayout()
        url_label = QLabel("URL профиля:")
        url_label.setFixedWidth(150)
        self.profile_url_input = QLineEdit()
        self.profile_url_input.textChanged.connect(self.save_settings)
        url_layout.addWidget(url_label)
        url_layout.addWidget(self.profile_url_input)
        group_layout.addLayout(url_layout)
        
        # URL веб-сайта
        website_layout = QHBoxLayout()
        website_label = QLabel("URL Веб сайт:")
        website_label.setFixedWidth(150)
        self.website_url_input = QLineEdit()
        self.website_url_input.textChanged.connect(self.save_settings)
        website_layout.addWidget(website_label)
        website_layout.addWidget(self.website_url_input)
        group_layout.addLayout(website_layout)
        
        # Часовой пояс
        tz_layout = QHBoxLayout()
        tz_label = QLabel("Часовой пояс (UTC):")
        tz_label.setFixedWidth(150)
        self.timezone_input = QLineEdit("+3")
        self.timezone_input.setFixedWidth(100)
        self.timezone_input.textChanged.connect(self.save_settings)
        tz_hint = QLabel("(например: +3 или -5)")
        tz_hint.setStyleSheet("color: #718096; font-size: 9pt;")
        tz_layout.addWidget(tz_label)
        tz_layout.addWidget(self.timezone_input)
        tz_layout.addWidget(tz_hint)
        tz_layout.addStretch()
        group_layout.addLayout(tz_layout)
        
        group.setLayout(group_layout)
        layout.addWidget(group)
        
    def create_file_section(self, layout):
        """Создание секции работы с файлами"""
        group = QGroupBox("📁 Управление файлами")
        group_layout = QVBoxLayout()
        
        # Кнопки работы с файлами
        button_layout = QHBoxLayout()
        
        open_btn = QPushButton("📂 Открыть файл")
        open_btn.clicked.connect(self.load_file)
        open_btn.setProperty("class", "secondary")
        
        create_btn = QPushButton("📄 Создать новый")
        create_btn.clicked.connect(self.create_new_file)
        
        button_layout.addWidget(open_btn)
        button_layout.addWidget(create_btn)
        
        group_layout.addLayout(button_layout)
        
        # Кнопка удаления vless строк
        remove_btn = QPushButton("🗑️ Удалить vless строки из файла")
        remove_btn.clicked.connect(self.remove_vless_lines)
        remove_btn.setProperty("class", "danger")
        group_layout.addWidget(remove_btn)
        
        # Информация о файле
        self.file_info_label = QLabel("📄 Файл не выбран")
        self.file_info_label.setStyleSheet("""
            QLabel {
                color: #718096;
                padding: 10px;
                background-color: #edf2f7;
                border-radius: 6px;
                font-size: 10pt;
            }
        """)
        group_layout.addWidget(self.file_info_label)
        
        group.setLayout(group_layout)
        layout.addWidget(group)
        
    def create_url_input(self, layout):
        """Создание секции ввода URL"""
        group = QGroupBox("🔗 Источники")
        group_layout = QVBoxLayout()
        
        hint = QLabel("Список источников (по одному на строку). Отметьте галочкой те, которые нужно учитывать.")
        hint.setStyleSheet("color: #718096; font-size: 9pt; margin-bottom: 5px;")
        group_layout.addWidget(hint)
        
        # Список URL с галочками
        self.links_list = QListWidget()
        self.links_list.setStyleSheet("""
            QListWidget {
                border: 2px solid #e2e8f0;
                border-radius: 8px;
                background-color: #f7fafc;
                padding: 6px;
            }
        """)
        group_layout.addWidget(self.links_list)

        # Поле для добавления новых URL + кнопки
        controls_layout = QHBoxLayout()
        self.new_url_input = QLineEdit()
        self.new_url_input.setPlaceholderText("Вставьте путь на источник и нажмите «Добавить»")
        add_url_btn = QPushButton("➕ Добавить")
        add_url_btn.setProperty("class", "secondary")
        add_url_btn.clicked.connect(self.add_url_from_input)

        remove_url_btn = QPushButton("🗑️ Удалить выбранные")
        remove_url_btn.setProperty("class", "danger")
        remove_url_btn.clicked.connect(self.remove_selected_urls)

        controls_layout.addWidget(self.new_url_input)
        controls_layout.addWidget(add_url_btn)
        controls_layout.addWidget(remove_url_btn)

        group_layout.addLayout(controls_layout)
        
        group.setLayout(group_layout)
        layout.addWidget(group)
        
    def create_processing_buttons(self, layout):
        """Создание кнопок обработки"""
        button_layout = QHBoxLayout()
        button_layout.setSpacing(10)
        
        self.process_btn = QPushButton("🚀 Обработать ссылки")
        self.process_btn.clicked.connect(self.process_links)
        self.process_btn.setMinimumHeight(40)
        self.process_btn.setStyleSheet("""
            QPushButton {
                font-size: 11pt;
                font-weight: bold;
            }
        """)
        
        self.cancel_btn = QPushButton("⛔ Отменить")
        self.cancel_btn.clicked.connect(self.cancel_processing)
        self.cancel_btn.setEnabled(False)
        self.cancel_btn.setProperty("class", "danger")
        self.cancel_btn.setMinimumHeight(40)
        
        button_layout.addWidget(self.process_btn)
        button_layout.addWidget(self.cancel_btn)
        
        layout.addLayout(button_layout)
        
        # Кнопка отображения первой строки из URL
        self.show_url_first_line_btn = QPushButton("📄 Данные об источниках")
        self.show_url_first_line_btn.clicked.connect(self.show_url_first_lines)
        self.show_url_first_line_btn.setProperty("class", "secondary")
        layout.addWidget(self.show_url_first_line_btn)
        
    def create_log_section(self, layout):
        """Создание секции логов"""
        group = QGroupBox("📋 Лог операций")
        group_layout = QVBoxLayout()
        
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        group_layout.addWidget(self.log_text)

        # Кнопка очистки лога в окне
        clear_ui_log_btn = QPushButton("🧹 Очистить лог в окне")
        clear_ui_log_btn.clicked.connect(self.clear_ui_log)
        clear_ui_log_btn.setProperty("class", "secondary")
        group_layout.addWidget(clear_ui_log_btn)
        
        group.setLayout(group_layout)
        layout.addWidget(group)
        
    def create_log_operations(self, layout):
        """Создание секции операций с логами"""
        group = QGroupBox("🔧 Операции с логами")
        group_layout = QVBoxLayout()
        
        show_log_btn = QPushButton("👁️ Показать лог-файл")
        show_log_btn.clicked.connect(self.show_log)
        show_log_btn.setProperty("class", "secondary")
        
        clear_log_file_btn = QPushButton("🧹 Очистить лог-файл")
        clear_log_file_btn.clicked.connect(self.clear_log_file)
        clear_log_file_btn.setProperty("class", "secondary")
        
        compress_log_btn = QPushButton("🗜️ Сжать лог-файл")
        compress_log_btn.clicked.connect(self.compress_log)
        compress_log_btn.setProperty("class", "secondary")
        
        group_layout.addWidget(show_log_btn)
        group_layout.addWidget(clear_log_file_btn)
        group_layout.addWidget(compress_log_btn)
        
        group.setLayout(group_layout)
        layout.addWidget(group)
        
    def clear_ui_log(self):
        """Очистка лога в окне программы"""
        self.log_text.clear()
        logging.info("Лог в окне очищен пользователем")
        
    def log_to_ui(self, message, level="INFO"):
        """Добавление сообщения в UI лог"""
        raw_message = message  # исходное сообщение для файла лога
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        # Цветовая схема для разных уровней
        color_map = {
            "INFO": "#2d3748",
            "WARNING": "#d69e2e",
            "ERROR": "#e53e3e",
            "SUCCESS": "#38a169"
        }
        
        color = color_map.get(level, "#2d3748")
        level_upper = level.upper()

        # Для отображения в UI заменяем переводы строк на <br>
        html_message = raw_message.replace('\n', '<br>')
        formatted_message = f'<span style="color: {color};">[{timestamp}] {html_message}</span><br>'
        self.log_text.append(formatted_message)

        # Дублируем сообщение в файл лога через стандартный logging
        if level_upper == "INFO":
            logging.info(raw_message)
        elif level_upper == "WARNING":
            logging.warning(raw_message)
        elif level_upper == "ERROR":
            logging.error(raw_message)
        elif level_upper == "SUCCESS":
            logging.info(f"SUCCESS: {raw_message}")
        else:
            logging.info(raw_message)
        
    def save_settings(self):
        """Сохранение настроек программы"""
        settings = {
            'last_file': str(self.current_file) if self.current_file else None,
            'profile_title': self.profile_title_input.text(),
            'profile_url': self.profile_url_input.text(),
            'website_url': self.website_url_input.text(),
            'timezone': self.timezone_input.text(),
            # Сохраняем URL с информацией о галочках в формате "[x] url" / "[ ] url"
            'urls': "\n".join(
                f"[{'x' if self.links_list.item(i).checkState() == Qt.Checked else ' '}] {self.links_list.item(i).text()}"
                for i in range(self.links_list.count())
                if self.links_list.item(i) and self.links_list.item(i).text().strip()
            )
        }
        
        try:
            with open(self.settings_file, 'w', encoding='utf-8') as f:
                json.dump(settings, f, ensure_ascii=False, indent=2)
            logging.info("Настройки сохранены")
        except Exception as e:
            logging.error(f"Ошибка при сохранении настроек: {str(e)}")
            
    def load_settings(self):
        """Загрузка сохраненных настроек"""
        try:
            if os.path.exists(self.settings_file):
                with open(self.settings_file, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
                
                # Восстановление последнего файла
                if settings.get('last_file') and os.path.exists(settings['last_file']):
                    self.current_file = Path(settings['last_file'])
                    self.load_file_content(self.current_file)
                    self.log_to_ui(f"Загружен последний файл: {self.current_file.name}", "SUCCESS")
                
                # Восстановление полей
                if settings.get('profile_title'):
                    self.profile_title_input.setText(settings['profile_title'])
                if settings.get('profile_url'):
                    self.profile_url_input.setText(settings['profile_url'])
                if settings.get('website_url'):
                    self.website_url_input.setText(settings['website_url'])
                if settings.get('timezone'):
                    self.timezone_input.setText(settings['timezone'])
                if settings.get('urls'):
                    # Восстанавливаем список URL с галочками
                    self.links_list.clear()
                    for line in settings['urls'].splitlines():
                        if not line.strip():
                            continue
                        # Формат совместимости:
                        # 1) Новый формат: "[x] url" или "[ ] url"
                        # 2) Старый формат: просто "url"
                        checked = True
                        url_text = line.strip()
                        if url_text.startswith('[') and ']' in url_text:
                            prefix, rest = url_text.split(']', 1)
                            mark = prefix[1:].strip().lower()
                            checked = (mark == 'x')
                            url_text = rest.strip()
                        item = QListWidgetItem(url_text)
                        item.setFlags(item.flags() | Qt.ItemIsUserCheckable | Qt.ItemIsEditable)
                        item.setCheckState(Qt.Checked if checked else Qt.Unchecked)
                        self.links_list.addItem(item)
                else:
                    # Совместимость: если в старых настройках urls не было, ничего не делаем
                    pass
                    
                logging.info("Настройки загружены")
        except Exception as e:
            logging.error(f"Ошибка при загрузке настроек: {str(e)}")
    
    def add_url_from_input(self):
        """Добавление нового URL из поля ввода в список с галочкой."""
        text = self.new_url_input.text().strip()
        if not text:
            return
        item = QListWidgetItem(text)
        item.setFlags(item.flags() | Qt.ItemIsUserCheckable | Qt.ItemIsEditable)
        item.setCheckState(Qt.Checked)
        self.links_list.addItem(item)
        self.new_url_input.clear()
        self.save_settings()

    def remove_selected_urls(self):
        """Удаление выбранных URL из списка."""
        selected_items = self.links_list.selectedItems()
        for item in selected_items:
            row = self.links_list.row(item)
            self.links_list.takeItem(row)
        self.save_settings()

    def get_enabled_urls(self):
        """Возвращает список URL, отмеченных галочкой, в порядке их расположения."""
        urls = []
        if not hasattr(self, 'links_list') or self.links_list is None:
            return urls
        for i in range(self.links_list.count()):
            item = self.links_list.item(i)
            if not item:
                continue
            if item.checkState() != Qt.Checked:
                continue
            url = item.text().strip()
            if url:
                urls.append(url)
        return urls

    def _is_url(self, text: str) -> bool:
        """Проверка, что строка является HTTP/HTTPS URL."""
        try:
            parsed = urlparse(text)
            return parsed.scheme in ['http', 'https']
        except Exception:
            return False

    def _is_existing_file(self, text: str) -> bool:
        """Проверка, что строка является существующим локальным файлом."""
        try:
            return Path(text).is_file()
        except Exception:
            return False

    def _get_source_display_name(self, source: str) -> str:
        """Короткое имя источника (имя файла для URL и путей)."""
        if self._is_url(source):
            parsed = urlparse(source)
            name = Path(parsed.path).name
            return name or source
        else:
            return Path(source).name or source

    def _show_url_preview_dialog(self, result_text: str):
        """Показ окна с результатами «Данные об источниках» в главном потоке."""
        dialog = QWidget()
        dialog.setWindowTitle("Отчет")
        dialog.setGeometry(200, 200, 800, 600)

        layout = QVBoxLayout()

        text_area = QTextEdit()
        text_area.setReadOnly(True)
        text_area.setPlainText(result_text)
        layout.addWidget(text_area)

        close_btn = QPushButton("Закрыть")
        close_btn.clicked.connect(dialog.close)
        layout.addWidget(close_btn)

        dialog.setLayout(layout)
        dialog.show()

        # Сохраняем ссылку, чтобы окно не закрылось сборщиком мусора
        if not hasattr(self, 'url_preview_windows'):
            self.url_preview_windows = []
        self.url_preview_windows.append(dialog)

        # Разблокируем кнопку
        if hasattr(self, "show_url_first_line_btn"):
            self.show_url_first_line_btn.setEnabled(True)

    def add_url_from_input(self):
        """Добавление нового URL из поля ввода в список с галочкой."""
        text = self.new_url_input.text().strip()
        if not text:
            return
        item = QListWidgetItem(text)
        item.setFlags(item.flags() | Qt.ItemIsUserCheckable | Qt.ItemIsEditable)
        item.setCheckState(Qt.Checked)
        self.links_list.addItem(item)
        self.new_url_input.clear()
        self.save_settings()

    def remove_selected_urls(self):
        """Удаление выбранных URL из списка."""
        selected_items = self.links_list.selectedItems()
        for item in selected_items:
            row = self.links_list.row(item)
            self.links_list.takeItem(row)
        self.save_settings()

    def get_enabled_urls(self):
        """Возвращает список URL, отмеченных галочкой, в порядке их расположения."""
        urls = []
        if not hasattr(self, 'links_list') or self.links_list is None:
            return urls
        for i in range(self.links_list.count()):
            item = self.links_list.item(i)
            if not item:
                continue
            if item.checkState() != Qt.Checked:
                continue
            url = item.text().strip()
            if url:
                urls.append(url)
        return urls

    def load_file_content(self, filepath):
        """Загрузка содержимого файла без диалога"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Извлечение настроек
            title_match = re.search(r'#profile-title:\s*(.+)', content)
            if title_match:
                self.profile_title_input.setText(title_match.group(1).strip())
                
            url_match = re.search(r'#profile-web-page-url:\s*(.+)', content)
            if url_match:
                self.profile_url_input.setText(url_match.group(1).strip())
                
            # Извлечение URL веб-сайта
            website_match = re.search(r'#support-url:\s*(.+)', content)
            if website_match:
                self.website_url_input.setText(website_match.group(1).strip())
                
            # Подсчет VLESS строк
            vless_lines = [line for line in content.split('\n') if line.strip().startswith('vless://')]
            self.current_servers_count = len(vless_lines)
            
            self.file_info_label.setText(
                f"✅ Активный файл: {filepath.name} | Серверов: {self.current_servers_count}"
            )
            self.file_info_label.setStyleSheet("""
                QLabel {
                    color: #38a169;
                    padding: 10px;
                    background-color: #f0fff4;
                    border-radius: 6px;
                    font-weight: bold;
                }
            """)
            
        except Exception as e:
            logging.error(f"Ошибка при чтении файла: {str(e)}")
            
    def update_file_info_label(self, servers_count):
        """Обновление информации о файле"""
        self.current_servers_count = servers_count
        if self.current_file:
            self.file_info_label.setText(
                f"✅ Активный файл: {self.current_file.name} | Серверов: {servers_count}"
            )
            self.file_info_label.setStyleSheet("""
                QLabel {
                    color: #38a169;
                    padding: 10px;
                    background-color: #f0fff4;
                    border-radius: 6px;
                    font-weight: bold;
                }
            """)
        
    def load_file(self):
        """Загрузка существующего файла"""
        logging.info("Попытка открыть существующий файл")
        
        filename, _ = QFileDialog.getOpenFileName(
            self,
            "Выберите файл конфигурации",
            "",
            "Text files (*.txt);;All files (*.*)"
        )
        
        if filename:
            self.current_file = Path(filename)
            logging.info(f"Выбран файл: {filename}")
            self.log_to_ui(f"Открыт файл: {filename}")
            
            self.load_file_content(self.current_file)
            self.log_to_ui(f"Файл содержит {self.current_servers_count} VLESS серверов", "SUCCESS")
            
            # Сохраняем настройки
            self.save_settings()
                
    def create_new_file(self):
        """Создание нового файла"""
        logging.info("Создание нового файла")
        
        filename, _ = QFileDialog.getSaveFileName(
            self,
            "Сохранить новый файл конфигурации",
            "",
            "Text files (*.txt);;All files (*.*)"
        )
        
        if filename:
            self.current_file = Path(filename)
            self.current_servers_count = 0
            logging.info(f"Создан новый файл: {filename}")
            self.log_to_ui(f"Создан новый файл: {filename}", "SUCCESS")
            self.file_info_label.setText(
                f"📄 Активный файл: {Path(filename).name} | Серверов: 0"
            )
            self.file_info_label.setStyleSheet("""
                QLabel {
                    color: #667eea;
                    padding: 10px;
                    background-color: #f0f4ff;
                    border-radius: 6px;
                    font-weight: bold;
                }
            """)
            
            # Сохраняем настройки
            self.save_settings()
            
    def process_links(self):
        """Обработка введенных URL-ссылок"""
        if self.processing_thread and self.processing_thread.is_alive():
            QMessageBox.warning(self, "Предупреждение", "Процесс уже выполняется!")
            return
            
        self.stop_event.clear()
        self.processing_thread = threading.Thread(target=self._process_links_threaded)
        self.processing_thread.daemon = True
        self.processing_thread.start()
        
        # Обновление UI
        self.process_btn.setEnabled(False)
        self.cancel_btn.setEnabled(True)
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)  # Индикатор неопределенности
        
        # Запуск таймера для проверки состояния
        self.timer = QTimer()
        self.timer.timeout.connect(self.check_processing_thread)
        self.timer.start(100)
        
    def _process_links_threaded(self):
        """Обработка URL-ссылок в отдельном потоке"""
        logging.info("Начало обработки URL-ссылок")
        self.message_queue.put(("log", "=" * 80, "INFO"))
        self.message_queue.put(("log", "🚀 НАЧАЛО ОБРАБОТКИ URL-ССЫЛОК", "SUCCESS"))
        self.message_queue.put(("log", "=" * 80, "INFO"))
        
        if not self.current_file:
            logging.warning("Файл не выбран")
            self.message_queue.put(("log", "❌ Ошибка: Сначала выберите или создайте файл", "ERROR"))
            self.message_queue.put(("error", "Сначала выберите или создайте файл!"))
            return
        
        # Получение источников: URL и/или локальные файлы, отмеченные галочкой, в порядке списка
        sources = self.get_enabled_urls()
        
        logging.info(f"Получено {len(sources)} источников для обработки")
        self.message_queue.put(("log", f"\n📊 СТАТИСТИКА ВХОДНЫХ ДАННЫХ:", "INFO"))
        self.message_queue.put(("log", f"   • Всего источников введено: {len(sources)}", "INFO"))
        
        if not sources:
            logging.warning("Нет источников для обработки")
            self.message_queue.put(("log", "⚠️ Предупреждение: Нет источников для обработки", "WARNING"))
            self.message_queue.put(("error", "Введите хотя бы один источник (URL или путь к файлу)!"))
            return
        
        # Валидация источников (URL или существующий локальный файл)
        valid_sources = []
        invalid_count = 0
        for src in sources:
            if self._is_url(src) or self._is_existing_file(src):
                valid_sources.append(src)
            else:
                invalid_count += 1
                self.message_queue.put(("log", f"   ⚠️ Пропущен невалидный источник: {src}", "WARNING"))
        
        if not valid_sources:
            self.message_queue.put(("log", "❌ Ошибка: Не найдено валидных источников", "ERROR"))
            self.message_queue.put(("error", "Не найдено валидных источников! Источник должен быть URL (http/https) или существующим файлом."))
            return
        
        self.message_queue.put(("log", f"   • Валидных источников: {len(valid_sources)}", "SUCCESS"))
        self.message_queue.put(("log", f"   • Невалидных источников: {invalid_count}", "WARNING" if invalid_count > 0 else "INFO"))
        
        # Загрузка содержимого
        self.message_queue.put(("log", f"\n📥 ЗАГРУЗКА СОДЕРЖИМОГО:", "INFO"))
        all_vless_links = []
        result_queue = queue.Queue()
        
        threads = []
        for i, src in enumerate(valid_sources, 1):
            if self.stop_event.is_set():
                break
            self.message_queue.put(("log", f"   [{i}/{len(valid_sources)}] Загрузка: {src}", "INFO"))
            if self._is_url(src):
                thread = threading.Thread(target=self.fetch_url_content_threaded, args=(src, result_queue))
            else:
                thread = threading.Thread(target=self.read_file_content_threaded, args=(src, result_queue))
            thread.daemon = True
            thread.start()
            threads.append(thread)
        
        # Ожидание завершения
        for thread in threads:
            thread.join(timeout=60)
        
        # Сбор результатов
        downloaded_contents = []
        failed_count = 0
        total_lines = 0
        
        while not result_queue.empty():
            try:
                source, content, error = result_queue.get_nowait()
                if error:
                    failed_count += 1
                    self.message_queue.put(("log", f"   ❌ Ошибка при загрузке {source}: {error}", "ERROR"))
                elif content is not None:
                    downloaded_contents.append((source, content))
                    total_lines += len(content)
                    self.message_queue.put(("log", f"   ✅ Загружено {len(content)} строк", "SUCCESS"))
            except queue.Empty:
                break
        
        self.message_queue.put(("log", f"\n📊 РЕЗУЛЬТАТЫ ЗАГРУЗКИ:", "INFO"))
        self.message_queue.put(("log", f"   • Успешно загружено источников: {len(downloaded_contents)}", "SUCCESS"))
        if failed_count > 0:
            self.message_queue.put(("log", f"   • Не удалось загрузить: {failed_count}", "ERROR"))
        self.message_queue.put(("log", f"   • Всего строк загружено: {total_lines}", "INFO"))
        
        # Обработка содержимого
        self.message_queue.put(("log", f"\n🔍 ФИЛЬТРАЦИЯ VLESS ССЫЛОК:", "INFO"))
        
        for i, (source, lines) in enumerate(downloaded_contents, 1):
            if self.stop_event.is_set():
                break
                
            url_vless_count = 0
            for line in lines:
                line = line.strip()
                if line.startswith('vless://'):
                    if 'security=reality' in line or 'security=tls' in line:
                        all_vless_links.append(line)
                        url_vless_count += 1
            
            self.message_queue.put(("log", f"   [{i}/{len(downloaded_contents)}] Источник: найдено {url_vless_count} VLESS", "SUCCESS" if url_vless_count > 0 else "WARNING"))
        
        self.message_queue.put(("log", f"\n📊 РЕЗУЛЬТАТЫ ФИЛЬТРАЦИИ:", "INFO"))
        self.message_queue.put(("log", f"   • Всего найдено VLESS ссылок: {len(all_vless_links)}", "SUCCESS"))
        
        if not all_vless_links:
            self.message_queue.put(("log", "⚠️ Предупреждение: Не найдено подходящих VLESS ссылок", "WARNING"))
            self.message_queue.put(("error", "Не найдено ссылок начинающихся с vless:// и содержащих security=reality или security=tls"))
            return
        
        # Удаление дубликатов
        self.message_queue.put(("log", f"\n🔄 ОБРАБОТКА ДУБЛИКАТОВ:", "INFO"))
        link_counts = Counter(all_vless_links)
        unique_links = list(link_counts.keys())
        removed_duplicates = len(all_vless_links) - len(unique_links)
        
        self.message_queue.put(("log", f"   • Всего ссылок до дедупликации: {len(all_vless_links)}", "INFO"))
        self.message_queue.put(("log", f"   • Уникальных ссылок (оставлены): {len(unique_links)}", "SUCCESS"))
        self.message_queue.put(("log", f"   • Удалено дубликатов: {removed_duplicates}", "WARNING" if removed_duplicates > 0 else "INFO"))
        
        if not unique_links:
            self.message_queue.put(("log", "⚠️ Предупреждение: Нет уникальных ссылок", "WARNING"))
            self.message_queue.put(("error", "Нет уникальных ссылок!"))
            return
        
        # Создание заголовка
        try:
            tz_offset = int(self.timezone_input.text())
            tz_string = f"UTC{tz_offset:+d}"
        except ValueError:
            tz_string = "UTC+3"
        
        now = datetime.now()
        date_string = now.strftime(f"%d.%m.%Y %H:%M {tz_string}")
        
        header = f"""#profile-title: {self.profile_title_input.text()}
#profile-update-interval: 1
#profile-web-page-url: {self.profile_url_input.text()}
#support-url: {self.website_url_input.text()}
#announce: 🥥 Обновлено {date_string} 🏝️ Серверов {len(unique_links)} 🐭🐭 —————————————————————————————————————— Подойдёт для обычных сайтов. Для банков, рабочих аккаунтов и любых важных данных - не стоит.

"""
        
        # Сохранение файла
        self.message_queue.put(("log", f"\n💾 СОХРАНЕНИЕ ФАЙЛА:", "INFO"))
        try:
            with open(self.current_file, 'w', encoding='utf-8') as f:
                f.write(header)
                for link in unique_links:
                    f.write(link + '\n')
            
            self.current_servers_count = len(unique_links)
            
            self.message_queue.put(("log", f"   ✅ Файл: {self.current_file.name}", "SUCCESS"))
            self.message_queue.put(("log", f"   ✅ Записано серверов: {len(unique_links)}", "SUCCESS"))
            
            # Обновляем счетчик файла
            self.message_queue.put(("update_file_info", len(unique_links)))
            
            self.message_queue.put(("log", f"{'=' * 80}", "INFO"))
            self.message_queue.put(("log", f"✅ ОБРАБОТКА ЗАВЕРШЕНА УСПЕШНО", "SUCCESS"))
            self.message_queue.put(("log", f"{'=' * 80}", "INFO"))
            
            success_msg = f"""✅ Файл успешно сохранён!

📊 ИТОГОВАЯ СТАТИСТИКА:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 Обработано источников: {len(valid_sources)}
🔗 Найдено VLESS ссылок: {len(all_vless_links)}
🗑️ Удалено дубликатов: {removed_duplicates}
✅ Записано уникальных: {len(unique_links)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 Файл: {self.current_file.name}
"""
            
            self.message_queue.put(("success", success_msg))
            
        except Exception as e:
            self.message_queue.put(("log", f"❌ Ошибка при сохранении: {str(e)}", "ERROR"))
            self.message_queue.put(("error", f"Не удалось сохранить файл: {str(e)}"))
            
    def fetch_url_content_threaded(self, url, result_queue):
        """Скачивание содержимого URL в потоке"""
        if self.stop_event.is_set():
            return
        try:
            content = self.fetch_url_content(url)
            result_queue.put((url, content, None))
        except Exception as e:
            result_queue.put((url, None, str(e)))

    def read_file_content_threaded(self, filepath, result_queue):
        """Чтение содержимого локального файла в потоке"""
        if self.stop_event.is_set():
            return
        try:
            content = self.read_file_content(filepath)
            result_queue.put((filepath, content, None))
        except Exception as e:
            result_queue.put((filepath, None, str(e)))

    def fetch_url_content(self, url):
        """Скачивание содержимого по URL."""
        try:
            content = self._download_url_with_retries(url)
            if content is None:
                raise RuntimeError("Не удалось загрузить URL после повторных попыток")

            return content.split('\n')

        except Exception as e:
            logging.error(f"Ошибка при загрузке {url}: {str(e)}")
            return []

    def read_file_content(self, filepath):
        """Чтение содержимого локального текстового файла, построчно."""
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read().split('\n')
        except Exception as e:
            logging.error(f"Ошибка при чтении файла {filepath}: {str(e)}")
            return []

    def _download_url_with_retries(self, url, max_retries=3, timeout=30, delay=1.0):
        """Загрузка URL с несколькими попытками.

        Используется и при «Обработать ссылки», и при «Данные об источниках».
        """
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        last_error = None
        for attempt in range(1, max_retries + 1):
            if self.stop_event.is_set():
                return None
            try:
                response = requests.get(url, headers=headers, timeout=timeout)
                response.raise_for_status()

                try:
                    content = response.content.decode('utf-8')
                except UnicodeDecodeError:
                    try:
                        content = response.content.decode('latin-1')
                    except UnicodeDecodeError:
                        content = response.content.decode('utf-8', errors='ignore')

                # Успех
                if attempt > 1:
                    logging.info(f"Успешная повторная загрузка {url} с попытки {attempt}")
                return content
            except Exception as e:
                last_error = e
                logging.warning(f"Попытка {attempt}/{max_retries} загрузить {url} не удалась: {e}")
                if attempt < max_retries:
                    time.sleep(delay)

        logging.error(f"Не удалось загрузить {url} после {max_retries} попыток: {last_error}")
        return None
            
    def check_processing_thread(self):
        """Проверка состояния потока и обработка сообщений"""
        # Обработка сообщений из очереди
        while not self.message_queue.empty():
            try:
                msg_type, *msg_data = self.message_queue.get_nowait()
                if msg_type == "log":
                    self.signals.log_message.emit(msg_data[0], msg_data[1] if len(msg_data) > 1 else "INFO")
                elif msg_type == "error":
                    self.signals.show_error.emit(msg_data[0])
                elif msg_type == "success":
                    self.signals.show_success.emit(msg_data[0])
                elif msg_type == "update_file_info":
                    self.signals.update_file_info.emit(msg_data[0])
            except queue.Empty:
                break
        
        # Проверка завершения потока
        if not self.processing_thread.is_alive():
            self.timer.stop()
            self.signals.finished.emit()
            
    def on_processing_finished(self):
        """Обработка завершения процесса"""
        self.process_btn.setEnabled(True)
        self.cancel_btn.setEnabled(False)
        self.progress_bar.setVisible(False)
        
    def cancel_processing(self):
        """Отмена обработки"""
        if self.processing_thread and self.processing_thread.is_alive():
            self.stop_event.set()
            self.log_to_ui("Отмена операции...", "WARNING")
            
    def show_error_dialog(self, message):
        """Показ диалога ошибки"""
        QMessageBox.critical(self, "Ошибка", message)
        
    def show_success_dialog(self, message):
        """Показ диалога успеха"""
        QMessageBox.information(self, "Успех", message)
        
    def show_log(self):
        """Отображение лог-файла"""
        try:
            if not os.path.exists('vless_processor.log'):
                QMessageBox.information(self, "Информация", "Лог-файл не существует")
                return
            
            with open('vless_processor.log', 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Создание диалога
            dialog = QWidget()
            dialog.setWindowTitle("Содержимое лог-файла")
            dialog.setGeometry(200, 200, 900, 600)
            
            layout = QVBoxLayout()
            
            text_area = QTextEdit()
            text_area.setPlainText(content)
            text_area.setReadOnly(True)
            # Показываем конец файла (последние записи)
            text_area.moveCursor(QTextCursor.End)
            layout.addWidget(text_area)
            
            close_btn = QPushButton("Закрыть")
            close_btn.clicked.connect(dialog.close)
            layout.addWidget(close_btn)
            
            dialog.setLayout(layout)
            dialog.show()
            
            # Сохранение ссылки чтобы окно не закрылось
            if not hasattr(self, 'log_windows'):
                self.log_windows = []
            self.log_windows.append(dialog)
            
        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Не удалось открыть лог-файл: {str(e)}")
            
    def compress_log(self):
        """Сжатие лог-файла"""
        try:
            if not os.path.exists('vless_processor.log'):
                QMessageBox.information(self, "Информация", "Лог-файл не существует")
                return
            
            with open('vless_processor.log', 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            seen_lines = set()
            unique_lines = []
            duplicate_count = 0
            
            for line in lines:
                if line.strip() in seen_lines:
                    duplicate_count += 1
                else:
                    seen_lines.add(line.strip())
                    unique_lines.append(line)
            
            with open('vless_processor.log', 'w', encoding='utf-8') as f:
                f.writelines(unique_lines)
            
            QMessageBox.information(self, "Успех", f"Лог-файл сжат!\nУдалено дублирующихся строк: {duplicate_count}")
            self.log_to_ui(f"Лог-файл сжат. Удалено дублирующихся строк: {duplicate_count}", "SUCCESS")
            
        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Не удалось сжать лог-файл: {str(e)}")
            
    def clear_log_file(self):
        """Очистка файла лога"""
        try:
            if not os.path.exists('vless_processor.log'):
                QMessageBox.information(self, "Информация", "Лог-файл не существует")
                return

            # Очищаем файл
            with open('vless_processor.log', 'w', encoding='utf-8'):
                pass

            QMessageBox.information(self, "Успех", "Лог-файл очищен.")
            self.log_to_ui("Лог-файл очищен пользователем", "SUCCESS")
        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Не удалось очистить лог-файл: {str(e)}")
            
    def remove_vless_lines(self):
        """Удаление строк с vless из текущего файла"""
        if not self.current_file:
            QMessageBox.warning(self, "Предупреждение", "Сначала выберите или создайте файл!")
            return
            
        # Подтверждение действия
        reply = QMessageBox.question(
            self, 
            'Подтверждение', 
            f'Вы уверены, что хотите удалить все строки с "vless" из файла {self.current_file.name}?',
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        
        if reply == QMessageBox.No:
            return
        
        try:
            # Читаем содержимое файла
            with open(self.current_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            # Удаляем строки, содержащие 'vless'
            filtered_lines = [line for line in lines if 'vless' not in line.lower()]
            removed_count = len(lines) - len(filtered_lines)
            
            # Записываем обратно в файл
            with open(self.current_file, 'w', encoding='utf-8') as f:
                f.writelines(filtered_lines)
            
            # Обновляем счетчик (теперь vless строк = 0)
            self.current_servers_count = 0
            self.update_file_info_label(0)
            
            QMessageBox.information(self, "Успех", f"Строки с 'vless' удалены!\nУдалено строк: {removed_count}")
            self.log_to_ui(f"Из файла {self.current_file.name} удалено строк с 'vless': {removed_count}", "SUCCESS")
            self.log_to_ui(f"Текущее количество VLESS серверов: 0", "INFO")
            
        except Exception as e:
            QMessageBox.critical(self, "Ошибка", f"Не удалось обработать файл: {str(e)}")
            self.log_to_ui(f"Ошибка при удалении vless строк: {str(e)}", "ERROR")
            
    def show_url_first_lines(self):
        """Старт фоновой операции «Данные об источниках».

        Берёт только отмеченные галочкой источники и обрабатывает их строго по порядку (сверху вниз)
        в отдельном потоке, чтобы не блокировать интерфейс.
        """
        sources = self.get_enabled_urls()

        if not sources:
            QMessageBox.warning(self, "Предупреждение", "Введите хотя бы один источник (URL или путь к файлу)!")
            return

        # Валидация источников
        valid_sources = []
        for src in sources:
            if self._is_url(src) or self._is_existing_file(src):
                valid_sources.append(src)

        if not valid_sources:
            QMessageBox.warning(self, "Предупреждение", "Не найдено валидных источников! Укажите URL (http/https) или путь к существующему файлу.")
            return

        # Блокируем кнопку на время фоновой работы
        if hasattr(self, "show_url_first_line_btn"):
            self.show_url_first_line_btn.setEnabled(False)

        self.log_to_ui("🚀 Начата фоновая загрузка строк с # и подсчётом vless из отмеченных источников...", "INFO")

        thread = threading.Thread(target=self._show_url_first_lines_threaded, args=(valid_sources,))
        thread.daemon = True
        thread.start()

    def _show_url_first_lines_threaded(self, valid_sources):
        """Фоновая обработка для «Данные об источниках».

        Загружает содержимое всех источников (URL и локальные файлы), собирает строки с #,
        считает строки, начинающиеся с vless, и отправляет готовый текст в основной поток
        отправляет готовый текст в основной поток через сигнал show_url_preview.
        """
        result_lines = ["📄 Отчет об источниках:\n"]

        for i, src in enumerate(valid_sources, 1):
            if self.stop_event.is_set():
                break

            filename = self._get_source_display_name(src)
            # Показываем прогресс в общем логе
            self.signals.log_message.emit(f"[{i}/{len(valid_sources)}] Загрузка и анализ {src}", "INFO")

            # Загрузка содержимого источника
            if self._is_url(src):
                content = self._download_url_with_retries(src)
                if content is None:
                    error_msg = "Не удалось загрузить URL после повторных попыток"
                    result_lines.append(f"{i}. {src}\n   ❌ {error_msg}\n")
                    self.signals.log_message.emit(f"❌ [{i}] {filename}: {error_msg}", "ERROR")
                    continue
            else:
                try:
                    with open(src, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                except Exception as e:
                    error_msg = f"Не удалось прочитать файл: {e}"
                    result_lines.append(f"{i}. {src}\n   ❌ {error_msg}\n")
                    self.signals.log_message.emit(f"❌ [{i}] {filename}: {error_msg}", "ERROR")
                    continue

            lines = content.split('\n')
            hash_lines = [line.strip() for line in lines if line.strip().startswith('#')]
            vless_count = sum(1 for line in lines if line.strip().startswith('vless'))

            result_lines.append(f"{i}. {src}")
            if hash_lines:
                result_lines.append("   📄 =============== INFO ===============")
                for line in hash_lines:
                    result_lines.append(f"      {line}")
            else:
                result_lines.append("   📄 =============== INFO ===============\n   ⚠️ Нет служебных данных")

            # Новая строка с количеством строк, начинающихся с vless
            result_lines.append(f"   🔢 Строк, начинающихся с vless: {vless_count}")
            result_lines.append("")  # пустая строка-разделитель

            header_line = f"📄 [{i}] {filename}"
            block_lines = [header_line] + hash_lines + [f"Строк, начинающихся с vless: {vless_count}"]
            log_block = "\n".join(block_lines)
            self.signals.log_message.emit(log_block, "INFO")

        result_text = "\n".join(result_lines)
        self.signals.show_url_preview.emit(result_text)
        # Разблокируем кнопку
        if hasattr(self, "show_url_first_line_btn"):
            # Разрешено из фонового потока, так как Qt сам маршрутизирует сигнал,
            # но на всякий случай используем сигнал в основной поток через log_message
            self.signals.log_message.emit("✅ Операция «Данные об источниках» завершена.", "SUCCESS")
            # Кнопку включим уже в основном потоке в обработчике предпросмотра
            
    def closeEvent(self, event):
        """Обработка закрытия окна"""
        logging.info("Программа закрывается")
        
        # Сохраняем настройки перед закрытием
        self.save_settings()
        
        if self.processing_thread and self.processing_thread.is_alive():
            self.stop_event.set()
        event.accept()


def main():
    """Главная функция"""
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    
    window = VLESSProcessorGUI()
    window.show()
    
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()