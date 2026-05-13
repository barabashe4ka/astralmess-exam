import sqlite3
import os
import sys
import time
import datetime
import socket
import random
import threading
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import csv
import re

# =============================================================================
# КОНФИГУРАЦИЯ
# =============================================================================
ADMIN_LOGIN = "Admin"
ADMIN_PASSWORD = "Exam2024!"
DEFAULT_DB_PATH = r"\\192.168.1.100\Exam\tickets.db"
LOG_FILE = "log.txt"

class DatabaseManager:
    def __init__(self, db_path):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path, timeout=15)
        conn.execute("PRAGMA journal_mode=WAL;")
        return conn

    def _init_db(self):
        try:
            conn = self._get_connection()
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tickets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    text TEXT NOT NULL,
                    student_info TEXT DEFAULT NULL
                )
            """)
            conn.commit()
            conn.close()
        except Exception as e:
            pass

    def execute_with_retry(self, action_fn, max_retries=5):
        delay = 0.1
        for i in range(max_retries):
            try:
                conn = self._get_connection()
                result = action_fn(conn)
                conn.commit()
                conn.close()
                return result
            except sqlite3.OperationalError as e:
                if "locked" in str(e).lower():
                    log_message(f"ОШИБКА: база заблокирована (попытка {i+1})")
                    time.sleep(delay)
                    delay *= 2
                else: raise e
        return None

def log_message(message):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {message}\n")
    except: pass

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except: return "127.0.0.1"

# =============================================================================
# АДМИН-ПАНЕЛЬ
# =============================================================================
class AdminWindow:
    def __init__(self, root, db_manager):
        self.root = root
        self.db = db_manager
        self.root.title("Панель преподавателя | Экзамен")
        self.root.geometry("1100x700")
        self.setup_ui()
        self.refresh_monitor()

    def setup_ui(self):
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(expand=True, fill="both", padx=10, pady=10)

        # Вкладка Загрузка
        self.tab_load = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_load, text="Загрузка билетов")
        
        btn_frame = ttk.Frame(self.tab_load)
        btn_frame.pack(fill="x", padx=10, pady=5)
        ttk.Button(btn_frame, text="Открыть TXT файл", command=self.import_from_file).pack(side="left", padx=5)
        ttk.Button(btn_frame, text="Очистить поле", command=lambda: self.txt_input.delete("1.0", "end")).pack(side="left", padx=5)

        self.txt_input = tk.Text(self.tab_load, height=20, font=("Consolas", 10))
        self.txt_input.pack(expand=True, fill="both", padx=10, pady=5)

        ttk.Button(self.tab_load, text="СОХРАНИТЬ ВСЕ В БАЗУ", command=self.load_tickets).pack(pady=10)

        # Вкладка Мониторинг
        self.tab_monitor = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_monitor, text="Студенты и Билеты")

        cols = ("id", "text", "student")
        self.tree = ttk.Treeview(self.tab_monitor, columns=cols, show="headings")
        self.tree.heading("id", text="№")
        self.tree.heading("text", text="Текст билета")
        self.tree.heading("student", text="Студент (ФИО, Группа)")
        self.tree.column("id", width=50, anchor="center")
        self.tree.column("text", width=500)
        self.tree.column("student", width=300)
        
        sb = ttk.Scrollbar(self.tab_monitor, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        self.tree.pack(side="left", expand=True, fill="both", padx=10, pady=10)
        sb.pack(side="right", fill="y", pady=10)

        ctrl = ttk.Frame(self.root)
        ctrl.pack(fill="x", padx=10, pady=5)
        ttk.Button(ctrl, text="Обновить", command=self.refresh_monitor).pack(side="left", padx=5)
        ttk.Button(ctrl, text="Сбросить все билеты", command=self.reset_all).pack(side="left", padx=5)
        ttk.Button(ctrl, text="Экспорт результатов", command=self.export_csv).pack(side="left", padx=5)

        self.status = tk.StringVar(value=f"IP: {get_local_ip()} | {self.db.db_path}")
        ttk.Label(self.root, textvariable=self.status, relief="sunken", anchor="w").pack(side="bottom", fill="x")

    def import_from_file(self):
        path = filedialog.askopenfilename(filetypes=[("Text files", "*.txt")])
        if path:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    self.txt_input.delete("1.0", "end")
                    self.txt_input.insert("1.0", f.read())
            except:
                with open(path, "r", encoding="cp1251") as f:
                    self.txt_input.delete("1.0", "end")
                    self.txt_input.insert("1.0", f.read())

    def load_tickets(self):
        raw = self.txt_input.get("1.0", "end-1c").strip()
        if not raw: return
        
        # Улучшенный парсинг: билет разделяется двумя и более переносами строк (пустая строка)
        # Также поддерживаем явное разделение по "Билет №"
        if "Билет №" in raw:
            parts = re.split(r'(?=Билет №)', raw)
            tickets = [p.strip() for p in parts if p.strip()]
        else:
            # Разделяем по одной или нескольким пустым строкам
            tickets = re.split(r'\n\s*\n', raw)
            tickets = [t.strip() for t in tickets if t.strip()]

        def do_load(conn):
            conn.execute("DELETE FROM tickets")
            conn.execute("DELETE FROM sqlite_sequence WHERE name='tickets'")
            for t in tickets:
                conn.execute("INSERT INTO tickets (text) VALUES (?)", (t,))
        
        self.db.execute_with_retry(do_load)
        messagebox.showinfo("Успех", f"Загружено билетов: {len(tickets)}. Старые данные удалены.")
        self.refresh_monitor()

    def refresh_monitor(self):
        data = self.db.execute_with_retry(lambda c: c.execute("SELECT id, text, student_info FROM tickets").fetchall())
        self.tree.delete(*self.tree.get_children())
        if data:
            for r in data:
                status = r[2] if r[2] else "--- Свободен ---"
                # Удаляем лишние переносы для предпросмотра
                clean_text = r[1].replace("\n", " ")[:100]
                self.tree.insert("", "end", values=(r[0], clean_text + "...", status))

    def reset_all(self):
        if messagebox.askyesno("?", "Сбросить всех студентов?"):
            self.db.execute_with_retry(lambda c: c.execute("UPDATE tickets SET student_info = NULL"))
            self.refresh_monitor()

    def export_csv(self):
        path = filedialog.asksaveasfilename(defaultextension=".csv")
        if not path: return
        data = self.db.execute_with_retry(lambda c: c.execute("SELECT id, text, student_info FROM tickets").fetchall())
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=';')
            w.writerow(["Билет", "Текст", "Студент"])
            for r in data: w.writerow([r[0], r[1], r[2] if r[2] else "Свободен"])
        messagebox.showinfo("ОК", "Экспортировано.")

# =============================================================================
# КЛИЕНТ СТУДЕНТА
# =============================================================================
class StudentWindow:
    def __init__(self, root):
        self.root = root
        self.root.title("Экзамен")
        self.root.geometry("500x550")
        self.root.resizable(False, False)
        self.footer_clicks = 0
        self.last_click = 0
        self.setup_ui()

    def setup_ui(self):
        self.main_f = ttk.Frame(self.root, padding=20)
        self.main_f.pack(expand=True, fill="both")

        ttk.Label(self.main_f, text="Путь к серверу:", font=("Arial", 9, "italic")).pack()
        path_frame = ttk.Frame(self.main_f)
        path_frame.pack(fill="x", pady=5)
        
        self.ent_path = ttk.Entry(path_frame)
        self.ent_path.insert(0, DEFAULT_DB_PATH)
        self.ent_path.pack(side="left", expand=True, fill="x", padx=(0, 5))
        
        btn_check = ttk.Button(path_frame, text="Проверить связь", command=self.check_connection)
        btn_check.pack(side="right")

        ttk.Separator(self.main_f).pack(fill="x", pady=15)

        ttk.Label(self.main_f, text="ФИО Студента:", font=("Arial", 10, "bold")).pack(anchor="w")
        self.ent_fio = ttk.Entry(self.main_f, font=("Arial", 12))
        self.ent_fio.pack(fill="x", pady=5)

        ttk.Label(self.main_f, text="Группа:", font=("Arial", 10, "bold")).pack(anchor="w")
        self.ent_group = ttk.Entry(self.main_f, font=("Arial", 12))
        self.ent_group.pack(fill="x", pady=5)

        self.btn_get = tk.Button(self.main_f, text="ПОЛУЧИТЬ БИЛЕТ", bg="#4CAF50", fg="white", 
                                font=("Arial", 14, "bold"), command=self.start_request, height=2)
        self.btn_get.pack(pady=30, fill="x")

        self.lbl_status = ttk.Label(self.main_f, text="")
        self.lbl_status.pack()

        # Секретка
        self.dot = tk.Label(self.root, text=".", fg="#F0F0F0", bg="#F0F0F0")
        self.dot.place(x=0, y=530, width=20, height=20)
        self.dot.bind("<Button-1>", self.on_secret)

    def check_connection(self):
        path = self.ent_path.get().strip()
        if os.path.exists(path):
            messagebox.showinfo("Связь ОК", "Сервер найден! Можно получать билет.")
        else:
            messagebox.showerror("Ошибка связи", f"Не удалось найти файл по пути:\n{path}\n\nУбедитесь, что папка расшарена и компьютер препода включен.")

    def on_secret(self, e):
        t = time.time()
        if t - self.last_click > 2: self.footer_clicks = 0
        self.footer_clicks += 1
        self.last_click = t
        if self.footer_clicks >= 5:
            self.footer_clicks = 0
            self.open_secret_grid()

    def open_secret_grid(self):
        db_path = self.ent_path.get().strip()
        if not os.path.exists(db_path): return
        db = DatabaseManager(db_path)
        
        fio = self.ent_fio.get().strip()
        grp = self.ent_group.get().strip()
        if len(fio) < 3 or len(grp) < 1:
            messagebox.showwarning("!", "Сначала введите ФИО и группу")
            return

        top = tk.Toplevel(self.root)
        top.title("Выбор билета")
        top.geometry("700x600")
        top.grab_set()

        container = ttk.Frame(top)
        container.pack(expand=True, fill="both")

        canvas = tk.Canvas(container)
        scroll = ttk.Scrollbar(container, orient="vertical", command=canvas.yview)
        frame = ttk.Frame(canvas)

        data = db.execute_with_retry(lambda c: c.execute("SELECT id, student_info, text FROM tickets").fetchall())
        
        canvas.create_window((0,0), window=frame, anchor="nw")
        canvas.configure(yscrollcommand=scroll.set)
        
        cols = 5
        for i, r in enumerate(data):
            tid, s_info, text = r
            is_taken = s_info is not None
            btn_text = f"№{tid}\nЗАНЯТ" if is_taken else f"Билет\n№{tid}"
            color = "#ffcccc" if is_taken else "#ccffcc"
            
            btn = tk.Button(frame, text=btn_text, bg=color, width=12, height=4,
                           command=lambda id=tid, txt=text, taken=is_taken: self.take_secret(db, id, txt, taken, top))
            btn.grid(row=i//cols, column=i%cols, padx=10, pady=10)

        frame.update_idletasks()
        canvas.configure(scrollregion=canvas.bbox("all"))
        canvas.pack(side="left", expand=True, fill="both")
        scroll.pack(side="right", fill="y")

    def take_secret(self, db, tid, text, taken, win):
        if taken: 
            messagebox.showwarning("!", "Этот билет уже занят другим студентом!")
            return
        info = f"{self.ent_fio.get().strip()} ({self.ent_group.get().strip()})"
        res = db.execute_with_retry(lambda c: c.execute("UPDATE tickets SET student_info = ? WHERE id = ? AND student_info IS NULL", (info, tid)).rowcount)
        if res == 1:
            log_message(f"СЕКРЕТНЫЙ ВЫБОР: Билет №{tid} -> {info}")
            win.destroy()
            self.show_ticket(tid, text)
        else: 
            messagebox.showerror("!", "Извините, этот билет только что заняли!")

    def start_request(self):
        fio = self.ent_fio.get().strip()
        grp = self.ent_group.get().strip()
        if not fio or not grp:
            messagebox.showwarning("Внимание", "Пожалуйста, введите ФИО и Группу!")
            return
        
        db_path = self.ent_path.get().strip()
        if not os.path.exists(db_path):
            messagebox.showerror("Ошибка", f"Не удалось найти файл базы данных:\n{db_path}")
            return

        self.btn_get.config(state="disabled")
        self.lbl_status.config(text="Идет поиск свободного билета...")
        threading.Thread(target=self.work, args=(db_path, f"{fio} ({grp})"), daemon=True).start()

    def work(self, path, info):
        db = DatabaseManager(path)
        def attempt(conn):
            rows = conn.execute("SELECT id, text FROM tickets WHERE student_info IS NULL").fetchall()
            if not rows: return "none"
            random.shuffle(rows)
            tid, txt = rows[0]
            if conn.execute("UPDATE tickets SET student_info = ? WHERE id = ? AND student_info IS NULL", (info, tid)).rowcount == 1:
                return (tid, txt)
            return "retry"

        res = db.execute_with_retry(attempt)
        if res == "none":
            self.root.after(0, lambda: messagebox.showinfo("Готово", "Все билеты уже разобраны!"))
            self.root.after(0, lambda: self.btn_get.config(state="normal"))
        elif res == "retry":
            time.sleep(0.5)
            self.work(path, info)
        elif isinstance(res, tuple):
            log_message(f"ВЗЯТИЕ: Билет №{res[0]} -> {info}")
            self.root.after(0, lambda: self.show_ticket(res[0], res[1]))

    def show_ticket(self, num, content):
        for w in self.root.winfo_children(): w.destroy()
        f = ttk.Frame(self.root, padding=20)
        f.pack(expand=True, fill="both")
        tk.Label(f, text=f"БИЛЕТ №{num}", font=("Arial", 22, "bold"), fg="#2E7D32").pack(pady=10)
        
        t_frame = ttk.Frame(f)
        t_frame.pack(expand=True, fill="both")
        
        t = tk.Text(t_frame, font=("Arial", 13), wrap="word", bg="#f9f9f9", padx=10, pady=10)
        t.insert("1.0", content)
        t.config(state="disabled")
        
        sc = ttk.Scrollbar(t_frame, orient="vertical", command=t.yview)
        t.configure(yscrollcommand=sc.set)
        t.pack(side="left", expand=True, fill="both")
        sc.pack(side="right", fill="y")
        
        ttk.Button(f, text="ЗАКОНЧИТЬ И ВЫЙТИ", command=sys.exit).pack(pady=15)

# =============================================================================
# ВХОД
# =============================================================================
class LoginWindow:
    def __init__(self, root):
        self.root = root
        self.root.title("Авторизация преподавателя")
        self.root.geometry("350x250")
        sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
        self.root.geometry(f"350x250+{(sw-350)//2}+{(sh-250)//2}")
        
        f = ttk.Frame(root, padding=25)
        f.pack(expand=True)
        
        ttk.Label(f, text="ЛОГИН:", font=("Arial", 9, "bold")).pack()
        self.l = ttk.Entry(f, font=("Arial", 11)); self.l.pack(pady=5); self.l.insert(0, "Admin")
        
        ttk.Label(f, text="ПАРОЛЬ:", font=("Arial", 9, "bold")).pack()
        self.p = ttk.Entry(f, show="*", font=("Arial", 11)); self.p.pack(pady=5)
        
        ttk.Button(f, text="ВОЙТИ", command=self.check).pack(pady=15, fill="x")

    def check(self):
        if self.l.get() == ADMIN_LOGIN and self.p.get() == ADMIN_PASSWORD:
            self.root.destroy()
            nr = tk.Tk()
            AdminWindow(nr, DatabaseManager(os.path.basename(DEFAULT_DB_PATH)))
            nr.mainloop()
        else: 
            messagebox.showerror("Ошибка", "Неверный логин или пароль!")

if __name__ == "__main__":
    if "--admin" in sys.argv:
        r = tk.Tk(); LoginWindow(r); r.mainloop()
    else:
        r = tk.Tk(); StudentWindow(r); r.mainloop()
