/**
 * El campo de texto de Handeia — EL MISMO, no una imitación.
 *
 * Es una copia directa de apps/web/src/features/sistema/components/input-bar.tsx,
 * con un solo cambio: el hook de tema, que dependía del proveedor de Handeia y
 * aquí se resuelve leyendo el documento.
 *
 * Se copia en vez de reescribirse a propósito. Una versión "equivalente" se
 * desviaría del original en cuanto alguien lo toque, y entonces el agente
 * dejaría de sentirse Handeia — que es justo el punto de ponerlo dentro de
 * un espacio ajeno.
 */

"use client";

import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus, X, Mic, AudioWaveform, ChevronDown, Check,
  HardDrive, Camera, Cloud, Link, Plug,
  FileText, Sparkles, Video, Music, Image,
} from "lucide-react";
/**
 * Tema, sin depender del proveedor de Handeia.
 *
 * Es el ÚNICO acople que tenía este archivo con la app. Se resuelve leyendo
 * lo mismo que lee Handeia —la clase `dark` en el documento— y cayendo a la
 * preferencia del sistema. Así el campo se ve idéntico dentro y fuera, sin
 * obligar a nadie a instalar un proveedor de tema.
 */
function useTheme(): { resolvedTheme: "light" | "dark" } {
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    // Cada proyecto marca el tema a su manera y el campo tiene que verse bien
    // en todos: Handeia usa la clase `.dark`, Nexus usa `data-theme="dark"`.
    // Mirar solo la clase dejaba el campo en claro dentro de un Nexus oscuro.
    const leer = () => {
      const raiz = document.documentElement;
      const claro = raiz.classList.contains("light") || raiz.getAttribute("data-theme") === "light";
      const oscuro =
        raiz.classList.contains("dark") || raiz.getAttribute("data-theme") === "dark";
      setResolvedTheme(
        oscuro || (!claro && window.matchMedia("(prefers-color-scheme: dark)").matches)
          ? "dark"
          : "light",
      );
    };
    leer();
    const obs = new MutationObserver(leer);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", leer);
    return () => { obs.disconnect(); mq.removeEventListener("change", leer); };
  }, []);
  return { resolvedTheme };
}

// ── Constants ──────────────────────────────────────────────────────────────

const PUBLISH_FORMATS = [
  { id: "text",     label: "Texto",     icon: FileText  },
  { id: "artefact", label: "Artefacto", icon: Sparkles  },
  { id: "video",    label: "Video",     icon: Video     },
  { id: "audio",    label: "Audio",     icon: Music     },
  { id: "images",   label: "Imágenes",  icon: Image     },
];

// La "G" marca que el motor pasa por GAIA (percepción de ACIPE incluida) —
// GAIA decide internamente cómo usar el modelo elegido, nunca lo expone directo.
// `id` es el string que se envía tal cual a ACIPE/GAIA como `model`.
// Exportado para que Ajustes → IA use la MISMA lista — antes tenía su propio
// selector "Claude/ChatGPT" desconectado que no coincidía con este.
export const MODELS = [
  { id: "gaia7",             label: "Gaia 7",           note: "En desarrollo", disabled: true },
  { id: "claude-opus-4-8",   label: "G Claude Opus 4.8", note: null,           disabled: false },
  { id: "gemini",            label: "G Gemini",          note: "Sin créditos",  disabled: true },
  { id: "gpt",               label: "G ChatGPT",         note: "Sin créditos",  disabled: true },
];

// ── AutoTextarea ───────────────────────────────────────────────────────────

function AutoTextarea({ value, onChange, onSubmit, onFocus, onBlur, placeholder }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void;
  onFocus?: (() => void) | undefined; onBlur?: (() => void) | undefined; placeholder?: string | undefined;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = `${ref.current.scrollHeight}px`; }
      }}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder ?? "Pregunta lo que quieras"}
      rows={2}
      className="w-full resize-none bg-transparent outline-none text-[14px] text-black dark:text-white tracking-[-0.02em] leading-[1.55] placeholder:text-black/30 dark:placeholder:text-white/55 select-text overflow-y-auto max-h-[160px] [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-black/15 dark:[&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-black/30 dark:hover:[&::-webkit-scrollbar-thumb]:bg-white/30"
    />
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface InputBarConnector {
  id: string;
  name: string;
  status: string;
}

export interface InputBarProps {
  // Normal text input
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onFocus?: (() => void) | undefined;
  onBlur?: (() => void) | undefined;
  placeholder?: string | undefined;

  // AI phase display (Asistente only)
  aiPhase?: "idle" | "sent" | "thinking" | "acting" | "done";
  aiStatus?: string;
  sentText?: string;
  thinkingLog?: string[];
  thinkingOpen?: boolean;
  onThinkingToggle?: () => void;

  // Recording mode
  recording?: boolean;
  recordSecs?: number;
  onStartRecording?: () => void;
  onCancelRecording?: () => void;
  onSendRecording?: () => void;

  // Voice mode
  voiceMode?: boolean;
  onVoiceModeToggle?: () => void;

  // Model selector
  model: string;
  onModelChange: (m: string) => void;

  // Attach modal callbacks
  connectors?: InputBarConnector[];
  onFileSelected?: (file: File) => void;
  onCloudOpen?: () => void;
  onConnectorInsert?: (name: string) => void;
  onNavigateConnectors?: () => void;

