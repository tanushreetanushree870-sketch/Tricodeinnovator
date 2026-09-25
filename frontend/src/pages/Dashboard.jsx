import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Link, BookOpen, Trash2, RefreshCw, Database, Zap, TrendingUp, Clock } from 'lucide-react';
import FileUploader from '../components/FileUploader';
import { ingestAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const sourceIcons = {
  pdf: { icon: FileText, color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  ppt: { icon: FileText, color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  audio: { icon: FileText, color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)' },
  youtube: { icon: Link, color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  web: { icon: Link, color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' },
  anki: { icon: BookOpen, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  text: { icon: FileText, color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
};

export default function Dashboard() {
  const { user, gamification } = useAuth();
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const fetchSources = async () => {
    setLoadingSources(true);
    try {
      const res = await ingestAPI.getSources();
      setSources(res.data.data || []);
    } catch {
      toast.error('Failed to fetch sources');
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => { fetchSources(); }, []);

  const [retryingId, setRetryingId] = useState(null);

  const handleRetry = async (id, title) => {
    setRetryingId(id);
    try {
      const res = await ingestAPI.retrySource(id);
      toast.success(res.data?.message || `Successfully reprocessed "${title}"!`);
      await fetchSources();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to reprocess "${title}"`);
    } finally {
      setRetryingId(null);
    }
  };

  const handleDelete = async (id, title) => {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      await ingestAPI.deleteSource(id);
      toast.success('Source deleted');
      setSources(prev => prev.filter(s => s.id !== id));
    } catch {
      toast.error('Failed to delete source');
    }
  };

  const stats = [
    { label: 'Total Sources', value: sources.length, icon: Database, color: '#6366f1' },
    { label: 'Total XP', value: gamification?.total_xp || 0, icon: Zap, color: '#f59e0b' },
    { label: 'Current Level', value: gamification?.current_level || 1, icon: TrendingUp, color: '#10b981' },
    { label: 'Study Streak', value: `${gamification?.current_streak || 0} days`, icon: Clock, color: '#ef4444' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-bold gradient-text mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Welcome back, {user?.full_name?.split(' ')[0]} 👋
        </h1>
        <p style={{ color: '#64748b' }}>Your AI-powered research operating system</p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }} className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748b' }}>{label}</span>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `${color}20` }}>
                <Icon size={15} style={{ color }} />
              </div>
            </div>
            <div className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif', color }}>{value}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Uploader */}
        <div className="lg:col-span-2">
          <FileUploader onUploadComplete={fetchSources} />
        </div>

        {/* Sources Library */}
        <div className="lg:col-span-3">
          <div className="glass-card p-6" style={{ minHeight: 400 }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#f1f5f9' }}>
                Knowledge Library
              </h2>
              <button onClick={fetchSources} className="p-2 rounded-lg transition-colors"
                style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                <RefreshCw size={14} className={loadingSources ? 'animate-spin' : ''} />
              </button>
            </div>

            {loadingSources ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="shimmer h-16 rounded-xl" />
                ))}
              </div>
            ) : sources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Database size={40} style={{ color: '#334155' }} className="mb-3" />
                <p style={{ color: '#64748b' }} className="font-medium">No sources yet</p>
                <p style={{ color: '#475569', fontSize: 13 }}>Upload files, URLs, or Anki decks to get started</p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto" style={{ maxHeight: 480 }}>
                {sources.map((source, i) => {
                  const sType = source?.source_type || 'text';
                  const cfg = sourceIcons[sType] || sourceIcons.text;
                  const Icon = cfg.icon;
                  const displayTitle = source?.title || 'Untitled Research Asset';
                  const dateStr = source?.created_at ? new Date(source.created_at).toLocaleDateString() : 'Recent';
                  const chunkStr = source?.chunk_count != null ? `${source.chunk_count} chunks` : '';
                  const status = source?.processing_status || 'completed';
                  const isRetrying = retryingId === source.id;

                  return (
                    <motion.div key={source.id || i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-3 p-4 rounded-xl transition-all group"
                      style={{
                        background: status === 'failed' ? 'rgba(239,68,68,0.03)' : 'rgba(255,255,255,0.02)',
                        border: status === 'failed' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(99,102,241,0.1)'
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = status === 'failed' ? 'rgba(239,68,68,0.4)' : 'rgba(99,102,241,0.3)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = status === 'failed' ? 'rgba(239,68,68,0.2)' : '1px solid rgba(99,102,241,0.1)'}
                    >
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: cfg.bg }}>
                        <Icon size={18} style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate" style={{ color: '#f1f5f9' }}>{displayTitle}</p>
                          {status === 'failed' && (
                            <span className="text-[10px] px-2 py-0.5 rounded font-semibold shrink-0"
                              style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                              Processing failed
                            </span>
                          )}
                          {status === 'processing' && (
                            <span className="text-[10px] px-2 py-0.5 rounded font-semibold shrink-0 flex items-center gap-1"
                              style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                              <RefreshCw size={9} className="animate-spin" /> Vectorizing
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="badge badge-primary text-xs">{sType.toUpperCase()}</span>
                          <span className="text-xs" style={{ color: '#64748b' }}>
                            {status === 'failed'
                              ? (source.error_message ? `Error: ${source.error_message.slice(0, 45)}` : 'Processing error')
                              : `${chunkStr ? `${chunkStr} · ` : ''}${dateStr}`
                            }
                          </span>
                        </div>
                      </div>

                      {/* Retry Button if failed */}
                      {status === 'failed' && (
                        <button
                          onClick={() => handleRetry(source.id, displayTitle)}
                          disabled={isRetrying}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                          style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}
                          title="Retry processing and embedding"
                        >
                          <RefreshCw size={12} className={isRetrying ? 'animate-spin' : ''} />
                          {isRetrying ? 'Retrying...' : 'Retry'}
                        </button>
                      )}

                      <button onClick={() => handleDelete(source.id, displayTitle)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg"
                        style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>
                        <Trash2 size={14} />
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
