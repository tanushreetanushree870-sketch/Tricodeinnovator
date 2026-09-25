import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Crown, Medal, Star, TrendingUp, Zap, RefreshCw, TreePine, AlertCircle } from 'lucide-react';
import { courseAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const TIER_CONFIG = {
  Diamond: { color: '#b9f2ff', bg: 'rgba(185,242,255,0.1)', border: 'rgba(185,242,255,0.3)', icon: '💎', rank: 4 },
  Gold: { color: '#ffd700', bg: 'rgba(255,215,0,0.1)', border: 'rgba(255,215,0,0.3)', icon: '🥇', rank: 3 },
  Silver: { color: '#c0c0c0', bg: 'rgba(192,192,192,0.1)', border: 'rgba(192,192,192,0.3)', icon: '🥈', rank: 2 },
  Bronze: { color: '#cd7f32', bg: 'rgba(205,127,50,0.1)', border: 'rgba(205,127,50,0.3)', icon: '🥉', rank: 1 },
};

const RankIcon = ({ rank }) => {
  if (rank === 1) return <Crown size={16} style={{ color: '#ffd700' }} />;
  if (rank === 2) return <Medal size={16} style={{ color: '#c0c0c0' }} />;
  if (rank === 3) return <Medal size={16} style={{ color: '#cd7f32' }} />;
  return <span className="text-xs font-bold" style={{ color: '#64748b' }}>{rank}</span>;
};

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTier, setActiveTier] = useState('Diamond');
  const { user } = useAuth();

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('[Leaderboard] Current user ID:', user?.id);
      console.log('[Leaderboard] Fetching leaderboard...');
      const res = await courseAPI.getLeaderboard();
      console.log('[Leaderboard] API status:', res.status);
      const data = res.data?.data;
      console.log('[Leaderboard] Number of leaderboard entries:', data?.total_users || 0);
      console.log('[Leaderboard] Current user XP:', data?.current_user_rank?.total_xp);
      console.log('[Leaderboard] Weekly XP:', data?.current_user_rank?.weekly_xp);
      console.log('[Leaderboard] Tier:', data?.current_user_rank?.league_tier);

      setLeaderboard(data);

      // If user's tier has researchers or Diamond is empty, focus user's tier
      if (data?.current_user_rank?.league_tier) {
        const userTier = data.current_user_rank.league_tier;
        const diamondCount = data?.leaderboard?.Diamond?.length || 0;
        if (diamondCount === 0) {
          setActiveTier(userTier);
        }
      }
    } catch (err) {
      console.error('[Leaderboard] Failed to fetch leaderboard:', err);
      setError(err.response?.data?.message || 'Unable to load leaderboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [user?.id]);

  useEffect(() => {
    if (leaderboard) {
      console.log(`[Leaderboard] Final ranked entries (${activeTier}):`, leaderboard?.leaderboard?.[activeTier] || []);
    }
  }, [leaderboard, activeTier]);

  const tierOrder = ['Diamond', 'Gold', 'Silver', 'Bronze'];
  const currentTierData = leaderboard?.leaderboard?.[activeTier] || [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold gradient-text" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Weekly Leaderboard
          </h1>
          <p style={{ color: '#64748b' }}>Top researchers ranked by weekly XP</p>
        </div>
        <button onClick={fetchLeaderboard} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all"
          style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </motion.div>

      {/* Tier Tabs */}
      <div className="flex gap-3 mb-6 overflow-x-auto pb-1">
        {tierOrder.map(tier => {
          const cfg = TIER_CONFIG[tier];
          const count = leaderboard?.leaderboard?.[tier]?.length || 0;
          return (
            <button key={tier} onClick={() => setActiveTier(tier)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shrink-0 transition-all"
              style={{
                background: activeTier === tier ? cfg.bg : 'rgba(255,255,255,0.02)',
                color: activeTier === tier ? cfg.color : '#64748b',
                border: `1px solid ${activeTier === tier ? cfg.border : 'rgba(99,102,241,0.08)'}`,
              }}>
              {cfg.icon} {tier}
              <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'rgba(255,255,255,0.1)' }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Tier Threshold Info */}
      {leaderboard?.tier_thresholds && (
        <div className="glass-card p-4 mb-6 flex flex-wrap gap-4">
          {Object.entries(leaderboard.tier_thresholds).map(([tier, threshold]) => {
            const cfg = TIER_CONFIG[tier];
            return (
              <div key={tier} className="flex items-center gap-2 text-xs">
                <span>{cfg.icon}</span>
                <span style={{ color: cfg.color }} className="font-medium">{tier}:</span>
                <span style={{ color: '#64748b' }}>{threshold}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Leaderboard Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
          <Trophy size={18} style={{ color: TIER_CONFIG[activeTier].color }} />
          <span className="font-bold" style={{ color: '#f1f5f9' }}>{activeTier} League</span>
          <span className="badge badge-primary ml-auto">{currentTierData.length} researchers</span>
        </div>

        {loading ? (
          <div className="p-12 text-center space-y-4">
            <RefreshCw size={28} className="animate-spin text-indigo-400 mx-auto" />
            <p className="text-sm text-slate-400">Loading leaderboard...</p>
            <div className="space-y-3 max-w-lg mx-auto pt-2">
              {[1, 2, 3].map(i => <div key={i} className="shimmer h-12 rounded-xl" />)}
            </div>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <AlertCircle size={36} className="text-red-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-red-200 mb-1">Unable to load leaderboard.</p>
            <p className="text-xs text-slate-400 mb-4">{error}</p>
            <button
              type="button"
              onClick={fetchLeaderboard}
              className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
            >
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        ) : currentTierData.length === 0 ? (
          <div className="p-12 text-center">
            <Trophy size={40} style={{ color: '#334155' }} className="mx-auto mb-3" />
            <p style={{ color: '#64748b' }}>No researchers in {activeTier} tier yet</p>
          </div>
        ) : (
          <div>
            {currentTierData.map((entry, i) => {
              const isCurrentUser =
                (entry.user_id && user?.id && entry.user_id === user.id) ||
                (entry.email && user?.email && entry.email === user.email.replace(/(.{2}).*@/, '$1***@'));
              return (
                <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-4 px-5 py-4 transition-all"
                  style={{
                    borderBottom: '1px solid rgba(99,102,241,0.06)',
                    background: isCurrentUser ? 'rgba(99,102,241,0.08)' : 'transparent',
                  }}>
                  {/* Rank */}
                  <div className="w-8 flex items-center justify-center shrink-0">
                    <RankIcon rank={entry.rank_in_tier} />
                  </div>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                    style={{ background: TIER_CONFIG[activeTier].bg, color: TIER_CONFIG[activeTier].color, border: `1px solid ${TIER_CONFIG[activeTier].border}` }}>
                    {entry.full_name?.charAt(0)?.toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: isCurrentUser ? '#818cf8' : '#f1f5f9' }}>
                      {entry.full_name}
                      {isCurrentUser && <span className="ml-2 text-xs" style={{ color: '#6366f1' }}>(You)</span>}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs" style={{ color: '#64748b' }}>Lv.{entry.current_level}</span>
                      <span className="flex items-center gap-1 text-xs" style={{ color: '#10b981' }}>
                        <TreePine size={10} /> {entry.trees_grown}
                      </span>
                    </div>
                  </div>

                  {/* XP Stats */}
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 justify-end">
                      <Zap size={12} style={{ color: '#fbbf24' }} />
                      <span className="font-bold text-sm" style={{ color: '#fbbf24' }}>
                        {entry.weekly_xp.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: '#64748b' }}>weekly XP</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