  // Publish mode (Comunidad — requires enablePublish=true)
  enablePublish?: boolean;
  publishMode?: boolean;
  onPublishModeChange?: (open: boolean) => void;
  pubTitle?: string;
  onPubTitleChange?: (v: string) => void;
  pubBody?: string;
  onPubBodyChange?: (v: string) => void;
  pubFormat?: string;
  onPubFormatChange?: (v: string) => void;
  onPublish?: () => void;
  onPubFileSelected?: (file: File) => void;
  pubFileName?: string | null;
  pubUploading?: boolean;

  // Extra slot rendered after mic/voice buttons (e.g. History icon on mobile)
  actionsEndSlot?: React.ReactNode;
}

// ── VoiceCanvas ────────────────────────────────────────────────────────────

type Blob = {
  bx: number; by: number; rx: number; ry: number;
  color: [number, number, number]; speed: number; phase: number;
};

const BLOBS: Blob[] = [
  { bx: 0.15, by: 0.50, rx: 0.52, ry: 0.90, color: [202, 220, 252], speed: 1.10, phase: 0.00 },
  { bx: 0.85, by: 0.50, rx: 0.48, ry: 0.85, color: [160, 200, 240], speed: 0.85, phase: 2.09 },
  { bx: 0.50, by: 0.20, rx: 0.42, ry: 0.75, color: [190, 240, 225], speed: 0.95, phase: 4.18 },
  { bx: 0.52, by: 0.80, rx: 0.38, ry: 0.70, color: [220, 200, 255], speed: 1.20, phase: 1.05 },
  { bx: 0.70, by: 0.40, rx: 0.30, ry: 0.60, color: [255, 220, 230], speed: 0.75, phase: 3.30 },
];

// Paleta propia para dark — no son los mismos pasteles apagados a menos
// opacidad (eso se leía gris). Colores saturados/neón pensados para brillar
// sobre negro, misma geometría/velocidad que BLOBS para que el movimiento
// no cambie, solo el color.
const DARK_BLOBS: Blob[] = [
  { bx: 0.15, by: 0.50, rx: 0.52, ry: 0.90, color: [64, 130, 255],  speed: 1.10, phase: 0.00 },
  { bx: 0.85, by: 0.50, rx: 0.48, ry: 0.85, color: [40, 210, 235],  speed: 0.85, phase: 2.09 },
  { bx: 0.50, by: 0.20, rx: 0.42, ry: 0.75, color: [60, 235, 170],  speed: 0.95, phase: 4.18 },
  { bx: 0.52, by: 0.80, rx: 0.38, ry: 0.70, color: [175, 90, 255],  speed: 1.20, phase: 1.05 },
  { bx: 0.70, by: 0.40, rx: 0.30, ry: 0.60, color: [255, 80, 150],  speed: 0.75, phase: 3.30 },
];

