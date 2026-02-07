import { useState, useEffect, memo, useRef, useCallback, Component } from "react";

// --- ERROR BOUNDARY ---
// Prevents a single card crash from taking down the whole dashboard
class CardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error(`[${this.props.label || 'Card'}] render error:`, error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rem-card" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80, color: P.textMuted, fontSize: 14, fontStyle: "italic" }}>
          {this.props.label || 'Section'} failed to render
        </div>
      );
    }
    return this.props.children;
  }
}

// --- PALETTE --- (Midnight Pastel Blue)
const P = {
  bg: "#1a2744",
  bgCard: "rgba(30,45,75,0.85)",
  bgCardHover: "rgba(40,60,95,0.9)",
  primary: "#7ba3f7",
  primarySoft: "#5a7fd4",
  primaryPale: "#2d4a7a",
  primaryGlow: "rgba(123,163,247,0.3)",
  accent: "#f4a6c1",
  accentSoft: "#c47a95",
  warm: "#f7c97e",
  warmSoft: "#c9a05a",
  success: "#7ecba1",
  successSoft: "#5a9975",
  text: "#e8eef8",
  textMuted: "#a8b8d8",
  textFaint: "#6880a8",
  border: "rgba(123,163,247,0.2)",
  borderStrong: "rgba(123,163,247,0.4)",
};

// --- PETAL TOKEN VISUALIZATION ---
const PetalRing = memo(function PetalRing({ used, limit, label, size = 100 }) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const petals = 20;
  const activePetals = Math.round((percentage / 100) * petals);
  const remaining = limit - used;
  const remainK = limit === 0 ? '—' : remaining >= 1000 ? `${(remaining / 1000).toFixed(1)}k` : remaining;

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;

  const getColor = (pct) => {
    if (pct < 50) return P.primary;
    if (pct < 75) return P.warm;
    if (pct < 90) return P.accent;
    return "#e86b8a";
  };

  const color = getColor(percentage);
  const softColor = percentage < 50 ? P.primaryPale : percentage < 75 ? P.warmSoft : P.accentSoft;
  // Sanitize label for SVG filter ID (alphanumeric + dash only)
  const filterId = `soft-glow-${label.replace(/[^a-zA-Z0-9-]/g, '')}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <filter id={filterId}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background circle */}
        <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke={P.primaryPale} strokeWidth="0.5" />

        {/* Petal segments */}
        {Array.from({ length: petals }).map((_, i) => {
          const angle = (i / petals) * Math.PI * 2 - Math.PI / 2;
          const petalLen = size * 0.12;
          const petalW = size * 0.035;

          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r;
          const tipX = cx + Math.cos(angle) * (r + petalLen);
          const tipY = cy + Math.sin(angle) * (r + petalLen);

          const perpX = Math.cos(angle + Math.PI / 2) * petalW;
          const perpY = Math.sin(angle + Math.PI / 2) * petalW;

          const isActive = i < activePetals;

          return (
            <path
              key={i}
              d={`M ${px + perpX} ${py + perpY} Q ${tipX} ${tipY} ${px - perpX} ${py - perpY}`}
              fill={isActive ? color : P.primaryPale}
              opacity={isActive ? 0.8 : 0.3}
              style={{
                filter: isActive ? `url(#${filterId})` : "none",
                transition: "all 0.6s ease",
              }}
            />
          );
        })}

        {/* Center fill */}
        <circle cx={cx} cy={cy} r={r - 4} fill={softColor} opacity="0.3" />

        {/* Center text */}
        <text x={cx} y={cy - 5} textAnchor="middle" fill={color} fontSize={size * 0.17} fontFamily="'Quicksand', sans-serif" fontWeight="700">
          {remainK}
        </text>
        <text x={cx} y={cy + 9} textAnchor="middle" fill={P.text} fontSize={size * 0.085} fontFamily="'Quicksand', sans-serif" fontWeight="500">
          remaining
        </text>
        <text x={cx} y={cy + 21} textAnchor="middle" fill={color} fontSize={size * 0.095} fontFamily="'Quicksand', sans-serif" fontWeight="600" opacity="0.7">
          {percentage.toFixed(0)}% used
        </text>
      </svg>
      <span style={{
        fontSize: 16,
        color: P.textMuted,
        fontFamily: "'Quicksand', sans-serif",
        fontWeight: 600,
        letterSpacing: 1.5,
        textTransform: "uppercase",
      }}>
        {label}
      </span>
    </div>
  );
});

