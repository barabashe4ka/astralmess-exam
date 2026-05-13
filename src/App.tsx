/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  User, 
  Ticket as TicketIcon, 
  LogOut, 
  Download, 
  RefreshCw, 
  Upload, 
  AlertCircle,
  CheckCircle2,
  Lock,
  ChevronRight,
  ClipboardList,
  FileText,
  UserPlus,
  Trash2,
  Sparkles
} from 'lucide-react';
import { Ticket, AppMode, Assignment } from './types';
import { cn } from './lib/utils';
import ReactMarkdown from 'react-markdown';

export default function App() {
  const [mode, setMode] = useState<AppMode>('choice');
  const [studentInfo, setStudentInfo] = useState({ name: '', group: '' });
  const [myTicketId, setMyTicketId] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    const savedMode = localStorage.getItem('astralmess_mode') as AppMode;
    const savedInfo = localStorage.getItem('astralmess_student_info');
    const savedTicket = localStorage.getItem('astralmess_my_ticket');

    if (savedMode) setMode(savedMode);
    if (savedInfo) setStudentInfo(JSON.parse(savedInfo));
    if (savedTicket) setMyTicketId(savedTicket);
  }, []);

  // Save session on changes
  useEffect(() => {
    if (mode !== 'choice') {
      localStorage.setItem('astralmess_mode', mode);
      localStorage.setItem('astralmess_student_info', JSON.stringify(studentInfo));
      if (myTicketId) localStorage.setItem('astralmess_my_ticket', myTicketId);
    }
  }, [mode, studentInfo, myTicketId]);

  const handleLogout = () => {
    localStorage.removeItem('astralmess_mode');
    localStorage.removeItem('astralmess_student_info');
    localStorage.removeItem('astralmess_my_ticket');
    setStudentInfo({ name: '', group: '' });
    setMyTicketId(null);
    setMode('choice');
  };
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Click counters
  const headerClicksRef = useRef(0);
  const headerTimerRef = useRef<any>(null);
  const [secretMode, setSecretMode] = useState(false);

  const adminClicksRef = useRef(0);
  const adminTimerRef = useRef<any>(null);
  const [adminSecretMode, setAdminSecretMode] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error('Failed to fetch data');
      const data = await res.json();
      setAllTickets(data.tickets || []);
      setAssignments(data.assignments || []);
    } catch (err: any) {
      console.error(err);
      setError("Ошибка соединения с сервером");
    }
  };

  // Polling for updates
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const myTicket = myTicketId ? allTickets.find(t => t.id === myTicketId) : null;

  const handleHeaderClick = () => {
    if (headerTimerRef.current) clearTimeout(headerTimerRef.current);
    headerClicksRef.current += 1;
    
    if (headerClicksRef.current >= 5) {
      headerClicksRef.current = 0;
      const code = window.prompt("ошибка, введите код ошибки");
      if (code === '777') setSecretMode(s => !s);
    } else {
      headerTimerRef.current = setTimeout(() => {
        headerClicksRef.current = 0;
      }, 2000);
    }
  };

  const handleAdminHeaderClick = () => {
    if (adminTimerRef.current) clearTimeout(adminTimerRef.current);
    adminClicksRef.current += 1;
    
    if (adminClicksRef.current >= 5) {
      adminClicksRef.current = 0;
      const code = window.prompt("ошибка администратора, введите код");
      if (code === '777') setAdminSecretMode(s => !s);
    } else {
      adminTimerRef.current = setTimeout(() => {
        adminClicksRef.current = 0;
      }, 2000);
    }
  };

  const getTicketAutomatically = async () => {
    setLoading(true);
    setError(null);
    try {
      const studentNameClean = studentInfo.name.trim().toLowerCase();
      const assignment = assignments.find(a => a.studentName.trim().toLowerCase() === studentNameClean);
      
      // All tickets that are reserved for someone
      const reservedTicketIds = assignments.map(a => a.ticketId);

      let ticketToTake: Ticket | undefined;

      if (assignment) {
        // Student has a specific assignment
        ticketToTake = allTickets.find(t => t.id === assignment.ticketId && t.status === 'free');
        if (!ticketToTake) {
          throw new Error(`Ваш персональный билет №${assignment.ticketId} недоступен (уже выдан или не найден).`);
        }
      } else {
        // Student has NO assignment - pick random from pool excluding ALL reservations
        const availableTickets = allTickets.filter(t => 
          t.status === 'free' && !reservedTicketIds.includes(t.id)
        );

        if (availableTickets.length === 0) {
          throw new Error("Нет доступных билетов! Все свободные билеты забронированы другими студентами.");
        }

        ticketToTake = availableTickets[Math.floor(Math.random() * availableTickets.length)];
      }

      await takeTicket(ticketToTake);
    } catch (err: any) {
      setError(err.message || "Ошибка при получении билета");
    } finally {
      setLoading(false);
    }
  };

  const takeTicket = async (ticket: Ticket) => {
    try {
      const res = await fetch('/api/tickets/take', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: ticket.id,
          studentName: studentInfo.name,
          studentGroup: studentInfo.group
        })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Ошибка при записи");
      }

      setMyTicketId(ticket.id);
      setMode('student-view');
      setSecretMode(false);
    } catch (err: any) {
      throw err;
    }
  };

  const resetAllTickets = async () => {
    if (!window.confirm("Вы уверены?")) return;
    setLoading(true);
    try {
      await fetch('/api/tickets/reset', { method: 'POST' });
      await fetchData();
    } catch (err) {
      alert("Ошибка сброса");
    } finally {
      setLoading(false);
    }
  };

  const uploadTicketsFromText = async (text: string) => {
    setLoading(true);
    try {
      const chunks = text.split(/\n\s*\n/).map(t => t.trim()).filter(t => t.length > 0);
      const tickets = chunks.map((content, i) => ({
        id: (i + 1).toString().padStart(3, '0'),
        text: content,
        status: 'free',
        studentName: null,
        studentGroup: null,
        takenAt: null
      }));

      const res = await fetch('/api/tickets/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickets })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Неизвестная ошибка сервера' }));
        throw new Error(errData.error || `Сервер ответил с кодом ${res.status}`);
      }
      
      await fetchData();
      alert(`Успешно загружено ${tickets.length} билетов`);
    } catch (err: any) {
      alert("Ошибка загрузки: " + (err.message || "Неизвестная проблема"));
      console.error('Upload failed details:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ["ID", "Статус", "Студент", "Группа", "Текст"];
    const rows = allTickets.map(t => [
      t.id,
      t.status === 'taken' ? 'Выдан' : 'Свободен',
      `"${(t.studentName || '-').replace(/"/g, '""')}"`,
      `"${(t.studentGroup || '-').replace(/"/g, '""')}"`,
      `"${t.text.replace(/\n/g, ' ').replace(/"/g, '""')}"`
    ]);
    const csvContent = "\ufeff" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "exam_results.csv";
    link.click();
  };

  const addAssignment = async (a: { name: string, ticketId: string }) => {
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Сервер отклонил запрос' }));
        throw new Error(errData.error);
      }
      await fetchData();
    } catch (err: any) { alert("Ошибка бронирования: " + err.message); }
  };

  const deleteAssignment = async (id: string) => {
    try {
      const res = await fetch(`/api/assignments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Не удалось удалить");
      await fetchData();
    } catch (err: any) { alert("Ошибка: " + err.message); }
  };

  // --- UI Views --- (Reusing the same UI structure)
  if (mode === 'choice') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white relative overflow-hidden">
        {/* Decorative background tokens */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-4xl w-full grid gap-8 z-10">
          <div className="text-center space-y-4 mb-8">
            <div className="bg-blue-600 text-white w-14 h-14 flex items-center justify-center rounded-2xl shadow-2xl shadow-blue-500/20 mx-auto mb-8 cursor-pointer active:scale-90 transition-all border border-blue-400/20" onClick={handleHeaderClick}>
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] uppercase italic">
              ASTRALMESS <br />
              <span className="text-blue-600">EXAM SYSTEM</span>
            </h1>
            <p className="text-xl text-slate-500 max-w-xl mx-auto font-medium">
              Автоматизированная система управления и выдачи экзаменационных билетов. <br />
              <span className="text-slate-700 text-sm font-mono mt-4 block">Build v3.2 // Self-Hosted Edition</span>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button onClick={() => setMode('student-login')} className="group p-10 rounded-[2.5rem] border border-white/10 bg-white/5 text-left transition-all hover:scale-[1.02] active:scale-100 hover:bg-white/10 shadow-2xl">
              <div className="mb-6 opacity-70 group-hover:opacity-100 transition-opacity text-blue-500">
                <User size={40} />
              </div>
              <h3 className="text-3xl font-black mb-3 uppercase italic tracking-tighter text-white">Я Студент</h3>
              <p className="opacity-50 text-sm leading-relaxed font-medium">Идентификация по ФИО и группе для получения билета.</p>
              <div className="mt-10 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest text-slate-400">
                Войти в систему <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            <button onClick={() => setMode('admin-login')} className="group p-10 rounded-[2.5rem] border border-blue-500/20 bg-blue-600 text-left transition-all hover:scale-[1.02] active:scale-100 hover:bg-blue-500 shadow-2xl shadow-blue-600/20">
              <div className="mb-6 opacity-70 group-hover:opacity-100 transition-opacity text-white">
                <Lock size={40} />
              </div>
              <h3 className="text-3xl font-black mb-3 uppercase italic tracking-tighter text-white">Преподаватель</h3>
              <p className="text-white/60 text-sm leading-relaxed font-medium">Панель мониторинга, загрузка базы и управление пулом.</p>
              <div className="mt-10 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest text-blue-100">
                Админ-панель <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (mode === 'student-login') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full z-10">
          <div className="bg-slate-900 p-12 rounded-[3.5rem] border border-white/5 shadow-2xl space-y-10">
            <div className="space-y-2 text-center">
              <div className="bg-white/5 w-16 h-16 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 shadow-xl">
                <User className="text-blue-500" size={32} />
              </div>
              <h2 className="text-4xl font-black tracking-tighter uppercase italic">Регистрация</h2>
              <p className="text-slate-500 text-sm font-medium">Введите ваши учетные данные</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-600 px-1">ФИО полностью</label>
                <input 
                  value={studentInfo.name} 
                  onChange={e => setStudentInfo({ ...studentInfo, name: e.target.value })} 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 focus:bg-white/10 focus:border-blue-600/50 outline-none transition-all font-bold placeholder:text-slate-800" 
                  placeholder="Иванов Иван Иванович" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-600 px-1">Академическая группа</label>
                <input 
                  value={studentInfo.group} 
                  onChange={e => setStudentInfo({ ...studentInfo, group: e.target.value })} 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 focus:bg-white/10 focus:border-blue-600/50 outline-none transition-all font-bold placeholder:text-slate-800" 
                  placeholder="ПИ-101" 
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 pt-4">
              <button 
                disabled={!studentInfo.name || !studentInfo.group} 
                onClick={() => setMode('student-view')} 
                className="w-full bg-blue-600 text-white font-black py-6 rounded-2xl hover:bg-blue-500 disabled:opacity-30 transition-all shadow-xl shadow-blue-600/20 active:scale-95 text-lg"
              >
                ВОЙТИ В СИСТЕМУ
              </button>
              <button onClick={handleLogout} className="text-slate-600 text-[10px] font-black uppercase tracking-[0.3em] hover:text-slate-400 transition-colors py-2">
                Вернуться назад
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (mode === 'admin-login') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <form onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); if (d.get('l') === 'Admin' && d.get('p') === 'Exam2024!') setMode('admin-panel'); else alert("Error"); }} className="max-w-sm w-full space-y-4">
          <input name="l" placeholder="Логин" className="w-full p-4 bg-slate-800 text-white rounded-2xl border-2 border-slate-700" />
          <input name="p" type="password" placeholder="Пароль" className="w-full p-4 bg-slate-800 text-white rounded-2xl border-2 border-slate-700" />
          <button className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black">Войти</button>
        </form>
      </div>
    );
  }

  if (mode === 'admin-panel') {
    return <AdminPanel tickets={allTickets} assignments={assignments} onReset={resetAllTickets} onExport={exportToCSV} onUpload={uploadTicketsFromText} onLogout={handleLogout} onAddAssignment={addAssignment} onDeleteAssignment={deleteAssignment} adminSecretMode={adminSecretMode} onAdminHeaderClick={handleAdminHeaderClick} loading={loading} />;
  }

  if (mode === 'student-view') {
    const myTicket = allTickets.find(t => t.id === myTicketId);

    return (
      <div className="min-h-screen bg-slate-950 text-white selection:bg-blue-600/30">
        <header className="px-10 py-8 flex justify-between items-center transition-all bg-slate-950/50 backdrop-blur-md sticky top-0 z-50 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-xl"><TicketIcon size={20} /></div>
            <div>
              <h2 className="font-black tracking-tighter uppercase italic text-lg leading-tight">ASTRALMESS</h2>
              <div className="flex gap-2 items-center">
                <span className="text-[10px] font-black uppercase text-blue-500">SESSION_ACTIVE</span>
                <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
              </div>
            </div>
          </div>
          <div className="text-right hidden md:block cursor-pointer select-none active:opacity-70 transition-opacity" onClick={handleHeaderClick}>
            <p className="text-sm font-black tracking-tight">{studentInfo.name}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{studentInfo.group}</p>
          </div>
          <button onClick={handleLogout} className="p-4 bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 rounded-2xl transition-all text-white/20">
            <LogOut size={20} />
          </button>
        </header>

        <main className="max-w-4xl mx-auto p-10 md:p-20">
          <AnimatePresence mode="wait">
            {!myTicket ? (
              <motion.div key="get-ticket" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-12 text-center relative">
                <div className="space-y-4">
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-3 text-blue-400 bg-blue-400/10 px-6 py-2.5 rounded-full font-black text-[10px] uppercase tracking-[0.2em] border border-blue-400/20 mx-auto">
                    <ClipboardList size={14} /> ТЕКУЩАЯ ГРУППА: {studentInfo.group}
                  </motion.div>
                  
                  <h2 className="text-5xl md:text-7xl font-black leading-[0.9] tracking-tighter uppercase italic">
                    ПРИВЕТ, <br />
                    <span className="text-blue-600">{studentInfo.name.split(' ')[0]}</span>
                  </h2>
                  
                  <p className="text-slate-500 text-lg font-medium leading-relaxed max-w-lg mx-auto">
                    Ваша сессия готова. Нажмите на кнопку ниже, чтобы система выбрала ваш экзаменационный билет. Выбор происходит автоматически.
                  </p>
                </div>

                <div className="space-y-8 w-full max-w-md mx-auto">
                  <button 
                    disabled={loading} 
                    onClick={getTicketAutomatically} 
                    className="group relative w-full h-32 bg-blue-600 rounded-[2.5rem] shadow-2xl shadow-blue-600/40 hover:bg-blue-500 hover:scale-[1.02] transition-all flex items-center justify-center active:scale-95 overflow-hidden disabled:opacity-50"
                  >
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none" />
                    {loading ? (
                      <RefreshCw className="animate-spin text-white" size={40} />
                    ) : (
                      <div className="flex items-center gap-4">
                        <span className="text-3xl font-black italic tracking-tighter uppercase">ПОЛУЧИТЬ БИЛЕТ</span>
                        <ChevronRight size={32} className="group-hover:translate-x-2 transition-transform" />
                      </div>
                    )}
                  </button>
                  
                  {error && (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-[2rem] text-rose-400 text-sm font-bold flex items-center gap-4 justify-center">
                      <AlertCircle size={24} className="flex-shrink-0" />
                      <p className="text-left leading-tight italic">{error}</p>
                    </motion.div>
                  )}
                </div>

                {secretMode && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-20 border-t border-white/5">
                     <div className="flex items-center justify-center gap-3 mb-8 opacity-20">
                        <Sparkles size={16} />
                        <span className="text-[10px] font-black uppercase tracking-[0.5em]">SYSTEM_DEBUG_RESERVE</span>
                        <Sparkles size={16} />
                     </div>
                     <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-3">
                        {allTickets.map(t => {
                          const studentNameClean = studentInfo.name.trim().toLowerCase();
                          const reservedForOther = assignments.some(a => a.studentName.trim().toLowerCase() !== studentNameClean && a.ticketId === t.id);
                          const isTaken = t.status === 'taken';

                          return (
                            <button 
                              key={t.id} 
                              disabled={isTaken || reservedForOther} 
                              onClick={() => takeTicket(t)} 
                              className={cn(
                                "p-4 border-2 rounded-2xl font-mono text-xs font-black transition-all", 
                                isTaken ? "bg-white/5 text-white/5 border-transparent pointer-events-none" : 
                                reservedForOther ? "bg-rose-500/5 text-rose-500/10 border-transparent cursor-not-allowed opacity-20" :
                                "bg-white/5 text-blue-500 border-white/5 hover:border-blue-600 hover:bg-blue-600/10 active:scale-90"
                              )}
                            >
                              {t.id}
                            </button>
                          );
                        })}
                     </div>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div key="ticket-result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-12 max-w-3xl mx-auto">
                <div className="bg-slate-900 p-12 md:p-20 rounded-[4rem] border border-white/10 shadow-2xl space-y-12 relative overflow-hidden text-left">
                  <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
                    <CheckCircle2 size={240} className="text-white" />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3 text-emerald-400 font-black uppercase tracking-[0.2em] text-[10px]">
                      <ShieldCheck size={20} />
                      <span>Билет успешно сформирован</span>
                    </div>
                    <h2 className="text-6xl md:text-8xl font-black tracking-tighter uppercase italic leading-none">БИЛЕТ<br /><span className="text-blue-600">#{myTicket.id}</span></h2>
                  </div>

                  <div className="bg-white/5 p-12 md:p-16 rounded-[3rem] border border-white/5 min-h-[350px] shadow-inner relative group">
                    <div className="absolute top-6 left-12 text-slate-700 text-[10px] uppercase font-black tracking-[0.5em] font-mono">Exam_Question_Source</div>
                    <div className="mt-10 text-2xl md:text-4xl font-medium leading-tight text-slate-100 whitespace-pre-wrap italic">
                      {myTicket.text}
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row justify-between items-center bg-black/40 rounded-[2.5rem] p-8 gap-6 border border-white/5">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-white/5 rounded-[1.5rem] flex items-center justify-center text-blue-500 shadow-xl">
                        <User size={32} />
                      </div>
                      <div className="text-left leading-none">
                        <p className="text-[10px] uppercase opacity-30 font-black tracking-widest mb-2 italic">Session_Identity</p>
                        <p className="font-black text-2xl tracking-tighter uppercase italic">{studentInfo.name}</p>
                        <p className="text-[10px] text-blue-600 font-bold uppercase mt-2 tracking-widest">{studentInfo.group} // Verified</p>
                      </div>
                    </div>
                    <button onClick={handleLogout} className="bg-white text-slate-950 px-12 py-6 rounded-2xl transition-all font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 shadow-2xl hover:bg-white/90">
                      ВЫХОД
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <footer className="p-12 text-center opacity-20">
          <p className="text-[10px] font-black uppercase tracking-[1em]">Astralmess Engine v3.2</p>
        </footer>
      </div>
    );
  }

  return null;
}

function AdminPanel({ tickets, assignments, onReset, onExport, onUpload, onLogout, onAddAssignment, onDeleteAssignment, adminSecretMode, onAdminHeaderClick, loading }: any) {
  const [tab, setTab] = useState('monitor');
  const [text, setText] = useState('');
  const [newA, setNewA] = useState({ name: '', ticketId: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setText(content);
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans">
      <nav className="px-10 py-6 border-b border-white/5 flex justify-between items-center sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 cursor-pointer" onClick={onAdminHeaderClick}>
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/20">
            <ShieldCheck size={20} className="text-white" />
          </div>
          <h1 className="font-black text-xl tracking-tighter uppercase italic">ASTRALMESS <span className="opacity-30">/ ADMIN</span></h1>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
            <button onClick={() => setTab('monitor')} className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", tab === 'monitor' ? "bg-white text-slate-950 shadow-xl" : "text-white/40 hover:text-white/60")}>Монитор</button>
            <button onClick={() => setTab('upload')} className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", tab === 'upload' ? "bg-white text-slate-950 shadow-xl" : "text-white/40 hover:text-white/60")}>Загрузка</button>
          </div>
          <button onClick={onLogout} className="p-3 bg-white/5 hover:bg-rose-500/10 hover:text-rose-400 rounded-xl transition-all text-white/20"><LogOut size={20} /></button>
        </div>
      </nav>

      <main className="p-10 md:p-16 max-w-7xl mx-auto w-full space-y-12">
        {tab === 'monitor' ? (
          <>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
              <div className="space-y-2">
                <h2 className="text-4xl font-black tracking-tight">Статистика потока</h2>
                <p className="text-slate-500 font-medium italic">Обновление данных каждые 3 секунды</p>
              </div>
              <div className="flex gap-4">
                <button onClick={onExport} className="px-8 py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2 underline underline-offset-4">
                  <Download size={16} /> Экспорт результатов
                </button>
                <button onClick={onReset} className="px-8 py-4 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all">
                  Сбросить всё
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-slate-900 to-slate-900/50 p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
                <div className="text-4xl font-black mb-1">{tickets.length}</div>
                <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Всего билетов</div>
              </div>
              <div className="bg-gradient-to-br from-blue-900/20 to-blue-950/20 p-8 rounded-[2.5rem] border border-blue-500/10 shadow-2xl">
                <div className="text-4xl font-black text-blue-400 mb-1">{tickets.filter((t:any) => t.status==='taken').length}</div>
                <div className="text-[10px] text-blue-500 font-black uppercase tracking-[0.2em]">Успешно выдано</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-900/20 to-emerald-950/20 p-8 rounded-[2.5rem] border border-emerald-500/10 shadow-2xl">
                <div className="text-4xl font-black text-emerald-400 mb-1">{tickets.filter((t:any) => t.status==='free').length}</div>
                <div className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.2em]">Осталось в пуле</div>
              </div>
            </div>

            {adminSecretMode && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-10 bg-blue-600 rounded-[3rem] shadow-2xl shadow-blue-500/20 space-y-8">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-xl"><Sparkles size={20} /></div>
                  <h3 className="font-black uppercase tracking-widest text-sm">Секретная бронь билетов</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input placeholder="Фамилия студента" value={newA.name} onChange={e=>setNewA({...newA, name: e.target.value})} className="bg-white/10 border border-white/20 p-5 rounded-2xl font-bold placeholder:text-white/30 focus:bg-white/20 outline-none transition-all" />
                  <input placeholder="№ билета (напр. 001)" value={newA.ticketId} onChange={e=>setNewA({...newA, ticketId: e.target.value})} className="bg-white/10 border border-white/20 p-5 rounded-2xl font-mono font-bold placeholder:text-white/30 focus:bg-white/20 outline-none transition-all" />
                  <button onClick={() => { onAddAssignment(newA); setNewA({name:'', ticketId:''}); }} className="bg-white text-blue-600 py-5 rounded-2xl font-black hover:scale-[1.02] active:scale-95 transition-all shadow-xl">
                    ЗАБРОНИРОВАТЬ
                  </button>
                </div>

                {assignments.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {assignments.map((a:any) => (
                      <div key={a.id} className="bg-black/10 p-4 rounded-xl flex justify-between items-center group border border-white/5">
                        <div className="flex flex-col">
                          <span className="text-[10px] opacity-50 font-bold uppercase select-none">Бронь для:</span>
                          <span className="text-sm font-black">{a.studentName} → <span className="text-blue-200">#{a.ticketId}</span></span>
                        </div>
                        <button onClick={()=>onDeleteAssignment(a.id)} className="p-2 hover:bg-rose-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            <div className="bg-white/5 border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl">
               <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="bg-white/5 border-b border-white/5">
                      <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Билет</th>
                      <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Текст вопроса</th>
                      <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Студент / Группа</th>
                      <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-right">Статус</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5">
                    {tickets.map((t:any) => (
                      <tr key={t.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-8 py-6 font-mono font-black text-xl text-blue-400">#{t.id}</td>
                        <td className="px-8 py-6 max-w-sm"><div className="truncate text-slate-400 font-medium italic group-hover:text-slate-200 transition-colors">{t.text}</div></td>
                        <td className="px-8 py-6 font-bold">
                          {t.studentName ? (
                            <div className="flex flex-col">
                              <span className="text-sm">{t.studentName}</span>
                              <span className="text-[10px] text-blue-500 uppercase">{t.studentGroup}</span>
                            </div>
                          ) : (
                            <span className="opacity-10">—</span>
                          )}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <span className={cn("px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2", t.status === 'taken' ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20")}>
                            {t.status === 'taken' ? <><span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"/> ВЫДАН</> : <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/> СВОБОДЕН</>}
                          </span>
                        </td>
                      </tr>
                    ))}
                 </tbody>
               </table>
            </div>
          </>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-12">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl shadow-blue-600/20">
                <Upload size={32} />
              </div>
              <h2 className="text-5xl font-black tracking-tighter uppercase italic">Загрузка базы</h2>
              <p className="text-slate-500 text-lg max-w-xl mx-auto font-medium">Вставьте текст всех билетов ниже или выберите файл <span className="text-blue-500">.txt</span></p>
            </div>

            <div className="space-y-6">
              <div className="flex justify-center gap-4">
                <button onClick={() => fileInputRef.current?.click()} className="px-8 py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-3">
                  <FileText size={18} /> ВЫБРАТЬ .TXT ФАЙЛ
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".txt" className="hidden" />
              </div>

              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[3rem] blur opacity-10 group-hover:opacity-20 transition-all duration-1000"></div>
                <textarea 
                  value={text} 
                  onChange={e=>setText(e.target.value)} 
                  placeholder={`Билет 1...\n\nБилет 2...\n\nБилет 3...`} 
                  className="relative w-full h-[500px] bg-slate-900 border-2 border-white/5 rounded-[3rem] p-12 font-medium text-lg leading-relaxed outline-none focus:border-blue-600/50 transition-all shadow-2xl resize-none" 
                />
              </div>

              <button 
                onClick={() => onUpload(text)} 
                disabled={loading || !text.trim()} 
                className="w-full py-8 bg-blue-600 rounded-[2rem] font-black text-xl shadow-2xl shadow-blue-600/30 hover:bg-blue-500 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-4"
              >
                {loading ? <RefreshCw className="animate-spin" /> : <><Upload /> ОБНОВИТЬ ВСЮ БАЗУ</>}
              </button>
            </div>

            <div className="p-10 bg-slate-900 border border-white/5 rounded-[3rem] flex flex-col md:flex-row gap-10 items-center">
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3 text-blue-400">
                  <AlertCircle size={20} />
                  <h4 className="font-black uppercase tracking-widest text-xs">Важное примечание</h4>
                </div>
                <p className="text-slate-400 font-medium leading-relaxed">
                  Система разделяет билеты по <span className="text-white">пустым строкам</span>. Убедитесь, что между текстом разных билетов есть хотя бы один перенос строки. При обновлении все текущие статусы выдачи будут удалены.
                </p>
              </div>
              <div className="w-1.5 h-12 bg-white/5 rounded-full hidden md:block" />
              <div className="flex-shrink-0 text-center md:text-left">
                <div className="text-3xl font-black text-white">{text.split(/\n\s*\n/).filter(t=>t.trim()).length}</div>
                <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Обнаружено билетов</div>
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
