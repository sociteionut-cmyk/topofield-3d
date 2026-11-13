import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Mark, PointType, Project, SurveyPoint } from '../types';
import { TYPE_COLOR, TYPE_LABEL } from '../types';
import { isCodeTaken, nextCode } from '../lib/numbering';
import { newPoint } from '../lib/project';
import { useBlobUrl } from '../hooks';

interface Props {
  project: Project;
  photoId: string;
  update: (fn: (p: Project) => Project) => void;
  selectedId?: string;
  onSelect: (id?: string) => void;
  onOpenDetails: (id: string) => void;
  notify: (msg: string) => void;
}

type Tool = PointType | null;
interface Drag {
  id: string;
  kind: 'pt' | 'label';
  mark: Mark;
  moved: boolean;
  sx: number;
  sy: number;
}
interface Gesture {
  kind: 'pan' | 'pinch';
  start: { z: number; px: number; py: number };
  sx: number;
  sy: number;
  d0: number;
  mx: number;
  my: number;
  t: number;
  moved: boolean;
}

const TOOLS: PointType[] = ['robinet', 'sudura', 'cot', 'flansa', 'conducta', 'alt'];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const MAX_Z = 12;
const labelPos = (x: number, y: number) => ({ lx: clamp(x, 0.03, 0.97), ly: clamp(y < 0.14 ? y + 0.08 : y - 0.08, 0.03, 0.97) });

