"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, CheckCircle2, ChevronRight,
  CircleHelp, Clock3, Download, Factory, FileText, Leaf,
  Plus, Ruler, Scissors, Settings2, Sparkles, Trash2, X,
  RotateCw, Layers3, Wallet, Save, History as HistoryIcon,
  Shirt, Package, Gauge, FileSpreadsheet, RefreshCw
} from "lucide-react";

type Piece = {
  id: number;
  name: string;
  width: number;
  height: number;
  qty: number;
};

type Placed = {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  rotated: boolean;
};

type SavedPlan = {
  id: string;
  name: string;
  date: string;
  unit: string;
  rollWidth: number;
  rollLength: number;
  pieces: Piece[];
  wastePct: number;
  usedLength: number;
  cost: number;
  placedCount: number;
};

const templates: Record<string, Piece[]> = {
  Custom: [
    { id: 1, name: "Front panel", width: 45, height: 60, qty: 2 },
    { id: 2, name: "Back panel", width: 50, height: 65, qty: 1 },
    { id: 3, name: "Sleeve", width: 25, height: 40, qty: 2 },
    { id: 4, name: "Pocket", width: 15, height: 18, qty: 2 },
  ],
  "T-shirt": [
    { id: 11, name: "Front body", width: 48, height: 65, qty: 1 },
    { id: 12, name: "Back body", width: 48, height: 65, qty: 1 },
    { id: 13, name: "Sleeve", width: 28, height: 24, qty: 2 },
    { id: 14, name: "Neck rib", width: 5, height: 45, qty: 1 },
  ],
  "Simple kurta": [
    { id: 21, name: "Front panel", width: 55, height: 110, qty: 1 },
    { id: 22, name: "Back panel", width: 55, height: 110, qty: 1 },
    { id: 23, name: "Sleeve", width: 28, height: 48, qty: 2 },
    { id: 24, name: "Pocket", width: 16, height: 20, qty: 2 },
  ],
  "Tote bag": [
    { id: 31, name: "Bag body", width: 38, height: 42, qty: 2 },
    { id: 32, name: "Handle", width: 8, height: 55, qty: 2 },
    { id: 33, name: "Inner pocket", width: 18, height: 20, qty: 1 },
  ],
};

const initialPieces = templates.Custom;

function expandPieces(pieces: Piece[]) {
  return pieces.flatMap((piece) =>
    Array.from({ length: Math.max(0, Math.min(50, Math.floor(piece.qty))) }, (_, i) => ({
      ...piece,
      name: piece.qty > 1 ? `${piece.name} ${i + 1}` : piece.name,
    }))
  );
}

/**
 * A deterministic shelf-packing heuristic.
 * It is an estimate, not an optimal nesting solver.
 */
