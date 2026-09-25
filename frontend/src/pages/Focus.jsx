import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TreePine, Play, Pause, RotateCcw, Settings, Leaf, Zap } from 'lucide-react';
import { courseAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

// Tree growth stages
const TREE_STAGES = [
  { emoji: '🌱', label: 'Sprout', minProgress: 0 },
  { emoji: '🌿', label: 'Sapling', minProgress: 25 },
  { emoji: '🌲', label: 'Young Tree', minProgress: 50 },
  { emoji: '🌳', label: 'Full Tree', minProgress: 75 },
  { emoji: '🌲✨', label: 'Ancient Tree', minProgress: 100 },
];

const PRESETS = [
  { label: 'Pomodoro', work: 25, break: 5, type: 'pomodoro' },
  { label: 'Deep Work', work: 50, break: 10, type: 'deep_work' },
  { label: 'Short Sprint', work: 15, break: 3, type: 'pomodoro' },
];

// Animated Tree
const AnimatedTree = ({ progress, growing }) => {
  const stage = TREE_STAGES.reduce((best, s) => (progress >= s.minProgress ? s : best), TREE_STAGES[0]);
  const rings = Math.floor(progress / 20);

  return (
    <div className="flex flex-col items-center">
      {/* Tree rings */}
      <div className="relative w-48 h-48 flex items-center justify-center">
        {[...Array(5)].map((_, i) => (
          <motion.div key={i}
            animate={{ scale: growing ? [1, 1.02, 1] : 1, opacity: i < rings ? 1 : 0.15 }}
            transition={{ duration: 2, repeat: growing ? Infinity : 0, delay: i * 0.2 }}
            className="absolute rounded-full"
            style={{
              width: 40 + i * 24,
              height: 40 + i * 24,
              border: `2px solid rgba(16,185,129,${i < rings ? 0.4 - i * 0.06 : 0.08})`,
            }}
          />
        ))}
        <motion.div
          animate={{ scale: growing ? [1, 1.1, 1] : 1 }}
          transition={{ duration: 1.5, repeat: growing ? Infinity : 0 }}
          className="text-7xl z-10 select-none"
          style={{ filter: `drop-shadow(0 0 ${10 + progress / 5}px rgba(16,185,129,0.6))` }}
        >
          {stage.emoji.split('✨')[0]}
        </motion.div>
        {progress >= 100 && (
          <motion.div className="absolute text-2xl" style={{ top: 10, right: 10 }}
            animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1, repeat: Infinity }}>
            ✨
          </motion.div>
        )}
      </div>
      <motion.p className="text-sm font-semibold mt-2" style={{ color: '#10b981' }}
        animate={{ opacity: growing ? [0.7, 1, 0.7] : 1 }}
        transition={{ duration: 2, repeat: Infinity }}>
        {stage.label}
      </motion.p>
    </div>
  );
};

