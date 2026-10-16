import { useRef, useState, useCallback, useEffect } from 'react';
import { getStroke } from 'perfect-freehand';
import styled from 'styled-components';
import { Icon } from './core/Icon.jsx';
import { useUIStore } from '../../stores/uiStore.js';

/* ── SVG helpers ── */

function getSvgPathFromStroke(stroke: number[][]): string {
  if (stroke.length < 2) return '';
  const d = stroke.reduce<string[]>((acc, [x0, y0], i, arr) => {
    const [x1, y1] = arr[(i + 1) % arr.length];
    return [...acc, `${x0.toFixed(1)},${y0.toFixed(1)}`, `${((x0 + x1) / 2).toFixed(1)},${((y0 + y1) / 2).toFixed(1)}`];
  }, [`M ${stroke[0][0].toFixed(1)},${stroke[0][1].toFixed(1)} Q`]);
  return `${d.join(' ')} Z`;
}

function strokesToSvg(strokes: FinishedStroke[], width: number, height: number): string {
  const paths = strokes.map(s => {
    const outline = getStroke(s.points, { size: s.size, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
    const d = getSvgPathFromStroke(outline);
    return `<path d="${d}" fill="${s.color}" />`;
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n  ${paths}\n</svg>`;
}

/* ── Types ── */

interface RawPoint { x: number; y: number; pressure: number; }
interface FinishedStroke { points: [number, number, number][]; color: string; size: number; }

/* ── Styled components ── */

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.surface};
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  flex-wrap: wrap;
  flex-shrink: 0;
`;

const CanvasArea = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
  background: transparent;
  touch-action: none;
`;

const StyledCanvas = styled.canvas`
  position: absolute;
  inset: 0;
  touch-action: none;
  cursor: crosshair;
  display: block;
`;

const TBtn = styled.button<{ $active?: boolean; $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  font-size: 15px;
  font-family: ${({ theme }) => theme.fontFamily.ui};
  font-weight: 500;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border: 1px solid ${({ $active, $danger, theme }) =>
    $danger ? theme.colors.danger : $active ? theme.colors.text : theme.colors.border};
  background: ${({ $active, theme }) => $active ? theme.colors.text : 'transparent'};
  color: ${({ $active, $danger, theme }) =>
    $danger ? theme.colors.danger : $active ? theme.colors.surface : theme.colors.text};
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  &:hover { opacity: 0.8; }
`;

const ColorSwatch = styled.button<{ $color: string; $active: boolean }>`
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  border: 2px solid ${({ $active, theme }) => $active ? theme.colors.text : 'transparent'};
  cursor: pointer;
  flex-shrink: 0;
`;

const SizeDot = styled.button<{ $size: number; $active: boolean }>`
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.text};
  border: 2px solid ${({ $active, theme }) => $active ? theme.colors.borderFocus : 'transparent'};
  cursor: pointer;
  flex-shrink: 0;
`;

const Divider = styled.div`
  width: 1px;
  height: 20px;
  background: ${({ theme }) => theme.colors.border};
  margin: 0 2px;
  flex-shrink: 0;
`;

const Spacer = styled.div`
  flex: 1;
`;

const COLORS = ['#1a1a1a', '#9B4444', '#3B6B9B', '#3B9B5A', '#9B6B3B', '#7B3B9B'];
const SIZES: { label: string; size: number; dot: number }[] = [
  { label: 'S', size: 4, dot: 8 },
  { label: 'M', size: 8, dot: 12 },
  { label: 'L', size: 16, dot: 18 },
];

/* ── Component ── */

interface DrawingCanvasProps {
  initialSvg?: string;
  onSave: (svg: string) => void;
  onCancel: () => void;
}

export function DrawingCanvas({ initialSvg, onSave, onCancel }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const pencilOnly = useUIStore(s => s.pencilOnly);
  const setPencilOnly = useUIStore(s => s.setPencilOnly);

  const [strokes, setStrokes] = useState<FinishedStroke[]>([]);
  const [currentPoints, setCurrentPoints] = useState<RawPoint[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [sizeIdx, setSizeIdx] = useState(1);
  const activeSize = SIZES[sizeIdx].size;

  const isDrawingRef = useRef(false);
  const dprRef = useRef(window.devicePixelRatio || 1);

  // Set canvas physical size to match container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const area = areaRef.current;
    if (!canvas || !area) return;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    const { width, height } = area.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // Redraw all strokes onto canvas
  const redraw = useCallback((allStrokes: FinishedStroke[], current: RawPoint[], curColor: string, curSize: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = dprRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing SVG background if editing
    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height);
    }

    const allToDraw = [
      ...allStrokes,
      ...(current.length > 1 ? [{ points: current.map(p => [p.x * dpr, p.y * dpr, p.pressure] as [number, number, number]), color: curColor, size: curSize * dpr }] : []),
    ];

    for (const stroke of allToDraw) {
      const outline = getStroke(stroke.points, { size: stroke.size, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
      if (!outline.length) continue;
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      outline.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.closePath();
      ctx.fill();
    }
  }, []);

  useEffect(() => {
    redraw(strokes, currentPoints, color, activeSize);
  }, [strokes, currentPoints, color, activeSize, redraw]);

  // Load initial SVG as background image
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!initialSvg) return;
    const img = new Image();
    img.onload = () => {
      bgImageRef.current = img;
      redraw(strokes, currentPoints, color, activeSize);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(initialSvg)}`;
  }, [initialSvg]); // eslint-disable-line react-hooks/exhaustive-deps

  const getCanvasPoint = useCallback((e: PointerEvent): RawPoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure: e.pressure || 0.5 };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pencilOnly && e.pointerType !== 'pen') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const pt = getCanvasPoint(e.nativeEvent);
    setCurrentPoints([pt]);
  }, [pencilOnly, getCanvasPoint]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    if (pencilOnly && e.pointerType !== 'pen') return;
    const pt = getCanvasPoint(e.nativeEvent);
    setCurrentPoints(prev => [...prev, pt]);
  }, [pencilOnly, getCanvasPoint]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const dpr = dprRef.current;
    setCurrentPoints(prev => {
      if (prev.length > 0) {
        const newStroke: FinishedStroke = {
          points: prev.map(p => [p.x * dpr, p.y * dpr, p.pressure]),
          color,
          size: activeSize * dpr,
        };
        setStrokes(s => [...s, newStroke]);
      }
      return [];
    });
  }, [color, activeSize]);

  const handleUndo = useCallback(() => setStrokes(s => s.slice(0, -1)), []);
  const handleClear = useCallback(() => setStrokes([]), []);

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = dprRef.current;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    // Build final SVG — background first, then new strokes
    const bgPart = initialSvg
      ? `<image href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(initialSvg)}" width="${w}" height="${h}" />\n  `
      : '';

    const paths = strokes.map(s => {
      // Convert from physical back to logical coords
      const logicalPts = s.points.map(([x, y, p]) => [x / dpr, y / dpr, p] as [number, number, number]);
      const outline = getStroke(logicalPts, { size: s.size / dpr, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
      const d = getSvgPathFromStroke(outline);
      return `<path d="${d}" fill="${s.color}" />`;
    }).join('\n  ');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n  <rect width="${w}" height="${h}" fill="white"/>\n  ${bgPart}${paths}\n</svg>`;
    onSave(svg);
  }, [strokes, initialSvg, onSave]);

  return (
    <Overlay>
      <TopBar>
        {/* Colors */}
        {COLORS.map(c => (
          <ColorSwatch key={c} $color={c} $active={color === c} onClick={() => setColor(c)} aria-label={`Color ${c}`} />
        ))}
        <Divider />
        {/* Sizes */}
        {SIZES.map((s, i) => (
          <SizeDot key={s.label} $size={s.dot} $active={sizeIdx === i} onClick={() => setSizeIdx(i)} aria-label={`Size ${s.label}`} />
        ))}
        <Divider />
        {/* Palm rejection toggle */}
        <TBtn $active={pencilOnly} onClick={() => setPencilOnly(!pencilOnly)} title={pencilOnly ? 'Pencil only (tap to allow finger)' : 'Finger + pencil'}>
          <Icon name={pencilOnly ? 'pencil' : 'command'} size={14} strokeWidth={2} />
          {pencilOnly ? 'Pencil' : 'Finger'}
        </TBtn>
        <Divider />
        <TBtn onClick={handleUndo} disabled={strokes.length === 0} title="Undo">
          <Icon name="repeat" size={14} strokeWidth={2} />
        </TBtn>
        <TBtn onClick={handleClear} $danger disabled={strokes.length === 0} title="Clear">
          <Icon name="trash" size={14} strokeWidth={2} />
        </TBtn>
        <Spacer />
        <TBtn onClick={onCancel} title="Cancel">
          <Icon name="x" size={14} strokeWidth={2} /> Cancel
        </TBtn>
        <TBtn $active onClick={handleSave} title="Save drawing">
          <Icon name="check" size={14} strokeWidth={2} /> Save
        </TBtn>
      </TopBar>
      <CanvasArea ref={areaRef}>
        <StyledCanvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </CanvasArea>
    </Overlay>
  );
}