// --- STATUS INDICATOR ---
function StatusDot({ status, size = 7 }) {
  const colors = {
    active: P.primary,
    running: P.primary,
    idle: P.textFaint,
    cooldown: P.warm,
    error: P.accent,
  };
  const c = colors[status] || P.textFaint;
  const pulse = status === "active" || status === "running";

  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: c,
        boxShadow: pulse ? `0 0 8px ${c}40, 0 0 16px ${c}20` : "none",
        animation: pulse ? "gentlePulse 2s ease-in-out infinite" : "none",
        flexShrink: 0,
      }}
    />
  );
}

// --- SECTION HEADER ---
function SectionHeader({ emoji, title }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 9,
      marginBottom: 12,
      paddingBottom: 6,
      borderBottom: `1.5px solid ${P.primaryPale}`,
    }}>
      <span style={{ fontSize: 12 }}>{emoji}</span>
      <span style={{
        fontSize: 23,
        fontFamily: "'Quicksand', sans-serif",
        color: P.primary,
        fontWeight: 700,
        letterSpacing: 1.5,
        textTransform: "uppercase",
      }}>
        {title}
      </span>
    </div>
  );
}

// --- Scale constants (avoids sub-pixel rounding gaps) ---
const SCALE = 1.1;
const INNER_W = Math.round(1280 / SCALE);
const INNER_H = Math.round(720 / SCALE);

