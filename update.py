import tkinter as tk
from tkinter import ttk, scrolledtext, filedialog, messagebox
import logging
from datetime import datetime
from pathlib import Path
import re
from collections import Counter
import requests
from urllib.parse import urlparse

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
        
        ttk.Button(button_frame, text="Обработать ссылки", command=self.process_links, style="Accent.TButton").pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Очистить поле ввода", command=self.clear_input).pack(side=tk.LEFT, padx=5)
        
        # Логи
        log_frame = ttk.LabelFrame(main_frame, text="Лог операций", padding="10")
        log_frame.grid(row=4, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S), pady=5)
        
        self.log_text = scrolledtext.ScrolledText(log_frame, width=100, height=10, wrap=tk.WORD, state=tk.DISABLED)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
        # Настройка весов для растягивания
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)
        main_frame.rowconfigure(2, weight=1)
        main_frame.rowconfigure(4, weight=1)
        
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
    
    def clear_input(self):
        """Очистка поля ввода"""
        logging.info("Очистка поля ввода ссылок")
        self.links_text.delete(1.0, tk.END)
        self.log_to_ui("Поле ввода очищено")
    
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
    
    def process_links(self):
        """Обработка введенных URL-ссылок"""
        logging.info("Начало обработки URL-ссылок")
        self.log_to_ui("=" * 50)
        self.log_to_ui("Начало обработки URL-ссылок")
        
        if not self.current_file:
            logging.warning("Файл не выбран")
            self.log_to_ui("Ошибка: Сначала выберите или создайте файл", "ERROR")
            messagebox.showwarning("Предупреждение", "Сначала выберите или создайте файл!")
            return
        
        # Получение введенных URL
        input_text = self.links_text.get(1.0, tk.END)
        urls = [line.strip() for line in input_text.split('\n') if line.strip()]
        
        logging.info(f"Получено {len(urls)} URL для обработки")
        self.log_to_ui(f"Получено URL для обработки: {len(urls)}")
        
        if not urls:
            logging.warning("Нет URL для обработки")
            self.log_to_ui("Предупреждение: Нет URL для обработки", "WARNING")
            messagebox.showwarning("Предупреждение", "Введите хотя бы один URL!")
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
                self.log_to_ui(f"Пропущен невалидный URL: {url}", "WARNING")
        
        if not valid_urls:
            logging.warning("Не найдено валидных URL")
            self.log_to_ui("Ошибка: Не найдено валидных URL (должны начинаться с http:// или https://)", "ERROR")
            messagebox.showerror("Ошибка", "Не найдено валидных URL! URL должны начинаться с http:// или https://")
            return
        
        self.log_to_ui(f"Валидных URL: {len(valid_urls)}")
        
        # Скачивание и обработка содержимого каждого URL
        all_vless_links = []
        
        for i, url in enumerate(valid_urls, 1):
            self.log_to_ui(f"\n[{i}/{len(valid_urls)}] Обработка URL: {url}")
            lines = self.fetch_url_content(url)
            
            if not lines:
                continue
            
            # Фильтрация VLESS ссылок из загруженного содержимого
            url_vless_count = 0
            for line in lines:
                line = line.strip()
                if line.startswith('vless://'):
                    if 'security=reality' in line or 'security=tls' in line:
                        all_vless_links.append(line)
                        url_vless_count += 1
                        logging.debug(f"Найдена валидная VLESS ссылка: {line[:50]}...")
            
            self.log_to_ui(f"  Найдено валидных VLESS ссылок: {url_vless_count}")
            logging.info(f"Из URL {url} извлечено {url_vless_count} VLESS ссылок")
        
        self.log_to_ui(f"\nВсего найдено валидных VLESS ссылок: {len(all_vless_links)}")
        logging.info(f"Всего найдено валидных VLESS ссылок: {len(all_vless_links)}")
        
        if not all_vless_links:
            logging.warning("Не найдено подходящих VLESS ссылок")
            self.log_to_ui("Предупреждение: Не найдено подходящих VLESS ссылок", "WARNING")
            messagebox.showwarning("Предупреждение", "Не найдено ссылок начинающихся с vless:// и содержащих security=reality или security=tls")
            return
        
        # Удаление строк без дубликатов (оставляем только те, что встречаются более одного раза)
        link_counts = Counter(all_vless_links)
        duplicated_links = [link for link, count in link_counts.items() if count > 1]
        unique_links = [link for link, count in link_counts.items() if count == 1]
        
        logging.info(f"Уникальных ссылок (удалены): {len(unique_links)}")
        logging.info(f"Ссылок с дубликатами (оставлены): {len(duplicated_links)}")
        self.log_to_ui(f"Уникальных ссылок (удалены): {len(unique_links)}")
        self.log_to_ui(f"Ссылок с дубликатами (оставлены): {len(duplicated_links)}")
        
        if not duplicated_links:
            logging.warning("Нет ссылок с дубликатами")
            self.log_to_ui("Предупреждение: Нет ссылок с дубликатами", "WARNING")
            messagebox.showwarning("Предупреждение", "Нет ссылок, которые встречаются более одного раза!")
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
            self.log_to_ui(f"\n✓ Файл успешно сохранён: {self.current_file.name}")
            self.log_to_ui(f"✓ Записано серверов: {len(duplicated_links)}")
            
            # Обновление информации о файле
            self.file_info_label.config(
                text=f"Активный файл: {self.current_file.name} | Серверов: {len(duplicated_links)}",
                foreground="green"
            )
            
            messagebox.showinfo("Успех", f"Файл успешно сохранён!\n\nОбработано URL: {len(valid_urls)}\nНайдено VLESS ссылок: {len(all_vless_links)}\nУдалено уникальных: {len(unique_links)}\nЗаписано с дубликатами: {len(duplicated_links)}")
            
        except Exception as e:
            logging.error(f"Ошибка при сохранении файла: {str(e)}")
            self.log_to_ui(f"✗ Ошибка при сохранении: {str(e)}", "ERROR")
            messagebox.showerror("Ошибка", f"Не удалось сохранить файл: {str(e)}")

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