export function ImageEditor({ project, photoId, update, selectedId, onSelect, onOpenDetails, notify }: Props) {
  const url = useBlobUrl(photoId);
  const box = useRef<HTMLDivElement>(null);
  const [cs, setCs] = useState({ w: 300, h: 300 });
  const [nat, setNat] = useState<{ w: number; h: number }>();
  const [view, setView] = useState({ z: 1, px: 0, py: 0 });
  const [edit, setEdit] = useState(false);
  const [tool, setTool] = useState<Tool>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    setNat(undefined);
    setView({ z: 1, px: 0, py: 0 });
  }, [photoId]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCs({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setCs({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = nat ? Math.min(cs.w / nat.w, cs.h / nat.h) : 1;
  const W = nat ? nat.w * fit : cs.w;
  const H = nat ? nat.h * fit : cs.h;
  const ox = (cs.w - W) / 2;
  const oy = (cs.h - H) / 2;

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      setView((v) => {
        const z2 = clamp(v.z * factor, 1, MAX_Z);
        const lx = (cx - ox - v.px) / v.z;
        const ly = (cy - oy - v.py) / v.z;
        return { z: z2, px: cx - ox - lx * z2, py: cy - oy - ly * z2 };
      });
    },
    [ox, oy],
  );

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const points = useMemo(() => project.points.filter((p) => p.photoId === photoId && p.mark), [project.points, photoId]);
  const selected = project.points.find((p) => p.id === selectedId);

  const toNorm = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - ox - v.px) / v.z / W, y: (clientY - r.top - oy - v.py) / v.z / H };
  };

  const addPoint = (x: number, y: number) => {
    const mark = (below = false): Mark => {
      const l = labelPos(x, y);
      return { x, y, lx: l.lx, ly: below ? clamp(y + 0.08, 0.03, 0.97) : l.ly };
    };
    if (!tool) return;
    const np = newPoint({ code: nextCode(project.points, tool), type: tool, order: project.points.length + 1, photoId, mark: mark() });
    update((p) => ({ ...p, points: [...p.points, np] }));
    onSelect(np.id);
  };

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = box.current!.getBoundingClientRect();
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: 'pinch',
        start: viewRef.current,
        sx: 0,
        sy: 0,
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mx: (a.x + b.x) / 2 - r.left,
        my: (a.y + b.y) / 2 - r.top,
        t: Date.now(),
        moved: true,
      };
    } else {
      gesture.current = { kind: 'pan', start: viewRef.current, sx: e.clientX, sy: e.clientY, d0: 0, mx: 0, my: 0, t: Date.now(), moved: false };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (drag || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const r = box.current!.getBoundingClientRect();
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      const z2 = clamp(g.start.z * (d / g.d0), 1, MAX_Z);
      const lx = (g.mx - ox - g.start.px) / g.start.z;
      const ly = (g.my - oy - g.start.py) / g.start.z;
      setView({ z: z2, px: mx - ox - lx * z2, py: my - oy - ly * z2 });
    } else if (g.kind === 'pan') {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (Math.hypot(dx, dy) > 6) g.moved = true;
      if (g.moved) setView({ z: g.start.z, px: g.start.px + dx, py: g.start.py + dy });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size <= 1) gesture.current = null;
    if (!(g && g.kind === 'pan' && !g.moved && Date.now() - g.t < 600 && nat)) return;
    const { x, y } = toNorm(e.clientX, e.clientY);
    const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    if (edit && placing && inside) {
      const id = placing;
      setPlacing(null);
      update((p) => ({ ...p, points: p.points.map((q) => (q.id === id ? { ...q, photoId, mark: { x, y, ...labelPos(x, y) } } : q)) }));
    } else if (edit && tool && inside) addPoint(x, y);
    else onSelect(undefined);
  };

  const startDrag = (e: React.PointerEvent, p: SurveyPoint, kind: 'pt' | 'label') => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelect(p.id);
    if (!edit) return;
    setDrag({ id: p.id, kind, mark: p.mark!, moved: false, sx: e.clientX, sy: e.clientY });
  };

  const moveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    e.stopPropagation();
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    const { x, y } = toNorm(e.clientX, e.clientY);
    const nx = clamp(x, 0, 1);
    const ny = clamp(y, 0, 1);
    setDrag({ ...drag, moved: true, mark: drag.kind === 'pt' ? { ...drag.mark, x: nx, y: ny } : { ...drag.mark, lx: nx, ly: ny } });
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    e.stopPropagation();
    if (drag.moved) update((p) => ({ ...p, points: p.points.map((q) => (q.id === drag.id ? { ...q, mark: drag.mark } : q)) }));
    setDrag(null);
  };

  const markOf = (p: SurveyPoint): Mark => (drag && drag.id === p.id ? drag.mark : p.mark!);

  const pickTool = (t: Tool) => {
    setTool(t);
    setPlacing(null);
  };

  const patch = (id: string, fn: (p: SurveyPoint) => SurveyPoint) => update((pr) => ({ ...pr, points: pr.points.map((q) => (q.id === id ? fn(q) : q)) }));

  const removePoint = (id: string) => {
    update((pr) => ({
      ...pr,
      points: pr.points.filter((q) => q.id !== id).map((q, i) => ({ ...q, order: i + 1, valveId: q.valveId === id ? undefined : q.valveId })),
      links: pr.links.filter((l) => l.a !== id && l.b !== id),
    }));
    onSelect(undefined);
  };

  const hint = placing
    ? 'Atinge fotografia pentru a poziționa punctul selectat.'
    : tool
      ? `Atinge fotografia pentru a adăuga ${TYPE_LABEL[tool]} ${nextCode(project.points, tool)}. Trage de punct sau de etichetă pentru a le muta.`
      : 'Alege un tip de punct, apoi atinge fotografia. Selectează un punct pentru a-l muta sau modifica.';

  return (
    <div className="editor">
      <div className="editor-bar">
        <button
          className={`btn ${edit ? 'btn-accent' : 'btn-primary'}`}
          onClick={() => {
            setEdit(!edit);
            pickTool(null);
          }}
        >
          {edit ? '✔ Gata editarea' : '✎ Editează imaginea'}
        </button>
        <div className="zoom-btns">
          <button className="btn btn-light sq" aria-label="Mărește" onClick={() => zoomAt(cs.w / 2, cs.h / 2, 1.4)}>＋</button>
          <button className="btn btn-light sq" aria-label="Micșorează" onClick={() => zoomAt(cs.w / 2, cs.h / 2, 1 / 1.4)}>－</button>
          <button className="btn btn-light" onClick={() => setView({ z: 1, px: 0, py: 0 })}>Potrivește</button>
        </div>
      </div>

      {edit && (
        <div className="tools" role="toolbar" aria-label="Tip punct">
          {TOOLS.map((t) => (
            <button key={t} className={`chip ${tool === t ? 'chip-on' : ''}`} style={{ borderColor: TYPE_COLOR[t] }} onClick={() => pickTool(tool === t ? null : t)}>
              <span className="dot" style={{ background: TYPE_COLOR[t] }} /> {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      )}
      {edit && (
        <div className="hint">
          {hint}
          {placing && (
            <button className="link" onClick={() => pickTool(tool)}>
              Renunță
            </button>
          )}
        </div>
      )}

      <div ref={box} className={`viewport ${edit && (tool || placing) ? 'aiming' : ''}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDragStart={(e) => e.preventDefault()}>
        {url && (
          <div className="layer" style={{ width: W, height: H, transform: `translate(${ox + view.px}px, ${oy + view.py}px) scale(${view.z})` }}>
            <img src={url} alt="Fotografia instalației" draggable={false} style={{ width: W, height: H }} onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
            {nat && (
              <>
                <svg className="lines" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                  {points.map((p) => {
                    const m = markOf(p);
                    const sel = p.id === selectedId;
                    return <line key={p.id} x1={m.x * W} y1={m.y * H} x2={m.lx * W} y2={m.ly * H} stroke={sel ? '#fff' : '#0b2a5b'} strokeWidth={sel ? 2 : 1.2} vectorEffect="non-scaling-stroke" />;
                  })}
                </svg>
                {points.map((p) => {
                  const m = markOf(p);
                  const col = p.status === 'masurat' ? 'var(--ok)' : 'var(--bad)';
                  const sel = p.id === selectedId;
                  const inv = `translate(-50%,-50%) scale(${1 / view.z})`;
                  const handlers = (kind: 'pt' | 'label') => ({
                    onPointerDown: (e: React.PointerEvent) => startDrag(e, p, kind),
                    onPointerMove: moveDrag,
                    onPointerUp: endDrag,
                    onPointerCancel: endDrag,
                  });
                  return (
                    <div key={p.id}>
                      <div data-testid={`marker-${p.code}`} className={`marker ${sel ? 'sel' : ''} ${edit ? 'movable' : ''}`} style={{ left: m.x * W, top: m.y * H, transform: inv, background: col }} title={p.code} {...handlers('pt')} />
                      <div data-testid={`label-${p.code}`} className={`mlabel ${sel ? 'sel' : ''} ${edit ? 'movable' : ''}`} style={{ left: m.lx * W, top: m.ly * H, transform: inv, borderColor: col }} {...handlers('label')}>
                        {p.code}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
        {!url && <div className="center muted">Se încarcă fotografia…</div>}
        <div className="zoom-badge">{Math.round(view.z * 100)}%</div>
      </div>

      {selected && (
        <PointPanel
          key={selected.id}
          point={selected}
          project={project}
          onPatch={(fn) => patch(selected.id, fn)}
          onDelete={() => removePoint(selected.id)}
          onRemoveMark={() => patch(selected.id, (q) => ({ ...q, photoId: undefined, mark: undefined }))}
          onDetails={() => onOpenDetails(selected.id)}
          onClose={() => onSelect(undefined)}
          notify={notify}
          hasMark={!!selected.mark && selected.photoId === photoId}
          onPlace={() => {
            setEdit(true);
            setTool(null);
            setPlacing(selected.id);
          }}
        />
      )}
    </div>
  );
}

interface PanelProps {
  point: SurveyPoint;
  project: Project;
  onPatch: (fn: (p: SurveyPoint) => SurveyPoint) => void;
  onDelete: () => void;
  onRemoveMark: () => void;
  onDetails: () => void;
  onClose: () => void;
  notify: (m: string) => void;
  hasMark: boolean;
  onPlace: () => void;
}

function PointPanel({ point, project, onPatch, onDelete, onRemoveMark, onDetails, onClose, notify, hasMark, onPlace }: PanelProps) {
  const [code, setCode] = useState(point.code);
  useEffect(() => setCode(point.code), [point.code]);
  const commit = () => {
    const c = code.trim();
    if (!c) return setCode(point.code);
    if (c === point.code) return;
    if (isCodeTaken(project.points, c, point.id)) {
      notify(`Codul „${c}” există deja. Alegeți alt cod.`);
      return setCode(point.code);
    }
    onPatch((p) => ({ ...p, code: c, customCode: true }));
  };
  const changeType = (t: PointType) => {
    onPatch((p) => ({ ...p, type: t, code: p.customCode ? p.code : nextCode(project.points.filter((q) => q.id !== p.id), t) }));
  };
  return (
    <div className="panel">
      <div className="row between">
        <strong>Punct selectat</strong>
        <button className="link" onClick={onClose}>Închide</button>
      </div>
      <div className="grid2">
        <label>
          Denumire / cod
          <input aria-label="Cod punct" value={code} onChange={(e) => setCode(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </label>
        <label>
          Tip
          <select value={point.type} onChange={(e) => changeType(e.target.value as PointType)}>
            {TOOLS.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row gap wrap">
        <button className="btn btn-light" onClick={onDetails}>Detalii punct</button>
        {hasMark ? (
          <>
            <button className="btn btn-light" onClick={onPlace}>Repoziționează</button>
            <button className="btn btn-light" onClick={onRemoveMark}>Scoate marcajul</button>
          </>
        ) : (
          <button className="btn btn-accent" onClick={onPlace}>Plasează pe fotografie</button>
        )}
        <button className="btn btn-danger" onClick={() => confirm(`Ștergeți punctul ${point.code}?`) && onDelete()}>Șterge</button>
      </div>
    </div>
  );
}