function arrange(
  pieces: Piece[],
  rollWidth: number,
  rollLength: number,
  optimized: boolean,
  allowRotation: boolean
) {
  const expanded = expandPieces(pieces).filter(
    (p) => p.width > 0 && p.height > 0
  );

  if (optimized) {
    expanded.sort(
      (a, b) =>
        Math.max(b.width, b.height) - Math.max(a.width, a.height) ||
        b.width * b.height - a.width * a.height
    );
  }

  const placed: Placed[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  for (const piece of expanded) {
    const orientations = allowRotation
      ? [
          { w: piece.width, h: piece.height, rotated: false },
          { w: piece.height, h: piece.width, rotated: true },
        ]
      : [{ w: piece.width, h: piece.height, rotated: false }];

    let chosen = orientations.find(
      (o) => x + o.w <= rollWidth && y + o.h <= rollLength
    );

    if (!chosen) {
      const nextY = y + rowHeight;
      chosen = orientations.find(
        (o) => o.w <= rollWidth && nextY + o.h <= rollLength
      );
      if (chosen) {
        x = 0;
        y = nextY;
        rowHeight = 0;
      }
    }

    if (!chosen) continue;

    placed.push({
      x, y, w: chosen.w, h: chosen.h,
      name: piece.name, rotated: chosen.rotated,
    });

    x += chosen.w;
    rowHeight = Math.max(rowHeight, chosen.h);
  }

  const usedArea = placed.reduce((sum, p) => sum + p.w * p.h, 0);
  const usedLength = placed.reduce((max, p) => Math.max(max, p.y + p.h), 0);
  const totalArea = Math.max(0, rollWidth * rollLength);
  const wasteArea = Math.max(0, totalArea - usedArea);

  return {
    placed,
    usedArea,
    usedLength,
    totalArea,
    wasteArea,
    wastePct: totalArea > 0 ? (wasteArea / totalArea) * 100 : 0,
    utilization: totalArea > 0 ? (usedArea / totalArea) * 100 : 0,
  };
}

function Metric({
  label, value, suffix, icon: Icon, detail,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon: typeof Ruler;
  detail: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon"><Icon size={18} /></span>
      </div>
      <div className="metric-value">{value}<small>{suffix}</small></div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}

export default function Home() {
  const [rollWidth, setRollWidth] = useState(150);
  const [rollLength, setRollLength] = useState(300);
  const [unit, setUnit] = useState("cm");
  const [pieces, setPieces] = useState<Piece[]>(initialPieces);
  const [activeTab, setActiveTab] = useState("Overview");
  const [optimized, setOptimized] = useState(true);
  const [allowRotation, setAllowRotation] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [template, setTemplate] = useState("Custom");
  const [costPerMeter, setCostPerMeter] = useState(120);
  const [currency, setCurrency] = useState("INR");
  const [history, setHistory] = useState<SavedPlan[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [planName, setPlanName] = useState("");
  const [newPiece, setNewPiece] = useState({
    name: "", width: 20, height: 20, qty: 1,
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("napasathi-plans-v1");
      if (saved) setHistory(JSON.parse(saved) as SavedPlan[]);
    } catch {
      // Ignore corrupted local browser data; the planner remains usable.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem("napasathi-plans-v1", JSON.stringify(history));
    }
  }, [history, hydrated]);

  const baseline = useMemo(
    () => arrange(pieces, rollWidth, rollLength, false, allowRotation),
    [pieces, rollWidth, rollLength, allowRotation]
  );

  const plan = useMemo(
    () => arrange(pieces, rollWidth, rollLength, optimized, allowRotation),
    [pieces, rollWidth, rollLength, optimized, allowRotation]
  );

  const quantity = pieces.reduce(
    (sum, piece) => sum + Math.max(0, Math.min(50, Math.floor(piece.qty || 0))),
    0
  );

  const lengthInMeters = (length: number) =>
    length * (unit === "cm" ? 0.01 : unit === "mm" ? 0.001 : 0.0254);

  const areaInSquareMeters = (area: number) => {
    const factor = unit === "cm" ? 0.01 : unit === "mm" ? 0.001 : 0.0254;
    return area * factor * factor;
  };

  const cost = lengthInMeters(plan.usedLength) * Math.max(0, costPerMeter);
  const baselineCost = lengthInMeters(baseline.usedLength) * Math.max(0, costPerMeter);
  const savings = baseline.wasteArea > 0
    ? ((baseline.wasteArea - plan.wasteArea) / baseline.wasteArea) * 100
    : 0;

  const scale = Math.min(
    900 / Math.max(rollWidth, 1),
    620 / Math.max(rollLength, 1)
  );
  const svgWidth = Math.max(1, rollWidth * scale);
  const svgHeight = Math.max(1, rollLength * scale);

  function updatePiece(id: number, key: keyof Piece, value: string) {
    setPieces((old) => old.map((piece) => {
      if (piece.id !== id) return piece;
      if (key === "name") return { ...piece, name: value };
      const max = key === "qty" ? 50 : 100000;
      return {
        ...piece,
        [key]: Math.max(key === "qty" ? 0 : 0, Math.min(max, Number(value) || 0)),
      };
    }));
  }

  function addPiece() {
    if (
      !newPiece.name.trim() ||
      newPiece.width <= 0 ||
      newPiece.height <= 0 ||
      newPiece.qty < 1
    ) {
      setNotice("Piece ka naam aur valid dimensions enter karo.");
      return;
    }
    setPieces((old) => [...old, {
      ...newPiece,
      id: Date.now(),
      name: newPiece.name.trim(),
      qty: Math.min(50, Math.floor(newPiece.qty)),
    }]);
    setNewPiece({ name: "", width: 20, height: 20, qty: 1 });
    setShowForm(false);
    setNotice("Pattern piece add ho gaya.");
  }

  function loadTemplate(name: string) {
    setTemplate(name);
    setPieces(templates[name].map((piece) => ({ ...piece })));
    setNotice(`${name} template load ho gaya. Dimensions apne design ke hisaab se verify karein.`);
  }

  function savePlan() {
    const entry: SavedPlan = {
      id: crypto.randomUUID(),
      name: planName.trim() || `Cutting plan ${history.length + 1}`,
      date: new Date().toLocaleString(),
      unit,
      rollWidth,
      rollLength,
      pieces: pieces.map((piece) => ({ ...piece })),
      wastePct: Number(plan.wastePct.toFixed(2)),
      usedLength: Number(plan.usedLength.toFixed(2)),
      cost: Number(cost.toFixed(2)),
      placedCount: plan.placed.length,
    };
    setHistory((old) => [entry, ...old].slice(0, 100));
    setPlanName("");
    setNotice("Plan is browser mein save ho gaya. Yeh device/browser ke local storage mein rahega.");
  }

  function restorePlan(saved: SavedPlan) {
    setRollWidth(saved.rollWidth);
    setRollLength(saved.rollLength);
    setUnit(saved.unit);
    setPieces(saved.pieces.map((piece) => ({ ...piece })));
    setActiveTab("Planner");
    setNotice(`"${saved.name}" restore ho gaya.`);
  }

  function exportReport(format: "txt" | "csv" = "txt") {
    const rows = [
      ["NapaSathi AI Cutting Report", ""],
      ["Plan name", planName || "Untitled plan"],
      ["Date", new Date().toISOString()],
      ["Roll width", `${rollWidth} ${unit}`],
      ["Roll length", `${rollLength} ${unit}`],
      ["Requested pieces", String(quantity)],
      ["Placed pieces", String(plan.placed.length)],
      ["Unplaced pieces", String(Math.max(0, quantity - plan.placed.length))],
      ["Total roll area (m²)", areaInSquareMeters(plan.totalArea).toFixed(4)],
      ["Used piece area (m²)", areaInSquareMeters(plan.usedArea).toFixed(4)],
      ["Estimated unused area (m²)", areaInSquareMeters(plan.wasteArea).toFixed(4)],
      ["Estimated utilization (%)", plan.utilization.toFixed(2)],
      ["Estimated waste (%)", plan.wastePct.toFixed(2)],
      ["Estimated material cost", `${currency} ${cost.toFixed(2)}`],
      ["Material price per linear metre", `${currency} ${costPerMeter}`],
      ["Layout mode", optimized ? "Area-sorted heuristic" : "Input-order baseline"],
      ["Rotation allowed", allowRotation ? "Yes" : "No"],
      [],
      ["Piece", "X", "Y", "Width", "Height", "Rotated"],
      ...plan.placed.map((piece) => [
        piece.name, piece.x, piece.y, piece.w, piece.h,
        piece.rotated ? "Yes" : "No",
      ]),
      [],
      ["Limitations", "Approximate shelf-packing estimate; not guaranteed optimal."],
      ["Important", "Verify measurements, grain direction, seam allowances and cutting safety before production."],
    ];

    const content = format === "csv"
      ? rows.map((row) => row.map((value) =>
          `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(",")).join("\r\n")
      : rows.map((row) => row.join(": ")).join("\n");

    const blob = new Blob([content], {
      type: format === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `napasathi-report.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`${format.toUpperCase()} report export ho gaya.`);
  }

  function deletePlan(id: string) {
    setHistory((old) => old.filter((item) => item.id !== id));
    setNotice("Saved plan delete ho gaya.");
  }

  function resetPieces() {
    loadTemplate("Custom");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a href="#workspace" className="brand">
          <span className="brand-symbol"><Scissors size={22} /></span>
          <span>Napa<span className="brand-green">Sathi</span><small>MEASURE SMARTER</small></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {[
            { name: "Overview", icon: Activity },
            { name: "Planner", icon: Scissors },
            { name: "Measurements", icon: Ruler },
            { name: "History", icon: Clock3 },
          ].map((item) => (
            <button
              key={item.name}
              className={`nav-item ${activeTab === item.name ? "active" : ""}`}
              onClick={() => setActiveTab(item.name)}
              aria-current={activeTab === item.name ? "page" : undefined}
            >
              <item.icon size={18} />{item.name}
              {item.name === "Planner" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="impact-card">
            <div className="impact-icon"><Leaf size={19} /></div>
            <strong>Small cuts.<br />Big impact.</strong>
            <p>Plan material thoughtfully. Check every measurement before cutting.</p>
            <div className="impact-line"><span /></div>
            <small>BUILT FOR MAKERS</small>
          </div>
          <div className="user-profile">
            <div className="avatar">NS</div>
            <div><strong>NapaSathi AI</strong><small>Local workspace</small></div>
            <Settings2 size={17} className="user-settings" />
          </div>
        </div>
      </aside>

      <section className="main-area" id="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span><ChevronRight size={14} /><strong>{activeTab}</strong>
          </div>
          <div className="topbar-right">
            <span className="status-pill"><span /> Local prototype</span>
            <button className="icon-button" aria-label="Help" onClick={() =>
              setNotice("Set your roll dimensions, add pattern pieces and compare the estimated layout.")
            }><CircleHelp size={19} /></button>
            <div className="avatar avatar-small">NS</div>
          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow"><Sparkles size={14} /> SMART MATERIAL PLANNING</div>
              <h1>
                {activeTab === "Planner" ? "Your cutting studio."
                  : activeTab === "Measurements" ? "Measurements that matter."
                  : activeTab === "History" ? "Your saved plans."
                  : "Make every inch count."}
              </h1>
              <p className="page-subtitle">
                Plan fabric, compare layouts, estimate cost and make informed cutting decisions.
              </p>
            </div>
            <div className="welcome-actions">
              <button className="button button-outline" onClick={() => exportReport("csv")}>
                <FileSpreadsheet size={16} /> Export CSV
              </button>
              <button className="button button-primary" onClick={savePlan}>
                <Save size={16} /> Save plan
              </button>
            </div>
          </div>

          {notice && (
            <div className="notice" role="status">
              <CheckCircle2 size={17} /> <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button>
            </div>
          )}

          <div className="metric-grid">
            <Metric label="Fabric area" value={areaInSquareMeters(plan.totalArea).toFixed(2)} suffix=" m²" icon={Ruler} detail={`${rollWidth} × ${rollLength} ${unit}`} />
            <Metric label="Pieces placed" value={String(plan.placed.length)} suffix={` / ${quantity}`} icon={CheckCircle2} detail={plan.placed.length === quantity ? "All requested pieces placed" : "Review unplaced pieces"} />
            <Metric label="Estimated waste" value={plan.wastePct.toFixed(1)} suffix="%" icon={Leaf} detail={`${areaInSquareMeters(plan.wasteArea).toFixed(2)} m² unused area`} />
            <Metric label="Utilization" value={plan.utilization.toFixed(1)} suffix="%" icon={Gauge} detail="Piece area ÷ full roll area" />
          </div>

          {activeTab === "History" ? (
            <section className="panel history-panel">
              <div className="panel-heading">
                <div><h2><HistoryIcon size={17} /> Saved plans</h2><p>Saved in this browser using local storage.</p></div>
                <Clock3 size={20} />
              </div>
              {!history.length ? (
                <div className="empty-state">
                  <Clock3 size={30} /><strong>No saved plans yet</strong>
                  <p>Create a cutting plan and press Save plan.</p>
                  <button className="button button-primary" onClick={() => setActiveTab("Planner")}>Open planner</button>
                </div>
              ) : history.map((saved) => (
                <div className="history-row" key={saved.id}>
                  <span className="history-file"><FileText size={19} /></span>
                  <div><strong>{saved.name}</strong><small>{saved.date} · {saved.rollWidth} × {saved.rollLength} {saved.unit}</small></div>
                  <span className="history-waste">{saved.wastePct}% waste</span>
                  <button className="button button-outline" onClick={() => restorePlan(saved)}>Restore</button>
                  <button className="remove-piece" aria-label={`Delete ${saved.name}`} onClick={() => deletePlan(saved.id)}><Trash2 size={15} /></button>
                </div>
              ))}
            </section>
          ) : activeTab === "Measurements" ? (
            <div className="feature-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div><h2><Ruler size={17} /> Measurement studio</h2><p>Use one consistent unit for all dimensions.</p></div>
                  <Settings2 size={20} />
                </div>
                <div className="roll-fields">
                  <label>Measurement unit
                    <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                      <option value="cm">Centimetres (cm)</option>
                      <option value="mm">Millimetres (mm)</option>
                      <option value="in">Inches (in)</option>
                    </select>
                  </label>
                  <label>Roll width
                    <input type="number" min="1" value={rollWidth} onChange={(e) => setRollWidth(Math.max(1, Number(e.target.value) || 1))} />
                  </label>
                  <label>Roll length
                    <input type="number" min="1" value={rollLength} onChange={(e) => setRollLength(Math.max(1, Number(e.target.value) || 1))} />
                  </label>
                </div>
                <div className="notice info-notice">
                  <CircleHelp size={17} /> Camera measurement is not implemented yet. Enter dimensions manually and verify them with a measuring tape.
                </div>
                <button className="button button-primary" onClick={() => setActiveTab("Planner")}>Open cutting planner <ChevronRight size={16} /></button>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div><h2><Shirt size={17} /> Starter templates</h2><p>Illustrative dimensions — adjust to your actual pattern.</p></div>
                  <Layers3 size={20} />
                </div>
                <div className="template-grid">
                  {Object.keys(templates).map((name) => (
                    <button key={name} className={`template-card ${template === name ? "template-selected" : ""}`} onClick={() => loadTemplate(name)}>
                      <Shirt size={20} /><strong>{name}</strong><span>{templates[name].length} piece types</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <>
              {activeTab === "Overview" && (
                <section className="panel overview-banner">
                  <div className="overview-copy">
                    <span className="overview-kicker"><Leaf size={15} /> MATERIAL MINDFULNESS</span>
                    <h2>Plan before you cut.</h2>
                    <p>Test dimensions, inspect a proposed layout and compare estimated material use before cutting physical fabric.</p>
                    <button className="button button-primary" onClick={() => setActiveTab("Planner")}>Open cutting studio <ChevronRight size={16} /></button>
                  </div>
                  <div className="overview-orbit"><Scissors size={44} /></div>
                </section>
              )}

              <div className="work-grid">
                <section className="panel layout-panel">
                  <div className="panel-heading">
                    <div><h2><Package size={17} /> Cutting layout</h2><p>Live approximate preview of the roll and pattern pieces.</p></div>
                    <span className="live-badge"><span /> LIVE</span>
                  </div>
                  <div className="layout-toolbar">
                    <div className="segmented">
                      <button className={!optimized ? "selected" : ""} onClick={() => setOptimized(false)}>Baseline</button>
                      <button className={optimized ? "selected" : ""} onClick={() => setOptimized(true)}><Sparkles size={13} /> Area-sorted</button>
                    </div>
                    <span className="unit-label">UNIT: {unit.toUpperCase()}</span>
                  </div>
                  <div className="planner-options">
                    <label className="toggle-row">
                      <span><RotateCw size={15} /> Allow 90° rotation</span>
                      <input type="checkbox" checked={allowRotation} onChange={(e) => setAllowRotation(e.target.checked)} />
                    </label>
                    <label className="template-select">Quick template
                      <select value={template} onChange={(e) => loadTemplate(e.target.value)}>
                        {Object.keys(templates).map((name) => <option key={name}>{name}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="fabric-stage">
                    <div className="fabric-ruler">{rollWidth} {unit}</div>
                    <div className="fabric-canvas" style={{ width: `${svgWidth}px`, height: `${Math.min(svgHeight, 620)}px`, maxWidth: "100%" }}>
                      <svg viewBox={`0 0 ${rollWidth} ${rollLength}`} preserveAspectRatio="none" role="img" aria-label="Estimated fabric layout">
                        <defs>
                          <pattern id="fabricGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#b2d6c0" strokeWidth=".25" />
                          </pattern>
                        </defs>
                        <rect width={rollWidth} height={rollLength} fill="#10251c" />
                        <rect width={rollWidth} height={rollLength} fill="url(#fabricGrid)" />
                        {plan.placed.map((piece, i) => (
                          <g key={`${piece.name}-${i}`}>
                            <rect x={piece.x} y={piece.y} width={piece.w} height={piece.h} rx=".7" fill={["#b7f7b5", "#a8e9d7", "#d5efa0", "#9ad8bc"][i % 4]} stroke="#4ca67b" strokeWidth=".45" />
                            <text x={piece.x + piece.w / 2} y={piece.y + piece.h / 2} fontSize={Math.min(3.2, piece.w / 5, piece.h / 5)} fill="#153d2c" textAnchor="middle" dominantBaseline="middle">{piece.name}</text>
                            <text x={piece.x + piece.w / 2} y={piece.y + piece.h / 2 + Math.min(4, piece.h / 4)} fontSize={Math.min(2.5, piece.w / 6)} fill="#285c43" textAnchor="middle">{piece.w} × {piece.h}{piece.rotated ? " ↻" : ""}</text>
                          </g>
                        ))}
                      </svg>
                    </div>
                    <div className="fabric-length">{rollLength} {unit}</div>
                  </div>

                  <div className="layout-legend">
                    <span><i className="legend-used" /> Placed pieces</span>
                    <span><i className="legend-left" /> Unused fabric</span>
                    <span>{plan.placed.length} / {quantity} placed</span>
                  </div>
                  {plan.placed.length < quantity && (
                    <div className="warning-box"><CircleHelp size={17} /><span>{quantity - plan.placed.length} piece(s) could not be placed. Try changing the roll dimensions, pattern dimensions or rotation setting.</span></div>
                  )}
                  <div className="disclaimer">This is a shelf-packing heuristic, not a guaranteed optimal nesting solution. Fabric grain, seam allowances, pattern matching and real cutting constraints are not modelled.</div>
                </section>

                <div className="right-column">
                  <section className="panel roll-panel">
                    <div className="panel-heading"><div><h2><Settings2 size={17} /> Fabric roll</h2><p>Set your available material.</p></div><Ruler size={18} /></div>
                    <div className="roll-fields">
                      <label>Width ({unit})<input type="number" min="1" value={rollWidth} onChange={(e) => setRollWidth(Math.max(1, Number(e.target.value) || 1))} /></label>
                      <label>Length ({unit})<input type="number" min="1" value={rollLength} onChange={(e) => setRollLength(Math.max(1, Number(e.target.value) || 1))} /></label>
                    </div>
                    <div className="roll-summary"><span><Factory size={16} /> Full roll area</span><strong>{areaInSquareMeters(plan.totalArea).toFixed(3)} m²</strong></div>
                  </section>

                  <section className="panel pieces-panel">
                    <div className="panel-heading"><div><h2><Layers3 size={17} /> Pattern pieces</h2><p>Set dimensions and required quantity.</p></div><span className="count-badge">{quantity} total</span></div>
                    <div className="piece-list">
                      {pieces.map((piece, i) => (
                        <div className="piece-row" key={piece.id}>
                          <span className={`piece-index piece-${i % 4}`}>{String(i + 1).padStart(2, "0")}</span>
                          <div className="piece-inputs">
                            <input className="piece-name" aria-label="Piece name" value={piece.name} onChange={(e) => updatePiece(piece.id, "name", e.target.value)} />
                            <div className="dimension-inputs">
                              <label><input aria-label={`${piece.name} width`} type="number" min="0" value={piece.width} onChange={(e) => updatePiece(piece.id, "width", e.target.value)} /> × <input aria-label={`${piece.name} height`} type="number" min="0" value={piece.height} onChange={(e) => updatePiece(piece.id, "height", e.target.value)} /><span>{unit}</span></label>
                              <label className="qty-label">Qty <input aria-label={`${piece.name} quantity`} type="number" min="0" max="50" value={piece.qty} onChange={(e) => updatePiece(piece.id, "qty", e.target.value)} /></label>
                            </div>
                          </div>
                          <button className="remove-piece" aria-label={`Remove ${piece.name}`} onClick={() => setPieces((old) => old.filter((p) => p.id !== piece.id))}><Trash2 size={15} /></button>
                        </div>
                      ))}
                    </div>
                    {showForm ? (
                      <div className="add-piece-form">
                        <input placeholder="Piece name" value={newPiece.name} onChange={(e) => setNewPiece({ ...newPiece, name: e.target.value })} />
                        <div className="add-piece-dims">
                          <label>Width<input type="number" min="1" value={newPiece.width} onChange={(e) => setNewPiece({ ...newPiece, width: Number(e.target.value) })} /></label>
                          <label>Height<input type="number" min="1" value={newPiece.height} onChange={(e) => setNewPiece({ ...newPiece, height: Number(e.target.value) })} /></label>
                          <label>Qty<input type="number" min="1" max="50" value={newPiece.qty} onChange={(e) => setNewPiece({ ...newPiece, qty: Number(e.target.value) })} /></label>
                        </div>
                        <div className="form-actions">
                          <button className="button button-outline" onClick={() => setShowForm(false)}>Cancel</button>
                          <button className="button button-primary" onClick={addPiece}>Add piece</button>
                        </div>
                      </div>
                    ) : (
                      <button className="add-piece-button" onClick={() => setShowForm(true)}><Plus size={16} /> Add another piece</button>
                    )}
                    <button className="reset-template" onClick={resetPieces}><RefreshCw size={14} /> Reset to default template</button>
                  </section>

                  <section className="savings-card">
                    <div className="savings-heading"><span className="savings-icon"><Leaf size={19} /></span><span>Material utilization</span><span className="savings-tag">ESTIMATE</span></div>
                    <div className="savings-number">{plan.wastePct.toFixed(1)}<small>%</small></div>
                    <div className="savings-caption">Estimated unused roll area</div>
                    <div className="progress-track"><span style={{ width: `${Math.max(0, Math.min(100, plan.utilization))}%` }} /></div>
                    <div className="progress-labels"><span>Used {plan.utilization.toFixed(1)}%</span><span>Unused {plan.wastePct.toFixed(1)}%</span></div>
                    <div className="savings-comparison"><span><ArrowDownRight size={15} /> Layout comparison</span><strong className={savings > 0 ? "positive" : ""}>{savings > 0 ? `${savings.toFixed(1)}% lower unused area` : savings < 0 ? `${Math.abs(savings).toFixed(1)}% higher unused area` : "No difference"}</strong></div>
                    <button className="button button-light" onClick={() => exportReport("txt")}><Download size={16} /> Download report</button>
                  </section>

                  <section className="panel cost-panel">
                    <div className="panel-heading"><div><h2><Wallet size={17} /> Cost estimator</h2><p>Estimated fabric cost from used roll length.</p></div><Factory size={18} /></div>
                    <div className="roll-fields">
                      <label>Currency
                        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                          <option value="INR">INR (₹)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option>
                        </select>
                      </label>
                      <label>Price / linear metre
                        <input type="number" min="0" value={costPerMeter} onChange={(e) => setCostPerMeter(Math.max(0, Number(e.target.value) || 0))} />
                      </label>
                    </div>
                    <div className="cost-total"><span>Estimated material cost</span><strong>{currency} {cost.toFixed(2)}</strong></div>
                    <p className="cost-note">Based on the layout&apos;s used length and your entered price. Actual purchasing, roll width, defects and supplier pricing may change costs.</p>
                  </section>
                </div>
              </div>
            </>
          )}

          <footer className="page-footer">
            <span>© 2026 NapaSathi AI · Built for makers and artisans</span>
            <span><span className="footer-status" /> Calculations run locally in your browser</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
