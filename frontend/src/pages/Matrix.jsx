import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Table2,
  FileText,
  AlertCircle,
  RotateCcw,
  CheckCheck,
  XSquare,
} from 'lucide-react';
import { ingestAPI, researchAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const FIELDS = ['methodology', 'datasets', 'results', 'limitations'];
const FIELD_COLORS = {
  methodology: '#6366f1',
  datasets: '#06b6d4',
  results: '#10b981',
  limitations: '#f59e0b',
};

export default function Matrix() {
  const { user } = useAuth();
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourceError, setSourceError] = useState(null);

  const [selected, setSelected] = useState([]);
  const [matrix, setMatrix] = useState([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [matrixError, setMatrixError] = useState(null);
  const [expandedField, setExpandedField] = useState('methodology');

  const fetchSources = useCallback(async () => {
    setLoadingSources(true);
    setSourceError(null);
    try {
      console.log('[ResearchMatrix] Current user ID:', user?.id);
      console.log('[ResearchMatrix] Fetching sources...');
      const res = await ingestAPI.getSources();
      console.log('[ResearchMatrix] API response:', res.data);
      const items = res.data?.data || [];
      console.log('[ResearchMatrix] Number of sources:', items.length);
      setSources(items);

      // Auto-select initial sources if none are currently selected
      setSelected((prev) => {
        if (prev.length > 0) {
          // Keep existing selection, filtered by active sources
          const activeIds = new Set(items.map((s) => String(s.id)));
          const valid = prev.filter((id) => activeIds.has(String(id)));
          return valid.length > 0 ? valid : items.slice(0, 2).map((s) => String(s.id));
        }
        // Default: select up to the first 2 sources
        const initial = items.slice(0, 2).map((s) => String(s.id));
        console.log('[ResearchMatrix] Selected source IDs:', initial);
        return initial;
      });
    } catch (err) {
      console.error('[ResearchMatrix] Failed to fetch sources:', err);
      setSourceError(err.response?.data?.message || 'Unable to load sources.');
    } finally {
      setLoadingSources(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const toggleSource = (id) => {
    const strId = String(id);
    setSelected((prev) => {
      const next = prev.includes(strId)
        ? prev.filter((s) => s !== strId)
        : [...prev, strId];
      console.log('[ResearchMatrix] Selected source IDs:', next);
      return next;
    });
  };

  const selectAll = () => {
    const allIds = sources.map((s) => String(s.id));
    setSelected(allIds);
  };

  const clearSelection = () => {
    setSelected([]);
  };

  const handleGenerate = async () => {
    if (selected.length < 2) {
      return toast.error('Select at least 2 research papers to compare.');
    }

    setLoadingMatrix(true);
    setMatrixError(null);
    try {
      console.log('[ResearchMatrix] Generating matrix for IDs:', selected);
      const res = await researchAPI.getMatrix(selected);
      const matrixData = res.data?.data?.matrix || [];
      setMatrix(matrixData);
      if (matrixData.length > 0) {
        toast.success(
          `Matrix generated for ${matrixData.length} paper${matrixData.length > 1 ? 's' : ''}`
        );
      }
    } catch (err) {
      console.error('[ResearchMatrix] Matrix generation error:', err);
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to generate research matrix';
      setMatrixError(msg);
      toast.error(msg);
    } finally {
      setLoadingMatrix(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-3xl font-bold gradient-text mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Research Matrix
        </h1>
        <p style={{ color: '#64748b' }}>Side-by-side comparative analysis across research papers</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Source Selector Panel */}
        <div className="glass-card p-5 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm" style={{ color: '#94a3b8' }}>
              Select Papers {sources.length > 0 && `(${selected.length}/${sources.length})`}
            </h3>
            {sources.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  title="Select All"
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
                >
                  <CheckCheck size={12} /> All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  title="Clear All"
                  className="text-xs text-slate-400 hover:text-slate-300 transition-colors flex items-center gap-1"
                >
                  <XSquare size={12} /> None
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2 mb-4 max-h-80 overflow-y-auto pr-1">
            {/* 1. Loading State */}
            {loadingSources && (
              <div className="py-8 flex flex-col items-center justify-center text-center">
                <RefreshCw size={22} className="animate-spin text-indigo-400 mb-2" />
                <p className="text-xs text-slate-400">Loading sources...</p>
              </div>
            )}

            {/* 2. Error State */}
            {!loadingSources && sourceError && (
              <div className="py-5 px-3 rounded-lg text-center" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertCircle size={20} className="text-red-400 mx-auto mb-2" />
                <p className="text-xs text-red-200 mb-2 font-medium">{sourceError}</p>
                <button
                  type="button"
                  onClick={fetchSources}
                  className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 underline font-medium"
                >
                  <RotateCcw size={12} /> Retry
                </button>
              </div>
            )}

            {/* 3. Empty State */}
            {!loadingSources && !sourceError && sources.length === 0 && (
              <div className="py-8 px-3 flex flex-col items-center justify-center text-center">
                <FileText size={32} className="text-slate-600 mb-2" />
                <p className="text-xs font-semibold text-slate-300 mb-1">No research sources found.</p>
                <p className="text-xs text-slate-500 mb-4">Add a source to begin.</p>
                <Link
                  to="/dashboard"
                  className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1"
                >
                  Upload Documents →
                </Link>
              </div>
            )}

            {/* 4. Loaded State: List of Sources */}
            {!loadingSources &&
              !sourceError &&
              sources.map((s) => {
                const isSelected = selected.includes(String(s.id));
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSource(s.id)}
                    className="flex items-start gap-3 w-full p-3 rounded-lg text-left transition-all"
                    style={{
                      background: isSelected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isSelected ? 'rgba(99,102,241,0.45)' : 'rgba(99,102,241,0.1)'}`,
                    }}
                  >
                    <div className="pt-0.5 shrink-0">
                      {isSelected ? (
                        <CheckSquare size={16} style={{ color: '#818cf8' }} />
                      ) : (
                        <Square size={16} style={{ color: '#64748b' }} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium block truncate" style={{ color: '#f1f5f9' }}>
                        {s.title}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="badge badge-primary text-[10px] uppercase">
                          {s.source_type || 'Paper'}
                        </span>
                        {s.file_size > 0 && (
                          <span className="text-[10px] text-slate-500">
                            {(s.file_size / 1024).toFixed(0)} KB
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>

          {/* Compare Button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loadingMatrix || loadingSources || selected.length < 2}
            className={`btn-primary w-full justify-center text-sm ${
              selected.length < 2 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loadingMatrix ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Comparing...</span>
              </>
            ) : (
              <>
                <Table2 size={14} />
                <span>Compare ({selected.length})</span>
              </>
            )}
          </button>

          {/* Validation guidance note when < 2 selected */}
          {selected.length < 2 && sources.length > 0 && (
            <p className="text-[12px] text-center mt-2.5 font-medium text-amber-400/90 flex items-center justify-center gap-1.5">
              <AlertCircle size={13} className="shrink-0" />
              <span>Select at least 2 research papers to compare.</span>
            </p>
          )}
        </div>

        {/* Matrix Output Panel */}
        <div className="lg:col-span-3">
          {/* In-Flight Generation */}
          {loadingMatrix ? (
            <div className="glass-card flex flex-col items-center justify-center p-8" style={{ minHeight: 400 }}>
              <RefreshCw size={36} className="animate-spin text-indigo-400 mb-4" />
              <p className="font-semibold text-base mb-1" style={{ color: '#f1f5f9' }}>
                Analyzing Selected Papers...
              </p>
              <p className="text-xs text-slate-400">
                Extracting methodology, datasets, empirical results, and research limitations
              </p>
            </div>
          ) : matrixError ? (
            <div className="glass-card flex flex-col items-center justify-center p-8 text-center" style={{ minHeight: 400 }}>
              <AlertCircle size={40} className="text-red-400 mb-3" />
              <p className="font-semibold text-base text-red-200 mb-1">Comparison Failed</p>
              <p className="text-xs text-slate-400 max-w-md mb-4">{matrixError}</p>
              <button
                type="button"
                onClick={handleGenerate}
                className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-2"
              >
                <RotateCcw size={14} /> Retry Comparison
              </button>
            </div>
          ) : matrix.length === 0 ? (
            <div className="glass-card flex flex-col items-center justify-center text-center p-8" style={{ minHeight: 400 }}>
              <Database size={48} style={{ color: '#334155' }} className="mb-4" />
              <p className="font-semibold mb-1" style={{ color: '#64748b' }}>
                {sources.length === 0 ? 'No papers available yet' : 'No comparison generated yet'}
              </p>
              <p className="text-sm text-slate-500 max-w-sm mb-4">
                {sources.length === 0
                  ? 'Upload your first research paper from the Dashboard to start building research matrices.'
                  : 'Select at least 2 papers from the left panel and click "Compare" to view a structured side-by-side analysis.'}
              </p>
              {sources.length === 0 ? (
                <Link to="/dashboard" className="btn-primary text-xs px-4 py-2">
                  Go to Dashboard →
                </Link>
              ) : (
                selected.length >= 2 && (
                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-2"
                  >
                    <Table2 size={14} /> Compare Selected Papers Now
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Comparative Field Cards */}
              {FIELDS.map((field) => (
                <motion.div
                  key={field}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedField(expandedField === field ? null : field)}
                    className="w-full flex items-center justify-between p-5 text-left transition-colors hover:bg-white/[0.02]"
                    style={{
                      borderBottom: expandedField === field ? '1px solid rgba(99,102,241,0.15)' : 'none',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ background: FIELD_COLORS[field] }} />
                      <span className="font-semibold capitalize text-base" style={{ color: '#f1f5f9' }}>
                        {field}
                      </span>
                      <span className="badge badge-primary">{matrix.length} papers</span>
                    </div>
                    {expandedField === field ? (
                      <ChevronUp size={18} style={{ color: '#64748b' }} />
                    ) : (
                      <ChevronDown size={18} style={{ color: '#64748b' }} />
                    )}
                  </button>

                  <AnimatePresence>
                    {expandedField === field && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                      >
                        <div
                          className="grid gap-4 p-5"
                          style={{
                            gridTemplateColumns: `repeat(${Math.min(matrix.length, 3)}, minmax(0, 1fr))`,
                          }}
                        >
                          {matrix.map((paper) => (
                            <div
                              key={paper.id}
                              className="p-4 rounded-xl flex flex-col justify-between"
                              style={{
                                background: 'rgba(99,102,241,0.06)',
                                border: '1px solid rgba(99,102,241,0.12)',
                              }}
                            >
                              <div>
                                <p
                                  className="font-semibold text-sm mb-2 line-clamp-2"
                                  style={{ color: FIELD_COLORS[field] }}
                                  title={paper.title}
                                >
                                  {paper.title}
                                </p>
                                <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
                                  {paper[field] || 'Not specified'}
                                </p>
                              </div>
                              {paper.keywords?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-indigo-500/10">
                                  {paper.keywords.slice(0, 3).map((kw) => (
                                    <span key={kw} className="badge badge-primary text-[10px]">
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}

              {/* Summary Overview Table */}
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-base" style={{ color: '#f1f5f9' }}>
                    Paper Overview Matrix
                  </h3>
                  <span className="text-xs text-slate-400">
                    Comparing {matrix.length} paper{matrix.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
                        <th className="text-left py-2.5 pr-4 text-xs font-semibold" style={{ color: '#64748b' }}>
                          Paper
                        </th>
                        <th className="text-left py-2.5 pr-4 text-xs font-semibold" style={{ color: '#64748b' }}>
                          Type
                        </th>
                        <th className="text-left py-2.5 pr-4 text-xs font-semibold" style={{ color: '#64748b' }}>
                          Year
                        </th>
                        <th className="text-left py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>
                          Summary
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.map((paper) => (
                        <tr
                          key={paper.id}
                          className="hover:bg-white/[0.01] transition-colors"
                          style={{ borderBottom: '1px solid rgba(99,102,241,0.07)' }}
                        >
                          <td className="py-3 pr-4 font-medium text-xs text-slate-100" style={{ maxWidth: 200 }}>
                            <span className="block truncate" title={paper.title}>
                              {paper.title}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="badge badge-primary text-[11px]">
                              {paper.research_type || 'Paper'}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-xs text-slate-400">
                            {paper.year || '—'}
                          </td>
                          <td className="py-3 text-xs leading-relaxed text-slate-300" style={{ maxWidth: 360 }}>
                            {paper.abstract_summary ? (
                              <p className="line-clamp-2" title={paper.abstract_summary}>
                                {paper.abstract_summary}
                              </p>
                            ) : (
                              <span className="text-slate-500 italic">No summary parsed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
