import tkinter as tk
from tkinter import ttk, scrolledtext, filedialog, messagebox
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

# Настройка логирования
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('vless_processor.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)

class VLESSProcessor:
    def __init__(self, root):
        self.root = root
        self.root.title("VLESS Links Processor")
        self.root.geometry("900x700")
        
        logging.info("Программа запущена")
        
        # Переменные
        self.profile_title = tk.StringVar(value="My VLESS Config")
        self.profile_url = tk.StringVar()
        self.timezone_offset = tk.StringVar(value="+3")
        self.current_file = None
        
        # Переменные для многопоточности
        self.stop_event = threading.Event()
        self.processing_thread = None
        self.queue = queue.Queue()
        
        self.create_ui()
        
    def create_ui(self):
        """Создание пользовательского интерфейса"""
        logging.info("Создание UI интерфейса")
        
        # Главный контейнер с прокруткой
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Настройка профиля
        profile_frame = ttk.LabelFrame(main_frame, text="Настройки профиля", padding="10")
        profile_frame.grid(row=0, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        ttk.Label(profile_frame, text="Название профиля:").grid(row=0, column=0, sticky=tk.W, pady=2)
        ttk.Entry(profile_frame, textvariable=self.profile_title, width=50).grid(row=0, column=1, sticky=(tk.W, tk.E), pady=2)
        
        ttk.Label(profile_frame, text="URL профиля:").grid(row=1, column=0, sticky=tk.W, pady=2)
        ttk.Entry(profile_frame, textvariable=self.profile_url, width=50).grid(row=1, column=1, sticky=(tk.W, tk.E), pady=2)
        
        ttk.Label(profile_frame, text="Часовой пояс (UTC):").grid(row=2, column=0, sticky=tk.W, pady=2)
        timezone_frame = ttk.Frame(profile_frame)
        timezone_frame.grid(row=2, column=1, sticky=tk.W, pady=2)
        ttk.Entry(timezone_frame, textvariable=self.timezone_offset, width=10).pack(side=tk.LEFT)
        ttk.Label(timezone_frame, text="(например: +3 или -5)").pack(side=tk.LEFT, padx=5)
        
        # Работа с файлами
        file_frame = ttk.LabelFrame(main_frame, text="Файл", padding="10")
        file_frame.grid(row=1, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        ttk.Button(file_frame, text="Открыть существующий файл", command=self.load_file).grid(row=0, column=0, padx=5, pady=2)
        ttk.Button(file_frame, text="Создать новый файл", command=self.create_new_file).grid(row=0, column=1, padx=5, pady=2)
        
        self.file_info_label = ttk.Label(file_frame, text="Файл не выбран", foreground="gray")
        self.file_info_label.grid(row=1, column=0, columnspan=2, pady=5)
        
        # Ввод URL-ссылок
        links_frame = ttk.LabelFrame(main_frame, text="Вставьте URL-ссылки на текстовые файлы (по одной на строку)", padding="10")
        links_frame.grid(row=2, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S), pady=5)
        
        self.links_text = scrolledtext.ScrolledText(links_frame, width=100, height=10, wrap=tk.WORD)
        self.links_text.pack(fill=tk.BOTH, expand=True)
        
        # Кнопки обработки
        button_frame = ttk.Frame(main_frame)
        button_frame.grid(row=3, column=0, columnspan=2, pady=10)
        
        self.process_button = ttk.Button(button_frame, text="Обработать ссылки", command=self.process_links, style="Accent.TButton")
        self.process_button.pack(side=tk.LEFT, padx=5)
        self.cancel_button = ttk.Button(button_frame, text="Отменить", command=self.cancel_processing)
        self.cancel_button.pack(side=tk.LEFT, padx=5)
        self.cancel_button.config(state=tk.DISABLED)
        
        # Добавим индикатор выполнения
        self.progress = ttk.Progressbar(main_frame, mode='indeterminate')
        self.progress.grid(row=4, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        self.progress.grid_remove()  # Скрываем по умолчанию
        
        # Обновим расположение логов
        log_frame = ttk.LabelFrame(main_frame, text="Лог операций", padding="10")
        log_frame.grid(row=5, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S), pady=5)
        
        self.log_text = scrolledtext.ScrolledText(log_frame, width=100, height=10, wrap=tk.WORD, state=tk.DISABLED)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        # Настройка весов для растягивания
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)
        main_frame.rowconfigure(2, weight=1)
        main_frame.rowconfigure(5, weight=1)
        
        # Добавим кнопки для работы с логами
        self.add_log_buttons(main_frame)
        
    def add_log_buttons(self, main_frame):
        """Добавление кнопок для работы с логами"""
        # Фрейм для кнопок логов
        log_buttons_frame = ttk.LabelFrame(main_frame, text="Операции с логами", padding="10")
        log_buttons_frame.grid(row=6, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        # Кнопка для отображения лога
        ttk.Button(log_buttons_frame, text="Показать лог", command=self.show_log).pack(side=tk.LEFT, padx=5)
        
        # Кнопка для сжатия лога
        ttk.Button(log_buttons_frame, text="Сжать лог", command=self.compress_log).pack(side=tk.LEFT, padx=5)
        
        # Кнопка для удаления строк с vless
        ttk.Button(log_buttons_frame, text="Удалить vless строки", command=self.remove_vless_lines).pack(side=tk.LEFT, padx=5)
        

        
    def log_to_ui(self, message, level="INFO"):
        """Добавление сообщения в UI лог"""
        self.log_text.config(state=tk.NORMAL)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.log_text.insert(tk.END, f"[{timestamp}] [{level}] {message}\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)
        
    def load_file(self):
        """Загрузка существующего файла"""
        logging.info("Попытка открыть существующий файл")
        filename = filedialog.askopenfilename(
            title="Выберите файл конфигурации",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")]
        )
        
        if filename:
            self.current_file = Path(filename)
            logging.info(f"Выбран файл: {filename}")
            self.log_to_ui(f"Открыт файл: {filename}")
            
            # Чтение файла и извлечение настроек
            try:
                with open(filename, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                # Извлечение profile-title
                title_match = re.search(r'#profile-title:\s*(.+)', content)
                if title_match:
                    self.profile_title.set(title_match.group(1).strip())
                    logging.info(f"Извлечено название профиля: {title_match.group(1).strip()}")
                    
                # Извлечение profile-web-page-url
                url_match = re.search(r'#profile-web-page-url:\s*(.+)', content)
                if url_match:
                    self.profile_url.set(url_match.group(1).strip())
                    logging.info(f"Извлечён URL профиля: {url_match.group(1).strip()}")
                    
                # Подсчет существующих VLESS строк
                vless_lines = [line for line in content.split('\n') if line.strip().startswith('vless://')]
                
                self.file_info_label.config(
                    text=f"Активный файл: {Path(filename).name} | Серверов: {len(vless_lines)}",
                    foreground="green"
                )
                self.log_to_ui(f"Файл содержит {len(vless_lines)} VLESS серверов")
                
            except Exception as e:
                logging.error(f"Ошибка при чтении файла: {str(e)}")
                self.log_to_ui(f"Ошибка при чтении файла: {str(e)}", "ERROR")
                messagebox.showerror("Ошибка", f"Не удалось прочитать файл: {str(e)}")
    
    def create_new_file(self):
        """Создание нового файла"""
        logging.info("Создание нового файла")
        filename = filedialog.asksaveasfilename(
            title="Сохранить новый файл конфигурации",
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")]
        )
        
        if filename:
            self.current_file = Path(filename)
            logging.info(f"Создан новый файл: {filename}")
            self.log_to_ui(f"Создан новый файл: {filename}")
            self.file_info_label.config(
                text=f"Активный файл: {Path(filename).name} | Серверов: 0",
                foreground="blue"
            )
    
    def cancel_processing(self):
        """Отмена текущей операции"""
        if self.processing_thread and self.processing_thread.is_alive():
            self.stop_event.set()
            self.log_to_ui("Отмена операции...", "WARNING")
            self.process_button.config(state=tk.NORMAL)
            self.cancel_button.config(state=tk.DISABLED)
            self.progress.stop()
            self.progress.grid_remove()
    
    def clear_input(self):
        """Очистка поля ввода"""
        logging.info("Очистка поля ввода ссылок")
        self.links_text.delete(1.0, tk.END)
        self.log_to_ui("Поле ввода очищено")
        
    def update_ui_during_processing(self):
        """Обновление UI во время обработки"""
        if self.processing_thread and self.processing_thread.is_alive():
            self.process_button.config(state=tk.DISABLED)
            self.cancel_button.config(state=tk.NORMAL)
            self.progress.grid()
            self.progress.start()
            self.root.after(100, self.update_ui_during_processing)
        else:
            self.process_button.config(state=tk.NORMAL)
            self.cancel_button.config(state=tk.DISABLED)
            self.progress.stop()
            self.progress.grid_remove()
    
    def fetch_url_content(self, url):
        """Скачивание содержимого по URL"""
        try:
            logging.info(f"Запрос к URL: {url}")
            self.log_to_ui(f"Загрузка содержимого: {url}")
            
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            
            # Попытка декодировать с разными кодировками
            try:
                content = response.content.decode('utf-8')
            except UnicodeDecodeError:
                try:
                    content = response.content.decode('latin-1')
                except UnicodeDecodeError:
                    content = response.content.decode('utf-8', errors='ignore')
            
            lines = content.split('\n')
            logging.info(f"Успешно загружено {len(lines)} строк из {url}")
            self.log_to_ui(f"✓ Загружено {len(lines)} строк из URL")
            
            return lines
            
        except requests.exceptions.RequestException as e:
            logging.error(f"Ошибка при загрузке {url}: {str(e)}")
            self.log_to_ui(f"✗ Ошибка загрузки {url}: {str(e)}", "ERROR")
            return []
        except Exception as e:
            logging.error(f"Неожиданная ошибка при загрузке {url}: {str(e)}")
            self.log_to_ui(f"✗ Неожиданная ошибка: {str(e)}", "ERROR")
            return []
    
    def fetch_url_content_threaded(self, url, result_queue):
        """Скачивание содержимого по URL в отдельном потоке"""
        if self.stop_event.is_set():
            return
        try:
            content = self.fetch_url_content(url)
            result_queue.put((url, content, None))
        except Exception as e:
            result_queue.put((url, None, str(e)))
    
    def process_links(self):
        """Обработка введенных URL-ссылок в отдельном потоке"""
        if self.processing_thread and self.processing_thread.is_alive():
            messagebox.showwarning("Предупреждение", "Процесс уже выполняется!")
            return
            
        # Сброс флага остановки
        self.stop_event.clear()
        
        # Запуск обработки в отдельном потоке
        self.processing_thread = threading.Thread(target=self._process_links_threaded)
        self.processing_thread.daemon = True
        self.processing_thread.start()
        
        # Проверка состояния потока
        self.root.after(100, self.check_processing_thread)
    
    def _process_links_threaded(self):
        """Обработка введенных URL-ссылок в отдельном потоке"""
        logging.info("Начало обработки URL-ссылок")
        self.queue.put(("log", "=" * 50))
        self.queue.put(("log", "Начало обработки URL-ссылок"))
        
        if not self.current_file:
            logging.warning("Файл не выбран")
            self.queue.put(("log", "Ошибка: Сначала выберите или создайте файл", "ERROR"))
            self.queue.put(("error", "Сначала выберите или создайте файл!"))
            return
        
        # Получение введенных URL
        input_text = self.links_text.get(1.0, tk.END)
        urls = [line.strip() for line in input_text.split('\n') if line.strip()]
        
        logging.info(f"Получено {len(urls)} URL для обработки")
        self.queue.put(("log", f"Получено URL для обработки: {len(urls)}"))
        
        if not urls:
            logging.warning("Нет URL для обработки")
            self.queue.put(("log", "Предупреждение: Нет URL для обработки", "WARNING"))
            self.queue.put(("error", "Введите хотя бы один URL!"))
            return
        
        # Проверка, что это действительно URL
        valid_urls = []
        for url in urls:
            parsed = urlparse(url)
            if parsed.scheme in ['http', 'https']:
                valid_urls.append(url)
                logging.debug(f"Валидный URL: {url}")
            else:
                logging.warning(f"Невалидный URL (пропущен): {url}")
                self.queue.put(("log", f"Пропущен невалидный URL: {url}", "WARNING"))
        
        if not valid_urls:
            logging.warning("Не найдено валидных URL")
            self.queue.put(("log", "Ошибка: Не найдено валидных URL (должны начинаться с http:// или https://)", "ERROR"))
            self.queue.put(("error", "Не найдено валидных URL! URL должны начинаться с http:// или https://"))
            return
        
        self.queue.put(("log", f"Валидных URL: {len(valid_urls)}"))
        
        # Скачивание и обработка содержимого каждого URL
        all_vless_links = []
        
        # Создаем очередь для результатов
        result_queue = queue.Queue()
        
        # Запускаем потоки для скачивания
        threads = []
        for i, url in enumerate(valid_urls, 1):
            if self.stop_event.is_set():
                break
            self.queue.put(("log", f"\n[{i}/{len(valid_urls)}] Обработка URL: {url}"))
            thread = threading.Thread(target=self.fetch_url_content_threaded, args=(url, result_queue))
            thread.daemon = True
            thread.start()
            threads.append(thread)
        
        # Ждем завершения всех потоков
        for thread in threads:
            thread.join(timeout=60)  # Таймаут 60 секунд
        
        # Собираем результаты
        downloaded_contents = []
        while not result_queue.empty():
            try:
                url, content, error = result_queue.get_nowait()
                if error:
                    self.queue.put(("log", f"Ошибка при загрузке {url}: {error}", "ERROR"))
                elif content is not None:
                    downloaded_contents.append((url, content))
                    self.queue.put(("log", f"✓ Загружено {len(content)} строк из {url}"))
            except queue.Empty:
                break
        
        # Обрабатываем содержимое
        for url, lines in downloaded_contents:
            if self.stop_event.is_set():
                break
                
            # Фильтрация VLESS ссылок из загруженного содержимого
            url_vless_count = 0
            for line in lines:
                line = line.strip()
                if line.startswith('vless://'):
                    if 'security=reality' in line or 'security=tls' in line:
                        all_vless_links.append(line)
                        url_vless_count += 1
                        logging.debug(f"Найдена валидная VLESS ссылка: {line[:50]}...")
            
            self.queue.put(("log", f"  Найдено валидных VLESS ссылок: {url_vless_count}"))
            logging.info(f"Из URL {url} извлечено {url_vless_count} VLESS ссылок")
        
        self.queue.put(("log", f"\nВсего найдено валидных VLESS ссылок: {len(all_vless_links)}"))
        logging.info(f"Всего найдено валидных VLESS ссылок: {len(all_vless_links)}")
        
        if not all_vless_links:
            logging.warning("Не найдено подходящих VLESS ссылок")
            self.queue.put(("log", "Предупреждение: Не найдено подходящих VLESS ссылок", "WARNING"))
            self.queue.put(("error", "Не найдено ссылок начинающихся с vless:// и содержащих security=reality или security=tls"))
            return
        
        # Удаление строк без дубликатов (оставляем только те, что встречаются более одного раза)
        link_counts = Counter(all_vless_links)
        duplicated_links = [link for link, count in link_counts.items() if count > 1]
        unique_links = [link for link, count in link_counts.items() if count == 1]
        
        logging.info(f"Уникальных ссылок (удалены): {len(unique_links)}")
        logging.info(f"Ссылок с дубликатами (оставлены): {len(duplicated_links)}")
        self.queue.put(("log", f"Уникальных ссылок (удалены): {len(unique_links)}"))
        self.queue.put(("log", f"Ссылок с дубликатами (оставлены): {len(duplicated_links)}"))
        
        if not duplicated_links:
            logging.warning("Нет ссылок с дубликатами")
            self.queue.put(("log", "Предупреждение: Нет ссылок с дубликатами", "WARNING"))
            self.queue.put(("error", "Нет ссылок, которые встречаются более одного раза!"))
            return
        
        # Создание заголовка файла
        try:
            tz_offset = int(self.timezone_offset.get())
            tz_string = f"UTC{tz_offset:+d}"
        except ValueError:
            tz_string = "UTC+3"
            logging.warning(f"Неверный формат часового пояса, используется UTC+3")
        
        now = datetime.now()
        date_string = now.strftime(f"%d.%m.%Y %H:%M {tz_string}")
        
        header = f"""#profile-title: {self.profile_title.get()}
#profile-update-interval: 1
#profile-web-page-url: {self.profile_url.get()}
#support-url: https://2ip.ru/
#announce: 🥥 Обновлено {date_string} 🏝️ Серверов {len(duplicated_links)} 🐭🐭 —————————————————————————————————————— Подойдёт для обычных сайтов. Для банков, рабочих аккаунтов и любых важных данных - не стоит.

"""

        # Запись в файл
        try:
            with open(self.current_file, 'w', encoding='utf-8') as f:
                f.write(header)
                for link in duplicated_links:
                    f.write(link + '\n')
            
            logging.info(f"Файл успешно сохранён: {self.current_file}")
            self.queue.put(("log", f"\n✓ Файл успешно сохранён: {self.current_file.name}"))
            self.queue.put(("log", f"✓ Записано серверов: {len(duplicated_links)}"))
            
            # Обновление информации о файле
            self.queue.put(("success", f"Файл успешно сохранён!\n\nОбработано URL: {len(valid_urls)}\nНайдено VLESS ссылок: {len(all_vless_links)}\nУдалено уникальных: {len(unique_links)}\nЗаписано с дубликатами: {len(duplicated_links)}"))
            
        except Exception as e:
            logging.error(f"Ошибка при сохранении файла: {str(e)}")
            self.queue.put(("log", f"✗ Ошибка при сохранении: {str(e)}", "ERROR"))
            self.queue.put(("error", f"Не удалось сохранить файл: {str(e)}"))
    
    def check_processing_thread(self):
        """Проверка состояния потока обработки"""
        if self.processing_thread and self.processing_thread.is_alive():
            # Обрабатываем сообщения из очереди
            while not self.queue.empty():
                try:
                    msg_type, *msg_data = self.queue.get_nowait()
                    if msg_type == "log":
                        if len(msg_data) == 1:
                            self.log_to_ui(msg_data[0])
                        else:
                            self.log_to_ui(msg_data[0], msg_data[1])
                    elif msg_type == "error":
                        messagebox.showerror("Ошибка", msg_data[0])
                    elif msg_type == "success":
                        messagebox.showinfo("Успех", msg_data[0])
                except queue.Empty:
                    break
            # Повторная проверка через 100 мс
            self.root.after(100, self.check_processing_thread)
        else:
            # Поток завершен
            while not self.queue.empty():
                try:
                    msg_type, *msg_data = self.queue.get_nowait()
                    if msg_type == "log":
                        if len(msg_data) == 1:
                            self.log_to_ui(msg_data[0])
                        else:
                            self.log_to_ui(msg_data[0], msg_data[1])
                    elif msg_type == "error":
                        messagebox.showerror("Ошибка", msg_data[0])
                    elif msg_type == "success":
                        messagebox.showinfo("Успех", msg_data[0])
                except queue.Empty:
                    break
    
    def show_log(self):
        """Отображение содержимого лог-файла"""
        try:
            # Проверяем наличие файла
            if not os.path.exists('vless_processor.log'):
                messagebox.showinfo("Информация", "Лог-файл не существует")
                return
            
            # Читаем содержимое файла
            with open('vless_processor.log', 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Открываем новое окно с содержимым лога
            log_window = tk.Toplevel(self.root)
            log_window.title("Содержимое лог-файла")
            log_window.geometry("800x600")
            
            # Создаем текстовое поле с прокруткой
            text_area = scrolledtext.ScrolledText(log_window, wrap=tk.WORD, width=100, height=30)
            text_area.pack(padx=10, pady=10, fill=tk.BOTH, expand=True)
            text_area.insert(tk.END, content)
            text_area.config(state=tk.DISABLED)
            
        except Exception as e:
            messagebox.showerror("Ошибка", f"Не удалось открыть лог-файл: {str(e)}")
    
    def compress_log(self):
        """Сжатие лог-файла: удаление дублирующихся строк"""
        try:
            # Проверяем наличие файла
            if not os.path.exists('vless_processor.log'):
                messagebox.showinfo("Информация", "Лог-файл не существует")
                return
            
            # Читаем содержимое файла
            with open('vless_processor.log', 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            # Удаляем дублирующиеся строки, оставляя только одну копию
            seen_lines = set()
            unique_lines = []
            duplicate_count = 0
            
            for line in lines:
                if line.strip() in seen_lines:
                    duplicate_count += 1
                else:
                    seen_lines.add(line.strip())
                    unique_lines.append(line)
            
            # Записываем обратно в файл
            with open('vless_processor.log', 'w', encoding='utf-8') as f:
                f.writelines(unique_lines)
            
            messagebox.showinfo("Успех", f"Лог-файл сжат!\nУдалено дублирующихся строк: {duplicate_count}")
            self.log_to_ui(f"Лог-файл сжат. Удалено дублирующихся строк: {duplicate_count}")
            
        except Exception as e:
            messagebox.showerror("Ошибка", f"Не удалось сжать лог-файл: {str(e)}")
    
    def remove_vless_lines(self):
        """Удаление всех строк, содержащих 'vless' из целевого файла"""
        # Сначала спрашиваем пользователя, какой файл он хочет обработать
        filename = filedialog.askopenfilename(
            title="Выберите файл для обработки",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")]
        )
        
        if not filename:
            return
        
        try:
            # Читаем содержимое файла
            with open(filename, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            # Удаляем строки, содержащие 'vless'
            filtered_lines = [line for line in lines if 'vless' not in line.lower()]
            removed_count = len(lines) - len(filtered_lines)
            
            # Записываем обратно в файл
            with open(filename, 'w', encoding='utf-8') as f:
                f.writelines(filtered_lines)
            
            messagebox.showinfo("Успех", f"Строки с 'vless' удалены!\nУдалено строк: {removed_count}")
            self.log_to_ui(f"Из файла {os.path.basename(filename)} удалено строк с 'vless': {removed_count}")
            
        except Exception as e:
            messagebox.showerror("Ошибка", f"Не удалось обработать файл: {str(e)}")
    
    def add_log_buttons(self, main_frame):
        """Добавление кнопок для работы с логами"""
        # Фрейм для кнопок логов
        log_buttons_frame = ttk.LabelFrame(main_frame, text="Операции с логами", padding="10")
        log_buttons_frame.grid(row=6, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=5)
        
        # Кнопка для отображения лога
        ttk.Button(log_buttons_frame, text="Показать лог", command=self.show_log).pack(side=tk.LEFT, padx=5)
        
        # Кнопка для сжатия лога
        ttk.Button(log_buttons_frame, text="Сжать лог", command=self.compress_log).pack(side=tk.LEFT, padx=5)
        
        # Кнопка для удаления строк с vless
        ttk.Button(log_buttons_frame, text="Удалить vless строки", command=self.remove_vless_lines).pack(side=tk.LEFT, padx=5)

def main():
    """Главная функция запуска программы"""
    root = tk.Tk()
    app = VLESSProcessor(root)
    
    # Обработка закрытия окна
    def on_closing():
        logging.info("Программа закрывается")
        root.destroy()
    
    root.protocol("WM_DELETE_WINDOW", on_closing)
    root.mainloop()

if __name__ == "__main__":
    main()