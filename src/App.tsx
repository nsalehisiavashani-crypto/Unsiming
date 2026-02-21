/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Settings, 
  Camera, 
  MoreVertical, 
  Search, 
  ArrowLeft, 
  Send, 
  CheckCheck,
  User,
  Sparkles,
  WifiOff,
  Menu,
  Plus,
  LogOut,
  UserPlus,
  Moon,
  Sun,
  Shield,
  Bell,
  Database,
  HelpCircle,
  Download,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from "@google/genai";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'read';
}

interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  theme?: 'light' | 'dark';
}

// --- Gemini Service ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('unsiming_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(user?.theme || 'dark');

  const [activeTab, setActiveTab] = useState<'chats' | 'settings' | 'contacts'>('chats');
  const [selectedChat, setSelectedChat] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  
  const socketRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Theme Effect ---
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    if (user) {
      fetch('/api/user/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, theme })
      });
    }
  }, [theme, user]);

  // --- Auth Logic ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        setTheme(data.user.theme || 'dark');
        localStorage.setItem('unsiming_user', JSON.stringify(data.user));
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Connection failed. Server might be offline.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('unsiming_user');
    if (socketRef.current) socketRef.current.close();
  };

  // --- WebSocket & Data Logic ---
  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'auth', userId: user.id }));
    };

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'message') {
        setMessages(prev => [...prev, payload]);
      }
    };

    fetchContacts();

    return () => socket.close();
  }, [user]);

  const fetchContacts = async () => {
    if (!user) return;
    const res = await fetch(`/api/contacts/${user.id}`);
    const data = await res.json();
    setContacts(data);
  };

  useEffect(() => {
    if (!user || !selectedChat) return;
    if (selectedChat.id === 'gemini') {
      setMessages([]); 
      return;
    }
    fetch(`/api/messages/${user.id}/${selectedChat.id}`)
      .then(r => r.json())
      .then(setMessages);
  }, [user, selectedChat]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, selectedChat]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedChat || !user) return;

    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      senderId: user.id,
      receiverId: selectedChat.id,
      content: inputText,
      timestamp: Date.now(),
      status: 'sent'
    };

    setMessages(prev => [...prev, newMessage]);
    setInputText('');

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'message', ...newMessage }));
    }

    if (selectedChat.id === 'gemini') {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: inputText,
          config: { systemInstruction: "You are Gemini, an AI integrated into the Unsiming messaging app by Darzi. Keep responses concise and helpful." }
        });

        const geminiMsg: Message = {
          id: Math.random().toString(36).substr(2, 9),
          senderId: 'gemini',
          receiverId: user.id,
          content: response.text || "I'm processing that...",
          timestamp: Date.now(),
          status: 'read'
        };
        setMessages(prev => [...prev, geminiMsg]);
      } catch (error) {
        console.error("Gemini Error:", error);
      }
    }
  };

  const handleAddContact = async () => {
    if (!contactEmail.trim() || !user) return;
    try {
      const res = await fetch('/api/contacts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, contactEmail })
      });
      const data = await res.json();
      if (data.success) {
        setShowAddContact(false);
        setContactEmail('');
        fetchContacts();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to add contact');
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    const res = await fetch(`/api/export/${user.id}`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unsiming_backup_${user.username}.json`;
    a.click();
  };

  if (!user) {
    return (
      <div className="flex flex-col h-screen bg-black text-white items-center justify-center p-6 font-sans">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md space-y-8">
          <div className="text-center">
            <div className="w-20 h-20 bg-violet-600 rounded-3xl mx-auto flex items-center justify-center mb-4 shadow-2xl shadow-violet-500/20">
              <MessageSquare size={40} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Unsiming</h1>
            <p className="text-gray-400 mt-2">by Darzi</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4 bg-zinc-900 p-8 rounded-3xl border border-white/5">
            {authMode === 'register' && (
              <div>
                <label className="text-xs font-bold text-violet-500 uppercase px-1">Username</label>
                <input type="text" required className="w-full bg-black/50 border border-white/10 rounded-xl p-3 mt-1 focus:border-violet-500 outline-none transition-all" placeholder="Choose a username" value={authForm.username} onChange={e => setAuthForm({...authForm, username: e.target.value})} />
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-violet-500 uppercase px-1">Email</label>
              <input type="email" required className="w-full bg-black/50 border border-white/10 rounded-xl p-3 mt-1 focus:border-violet-500 outline-none transition-all" placeholder="Enter your email" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} />
            </div>
            <div>
              <label className="text-xs font-bold text-violet-500 uppercase px-1">Password</label>
              <input type="password" required className="w-full bg-black/50 border border-white/10 rounded-xl p-3 mt-1 focus:border-violet-500 outline-none transition-all" placeholder="••••••••" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-violet-600/20">
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          <div className="text-center">
            <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} className="text-violet-400 font-medium hover:underline">
              {authMode === 'login' ? "Don't have an account? Register" : "Already have an account? Login"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-screen font-sans overflow-hidden transition-colors duration-300", theme === 'dark' ? "bg-black text-white" : "bg-gray-50 text-gray-900")}>
      {/* Status Bar */}
      <div className="h-10 flex items-center justify-between px-6 pt-2 text-xs font-semibold">
        <span>9:41</span>
        <div className="flex items-center gap-1.5">
          {isOffline && <WifiOff size={14} className="text-red-500" />}
          <div className="flex gap-0.5">
            <div className={cn("w-1 h-3 rounded-full", theme === 'dark' ? "bg-white" : "bg-black")}></div>
            <div className={cn("w-1 h-3 rounded-full", theme === 'dark' ? "bg-white" : "bg-black")}></div>
            <div className={cn("w-1 h-3 rounded-full", theme === 'dark' ? "bg-white" : "bg-black")}></div>
            <div className={cn("w-1 h-3 rounded-full opacity-40", theme === 'dark' ? "bg-white" : "bg-black")}></div>
          </div>
          <div className={cn("w-6 h-3 border rounded-sm relative", theme === 'dark' ? "border-white/40" : "border-black/40")}>
            <div className={cn("absolute inset-0.5 rounded-px w-4", theme === 'dark' ? "bg-white" : "bg-black")}></div>
          </div>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {!selectedChat ? (
            <motion.div key="list" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="h-full flex flex-col">
              <div className={cn("px-4 pt-4 pb-2", theme === 'dark' ? "bg-zinc-900" : "bg-white border-b")}>
                <div className="flex items-center justify-between mb-4">
                  <h1 className="text-2xl font-bold text-violet-500">Unsiming</h1>
                  <div className="flex gap-5 text-gray-400">
                    <Camera size={22} />
                    <Search size={22} />
                    <MoreVertical size={22} />
                  </div>
                </div>
                <div className="flex">
                  {['chats', 'contacts', 'settings'].map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab as any)} className={cn("flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-all", activeTab === tab ? "text-violet-500 border-b-4 border-violet-500" : "text-gray-500")}>
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {activeTab === 'chats' && (
                  <div className="divide-y divide-white/5">
                    <button onClick={() => setSelectedChat({ id: 'gemini', username: 'Gemini AI', email: 'ai@google.com' })} className={cn("w-full flex items-center gap-4 px-4 py-4 transition-colors", theme === 'dark' ? "hover:bg-white/5" : "hover:bg-gray-100")}>
                      <div className="relative">
                        <div className="w-14 h-14 rounded-full bg-violet-900/40 flex items-center justify-center border border-violet-500/30">
                          <Sparkles className="text-violet-400" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-violet-600 p-1 rounded-full border-2 border-black">
                          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        </div>
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-lg">Gemini AI</span>
                          <span className="text-xs text-violet-500 font-bold">AI</span>
                        </div>
                        <p className="text-sm text-gray-400 truncate">Ask me anything offline...</p>
                      </div>
                    </button>

                    {contacts.map(u => (
                      <button key={u.id} onClick={() => setSelectedChat(u)} className={cn("w-full flex items-center gap-4 px-4 py-4 transition-colors", theme === 'dark' ? "hover:bg-white/5" : "hover:bg-gray-100")}>
                        <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5">
                          <User className="text-gray-500" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-lg">{u.username}</span>
                            <span className="text-xs text-gray-500">Offline</span>
                          </div>
                          <p className="text-sm text-gray-500 italic">Tap to chat</p>
                        </div>
                      </button>
                    ))}
                    {contacts.length === 0 && (
                      <div className="text-center py-20 text-gray-500">
                        <p>No chats yet. Add contacts to start messaging.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'contacts' && (
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between px-2">
                      <h2 className="text-sm font-bold text-violet-500 uppercase">My Contacts</h2>
                      <button onClick={() => setShowAddContact(true)} className="text-violet-500 flex items-center gap-1 text-sm font-bold">
                        <UserPlus size={18} /> Add
                      </button>
                    </div>
                    {contacts.map(u => (
                      <div key={u.id} className={cn("flex items-center justify-between p-4 rounded-2xl border transition-colors", theme === 'dark' ? "bg-zinc-900 border-white/5" : "bg-white border-gray-200")}>
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-violet-600/20 flex items-center justify-center">
                            <User className="text-violet-400" />
                          </div>
                          <div>
                            <p className="font-bold">{u.username}</p>
                            <p className="text-xs text-gray-500">{u.email}</p>
                          </div>
                        </div>
                        <button onClick={() => setSelectedChat(u)} className="bg-violet-600 p-2 rounded-full hover:bg-violet-700">
                          <MessageSquare size={20} className="text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'settings' && (
                  <div className="p-6 space-y-6">
                    <div className={cn("flex items-center gap-4 p-6 rounded-3xl border", theme === 'dark' ? "bg-zinc-900 border-white/5" : "bg-white border-gray-200 shadow-sm")}>
                      <div className="w-20 h-20 rounded-full bg-violet-600 flex items-center justify-center text-3xl font-bold text-white">
                        {user.username[0].toUpperCase()}
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold">{user.username}</h2>
                        <p className="text-sm text-gray-400">{user.email}</p>
                      </div>
                    </div>
                    
                    <div className={cn("rounded-3xl overflow-hidden border", theme === 'dark' ? "bg-zinc-900 border-white/5" : "bg-white border-gray-200")}>
                      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-full flex items-center justify-between p-5 hover:bg-white/5 border-b border-white/5">
                        <div className="flex items-center gap-4">
                          {theme === 'dark' ? <Moon size={20} className="text-violet-500" /> : <Sun size={20} className="text-violet-500" />}
                          <span className="font-medium">Theme: {theme === 'dark' ? 'Dark' : 'Light'}</span>
                        </div>
                      </button>
                      <button className="w-full flex items-center gap-4 p-5 hover:bg-white/5 border-b border-white/5">
                        <Shield size={20} className="text-violet-500" />
                        <span className="font-medium">Privacy & Security</span>
                      </button>
                      <button className="w-full flex items-center gap-4 p-5 hover:bg-white/5 border-b border-white/5">
                        <Bell size={20} className="text-violet-500" />
                        <span className="font-medium">Notifications</span>
                      </button>
                      <button onClick={handleExportData} className="w-full flex items-center gap-4 p-5 hover:bg-white/5 border-b border-white/5">
                        <Download size={20} className="text-violet-500" />
                        <span className="font-medium">Backup Data (JSON)</span>
                      </button>
                      <button className="w-full flex items-center gap-4 p-5 hover:bg-white/5 border-b border-white/5">
                        <HelpCircle size={20} className="text-violet-500" />
                        <span className="font-medium">Help & Support</span>
                      </button>
                      <button onClick={handleLogout} className="w-full flex items-center gap-4 p-5 hover:bg-red-500/10 text-red-500">
                        <LogOut size={20} />
                        <span className="font-medium">Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className={cn("h-full flex flex-col", theme === 'dark' ? "bg-[#050505]" : "bg-gray-100")}>
              <div className={cn("px-2 py-2 flex items-center gap-2 backdrop-blur-xl border-b", theme === 'dark' ? "bg-zinc-900/90 border-white/5" : "bg-white/90 border-gray-200")}>
                <button onClick={() => setSelectedChat(null)} className="p-2 text-violet-500"><ArrowLeft size={24} /></button>
                <div className="w-10 h-10 rounded-full bg-violet-900/30 flex items-center justify-center border border-white/10">
                  <User className="text-violet-400" size={20} />
                </div>
                <div className="flex-1 ml-1">
                  <h2 className="font-bold leading-tight">{selectedChat.username}</h2>
                  <p className="text-[10px] text-violet-400 uppercase tracking-widest font-bold">{selectedChat.id === 'gemini' ? 'Gemini AI' : 'Offline Mode'}</p>
                </div>
                <div className="flex gap-4 px-2 text-gray-400">
                  <MoreVertical size={20} />
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] bg-fixed">
                {messages.map((msg) => (
                  <div key={msg.id} className={cn("flex w-full", msg.senderId === user.id ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] px-3 py-2 rounded-2xl relative shadow-lg", msg.senderId === user.id ? "bg-violet-600 text-white rounded-tr-none" : theme === 'dark' ? "bg-zinc-800 text-gray-100 rounded-tl-none" : "bg-white text-gray-900 rounded-tl-none")}>
                      <p className="text-[15px] leading-relaxed">{msg.content}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] opacity-60">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.senderId === user.id && <CheckCheck size={12} className="text-blue-300" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className={cn("p-3 border-t flex items-end gap-2", theme === 'dark' ? "bg-black border-white/10" : "bg-white border-gray-200")}>
                <div className={cn("flex-1 rounded-3xl px-4 py-2.5 flex items-center gap-3 border", theme === 'dark' ? "bg-zinc-900 border-white/5" : "bg-gray-100 border-gray-200")}>
                  <button className="text-gray-500"><Menu size={20} /></button>
                  <textarea rows={1} value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Message" className="flex-1 bg-transparent border-none focus:ring-0 text-[15px] resize-none max-h-32 py-0.5 outline-none" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} />
                  <button className="text-gray-500"><Camera size={20} /></button>
                </div>
                <button onClick={handleSendMessage} disabled={!inputText.trim()} className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-all", inputText.trim() ? "bg-violet-600 scale-100" : "bg-zinc-800 scale-90 opacity-50")}>
                  <Send size={20} className="text-white ml-0.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {showAddContact && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className={cn("w-full max-w-sm p-6 rounded-3xl shadow-2xl", theme === 'dark' ? "bg-zinc-900" : "bg-white")}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Add Contact</h3>
                <button onClick={() => setShowAddContact(false)} className="text-gray-500"><X size={24} /></button>
              </div>
              <p className="text-sm text-gray-400 mb-4">Enter the Gmail/Email address of the person you want to add.</p>
              <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={cn("w-full p-4 rounded-xl mb-4 outline-none border focus:border-violet-500 transition-all", theme === 'dark' ? "bg-black border-white/10" : "bg-gray-100 border-gray-200")} placeholder="user@gmail.com" />
              <button onClick={handleAddContact} className="w-full bg-violet-600 text-white font-bold py-4 rounded-xl hover:bg-violet-700 transition-all">Add Contact</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className={cn("h-8 flex justify-center items-center", theme === 'dark' ? "bg-black" : "bg-white")}>
        <div className={cn("w-32 h-1.5 rounded-full", theme === 'dark' ? "bg-white/20" : "bg-black/10")}></div>
      </div>
    </div>
  );
}