export function VoiceCanvas({ recording, voiceMode }: { recording: boolean; voiceMode: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recRef    = useRef(recording);
  recRef.current  = recording;
  const volRef    = useRef(0); // live 0–1 mic volume
  const { resolvedTheme } = useTheme();
  const darkRef   = useRef(resolvedTheme === "dark");
  useEffect(() => { darkRef.current = resolvedTheme === "dark"; }, [resolvedTheme]);

  // ── Microphone → volume ─────────────────────────────────────────────────
  useEffect(() => {
    if (!voiceMode) { volRef.current = 0; return; }

    let actx: AudioContext;
    let analyser: AnalyserNode;
    let src: MediaStreamAudioSourceNode;
    let stream: MediaStream;
    let raf: number;
    const buf = new Uint8Array(1024);

    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = ((buf[i] ?? 128) - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      volRef.current += (Math.min(1, rms * 12) - volRef.current) * 0.18;
      raf = requestAnimationFrame(tick);
    };

    // `navigator.mediaDevices` NO existe fuera de un contexto seguro: en http
    // sin TLS es undefined, y leerle .getUserMedia lanza un TypeError síncrono
    // que React propaga hasta desmontar el agente entero. El .catch de abajo no
    // lo cubre, porque no llega a haber promesa que rechazar.
    const medios = navigator.mediaDevices;
    if (!medios?.getUserMedia) {
      // Sin micrófono disponible la animación se queda en reposo, que es un
      // final digno; tumbar la app que nos hospeda no lo es.
      return () => { volRef.current = 0; };
    }

    medios
      .getUserMedia({ audio: true, video: false })
      .then(s => {
        stream   = s;
        actx     = new AudioContext();
        analyser = actx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.80;
        src = actx.createMediaStreamSource(stream);
        src.connect(analyser);
        raf = requestAnimationFrame(tick);
      })
      .catch(() => { /* mic denied — animation still runs idle */ });

    return () => {
      cancelAnimationFrame(raf);
      src?.disconnect();
      stream?.getTracks().forEach(t => t.stop());
      actx?.close().catch(() => {});
      volRef.current = 0;
    };
  }, [voiceMode]);

  // ── Canvas animation loop ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    let t = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    };

    const render = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const vol   = volRef.current;
      const boost = 1 + vol * 0.40;

      // ── Blobs — size and sway react to voice ────────────────
      const palette = darkRef.current ? DARK_BLOBS : BLOBS;
      for (const b of palette) {
        const amp = 0.13 + vol * 0.07;
        const x = (b.bx
          + amp * Math.sin(t * 0.00090 * b.speed + b.phase)
          + 0.06 * Math.cos(t * 0.00130 * b.speed + b.phase * 1.7)
        ) * w;
        const y = (b.by
          + (0.09 + vol * 0.04) * Math.cos(t * 0.00080 * b.speed + b.phase + 1.0)
          + 0.04 * Math.sin(t * 0.00110 * b.speed + b.phase * 0.9)
        ) * h;
        const rx = b.rx * w * 0.68 * boost;
        const ry = b.ry * h * 1.60 * boost;
        const r  = Math.max(rx, ry);

        const [r0, g0, b0] = b.color;
        const a0 = Math.min(0.85, 0.55 + vol * 0.30);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0,   `rgba(${r0},${g0},${b0},${a0.toFixed(2)})`);
        grad.addColorStop(0.5, `rgba(${r0},${g0},${b0},${(a0 * 0.42).toFixed(2)})`);
        grad.addColorStop(1,   `rgba(${r0},${g0},${b0},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Highlight — en claro sigue siendo el brillo blanco pleno de
      // siempre (intacto). En oscuro NO es blanco ni gris: es un núcleo
      // dorado cálido, mezcla normal (no aditiva — eso fue lo que se veía
      // gris lavado), diseñado para brillar contra negro sin desaturarse ──
      const lx = (0.30 + 0.07 * Math.sin(t * 0.00060)) * w;
      const ly = (0.44 + 0.05 * Math.cos(t * 0.00070)) * h;
      const lr = (0.26 + vol * 0.10) * w;
      const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      if (darkRef.current) {
        const peak = Math.min(0.75, 0.45 + vol * 0.3);
        lg.addColorStop(0,    `rgba(255,214,120,${peak.toFixed(2)})`);
        lg.addColorStop(0.45, `rgba(255,190,90,${(peak * 0.5).toFixed(2)})`);
        lg.addColorStop(1,    "rgba(255,190,90,0)");
      } else {
        lg.addColorStop(0, `rgba(255,255,255,${Math.min(0.9, 0.60 + vol * 0.30).toFixed(2)})`);
        lg.addColorStop(1, "rgba(255,255,255,0)");
      }
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();

      // ── Expansion rings — driven entirely by voice volume ────
      if (vol > 0.04 || recRef.current) {
        const cx = w * 0.5, cy = h * 0.5;
        const maxR = Math.hypot(w, h) * 0.55;
        const spd  = 0.0025 + vol * 0.006;
        for (let i = 0; i < 3; i++) {
          const phase = ((t * spd) + i * 0.33) % 1;
          const alpha = (1 - phase) * Math.min(0.55, 0.10 + vol * 0.55);
          ctx.beginPath();
          ctx.arc(cx, cy, phase * maxR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(180,170,255,${alpha.toFixed(3)})`;
          ctx.lineWidth = 1 + vol * 2.5;
          ctx.stroke();
        }
      }

      t += 16;
      raf = requestAnimationFrame(render);
    };

    resize();
    render();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ borderRadius: "inherit" }}
    />
  );
}

// ── InputBar ───────────────────────────────────────────────────────────────