export default function Focus() {
  const { gamification, updateGamification } = useAuth();
  const [preset, setPreset] = useState(PRESETS[0]);
  const [workMinutes, setWorkMinutes] = useState(25);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState('work'); // work | break
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [treesThisSession, setTreesThisSession] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const intervalRef = useRef(null);

  const currentTotalSeconds = (phase === 'work' ? workMinutes : preset.break) * 60;
  const progress = Math.min(100, Math.max(0, ((currentTotalSeconds - timeLeft) / (currentTotalSeconds || 1)) * 100));
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const handleTimerComplete = useCallback(async () => {
    setIsRunning(false);
    if (phase === 'work') {
      toast.success('🌳 Focus session complete! Tree grown!', { duration: 4000 });
      setSessionsCompleted(prev => prev + 1);
      setTreesThisSession(prev => prev + 1);
      try {
        const res = await courseAPI.completeFocus({
          duration_minutes: workMinutes,
          session_type: preset.type,
        });
        updateGamification(prev => ({
          ...prev,
          trees_grown: (prev?.trees_grown || 0) + 1,
          total_xp: (prev?.total_xp || 0) + (res.data?.data?.xp_earned || 25),
        }));
      } catch (err) {
        console.warn('Notice updating focus completion:', err.message);
      }
      // Switch to break
      setPhase('break');
      setTimeLeft(preset.break * 60);
    } else {
      toast('☀️ Break over! Ready for another session?');
      setPhase('work');
      setTimeLeft(workMinutes * 60);
    }
  }, [phase, workMinutes, preset, updateGamification]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, handleTimerComplete]);

  const switchMode = (newPhase) => {
    console.log(`[FocusTimer] Current mode: ${phase}`);
    if (newPhase === 'break') {
      console.log('[FocusTimer] Break button clicked');
      console.log('[FocusTimer] Switching to break');
    } else {
      console.log('[FocusTimer] Focus button clicked');
      console.log('[FocusTimer] Switching to focus');
    }

    if (phase === newPhase) return;

    setIsRunning(false);
    clearInterval(intervalRef.current);
    setPhase(newPhase);

    const newDuration = (newPhase === 'work' ? workMinutes : preset.break) * 60;
    setTimeLeft(newDuration);

    console.log(`[FocusTimer] Timer duration: ${newDuration}`);
    console.log(`[FocusTimer] Timer running: false`);
  };

  const resetTimer = () => {
    setIsRunning(false);
    clearInterval(intervalRef.current);
    const duration = (phase === 'work' ? workMinutes : preset.break) * 60;
    setTimeLeft(duration);
  };

  const applyPreset = (p) => {
    setPreset(p);
    setWorkMinutes(p.work);
    setIsRunning(false);
    clearInterval(intervalRef.current);
    const duration = (phase === 'work' ? p.work : p.break) * 60;
    setTimeLeft(duration);
  };

  // Render a small forest from grown trees
  const forestTrees = Array.from({ length: Math.min(gamification?.trees_grown || 0, 20) });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-bold gradient-text mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Forest Focus Timer
        </h1>
        <p style={{ color: '#64748b' }}>Grow trees while you study. Stay focused, watch your forest grow.</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timer */}
        <div className="lg:col-span-2">
          <div className="glass-card p-8 text-center">
            {/* Phase Mode Selector: 🎯 Focus & ☕ Break */}
            <div className="flex gap-3 justify-center mb-6">
              <button
                type="button"
                id="focus-mode-btn"
                onClick={() => switchMode('work')}
                className="px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer select-none"
                style={{
                  background: phase === 'work' ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.03)',
                  color: phase === 'work' ? '#818cf8' : '#94a3b8',
                  border: `1px solid ${phase === 'work' ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: phase === 'work' ? '0 0 20px rgba(99,102,241,0.25)' : 'none',
                }}
              >
                <span>🎯</span>
                <span>Focus</span>
              </button>

              <button
                type="button"
                id="break-mode-btn"
                onClick={() => switchMode('break')}
                className="px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer select-none"
                style={{
                  background: phase === 'break' ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.03)',
                  color: phase === 'break' ? '#34d399' : '#94a3b8',
                  border: `1px solid ${phase === 'break' ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  boxShadow: phase === 'break' ? '0 0 20px rgba(16,185,129,0.25)' : 'none',
                }}
              >
                <span>☕</span>
                <span>Break</span>
              </button>
            </div>

            {/* Animated Tree */}
            <AnimatedTree progress={progress} growing={isRunning && phase === 'work'} />

            {/* Timer Display */}
            <div className="my-6">
              <div className="text-8xl font-black tabular-nums"
                style={{ fontFamily: 'Space Grotesk, sans-serif', color: phase === 'work' ? '#6366f1' : '#10b981' }}>
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </div>
              {/* Circular progress hint */}
              <div className="xp-bar mt-3 w-64 mx-auto">
                <div className="xp-bar-fill" style={{ width: `${progress}%`, background: phase === 'work' ? undefined : 'linear-gradient(90deg,#10b981,#34d399)' }} />
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-4">
              <button onClick={resetTimer}
                title="Reset timer"
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                <RotateCcw size={18} />
              </button>
              <button onClick={() => setIsRunning(!isRunning)}
                title={isRunning ? 'Pause' : 'Start'}
                className="w-20 h-20 rounded-full flex items-center justify-center transition-all text-white pulse-glow cursor-pointer"
                style={{
                  background: isRunning
                    ? 'linear-gradient(135deg,#ef4444,#f97316)'
                    : phase === 'work'
                    ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                    : 'linear-gradient(135deg,#10b981,#059669)',
                  boxShadow: isRunning
                    ? '0 0 30px rgba(239,68,68,0.4)'
                    : phase === 'work'
                    ? '0 0 30px rgba(99,102,241,0.4)'
                    : '0 0 30px rgba(16,185,129,0.4)',
                }}>
                {isRunning ? <Pause size={28} /> : <Play size={28} className="translate-x-0.5" />}
              </button>
              <button onClick={() => setShowSettings(!showSettings)}
                title="Timer settings"
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer"
                style={{
                  background: showSettings ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${showSettings ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  color: showSettings ? '#818cf8' : '#94a3b8'
                }}>
                <Settings size={18} />
              </button>
            </div>

            {/* Custom Duration Settings Popover */}
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6 p-4 rounded-xl text-left"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <h4 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
                    <Settings size={14} className="text-indigo-400" />
                    <span>Custom Durations</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Focus Duration (min)</label>
                      <input
                        type="number"
                        min="1"
                        max="180"
                        value={workMinutes}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 25);
                          setWorkMinutes(val);
                          if (phase === 'work' && !isRunning) {
                            setTimeLeft(val * 60);
                          }
                        }}
                        className="w-full px-3 py-1.5 rounded-lg text-xs text-white"
                        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(99,102,241,0.3)' }}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Break Duration (min)</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={preset.break}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 5);
                          setPreset((prev) => ({ ...prev, break: val }));
                          if (phase === 'break' && !isRunning) {
                            setTimeLeft(val * 60);
                          }
                        }}
                        className="w-full px-3 py-1.5 rounded-lg text-xs text-white"
                        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(16,185,129,0.3)' }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Presets */}
            <div className="flex gap-3 justify-center mt-6">
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
                  style={{
                    background: preset.label === p.label ? (phase === 'work' ? 'rgba(99,102,241,0.2)' : 'rgba(16,185,129,0.2)') : 'rgba(255,255,255,0.03)',
                    color: preset.label === p.label ? (phase === 'work' ? '#818cf8' : '#34d399') : '#64748b',
                    border: `1px solid ${preset.label === p.label ? (phase === 'work' ? 'rgba(99,102,241,0.4)' : 'rgba(16,185,129,0.4)') : 'rgba(255,255,255,0.08)'}`,
                  }}>
                  {p.label} ({phase === 'work' ? p.work : p.break}m)
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats & Forest */}
        <div className="space-y-4">
          {/* Session Stats */}
          <div className="glass-card p-5">
            <h3 className="font-bold mb-4" style={{ color: '#f1f5f9', fontFamily: 'Space Grotesk, sans-serif' }}>
              Session Stats
            </h3>
            {[
              { label: 'Sessions Today', value: sessionsCompleted, icon: '🎯', color: '#6366f1' },
              { label: 'Trees This Session', value: treesThisSession, icon: '🌱', color: '#10b981' },
              { label: 'Total Trees', value: gamification?.trees_grown || 0, icon: '🌳', color: '#10b981' },
              { label: 'Total XP', value: gamification?.total_xp || 0, icon: '⚡', color: '#f59e0b' },
              { label: 'Study Streak', value: `${gamification?.current_streak || 0}d`, icon: '🔥', color: '#ef4444' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="flex items-center justify-between py-2"
                style={{ borderBottom: '1px solid rgba(99,102,241,0.08)' }}>
                <span className="text-xs" style={{ color: '#64748b' }}>{icon} {label}</span>
                <span className="text-sm font-bold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Mini Forest */}
          <div className="glass-card p-5">
            <h3 className="font-bold mb-3" style={{ color: '#f1f5f9', fontFamily: 'Space Grotesk, sans-serif' }}>
              🌲 My Forest
            </h3>
            {forestTrees.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: '#475569' }}>
                Complete focus sessions to grow trees!
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {forestTrees.map((_, i) => (
                  <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="text-xl tree-grow">🌲</motion.span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