// --- MAIN DASHBOARD ---
export default function RemDashboard() {
  const [time, setTime] = useState(new Date());

  // Live data state
  const [tokens, setTokens] = useState({ sessionUsed: 0, sessionLimit: 0, weeklyUsed: 0, weeklyLimit: 0, costUsd: 0 });
  const [cronJobs, setCronJobs] = useState([]);
  const [activity, setActivity] = useState([]);
  const [system, setSystem] = useState({ memory: {}, cpu: {}, hostname: '' });
  const [mainAgent, setMainAgent] = useState({ name: "", status: "idle", currentTask: "", uptime: "", tasksCompleted: 0 });
  const [subAgents, setSubAgents] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Initial data fetch (one-time, SSE handles updates after this)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/status');
        const data = await res.json();
        if (data.tokens) setTokens(data.tokens);
        if (data.cronJobs) setCronJobs(data.cronJobs);
        if (data.activity) setActivity(data.activity);
        if (data.system) setSystem(data.system);
        if (data.mainAgent) setMainAgent(data.mainAgent);
        setSubAgents(data.subAgents || []);
        setIsConnected(true);
      } catch (e) {
        setIsConnected(false);
      }
    };
    fetchData();
  }, []);

  // SSE for real-time activity and agent updates
  useEffect(() => {
    let eventSource = null;
    let reconnectTimeout = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      eventSource = new EventSource('http://localhost:3001/api/events');

      eventSource.onopen = () => {
        console.log('SSE connected');
        setIsConnected(true);
        // Re-fetch full state on reconnect to catch anything missed
        fetch('http://localhost:3001/api/status')
          .then(r => r.json())
          .then(data => {
            if (data.tokens) setTokens(data.tokens);
            if (data.cronJobs) setCronJobs(data.cronJobs);
            if (data.activity) setActivity(data.activity);
            if (data.system) setSystem(data.system);
            if (data.mainAgent) setMainAgent(data.mainAgent);
            setSubAgents(data.subAgents || []);
          })
          .catch(() => {});
      };

      eventSource.onerror = () => {
        console.log('SSE error, reconnecting...');
        setIsConnected(false);
        eventSource.close();
        // Clear any pending reconnect to prevent stacking
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connect, 2000);
      };

      // Activity updates (instant from rem-log)
      eventSource.addEventListener('activity', (e) => {
        try {
          const data = JSON.parse(e.data);
          setActivity(data);
        } catch (err) {}
      });

      // Agent state updates (instant from rem-task)
      eventSource.addEventListener('agent', (e) => {
        try {
          const data = JSON.parse(e.data);
          setMainAgent(prev => ({ ...prev, ...data }));
        } catch (err) {}
      });

      // Cron job updates
      eventSource.addEventListener('cron', (e) => {
        try {
          const data = JSON.parse(e.data);
          setCronJobs(data);
        } catch (err) {}
      });

      // Token usage updates (every 30s from server)
      eventSource.addEventListener('tokens', (e) => {
        try {
          const data = JSON.parse(e.data);
          setTokens(data);
        } catch (err) {}
      });

      // System stats updates (every 30s from server)
      eventSource.addEventListener('system', (e) => {
        try {
          const data = JSON.parse(e.data);
          setSystem(data);
        } catch (err) {}
      });

      // Sub-agent updates (every 5s from server)
      eventSource.addEventListener('subagents', (e) => {
        try {
          const data = JSON.parse(e.data);
          setSubAgents(data || []);
        } catch (err) {}
      });

      // Connection confirmed
      eventSource.addEventListener('connected', () => {
        setIsConnected(true);
      });
    };

    connect();

    return () => {
      disposed = true;
      if (eventSource) eventSource.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const formatTime = (d) => {
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  // Format activity timestamp to DD/MM HH:MM JST
  const formatActivityTime = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts.slice(0, 8); // fallback
      // Convert to JST (UTC+9)
      const jst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
      const day = jst.getUTCDate().toString().padStart(2, '0');
      const month = (jst.getUTCMonth() + 1).toString().padStart(2, '0');
      const hours = jst.getUTCHours().toString().padStart(2, '0');
      const mins = jst.getUTCMinutes().toString().padStart(2, '0');
      return `${day}/${month} ${hours}:${mins}`;
    } catch (e) {
      return ts.slice(0, 8);
    }
  };

  const greeting = (() => {
    const h = time.getHours();
    if (h < 6) return "Working late";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Night mode";
  })();

  return (
    <div style={{
      width: 1280,
      height: 720,
      background: `linear-gradient(135deg, ${P.bg} 0%, #243656 50%, #1e2d4b 100%)`,
      position: "relative",
      overflow: "hidden",
      fontFamily: "'Quicksand', sans-serif",
      color: P.text,
      fontSize: 17,
    }}>
    {/* Scaled content wrapper - 10% larger elements */}
    <div style={{
      width: INNER_W,
      height: INNER_H,
      transform: `scale(${SCALE})`,
      transformOrigin: "top left",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Google Fonts now loaded from index.html — no inline <link> */}

      <style>{`
        @keyframes gentlePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
        @keyframes floatIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes softBreathe {
          0%, 100% { opacity: 0.03; }
          50% { opacity: 0.06; }
        }
        .rem-card {
          background: rgba(30,45,75,0.85);
          backdrop-filter: blur(12px);
          border: 1.5px solid rgba(123,163,247,0.15);
          border-radius: 12px;
          padding: 10px;
          position: relative;
          animation: floatIn 0.5s ease-out;
          box-shadow: 0 2px 12px rgba(0,0,0,0.2), 0 0 0 1px rgba(123,163,247,0.1) inset;
        }
        .rem-card:hover {
          border-color: rgba(123,163,247,0.3);
          box-shadow: 0 4px 20px rgba(123,163,247,0.15), 0 0 0 1px rgba(123,163,247,0.2) inset;
        }
        .cron-row {
          display: grid;
          grid-template-columns: 10px 1fr 75px 55px 55px;
          gap: 10px;
          align-items: center;
          padding: 7px 8px;
          border-radius: 6px;
          transition: background 0.2s;
          font-size: 16px;
        }
        .cron-row:hover { background: rgba(107,138,237,0.06); }
        .agent-card {
          background: rgba(40,60,95,0.6);
          border: 1.5px solid rgba(123,163,247,0.12);
          border-radius: 10px;
          padding: 7px 9px;
          transition: all 0.3s;
        }
        .agent-card:hover {
          border-color: rgba(123,163,247,0.25);
          background: rgba(50,75,115,0.8);
          box-shadow: 0 2px 10px rgba(123,163,247,0.12);
        }
        .feed-row {
          display: flex;
          gap: 6px;
          padding: 2px 4px;
          border-radius: 4px;
          transition: background 0.15s;
        }
        .feed-row:hover { background: rgba(107,138,237,0.04); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${P.primaryPale}; border-radius: 4px; }
      `}</style>

      {/* SOFT BACKGROUND SHAPES */}
      <div style={{
        position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%",
        background: `radial-gradient(circle, ${P.primaryGlow}, transparent 70%)`,
        animation: "softBreathe 6s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: -40, left: -40, width: 160, height: 160, borderRadius: "50%",
        background: `radial-gradient(circle, rgba(244,166,193,0.12), transparent 70%)`,
        animation: "softBreathe 8s ease-in-out infinite", animationDelay: "3s",
      }} />
      <div style={{
        position: "absolute", top: "40%", left: "50%", width: 120, height: 120, borderRadius: "50%",
        background: `radial-gradient(circle, rgba(247,201,126,0.08), transparent 70%)`,
        animation: "softBreathe 7s ease-in-out infinite", animationDelay: "1.5s",
      }} />

      {/* TOP BAR */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 21px",
        borderBottom: `1.5px solid ${P.primaryPale}`,
        background: "rgba(30,45,75,0.7)",
        backdropFilter: "blur(12px)",
        position: "relative", zIndex: 2,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>🌸</span>
          <span style={{
            fontFamily: "'Comfortaa', sans-serif", fontSize: 23, fontWeight: 700,
            color: P.primary, letterSpacing: 2,
          }}>
            Rem
          </span>
          <span style={{
            fontSize: 18, padding: "2px 6px", background: P.primaryPale,
            color: P.primary, borderRadius: 12, fontWeight: 600,
          }}>
            v2.4.1
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 23, color: P.textMuted, fontWeight: 500 }}>
            {greeting}, Hazy ✨
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <StatusDot status={isConnected ? "active" : "idle"} />
            <span style={{ fontSize: 14, color: P.textMuted, fontWeight: 500 }}>{isConnected ? 'Online' : 'Connecting...'}</span>
          </div>
          {mainAgent.uptime && (
            <span style={{ fontSize: 16, color: P.textMuted }}>
              up {mainAgent.uptime}
            </span>
          )}
          <span style={{
            fontFamily: "'Comfortaa', sans-serif", fontSize: 18,
            color: P.primary, fontWeight: 700,
          }}>
            {formatTime(time)}
          </span>
        </div>
      </div>

      {/* MAIN GRID */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "360px 1fr 300px",
        gap: 12, padding: 12,
        height: "calc(100% - 42px - 26px)",
        position: "relative", zIndex: 2,
      }}>

        {/* LEFT — TOKENS + PRIMARY AGENT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>

          {/* TOKEN PETALS */}
          <CardErrorBoundary label="Token Usage">
          <div className="rem-card" style={{ flex: "0 0 auto" }}>
            <SectionHeader emoji="✿" title="Token Usage" />
            <div style={{ display: "flex", justifyContent: "center", gap: 12, padding: "2px 0" }}>
              <PetalRing used={tokens.sessionUsed} limit={tokens.sessionLimit} label="5-Hour" size={145} />
              <PetalRing used={tokens.weeklyUsed} limit={tokens.weeklyLimit} label="Weekly" size={145} />
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              padding: "5px 8px", marginTop: 9,
              background: P.primaryPale + "40", borderRadius: 12, fontSize: 16,
            }}>
              <span style={{ color: P.textMuted }}>Cost</span>
              <span style={{ color: P.warm, fontWeight: 700 }}>${tokens.costUsd.toFixed(2)}</span>
            </div>
            {tokens.ratePerMin != null && (
              <div style={{
                display: "flex", justifyContent: "space-between",
                padding: "3px 8px", fontSize: 18, color: P.textMuted,
              }}>
                <span>Rate</span>
                <span>~{tokens.ratePerMin} tok/min</span>
              </div>
            )}
          </div>
          </CardErrorBoundary>

          {/* PRIMARY AGENT */}
          <CardErrorBoundary label="Primary Agent">
          <div className="rem-card" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <SectionHeader emoji="🤖" title="Primary" />
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
              <StatusDot status={mainAgent.status} />
              <span style={{ fontSize: 17, color: P.primary, fontWeight: 700 }}>
                {mainAgent.name || 'Waiting for data...'}
              </span>
            </div>
            <div style={{ fontSize: 18, color: P.textMuted, marginBottom: 3, fontWeight: 600, letterSpacing: 0.5 }}>
              Currently doing
            </div>
            <div style={{
              fontSize: 16, color: mainAgent.currentTask ? P.text : P.textFaint, padding: "6px 8px",
              background: `linear-gradient(135deg, ${P.primaryPale}50, ${P.primaryPale}20)`,
              borderLeft: `3px solid ${P.primary}`,
              borderRadius: "0 8px 8px 0", lineHeight: 1.45, marginBottom: 15,
              fontStyle: mainAgent.currentTask ? 'normal' : 'italic',
            }}>
              {mainAgent.currentTask || 'No active task'}
            </div>
            <div style={{ fontSize: 18, color: P.textMuted, marginBottom: 3, fontWeight: 600, letterSpacing: 0.5 }}>
              Last completed
            </div>
            <div style={{
              fontSize: 16, color: mainAgent.lastTask ? P.text : P.textFaint, padding: "5px 8px",
              background: "rgba(40,60,95,0.5)",
              borderLeft: `3px solid ${P.textFaint}`,
              borderRadius: "0 8px 8px 0", lineHeight: 1.4,
              fontStyle: mainAgent.lastTask ? 'normal' : 'italic',
            }}>
              {mainAgent.lastTask || 'None yet'}
              {mainAgent.lastTaskTime && <span style={{ color: P.textMuted, marginLeft: 6, fontSize: 12 }}>· {mainAgent.lastTaskTime}</span>}
            </div>
            <div style={{
              marginTop: "auto", paddingTop: 8, paddingBottom: 12,
              display: "flex", justifyContent: "space-between",
              fontSize: 16, color: P.textMuted,
            }}>
              <span>Tasks completed: <span style={{ color: P.primary, fontWeight: 700 }}>{mainAgent.tasksCompleted}</span></span>
            </div>
          </div>
          </CardErrorBoundary>
        </div>

        {/* CENTER — CRON + ACTIVITY */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>

          {/* CRON JOBS */}
          <CardErrorBoundary label="Cron Jobs">
          <div className="rem-card" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <SectionHeader emoji="⏰" title="Cron Jobs" />
            <div style={{ flex: 1, overflow: "auto" }}>
              {/* Header */}
              <div style={{
                display: "grid", gridTemplateColumns: "10px 1fr 75px 55px 55px",
                gap: 10, padding: "2px 8px 5px",
                fontSize: 13, color: P.textMuted, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: 0.5,
                borderBottom: `1px solid ${P.primaryPale}60`, marginBottom: 3,
              }}>
                <span></span>
                <span>Job</span>
                <span>Schedule</span>
                <span>Last</span>
                <span>Next</span>
              </div>
              {cronJobs.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  color: P.textMuted,
                  fontSize: 14,
                  padding: '20px',
                  fontStyle: 'italic'
                }}>
                  No cron jobs
                </div>
              ) : (
                cronJobs.map((job) => (
                  <div key={job.id} className="cron-row">
                    <StatusDot status={job.status} size={6} />
                    <span style={{
                      color: job.status === "running" ? P.primary : P.text,
                      fontWeight: job.status === "running" ? 700 : 500,
                      fontSize: 16,
                    }}>
                      {job.name}
                    </span>
                    <span style={{ color: P.textMuted, fontSize: 16 }}>{job.schedule}</span>
                    <span style={{ color: P.textMuted, fontSize: 16 }}>{job.lastRun}</span>
                    <span style={{ color: P.warm, fontSize: 16, fontWeight: 600 }}>{job.nextRun}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          </CardErrorBoundary>

          {/* ACTIVITY FEED */}
          <CardErrorBoundary label="Activity Feed">
          <div className="rem-card" style={{ flex: 1.3, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <SectionHeader emoji="📋" title="Activity Feed" />
            <div style={{ flex: 1, overflow: "auto", fontSize: 13, lineHeight: 1.7 }}>
              {activity.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  color: P.textMuted,
                  fontSize: 14,
                  padding: '20px',
                  fontStyle: 'italic'
                }}>
                  No activity yet
                </div>
              )}
              {activity.slice(0, 6).map((entry, i) => {
                const typeColor = { success: P.success, warn: P.warm, info: P.textMuted };
                const timestamp = formatActivityTime(entry.t || entry.timestamp);
                const message = entry.msg || entry.message;
                return (
                  <div key={i} style={{
                    padding: '8px 10px',
                    marginBottom: 6,
                    background: 'rgba(40,60,95,0.5)',
                    borderRadius: 8,
                    borderLeft: `3px solid ${typeColor[entry.type] || P.primary}`
                  }}>
                    <div style={{ fontSize: 14, color: P.textMuted, fontWeight: 600, marginBottom: 3 }}>
                      {timestamp} · {entry.agent || 'SYSTEM'}
                    </div>
                    <div style={{ fontSize: 16, color: P.text, lineHeight: 1.4 }}>
                      {message}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </CardErrorBoundary>
        </div>

        {/* RIGHT — SUBAGENTS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
          <CardErrorBoundary label="Sub-Agents">
          <div className="rem-card" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <SectionHeader emoji="🫧" title="Sub-Agents" />
            <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1, overflow: "auto" }}>
              {(!subAgents || subAgents.length === 0) && (
                <div style={{
                  fontSize: 12, color: P.textMuted, textAlign: "center",
                  padding: 16, fontStyle: "italic"
                }}>
                  No sub-agents active ✨
                </div>
              )}
              {subAgents && subAgents.map((agent) => {
                const isRunning = agent.status === "running" || agent.status === "active";
                const statusColor = isRunning ? P.primary : P.textFaint;
                const statusBg = isRunning ? P.primaryPale : "rgba(180,192,216,0.2)";
                const displayName = agent.label || agent.name || agent.id?.split(':').pop()?.slice(0,8) || '?';
                const displayTask = agent.task || agent.current || 'Working...';
                return (
                  <div key={agent.id} className="agent-card">
                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 13 }}>🤖</span>
                        <StatusDot status={isRunning ? "active" : "idle"} size={6} />
                        <span style={{ fontSize: 23, fontWeight: 700, color: statusColor }}>
                          {displayName}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 17, padding: "2px 6px",
                        background: statusBg, color: statusColor,
                        borderRadius: 9, fontWeight: 600, letterSpacing: 0.5,
                      }}>
                        {isRunning ? 'running' : agent.status}
                      </span>
                    </div>
                    {/* Current task */}
                    <div style={{
                      fontSize: 14, color: P.text, padding: "4px 6px",
                      background: `${statusBg}60`,
                      borderLeft: `2.5px solid ${statusColor}`,
                      borderRadius: "0 6px 6px 0", marginBottom: 4, lineHeight: 1.35,
                    }}>
                      {displayTask}
                    </div>
                    {/* Age */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{
                        fontSize: 12, color: P.textMuted,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                      }}>
                        ⏱ {agent.age || '0m'} · {agent.model || 'claude'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <div style={{
              marginTop: 9, padding: "5px 8px",
              background: `${P.primaryPale}40`, borderRadius: 12,
              display: "flex", justifyContent: "space-between",
              fontSize: 18, color: P.textMuted, fontWeight: 500,
            }}>
              <span>Running: <span style={{ color: P.primary, fontWeight: 700 }}>{subAgents ? subAgents.filter(a => a.status === "running").length : 0}</span></span>
              <span>Total: <span style={{ color: P.text, fontWeight: 700 }}>{subAgents ? subAgents.length : 0}</span></span>
            </div>
          </div>
          </CardErrorBoundary>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "6px 21px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "rgba(20,35,60,0.8)",
        backdropFilter: "blur(8px)",
        borderTop: `1px solid ${P.border}`,
        fontSize: 18, color: P.textMuted, zIndex: 2, fontWeight: 500,
      }}>
        <span>🖥️ {system.hostname?.split('.')[0] || '—'}</span>
        <span>⏱️ {system.uptime ? `${Math.floor(system.uptime / 3600)}h ${Math.floor((system.uptime % 3600) / 60)}m` : '—'}</span>
        <span style={{ color: system.memory?.pressureColor || P.textMuted }}>{system.memory?.pressure || '—'}</span>
        <span>⚡ Load {system.cpu?.loadAvg?.['1min']?.toFixed(2) || '—'}</span>
        <span style={{ color: isConnected ? P.success : P.accent }}>
          {isConnected ? '⚡ SSE Live' : '⚠️ Offline'}
        </span>
      </div>
      </div>{/* Close scaled wrapper */}
    </div>
  );
}