export function InputBar({
  value, onChange, onSend, onFocus, onBlur, placeholder,
  aiPhase = "idle", aiStatus = "", sentText = "",
  thinkingLog = [], thinkingOpen = false, onThinkingToggle,
  recording = false, recordSecs = 0,
  onStartRecording, onCancelRecording, onSendRecording,
  voiceMode = false, onVoiceModeToggle,
  model, onModelChange,
  connectors = [], onFileSelected, onCloudOpen, onConnectorInsert, onNavigateConnectors,
  enablePublish = false,
  publishMode = false, onPublishModeChange,
  pubTitle = "", onPubTitleChange,
  pubBody = "", onPubBodyChange,
  pubFormat = "text", onPubFormatChange,
  onPublish,
  onPubFileSelected, pubFileName = null, pubUploading = false,
  actionsEndSlot,
}: InputBarProps) {
  const [attachOpen, setAttachOpen] = useState(false);
  const [modelOpen, setModelOpen]   = useState(false);
  const fileRef    = useRef<HTMLInputElement>(null);
  const camRef     = useRef<HTMLInputElement>(null);
  const pubFileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onFileSelected?.(file);
    setAttachOpen(false);
    e.target.value = "";
  };

  const connectedList  = connectors.filter(c => c.status === "connected").slice(0, 4);
  const hasMoreConn    = connectors.some(c => c.status !== "connected");

  return (
    <div className="flex flex-col">

      {/* ── Thinking panel (Asistente only) ─────────────────── */}
      <AnimatePresence>
        {thinkingOpen && aiPhase !== "idle" && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: 8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            className="mb-2 overflow-hidden rounded-2xl border border-black/[0.08] dark:border-white/[0.13] bg-white/90 dark:bg-[#171717]/90 backdrop-blur-sm shadow-[0_8px_32px_-12px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.41)]"
          >
            <div className="px-4 pt-3 pb-3 flex flex-col gap-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-black/30 dark:text-white/55">Proceso interno</span>
                <button
                  onClick={onThinkingToggle}
                  className="w-5 h-5 flex items-center justify-center rounded-full text-black/30 dark:text-white/55 hover:text-black/60 dark:hover:text-white/77 hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors"
                >
                  <X className="w-3 h-3" strokeWidth={2} />
                </button>
              </div>
              <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-black/10 dark:[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
                {thinkingLog.map((line, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-2"
                  >
                    <span className={`mt-[5px] w-[5px] h-[5px] rounded-full shrink-0 ${line.startsWith("✓") ? "bg-black/50 dark:bg-white/50" : "bg-black/15 dark:bg-white/15"}`} />
                    <span className={`text-[12px] tracking-[-0.01em] leading-[1.5] ${line.startsWith("✓") ? "text-black/60 dark:text-white/77" : "text-black/35 dark:text-white/55"}`}>{line}</span>
                  </motion.div>
                ))}
                {(aiPhase === "thinking" || aiPhase === "acting") && (
                  <div className="flex items-center gap-2 pl-[13px]">
                    {[0, 1, 2].map(i => (
                      <motion.span key={i} className="w-[3px] h-[3px] rounded-full bg-black/20 dark:bg-white/20 block"
                        animate={{ opacity: [0.2, 0.8, 0.2] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main input box ────────────────────────────────────── */}
      <motion.div
        className="flex flex-col rounded-2xl bg-white dark:bg-[#171717] relative"
        style={{ borderWidth: "1px", borderStyle: "solid" }}
        animate={voiceMode ? {
          borderColor: [
            "rgba(167,139,250,0.55)",
            "rgba(96,165,250,0.55)",
            "rgba(34,211,238,0.55)",
            "rgba(192,132,252,0.55)",
            "rgba(167,139,250,0.55)",
          ],
          boxShadow: [
            "0 0 0 3px rgba(139,92,246,0.10), 0 8px 40px -8px rgba(139,92,246,0.28)",
            "0 0 0 3px rgba(59,130,246,0.10), 0 8px 40px -8px rgba(59,130,246,0.22)",
            "0 0 0 3px rgba(6,182,212,0.10), 0 8px 40px -8px rgba(6,182,212,0.28)",
            "0 0 0 3px rgba(168,85,247,0.10), 0 8px 40px -8px rgba(168,85,247,0.28)",
            "0 0 0 3px rgba(139,92,246,0.10), 0 8px 40px -8px rgba(139,92,246,0.28)",
          ],
        } : {
          borderColor: "var(--field-border)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 12px 40px -20px rgba(0,0,0,0.12)",
        }}
        transition={voiceMode ? {
          borderColor: { repeat: Infinity, duration: 4, ease: "easeInOut" },
          boxShadow:   { repeat: Infinity, duration: 4, ease: "easeInOut" },
        } : { duration: 0.5 }}
      >

        {/* Hidden file inputs */}
        <input ref={fileRef}    type="file"                        className="hidden" onChange={handleFileChange} />
        {/* capture: abre la cámara DIRECTO en vez del selector de archivos. Sin
            él, "Cámara / imagen" mostraba la misma hoja de elegir archivo que
            el botón de al lado, y había que buscar la cámara ahí dentro. En
            escritorio el atributo se ignora y cae al selector, que es lo
            correcto ahí. */}
        <input ref={camRef}     type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={handleFileChange} />
        <input ref={pubFileRef} type="file"                        className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPubFileSelected?.(f); e.target.value = ""; }} />

        <AnimatePresence mode="wait" initial={false}>

          {/* ── PUBLISH MODE ──────────────────────────────────── */}
          {publishMode ? (
            <motion.div
              key="publish"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <span className="text-[10px] tracking-[0.08em] uppercase text-black/30 dark:text-white/55">Nueva publicación</span>
                <button
                  onClick={() => onPublishModeChange?.(false)}
                  className="text-black/30 hover:text-black/60 dark:hover:text-white/77 transition-colors"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.8} />
                </button>
              </div>

              <div className="px-4 pb-0">
                <input
                  autoFocus
                  value={pubTitle}
                  onChange={e => onPubTitleChange?.(e.target.value)}
                  placeholder="Título…"
                  className="w-full text-[14px] font-medium text-black dark:text-white tracking-[-0.025em] placeholder:text-black/25 dark:placeholder:text-white/55 bg-transparent outline-none"
                />
              </div>

              <div className="px-4 pt-1.5 pb-1">
                <textarea
                  value={pubBody}
                  onChange={e => onPubBodyChange?.(e.target.value)}
                  placeholder="Descripción… usa # para temas y @ para mencionar personas"
                  rows={2}
                  className="w-full resize-none text-[12.5px] text-black/60 dark:text-white/77 tracking-[-0.01em] leading-relaxed placeholder:text-black/25 dark:placeholder:text-white/55 bg-transparent outline-none"
                />
              </div>

              <div className="px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {PUBLISH_FORMATS.map(f => {
                  const Ico = f.icon;
                  return (
                    <button
                      key={f.id}
                      onClick={() => onPubFormatChange?.(f.id)}
                      className={`shrink-0 h-6 pl-1.5 pr-2.5 rounded-full inline-flex items-center gap-1 text-[10.5px] tracking-[-0.01em] transition-all ${
                        pubFormat === f.id
                          ? "bg-black dark:bg-white text-white dark:text-black"
                          : "bg-black/[0.04] dark:bg-white/[0.04] text-black/45 dark:text-white/63 hover:bg-black/[0.07] dark:hover:bg-white/[0.07] hover:text-black dark:hover:text-white"
                      }`}
                    >
                      <Ico className="w-2.5 h-2.5" strokeWidth={1.7} />
                      {f.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 px-3 pb-3 border-t border-black/[0.05] dark:border-white/[0.11] pt-2">
                <button
                  onClick={() => pubFileRef.current?.click()}
                  disabled={pubUploading}
                  className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-black/40 dark:text-white/55 hover:text-black dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={1.7} />
                </button>
                {(pubUploading || pubFileName) && (
                  <span className="text-[10.5px] text-black/40 dark:text-white/55 tracking-[-0.01em] truncate max-w-[140px]">
                    {pubUploading ? "Subiendo…" : pubFileName}
                  </span>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => onPublishModeChange?.(false)}
                  className="h-7 px-3.5 rounded-full text-[11.5px] text-black/40 dark:text-white/55 hover:text-black dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] tracking-[-0.01em] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={onPublish}
                  disabled={!pubTitle.trim() || pubUploading}
                  className="h-7 px-4 rounded-full bg-black dark:bg-white text-white dark:text-black text-[11.5px] tracking-[-0.01em] hover:bg-black/85 dark:hover:bg-white/85 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Publicar
                </button>
              </div>
            </motion.div>

          ) : (

            /* ── NORMAL / RECORDING / AI PHASE ──────────────── */
            <motion.div
              key="chat"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Content area */}
              <div className="px-4 pt-3 pb-0 min-h-[52px] flex items-start">
                <AnimatePresence mode="wait">

                  {/* Recording mode */}
                  {recording ? (
                    <motion.div
                      key="recording"
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.18 }}
                      className="w-full py-[7px] flex items-center gap-3"
                    >
                      <div className="relative shrink-0">
                        <motion.span
                          className="absolute inset-0 rounded-full bg-black/10 dark:bg-white/10"
                          animate={{ scale: [1, 1.7, 1], opacity: [0.5, 0, 0.5] }}
                          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                        />
                        <div className="w-[9px] h-[9px] rounded-full bg-black dark:bg-white relative" />
                      </div>
                      <div className="flex items-center gap-[3px]">
                        {[0.6, 1, 0.7, 1.2, 0.5, 0.9, 1.1, 0.6, 0.8, 1, 0.7, 0.5].map((h, i) => (
                          <motion.span key={i}
                            className="w-[2.5px] rounded-full bg-black/50 dark:bg-white/50 block"
                            animate={{ scaleY: [h * 0.4, h, h * 0.3, h * 0.9, h * 0.5] }}
                            transition={{ duration: 0.8 + i * 0.07, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
                            style={{ height: 18, transformOrigin: "center" }}
                          />
                        ))}
                      </div>
                      <span className="text-[13px] tracking-[-0.01em] text-black/45 dark:text-white/63 tabular-nums">
                        {String(Math.floor(recordSecs / 60)).padStart(2, "0")}:{String(recordSecs % 60).padStart(2, "0")}
                      </span>
                    </motion.div>

                  ) : aiPhase === "idle" ? (

                    /* Normal text input */
                    <motion.div
                      key="textarea"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="w-full"
                    >
                      <AutoTextarea
                        value={value}
                        onChange={onChange}
                        onSubmit={onSend}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        placeholder={placeholder}
                      />
                    </motion.div>

                  ) : (

                    /* AI phase display */
                    <motion.div
                      key="status"
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="w-full py-[7px] flex items-center justify-between gap-3"
                    >
                      <AnimatePresence mode="wait">
                        {aiPhase === "sent" && (
                          <motion.p key="sent"
                            initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}
                            transition={{ duration: 0.18 }}
                            className="text-[14px] tracking-[-0.02em] leading-[1.55] text-black/80 dark:text-white/92 truncate flex-1"
                          >{sentText}</motion.p>
                        )}
                        {aiPhase === "thinking" && (
                          <motion.div key="thinking"
                            initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}
                            transition={{ duration: 0.18 }}
                            className="flex items-center gap-2 flex-1"
                          >
                            <span className="text-[13.5px] tracking-[-0.02em] text-black/40 dark:text-white/55">Pensando</span>
                            <span className="flex gap-[3px] items-center">
                              {[0, 1, 2].map(i => (
                                <motion.span key={i} className="w-[4px] h-[4px] rounded-full bg-black/30 dark:bg-white/30 block"
                                  animate={{ opacity: [0.3, 1, 0.3] }}
                                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                                />
                              ))}
                            </span>
                          </motion.div>
                        )}
                        {aiPhase === "acting" && (
                          <motion.p key={aiStatus}
                            initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}
                            transition={{ duration: 0.2 }}
                            className="text-[13.5px] tracking-[-0.02em] text-black/40 dark:text-white/55 flex-1"
                          >{aiStatus}</motion.p>
                        )}
                        {aiPhase === "done" && (
                          <motion.p key="done"
                            initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}
                            transition={{ duration: 0.18 }}
                            className="text-[13.5px] tracking-[-0.02em] text-black/40 dark:text-white/55 flex-1"
                          >Listo</motion.p>
                        )}
                      </AnimatePresence>
                      {aiPhase !== "sent" && (
                        <button
                          onClick={onThinkingToggle}
                          className={`shrink-0 h-6 px-2.5 rounded-full border text-[11px] tracking-[-0.01em] transition-colors ${
                            thinkingOpen
                              ? "border-black/20 dark:border-white/26 bg-black/[0.05] dark:bg-white/[0.05] text-black/60 dark:text-white/77"
                              : "border-black/[0.08] dark:border-white/[0.13] text-black/30 dark:text-white/55 hover:text-black/55 dark:hover:text-white/69 hover:border-black/15 dark:hover:border-white/21"
                          }`}
                        >
                          {thinkingOpen ? "Cerrar" : "Ver más"}
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Action bar ────────────────────────────────── */}
              <div className="flex items-center gap-1.5 px-3 pt-1 pb-2.5">

                {/* Plus / attach */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setAttachOpen(o => !o)}
                    className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                      attachOpen ? "bg-black/[0.07] dark:bg-white/[0.07] text-black dark:text-white" : "text-black/70 dark:text-white/87 hover:text-black dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                    }`}
                  >
                    <Plus className={`w-[15px] h-[15px] transition-transform duration-200 ${attachOpen ? "rotate-45" : ""}`} />
                  </button>

                  <AnimatePresence>
                    {attachOpen && (
                      <>
                        {/* Backdrop */}
                        <motion.div
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[2px]"
                          onClick={() => setAttachOpen(false)}
                        />

                        {/* Desktop card */}
                        <motion.div
                          initial={{ opacity: 0, scale: 0.96, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.97, y: 6 }}
                          transition={{ type: "spring", stiffness: 340, damping: 30 }}
                          className="hidden md:flex fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] max-w-[90vw] flex-col rounded-2xl border border-black/[0.09] dark:border-white/[0.14] bg-white/90 dark:bg-[#171717]/90 backdrop-blur-xl shadow-[0_30px_90px_-20px_rgba(0,0,0,0.28)] dark:shadow-[0_30px_90px_-20px_rgba(0,0,0,0.64)] z-40 overflow-hidden"
                        >
                          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-black/[0.06] dark:border-white/[0.11]">
                            <span className="text-[13px] font-medium tracking-[-0.02em] text-black dark:text-white">Adjuntar</span>
                            <button
                              onClick={() => setAttachOpen(false)}
                              className="w-7 h-7 flex items-center justify-center rounded-full text-black/35 dark:text-white/55 hover:text-black dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors"
                            >
                              <X className="w-4 h-4" strokeWidth={1.8} />
                            </button>
                          </div>
                          <div className="p-2 flex flex-col gap-0.5">
                            <button
                              onClick={() => { setAttachOpen(false); fileRef.current?.click(); }}
                              className="flex items-center gap-3 h-10 px-3 rounded-xl text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors group"
                            >
                              <span className="w-7 h-7 rounded-xl bg-black/[0.05] dark:bg-white/[0.05] group-hover:bg-black/[0.07] flex items-center justify-center shrink-0 transition-colors">
                                <HardDrive className="w-4 h-4 text-black/55 dark:text-white/69" strokeWidth={1.6} />
                              </span>
                              <div className="flex flex-col">
                                <span className="text-[12.5px] tracking-[-0.02em] text-black/80 dark:text-white/92 leading-tight">Desde dispositivo</span>
                                <span className="text-[11px] text-black/30 dark:text-white/55 tracking-[-0.01em]">Cualquier archivo local</span>
                              </div>
                            </button>
                            <button
                              onClick={() => { setAttachOpen(false); camRef.current?.click(); }}
                              className="flex items-center gap-3 h-10 px-3 rounded-xl text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors group"
                            >
                              <span className="w-7 h-7 rounded-xl bg-black/[0.05] dark:bg-white/[0.05] group-hover:bg-black/[0.07] flex items-center justify-center shrink-0 transition-colors">
                                <Camera className="w-4 h-4 text-black/55 dark:text-white/69" strokeWidth={1.6} />
                              </span>
                              <div className="flex flex-col">
                                <span className="text-[12.5px] tracking-[-0.02em] text-black/80 dark:text-white/92 leading-tight">Cámara / imagen</span>
                                <span className="text-[11px] text-black/30 dark:text-white/55 tracking-[-0.01em]">Foto o video</span>
                              </div>
                            </button>
                            <button
                              onClick={() => { setAttachOpen(false); onCloudOpen?.(); }}
                              className="flex items-center gap-3 h-10 px-3 rounded-xl text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors group"
                            >
                              <span className="w-7 h-7 rounded-xl bg-black/[0.05] dark:bg-white/[0.05] group-hover:bg-black/[0.07] flex items-center justify-center shrink-0 transition-colors">
                                <Cloud className="w-4 h-4 text-black/55 dark:text-white/69" strokeWidth={1.6} />
                              </span>
                              <div className="flex flex-col">
                                <span className="text-[12.5px] tracking-[-0.02em] text-black/80 dark:text-white/92 leading-tight">Nube de Handeia</span>
                                <span className="text-[11px] text-black/30 dark:text-white/55 tracking-[-0.01em]">Tus archivos guardados</span>
                              </div>
                            </button>
                            {connectedList.length > 0 && (
                              <>
                                <div className="mx-3 my-1.5 border-t border-black/[0.06] dark:border-white/[0.11]" />
                                <span className="px-3 pb-1 text-[9.5px] tracking-[0.1em] uppercase text-black/25 dark:text-white/55">Conectores</span>
                                {connectedList.map(c => (
                                  <button key={c.id}
                                    onClick={() => { onConnectorInsert?.(c.name); setAttachOpen(false); }}
                                    className="flex items-center gap-3 h-10 px-3 rounded-xl text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors group"
                                  >
                                    <span className="w-7 h-7 rounded-xl bg-black/[0.05] dark:bg-white/[0.05] group-hover:bg-black/[0.07] flex items-center justify-center shrink-0 transition-colors">
                                      <Link className="w-3.5 h-3.5 text-black/50 dark:text-white/66" strokeWidth={1.6} />
                                    </span>
                                    <div className="flex flex-col flex-1 min-w-0">
                                      <span className="text-[12.5px] tracking-[-0.02em] text-black/80 dark:text-white/92 leading-tight truncate">{c.name}</span>
                                      <span className="text-[11px] text-black/30 dark:text-white/55 tracking-[-0.01em]">Conectado</span>
                                    </div>
                                  </button>
                                ))}
                              </>
                            )}
                            {hasMoreConn && (
                              <button
                                onClick={() => { setAttachOpen(false); onNavigateConnectors?.(); }}
                                className="flex items-center gap-3 h-10 px-3 rounded-xl text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors group"
                              >
                                <span className="w-7 h-7 rounded-xl bg-black/[0.05] dark:bg-white/[0.05] group-hover:bg-black/[0.07] flex items-center justify-center shrink-0 transition-colors">
                                  <Plug className="w-3.5 h-3.5 text-black/35 dark:text-white/55" strokeWidth={1.6} />
                                </span>
                                <span className="text-[12.5px] tracking-[-0.02em] text-black/40 dark:text-white/55">Ver todos los conectores</span>
                              </button>
                            )}
                          </div>
                        </motion.div>

                        {/* Mobile bottom sheet */}
                        <motion.div
                          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                          transition={{ type: "spring", stiffness: 380, damping: 36 }}
                          className="md:hidden fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-3xl border-t border-black/[0.08] dark:border-white/[0.13] bg-white/90 dark:bg-[#171717]/90 backdrop-blur-xl shadow-[0_-16px_48px_-12px_rgba(0,0,0,0.2)] dark:shadow-[0_-16px_48px_-12px_rgba(0,0,0,0.46)]"
                          style={{ maxHeight: "52vh" }}
                        >
                          <div className="pt-3 pb-1 flex justify-center shrink-0">
                            <span className="w-9 h-1 rounded-full bg-black/15 dark:bg-white/15" />
                          </div>
                          <div className="overflow-y-auto px-3 pb-8 flex flex-col gap-0.5">
                            <button onClick={() => { setAttachOpen(false); fileRef.current?.click(); }} className="flex items-center gap-3 h-12 px-3 rounded-2xl text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors group">
                              <span className="w-9 h-9 rounded-2xl bg-black/[0.05] dark:bg-white/[0.05] group-hover:bg-black/[0.07] flex items-center justify-center shrink-0 transition-colors"><HardDrive className="w-[18px] h-[18px] text-black/55 dark:text-white/69" strokeWidth={1.6} /></span>
                              <div><p className="text-[13.5px] tracking-[-0.02em] text-black/80 dark:text-white/92">Desde dispositivo</p><p className="text-[11.5px] text-black/30 dark:text-white/55">Cualquier archivo local</p></div>
                            </button>
                            <button onClick={() => { setAttachOpen(false); camRef.current?.click(); }} className="flex items-center gap-3 h-12 px-3 rounded-2xl text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors group">
                              <span className="w-9 h-9 rounded-2xl bg-black/[0.05] dark:bg-white/[0.05] group-hover:bg-black/[0.07] flex items-center justify-center shrink-0 transition-colors"><Camera className="w-[18px] h-[18px] text-black/55 dark:text-white/69" strokeWidth={1.6} /></span>
                              <div><p className="text-[13.5px] tracking-[-0.02em] text-black/80 dark:text-white/92">Cámara / imagen</p><p className="text-[11.5px] text-black/30 dark:text-white/55">Foto o video</p></div>
                            </button>
                            <button onClick={() => { setAttachOpen(false); onCloudOpen?.(); }} className="flex items-center gap-3 h-12 px-3 rounded-2xl text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors group">
                              <span className="w-9 h-9 rounded-2xl bg-black/[0.05] dark:bg-white/[0.05] group-hover:bg-black/[0.07] flex items-center justify-center shrink-0 transition-colors"><Cloud className="w-[18px] h-[18px] text-black/55 dark:text-white/69" strokeWidth={1.6} /></span>
                              <div><p className="text-[13.5px] tracking-[-0.02em] text-black/80 dark:text-white/92">Nube de Handeia</p><p className="text-[11.5px] text-black/30 dark:text-white/55">Tus archivos guardados</p></div>
                            </button>
                            {connectedList.length > 0 && (
                              <>
                                <div className="mx-3 my-2 border-t border-black/[0.06] dark:border-white/[0.11]" />
                                <span className="px-3 pb-1 text-[10px] tracking-[0.1em] uppercase text-black/25 dark:text-white/55">Conectores</span>
                                {connectedList.map(c => (
                                  <button key={c.id} onClick={() => { onConnectorInsert?.(c.name); setAttachOpen(false); }} className="flex items-center gap-3 h-12 px-3 rounded-2xl text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors group">
                                    <span className="w-9 h-9 rounded-2xl bg-black/[0.05] dark:bg-white/[0.05] group-hover:bg-black/[0.07] flex items-center justify-center shrink-0 transition-colors"><Link className="w-[16px] h-[16px] text-black/50 dark:text-white/66" strokeWidth={1.6} /></span>
                                    <div><p className="text-[13.5px] tracking-[-0.02em] text-black/80 dark:text-white/92">{c.name}</p><p className="text-[11.5px] text-black/30 dark:text-white/55">Conectado</p></div>
                                  </button>
                                ))}
                              </>
                            )}
                            <button onClick={() => { setAttachOpen(false); onNavigateConnectors?.(); }} className="flex items-center gap-3 h-12 px-3 rounded-2xl text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors group">
                              <span className="w-9 h-9 rounded-2xl bg-black/[0.05] dark:bg-white/[0.05] group-hover:bg-black/[0.07] flex items-center justify-center shrink-0 transition-colors"><Plug className="w-[16px] h-[16px] text-black/35 dark:text-white/55" strokeWidth={1.6} /></span>
                              <span className="text-[13.5px] tracking-[-0.02em] text-black/40 dark:text-white/55">Ver todos los conectores</span>
                            </button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                {/* Model selector */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setModelOpen(o => !o)}
                    className="h-7 inline-flex items-center gap-1.5 rounded-full border border-black/[0.09] dark:border-white/[0.14] px-3 text-[12px] tracking-[-0.02em] text-black/60 dark:text-white/77 hover:text-black dark:hover:text-white hover:border-black/20 dark:hover:border-white/26 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors"
                  >
                    {MODELS.find(m => m.id === model)?.label ?? model}
                    <ChevronDown className={`w-[11px] h-[11px] opacity-70 transition-transform ${modelOpen ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {modelOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setModelOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                          style={{ transformOrigin: "bottom left" }}
                          className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-[#171717] rounded-xl border border-black/[0.09] dark:border-white/[0.14] shadow-[0_16px_36px_-12px_rgba(0,0,0,0.22)] dark:shadow-[0_16px_36px_-12px_rgba(0,0,0,0.51)] p-1 z-40"
                        >
                          {MODELS.map(m => (
                            <button
                              key={m.id}
                              disabled={m.disabled}
                              onClick={() => { if (m.disabled) return; onModelChange(m.id); setModelOpen(false); }}
                              className={`w-full flex items-center gap-2 h-8 px-2.5 rounded-lg text-[12.5px] tracking-[-0.02em] transition-colors ${
                                m.disabled
                                  ? "text-black/25 dark:text-white/55 cursor-not-allowed"
                                  : model === m.id
                                    ? "bg-black/[0.05] dark:bg-white/[0.05] text-black dark:text-white"
                                    : "text-black/55 dark:text-white/69 hover:text-black dark:hover:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                              }`}
                            >
                              <span className="flex-1 text-left">{m.label}</span>
                              {m.note && <span className="text-[9.5px] tracking-[0.03em] uppercase text-black/30 dark:text-white/55">{m.note}</span>}
                              {!m.disabled && model === m.id && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.4} />}
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex-1" />

                {/* Right actions — recording controls or mic/voice/publish */}
                <AnimatePresence mode="wait">
                  {recording && voiceMode ? (
                    // Modo voz grabando: el botón de la onda desaparecía por
                    // completo aquí (esta rama antes solo pintaba Cancelar/
                    // Enviar), así que "tocar la onda otra vez para terminar
                    // tu turno" era físicamente imposible — no había onda que
                    // tocar. Un solo botón, mismo onVoiceModeToggle de
                    // siempre: como grabando===true, ahí adentro ya sabe que
                    // significa "termina y manda".
                    <motion.div
                      key="rec-actions-voz"
                      initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1"
                    >
                      <button
                        onClick={onVoiceModeToggle}
                        aria-label="Terminar tu turno"
                        className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-black dark:bg-white text-white dark:text-black"
                      >
                        <Check className="w-[15px] h-[15px]" strokeWidth={2.2} />
                      </button>
                    </motion.div>
                  ) : recording ? (
                    <motion.div
                      key="rec-actions"
                      initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1"
                    >
                      <button
                        onClick={onCancelRecording}
                        className="h-7 px-3 rounded-full text-[11.5px] tracking-[-0.01em] text-black/40 dark:text-white/55 hover:text-black dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors border border-black/[0.08] dark:border-white/[0.13]"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={onSendRecording}
                        className="h-7 px-3 rounded-full text-[11.5px] tracking-[-0.01em] bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 transition-colors"
                      >
                        Enviar
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="mic-btn"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className="flex items-center gap-1"
                    >
                      <button
                        onClick={onStartRecording}
                        aria-label="Dictar"
                        className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-black/70 dark:text-white/87 hover:text-black dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors"
                      >
                        <Mic className="w-[15px] h-[15px]" strokeWidth={1.7} />
                      </button>
                      {onVoiceModeToggle && (
                        <button
                          onClick={onVoiceModeToggle}
                          aria-label={voiceMode ? "Salir del modo voz" : "Modo voz"}
                          className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                            voiceMode ? "bg-black/[0.07] dark:bg-white/[0.07] text-black dark:text-white" : "text-black/70 dark:text-white/87 hover:text-black dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                          }`}
                        >
                          <AnimatePresence mode="wait">
                            {voiceMode
                              ? <motion.span key="x" initial={{ opacity: 0, rotate: -45 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 45 }} transition={{ duration: 0.15 }}><X className="w-[15px] h-[15px]" strokeWidth={1.8} /></motion.span>
                              : <motion.span key="wave" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}><AudioWaveform className="w-[15px] h-[15px]" strokeWidth={1.7} /></motion.span>
                            }
                          </AnimatePresence>
                        </button>
                      )}
                      {actionsEndSlot}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Voice field — Canvas 2D at 60fps, ElevenLabs/Apple aesthetic */}
        <AnimatePresence>
          {voiceMode && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden"
            >
              <VoiceCanvas recording={recording} voiceMode={voiceMode} />

              {/* Grain / sand texture */}
              <div
                className="absolute inset-0 mix-blend-overlay pointer-events-none"
                style={{
                  opacity: 0.06,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                  backgroundSize: "160px 160px",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </div>
  );
}
