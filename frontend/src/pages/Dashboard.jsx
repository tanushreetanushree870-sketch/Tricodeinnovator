import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Link, BookOpen, Trash2, RefreshCw, Database, Zap, TrendingUp, Clock,
  X, ExternalLink, Copy, Check, AlertCircle, Layers, MessageSquare, ArrowRight,
  Eye, Sparkles
} from 'lucide-react';
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
  document: { icon: FileText, color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
};

export default function Dashboard() {
  const { user, gamification } = useAuth();
  const navigate = useNavigate();

  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourcesError, setSourcesError] = useState(null);

  // Selected source modal state
  const [selectedSource, setSelectedSource] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  const [activeTab, setActiveTab] = useState('chunks'); // 'chunks' | 'metadata' | 'raw'
  const [copiedChunkId, setCopiedChunkId] = useState(null);
  const [retryingId, setRetryingId] = useState(null);

  const isFetchingRef = useRef(false);

  const fetchSources = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoadingSources(true);
    setSourcesError(null);
    console.log('[KnowledgeLibrary] Loading sources...');
    console.log('[KnowledgeLibrary] Current user ID:', user?.id);

    try {
      const res = await ingestAPI.getSources();
      console.log('[KnowledgeLibrary] Sources response:', res.data);
      const items = res.data?.data || [];
      console.log('[KnowledgeLibrary] Source count:', items.length);
      setSources(items);
    } catch (err) {
      console.error('[KnowledgeLibrary] Sources fetch error:', err);
      setSourcesError('Unable to load your knowledge library. Please try again.');
      toast.error('Unable to load your knowledge library. Please try again.');
    } finally {
      isFetchingRef.current = false;
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const handleOpenSource = async (source) => {
    if (!source?.id) return;
    console.log('[KnowledgeLibrary] Opening source:', source?.title);
    console.log('[KnowledgeLibrary] Source ID:', source?.id);
    console.log('[KnowledgeLibrary] Loading source details...');

    // Open modal immediately with available card data
    setSelectedSource(source);
    setLoadingDetails(true);
    setDetailsError(null);
    setActiveTab('chunks');

    try {
      const res = await ingestAPI.getSourceDetails(source.id);
      const fullData = res.data?.data || source;
      console.log('[KnowledgeLibrary] Chunks response:', fullData?.chunks || []);
      setSelectedSource(fullData);
    } catch (err) {
      console.error('[KnowledgeLibrary] Open error:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data,
      });
      if (err.response?.status === 404) {
        toast.error('Source not found on server. Refreshing knowledge library...');
        fetchSources();
      } else {
        toast.error('Unable to open this source.');
      }
      setDetailsError('Unable to open this source.');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleRetry = async (id, title) => {
    setRetryingId(id);
    try {
      const res = await ingestAPI.retrySource(id);
      toast.success(res.data?.message || `Successfully reprocessed "${title}"!`);
      await fetchSources();
      if (selectedSource?.id === id) {
        await handleOpenSource({ ...selectedSource, id });
      }
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
      if (selectedSource?.id === id) {
        setSelectedSource(null);
      }
    } catch (err) {
      console.error('[KnowledgeLibrary] Delete error:', err);
      toast.error('Failed to delete source');
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedChunkId(id);
    toast.success('Copied chunk to clipboard');
    setTimeout(() => setCopiedChunkId(null), 2000);
  };

  const stats = [
    { label: 'Total Sources', value: sources.length, icon: Database, color: '#6366f1' },
    { label: 'Total XP', value: gamification?.total_xp || 0, icon: Zap, color: '#f59e0b' },
    { label: 'Current Level', value: gamification?.current_level || 1, icon: TrendingUp, color: '#10b981' },
    { label: 'Study Streak', value: `${gamification?.current_streak || 0} days`, icon: Clock, color: '#ef4444' },
  ];

  const activeType = selectedSource?.source_type || 'text';
  const activeCfg = sourceIcons[activeType] || sourceIcons.text;
  const ActiveIcon = activeCfg.icon;

  const rawMetadata = selectedSource?.parsed_metadata || {};
  const metadata = typeof rawMetadata === 'string' ? (() => {
    try { return JSON.parse(rawMetadata); } catch { return {}; }
  })() : rawMetadata;

  const chunks = selectedSource?.chunks || [];

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
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif', color: '#f1f5f9' }}>
                  Knowledge Library
                </h2>
                <p className="text-xs" style={{ color: '#64748b' }}>
                  Click any research asset to inspect chunks, metadata, and embeddings
                </p>
              </div>
              <button
                id="refresh-sources-btn"
                onClick={fetchSources}
                disabled={loadingSources}
                className="p-2 rounded-lg transition-colors hover:bg-indigo-500/20 active:scale-95 disabled:opacity-50"
                style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}
                title="Refresh Knowledge Library"
              >
                <RefreshCw size={14} className={loadingSources ? 'animate-spin' : ''} />
              </button>
            </div>

            {loadingSources ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="shimmer h-16 rounded-xl" />
                ))}
              </div>
            ) : sourcesError && sources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <AlertCircle size={36} className="text-rose-400 mb-3" />
                <p className="text-sm font-medium text-slate-200 mb-1">{sourcesError}</p>
                <p className="text-xs text-slate-500 mb-4">Check your network connection and retry</p>
                <button
                  onClick={fetchSources}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                  style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}
                >
                  <RefreshCw size={12} /> Retry
                </button>
              </div>
            ) : sources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Database size={40} style={{ color: '#334155' }} className="mb-3" />
                <p style={{ color: '#64748b' }} className="font-medium">No sources found yet.</p>
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
                    <motion.div
                      key={source.id || i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenSource(source)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleOpenSource(source);
                        }
                      }}
                      className="flex items-center gap-3 p-4 rounded-xl transition-all group cursor-pointer hover:shadow-lg select-none"
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
                          <p className="font-medium text-sm truncate group-hover:text-indigo-300 transition-colors" style={{ color: '#f1f5f9' }}>
                            {displayTitle}
                          </p>
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

                      {/* Quick Open Indicator */}
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs flex items-center gap-1 text-indigo-400 font-medium px-2 py-1 rounded bg-indigo-500/10">
                        <Eye size={13} /> View
                      </span>

                      {/* Retry Button if failed */}
                      {status === 'failed' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetry(source.id, displayTitle);
                          }}
                          disabled={isRetrying}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all shrink-0"
                          style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}
                          title="Retry processing and embedding"
                        >
                          <RefreshCw size={12} className={isRetrying ? 'animate-spin' : ''} />
                          {isRetrying ? 'Retrying...' : 'Retry'}
                        </button>
                      )}

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(source.id, displayTitle);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg shrink-0"
                        style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}
                        title="Delete source"
                      >
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

      {/* Source Details Modal / Slide-over Drawer */}
      <AnimatePresence>
        {selectedSource && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setSelectedSource(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl overflow-hidden"
              style={{
                background: '#12121e',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 40px rgba(99, 102, 241, 0.2)'
              }}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-indigo-500/20 flex items-start justify-between gap-4 shrink-0 bg-slate-900/40">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: activeCfg.bg }}
                  >
                    <ActiveIcon size={22} style={{ color: activeCfg.color }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="badge badge-primary text-xs uppercase">{activeType}</span>
                      {selectedSource.processing_status === 'completed' && (
                        <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          Active & Vectorized
                        </span>
                      )}
                      {selectedSource.processing_status === 'processing' && (
                        <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <RefreshCw size={10} className="animate-spin" /> Vectorizing Chunks
                        </span>
                      )}
                      {selectedSource.processing_status === 'failed' && (
                        <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                          Processing Failed
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-bold text-slate-100 truncate" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      {selectedSource.title || 'Untitled Research Asset'}
                    </h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedSource(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                  title="Close source details"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Meta Ribbon */}
              <div className="px-6 py-3 border-b border-indigo-500/10 bg-slate-950/40 flex items-center justify-between flex-wrap gap-3 text-xs text-slate-400 shrink-0">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Clock size={13} className="text-indigo-400" />
                    {selectedSource.created_at ? new Date(selectedSource.created_at).toLocaleDateString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : 'Recent'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Layers size={13} className="text-emerald-400" />
                    {chunks.length || selectedSource.chunk_count || 0} Chunks
                  </span>
                  {selectedSource.file_size > 0 && (
                    <span className="flex items-center gap-1.5">
                      <FileText size={13} className="text-amber-400" />
                      {(selectedSource.file_size / 1024).toFixed(1)} KB
                    </span>
                  )}
                </div>

                {selectedSource.storage_url && (
                  <a
                    href={selectedSource.storage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                  >
                    <span>Open URL</span>
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>

              {/* Tabs Navigation */}
              <div className="px-6 pt-3 flex gap-2 border-b border-indigo-500/15 bg-slate-900/20 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('chunks')}
                  className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                    activeTab === 'chunks'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers size={14} /> Vector Chunks ({chunks.length || selectedSource.chunk_count || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('metadata')}
                  className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                    activeTab === 'metadata'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles size={14} /> Extracted Metadata
                </button>
                {selectedSource.raw_text && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('raw')}
                    className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                      activeTab === 'raw'
                        ? 'border-indigo-500 text-indigo-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <FileText size={14} /> Full Text
                  </button>
                )}
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1 min-h-[260px] space-y-4">
                {loadingDetails ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <RefreshCw size={32} className="animate-spin text-indigo-400 mb-3" />
                    <p className="text-sm font-medium text-slate-200">Loading source details & chunks...</p>
                    <p className="text-xs text-slate-500">Retrieving embeddings from vector store</p>
                  </div>
                ) : detailsError ? (
                  <div className="p-5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-center">
                    <AlertCircle size={32} className="text-rose-400 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-rose-300 mb-1">{detailsError}</p>
                    <p className="text-xs text-slate-400 mb-4">The source details could not be loaded from the database.</p>
                    <button
                      type="button"
                      onClick={() => handleOpenSource(selectedSource)}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-200 hover:bg-rose-500/30 transition-colors"
                    >
                      Retry Loading
                    </button>
                  </div>
                ) : activeTab === 'chunks' ? (
                  <div>
                    {chunks.length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <Layers size={32} className="mx-auto mb-2 text-slate-600" />
                        <p className="text-sm font-medium">No vector chunks available for this source.</p>
                        {selectedSource.processing_status === 'processing' ? (
                          <p className="text-xs text-amber-400 mt-1">Embeddings are currently being calculated.</p>
                        ) : (
                          <p className="text-xs text-slate-500 mt-1">Try clicking 'Retry' on the dashboard to vectorize this source.</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {chunks.map((chunk, idx) => (
                          <div
                            key={chunk.id || idx}
                            className="p-4 rounded-xl border border-indigo-500/15 bg-slate-900/60 hover:border-indigo-500/30 transition-all"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                                Chunk #{idx + 1}
                              </span>
                              <div className="flex items-center gap-2">
                                {chunk.page_or_timestamp && (
                                  <span className="text-[11px] text-slate-400">
                                    Ref: {chunk.page_or_timestamp}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(chunk.chunk_content, chunk.id || idx)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                  title="Copy chunk text"
                                >
                                  {copiedChunkId === (chunk.id || idx) ? (
                                    <Check size={13} className="text-emerald-400" />
                                  ) : (
                                    <Copy size={13} />
                                  )}
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap bg-slate-950/40 p-3 rounded-lg border border-white/5">
                              {chunk.chunk_content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : activeTab === 'metadata' ? (
                  <div className="space-y-4">
                    {metadata.abstract_summary && (
                      <div className="p-4 rounded-xl border border-indigo-500/15 bg-slate-900/60">
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-1.5">
                          Abstract Summary
                        </span>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {metadata.abstract_summary}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {metadata.methodology && metadata.methodology !== 'N/A' && (
                        <div className="p-3.5 rounded-xl border border-white/5 bg-slate-900/40">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                            Methodology
                          </span>
                          <p className="text-xs text-slate-200">{metadata.methodology}</p>
                        </div>
                      )}

                      {metadata.datasets && metadata.datasets !== 'N/A' && (
                        <div className="p-3.5 rounded-xl border border-white/5 bg-slate-900/40">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                            Datasets
                          </span>
                          <p className="text-xs text-slate-200">{metadata.datasets}</p>
                        </div>
                      )}

                      {metadata.results && metadata.results !== 'N/A' && (
                        <div className="p-3.5 rounded-xl border border-white/5 bg-slate-900/40">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                            Key Results
                          </span>
                          <p className="text-xs text-slate-200">{metadata.results}</p>
                        </div>
                      )}

                      {metadata.limitations && metadata.limitations !== 'N/A' && (
                        <div className="p-3.5 rounded-xl border border-white/5 bg-slate-900/40">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                            Limitations
                          </span>
                          <p className="text-xs text-slate-200">{metadata.limitations}</p>
                        </div>
                      )}
                    </div>

                    {Array.isArray(metadata.keywords) && metadata.keywords.length > 0 && (
                      <div className="p-3.5 rounded-xl border border-white/5 bg-slate-900/40">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                          Extracted Keywords
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {metadata.keywords.map((kw, i) => (
                            <span
                              key={i}
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                            >
                              #{kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : activeTab === 'raw' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Full Document / Transcript Content</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedSource.raw_text, 'raw_full')}
                        className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                      >
                        {copiedChunkId === 'raw_full' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>Copy All</span>
                      </button>
                    </div>
                    <div className="p-4 rounded-xl border border-white/5 bg-slate-950/60 max-h-[350px] overflow-y-auto">
                      <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                        {selectedSource.raw_text}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Modal Footer Actions */}
              <div className="p-4 px-6 border-t border-indigo-500/20 bg-slate-950/60 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSource(null);
                      navigate('/chat');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all hover:bg-cyan-500/20"
                    style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }}
                  >
                    <MessageSquare size={13} /> Chat with Source
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSource(null);
                      navigate('/matrix');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all hover:bg-purple-500/20"
                    style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}
                  >
                    <Database size={13} /> Compare in Matrix
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedSource(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
