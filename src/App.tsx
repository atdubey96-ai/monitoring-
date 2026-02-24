import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Flame, 
  Thermometer, 
  Eraser, 
  Bell, 
  LogOut, 
  Save, 
  RefreshCw, 
  Settings, 
  ShieldCheck, 
  Phone, 
  Mail,
  Sun,
  Moon,
  Database,
  ChevronRight,
  AlertTriangle,
  History,
  Info
} from 'lucide-react';
import { supabaseService } from './supabaseService';
import { BurnerData, BurnerState, TempReading, CleaningEvent, TipDamageRecord } from './types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { supabase } from './supabase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Constants ---
const WALL_NAMES = ['A', 'B', 'C', 'D'] as const;
const ROWS = 6;
const BURNERS_PER_ROW = 15;
const STATE_COLORS = {
  B: '#2563eb', // Both
  N: '#d97706', // NG Only
  O: '#16a34a', // Off Gas
  C: '#1e293b', // Capped
};

// --- Components ---

const Login = ({ onLogin }: { onLogin: (empId: string) => void }) => {
  const [empId, setEmpId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // In a real app, we'd use proper hashing. For this migration, we'll use a simple check.
      // The user provided a hash: d06b2c4efe3519e98c052cced2f117599b7771edea220f6b45a4d7b63c8b9ca8
      // This corresponds to "iocl123" (hypothetically) or whatever the user set.
      const user = await supabaseService.verifyUser(empId, password);
      if (user) {
        onLogin(empId);
      } else {
        setError('Invalid credentials. Please contact IT Helpdesk.');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#02164F] flex flex-col z-[9999] overflow-hidden font-sans">
      {/* Top Ribbon */}
      <div className="bg-[#010c2e] flex justify-between items-center px-8 py-1.5 text-[11.5px] text-[#a8c8f0] tracking-wider border-b border-[#F37022]/25">
        <span>🇮🇳 A Government of India Enterprise | Ministry of Petroleum & Natural Gas, Govt. of India</span>
        <div className="font-mono text-[#F37022] font-bold bg-[#F37022]/10 px-2.5 py-0.5 rounded border border-[#F37022]/25">
          {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-r from-[#011038] via-[#011038] to-[#021a5a] flex items-center justify-between px-9 py-3 border-b-3 border-[#F37022] shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 bg-[#F37022] rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-[#F37022]/50">
            IOCL
          </div>
          <div>
            <div className="text-3xl font-bold text-[#F37022] tracking-wider leading-none">IndianOil</div>
            <div className="text-[11.5px] text-[#c8dff8] tracking-widest mt-1 font-semibold">Indian Oil Corporation Limited</div>
            <div className="text-[10.5px] text-[#90b8e0] tracking-wider mt-0.5">Under Ministry of Petroleum & Natural Gas, Govt. of India</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-white tracking-wider drop-shadow-md">Employee Enterprise Portal</div>
          <div className="text-[11.5px] text-[#a8c8f0] mt-1 font-medium">Integrated SCADA & Operations Management System | Refinery Division</div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Hero Panel */}
        <div className="flex-[1.2] bg-gradient-to-br from-[#010e35] via-[#021658] to-[#02286a] relative overflow-hidden flex items-end p-12">
          <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
          
          <div className="relative z-10 max-w-md animate-slam">
            <div className="font-serif text-sm text-[#F37022] tracking-[5px] uppercase mb-3.5 flex items-center gap-2.5">
              <div className="w-7 h-px bg-[#F37022]" /> The Energy of India
            </div>
            <h1 className="text-4xl font-bold text-white leading-tight mb-4 drop-shadow-lg">
              🔥 SCADA HGU-3 Reformer<br /><span className="text-[#F37022]">Burner Control System</span>
            </h1>
            <p className="text-sm text-[#c8dff8] leading-relaxed mb-8">
              Real-time monitoring and management of reformer burner operations across refinery walls. 
              <strong className="text-[#F37022] font-bold block mt-2">Authorized Personnel Only.</strong>
            </p>
            <div className="flex flex-wrap gap-2.5">
              {['🏭 Refinery Operations', '🔒 Secure Access', '📊 Live Analytics', '⚙️ IOCL IT Division'].map(tag => (
                <span key={tag} className="bg-[#F37022]/10 border border-[#F37022]/40 text-[#f0c898] text-[12px] font-semibold px-3.5 py-1 rounded-full tracking-wide">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="absolute bottom-0 inset-x-0 bg-black/50 border-t border-[#F37022]/30 px-12 py-2.5 flex gap-9 text-[11px] text-[#90b8e0]">
            <span><b>Version:</b> 5.0.0 (Supabase Cloud)</span>
            <span><b>Environment:</b> Production</span>
            <span><b>Status:</b> <span className="text-[#F37022] font-bold">MIGRATED</span></span>
          </div>
        </div>

        {/* Login Card */}
        <div className="w-[440px] bg-gradient-to-b from-[#071e54] to-[#030f3a] border-l-2 border-[#F37022]/30 shadow-[-10px_0_60px_rgba(0,0,0,0.6)] flex flex-col justify-center p-11">
          <h2 className="text-2xl font-bold text-white mb-1">Secure Sign In</h2>
          <p className="text-[13px] text-[#a8c8f0] mb-5 font-medium">Enter your IOCL credentials to access the portal</p>
          <div className="w-9 h-1 bg-[#F37022] rounded-full mb-7" />

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] text-[#7ec8f0] tracking-widest uppercase font-bold mb-1.5">Employee ID</label>
              <div className="flex items-center bg-white/5 border border-white/20 rounded-md focus-within:border-[#F37022] focus-within:ring-2 focus-within:ring-[#F37022]/20 transition-all">
                <span className="px-3 text-white/50"><ShieldCheck size={18} /></span>
                <input 
                  type="text" 
                  value={empId}
                  onChange={e => setEmpId(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-white py-3 pr-3 text-sm tracking-wide placeholder:text-white/20" 
                  placeholder="Enter Employee ID"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-[#7ec8f0] tracking-widest uppercase font-bold mb-1.5">Password</label>
              <div className="flex items-center bg-white/5 border border-white/20 rounded-md focus-within:border-[#F37022] focus-within:ring-2 focus-within:ring-[#F37022]/20 transition-all">
                <span className="px-3 text-white/50"><Database size={18} /></span>
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-white py-3 pr-3 text-sm tracking-wide placeholder:text-white/20" 
                  placeholder="Enter Password"
                />
              </div>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-xs font-semibold text-red-300 bg-red-900/20 border border-red-900/40 rounded p-2 flex items-center gap-2"
                >
                  <AlertTriangle size={14} /> {error}
                </motion.div>
              )}
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-gradient-to-r from-[#d95008] via-[#F37022] to-[#f58c2c] text-white py-3.5 rounded-md font-bold tracking-wider hover:translate-y-[-2px] hover:shadow-[0_7px_36px_rgba(243,112,34,0.5)] active:translate-y-0 transition-all flex justify-between items-center px-6 disabled:opacity-50 disabled:pointer-events-none"
            >
              <span>{loading ? 'Verifying...' : 'Sign In to Portal'}</span>
              <ChevronRight size={20} />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/10 flex gap-3 items-start">
            <div className="text-[#90b8e0] text-[11px] leading-relaxed">
              <ShieldCheck className="inline-block mr-1 mb-1" size={14} />
              <b>256-bit TLS Encrypted Connection</b><br />
              This system is restricted to authorized IOCL employees only. All login attempts are logged and monitored.
            </div>
          </div>

          <div className="mt-4 bg-white/5 border border-[#F37022]/20 rounded-md p-3 flex justify-between items-center text-[11.5px] text-[#90b8e0]">
            <span>🛟 IT Helpdesk</span>
            <div className="flex gap-3">
              <span className="font-bold text-white flex items-center gap-1"><Phone size={12} /> 8476056756</span>
              <span className="font-bold text-white flex items-center gap-1"><Mail size={12} /> dubeya1@indianoil.in</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-[#010c2e] border-t-2 border-[#F37022] px-8 py-2 flex justify-between items-center text-[10px] text-[#6090c0]">
        <span>© 2026 Indian Oil Corporation Limited. All Rights Reserved.</span>
        <span>CIN: L23201MH1959GOI011388</span>
        <span>Regd. Office: IndianOil Bhavan, G-9 Ali Yavar Jung Marg, Bandra (E), Mumbai – 400 051</span>
      </div>
    </div>
  );
};

interface BurnerCellProps {
  burner: BurnerData;
  onUpdate: (state: BurnerState) => void | Promise<void>;
}

const BurnerCell: React.FC<BurnerCellProps> = ({ burner, onUpdate }) => {
  return (
    <td className={cn("burner-" + burner.state, "group")}>
      <div className="absolute inset-0 flex items-center justify-center">
        <select 
          value={burner.state}
          onChange={(e) => onUpdate(e.target.value as BurnerState)}
          className="w-full h-full opacity-0 cursor-pointer absolute inset-0 z-20"
        >
          {['B', 'N', 'O', 'C'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs font-bold text-white pointer-events-none z-10 group-hover:scale-125 transition-transform">
          {burner.state}
        </span>
      </div>
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 bg-slate-900 text-slate-100 text-[10px] font-semibold px-2 py-1 rounded border border-slate-700 whitespace-nowrap shadow-xl">
        Wall {burner.wall} · R{burner.row} B{burner.burner_num}
      </div>
    </td>
  );
};

const Dashboard = ({ empId, onLogout }: { empId: string, onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState<'heatmap' | 'burner' | 'cleaning' | 'tempdata' | 'alarms'>('heatmap');
  const [burners, setBurners] = useState<BurnerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    fetchData();
    
    // Real-time subscription
    const channel = supabase
      .channel('burner_updates')
      .on('postgres_changes' as any, { event: 'UPDATE', table: 'burners' }, (payload: any) => {
        const updated = payload.new as BurnerData;
        setBurners(prev => prev.map(b => 
          (b.wall === updated.wall && b.row === updated.row && b.burner_num === updated.burner_num) ? updated : b
        ));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      let data = await supabaseService.getBurners();
      
      // Seed data if empty
      if (data.length === 0) {
        console.log('Seeding initial burner data...');
        const initialBurners: any[] = [];
        WALL_NAMES.forEach(wall => {
          for (let row = 1; row <= ROWS; row++) {
            for (let num = 1; num <= BURNERS_PER_ROW; num++) {
              initialBurners.push({
                wall,
                row,
                burner_num: num,
                state: 'C',
                updated_at: new Date().toISOString()
              });
            }
          }
        });
        
        const { error } = await supabase.from('burners').insert(initialBurners);
        if (error) throw error;
        data = await supabaseService.getBurners();
      }
      
      setBurners(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBurner = async (wall: string, row: number, num: number, state: BurnerState) => {
    try {
      await supabaseService.updateBurner(wall, row, num, state);
      // Optimistic update
      setBurners(prev => prev.map(b => 
        (b.wall === wall && b.row === row && b.burner_num === num) ? { ...b, state } : b
      ));
    } catch (err) {
      console.error(err);
    }
  };

  const wallData = useMemo(() => {
    const data: Record<string, BurnerData[][]> = {};
    WALL_NAMES.forEach(w => {
      data[w] = Array.from({ length: ROWS }, (_, r) => 
        burners.filter(b => b.wall === w && b.row === r + 1)
      );
    });
    return data;
  }, [burners]);

  const analytics = useMemo(() => {
    return WALL_NAMES.map(w => {
      const wallBurners = burners.filter(b => b.wall === w);
      const counts = {
        B: wallBurners.filter(b => b.state === 'B').length,
        N: wallBurners.filter(b => b.state === 'N').length,
        O: wallBurners.filter(b => b.state === 'O').length,
        C: wallBurners.filter(b => b.state === 'C').length,
      };
      const imbalance = Math.abs(counts.N - counts.O);
      let severity = 'normal';
      if (imbalance > 20) severity = 'critical';
      else if (imbalance > 10) severity = 'major';
      else if (imbalance > 5) severity = 'warning';

      return { wall: w, counts, imbalance, severity };
    });
  }, [burners]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.body.classList.toggle('light-theme', newTheme === 'light');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* App Topbar */}
      <div className="bg-[#010e35] flex justify-between items-center px-7 py-1 text-[10.5px] text-[#8fafd4] tracking-wider border-b border-white/10">
        <div className="flex gap-4">
          <span>🇮🇳 <b>Indian Oil Corporation Limited</b> | Ministry of Petroleum & Natural Gas</span>
          <span><b>CIN:</b> L23201MH1959GOI011388</span>
        </div>
        <div className="flex gap-4 items-center">
          <span><b>Env:</b> Production</span>
          <span><b>Ver:</b> 5.0.0</span>
          <div className="w-1 h-4 bg-white/10 mx-1" />
          <button onClick={toggleTheme} className="hover:text-white transition-colors">
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>

      {/* App Header */}
      <header className="bg-gradient-to-r from-[#011038] via-[#011038] to-[#021a5a] border-b-3 border-[#F37022] shadow-xl">
        <div className="flex justify-between items-center px-7 py-2.5">
          <div className="flex items-center gap-4">
            <div className="pr-4 border-r border-white/15">
              <div className="text-lg font-bold text-[#F37022] leading-none">IndianOil</div>
              <div className="text-[9px] text-[#a0bcd8] tracking-widest mt-1">GUJARAT REFINERY</div>
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-wide">SCADA Burner Control & Monitoring System</div>
              <div className="text-[10px] text-[#a0bcd8] mt-0.5 font-medium uppercase tracking-wider">Reformer Wall Operations | Real-Time Analytics</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 border border-white/20 text-[#d0e4f7] text-xs font-semibold hover:bg-white/10 transition-all">
              <RefreshCw size={14} /> Refresh
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gradient-to-r from-[#1d4ed8] to-[#2563eb] text-white text-xs font-semibold border border-[#3b82f6] shadow-lg shadow-blue-900/40 hover:brightness-110 transition-all">
              <Save size={14} /> Save Data
            </button>
            <button onClick={onLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-900/15 border border-red-900/40 text-red-300 text-xs font-semibold hover:bg-red-900/25 transition-all">
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>

        {/* Meta Strip */}
        <div className="bg-black/30 border-t border-white/5 px-7 py-1.5 flex justify-between items-center">
          <div className="flex gap-5 flex-wrap">
            <div className="text-[10.5px] text-[#a0bcd8] flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse-dot" />
              <b>Status:</b> Live Cloud
            </div>
            <div className="text-[10.5px] text-[#a0bcd8]"><b>Walls:</b> A · B · C · D</div>
            <div className="text-[10.5px] text-[#a0bcd8]"><b>Operator:</b> <b className="text-[#d8eaf8]">EMP-{empId}</b></div>
          </div>
          <div className="text-[10.5px] text-[#a0bcd8] font-mono">{new Date().toLocaleTimeString()}</div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-5 overflow-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'heatmap' && (
            <motion.div 
              key="heatmap"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Legend */}
              <div className="flex gap-3.5 p-2 px-5 bg-slate-800/50 border border-slate-700 rounded-full w-fit mx-auto">
                <div className="flex items-center gap-2 text-[11px] font-bold text-blue-400">
                  <div className="w-3 h-3 rounded-sm bg-[#2563eb]" /> BOTH (B)
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-yellow-400">
                  <div className="w-3 h-3 rounded-sm bg-[#d97706]" /> NG ONLY (N)
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-green-400">
                  <div className="w-3 h-3 rounded-sm bg-[#16a34a]" /> OFF GAS (O)
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                  <div className="w-3 h-3 rounded-sm bg-[#1e293b] border border-slate-600" /> COLD (C)
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {WALL_NAMES.map(w => (
                  <div key={w} className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 shadow-xl">
                    <div className={cn(
                      "mb-3 py-1.5 px-3 rounded text-center text-xs font-bold tracking-widest uppercase border",
                      analytics.find(a => a.wall === w)?.severity === 'critical' ? "bg-red-900/40 border-red-500 text-red-100 animate-pulse" :
                      analytics.find(a => a.wall === w)?.severity === 'major' ? "bg-orange-900/40 border-orange-500 text-orange-100" :
                      analytics.find(a => a.wall === w)?.severity === 'warning' ? "bg-yellow-900/40 border-yellow-500 text-yellow-100" :
                      "bg-green-900/20 border-green-800 text-green-400"
                    )}>
                      Wall {w} — {analytics.find(a => a.wall === w)?.severity.toUpperCase()}
                    </div>
                    <table className="w-full border-separate border-spacing-[2px] table-fixed">
                      <thead>
                        <tr>
                          <th className="bg-slate-900 text-slate-500 p-1 text-[10px] rounded-sm border border-slate-800">R/B</th>
                          {Array.from({ length: BURNERS_PER_ROW }).map((_, i) => (
                            <th key={i} className="bg-slate-900 text-slate-500 p-1 text-[10px] rounded-sm border border-slate-800">B{i + 1}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wallData[w].map((row, ri) => (
                          <tr key={ri}>
                            <th className="bg-slate-900 text-slate-500 p-1 text-[10px] rounded-sm border border-slate-800">R{ri + 1}</th>
                            {row.map((b, ci) => (
                              <BurnerCell 
                                key={`${w}-${ri}-${ci}`} 
                                burner={b} 
                                onUpdate={(state) => handleUpdateBurner(w, ri + 1, ci + 1, state)} 
                              />
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              {/* Analytics */}
              <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-6 shadow-xl">
                <h2 className="text-orange-500 font-bold text-lg mb-6 flex items-center gap-2">
                  <Database size={20} /> Burner Distribution Analytics
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {analytics.map(a => (
                    <div key={a.wall} className="bg-slate-900/60 rounded-xl p-5 border border-slate-700 flex flex-col">
                      <h3 className="text-sky-400 font-bold text-sm mb-4">Wall {a.wall}</h3>
                      <div className="space-y-2 mb-6">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 uppercase tracking-wider">Imbalance</span>
                          <span className={cn("font-bold", a.severity === 'critical' ? "text-red-400" : "text-slate-200")}>
                            {a.imbalance} burner(s)
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500 uppercase tracking-wider">Severity</span>
                          <span className={cn("font-bold uppercase", 
                            a.severity === 'critical' ? "text-red-400" : 
                            a.severity === 'major' ? "text-orange-400" : 
                            a.severity === 'warning' ? "text-yellow-400" : "text-green-400"
                          )}>
                            {a.severity}
                          </span>
                        </div>
                      </div>
                      
                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Both', value: a.counts.B },
                                { name: 'NG', value: a.counts.N },
                                { name: 'Off Gas', value: a.counts.O },
                                { name: 'Cold', value: a.counts.C },
                              ]}
                              innerRadius={40}
                              outerRadius={60}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              <Cell fill="#2563eb" />
                              <Cell fill="#d97706" />
                              <Cell fill="#16a34a" />
                              <Cell fill="#64748b" />
                            </Pie>
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                              itemStyle={{ fontSize: '12px' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'cleaning' && (
            <motion.div 
              key="cleaning"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-slate-800/40 border border-slate-700 rounded-lg p-6 shadow-xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-orange-500 font-bold text-lg flex items-center gap-2">
                    <Eraser size={20} /> Burner Cleaning Log
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Track and manage burner cleaning schedules across all walls.</p>
                </div>
                <button className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-500 transition-colors">
                  Add Cleaning Event
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Wall</th>
                      <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Row</th>
                      <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Burner</th>
                      <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Last Cleaned</th>
                      <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-800 hover:bg-white/5 transition-colors">
                      <td className="p-3 text-sm text-slate-300">A</td>
                      <td className="p-3 text-sm text-slate-300">1</td>
                      <td className="p-3 text-sm text-slate-300">5</td>
                      <td className="p-3 text-sm text-slate-300">2024-05-20</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full bg-green-900/30 text-green-400 text-[10px] font-bold border border-green-900/50">CLEAN</span>
                      </td>
                    </tr>
                    {/* More rows would be mapped here */}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'tempdata' && (
            <motion.div 
              key="tempdata"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="bg-slate-800/40 border border-slate-700 rounded-lg p-6 shadow-xl"
            >
              <h2 className="text-orange-500 font-bold text-lg mb-6 flex items-center gap-2">
                <Thermometer size={20} /> Temperature Data Entry
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">AB Side Reformer COT (°C)</label>
                  <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 text-white outline-none focus:border-orange-500 transition-colors" placeholder="Enter value" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">CD Side Reformer COT (°C)</label>
                  <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 text-white outline-none focus:border-orange-500 transition-colors" placeholder="Enter value" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Reformer Flue Gas (°C)</label>
                  <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 text-white outline-none focus:border-orange-500 transition-colors" placeholder="Enter value" />
                </div>
              </div>
              <div className="mt-8 flex justify-end">
                <button className="px-6 py-2.5 bg-orange-600 text-white rounded font-bold hover:bg-orange-500 transition-colors shadow-lg shadow-orange-900/40">
                  Save Temperature Entry
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'alarms' && (
            <motion.div 
              key="alarms"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-slate-800/40 border border-slate-700 rounded-lg p-6 shadow-xl"
            >
              <h2 className="text-orange-500 font-bold text-lg mb-6 flex items-center gap-2">
                <Bell size={20} /> Active System Alarms
              </h2>
              <div className="space-y-4">
                {analytics.filter(a => a.severity !== 'normal').map(a => (
                  <div key={a.wall} className={cn(
                    "p-4 rounded-lg border flex items-start gap-4",
                    a.severity === 'critical' ? "bg-red-900/20 border-red-900/50" : "bg-orange-900/20 border-orange-900/50"
                  )}>
                    <div className={cn(
                      "p-2 rounded-full",
                      a.severity === 'critical' ? "bg-red-500 text-white" : "bg-orange-500 text-white"
                    )}>
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-100">Wall {a.wall} - Burner Imbalance</h3>
                      <p className="text-sm text-slate-400 mt-1">
                        Current imbalance: <span className="text-white font-bold">{a.imbalance}</span> burner(s). 
                        Immediate rebalancing recommended to prevent hot spots.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors">Acknowledge</button>
                        <button className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors">View Details</button>
                      </div>
                    </div>
                  </div>
                ))}
                {analytics.every(a => a.severity === 'normal') && (
                  <div className="text-center py-12 bg-slate-900/40 rounded-lg border border-dashed border-slate-700">
                    <div className="text-green-500 mb-2 flex justify-center"><ShieldCheck size={48} /></div>
                    <p className="text-slate-400 font-medium">All systems normal. No active alarms.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Tab Bar */}
      <nav className="bg-[#0f172a] border-t-2 border-[#F37022] shadow-[0_-4px_24px_rgba(0,0,0,0.5)] z-[1000] flex">
        {[
          { id: 'heatmap', icon: <Thermometer size={20} />, label: 'Heat Map' },
          { id: 'burner', icon: <Flame size={20} />, label: 'Burner Data' },
          { id: 'cleaning', icon: <Eraser size={20} />, label: 'Cleaning' },
          { id: 'tempdata', icon: <Thermometer size={20} />, label: 'Temp Data' },
          { id: 'alarms', icon: <Bell size={20} />, label: 'Alarms' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-all border-t-3 border-transparent",
              activeTab === tab.id ? "text-[#F37022] border-t-[#F37022] bg-[#F37022]/5" : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
            )}
          >
            {tab.icon}
            <span className="text-[11px] font-bold tracking-wider uppercase">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [empId, setEmpId] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem('scadaLoggedIn');
    const savedId = sessionStorage.getItem('scadaEmpId');
    if (saved === 'true' && savedId) {
      setIsLoggedIn(true);
      setEmpId(savedId);
    }
  }, []);

  const handleLogin = (id: string) => {
    setIsLoggedIn(true);
    setEmpId(id);
    sessionStorage.setItem('scadaLoggedIn', 'true');
    sessionStorage.setItem('scadaEmpId', id);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setEmpId('');
    sessionStorage.removeItem('scadaLoggedIn');
    sessionStorage.removeItem('scadaEmpId');
  };

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard empId={empId} onLogout={handleLogout} />;
}
