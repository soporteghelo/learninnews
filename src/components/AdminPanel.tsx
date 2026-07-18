import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import RichContent from './RichContent';
import * as XLSX from 'xlsx';
import {
  ChevronLeft, ChevronRight, Save, Trash2, Edit3,
  Plus, Copy, Search, BookOpen, HelpCircle,
  CheckCircle2, Loader2, Lock, Eye, EyeOff, RefreshCw,
  Wifi, WifiOff, ChevronDown, ChevronUp,
  FileText, Settings, Video, Link2, MessageSquare, Undo2,
  Wand2, Filter, FileSpreadsheet, LogOut, Printer, Users, TrendingUp, Award,
  ClipboardCheck, ClipboardList, ExternalLink, ToggleLeft, ToggleRight, Globe, ArrowUpDown, ArrowUp, ArrowDown,
  FileSignature, Mail, Send, X, Menu, PanelLeftClose
} from 'lucide-react';
import { ADMIN_CONFIG, AUDIENCE_CONFIG, getPublicBaseUrl } from '../config/app.config';
import {
  saveQuizToSheets, deleteQuizFromSheets,
  saveContentToSheets, deleteContentFromSheets,
  saveTopicToSheets, deleteTopicFromSheets,
  testSheetsConnection, testAppsScriptConnection,
  clearSheetCache, fetchAllIngresos, fetchAllCertificates, updateUserProfile,
  fetchShortEvals, createShortEval, updateShortEvalStatus, deleteShortEval, fetchAllShortResults,
  deleteShortEvalResult,
  fetchActaDocumentos, fetchActaFirmas, saveActaDocumento, deleteActaDocumento, resendActaCorreo,
} from '../services/sheetsService';
import type { IngresoRecord } from '../services/sheetsService';
import type {
  LearnTopic, DataChunk, QuizQuestion, QuizDraft,
  ContentDraft, TopicDraft, AdminTab, ConnectionTestResult, UserProgress, ShortEval, ShortEvalWrongAnswer,
  ActaDocumento, ActaFirma, ActaItem, AppDynamicConfig
} from '../types';
import { parseInicio, getISOWeek, isoWeekLabel, isoWeekKey } from '../lib/dateUtils';
import { matchNumericFilter } from '../lib/filterUtils';
import { buildFirmaRoster, buildItemRoster, type FirmaRosterRow } from '../lib/firmaRoster';
import { BarChart, Donut, ProgressBar } from './AdminCharts';
import html2pdf from 'html2pdf.js';
import { fetchDriveImageAsBase64 } from '../lib/driveImage';
import ActaDistribucionTemplate, { type DistribucionRow } from './ActaDistribucionTemplate';
import { useQrDataUrl } from '../hooks/useQrDataUrl';
import DiagnosticoPanel, { DiagnosticoButton } from './DiagnosticoPanel';

const ADMIN_AUTH_KEY = 'learndrive_admin_auth';

// Filas por página en tablas grandes (resultados de evals cortas y firmas de actas)
const TABLE_PAGE_SIZE = 25;

/** Paginador compacto para tablas grandes. */
function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * TABLE_PAGE_SIZE + 1;
  const to = Math.min(page * TABLE_PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[#f3f4f5]">
      <span className="text-[10px] text-[#737781]">{from}–{to} de {total}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}
          className="px-2 py-1 rounded-md bg-white border border-[#e1e3e4] text-[10px] font-bold text-[#424750] hover:bg-[#f3f4f5] disabled:opacity-40 disabled:cursor-not-allowed">‹ Ant.</button>
        <span className="text-[10px] font-bold text-[#424750] px-1">Pág. {page}/{totalPages}</span>
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
          className="px-2 py-1 rounded-md bg-white border border-[#e1e3e4] text-[10px] font-bold text-[#424750] hover:bg-[#f3f4f5] disabled:opacity-40 disabled:cursor-not-allowed">Sig. ›</button>
      </div>
    </div>
  );
}

/**
 * QR autogenerado del enlace de Drive del documento. Se muestra al asignar/listar documentos
 * y es el mismo QR que aparece en el acta de entrega (PDF).
 */
function QrPreview({ url, size = 96, caption }: { url: string; size?: number; caption?: string }) {
  const qr = useQrDataUrl(url, { size: Math.max(size * 2, 200) });
  if (!url) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-lg border-2 border-[#1b4d89] bg-white p-1" style={{ width: size, height: size }}>
        {qr
          ? <img src={qr} alt="QR del documento" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-4 h-4 text-[#1b4d89] animate-spin" /></div>}
      </div>
      {caption && <span className="text-[9px] text-[#737781] text-center leading-tight max-w-[110px]">{caption}</span>}
    </div>
  );
}

// Variables disponibles para interpolar en el cuerpo del acta
interface AdminPanelProps {
  topics: LearnTopic[];
  allChunks: DataChunk[];
  allQuizQuestions: QuizQuestion[];
  onBack: () => void;
  onRefreshData: () => Promise<void> | void;
  adminPass?: string;
  appConfig?: AppDynamicConfig | null;
}

export default function AdminPanel({
  topics,
  allChunks,
  allQuizQuestions,
  onBack,
  onRefreshData,
  adminPass,
  appConfig,
}: AdminPanelProps) {
  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem(ADMIN_AUTH_KEY) === 'true');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Navigation
  const [activeTab, setActiveTab] = useState<AdminTab>('topics');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [isTopicSelectorOpen, setIsTopicSelectorOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);

  // Topics management
  const [draftTopics, setDraftTopics] = useState<TopicDraft[]>([]);

  useEffect(() => {
    const hasUnsavedTopics = draftTopics.some(t => t._status !== 'unchanged');
    if (!hasUnsavedTopics) {
      setDraftTopics(topics.map(t => ({...t, _status: 'unchanged'})));
    }
  }, [topics]);

  // Content management
  const [draftContent, setDraftContent] = useState<ContentDraft[]>([]);
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  // Quiz management
  const [draftQuestions, setDraftQuestions] = useState<QuizDraft[]>([]);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [quizCategoryFilter, setQuizCategoryFilter] = useState<string>('');

  const handleCollapseAllQuestions = () => {
    setExpandedQuestions(new Set());
  };

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'topic' | 'content' | 'quiz'; id: string; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // General
  const [isSaving, setIsSaving] = useState(false);
  const [isExtracting, setIsExtracting] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(t);
  }, [statusMessage]);

  // Connection test
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<ConnectionTestResult | null>(null);
  const [showDiagnostico, setShowDiagnostico] = useState(false);

  // Markdown full-screen preview / editor
  const [previewChunkId, setPreviewChunkId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'preview' | 'edit' | 'blocks'>('preview');
  const [previewLocalContent, setPreviewLocalContent] = useState('');
  const [previewDirty, setPreviewDirty] = useState(false);
  const [previewSaving, setPreviewSaving] = useState(false);
  const mdPreviewScrollRef = useRef<HTMLDivElement>(null);
  const mdEditScrollRef = useRef<HTMLTextAreaElement>(null);

  const openPreview = (chunkId: string, content: string) => {
    setPreviewChunkId(chunkId);
    setPreviewLocalContent(content);
    setPreviewMode('preview');
    setPreviewDirty(false);
  };

  // Split content into deletable blocks (by --- separator or blank lines before headings/HTML)
  const splitIntoBlocks = (content: string): string[] => {
    // Primary split: explicit --- separators
    const bySeparator = content.split(/\n---+\n/);
    if (bySeparator.length > 1) return bySeparator.map(b => b.trim()).filter(Boolean);
    // Fallback: split before each top-level HTML block tag or Markdown heading
    const lines = content.split('\n');
    const blocks: string[] = [];
    let current: string[] = [];
    for (const line of lines) {
      const isBlockStart = /^#{1,3}\s/.test(line) || /^<(details|div|section|table|h[1-6]|p)\b/i.test(line);
      if (isBlockStart && current.join('').trim()) {
        blocks.push(current.join('\n').trim());
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.join('').trim()) blocks.push(current.join('\n').trim());
    return blocks.filter(Boolean);
  };

  const deleteBlock = (blockIndex: number) => {
    const blocks = splitIntoBlocks(previewLocalContent);
    blocks.splice(blockIndex, 1);
    const newContent = blocks.join('\n\n---\n\n');
    setPreviewLocalContent(newContent);
    setPreviewDirty(true);
    if (previewChunkId) handleUpdateContent(previewChunkId, { contenido: newContent });
  };

  const switchPreviewMode = (newMode: 'preview' | 'edit' | 'blocks') => {
    if (previewMode === newMode) return;
    let pct = 0;
    if (previewMode === 'preview' && mdPreviewScrollRef.current) {
      const el = mdPreviewScrollRef.current;
      const max = el.scrollHeight - el.clientHeight;
      pct = max > 0 ? el.scrollTop / max : 0;
    } else if (previewMode === 'edit' && mdEditScrollRef.current) {
      const el = mdEditScrollRef.current;
      const max = el.scrollHeight - el.clientHeight;
      pct = max > 0 ? el.scrollTop / max : 0;
    }
    setPreviewMode(newMode);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (newMode === 'edit' && mdEditScrollRef.current) {
        const el = mdEditScrollRef.current;
        el.scrollTop = pct * (el.scrollHeight - el.clientHeight);
      } else if (newMode === 'preview' && mdPreviewScrollRef.current) {
        const el = mdPreviewScrollRef.current;
        el.scrollTop = pct * (el.scrollHeight - el.clientHeight);
      }
    }));
  };

  const handlePrintPdf = (chunk: { tema: string; contexto: string; contenido: string }) => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>${chunk.tema}</title>
  <style>
    @page { margin: 20mm 18mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12pt; color: #111; line-height: 1.6; }
    header { border-bottom: 2px solid #1b4d89; padding-bottom: 8px; margin-bottom: 20px; }
    header .ctx { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #737781; }
    header h1 { font-size: 18pt; font-weight: 800; color: #1b4d89; margin: 4px 0 0; }
    h1,h2,h3,h4 { color: #1b4d89; margin-top: 1.2em; }
    h2 { font-size: 13pt; border-bottom: 1px solid #e1e3e4; padding-bottom: 4px; }
    h3 { font-size: 11pt; }
    p { margin: 0.6em 0; }
    ul, ol { padding-left: 1.4em; margin: 0.6em 0; }
    li { margin-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 10pt; }
    th { background: #1b4d89; color: #fff; padding: 6px 10px; text-align: left; }
    td { border: 1px solid #ccc; padding: 5px 10px; }
    tr:nth-child(even) td { background: #f5f7fa; }
    code { background: #f0f2f4; padding: 1px 5px; border-radius: 3px; font-size: 10pt; font-family: monospace; }
    pre { background: #f0f2f4; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 9.5pt; }
    blockquote { border-left: 4px solid #1b4d89; margin: 1em 0; padding: 6px 14px; background: #f5f7fa; color: #424750; }
    img { max-width: 100%; }
    footer { margin-top: 30px; border-top: 1px solid #e1e3e4; padding-top: 8px; font-size: 8pt; color: #737781; text-align: right; }
    @media print { a { color: inherit; text-decoration: none; } }
  </style>
</head>
<body>
  <header>
    <div class="ctx">${chunk.contexto}</div>
    <h1>${chunk.tema}</h1>
  </header>
  <div id="content"></div>
  <footer>LearnDrive — ${new Date().toLocaleDateString('es-PE', { day:'2-digit', month:'long', year:'numeric' })}</footer>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script>
    const raw = ${JSON.stringify(chunk.contenido)};
    document.getElementById('content').innerHTML = marked.parse(raw);
    window.onload = () => { window.print(); window.onafterprint = () => window.close(); };
  </script>
</body>
</html>`);
    win.document.close();
  };

  const handlePreviewSave = async () => {
    if (!previewChunkId) return;
    setPreviewSaving(true);
    const base = draftContent.find(c => c.cod === previewChunkId);
    if (!base) { setPreviewSaving(false); return; }
    const updated = { ...base, contenido: previewLocalContent, _status: 'modified' as const };
    try {
      const result = await saveContentToSheets([updated], selectedTopicId);
      if (result.success) {
        setDraftContent(prev => prev.map(c => c.cod === previewChunkId ? { ...c, contenido: previewLocalContent, _status: 'unchanged' as const } : c));
        setPreviewDirty(false);
        showToast('✓ Cambios guardados en Sheets');
      } else {
        showToast('Error al guardar', 'error');
      }
    } catch {
      showToast('Error al guardar', 'error');
    } finally {
      setPreviewSaving(false);
    }
  };

  // Progress tracking tab
  const [ingresoRecords, setIngresoRecords] = useState<IngresoRecord[]>([]);
  const [allCertificates, setAllCertificates] = useState<Record<string, Record<string, string>>>({});
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressSearch, setProgressSearch] = useState('');
  const [progressEmpresaFilter, setProgressEmpresaFilter] = useState('');
  const [progressPublicoFilter, setProgressPublicoFilter] = useState('');
  const [progressExpandedDni, setProgressExpandedDni] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<IngresoRecord | null>(null);
  const [editForm, setEditForm] = useState<{ dni: string; publico: string[]; correo: string }>({ dni: '', publico: [], correo: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  // Short Evaluaciones state
  const [shortEvals, setShortEvals] = useState<ShortEval[]>([]);
  const [shortEvalsLoading, setShortEvalsLoading] = useState(false);
  const [shortResults, setShortResults] = useState<Array<{ evaluacionId: string; dni: string; nombres: string; apellidos: string; nota: number; porcentaje: number; fechaHora: string; tema: string; preguntasErroneas: ShortEvalWrongAnswer[] }>>([]);
  // New eval form
  const [newEvalNombre, setNewEvalNombre] = useState('');
  const [newEvalDesc, setNewEvalDesc] = useState('');
  const [newEvalTopicId, setNewEvalTopicId] = useState('');
  const [newEvalChunkIds, setNewEvalChunkIds] = useState<string[]>([]);
  const [newEvalSaving, setNewEvalSaving] = useState(false);
  const [showNewEvalForm, setShowNewEvalForm] = useState(false);
  const [showResultsFor, setShowResultsFor] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [deletingResult, setDeletingResult] = useState<string | null>(null);
  // Sort & filter for the short-eval results table (only one table is visible at a time)
  type ResultsSortKey = 'dni' | 'nombre' | 'nota' | 'porcentaje' | 'fecha' | 'fallo';
  const [resultsSort, setResultsSort] = useState<{ key: ResultsSortKey; dir: 'asc' | 'desc' }>({ key: 'fecha', dir: 'asc' });
  const [resultsFilters, setResultsFilters] = useState<{ dni: string; nombre: string; nota: string; porcentaje: string; fecha: string; fallo: string }>(
    { dni: '', nombre: '', nota: '', porcentaje: '', fecha: '', fallo: '' }
  );
  const toggleResultsSort = (key: ResultsSortKey) => {
    setResultsSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };
  const [resultsPage, setResultsPage] = useState(1);
  // ===== Actas de Entrega / Compromisos =====
  const [actaDocs, setActaDocs] = useState<ActaDocumento[]>([]);
  const [actaFirmas, setActaFirmas] = useState<ActaFirma[]>([]);
  const [actasLoading, setActasLoading] = useState(false);
  const [showNewActaForm, setShowNewActaForm] = useState(false);
  const [editingActaId, setEditingActaId] = useState<string | null>(null);
  const [actaSaving, setActaSaving] = useState(false);
  // Cada documento es independiente: un ActaDocumento = un solo documento (items siempre length 1)
  const [actaForm, setActaForm] = useState<{
    titulo: string; descripcion: string; perfiles: string[]; dnis: string;
    driveUrl: string; tipo: 'virtual' | 'fisico';
    codigo: string; version: string; fechaVersion: string;
    requiereFirmaDibujada: boolean;
  }>({ titulo: '', descripcion: '', perfiles: [], dnis: '', driveUrl: '', tipo: 'virtual', codigo: '', version: '', fechaVersion: '', requiereFirmaDibujada: true });
  // true si el documento en edición tenía más de un item (modelo anterior) — se avisa que se colapsará a uno solo al guardar
  const [editingHasExtraItems, setEditingHasExtraItems] = useState(false);
  const [showFirmasFor, setShowFirmasFor] = useState<string | null>(null);
  const [resendingFirma, setResendingFirma] = useState<string | null>(null);
  // Sort & filter for the firmas table (one visible at a time)
  type FirmaSortKey = 'dni' | 'nombre' | 'estado' | 'fecha' | 'correo';
  const [firmaSort, setFirmaSort] = useState<{ key: FirmaSortKey; dir: 'asc' | 'desc' }>({ key: 'nombre', dir: 'asc' });
  const [firmaFilters, setFirmaFilters] = useState<{ dni: string; nombre: string; estado: string; fecha: string; correo: string }>(
    { dni: '', nombre: '', estado: '', fecha: '', correo: '' }
  );
  const toggleFirmaSort = (key: FirmaSortKey) => {
    setFirmaSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };
  const [firmaPage, setFirmaPage] = useState(1);
  // Límite incremental para la lista de usuarios (evita renderizar cientos de filas a la vez)
  const [progressLimit, setProgressLimit] = useState(30);

  // Lista de distribución por documento (item): key = `${docId}:${itemIndex}`
  const [generatingPdfKey, setGeneratingPdfKey] = useState<string | null>(null);
  const [distribucionData, setDistribucionData] = useState<{ item: ActaItem; documentoTitulo: string; rows: DistribucionRow[] } | null>(null);
  const distribucionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!distribucionData) return;
    const element = distribucionRef.current;
    if (!element) return;
    const slug = (distribucionData.item.nombre || 'documento').toUpperCase().replace(/[^A-Z0-9]/gi, '_').replace(/_+/g, '_').slice(0, 40);
    const opt = {
      margin: 5,
      filename: `LISTA_DISTRIBUCION_${slug}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' as const },
    };
    // @ts-ignore
    html2pdf().from(element).set(opt).save().finally(() => {
      setDistribucionData(null);
      setGeneratingPdfKey(null);
    });
  }, [distribucionData]);

  const handleGenerateDistribucion = async (doc: ActaDocumento, item: ActaItem, key: string) => {
    setGeneratingPdfKey(key);
    try {
      const roster = buildItemRoster(doc, item, actaFirmas, ingresoRecords).filter(r => r.firma);
      if (roster.length === 0) {
        showToast('Nadie ha firmado este documento todavía', 'error');
        setGeneratingPdfKey(null);
        return;
      }
      const rows: DistribucionRow[] = await Promise.all(roster.map(async (r): Promise<DistribucionRow> => {
        const [fotoBase64, firmaBase64] = await Promise.all([
          fetchDriveImageAsBase64(r.firma?.selfieUrl),
          fetchDriveImageAsBase64(r.firma?.firmaUrl),
        ]);
        return { ...r, fotoBase64: fotoBase64 || undefined, firmaBase64: firmaBase64 || undefined };
      }));
      setDistribucionData({ item, documentoTitulo: doc.titulo, rows });
    } catch {
      showToast('Error al generar la lista de distribución', 'error');
      setGeneratingPdfKey(null);
    }
  };

  // Toast notification
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load ingreso records + certificates when progress tab opens
  useEffect(() => {
    if (activeTab !== 'progress') return;
    if (ingresoRecords.length > 0) return;
    setProgressLoading(true);
    Promise.all([fetchAllIngresos(), fetchAllCertificates()]).then(([records, certs]) => {
      setIngresoRecords(records);
      setAllCertificates(certs);
      setProgressLoading(false);
    }).catch(() => setProgressLoading(false));
    // Vista 360°: precargar evals cortas y firmas de actas para el detalle por usuario
    if (shortResults.length === 0) fetchAllShortResults().then(setShortResults).catch(() => {});
    if (actaFirmas.length === 0) fetchActaFirmas().then(setActaFirmas).catch(() => {});
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'shortEvals') return;
    if (shortEvals.length > 0) return;
    setShortEvalsLoading(true);
    Promise.all([fetchShortEvals(), fetchAllShortResults()]).then(([evs, results]) => {
      setShortEvals(evs);
      setShortResults(results);
      setShortEvalsLoading(false);
    }).catch(() => setShortEvalsLoading(false));
  }, [activeTab]);

  const handleRefreshShortEvals = () => {
    setShortEvalsLoading(true);
    setShortEvals([]);
    Promise.all([fetchShortEvals(), fetchAllShortResults()]).then(([evs, results]) => {
      setShortEvals(evs);
      setShortResults(results);
      setShortEvalsLoading(false);
    }).catch(() => setShortEvalsLoading(false));
  };

  // ===== Actas: carga y handlers =====
  useEffect(() => {
    if (activeTab !== 'actas') return;
    // Cargar el roster de usuarios (para calcular pendientes por perfil) si aún no está
    if (ingresoRecords.length === 0) {
      fetchAllIngresos().then(setIngresoRecords).catch(() => {});
    }
    if (actaDocs.length > 0 || actaFirmas.length > 0) return;
    setActasLoading(true);
    Promise.all([fetchActaDocumentos(), fetchActaFirmas()]).then(([docs, firmas]) => {
      setActaDocs(docs);
      setActaFirmas(firmas);
      setActasLoading(false);
    }).catch(() => setActasLoading(false));
  }, [activeTab]);

  const handleRefreshActas = () => {
    setActasLoading(true);
    Promise.all([fetchActaDocumentos(), fetchActaFirmas()]).then(([docs, firmas]) => {
      setActaDocs(docs);
      setActaFirmas(firmas);
      setActasLoading(false);
    }).catch(() => setActasLoading(false));
  };

  const resetActaForm = () => {
    setActaForm({ titulo: '', descripcion: '', perfiles: [], dnis: '', driveUrl: '', tipo: 'virtual', codigo: '', version: '', fechaVersion: '', requiereFirmaDibujada: true });
    setEditingHasExtraItems(false);
    setEditingActaId(null);
    setShowNewActaForm(false);
  };

  const handleEditActa = (d: ActaDocumento) => {
    const first = d.items[0];
    setActaForm({
      titulo: d.titulo, descripcion: d.descripcion, perfiles: d.perfiles,
      dnis: d.dnisAsignados.join(', '),
      driveUrl: first?.driveUrl || d.driveDocUrl || '',
      tipo: first?.tipo || (first?.driveUrl ? 'virtual' : 'fisico'),
      codigo: first?.codigo || '', version: first?.version || '', fechaVersion: first?.fechaVersion || '',
      requiereFirmaDibujada: d.requiereFirmaDibujada,
    });
    setEditingHasExtraItems(d.items.length > 1);
    setEditingActaId(d.id);
    setShowNewActaForm(true);
  };

  const handleSaveActa = async () => {
    if (!actaForm.titulo.trim()) {
      showToast('El título del documento es obligatorio', 'error');
      return;
    }
    if (actaForm.perfiles.length === 0 && !actaForm.dnis.trim()) {
      showToast('Asigna al menos un perfil o un DNI', 'error');
      return;
    }
    setActaSaving(true);
    const id = editingActaId || `acta_${Date.now()}`;
    const dnisAsignados = actaForm.dnis.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    const tipo: 'virtual' | 'fisico' = actaForm.tipo === 'fisico' ? 'fisico' : 'virtual';
    // Cada documento es independiente: siempre exactamente un item, igual al propio documento
    const item: ActaItem = {
      nombre: actaForm.titulo.trim(),
      tipo,
      driveUrl: tipo === 'virtual' ? (actaForm.driveUrl.trim() || undefined) : undefined,
      codigo: actaForm.codigo.trim() || undefined,
      version: actaForm.version.trim() || undefined,
      fechaVersion: actaForm.fechaVersion.trim() || undefined,
    };
    const result = await saveActaDocumento({
      id,
      titulo: actaForm.titulo.trim(),
      descripcion: actaForm.descripcion.trim(),
      perfiles: actaForm.perfiles,
      dnisAsignados,
      cuerpoHtml: '',
      items: [item],
      driveDocUrl: '',
      requiereFirmaDibujada: actaForm.requiereFirmaDibujada,
      activo: true,
    });
    setActaSaving(false);
    if (result.success) {
      showToast(editingActaId ? 'Documento actualizado' : 'Documento creado');
      resetActaForm();
      handleRefreshActas();
    } else {
      showToast(result.message || 'Error al guardar', 'error');
    }
  };

  const handleDeleteActa = async (id: string) => {
    if (!window.confirm('¿Eliminar este documento? Las firmas ya registradas se conservan.')) return;
    setActaDocs(prev => prev.filter(d => d.id !== id));
    try { await deleteActaDocumento(id); showToast('Documento eliminado'); }
    catch { showToast('Error al eliminar', 'error'); handleRefreshActas(); }
  };

  const handleResendActa = async (firma: ActaFirma) => {
    setResendingFirma(firma.id);
    const result = await resendActaCorreo(firma.id, firma.correo);
    setResendingFirma(null);
    if (result.success) {
      showToast(`Correo reenviado a ${firma.correo}`);
      setActaFirmas(prev => prev.map(f => f.id === firma.id ? { ...f, correoEnviado: 'SI' } : f));
    } else {
      showToast(result.message || 'Error al reenviar', 'error');
    }
  };

  const handleExportFirmas = (doc: ActaDocumento, rows: FirmaRosterRow[]) => {
    const data = rows.map(r => ({
      'DNI': r.dni,
      'APELLIDOS Y NOMBRES': r.nombre,
      'CARGO': r.cargo,
      'AREA': r.area,
      'EMPRESA': r.empresa,
      'CORREO': r.correo,
      'ESTADO': r.firma ? 'FIRMADO' : 'PENDIENTE',
      'FECHA_FIRMA': r.firma?.fechaFirma || '',
      'CORREO_ENVIADO': r.firma?.correoEnviado || '',
      'ACTA_PDF': r.firma?.actaPdfUrl || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 26 }, { wch: 11 }, { wch: 22 }, { wch: 14 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Firmas');
    const slug = (doc.titulo || 'acta').toUpperCase().replace(/[^A-Z0-9]/gi, '_').replace(/_+/g, '_').slice(0, 30);
    XLSX.writeFile(wb, `FIRMAS_${slug}_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('✓ Firmas exportadas');
  };

  // Rosters de firmas memoizados por documento (evita recomputar en cada tecleo de filtro)
  const rostersByDoc = useMemo(() => {
    const map = new Map<string, FirmaRosterRow[]>();
    for (const d of actaDocs) map.set(d.id, buildFirmaRoster(d, actaFirmas, ingresoRecords));
    return map;
  }, [actaDocs, actaFirmas, ingresoRecords]);

  const handleCreateShortEval = async () => {
    if (!newEvalNombre.trim() || !newEvalTopicId) return;
    const topic = topics.find(t => t.id === newEvalTopicId);
    if (!topic) return;
    const id = `eval_${Date.now()}`;
    const newEval: ShortEval = {
      id,
      nombre: newEvalNombre.trim(),
      descripcion: newEvalDesc.trim(),
      topicId: newEvalTopicId,
      topicTitle: topic.title,
      chunkIds: newEvalChunkIds,
      activo: true,
      fechaCreacion: new Date().toLocaleString('es-PE'),
    };
    setNewEvalSaving(true);
    try {
      await createShortEval(newEval);
      setShortEvals(prev => [newEval, ...prev]);
      setNewEvalNombre(''); setNewEvalDesc(''); setNewEvalTopicId(''); setNewEvalChunkIds([]);
      setShowNewEvalForm(false);
      showToast('Evaluación creada exitosamente');
    } catch {
      showToast('Error al crear la evaluación. Verifica el Apps Script.', 'error');
    }
    setNewEvalSaving(false);
  };

  const handleToggleEvalActive = async (ev: ShortEval) => {
    try {
      await updateShortEvalStatus(ev.id, !ev.activo);
      setShortEvals(prev => prev.map(e => e.id === ev.id ? { ...e, activo: !e.activo } : e));
    } catch { showToast('Error al actualizar estado', 'error'); }
  };

  const handleDeleteShortEval = async (id: string) => {
    if (!confirm('¿Eliminar esta evaluación?')) return;
    try {
      await deleteShortEval(id);
      setShortEvals(prev => prev.filter(e => e.id !== id));
      showToast('Evaluación eliminada');
    } catch { showToast('Error al eliminar', 'error'); }
  };

  const handleDeleteShortResult = async (evaluacionId: string, dni: string) => {
    if (!confirm('¿Eliminar este registro de resultado? Podrá volver a rendir la evaluación.')) return;
    const key = `${evaluacionId}__${dni}`;
    setDeletingResult(key);
    try {
      await deleteShortEvalResult(evaluacionId, dni);
      setShortResults(prev => prev.filter(r => !(r.evaluacionId === evaluacionId && r.dni === dni)));
      if (expandedResult === key) setExpandedResult(null);
      showToast('Registro eliminado');
    } catch { showToast('Error al eliminar registro', 'error'); }
    finally { setDeletingResult(null); }
  };

  const getEvalLink = (id: string) =>
    `${getPublicBaseUrl()}#/eval/${id}`;

  const handleRefreshProgress = () => {
    setProgressLoading(true);
    setIngresoRecords([]);
    Promise.all([fetchAllIngresos(), fetchAllCertificates()]).then(([records, certs]) => {
      setIngresoRecords(records);
      setAllCertificates(certs);
      setProgressLoading(false);
    }).catch(() => setProgressLoading(false));
  };

  const handleOpenEditUser = (record: IngresoRecord) => {
    setEditingUser(record);
    setEditForm({
      dni: record.dni,
      publico: (record.publico || '').split(',').map(p => p.trim()).filter(Boolean),
      correo: record.correo || '',
    });
  };

  const handleSaveUserProfile = async () => {
    if (!editingUser) return;
    const nuevoDni = editForm.dni.trim();
    if (!nuevoDni) { showToast('El DNI no puede estar vacío', 'error'); return; }

    setSavingProfile(true);
    try {
      const result = await updateUserProfile({
        dni: editingUser.dni,
        nuevoDni: nuevoDni !== editingUser.dni ? nuevoDni : undefined,
        publico: editForm.publico.join(', '),
        correo: editForm.correo.trim(),
      });
      if (result.success) {
        const finalDni = result.dni || nuevoDni;
        setIngresoRecords(prev => prev.map(r => r.dni === editingUser.dni
          ? { ...r, dni: finalDni, publico: editForm.publico.join(', '), correo: editForm.correo.trim() }
          : r));
        if (progressExpandedDni === editingUser.dni) setProgressExpandedDni(finalDni);
        showToast('Perfil actualizado correctamente');
        setEditingUser(null);
      } else {
        showToast(result.message || 'No se pudo actualizar el perfil', 'error');
      }
    } catch {
      showToast('Error al actualizar el perfil', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // Auth
  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const targetPass = adminPass || ADMIN_CONFIG.password;
    if (password === targetPass) {
      sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
      setIsAuthenticated(true);
      setError(null);
    } else {
      setError('Contraseña incorrecta');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    setIsAuthenticated(false);
    onBack();
  };

  // Load data for selected topic
  const lastSelectedTopicIdRef = useRef<string>('');

  useEffect(() => {
    if (selectedTopicId) {
      const topicIdChanged = lastSelectedTopicIdRef.current !== selectedTopicId;
      lastSelectedTopicIdRef.current = selectedTopicId;

      const hasUnsavedContent = draftContent.some(c => c._status !== 'unchanged');
      const hasUnsavedQuiz = draftQuestions.some(q => q._status !== 'unchanged');

      if (topicIdChanged || !hasUnsavedContent) {
        const existingChunks = allChunks
          .filter(c => c.idMain === selectedTopicId)
          .map(c => ({ ...c, _status: 'unchanged' as const }));
        setDraftContent(existingChunks);
      }

      if (topicIdChanged || !hasUnsavedQuiz) {
        // Quiz IdMain references LEARN.Id (topic ID)
        const existingQuiz = allQuizQuestions
          .filter(q => q.idMain === selectedTopicId)
          .map(q => ({ ...q, _status: 'unchanged' as const }));
        setDraftQuestions(existingQuiz);
      }

      if (topicIdChanged) {
        setExpandedChunks(new Set());
        setExpandedQuestions(new Set());
        setQuizCategoryFilter('');
      }
    } else {
      lastSelectedTopicIdRef.current = '';
      setDraftContent([]);
      setDraftQuestions([]);
    }
    setStatusMessage(null);
    setError(null);
  }, [selectedTopicId, allChunks, allQuizQuestions]);

  const selectedTopic = topics.find(t => t.id === selectedTopicId);
  const topicChunks = allChunks.filter(c => c.idMain === selectedTopicId);

  // ========== CONNECTION TEST ==========
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResults(null);
    const [sheets, appsScript] = await Promise.all([
      testSheetsConnection(),
      testAppsScriptConnection(),
    ]);
    setTestResults({ sheetsRead: sheets, appsScript, geminiApi: { ok: true } });
    setIsTesting(false);
  };

  const toggleQuestionExpand = (id: string) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ========== AI PROMPT GENERATION ==========

  const handleGenerateAiPrompt = async (c: ContentDraft) => {
    if (!c.pdf) {
      setError('❌ No hay una URL de PDF configurada.');
      return;
    }

    setIsExtracting(c.cod);
    setError(null);
    setStatusMessage(null);
    
    try {
      console.log('--- Iniciando Extracción Local (Tecnología Extractor) ---', c.pdf);
      
      const response = await fetch('/api/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveUrl: c.pdf })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error en el servidor local de extracción');
      }

      const data = await response.json();
      const text = data.text;

      if (!text || text.length < 10) {
        throw new Error('No se pudo extraer texto suficiente del PDF.');
      }

      const promptTemplate = `Elabora un cuestionario en texto plano basado en el contenido que adjuntaré. El cuestionario debe cumplir con las siguientes condiciones:

Incluir preguntas de opción múltiple con 4 alternativas cada una.
Solo una alternativa debe ser correcta.
Indicar claramente cuál es la respuesta correcta en cada pregunta.
Proporcionar un feedback detallado, claro y contundente para cada pregunta, explicando por qué la respuesta correcta es válida y por qué las demás no lo son.
Mantener un nivel de dificultad intermedio a avanzado, priorizando el análisis, la comprensión profunda y la aplicación del contenido.

CONTENIDO:
${text}`;

      // Copiar al portapapeles
      await navigator.clipboard.writeText(promptTemplate);
      
      const successMsg = '✅ ¡Éxito! Prompt generado y copiado al portapapeles.';
      setStatusMessage({ type: 'success', text: successMsg });
      window.alert(successMsg + "\n\nYa puedes pegarlo en tu IA favorita.");

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('Extraction Error:', err);
      setError('Error en el generador: ' + errMsg);
      window.alert("❌ Falló la extracción: " + errMsg + "\n\nTip: Asegúrate de haber reiniciado el servidor (npm run dev) tras los cambios.");
    } finally {
      setIsExtracting(null);
    }
  };

  const handleGenerateContentPrompt = async (c: ContentDraft) => {
    if (!c.pdf) {
      setError('❌ No hay una URL de PDF configurada.');
      return;
    }

    setIsExtracting(`content-${c.cod}`);
    setError(null);
    setStatusMessage(null);
    
    try {
      console.log('--- Iniciando Extracción Local (Tecnología Extractor) ---', c.pdf);
      
      const response = await fetch('/api/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveUrl: c.pdf })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error en el servidor local de extracción');
      }

      const data = await response.json();
      const text = data.text;

      if (!text || text.length < 10) {
        throw new Error('No se pudo extraer texto suficiente del PDF.');
      }

      const promptTemplate = `Actúa como un editor experto en documentación corporativa, capacitación empresarial y diseño de contenido interactivo.

Tu tarea es reescribir y estructurar el contenido que te proporcionaré para que sea más claro, profesional, atractivo y fácil de comprender, manteniendo absolutamente toda la información original, debe sonar amigable.

OBJETIVO

- Mejorar la redacción, gramática, fluidez y coherencia.
- Mantener intacto el significado del contenido.
- No omitir información.
- No agregar información que no exista en el texto original.
- Organizar las ideas con una estructura visual moderna y fácil de leer.
- Que suene amigable y fácil de digerir, sin perder profesionalismo.

PASO OBLIGATORIO ANTES DE GENERAR EL RESULTADO

Antes de procesar el contenido, debes preguntarme exactamente:

"¿Deseas recibir el resultado en Markdown interactivo o en HTML interactivo?"
"Resumido o igual que el original?"

No generes el contenido hasta que responda.

OPCIÓN 1: MARKDOWN INTERACTIVO

Si elijo Markdown:

- Entrega TODO el contenido dentro de un único bloque de código usando triple backticks (\`\`\`).
- El Markdown NO debe renderizarse.
- Debe visualizarse como texto plano mostrando explícitamente símbolos como:
  - #
  - ##
  - ###
  - >
  - -
  - **

La estructura debe incluir, cuando corresponda:

# Título principal
Descripcion breve del contenido y su propósito.

## Subtítulos

### Subsecciones

- Listas con viñetas
- Listas numeradas
- Tablas en formato Markdown
- Bloques de notas
- Bloques de observaciones
- Comentarios explicativos
- Ejemplos
- Advertencias
- Recomendaciones
- Resúmenes parciales
- Elementos visuales en texto que mejoren la comprensión

El contenido debe verse dinámico y organizado, evitando grandes bloques de texto.


OPCIÓN 2: HTML INTERACTIVO

Si elijo HTML:

Genera un documento HTML completo e independiente.

Debe incluir:

- HTML5 válido
- CSS integrado
- Diseño moderno y profesional
- Responsive para móviles y escritorio
- Tipografía agradable
- Tarjetas visuales
- Secciones colapsables (acordeones)
- Pestañas cuando sea útil
- Tablas estilizadas
- Cuadros informativos
- Cuadros de advertencia
- Cuadros de recomendaciones
- Iconografía mediante emojis o caracteres Unicode
- Colores corporativos elegantes
- Sombras suaves y bordes modernos
- Navegación visual clara
- Comentarios explicativos dentro del código HTML
- Elementos interactivos que no requieran librerías externas

Si el contenido lo permite, también puedes incorporar:

- Descripcion breve del contenido y su propósito.
- Diagramas simples con HTML/CSS
- Líneas de tiempo
- Tarjetas de proceso
- Flujos visuales
- Indicadores de estado
- Barras de progreso
- Comparativas visuales

ESTILO DE REDACCIÓN

- Profesional y amigable.
- Cercano y fácil de entender.
- Natural y humano.
- Explicativo sin ser excesivamente técnico.
- Orientado al aprendizaje y la capacitación.

FORMATO DEL TEXTO

- Usar negritas para conceptos importantes.
- Usar cursivas para enfatizar ideas relevantes.
- Mantener una jerarquía visual clara.
- Utilizar párrafos breves.
- Favorecer la lectura rápida.
- Mejorar las transiciones entre ideas.

RESTRICCIONES

- Usa transiciones y/o efectos de modo que quede el aprendizaje en el lector.
- No omitir información.
- No inventar información.
- No agregar conclusiones no presentes en el texto original.
- No explicar lo que hiciste.
- No incluir texto fuera del formato solicitado.
- Esperar siempre mi elección entre Markdown interactivo y HTML interactivo antes de generar el resultado.
- No agregues un header principal al inicio, de frente al contenido.
- Si el codigo html es muy extenso, damelo por partes, de modo que lo que al pegar la parte 1 de tu código, le hago un enter y pego la parte 3 y asi sucesivamente, hasta completar el html, y no se rompa el codigo.

CONTENIDO:
${text}`;

      // Copiar al portapapeles
      await navigator.clipboard.writeText(promptTemplate);
      
      const successMsg = '✅ ¡Éxito! Prompt de contenido generado y copiado al portapapeles.';
      setStatusMessage({ type: 'success', text: successMsg });
      window.alert(successMsg + "\n\nYa puedes pegarlo en tu IA favorita.");

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('Extraction Error:', err);
      setError('Error en el generador: ' + errMsg);
      window.alert("❌ Falló la extracción: " + errMsg + "\n\nTip: Asegúrate de haber reiniciado el servidor (npm run dev) tras los cambios.");
    } finally {
      setIsExtracting(null);
    }
  };

  // ========== CONTENT CRUD ==========
  const handleUpdateContent = (cod: string, updates: Partial<DataChunk>) => {
    setDraftContent(prev => prev.map(c => {
      if (c.cod === cod) {
        return { ...c, ...updates, _status: c._status === 'new' ? 'new' : 'modified' };
      }
      return c;
    }));
  };

  const handleDeleteContent = (cod: string) => {
    const c = draftContent.find(dc => dc.cod === cod);
    if (!c) return;
    setConfirmDelete({ type: 'content', id: cod, label: c.tema || cod });
  };

  // ========== TOPIC CRUD ==========
  const handleUpdateTopic = (id: string, updates: Partial<TopicDraft>) => {
    setDraftTopics(prev => prev.map(t => {
      if (t.id === id) {
        return { ...t, ...updates, _status: t._status === 'new' ? 'new' : 'modified' };
      }
      return t;
    }));
  };

  const handleDeleteTopic = (id: string) => {
    const t = draftTopics.find(dt => dt.id === id);
    if (!t) return;
    setConfirmDelete({ type: 'topic', id, label: t.title || id });
  };

  const handleAddTopicManual = () => {
    const newT: TopicDraft = {
      id: `MOD-${Date.now()}`,
      title: 'Nuevo Módulo...',
      audience: 'Todos',
      details: '',
      summary: '',
      keyPoints: [],
      order: draftTopics.length + 1,
      active: true,
      _status: 'new',
    };
    setDraftTopics(prev => [...prev, newT]);
    setSelectedTopicId(newT.id);
    setActiveTab('topics');
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    setIsDeleting(true);
    setError(null);

    try {
      if (type === 'topic') {
        const t = draftTopics.find(dt => dt.id === id);
        if (t?._status === 'new') {
          setDraftTopics(prev => prev.filter(dt => dt.id !== id));
        } else {
          const result = await deleteTopicFromSheets([id]);
          if (!result.success) {
            setError(`Error al eliminar: ${result.message}`);
            setIsDeleting(false);
            setConfirmDelete(null);
            return;
          }
          setDraftTopics(prev => prev.filter(dt => dt.id !== id));
          setStatusMessage({ type: 'success', text: 'Módulo eliminado' });
          if (selectedTopicId === id) setSelectedTopicId('');
          clearSheetCache('all');
          await onRefreshData();
        }
      } else if (type === 'content') {
        const c = draftContent.find(dc => dc.cod === id);
        if (c?._status === 'new') {
          setDraftContent(prev => prev.filter(dc => dc.cod !== id));
        } else {
          const result = await deleteContentFromSheets([id]);
          if (!result.success) {
            setError(`Error al eliminar: ${result.message}`);
            setIsDeleting(false);
            setConfirmDelete(null);
            return;
          }
          setDraftContent(prev => prev.filter(dc => dc.cod !== id));
          setStatusMessage({ type: 'success', text: 'Contenido eliminado' });
        }
      } else {
        const q = draftQuestions.find(dq => dq.idQuiz === id);
        if (q?._status === 'new') {
          setDraftQuestions(prev => prev.filter(dq => dq.idQuiz !== id));
        } else {
          const result = await deleteQuizFromSheets([id]);
          if (!result.success) {
            setError(`Error al eliminar: ${result.message}`);
            setIsDeleting(false);
            setConfirmDelete(null);
            return;
          }
          setDraftQuestions(prev => prev.filter(dq => dq.idQuiz !== id));
          setStatusMessage({ type: 'success', text: 'Pregunta eliminada' });
        }
      }
    } catch (err) {
      setError(`Error al eliminar: ${err instanceof Error ? err.message : 'desconocido'}`);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  };

  const handleAddContentManual = () => {
    const newId = `NEW-${Date.now()}`;
    const newC: ContentDraft = {
      cod: newId,
      idMain: selectedTopicId,
      tema: 'Nueva sección...',
      contenido: '',
      videos: [],
      contexto: 'Teórico',
      order: draftContent.length + 1,
      _status: 'new',
    };
    setDraftContent(prev => [...prev, newC]);
    setExpandedChunks(prev => {
      const next = new Set(prev);
      next.add(newId);
      return next;
    });

    // Smooth scroll to newly created content
    setTimeout(() => {
      const newCard = document.querySelector(`[data-content-card="${newId}"]`);
      if (newCard) {
        newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  };

  // ========== QUIZ CRUD ==========
  const handleUpdateQuestion = (id: string, updates: Partial<QuizQuestion>) => {
    setDraftQuestions(prev => prev.map(q => {
      if (q.idQuiz === id) {
        return { ...q, ...updates, _status: q._status === 'new' ? 'new' : 'modified' };
      }
      return q;
    }));
  };

  const handleDeleteQuestion = (id: string) => {
    const q = draftQuestions.find(dq => dq.idQuiz === id);
    if (!q) return;
    setConfirmDelete({ type: 'quiz', id, label: q.question || id });
  };

  const handleAddQuizManual = () => {
    const newId = `NEW-${Date.now()}`;
    const newQ: QuizDraft = {
      idQuiz: newId,
      idMain: selectedTopicId,
      question: '',
      optionA: '', optionB: '', optionC: '', optionD: '',
      correctAnswer: 'A',
      explanation: '',
      difficulty: 'Media',
      categoriaContenido: '',
      _status: 'new',
    };
    setDraftQuestions(prev => [...prev, newQ]);

    // Smooth scroll to newly created question
    setTimeout(() => {
      const newCard = document.querySelector(`[data-question-card="${newId}"]`);
      if (newCard) {
        newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  };


  // ========== SAVE ALL ==========
  const handleSaveTopics = async () => {
    setIsSaving(true);
    setError(null);
    const toSave = draftTopics.filter(t => t._status === 'new' || t._status === 'modified');
    try {
      if (toSave.length > 0) {
        const result = await saveTopicToSheets(toSave);
        if (!result.success) {
          setError(`Error al guardar temas: ${result.message}`);
          setIsSaving(false);
          return;
        }
      }
      setStatusMessage({ type: 'success', text: 'Módulos sincronizados correctamente' });
      showToast('✓ Módulos guardados correctamente');
      setDraftTopics(prev => prev.map(t => ({ ...t, _status: 'unchanged' as const })));
      clearSheetCache('topics');
      await onRefreshData();
    } catch (err) {
      setError(`Error al sincronizar temas: ${err instanceof Error ? err.message : 'desconocido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveContent = async () => {
    setIsSaving(true);
    setError(null);
    const toSave = draftContent.filter(c => c._status === 'new' || c._status === 'modified');

    try {
      if (toSave.length > 0) {
        const saveResult = await saveContentToSheets(toSave, selectedTopicId);
        if (!saveResult.success) {
          setError(`Error al guardar: ${saveResult.message}`);
          setIsSaving(false);
          return;
        }
      }
      setStatusMessage({ type: 'success', text: 'Contenido sincronizado con Google Sheets' });
      showToast('✓ Contenido guardado correctamente');
      setDraftContent(prev => prev
        .map(c => ({ ...c, _status: 'unchanged' as const })));
      clearSheetCache('chunks');
      await onRefreshData();
    } catch (err) {
      setError(`Error al sincronizar: ${err instanceof Error ? err.message : 'desconocido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveQuiz = async () => {
    // Validate all questions have complete fields
    const toSave = draftQuestions.filter(q => q._status === 'new' || q._status === 'modified');

    const incomplete = toSave.find(q =>
      !q.question.trim() || !q.optionA.trim() || !q.optionB.trim() ||
      !q.optionC.trim() || !q.optionD.trim() || !q.idMain.trim()
    );
    if (incomplete) {
      setError('Completa todos los campos de cada pregunta antes de guardar (pregunta, 4 opciones y sección).');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (toSave.length > 0) {
        const saveResult = await saveQuizToSheets(toSave, selectedTopicId);
        if (!saveResult.success) {
          setError(`Error al guardar: ${saveResult.message}`);
          setIsSaving(false);
          return;
        }
      }
      setStatusMessage({ type: 'success', text: 'Quiz sincronizado con Google Sheets' });
      showToast('✓ Quiz guardado correctamente');
      setDraftQuestions(prev => prev
        .map(q => ({ ...q, _status: 'unchanged' as const })));
      clearSheetCache('quiz');
      await onRefreshData();
    } catch (err) {
      setError(`Error al sincronizar: ${err instanceof Error ? err.message : 'desconocido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ========== COPY CSV ==========
  const handleCopyContentCSV = () => {
    const active = draftContent;
    const headers = 'Cod,IdMain,Tema,Contenido,Video_1,Video_2,Video_3,ComentarioVideo,PDF,Contexto,Orden';
    const rows = active.map(c =>
      `"${c.cod}","${c.idMain}","${c.tema}","${c.contenido.replace(/"/g, '""')}","${c.videos?.[0] || ''}","${c.videos?.[1] || ''}","${c.videos?.[2] || ''}","${(c.comentarioVideo || '').replace(/"/g, '""')}","${c.pdf || ''}","${c.contexto}","${c.order}"`
    ).join('\n');
    navigator.clipboard.writeText(`${headers}\n${rows}`);
    setStatusMessage({ type: 'success', text: 'Contenido copiado al portapapeles (CSV)' });
  };

  const handleCopyQuizCSV = () => {
    const active = draftQuestions;
    const headers = 'IdQuiz,IdMain,Pregunta,OpcionA,OpcionB,OpcionC,OpcionD,RespuestaCorrecta,Explicacion,Dificultad';
    const rows = active.map(q =>
      `"${q.idQuiz}","${q.idMain}","${q.question}","${q.optionA}","${q.optionB}","${q.optionC}","${q.optionD}","${q.correctAnswer}","${q.explanation}","${q.difficulty}"`
    ).join('\n');
    navigator.clipboard.writeText(`${headers}\n${rows}`);
    setStatusMessage({ type: 'success', text: 'Quiz copiado al portapapeles (CSV)' });
  };

  const handleDownloadQuizTemplate = () => {
    const headers = [
      'Pregunta',
      'OpcionA',
      'OpcionB',
      'OpcionC',
      'OpcionD',
      'RespuestaCorrecta',
      'Explicacion',
      'Dificultad',
      'Categoria_contenido'
    ];

    const data = [
      headers,
      [
        '¿Cuál es el primer paso ante una emergencia?',
        'Mantener la calma y evacuar',
        'Gritar',
        'Correr hacia la salida de inmediato sin ver a los lados',
        'Esconderse',
        'A',
        'La calma y evacuación ordenada salvan vidas.',
        'Fácil',
        'GESTIÓN DE RIESGOS Y VISIÓN ZERO HARM'
      ],
      [
        '¿Qué significa EPP?',
        'Equipo de Protección Personal',
        'Equipo de Poder Primario',
        'Estación de Pasos Preventivos',
        'Ninguno',
        'A',
        'EPP es el Equipo de Protección Personal.',
        'Media',
        'CONCEPTOS BASICOS'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 45 },
      { wch: 25 },
      { wch: 25 },
      { wch: 25 },
      { wch: 25 },
      { wch: 18 },
      { wch: 40 },
      { wch: 12 },
      { wch: 35 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Quizzes');
    XLSX.writeFile(wb, `plantilla_quizzes_${selectedTopicId || 'general'}.xlsx`);
    
    showToast('✓ Plantilla Excel (.xlsx) descargada');
  };

  const handleImportQuizExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows = XLSX.utils.sheet_to_json(worksheet) as any[];
        
        let importedCount = 0;
        const updatedQuestions = [...draftQuestions];

        rows.forEach((row, index) => {
          const question = (row.Pregunta || row.pregunta || row.Question || row.question || '').toString().trim();
          const optionA = (row.OpcionA || row.opcionA || row.optionA || '').toString().trim();
          const optionB = (row.OpcionB || row.opcionB || row.optionB || '').toString().trim();
          const optionC = (row.OpcionC || row.opcionC || row.optionC || '').toString().trim();
          const optionD = (row.OpcionD || row.opcionD || row.optionD || '').toString().trim();
          
          let correctAnswer = (row.RespuestaCorrecta || row.respuestaCorrecta || row.correctAnswer || row.CorrectAnswer || 'A').toString().trim().toUpperCase();
          if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
            correctAnswer = 'A';
          }
          
          const explanation = (row.Explicacion || row.explicacion || row.explanation || '').toString().trim();
          let difficulty = (row.Dificultad || row.dificultad || row.difficulty || 'Media').toString().trim();
          if (!['Fácil', 'Media', 'Difícil'].includes(difficulty)) {
            difficulty = 'Media';
          }

          const categoriaContenido = (row.Categoria_contenido || row.categoria_contenido || row.categoriaContenido || row.CategoriaContenido || '').toString().trim();

          if (!question) return;

          const newDraft: QuizDraft = {
            idQuiz: `NEW-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`,
            idMain: selectedTopicId,
            question,
            optionA,
            optionB,
            optionC,
            optionD,
            correctAnswer: correctAnswer as 'A' | 'B' | 'C' | 'D',
            explanation,
            difficulty: difficulty as 'Fácil' | 'Media' | 'Difícil',
            categoriaContenido,
            _status: 'new' as const
          };

          updatedQuestions.push(newDraft);
          importedCount++;
        });

        setDraftQuestions(updatedQuestions);
        event.target.value = '';
        showToast(`✓ Importado exitosamente: ${importedCount} nuevas preguntas. ¡No olvides sincronizar!`);
      } catch (err) {
        setError(`Error al leer archivo Excel: ${err instanceof Error ? err.message : 'desconocido'}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ========== UNDO UNSAVED CHANGES ==========
  const handleUndoTopics = () => {
    setDraftTopics(topics.map(t => ({...t, _status: 'unchanged' as const})));
    setStatusMessage({ type: 'success', text: 'Cambios de módulos descartados' });
  };

  const handleUndoContent = () => {
    const existingChunks = allChunks
      .filter(c => c.idMain === selectedTopicId)
      .map(c => ({ ...c, _status: 'unchanged' as const }));
    setDraftContent(existingChunks);
    setExpandedChunks(new Set());
    setStatusMessage({ type: 'success', text: 'Cambios de contenido descartados' });
  };

  const handleUndoQuiz = () => {
    const existingQuiz = allQuizQuestions
      .filter(q => q.idMain === selectedTopicId)
      .map(q => ({ ...q, _status: 'unchanged' as const }));
    setDraftQuestions(existingQuiz);
    setStatusMessage({ type: 'success', text: 'Cambios de quiz descartados' });
  };

  const toggleChunkExpand = (cod: string) => {
    setExpandedChunks(prev => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod); else next.add(cod);
      return next;
    });
  };

  // ========== AUTH SCREEN ==========
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#f8f9fa]">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md bg-white rounded-2xl p-10 border-2 border-[#e1e3e4] shadow-[0_8px_32px_rgba(0,27,60,0.08)]">
          <div className="w-20 h-20 bg-[#1b4d89]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="w-10 h-10 text-[#1b4d89]" />
          </div>
          <h1 className="text-xl font-bold text-[#00366b] text-center mb-2">Admin Control Center</h1>
          <p className="text-[#424750] text-sm text-center mb-8">Ingresa la contraseña para acceder al panel de gestión.</p>
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                placeholder="Contraseña de administrador"
                className="w-full bg-[#f8f9fa] border-b-2 border-[#c3c6d1] focus:border-[#1b4d89] px-1 py-4 text-[#191c1d] text-base outline-none transition-all pr-12"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#737781] hover:text-[#1b4d89] rounded-lg transition-colors">
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {error && <p className="text-[#ba1a1a] text-sm font-semibold text-center bg-[#ffdad6]/20 py-2 rounded-lg">{error}</p>}
            <button type="submit" className="w-full bg-gradient-to-r from-[#00366b] to-[#1b4d89] text-[#ffffff] py-4 rounded-xl text-base font-bold shadow-lg shadow-[#1b4d89]/20 hover:scale-[1.02] active:scale-[0.98] transition-all">Acceder al Panel</button>
            <button type="button" onClick={onBack} className="w-full text-[#737781] text-sm font-semibold hover:text-[#00366b] transition-colors">Volver</button>
          </form>
        </motion.div>
      </div>
    );
  }

  const activeContentCount = draftContent.length;
  const activeQuizCount = draftQuestions.length;
  const contentChanges = draftContent.filter(c => c._status !== 'unchanged').length;
  const quizChanges = draftQuestions.filter(q => q._status !== 'unchanged').length;

  const filteredQuestions = draftQuestions.filter(q => {
    if (quizCategoryFilter === '__SIN_CATEGORIA__') {
      return !q.categoriaContenido || q.categoriaContenido.trim() === '';
    }
    if (quizCategoryFilter) {
      return q.categoriaContenido === quizCategoryFilter;
    }
    return true;
  });

  // ========== PROGRESS TAB COMPUTED VALUES ==========
  const parseUserProgress = (json: string): UserProgress[] => {
    try { return JSON.parse(json) || []; } catch { return []; }
  };

  const filteredIngresos = ingresoRecords.filter(r => {
    const search = progressSearch.toLowerCase();
    if (search && !`${r.nombres} ${r.apellidos} ${r.dni}`.toLowerCase().includes(search)) return false;
    if (progressEmpresaFilter && r.empresa !== progressEmpresaFilter) return false;
    if (progressPublicoFilter && r.publico !== progressPublicoFilter) return false;
    return true;
  });

  const empresasOptions = [...new Set(ingresoRecords.map(r => r.empresa).filter(Boolean))].sort() as string[];
  const publicoOptions = [...new Set(ingresoRecords.map(r => r.publico).filter(Boolean))].sort() as string[];

  const avgAvance = ingresoRecords.length === 0 ? 0 : Math.round(
    ingresoRecords.reduce((sum, r) => sum + (parseFloat(r.avance?.replace('%', '') || '0') || 0), 0) / ingresoRecords.length
  );
  const allQuizScores = ingresoRecords.flatMap(r => {
    try { return (JSON.parse(r.progressJson) as UserProgress[]).filter(p => p.quizScore !== undefined).map(p => p.quizScore!); }
    catch { return [] as number[]; }
  });
  const avgNota = allQuizScores.length === 0 ? '—' : `${Math.round(allQuizScores.reduce((a, b) => a + b, 0) / allQuizScores.length / 20 * 100)}%`;

  // Analíticas del panel (distribución de notas, registros por semana, aprobación)
  const progressAnalytics = useMemo(() => {
    const buckets = [
      { label: '0–10', color: '#ef4444', value: 0 },
      { label: '11–13', color: '#f59e0b', value: 0 },
      { label: '14–15', color: '#3b82f6', value: 0 },
      { label: '16–17', color: '#14b8a6', value: 0 },
      { label: '18–20', color: '#10b981', value: 0 },
    ];
    const weekMap = new Map<string, { key: string; label: string; value: number }>();
    let approved = 0, evaluated = 0;
    for (const r of filteredIngresos) {
      let scores: number[] = [];
      try { scores = (JSON.parse(r.progressJson || '[]') as UserProgress[]).filter(p => p.quizScore !== undefined).map(p => p.quizScore!); } catch { /* ignore */ }
      if (scores.length) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const idx = avg >= 18 ? 4 : avg >= 16 ? 3 : avg >= 14 ? 2 : avg >= 11 ? 1 : 0;
        buckets[idx].value++;
        evaluated++;
        if (avg >= 14) approved++;
      }
      const d = parseInicio(r.inicio);
      if (d) {
        const key = isoWeekKey(d);
        if (!weekMap.has(key)) weekMap.set(key, { key, label: `S${getISOWeek(d)}`, value: 0 });
        weekMap.get(key)!.value++;
      }
    }
    const weeks = Array.from(weekMap.values()).sort((a, b) => a.key.localeCompare(b.key)).slice(-8);
    return { buckets, weeks, approved, notApproved: evaluated - approved, evaluated };
  }, [filteredIngresos]);

  const handleExportProgressExcel = () => {
    const rows = filteredIngresos.map(r => {
      const prog = parseUserProgress(r.progressJson);
      const row: Record<string, any> = {
        'Apellidos': r.apellidos,
        'Nombres': r.nombres,
        'DNI': r.dni,
        'Empresa': r.empresa,
        'Área': r.area,
        'Cargo': r.cargo,
        'Público': r.publico,
        'Avance General': r.avance,
        'Nota General': r.nota,
        'Último Acceso': r.ultimoAcceso,
        'Correo': r.correo,
        'Celular': r.celular,
      };
      topics.forEach(topic => {
        const tp = prog.find(p => p.topicId === topic.id);
        const totalChunks = allChunks.filter(c => c.idMain === topic.id).length;
        const pct = tp ? (tp.completed ? 100 : Math.min(100, Math.round(((tp.currentChunk || 0) / Math.max(totalChunks, 1)) * 100))) : 0;
        row[`${topic.title} - Avance`] = `${pct}%`;
        row[`${topic.title} - Nota`] = tp?.quizScore !== undefined ? tp.quizScore : '';
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Progreso');
    XLSX.writeFile(wb, `seguimiento_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('✓ Exportado a Excel');
  };

  const handleExportUsuariosBasico = () => {
    const sorted = filteredIngresos.slice().sort((a, b) => {
      const da = parseInicio(a.inicio)?.getTime() ?? 0;
      const db = parseInicio(b.inicio)?.getTime() ?? 0;
      return db - da;
    });
    const rows = sorted.map(r => {
      const date = parseInicio(r.inicio);
      const fechaInicio = date
        ? date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : (r.inicio || '');
      return {
        'FECHA_INICIO': fechaInicio,
        'SEMANA': date ? getISOWeek(date) : '',
        'AREA': r.area || '',
        'CARGO': r.cargo || '',
        'APELLIDOS Y NOMBRES': `${r.apellidos} ${r.nombres}`.trim(),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 22 }, { wch: 24 }, { wch: 34 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    XLSX.writeFile(wb, `usuarios_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('✓ Usuarios exportados');
  };

  // ========== SIDEBAR NAV ITEMS (módulos del panel) ==========
  const sidebarTabItems = ([
    { key: 'topics', label: 'Detalles', icon: BookOpen, badge: null },
    { key: 'overview', label: 'Resumen', icon: TrendingUp, badge: null },
    { key: 'content', label: 'Contenido', icon: FileText, badge: selectedTopicId ? activeContentCount : null },
    { key: 'quiz', label: 'Quizzes', icon: HelpCircle, badge: selectedTopicId ? activeQuizCount : null },
    { key: 'progress', label: 'Usuarios', icon: Users, badge: ingresoRecords.length > 0 ? ingresoRecords.length : null },
    { key: 'shortEvals', label: 'Evals', icon: ClipboardCheck, badge: shortEvals.length > 0 ? shortEvals.length : null },
    { key: 'actas', label: 'Actas', icon: FileSignature, badge: actaDocs.length > 0 ? actaDocs.length : null },
  ] as { key: AdminTab; label: string; icon: typeof BookOpen; badge: number | null }[]);

  const sidebarNav = (
    <nav className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-1">
      {sidebarTabItems.map(tab => {
        const alwaysEnabled = tab.key === 'topics' || tab.key === 'progress' || tab.key === 'shortEvals' || tab.key === 'actas';
        const isDisabled = !alwaysEnabled && !selectedTopicId;
        const isActive = activeTab === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            disabled={isDisabled}
            onClick={() => { setActiveTab(tab.key); if (window.innerWidth < 1024) setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-xs font-bold rounded-xl transition-all ${
              isActive
                ? 'bg-gradient-to-r from-[#00366b] to-[#1b4d89] text-white shadow-md shadow-[#00366b]/25'
                : isDisabled
                ? 'text-[#c3c6d1] cursor-not-allowed opacity-70'
                : 'text-[#57606f] hover:bg-[#f3f4f5] hover:text-[#00366b]'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left">{tab.label}</span>
            {tab.badge !== null && (
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md min-w-[16px] text-center leading-none ${
                isActive ? 'bg-white/25 text-white' : 'bg-[#eef1f6] text-[#424750]'
              }`}>{tab.badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );

  // ========== MAIN PANEL ==========
  return (
    <div className="min-h-screen bg-[#f8f9fa] safe-area-top safe-area-bottom pb-24">
      {/* Header */}
      <header className="w-full top-0 sticky bg-white/90 backdrop-blur-md border-b border-[#e1e3e4] z-50 shadow-[0_1px_0_rgba(0,27,60,0.04)]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? 'Ocultar módulos' : 'Mostrar módulos'}
              className="p-2 rounded-xl bg-[#f3f4f5] hover:bg-[#e7e8e9] transition-colors active:scale-95 duration-150 flex-shrink-0">
              {sidebarOpen ? <PanelLeftClose className="w-5 h-5 text-[#424750]" /> : <Menu className="w-5 h-5 text-[#424750]" />}
            </button>
            <button onClick={onBack} className="p-2 rounded-xl bg-[#f3f4f5] hover:bg-[#e7e8e9] transition-colors active:scale-95 duration-150 flex-shrink-0">
              <ChevronLeft className="w-5 h-5 text-[#424750]" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00366b] to-[#1b4d89] flex items-center justify-center flex-shrink-0 shadow-md shadow-[#00366b]/25">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-black tracking-tight text-[#00366b] leading-tight truncate">Admin Control Center</h1>
              <p className="text-[10px] font-bold text-[#9aa0a6] uppercase tracking-widest leading-none mt-0.5 hidden sm:block">Panel de administración</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button onClick={handleTestConnection} disabled={isTesting} className="p-2.5 rounded-xl bg-[#f8f9fa] border border-[#e1e3e4] hover:bg-[#f3f4f5] hover:border-[#1b4d89]/30 transition-colors" title="Test conexión">
              {isTesting ? <Loader2 className="w-5 h-5 animate-spin text-[#1b4d89]" /> : <Wifi className="w-5 h-5 text-[#424750]" />}
            </button>
            <DiagnosticoButton onClick={() => setShowDiagnostico(true)} />
            <button onClick={onRefreshData} className="p-2.5 rounded-xl bg-[#f8f9fa] border border-[#e1e3e4] hover:bg-[#f3f4f5] hover:border-[#1b4d89]/30 transition-colors" title="Refrescar datos">
              <RefreshCw className="w-5 h-5 text-[#424750]" />
            </button>
            <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold text-[#ba1a1a] hover:bg-[#ffdad6]/50 transition-colors" title="Cerrar sesión admin">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar - Módulos (ocultable/mostrable) */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-[#00132b]/40 z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: -288 }} animate={{ x: 0 }} exit={{ x: -288 }}
              transition={{ type: 'spring', stiffness: 420, damping: 42 }}
              className="fixed left-0 top-0 lg:top-[65px] bottom-0 w-72 bg-white border-r border-[#e1e3e4] z-50 lg:z-30 flex flex-col shadow-2xl lg:shadow-[2px_0_16px_rgba(0,27,60,0.04)]"
            >
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#e1e3e4] lg:hidden">
                <span className="text-xs font-black text-[#00366b] uppercase tracking-widest">Módulos</span>
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-[#f3f4f5] transition-colors">
                  <X className="w-4 h-4 text-[#737781]" />
                </button>
              </div>
              {sidebarNav}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className={`max-w-7xl mx-auto px-4 pt-3 pb-8 ${sidebarOpen ? 'lg:ml-72' : ''}`}>
        {/* Global Notifications Section - STATIC FOR RELIABILITY */}
        <div className={`space-y-3 ${(error || statusMessage) ? 'mb-4' : ''}`}>
          {error && (
            <div className="bg-[#ffdad6] text-[#410002] p-4 rounded-xl border border-[#ba1a1a]/20 flex items-start justify-between shadow-sm">
              <div className="flex items-start gap-3">
                <WifiOff className="w-5 h-5 text-[#ba1a1a] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-1">Error Detectado</p>
                  <p className="text-sm font-medium leading-relaxed">{error}</p>
                </div>
              </div>
              <button onClick={() => setError(null)} className="p-1 hover:bg-[#ba1a1a]/10 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4 text-[#ba1a1a]" />
              </button>
            </div>
          )}

          {statusMessage && (
            <div className={`p-4 rounded-xl border flex items-start justify-between shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 ${
              statusMessage.type === 'success' 
                ? 'bg-[#9af7af]/20 text-[#00391c] border-[#006d36]/20' 
                : 'bg-[#f3f4f5] text-[#424750] border-[#c3c6d1]/30'
            }`}>
              <div className="flex items-start gap-3">
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-[#006d36] mt-0.5 flex-shrink-0" />
                ) : (
                  <FileText className="w-5 h-5 text-[#424750] mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1">
                    {statusMessage.type === 'success' ? 'Éxito' : 'Notificación'}
                  </p>
                  <p className="text-sm font-medium leading-relaxed">{statusMessage.text}</p>
                </div>
              </div>
              <button onClick={() => setStatusMessage(null)} className="p-1 hover:black/5 rounded-lg transition-colors">
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>
          )}
        </div>
        
        {/* Connection Test Results */}
        {/* Connection Test Results */}
        <AnimatePresence>
          {testResults && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 bg-[#f3f4f5] rounded-2xl p-6 border border-[#e1e3e4]">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-[#00366b] flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#1b4d89]" /> Diagnóstico de Conexión
                </h3>
                <button onClick={() => setTestResults(null)} className="text-xs text-[#737781] hover:text-[#00366b] font-semibold transition-colors">Cerrar</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  { label: 'Google Sheets (lectura)', result: testResults.sheetsRead },
                  { label: 'Apps Script (escritura)', result: testResults.appsScript },
                ] as const).map(item => (
                  <div key={item.label} className={`p-4 rounded-xl border-2 ${
                    item.result.ok ? 'border-[#006d36]/30 bg-[#9af7af]/10' : 'border-[#ba1a1a]/30 bg-[#ffdad6]'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {item.result.ok ? <CheckCircle2 className="w-5 h-5 text-[#006d36]" /> : <WifiOff className="w-5 h-5 text-[#ba1a1a]" />}
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        item.result.ok ? 'text-[#006d36]' : 'text-[#ba1a1a]'
                      }`}>
                        {item.result.ok ? 'CONECTADO' : 'ERROR'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#424750] font-medium leading-relaxed">{item.label}</p>
                    {item.result.error && <p className="text-[10px] text-[#93000a] mt-2 break-all font-mono bg-white/50 p-2 rounded">{item.result.error}</p>}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Module Banner - persistent above all tabs */}
        <AnimatePresence>
          {selectedTopicId && selectedTopic && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 relative"
            >
              <button
                onClick={() => setIsTopicSelectorOpen(!isTopicSelectorOpen)}
                className={`w-full flex items-center gap-3 bg-white rounded-2xl border-2 px-4 py-3 transition-all shadow-sm text-left ${
                  isTopicSelectorOpen
                    ? 'border-[#1b4d89] ring-2 ring-[#1b4d89]/10'
                    : 'border-[#1b4d89]/25 hover:border-[#1b4d89]/50'
                }`}
              >
                <div className="p-2 rounded-xl bg-[#1b4d89]/10 flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-[#1b4d89]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#737781] leading-none mb-1">Módulo activo</p>
                  <p className="font-bold text-[#00366b] text-sm truncate leading-tight">{selectedTopic.title}</p>
                  {(() => {
                    const auds = selectedTopic.audience.split(',').map(a => a.trim()).filter(Boolean);
                    const chipSize = auds.length >= 5 ? 'text-[7px] px-1 py-0.5' : auds.length >= 4 ? 'text-[8px] px-1.5 py-0.5' : 'text-[9px] px-1.5 py-0.5';
                    return (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {auds.map((aud, i) => (
                          <span key={i} className={`${chipSize} rounded-md bg-[#1b4d89]/8 border border-[#1b4d89]/15 text-[#1b4d89] font-semibold leading-tight`}>{aud}</span>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-wide ${
                    selectedTopic.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {selectedTopic.active ? 'Activo' : 'Inactivo'}
                  </span>
                  {isTopicSelectorOpen
                    ? <ChevronUp className="w-4 h-4 text-[#1b4d89]" />
                    : <ChevronDown className="w-4 h-4 text-[#737781]" />}
                </div>
              </button>

              <AnimatePresence>
                {isTopicSelectorOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsTopicSelectorOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-2xl border border-[#e1e3e4] shadow-2xl shadow-[#001b3c]/15 max-h-72 overflow-hidden flex flex-col"
                    >
                      <div className="px-4 py-3 border-b border-[#f3f4f5] flex items-center justify-between">
                        <p className="text-[10px] font-bold text-[#424750] uppercase tracking-widest">Cambiar módulo</p>
                        <span className="text-[10px] text-[#737781] font-medium">{topics.length} módulos</span>
                      </div>
                      <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {topics.map(t => {
                          const isActive = selectedTopicId === t.id;
                          return (
                            <button
                              key={t.id}
                              onClick={() => { setSelectedTopicId(t.id); setIsTopicSelectorOpen(false); }}
                              className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between gap-3 ${
                                isActive
                                  ? 'bg-[#1b4d89] text-white shadow-md'
                                  : 'hover:bg-[#f3f4f5] text-[#424750] hover:text-[#00366b]'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm truncate">{t.title}</p>
                                <p className={`text-[10px] mt-0.5 ${isActive ? 'text-white/70' : 'text-[#737781]'}`}>
                                  {t.audience.split(',').filter(Boolean).length} audiencias · {allChunks.filter(c => c.idMain === t.id).length} secciones
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {!t.active && (
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase ${isActive ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'}`}>
                                    Inactivo
                                  </span>
                                )}
                                {isActive && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notifications */}
        <AnimatePresence>
          {statusMessage && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`p-5 rounded-xl flex items-center gap-4 mb-6 border-l-4 ${statusMessage.type === 'success' ? 'bg-[#9af7af]/10 text-[#006d36] border-[#006d36]' : 'bg-[#ffdad6] text-[#93000a] border-[#ba1a1a]'}`}>
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-semibold">{statusMessage.text}</span>
            </motion.div>
          )}
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="p-5 rounded-xl flex items-center gap-4 mb-6 bg-[#ffdad6] text-[#93000a] border border-[#ba1a1a] border-l-4">
              <WifiOff className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-semibold">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Navigation is now at the top*/}
        
        {/* ====== TAB: DETALLES ====== */}
        {activeTab === 'topics' && (
          <div className="space-y-4">
            {!selectedTopicId ? (
              /* No module selected — compact picker list */
              <>
                <div className="bg-[#f3f4f5] rounded-xl p-4 border border-[#e1e3e4] flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-[#1b4d89] flex-shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[#00366b]">Selecciona un módulo</p>
                    <p className="text-xs text-[#737781] mt-0.5">Elige un módulo de la lista para ver y editar sus detalles.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {draftTopics.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTopicId(t.id)}
                      className="w-full flex items-center justify-between gap-3 bg-white rounded-xl border border-[#e1e3e4] px-4 py-4 hover:border-[#1b4d89]/40 hover:bg-[#1b4d89]/3 transition-all text-left group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[#00366b] text-sm truncate">{t.title}</p>
                        <p className="text-[10px] text-[#737781] mt-0.5 truncate">{t.audience || '—'}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {t._status !== 'unchanged' && (
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase ${t._status === 'new' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#1b4d89]/10 text-[#1b4d89]'}`}>
                            {t._status === 'new' ? 'Nuevo' : 'Modificado'}
                          </span>
                        )}
                        <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase ${t.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                          {t.active ? 'Activo' : 'Inactivo'}
                        </span>
                        <ChevronRight className="w-4 h-4 text-[#c3c6d1] group-hover:text-[#1b4d89] transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              /* Module selected — show edit form directly */
              (() => {
                const t = draftTopics.find(dt => dt.id === selectedTopicId);
                if (!t) return null;
                return (
                  <>
                    {/* Form header */}
                    <div className="flex items-start justify-between gap-3 bg-white rounded-2xl border border-[#e1e3e4] px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          {t._status !== 'unchanged' && (
                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${t._status === 'new' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#1b4d89]/10 text-[#1b4d89]'}`}>
                              {t._status === 'new' ? 'Nuevo' : 'Modificado'}
                            </span>
                          )}
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase ${t.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                            {t.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                        <h2 className="font-bold text-[#00366b] text-base leading-tight truncate">{t.title}</h2>
                        <p className="text-[10px] text-[#737781] font-mono mt-0.5">ID: {t.id}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteTopic(t.id)}
                        className="p-2.5 rounded-xl text-[#737781] hover:text-[#ba1a1a] hover:bg-[#ffdad6]/30 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Edit fields */}
                    <div className="bg-white rounded-2xl border border-[#e1e3e4] p-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Título</label>
                          <input type="text" value={t.title} onChange={e => handleUpdateTopic(t.id, { title: e.target.value })} className="w-full bg-[#f8f9fa] text-slate-900 font-medium border border-[#e1e3e4] rounded-lg px-4 py-3 text-sm focus:border-[#1b4d89] outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">ID (Único)</label>
                          <input type="text" value={t.id} disabled={t._status !== 'new'} onChange={e => handleUpdateTopic(t.id, { id: e.target.value })} className="w-full bg-[#f8f9fa] text-slate-900 font-mono disabled:opacity-50 border border-[#e1e3e4] rounded-lg px-4 py-3 text-sm focus:border-[#1b4d89] outline-none" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Descripción Corta</label>
                          <textarea value={t.details} onChange={e => handleUpdateTopic(t.id, { details: e.target.value })} className="w-full bg-[#f8f9fa] text-slate-900 font-medium border border-[#e1e3e4] rounded-lg px-4 py-3 text-sm focus:border-[#1b4d89] outline-none resize-none" rows={2} />
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Puntos Clave (un punto por línea)</label>
                          <textarea
                            value={t.keyPoints?.join('\n') || ''}
                            onChange={e => handleUpdateTopic(t.id, { keyPoints: e.target.value.split('\n') })}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              const el = e.currentTarget;
                              const { selectionStart: pos, selectionEnd: end, value: val } = el;
                              const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
                              const hasBullet = /^\s*-/.test(val.substring(lineStart, pos));
                              const insert = '\n' + (hasBullet ? '- ' : '');
                              const newVal = val.substring(0, pos) + insert + val.substring(end);
                              handleUpdateTopic(t.id, { keyPoints: newVal.split('\n') });
                              const newPos = pos + insert.length;
                              requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = newPos; });
                            }}
                            placeholder="- Punto 1&#10;- Punto 2"
                            className="w-full bg-[#f8f9fa] text-slate-900 font-medium border border-[#e1e3e4] rounded-lg px-4 py-3 text-sm focus:border-[#1b4d89] outline-none resize-none"
                            rows={3}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Audiencia</label>
                          <div className="flex flex-wrap gap-2 p-3 bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg min-h-[46px]">
                            {(() => {
                              const allIds = AUDIENCE_CONFIG.profiles.map(p => p.id);
                              const current = t.audience.split(',').map(a => a.trim()).filter(Boolean);
                              const allSelected = allIds.every(id => current.includes(id));
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateTopic(t.id, { audience: allSelected ? '' : allIds.join(', ') })}
                                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                                      allSelected ? 'bg-[#1b4d89] text-white border-[#1b4d89]' : 'bg-white text-[#424750] border-[#e1e3e4] hover:border-[#1b4d89]/50 hover:text-[#1b4d89]'
                                    }`}
                                  >
                                    Todos
                                  </button>
                                  <span className="self-center text-[#c3c6d1] text-xs">|</span>
                                  {AUDIENCE_CONFIG.profiles.map(profile => {
                                    const sel = current.includes(profile.id);
                                    return (
                                      <button
                                        key={profile.id}
                                        type="button"
                                        onClick={() => {
                                          const next = sel ? current.filter(a => a !== profile.id) : [...current, profile.id];
                                          handleUpdateTopic(t.id, { audience: next.join(', ') });
                                        }}
                                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                                          sel ? 'bg-[#1b4d89] text-white border-[#1b4d89]' : 'bg-white text-[#424750] border-[#e1e3e4] hover:border-[#1b4d89]/50 hover:text-[#1b4d89]'
                                        }`}
                                      >
                                        {profile.label}
                                      </button>
                                    );
                                  })}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Orden</label>
                            <input type="number" value={t.order || 99} onChange={e => handleUpdateTopic(t.id, { order: parseInt(e.target.value) || 99 })} className="w-full bg-[#f8f9fa] text-slate-900 font-medium border border-[#e1e3e4] rounded-lg px-4 py-3 text-sm focus:border-[#1b4d89] outline-none" />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Estado</label>
                            <div className="flex items-center gap-2 mt-3">
                              <input type="checkbox" checked={t.active} onChange={e => handleUpdateTopic(t.id, { active: e.target.checked })} className="w-5 h-5 accent-[#1b4d89] rounded" />
                              <span className="text-sm font-semibold">{t.active ? 'Activo (Visible)' : 'Oculto'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()
            )}

            {/* Save / undo bar (always visible when changes exist) */}
            {(draftTopics.filter(t => t._status !== 'unchanged').length > 0) && (
              <div className="sticky bottom-8 flex flex-col sm:flex-row gap-3 z-40 bg-white p-4 rounded-xl border-2 border-[#e1e3e4] shadow-[0_8px_32px_rgba(0,27,60,0.08)]">
                <button onClick={handleUndoTopics} className="flex items-center justify-center gap-2 px-4 py-3 bg-[#ffdad6]/30 rounded-xl text-[#ba1a1a] font-semibold text-sm hover:bg-[#ffdad6]/60 transition-all">
                  <Undo2 className="w-4 h-4" /> Deshacer
                </button>
                <button
                  disabled={isSaving}
                  onClick={handleSaveTopics}
                  className="flex-[2] py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-[#00366b] to-[#1b4d89] text-white shadow-lg shadow-[#1b4d89]/20 hover:shadow-xl flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  Sincronizar Módulos
                </button>
              </div>
            )}
          </div>
        )}

        {selectedTopicId && activeTab !== 'topics' && activeTab !== 'progress' && activeTab !== 'shortEvals' && (
          <>


            {/* ====== TAB: OVERVIEW ====== */}
            {activeTab === 'overview' && selectedTopic && (
              <div className="space-y-4">
                <div className="bg-[#f3f4f5] rounded-xl p-5 border border-[#e1e3e4]">
                  <h2 className="text-base font-bold text-[#00366b] mb-1">{selectedTopic.title}</h2>
                  <p className="text-xs text-[#424750] mb-4">{selectedTopic.details}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <motion.div 
                      whileHover={{ scale: 1.05 }}
                      className="bg-white rounded-xl p-4 border border-[#e1e3e4] text-center hover:border-[#1b4d89]/30 hover:shadow-md transition-all cursor-default"
                    >
                      <p className="text-xl font-bold text-[#1b4d89]">{topicChunks.length}</p>
                      <p className="text-[10px] text-[#737781] uppercase font-bold tracking-wider mt-1">Secciones</p>
                    </motion.div>
                    <motion.div 
                      whileHover={{ scale: 1.05 }}
                      className="bg-white rounded-xl p-4 border border-[#e1e3e4] text-center hover:border-[#006d36]/30 hover:shadow-md transition-all cursor-default"
                    >
                      <p className="text-xl font-bold text-[#006d36]">{allQuizQuestions.filter(q => q.idMain === selectedTopicId).length}</p>
                      <p className="text-[10px] text-[#737781] uppercase font-bold tracking-wider mt-1">Preguntas</p>
                    </motion.div>
                    <motion.div 
                      whileHover={{ scale: 1.05 }}
                      className="bg-white rounded-xl p-4 border border-[#e1e3e4] text-center hover:border-[#582a00]/30 hover:shadow-md transition-all cursor-default"
                    >
                      <p className="text-xl font-bold text-[#582a00]">{selectedTopic.active ? 'Sí' : 'No'}</p>
                      <p className="text-[10px] text-[#737781] uppercase font-bold tracking-wider mt-1">Activo</p>
                    </motion.div>
                    <motion.div 
                      whileHover={{ scale: 1.05 }}
                      className="bg-white rounded-xl p-4 border border-[#e1e3e4] text-center hover:border-[#1b4d89]/30 hover:shadow-md transition-all cursor-default"
                    >
                      <p className="text-xl font-bold text-[#1b4d89]">{selectedTopic.audience.split(',').length}</p>
                      <p className="text-[10px] text-[#737781] uppercase font-bold tracking-wider mt-1">Audiencias</p>
                    </motion.div>
                  </div>
                </div>

              </div>
            )}

            {/* ====== TAB: CONTENT ====== */}
            {activeTab === 'content' && (
              <div className="space-y-4">


                {/* Content list */}
                <div className="space-y-3">
                  {draftContent.map(c => {
                    const isExpanded = expandedChunks.has(c.cod);
                    const questionCount = draftQuestions.filter(q => q.categoriaContenido === c.tema).length;

                    return (
                      <motion.div
                        layout
                        key={c.cod}
                        data-content-card={c.cod}
                        className={`bg-[#f3f4f5] rounded-xl border-l-4 transition-all overflow-hidden hover:shadow-lg hover:shadow-[#1b4d89]/5 ${
                          c._status === 'new' ? 'border-[#006d36]' :
                          c._status === 'modified' ? 'border-[#1b4d89]' : 'border-[#c3c6d1]'
                        }`}
                      >
                        {/* Header row */}
                        <div className="p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-white/50 transition-colors" onClick={() => toggleChunkExpand(c.cod)}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              {c.contexto && c.contexto !== '-' && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-[#1b4d89]/10 text-[#1b4d89] tracking-wider">{c.contexto}</span>
                              )}
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider ${
                                questionCount > 0 ? 'bg-[#eaeefc] text-[#3f51b5]' : 'bg-white border border-[#c3c6d1] text-[#737781]'
                              }`}>
                                {questionCount} {questionCount === 1 ? 'Pregunta' : 'Preguntas'}
                              </span>
                              {c._status !== 'unchanged' && (
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                  c._status === 'new' ? 'text-[#006d36]' : 'text-[#1b4d89]'
                                }`}>
                                  {c._status === 'new' ? 'NUEVO' : 'MODIFICADO'}
                                </span>
                              )}
                            </div>
                            <h3 className="font-bold text-[#00366b] text-base">{c.tema}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteContent(c.cod); }} className="p-2 rounded-lg text-[#737781] hover:text-[#ba1a1a] hover:bg-[#ffdad6]/20 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                            {isExpanded ? <ChevronUp className="w-5 h-5 text-[#424750]" /> : <ChevronDown className="w-5 h-5 text-[#424750]" />}
                          </div>
                        </div>

                        {/* Expanded editor */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-5 pb-6 space-y-5 border-t border-[#e1e3e4] pt-6 bg-white">
                                <div>
                                  <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Título</label>
                                  <input
                                    type="text"
                                    value={c.tema}
                                    onChange={e => handleUpdateContent(c.cod, { tema: e.target.value })}
                                    className="w-full bg-white border-b-2 border-[#c3c6d1]/30 focus:border-[#1b4d89] px-1 py-3 text-base text-[#191c1d] placeholder-[#737781] outline-none transition-all"
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em]">Contenido (Markdown / HTML)</label>
                                    <button
                                      type="button"
                                      onClick={() => openPreview(c.cod, c.contenido)}
                                      className="flex items-center gap-1.5 text-[10px] font-bold text-[#1b4d89] hover:text-[#00366b] bg-[#1b4d89]/8 hover:bg-[#1b4d89]/15 px-2.5 py-1 rounded-lg transition-all"
                                    >
                                      <Eye className="w-3 h-3" /> Vista previa
                                    </button>
                                  </div>
                                  <textarea
                                    value={c.contenido}
                                    onChange={e => handleUpdateContent(c.cod, { contenido: e.target.value })}
                                    className="w-full bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg px-4 py-3 text-sm text-[#191c1d] font-mono min-h-[260px] resize-y placeholder-[#737781] focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 outline-none transition-all"
                                    rows={11}
                                    placeholder="Escribe contenido en Markdown o HTML. Ambos se renderizan."
                                  />
                                </div>
                                <div className="flex gap-4">
                                  <div className="flex-1">
                                    <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Contexto</label>
                                    <select
                                      value={c.contexto}
                                      onChange={e => handleUpdateContent(c.cod, { contexto: e.target.value })}
                                      className="w-full bg-white border border-[#e1e3e4] rounded-lg px-4 py-3 text-sm text-[#191c1d] focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 outline-none transition-all"
                                    >
                                      <option value="Teórico">Teórico</option>
                                      <option value="Práctico">Práctico</option>
                                      <option value="Normativo">Normativo</option>
                                      <option value="Caso Real">Caso Real</option>
                                      <option value="Procedimiento">Procedimiento</option>
                                    </select>
                                  </div>
                                  <div className="w-28">
                                    <label className="text-[10px] font-bold uppercase text-[#424750] tracking-[0.15em] block mb-2">Orden</label>
                                    <input
                                      type="number"
                                      value={c.order || 0}
                                      onChange={e => handleUpdateContent(c.cod, { order: parseInt(e.target.value) || 0 })}
                                      className="w-full bg-white border border-[#e1e3e4] rounded-lg px-3 py-3 text-sm text-[#191c1d] focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 outline-none transition-all"
                                    />
                                  </div>
                                </div>

                                {/* Media Section */}
                                <div className="rounded-xl border-2 border-[#1b4d89]/20 bg-[#1b4d89]/5 p-5 space-y-4">
                                  <h4 className="text-xs font-bold uppercase text-[#00366b] tracking-[0.15em] flex items-center gap-2">
                                    <Video className="w-4 h-4" /> Videos y Recursos Multimedia
                                  </h4>
                                  {[0, 1, 2].map(idx => (
                                    <div key={idx}>
                                      <label className="text-[10px] font-medium text-[#424750] block mb-1.5 flex items-center gap-1.5">
                                        <Link2 className="w-3 h-3 text-[#1b4d89]" />
                                        Video {idx + 1} <span className="text-[#737781]">(URL de Google Drive)</span>
                                      </label>
                                      <input
                                        type="url"
                                        value={c.videos?.[idx] || ''}
                                        onChange={e => {
                                          const newVideos = [...(c.videos || []), '', '', ''].slice(0, 3);
                                          newVideos[idx] = e.target.value;
                                          handleUpdateContent(c.cod, { videos: newVideos.filter((v, i) => v.trim() || i <= idx) });
                                        }}
                                        placeholder="https://drive.google.com/file/d/..."
                                        className="w-full bg-white border-b-2 border-[#c3c6d1]/30 focus:border-[#1b4d89] px-1 py-2.5 text-sm text-[#191c1d] font-mono placeholder-[#737781] outline-none transition-all"
                                      />
                                    </div>
                                  ))}
                                  <div>
                                    <label className="text-[10px] font-medium text-[#424750] block mb-1.5 flex items-center gap-1.5">
                                      <MessageSquare className="w-3 h-3 text-[#1b4d89]" />
                                      Comentario de Video
                                    </label>
                                    <textarea
                                      value={c.comentarioVideo || ''}
                                      onChange={e => handleUpdateContent(c.cod, { comentarioVideo: e.target.value })}
                                      placeholder="Nota o descripción sobre los videos de esta sesión..."
                                      className="w-full bg-white border border-[#e1e3e4] rounded-lg px-4 py-3 text-sm text-[#191c1d] placeholder-[#737781] focus:border-[#1b4d89] focus:ring-2 focus:ring-[#1b4d89]/10 outline-none transition-all resize-y"
                                      rows={2}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-medium text-[#424750] block mb-1.5 flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <FileText className="w-3 h-3 text-[#582a00]" />
                                        PDF <span className="text-[#737781]">(URL de Google Drive)</span>
                                      </div>
                                      
                                      {c.pdf && (
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => handleGenerateAiPrompt(c)}
                                            disabled={isExtracting !== null}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                              isExtracting === c.cod 
                                                ? 'bg-slate-100 text-slate-400' 
                                                : 'bg-[#582a00]/10 text-[#582a00] hover:bg-[#582a00] hover:text-white shadow-sm'
                                            }`}
                                          >
                                            {isExtracting === c.cod ? (
                                              <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                              <Wand2 className="w-3 h-3" />
                                            )}
                                            {isExtracting === c.cod ? 'EXTRAYENDO...' : 'PROMPT QUIZ'}
                                          </button>
                                          
                                          <button
                                            onClick={() => handleGenerateContentPrompt(c)}
                                            disabled={isExtracting !== null}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                              isExtracting === `content-${c.cod}`
                                                ? 'bg-slate-100 text-slate-400' 
                                                : 'bg-[#1b4d89]/10 text-[#1b4d89] hover:bg-[#1b4d89] hover:text-white shadow-sm'
                                            }`}
                                          >
                                            {isExtracting === `content-${c.cod}` ? (
                                              <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                              <Wand2 className="w-3 h-3" />
                                            )}
                                            {isExtracting === `content-${c.cod}` ? 'EXTRAYENDO...' : 'PROMPT CONTENIDO'}
                                          </button>
                                        </div>
                                      )}
                                    </label>
                                    <input
                                      type="url"
                                      value={c.pdf || ''}
                                      onChange={e => handleUpdateContent(c.cod, { pdf: e.target.value })}
                                      placeholder="https://drive.google.com/file/d/..."
                                      className="w-full bg-white border-b-2 border-[#c3c6d1]/30 focus:border-[#582a00] px-1 py-2.5 text-sm text-[#191c1d] font-mono placeholder-[#737781] outline-none transition-all"
                                    />
                                  </div>
                                </div>

                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>

                {activeContentCount === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-[#e1e3e4] flex items-center justify-center mb-3">
                      <BookOpen className="w-8 h-8 text-[#737781]" />
                    </div>
                    <p className="text-sm font-medium text-[#424750]">No hay contenido educativo aún.</p>
                    <p className="text-xs text-[#737781] mt-1">Añade secciones manualmente con el botón +</p>
                  </div>
                )}

                {/* Content footer actions */}
                {activeContentCount > 0 && (
                  <div className="sticky bottom-8 flex flex-col sm:flex-row gap-3 z-40 bg-white p-4 rounded-xl border-2 border-[#e1e3e4] shadow-[0_8px_32px_rgba(0,27,60,0.08)]">
                    <button onClick={handleCopyContentCSV} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#f3f4f5] rounded-xl text-[#424750] font-semibold text-sm hover:bg-[#e7e8e9] transition-all active:scale-95">
                      <Copy className="w-4 h-4" /> Exportar CSV
                    </button>
                    {contentChanges > 0 && (
                      <button onClick={handleUndoContent} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#ffdad6]/30 rounded-xl text-[#ba1a1a] font-semibold text-sm hover:bg-[#ffdad6]/60 transition-all active:scale-95">
                        <Undo2 className="w-4 h-4" /> Deshacer
                      </button>
                    )}
                    <button
                      disabled={isSaving || contentChanges === 0}
                      onClick={handleSaveContent}
                      className={`flex-[2] py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                        isSaving || contentChanges === 0 ? 'bg-[#e1e3e4] text-[#737781] cursor-not-allowed' : 'bg-gradient-to-r from-[#00366b] to-[#1b4d89] text-white shadow-lg shadow-[#1b4d89]/20 hover:shadow-xl hover:shadow-[#1b4d89]/30'
                      }`}
                    >
                      {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      {isSaving ? 'Guardando...' : `Sincronizar (${contentChanges} cambios)`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ====== TAB: QUIZ ====== */}
            {activeTab === 'quiz' && (
              <div className="space-y-4">
                {/* Quiz actions bar */}
                <div className="flex flex-col gap-3 bg-[#f3f4f5] rounded-xl p-3.5 border border-[#e1e3e4]">
                  {/* Row 1: Title and Count */}
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-[#00366b] flex items-center gap-2">
                      <Edit3 className="w-4 h-4 text-[#006d36]" />
                      Editor de Preguntas
                    </h2>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const totalInSheets = allQuizQuestions.filter(q => q.idMain === selectedTopicId).length;
                        if (totalInSheets !== activeQuizCount) {
                          return (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200">
                              {totalInSheets} en Sheets
                            </span>
                          );
                        }
                        return null;
                      })()}
                      <span className="text-xs bg-[#e1e3e4] text-[#424750] px-2.5 py-0.5 rounded-full font-mono font-bold shadow-sm">
                        {quizCategoryFilter ? `${filteredQuestions.length} / ${activeQuizCount}` : activeQuizCount}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Actions & Buttons grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Sub-row A: Collapse & Filter (50/50 Grid side-by-side always) */}
                    <div className="grid grid-cols-2 gap-2 w-full">
                      {/* Collapse Button */}
                      <button
                        onClick={handleCollapseAllQuestions}
                        className="flex items-center justify-center gap-1 px-2 py-2 bg-white border border-[#e1e3e4] hover:bg-[#f8f9fa] hover:border-[#acb1ba] rounded-lg text-xs font-semibold text-[#424750] hover:text-[#00366b] transition-all active:scale-95 shadow-sm"
                        title="Colapsar todas las preguntas"
                      >
                        <ChevronUp className="w-3.5 h-3.5 text-[#5c6066]" />
                        <span className="truncate">Colapsar todas</span>
                      </button>

                      {/* Filter Dropdown */}
                      <div className="relative flex items-center justify-between bg-white border border-[#e1e3e4] hover:border-[#acb1ba] rounded-lg px-2 py-2 shadow-sm focus-within:border-[#1b4d89] transition-all overflow-hidden">
                        <div className="flex items-center min-w-0 w-full">
                          <Filter className="w-3 h-3 text-[#5c6066] mr-1 flex-shrink-0" />
                          <select
                            value={quizCategoryFilter}
                            onChange={e => setQuizCategoryFilter(e.target.value)}
                            className="bg-transparent text-xs font-semibold text-[#424750] outline-none cursor-pointer pr-4 truncate w-full appearance-none"
                          >
                            <option value="">Todas las cat.</option>
                            <option value="__SIN_CATEGORIA__">Sin cat.</option>
                            {Array.from(new Set(
                              draftContent
                                .filter(c => c._status !== 'deleted')
                                .map(c => c.tema.trim())
                                .filter(Boolean)
                            )).map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                        <ChevronDown className="w-3 h-3 text-[#5c6066] absolute right-1.5 pointer-events-none flex-shrink-0" />
                      </div>
                    </div>

                    {/* Sub-row B: Plantilla & Importar (50/50 Grid side-by-side always) */}
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button
                        onClick={handleDownloadQuizTemplate}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-[#e1e3e4] rounded-lg text-xs font-bold text-[#424750] hover:bg-[#f8f9fa] hover:text-[#1b4d89] hover:border-[#acb1ba] transition-all shadow-sm active:scale-95 w-full"
                        title="Descargar plantilla de Excel para importación masiva"
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span className="truncate">Plantilla</span>
                      </button>
                      <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-[#e1e3e4] rounded-lg text-xs font-bold text-[#424750] hover:bg-[#f8f9fa] hover:text-[#1b4d89] hover:border-[#acb1ba] transition-all cursor-pointer shadow-sm active:scale-95 w-full">
                        <Plus className="w-3.5 h-3.5 text-[#1b4d89] flex-shrink-0" />
                        <span className="truncate">Importar</span>
                        <input
                          type="file"
                          accept=".xlsx, .xls"
                          onChange={handleImportQuizExcel}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Quiz list */}
                <div className="space-y-3">
                  {filteredQuestions.map((q, idx) => {
                    const isComplete = q.question.trim() && q.optionA.trim() && q.optionB.trim() && q.optionC.trim() && q.optionD.trim();
                    const isExpanded = expandedQuestions.has(q.idQuiz) || !isComplete;

                    return (
                      <motion.div
                        layout
                        key={q.idQuiz}
                        data-question-card={q.idQuiz}
                        className={`bg-[#f3f4f5] rounded-xl border-l-4 transition-all overflow-hidden hover:shadow-lg hover:shadow-[#006d36]/5 ${
                          q._status === 'new' ? 'border-[#006d36]' :
                          q._status === 'modified' ? 'border-[#1b4d89]' : 'border-[#c3c6d1]'
                        }`}
                      >
                        {/* Collapsed header */}
                        <div
                          className="p-4 cursor-pointer hover:bg-white/50 transition-colors"
                          onClick={() => isComplete && toggleQuestionExpand(q.idQuiz)}
                        >
                          {/* Row 1: Badges (left) and Actions/Category (right) */}
                          <div className="flex items-center justify-between gap-3 mb-2">
                            {/* Badges Left */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-mono text-[#737781] font-bold">#{idx + 1}</span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                q.difficulty === 'Fácil' ? 'bg-[#9af7af]/20 text-[#006d36]' :
                                q.difficulty === 'Media' ? 'bg-[#1b4d89]/10 text-[#1b4d89]' :
                                'bg-[#ffdad6] text-[#ba1a1a]'
                              }`}>{q.difficulty}</span>
                              <span className="text-[10px] font-bold text-[#006d36]">✓ {q.correctAnswer}</span>
                              {q._status !== 'unchanged' && (
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                  q._status === 'new' ? 'text-[#006d36]' : 'text-[#1b4d89]'
                                }`}>
                                  {q._status === 'new' ? 'NUEVO' : 'MODIFICADO'}
                                </span>
                              )}
                            </div>

                            {/* Actions & Category Right */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {q.categoriaContenido && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#eaeefc] text-[#3f51b5] max-w-[120px] sm:max-w-[200px] truncate" title={q.categoriaContenido}>
                                  {q.categoriaContenido}
                                </span>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(q.idQuiz); }} className="p-1.5 rounded-lg text-[#737781] hover:text-[#ba1a1a] hover:bg-[#ffdad6]/20 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              {isComplete && (isExpanded ? <ChevronUp className="w-4 h-4 text-[#424750]" /> : <ChevronDown className="w-4 h-4 text-[#424750]" />)}
                            </div>
                          </div>

                          {/* Row 2: Question (Full Width) */}
                          <div className="w-full">
                            <p className="text-sm font-semibold text-[#00366b] whitespace-normal break-words leading-snug">
                              {q.question || 'Sin pregunta...'}
                            </p>
                          </div>
                        </div>

                        {/* Expanded editor */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3 pb-3 space-y-2.5 border-t border-[#e1e3e4] pt-2.5 bg-white">
                                <div>
                                  <label className="text-[9px] font-bold uppercase text-[#5c6066] tracking-[0.12em] block mb-1">Pregunta</label>
                                  <textarea
                                    value={q.question}
                                    onChange={e => handleUpdateQuestion(q.idQuiz, { question: e.target.value })}
                                    ref={el => {
                                      if (el) {
                                        el.style.height = 'auto';
                                        el.style.height = `${el.scrollHeight}px`;
                                      }
                                    }}
                                    className="w-full bg-[#f8f9fa] text-[#00366b] font-bold text-xs resize-none overflow-hidden outline-none border border-[#e1e3e4] focus:border-[#1b4d89] rounded-lg px-3 py-1.5 transition-all"
                                    rows={1}
                                  />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {['A', 'B', 'C', 'D'].map(letter => {
                                    const key = `option${letter}` as keyof QuizQuestion;
                                    const isCorrect = q.correctAnswer === letter;
                                    return (
                                      <div key={letter} className="relative">
                                        <textarea
                                          value={q[key] as string}
                                          onChange={e => handleUpdateQuestion(q.idQuiz, { [key]: e.target.value })}
                                          ref={el => {
                                            if (el) {
                                              el.style.height = 'auto';
                                              el.style.height = `${el.scrollHeight}px`;
                                            }
                                          }}
                                          className={`w-full bg-[#f8f9fa] border rounded-lg pl-9 pr-2 py-1.5 text-xs text-[#191c1d] transition-all outline-none resize-none overflow-hidden block ${
                                            isCorrect ? 'border-[#006d36] ring-1 ring-[#006d36]/20' : 'border-[#e1e3e4] focus:border-[#1b4d89]'
                                          }`}
                                          placeholder={`Opción ${letter}`}
                                          rows={1}
                                        />
                                        <button
                                          onClick={() => handleUpdateQuestion(q.idQuiz, { correctAnswer: letter as any })}
                                          className={`absolute left-0 top-0 bottom-0 w-7 flex items-center justify-center font-extrabold text-xs rounded-l-[7px] transition-all ${
                                            isCorrect ? 'bg-[#006d36] text-[#ffffff] shadow-md' : 'bg-[#e7e8e9] text-[#737781] hover:bg-[#d9dadb]'
                                          }`}
                                        >
                                          {letter}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div className="space-y-2.5">
                                  <div>
                                    <label className="text-[9px] font-bold uppercase text-[#5c6066] tracking-[0.12em] block mb-1">Justificación</label>
                                    <textarea
                                      value={q.explanation}
                                      onChange={e => handleUpdateQuestion(q.idQuiz, { explanation: e.target.value })}
                                      ref={el => {
                                        if (el) {
                                          el.style.height = 'auto';
                                          el.style.height = `${el.scrollHeight}px`;
                                        }
                                      }}
                                      className="w-full bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg px-3 py-1.5 text-xs text-[#424750] italic focus:border-[#1b4d89] outline-none transition-all resize-none overflow-hidden"
                                      placeholder="Explicación detallada de la respuesta correcta"
                                      rows={1}
                                    />
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[9px] font-bold uppercase text-[#5c6066] tracking-[0.12em] block mb-1">Dificultad</label>
                                      <select
                                        value={q.difficulty}
                                        onChange={e => handleUpdateQuestion(q.idQuiz, { difficulty: e.target.value as any })}
                                        className="w-full bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg px-2 py-1.5 text-xs text-[#191c1d] focus:border-[#1b4d89] outline-none transition-all cursor-pointer font-medium"
                                      >
                                        <option value="Fácil">Fácil</option>
                                        <option value="Media">Media</option>
                                        <option value="Difícil">Difícil</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[9px] font-bold uppercase text-[#5c6066] tracking-[0.12em] block mb-1">Categoría del Contenido</label>
                                      <select
                                        value={q.categoriaContenido || ''}
                                        onChange={e => handleUpdateQuestion(q.idQuiz, { categoriaContenido: e.target.value })}
                                        className="w-full bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg px-2 py-1.5 text-xs text-[#191c1d] focus:border-[#1b4d89] outline-none transition-all cursor-pointer font-medium"
                                      >
                                        <option value="">-- Sin categoría asignada --</option>
                                        {Array.from(new Set(
                                          draftContent
                                            .filter(c => c._status !== 'deleted')
                                            .map(c => c.tema.trim())
                                            .filter(Boolean)
                                        )).map(cat => (
                                          <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>

                {activeQuizCount > 0 && filteredQuestions.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center bg-white border border-[#e1e3e4] rounded-2xl shadow-sm">
                    <div className="w-12 h-12 rounded-full bg-[#f3f4f5] flex items-center justify-center mb-3">
                      <Filter className="w-6 h-6 text-[#737781]" />
                    </div>
                    <p className="text-sm font-semibold text-[#191c1d]">No hay preguntas en esta categoría</p>
                    <p className="text-xs text-[#737781] mt-1 mb-4">Intenta seleccionando otra categoría o limpia el filtro</p>
                    <button
                      onClick={() => setQuizCategoryFilter('')}
                      className="px-4 py-2 bg-[#1b4d89] hover:bg-[#00366b] text-white text-xs font-bold rounded-xl transition-all"
                    >
                      Limpiar Filtro
                    </button>
                  </div>
                )}

                {activeQuizCount === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-[#e1e3e4] flex items-center justify-center mb-3">
                      <HelpCircle className="w-8 h-8 text-[#737781]" />
                    </div>
                    <p className="text-sm font-medium text-[#424750]">No hay preguntas de evaluación aún.</p>
                    <p className="text-xs text-[#737781] mt-1">Añade preguntas manualmente con el botón +</p>
                  </div>
                )}

                {/* Quiz footer actions */}
                {activeQuizCount > 0 && (
                  <div className="sticky bottom-6 flex flex-row items-center gap-1.5 z-40 bg-white p-2.5 rounded-xl border border-[#e1e3e4] shadow-[0_8px_32px_rgba(0,27,60,0.12)]">
                    <button
                      onClick={handleCopyQuizCSV}
                      className="flex-1 flex items-center justify-center gap-1 px-2.5 py-2.5 bg-[#f3f4f5] hover:bg-[#e7e8e9] rounded-lg text-[#424750] font-bold text-xs transition-all active:scale-95 shadow-sm"
                      title="Exportar CSV"
                    >
                      <Copy className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">Exportar</span>
                    </button>
                    {quizChanges > 0 && (
                      <button
                        onClick={handleUndoQuiz}
                        className="flex-1 flex items-center justify-center gap-1 px-2.5 py-2.5 bg-[#ffdad6]/30 hover:bg-[#ffdad6]/60 rounded-lg text-[#ba1a1a] font-bold text-xs transition-all active:scale-95 shadow-sm"
                        title="Deshacer cambios"
                      >
                        <Undo2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">Deshacer</span>
                      </button>
                    )}
                    <button
                      disabled={isSaving || quizChanges === 0}
                      onClick={handleSaveQuiz}
                      className={`flex-[2] py-2.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                        isSaving || quizChanges === 0
                          ? 'bg-[#e1e3e4] text-[#737781] cursor-not-allowed'
                          : 'bg-gradient-to-r from-[#00366b] to-[#1b4d89] text-[#ffffff] shadow-md shadow-[#1b4d89]/20 hover:shadow-lg hover:shadow-[#1b4d89]/30'
                      }`}
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" /> : <Save className="w-4 h-4 flex-shrink-0" />}
                      <span className="truncate">
                        {isSaving ? 'Guardando...' : `Sincronizar${quizChanges > 0 ? ` (${quizChanges})` : ''}`}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!selectedTopicId && activeTab !== 'progress' && activeTab !== 'shortEvals' && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-[#e1e3e4] flex items-center justify-center mb-4">
              <Search className="w-10 h-10 text-[#737781]" />
            </div>
            <p className="text-sm font-semibold text-[#424750]">Selecciona un módulo para comenzar</p>
            <p className="text-sm text-[#737781] mt-2">Usa el selector superior para gestionar contenidos del sistema</p>
          </div>
        )}

        {/* ====== TAB: USUARIOS / SEGUIMIENTO ====== */}
        {activeTab === 'progress' && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#00366b] flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#1b4d89]" />
                  Seguimiento de Usuarios
                </h2>
                <p className="text-xs text-[#737781] mt-0.5">Avance y notas por usuario en todos los módulos</p>
              </div>
              <button
                onClick={handleRefreshProgress}
                disabled={progressLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-[#e1e3e4] text-xs font-bold text-[#424750] hover:bg-[#f3f4f5] transition-all disabled:opacity-50"
              >
                {progressLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Actualizar
              </button>
            </div>

            {progressLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#1b4d89]" />
                <p className="text-sm text-[#737781]">Cargando datos de usuarios…</p>
              </div>
            ) : (
              <>
                {/* Stats cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl p-4 border border-[#e1e3e4] text-center">
                    <p className="text-2xl font-bold text-[#1b4d89]">{ingresoRecords.length}</p>
                    <p className="text-[10px] text-[#737781] uppercase font-bold tracking-wider mt-1">Usuarios</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-[#e1e3e4] text-center">
                    <p className="text-2xl font-bold text-emerald-600">{avgAvance}%</p>
                    <p className="text-[10px] text-[#737781] uppercase font-bold tracking-wider mt-1">Avance prom.</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-[#e1e3e4] text-center">
                    <p className="text-2xl font-bold text-amber-600">{avgNota}</p>
                    <p className="text-[10px] text-[#737781] uppercase font-bold tracking-wider mt-1">Nota prom.</p>
                  </div>
                </div>

                {/* Panel de analíticas (gráficos) */}
                {progressAnalytics.evaluated > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="bg-white rounded-xl p-4 border border-[#e1e3e4]">
                      <p className="text-[10px] font-black text-[#737781] uppercase tracking-wider mb-3">Distribución de notas</p>
                      <BarChart data={progressAnalytics.buckets} />
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-[#e1e3e4]">
                      <p className="text-[10px] font-black text-[#737781] uppercase tracking-wider mb-3">Registros por semana</p>
                      {progressAnalytics.weeks.length > 0
                        ? <BarChart data={progressAnalytics.weeks.map(w => ({ label: w.label, value: w.value, color: '#1b4d89' }))} />
                        : <p className="text-xs text-[#737781] italic">Sin datos de fecha</p>}
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-[#e1e3e4] flex flex-col justify-center">
                      <p className="text-[10px] font-black text-[#737781] uppercase tracking-wider mb-3">Aprobación (≥14)</p>
                      <Donut
                        segments={[
                          { label: 'Aprobados', value: progressAnalytics.approved, color: '#10b981' },
                          { label: 'Desaprob.', value: progressAnalytics.notApproved, color: '#f59e0b' },
                        ]}
                        centerLabel={`${Math.round((progressAnalytics.approved / Math.max(1, progressAnalytics.evaluated)) * 100)}%`}
                        centerSub="APROB."
                      />
                    </div>
                  </div>
                )}

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737781]" />
                    <input
                      value={progressSearch}
                      onChange={e => setProgressSearch(e.target.value)}
                      placeholder="Buscar nombre o DNI…"
                      className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#e1e3e4] rounded-xl text-sm text-[#191c1d] focus:border-[#1b4d89] outline-none"
                    />
                  </div>
                  {empresasOptions.length > 0 && (
                    <select
                      value={progressEmpresaFilter}
                      onChange={e => setProgressEmpresaFilter(e.target.value)}
                      className="px-3 py-2.5 bg-white border border-[#e1e3e4] rounded-xl text-xs font-semibold text-[#424750] focus:border-[#1b4d89] outline-none"
                    >
                      <option value="">Todas las empresas</option>
                      {empresasOptions.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  )}
                  {publicoOptions.length > 0 && (
                    <select
                      value={progressPublicoFilter}
                      onChange={e => setProgressPublicoFilter(e.target.value)}
                      className="px-3 py-2.5 bg-white border border-[#e1e3e4] rounded-xl text-xs font-semibold text-[#424750] focus:border-[#1b4d89] outline-none"
                    >
                      <option value="">Todos los públicos</option>
                      {publicoOptions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  )}
                  <button
                    onClick={handleExportProgressExcel}
                    disabled={filteredIngresos.length === 0}
                    className="flex items-center gap-2 px-3 py-2.5 bg-white border border-[#e1e3e4] rounded-xl text-xs font-bold text-[#006d36] hover:bg-emerald-50 transition-all disabled:opacity-40"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Excel
                  </button>
                  <button
                    onClick={handleExportUsuariosBasico}
                    disabled={filteredIngresos.length === 0}
                    title="Exportar: FECHA_INICIO, SEMANA, AREA, CARGO, APELLIDOS Y NOMBRES"
                    className="flex items-center gap-2 px-3 py-2.5 bg-white border border-[#e1e3e4] rounded-xl text-xs font-bold text-[#1b4d89] hover:bg-blue-50 transition-all disabled:opacity-40"
                  >
                    <Users className="w-4 h-4" />
                    Usuarios
                  </button>
                </div>

                {/* Users list */}
                {filteredIngresos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <Users className="w-10 h-10 text-[#c3c6d1] mb-3" />
                    <p className="text-sm font-semibold text-[#424750]">
                      {ingresoRecords.length === 0 ? 'No hay datos de usuarios' : 'Sin resultados para el filtro aplicado'}
                    </p>
                    <p className="text-xs text-[#737781] mt-1">
                      {ingresoRecords.length === 0 ? 'Haz clic en "Actualizar" para cargar los datos' : 'Prueba cambiando los filtros'}
                    </p>
                  </div>
                ) : (() => {
                  const sortedAll = filteredIngresos.slice().sort((a, b) => {
                    const da = parseInicio(a.inicio)?.getTime() ?? 0;
                    const db = parseInicio(b.inicio)?.getTime() ?? 0;
                    return db - da;
                  });
                  const sorted = sortedAll.slice(0, progressLimit);
                  const hasMore = sortedAll.length > sorted.length;
                  const groupMap = new Map<string, { label: string; records: typeof sorted }>();
                  for (const record of sorted) {
                    const date = parseInicio(record.inicio);
                    const key = isoWeekKey(date);
                    const label = date ? isoWeekLabel(date) : 'Sin fecha';
                    if (!groupMap.has(key)) groupMap.set(key, { label, records: [] });
                    groupMap.get(key)!.records.push(record);
                  }
                  const groups = Array.from(groupMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
                  return (
                    <div className="space-y-6">
                      {groups.map(([key, group]) => (
                        <div key={key}>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="h-px flex-1 bg-[#e1e3e4]" />
                            <span className="text-[10px] font-bold text-[#737781] uppercase tracking-wider whitespace-nowrap px-2">{group.label}</span>
                            <div className="h-px flex-1 bg-[#e1e3e4]" />
                          </div>
                          <div className="space-y-2">
                            {group.records.map(record => {
                        const userProgress = parseUserProgress(record.progressJson);
                        const isExpanded = progressExpandedDni === record.dni;
                        const avanceNum = parseFloat(record.avance?.replace('%', '') || '0') || 0;
                        const userAudiences = (record.publico || '').split(',').map((a: string) => a.trim()).filter(Boolean);
                        const userTopics = topics.filter(t =>
                          userAudiences.length === 0 || userAudiences.some((aud: string) => t.audience?.includes(aud))
                        );
                        const avgUserNota = userTopics.length > 0
                          ? userTopics.reduce((sum, t) => {
                              const tp = userProgress.find(p => p.topicId === t.id);
                              return sum + (tp?.quizScore ?? 0);
                            }, 0) / userTopics.length
                          : null;

                        return (
                          <div key={record.dni} className="bg-white rounded-2xl border border-[#e1e3e4] overflow-hidden">
                            <button
                              onClick={() => setProgressExpandedDni(isExpanded ? null : record.dni)}
                              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#f8f9fa] transition-all"
                            >
                              {/* Avatar */}
                              <div className="w-9 h-9 rounded-full bg-[#1b4d89]/10 flex items-center justify-center flex-shrink-0 text-[#1b4d89] font-bold text-sm">
                                {(record.nombres.charAt(0) + record.apellidos.charAt(0)).toUpperCase()}
                              </div>
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-[#00366b] text-sm truncate">{record.nombres} {record.apellidos}</p>
                                <p className="text-[10px] text-[#737781] truncate">{record.dni} · {record.empresa || '—'} · {record.publico || '—'}</p>
                              </div>
                              {/* Stats */}
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="text-center hidden sm:block">
                                  <div className="text-xs font-bold text-[#1b4d89]">{avanceNum > 0 ? `${avanceNum}%` : '—'}</div>
                                  <div className="text-[9px] text-[#737781] uppercase">avance</div>
                                </div>
                                <div className="text-center hidden sm:block">
                                  <div className="text-xs font-bold text-amber-600">{avgUserNota !== null ? avgUserNota.toFixed(1) : '—'}</div>
                                  <div className="text-[9px] text-[#737781] uppercase">nota</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs font-bold text-slate-500">{userTopics.length}</div>
                                  <div className="text-[9px] text-[#737781] uppercase">módulos</div>
                                </div>
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-[#737781]" /> : <ChevronDown className="w-4 h-4 text-[#737781]" />}
                              </div>
                            </button>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <div className="border-t border-[#f3f4f5] px-4 py-4 bg-[#f8f9fa] space-y-4">
                                {/* Profile info */}
                                <div className="flex items-start justify-between gap-3">
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
                                    {[
                                      { label: 'Área', value: record.area || '—' },
                                      { label: 'Cargo', value: record.cargo || '—' },
                                      { label: 'Correo', value: record.correo || '—' },
                                      { label: 'DNI', value: record.dni || '—' },
                                      { label: 'Inicio', value: record.inicio || '—' },
                                      { label: 'Último acceso', value: record.ultimoAcceso || '—' },
                                      { label: 'Dispositivo', value: record.dispositivo || '—' },
                                    ].map(({ label, value }) => (
                                      <div key={label}>
                                        <p className="text-[9px] text-[#737781] uppercase font-bold tracking-wide">{label}</p>
                                        <p className="text-xs text-[#424750] font-semibold truncate">{value}</p>
                                      </div>
                                    ))}
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleOpenEditUser(record); }}
                                    title="Editar perfil, correo o DNI"
                                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#e1e3e4] text-[10px] font-bold text-[#1b4d89] hover:bg-blue-50 hover:border-[#1b4d89]/30 transition-all"
                                  >
                                    <Edit3 className="w-3 h-3" /> Editar
                                  </button>
                                </div>

                                {/* Per-topic progress */}
                                <div>
                                  <p className="text-[9px] font-bold text-[#737781] uppercase tracking-wider mb-2">Avance por módulo</p>
                                  {userTopics.length === 0 ? (
                                    <p className="text-xs text-[#737781]">—</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {userTopics.map(topic => {
                                        const tp = userProgress.find(p => p.topicId === topic.id);
                                        const totalChunks = allChunks.filter(c => c.idMain === topic.id).length;
                                        const pct = tp
                                          ? (tp.completed ? 100 : Math.min(100, Math.round(((tp.currentChunk || 0) / Math.max(totalChunks, 1)) * 100)))
                                          : 0;
                                        const score = tp?.quizScore;
                                        const notStarted = !tp;
                                        const certUrl = allCertificates[record.dni]?.[topic.id];
                                        return (
                                          <div key={topic.id} className="flex items-center gap-2">
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center justify-between gap-2 mb-1">
                                                <p className={`text-xs font-semibold truncate ${notStarted ? 'text-[#737781]' : 'text-[#191c1d]'}`}>{topic.title}</p>
                                                <span className="text-[10px] font-bold text-[#424750] flex-shrink-0">{pct}%</span>
                                              </div>
                                              <div className="h-1.5 bg-[#e1e3e4] rounded-full overflow-hidden">
                                                <div
                                                  className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-[#1b4d89]'}`}
                                                  style={{ width: `${pct}%` }}
                                                />
                                              </div>
                                            </div>
                                            {score !== undefined ? (
                                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${score >= 14 ? 'bg-emerald-100 text-emerald-700' : score >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                                                {score.toFixed(1)}/20
                                              </span>
                                            ) : notStarted ? (
                                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 bg-slate-100 text-slate-400">
                                                0.0/20
                                              </span>
                                            ) : tp?.completed ? (
                                              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                            ) : null}
                                            {certUrl && (
                                              <a
                                                href={certUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="Ver certificado"
                                                className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#1b4d89]/10 text-[#1b4d89] hover:bg-[#1b4d89]/20 transition-colors"
                                              >
                                                <Award className="w-3 h-3" />
                                                <span className="text-[9px] font-bold">Cert.</span>
                                              </a>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* Vista 360°: evaluaciones cortas, certificados y actas */}
                                {(() => {
                                  const userEvals = shortResults.filter(r => String(r.dni).trim() === String(record.dni).trim());
                                  const userFirmas = actaFirmas.filter(f => String(f.dni).trim() === String(record.dni).trim());
                                  const userCerts = allCertificates[record.dni] ? Object.entries(allCertificates[record.dni]) : [];
                                  return (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      {/* Evals cortas */}
                                      <div className="bg-white rounded-lg border border-[#e1e3e4] p-3">
                                        <p className="text-[9px] font-bold text-[#737781] uppercase tracking-wider mb-2 flex items-center gap-1"><ClipboardCheck className="w-3 h-3" /> Evals cortas ({userEvals.length})</p>
                                        {userEvals.length === 0 ? <p className="text-[10px] text-[#a0a4ab] italic">Sin registros</p> : (
                                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                            {userEvals.map((e, i) => (
                                              <div key={i} className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] text-[#424750] truncate" title={e.tema}>{e.tema || 'Eval'}</span>
                                                <span className={`text-[10px] font-bold flex-shrink-0 ${e.nota >= 16 ? 'text-emerald-600' : e.nota >= 12 ? 'text-amber-600' : 'text-red-500'}`}>{e.nota.toFixed(1)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      {/* Certificados */}
                                      <div className="bg-white rounded-lg border border-[#e1e3e4] p-3">
                                        <p className="text-[9px] font-bold text-[#737781] uppercase tracking-wider mb-2 flex items-center gap-1"><Award className="w-3 h-3" /> Certificados ({userCerts.length})</p>
                                        {userCerts.length === 0 ? <p className="text-[10px] text-[#a0a4ab] italic">Sin certificados</p> : (
                                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                            {userCerts.map(([tid, url]) => {
                                              const t = topics.find(tp => tp.id === tid);
                                              return (
                                                <a key={tid} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-[#1b4d89] hover:underline truncate">
                                                  <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" /> <span className="truncate">{t?.title || tid}</span>
                                                </a>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                      {/* Actas firmadas */}
                                      <div className="bg-white rounded-lg border border-[#e1e3e4] p-3">
                                        <p className="text-[9px] font-bold text-[#737781] uppercase tracking-wider mb-2 flex items-center gap-1"><FileSignature className="w-3 h-3" /> Actas firmadas ({userFirmas.length})</p>
                                        {userFirmas.length === 0 ? <p className="text-[10px] text-[#a0a4ab] italic">Sin actas</p> : (
                                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                            {userFirmas.map((f, i) => (
                                              <div key={i} className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] text-[#424750] truncate" title={f.documentoTitulo}>{f.documentoTitulo}</span>
                                                {f.actaPdfUrl && <a href={f.actaPdfUrl} target="_blank" rel="noopener noreferrer" className="text-[#1b4d89] flex-shrink-0" title="Ver acta"><ExternalLink className="w-3 h-3" /></a>}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                            })}
                          </div>
                        </div>
                      ))}
                      {hasMore && (
                        <div className="flex flex-col items-center gap-1.5 pt-2">
                          <button onClick={() => setProgressLimit(l => l + 30)}
                            className="px-5 py-2.5 bg-white border border-[#e1e3e4] rounded-xl text-xs font-bold text-[#1b4d89] hover:bg-[#f3f4f5] hover:border-[#1b4d89]/30 transition-all">
                            Ver más usuarios (+{Math.min(30, sortedAll.length - sorted.length)})
                          </button>
                          <span className="text-[10px] text-[#737781]">Mostrando {sorted.length} de {sortedAll.length}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ====== TAB: SHORT EVALUACIONES ====== */}
        {activeTab === 'shortEvals' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-[#00366b] flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-[#1b4d89]" />
                  Evaluaciones Cortas
                </h2>
                <p className="text-xs text-[#737781] mt-0.5">Crea evaluaciones con enlace directo — un intento por usuario</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleRefreshShortEvals} disabled={shortEvalsLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#e1e3e4] text-xs font-bold text-[#424750] hover:bg-[#f3f4f5] transition-all disabled:opacity-50">
                  {shortEvalsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Actualizar
                </button>
                <button onClick={() => setShowNewEvalForm(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1b4d89] text-white text-xs font-bold hover:bg-[#00366b] transition-all">
                  <Plus className="w-3.5 h-3.5" />
                  Nueva
                </button>
              </div>
            </div>

            {/* Create form */}
            <AnimatePresence>
              {showNewEvalForm && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="bg-white rounded-2xl border border-[#1b4d89]/30 p-5 space-y-3">
                  <p className="text-xs font-bold text-[#1b4d89] uppercase tracking-wider">Nueva evaluación corta</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[#737781] uppercase mb-1">Nombre *</label>
                      <input value={newEvalNombre} onChange={e => setNewEvalNombre(e.target.value)}
                        placeholder="Ej: Evaluación SSMA - Semana 26"
                        className="w-full px-3 py-2.5 text-sm text-[#111827] font-medium placeholder:text-[#9ca3af] border border-[#e1e3e4] rounded-xl focus:outline-none focus:border-[#1b4d89] bg-[#f8f9fa]" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#737781] uppercase mb-1">Descripción</label>
                      <input value={newEvalDesc} onChange={e => setNewEvalDesc(e.target.value)}
                        placeholder="Descripción opcional"
                        className="w-full px-3 py-2.5 text-sm text-[#111827] font-medium placeholder:text-[#9ca3af] border border-[#e1e3e4] rounded-xl focus:outline-none focus:border-[#1b4d89] bg-[#f8f9fa]" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#737781] uppercase mb-1">Módulo *</label>
                    <select value={newEvalTopicId} onChange={e => { setNewEvalTopicId(e.target.value); setNewEvalChunkIds([]); }}
                      className="w-full px-3 py-2.5 text-sm text-[#111827] font-medium border border-[#e1e3e4] rounded-xl focus:outline-none focus:border-[#1b4d89] bg-[#f8f9fa]">
                      <option value="">— Seleccionar módulo —</option>
                      {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  </div>
                  {newEvalTopicId && (() => {
                    const chunks = allChunks.filter(c => c.idMain === newEvalTopicId);
                    if (chunks.length === 0) return null;
                    return (
                      <div>
                        <label className="block text-[10px] font-bold text-[#737781] uppercase mb-1">
                          Secciones (dejar vacío = todas las preguntas del módulo)
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                          {chunks.map(c => (
                            <label key={c.cod} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e1e3e4] cursor-pointer hover:bg-[#f8f9fa] text-xs">
                              <input type="checkbox" checked={newEvalChunkIds.includes(c.cod)}
                                onChange={e => setNewEvalChunkIds(prev => e.target.checked ? [...prev, c.cod] : prev.filter(id => id !== c.cod))}
                                className="accent-[#1b4d89]" />
                              <span className="font-medium text-[#424750] truncate">{c.tema}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setShowNewEvalForm(false)}
                      className="flex-1 py-2.5 rounded-xl border border-[#e1e3e4] text-xs font-bold text-[#737781] hover:bg-[#f3f4f5]">
                      Cancelar
                    </button>
                    <button onClick={handleCreateShortEval} disabled={!newEvalNombre.trim() || !newEvalTopicId || newEvalSaving}
                      className="flex-1 py-2.5 rounded-xl bg-[#1b4d89] text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
                      {newEvalSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Crear evaluación
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* List */}
            {shortEvalsLoading ? (
              <div className="flex flex-col items-center py-12 gap-2">
                <Loader2 className="w-8 h-8 text-[#1b4d89] animate-spin" />
                <p className="text-xs text-[#737781]">Cargando evaluaciones...</p>
              </div>
            ) : shortEvals.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <ClipboardCheck className="w-12 h-12 text-[#e1e3e4] mb-3" />
                <p className="text-sm font-bold text-[#737781]">Sin evaluaciones</p>
                <p className="text-xs text-[#737781] mt-1">Haz clic en "Nueva" para crear la primera evaluación corta</p>
              </div>
            ) : (
              <div className="space-y-3">
                {shortEvals.map(ev => {
                  const evalResults = shortResults.filter(r => r.evaluacionId === ev.id);
                  const link = getEvalLink(ev.id);
                  const showResults = showResultsFor === ev.id;
                  const avgNota = evalResults.length > 0
                    ? (evalResults.reduce((s, r) => s + r.nota, 0) / evalResults.length).toFixed(1)
                    : null;
                  return (
                    <div key={ev.id} className="bg-white rounded-2xl border border-[#e1e3e4] overflow-hidden">
                      <div className="px-4 py-3.5 flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${ev.activo ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                          <ClipboardCheck className={`w-5 h-5 ${ev.activo ? 'text-emerald-600' : 'text-slate-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-[#00366b] text-sm truncate">{ev.nombre}</p>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${ev.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {ev.activo ? 'ACTIVO' : 'INACTIVO'}
                            </span>
                          </div>
                          {ev.descripcion && <p className="text-xs text-[#737781] mt-0.5">{ev.descripcion}</p>}
                          <p className="text-[10px] text-[#737781] mt-1">
                            Módulo: <span className="font-semibold">{ev.topicTitle}</span>
                            {ev.chunkIds.length > 0 && ` · ${ev.chunkIds.length} sección(es)`}
                            <span className="mx-1">·</span>
                            <span className="font-semibold">{evalResults.length}</span> respuestas
                            {avgNota && <span> · Nota prom: <span className="font-semibold text-amber-600">{avgNota}/20</span></span>}
                          </p>
                          {/* Link box */}
                          <div className="mt-2 flex items-center gap-2 bg-[#f8f9fa] rounded-lg px-3 py-2 border border-[#e1e3e4]">
                            <Globe className="w-3.5 h-3.5 text-[#737781] flex-shrink-0" />
                            <span className="text-[10px] text-[#737781] truncate flex-1 font-mono">{link}</span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(link); showToast('Enlace copiado'); }}
                              className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-[#1b4d89]/10 text-[#1b4d89] hover:bg-[#1b4d89]/20 transition-colors text-[10px] font-bold">
                              <Copy className="w-3 h-3" />Copiar
                            </button>
                            <a href={link} target="_blank" rel="noopener noreferrer"
                              className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-[10px] font-bold">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button onClick={() => handleToggleEvalActive(ev)} title={ev.activo ? 'Desactivar' : 'Activar'}
                            className="p-1.5 rounded-lg hover:bg-[#f3f4f5] transition-colors">
                            {ev.activo
                              ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                              : <ToggleLeft className="w-5 h-5 text-slate-400" />}
                          </button>
                          <button onClick={() => {
                              setShowResultsFor(showResults ? null : ev.id);
                              setResultsSort({ key: 'fecha', dir: 'asc' });
                              setResultsFilters({ dni: '', nombre: '', nota: '', porcentaje: '', fecha: '', fallo: '' });
                              setResultsPage(1);
                            }} title="Ver resultados"
                            className="p-1.5 rounded-lg hover:bg-[#f3f4f5] transition-colors">
                            <TrendingUp className="w-4 h-4 text-[#1b4d89]" />
                          </button>
                          <button onClick={() => handleDeleteShortEval(ev.id)} title="Eliminar"
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      </div>

                      {/* Results table */}
                      {showResults && (() => {
                        const activeFilters = resultsFilters;
                        const displayResults = evalResults
                          .filter(r => {
                            if (activeFilters.dni && !r.dni.toLowerCase().includes(activeFilters.dni.toLowerCase())) return false;
                            if (activeFilters.nombre && !`${r.apellidos} ${r.nombres}`.toLowerCase().includes(activeFilters.nombre.toLowerCase())) return false;
                            if (activeFilters.nota && !matchNumericFilter(r.nota, activeFilters.nota, r.nota.toFixed(1))) return false;
                            if (activeFilters.porcentaje && !matchNumericFilter(r.porcentaje, activeFilters.porcentaje, String(r.porcentaje))) return false;
                            if (activeFilters.fecha && !r.fechaHora.toLowerCase().includes(activeFilters.fecha.toLowerCase())) return false;
                            if (activeFilters.fallo && !String((r.preguntasErroneas || []).length).includes(activeFilters.fallo.trim())) return false;
                            return true;
                          })
                          .sort((a, b) => {
                            const dir = resultsSort.dir === 'asc' ? 1 : -1;
                            switch (resultsSort.key) {
                              case 'dni': return a.dni.localeCompare(b.dni, 'es', { numeric: true }) * dir;
                              case 'nombre': return `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`, 'es', { sensitivity: 'base' }) * dir;
                              case 'nota': return (a.nota - b.nota) * dir;
                              case 'porcentaje': return (a.porcentaje - b.porcentaje) * dir;
                              case 'fecha': return a.fechaHora.localeCompare(b.fechaHora, 'es') * dir;
                              case 'fallo': return ((a.preguntasErroneas || []).length - (b.preguntasErroneas || []).length) * dir;
                              default: return 0;
                            }
                          });
                        const SortIcon = ({ col }: { col: ResultsSortKey }) => (
                          resultsSort.key === col
                            ? (resultsSort.dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)
                            : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />
                        );
                        const rTotalPages = Math.max(1, Math.ceil(displayResults.length / TABLE_PAGE_SIZE));
                        const rPage = Math.min(resultsPage, rTotalPages);
                        const pageResults = displayResults.slice((rPage - 1) * TABLE_PAGE_SIZE, rPage * TABLE_PAGE_SIZE);
                        return (
                        <div className="border-t border-[#f3f4f5] px-4 py-3 bg-[#f8f9fa]">
                          <p className="text-[9px] font-bold text-[#737781] uppercase tracking-wider mb-2">
                            Resultados ({displayResults.length}{displayResults.length !== evalResults.length ? ` / ${evalResults.length}` : ''})
                          </p>
                          {evalResults.length === 0 ? (
                            <p className="text-xs text-[#737781] italic">Sin respuestas aún</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-[9px] text-[#737781] uppercase">
                                    <th className="text-left pb-1 pr-3">
                                      <button onClick={() => toggleResultsSort('dni')} className="inline-flex items-center gap-1 hover:text-[#1b4d89] transition-colors uppercase font-bold">DNI <SortIcon col="dni" /></button>
                                    </th>
                                    <th className="text-left pb-1 pr-3">
                                      <button onClick={() => toggleResultsSort('nombre')} className="inline-flex items-center gap-1 hover:text-[#1b4d89] transition-colors uppercase font-bold">Apellidos y Nombres <SortIcon col="nombre" /></button>
                                    </th>
                                    <th className="text-center pb-1 pr-3">
                                      <button onClick={() => toggleResultsSort('nota')} className="inline-flex items-center gap-1 hover:text-[#1b4d89] transition-colors uppercase font-bold">Nota <SortIcon col="nota" /></button>
                                    </th>
                                    <th className="text-center pb-1">
                                      <button onClick={() => toggleResultsSort('porcentaje')} className="inline-flex items-center gap-1 hover:text-[#1b4d89] transition-colors uppercase font-bold">% <SortIcon col="porcentaje" /></button>
                                    </th>
                                    <th className="text-left pb-1 pl-3">
                                      <button onClick={() => toggleResultsSort('fecha')} className="inline-flex items-center gap-1 hover:text-[#1b4d89] transition-colors uppercase font-bold">Fecha <SortIcon col="fecha" /></button>
                                    </th>
                                    <th className="text-center pb-1 pl-3">
                                      <button onClick={() => toggleResultsSort('fallo')} className="inline-flex items-center gap-1 hover:text-[#1b4d89] transition-colors uppercase font-bold">Falló <SortIcon col="fallo" /></button>
                                    </th>
                                    <th className="pb-1"></th>
                                  </tr>
                                  <tr className="align-top">
                                    <th className="pb-2 pr-3"><input value={resultsFilters.dni} onChange={e => setResultsFilters(f => ({ ...f, dni: e.target.value }))} placeholder="Filtrar…" className="w-full font-normal normal-case bg-white border border-[#e1e3e4] rounded-md px-1.5 py-1 text-[10px] text-[#424750] placeholder:text-[#b0b3b8] focus:outline-none focus:border-[#1b4d89]" /></th>
                                    <th className="pb-2 pr-3"><input value={resultsFilters.nombre} onChange={e => setResultsFilters(f => ({ ...f, nombre: e.target.value }))} placeholder="Filtrar…" className="w-full font-normal normal-case bg-white border border-[#e1e3e4] rounded-md px-1.5 py-1 text-[10px] text-[#424750] placeholder:text-[#b0b3b8] focus:outline-none focus:border-[#1b4d89]" /></th>
                                    <th className="pb-2 pr-3"><input value={resultsFilters.nota} onChange={e => setResultsFilters(f => ({ ...f, nota: e.target.value }))} placeholder=">14" title="Usa >, <, >=, <=, = o un número. Ej: >14, <=10" className="w-full font-normal normal-case bg-white border border-[#e1e3e4] rounded-md px-1.5 py-1 text-[10px] text-[#424750] text-center placeholder:text-[#b0b3b8] focus:outline-none focus:border-[#1b4d89]" /></th>
                                    <th className="pb-2"><input value={resultsFilters.porcentaje} onChange={e => setResultsFilters(f => ({ ...f, porcentaje: e.target.value }))} placeholder=">70" title="Usa >, <, >=, <=, = o un número. Ej: >70, <=50" className="w-full font-normal normal-case bg-white border border-[#e1e3e4] rounded-md px-1.5 py-1 text-[10px] text-[#424750] text-center placeholder:text-[#b0b3b8] focus:outline-none focus:border-[#1b4d89]" /></th>
                                    <th className="pb-2 pl-3"><input value={resultsFilters.fecha} onChange={e => setResultsFilters(f => ({ ...f, fecha: e.target.value }))} placeholder="Filtrar…" className="w-full font-normal normal-case bg-white border border-[#e1e3e4] rounded-md px-1.5 py-1 text-[10px] text-[#424750] placeholder:text-[#b0b3b8] focus:outline-none focus:border-[#1b4d89]" /></th>
                                    <th className="pb-2 pl-3"><input value={resultsFilters.fallo} onChange={e => setResultsFilters(f => ({ ...f, fallo: e.target.value }))} placeholder="…" className="w-full font-normal normal-case bg-white border border-[#e1e3e4] rounded-md px-1.5 py-1 text-[10px] text-[#424750] text-center placeholder:text-[#b0b3b8] focus:outline-none focus:border-[#1b4d89]" /></th>
                                    <th className="pb-2"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#f3f4f5]">
                                  {displayResults.length === 0 ? (
                                    <tr><td colSpan={7} className="py-3 text-center text-[#737781] italic text-[11px]">Sin resultados para los filtros aplicados</td></tr>
                                  ) : pageResults.map((r) => {
                                    const rowKey = `${r.evaluacionId}__${r.dni}`;
                                    const wrong = r.preguntasErroneas || [];
                                    const isExpanded = expandedResult === rowKey;
                                    const isDeleting = deletingResult === rowKey;
                                    return (
                                      <Fragment key={rowKey}>
                                        <tr>
                                          <td className="py-1.5 pr-3 font-mono text-[#737781]">{r.dni}</td>
                                          <td className="py-1.5 pr-3 font-semibold text-[#424750]">{r.apellidos} {r.nombres}</td>
                                          <td className={`py-1.5 pr-3 text-center font-bold ${r.nota >= 16 ? 'text-emerald-600' : r.nota >= 12 ? 'text-amber-600' : 'text-red-500'}`}>
                                            {r.nota.toFixed(1)}/20
                                          </td>
                                          <td className="py-1.5 text-center font-bold text-[#424750]">{r.porcentaje}%</td>
                                          <td className="py-1.5 pl-3 text-[#737781] whitespace-nowrap">{r.fechaHora}</td>
                                          <td className="py-1.5 pl-3 text-center">
                                            {wrong.length > 0 ? (
                                              <button
                                                onClick={() => setExpandedResult(isExpanded ? null : rowKey)}
                                                title="Ver preguntas falladas"
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-bold text-[10px]"
                                              >
                                                {wrong.length}
                                                <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                              </button>
                                            ) : (
                                              <span className="text-emerald-500 font-bold text-[10px]">0</span>
                                            )}
                                          </td>
                                          <td className="py-1.5 pl-2 text-center">
                                            <button
                                              onClick={() => handleDeleteShortResult(r.evaluacionId, r.dni)}
                                              disabled={isDeleting}
                                              title="Eliminar registro"
                                              className="p-1 rounded-md hover:bg-red-50 transition-colors disabled:opacity-40"
                                            >
                                              {isDeleting
                                                ? <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
                                                : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                                            </button>
                                          </td>
                                        </tr>
                                        {isExpanded && wrong.length > 0 && (
                                          <tr>
                                            <td colSpan={7} className="py-2 px-2 bg-white">
                                              <p className="text-[9px] font-bold text-[#737781] uppercase tracking-wider mb-2">
                                                Preguntas falladas ({wrong.length})
                                              </p>
                                              <div className="space-y-2">
                                                {wrong.map((w, wi) => (
                                                  <div key={wi} className="rounded-lg border border-red-100 bg-red-50/60 p-2.5">
                                                    <p className="text-[11px] font-semibold text-[#191c1d] mb-1">{wi + 1}. {w.question}</p>
                                                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
                                                      <span className="text-red-600">Respondió: <strong>{w.selected || '—'}</strong></span>
                                                      <span className="text-emerald-600">Correcta: <strong>{w.correct}</strong></span>
                                                    </div>
                                                    {w.explanation && <p className="text-[10px] text-[#737781] italic mt-1">{w.explanation}</p>}
                                                  </div>
                                                ))}
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                              <Pager page={rPage} totalPages={rTotalPages} total={displayResults.length} onPage={setResultsPage} />
                            </div>
                          )}
                        </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ====== TAB: ACTAS ====== */}
        {activeTab === 'actas' && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-[#1b4d89]" />
                <div>
                  <h2 className="text-lg font-black text-[#00366b]">Actas y Compromisos</h2>
                  <p className="text-xs text-[#737781]">Crea documentos, asígnalos por perfil o DNI, y revisa las firmas con verificación facial</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleRefreshActas} className="flex items-center gap-2 px-3 py-2 bg-white border border-[#e1e3e4] rounded-xl text-xs font-bold text-[#424750] hover:bg-[#f3f4f5] transition-all">
                  <RefreshCw className={`w-4 h-4 ${actasLoading ? 'animate-spin' : ''}`} /> Actualizar
                </button>
                <button onClick={() => { resetActaForm(); setShowNewActaForm(true); }} className="flex items-center gap-2 px-3 py-2 bg-[#1b4d89] text-white rounded-xl text-xs font-bold hover:bg-[#00366b] transition-all">
                  <Plus className="w-4 h-4" /> Nuevo
                </button>
              </div>
            </div>

            {/* Create / edit form */}
            {showNewActaForm && (
              <div className="bg-white rounded-2xl border border-[#1b4d89]/20 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-[#00366b]">{editingActaId ? 'Editar documento' : 'Nuevo documento'}</h3>
                  <button onClick={resetActaForm} className="text-[#737781] hover:text-[#00366b]"><X className="w-4 h-4" /></button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-[#737781] uppercase tracking-wider">Título *</label>
                    <input value={actaForm.titulo} onChange={e => setActaForm(f => ({ ...f, titulo: e.target.value }))}
                      placeholder="Ej. Compromiso de Seguridad SST"
                      className="w-full mt-1 px-3 py-2 bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg text-sm text-[#191c1d] focus:border-[#1b4d89] outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[#737781] uppercase tracking-wider">Descripción</label>
                    <input value={actaForm.descripcion} onChange={e => setActaForm(f => ({ ...f, descripcion: e.target.value }))}
                      placeholder="Breve resumen del documento"
                      className="w-full mt-1 px-3 py-2 bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg text-sm text-[#191c1d] focus:border-[#1b4d89] outline-none" />
                  </div>
                </div>

                {/* Perfiles */}
                <div>
                  <label className="text-[10px] font-bold text-[#737781] uppercase tracking-wider">Asignar a perfiles</label>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {AUDIENCE_CONFIG.profiles.map(p => {
                      const active = actaForm.perfiles.includes(p.id);
                      const disabled = !active && actaForm.dnis.trim().length > 0;
                      return (
                        <button key={p.id} disabled={disabled}
                          onClick={() => setActaForm(f => ({ ...f, perfiles: active ? f.perfiles.filter(x => x !== p.id) : [...f.perfiles, p.id] }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${active ? 'bg-[#1b4d89] text-white border-[#1b4d89]' : 'bg-white text-[#424750] border-[#e1e3e4] hover:border-[#1b4d89]/40'} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#e1e3e4]`}>
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* DNIs */}
                <div>
                  <label className="text-[10px] font-bold text-[#737781] uppercase tracking-wider">…o asignar a DNIs específicos (separados por coma)</label>
                  <input value={actaForm.dnis} onChange={e => setActaForm(f => ({ ...f, dnis: e.target.value }))}
                    disabled={actaForm.perfiles.length > 0}
                    placeholder={actaForm.perfiles.length > 0 ? 'Quita los perfiles asignados para usar DNIs específicos' : 'Ej. 70115721, 46879832'}
                    className="w-full mt-1 px-3 py-2 bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg text-sm text-[#191c1d] focus:border-[#1b4d89] outline-none disabled:opacity-40 disabled:cursor-not-allowed" />
                </div>

                {editingHasExtraItems && (
                  <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                    Este documento tenía varios documentos internos (modelo anterior). Al guardar quedará como un solo documento independiente; si necesitas los demás, créalos por separado con "Nuevo".
                  </div>
                )}

                {/* Tipo + enlace de Drive (el documento en sí, ya no anidado) */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[10px] font-bold text-[#737781] uppercase tracking-wider mr-1">Tipo:</span>
                    {(['virtual', 'fisico'] as const).map(t => (
                      <button key={t} onClick={() => setActaForm(f => ({ ...f, tipo: t }))}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors ${
                          actaForm.tipo === t ? 'bg-[#1b4d89] text-white' : 'bg-white border border-[#e1e3e4] text-[#737781] hover:border-[#1b4d89]/40'
                        }`}>{t === 'virtual' ? 'Virtual' : 'Físico'}</button>
                    ))}
                  </div>
                  {actaForm.tipo === 'virtual' ? (
                    <div className="flex items-center gap-2">
                      <input value={actaForm.driveUrl} onChange={e => setActaForm(f => ({ ...f, driveUrl: e.target.value }))}
                        placeholder="Enlace de Drive (para ver y QR)"
                        className="flex-1 px-3 py-2 bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg text-sm text-[#191c1d] focus:border-[#1b4d89] outline-none" />
                      {actaForm.driveUrl.trim() && <QrPreview url={actaForm.driveUrl.trim()} size={48} />}
                    </div>
                  ) : (
                    <p className="text-[10px] text-[#9aa0a6] italic px-1">Entrega física — sin enlace de Drive.</p>
                  )}
                </div>

                {/* Código de control documental (para la lista de distribución en PDF) */}
                <div>
                  <label className="text-[10px] font-bold text-[#737781] uppercase tracking-wider">Código de control documental (opcional, para la lista de distribución)</label>
                  <div className="grid grid-cols-3 gap-1.5 mt-1">
                    <input value={actaForm.codigo} onChange={e => setActaForm(f => ({ ...f, codigo: e.target.value }))}
                      placeholder="Código (ej. FPG-CL-SIG-06-05)"
                      className="px-2 py-1.5 bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg text-[11px] text-[#191c1d] focus:border-[#1b4d89] outline-none" />
                    <input value={actaForm.version} onChange={e => setActaForm(f => ({ ...f, version: e.target.value }))}
                      placeholder="Versión"
                      className="px-2 py-1.5 bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg text-[11px] text-[#191c1d] focus:border-[#1b4d89] outline-none" />
                    <input value={actaForm.fechaVersion} onChange={e => setActaForm(f => ({ ...f, fechaVersion: e.target.value }))}
                      placeholder="Fecha de actualización"
                      className="px-2 py-1.5 bg-[#f8f9fa] border border-[#e1e3e4] rounded-lg text-[11px] text-[#191c1d] focus:border-[#1b4d89] outline-none" />
                  </div>
                </div>

                {/* Firma dibujada */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={actaForm.requiereFirmaDibujada} onChange={e => setActaForm(f => ({ ...f, requiereFirmaDibujada: e.target.checked }))}
                    className="w-4 h-4 accent-[#1b4d89]" />
                  <span className="text-xs font-semibold text-[#424750]">Requiere firma dibujada (además del rostro)</span>
                </label>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button onClick={resetActaForm} className="px-4 py-2 rounded-lg text-xs font-bold text-[#737781] hover:bg-[#f3f4f5] transition-all">Cancelar</button>
                  <button onClick={handleSaveActa} disabled={actaSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1b4d89] text-white rounded-lg text-xs font-bold hover:bg-[#00366b] transition-all disabled:opacity-50">
                    {actaSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {editingActaId ? 'Guardar cambios' : 'Crear documento'}
                  </button>
                </div>
              </div>
            )}

            {/* Documents list */}
            {actasLoading && actaDocs.length === 0 ? (
              <div className="flex flex-col items-center py-12"><Loader2 className="w-8 h-8 text-[#1b4d89] animate-spin mb-2" /><p className="text-sm text-[#737781]">Cargando documentos…</p></div>
            ) : actaDocs.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <FileSignature className="w-12 h-12 text-[#e1e3e4] mb-3" />
                <p className="text-sm font-bold text-[#737781]">Sin documentos</p>
                <p className="text-xs text-[#737781] mt-1">Haz clic en "Nuevo" para crear la primera acta o compromiso</p>
              </div>
            ) : (
              <div className="space-y-3">
                {actaDocs.map(doc => {
                  const roster = rostersByDoc.get(doc.id) || [];
                  const firmados = roster.filter(r => r.firma).length;
                  const showFirmas = showFirmasFor === doc.id;
                  return (
                    <div key={doc.id} className="bg-white rounded-2xl border border-[#e1e3e4] overflow-hidden">
                      <div className="px-4 py-3.5 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#1b4d89]/10 flex items-center justify-center flex-shrink-0">
                          <FileSignature className="w-5 h-5 text-[#1b4d89]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[#00366b] text-sm">{doc.titulo}</p>
                          {doc.descripcion && <p className="text-xs text-[#737781] mt-0.5">{doc.descripcion}</p>}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {doc.perfiles.map(p => <span key={p} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{p}</span>)}
                            {doc.dnisAsignados.length > 0 && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{doc.dnisAsignados.length} DNI(s)</span>}
                            {doc.items.length > 0 && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1"><ClipboardList className="w-2.5 h-2.5" /> {doc.items.length} doc(s)</span>}
                            {doc.driveDocUrl && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 flex items-center gap-1"><ExternalLink className="w-2.5 h-2.5" /> adjunto</span>}
                          </div>
                          <p className="text-[10px] text-[#737781] mt-1.5">
                            <span className="font-semibold text-emerald-600">{firmados}</span> firmado(s) · <span className="font-semibold">{roster.length}</span> asignado(s)
                            {roster.length > 0 && <span className="ml-1 font-bold text-[#1b4d89]">({Math.round((firmados / roster.length) * 100)}%)</span>}
                          </p>
                          {roster.length > 0 && <div className="mt-1.5 max-w-[220px]"><ProgressBar value={firmados} max={roster.length} /></div>}
                        </div>
                        {doc.driveDocUrl && (
                          <div className="flex-shrink-0 hidden sm:block">
                            <QrPreview url={doc.driveDocUrl} size={64} caption="QR del acta" />
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button onClick={() => { setShowFirmasFor(showFirmas ? null : doc.id); setFirmaFilters({ dni: '', nombre: '', estado: '', fecha: '', correo: '' }); setFirmaSort({ key: 'nombre', dir: 'asc' }); setFirmaPage(1); }}
                            title="Ver firmas" className="p-1.5 rounded-lg hover:bg-[#f3f4f5] transition-colors"><TrendingUp className="w-4 h-4 text-[#1b4d89]" /></button>
                          <button onClick={() => handleEditActa(doc)} title="Editar" className="p-1.5 rounded-lg hover:bg-[#f3f4f5] transition-colors"><Edit3 className="w-4 h-4 text-[#737781]" /></button>
                          <button onClick={() => handleDeleteActa(doc.id)} title="Eliminar" className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4 text-red-400" /></button>
                        </div>
                      </div>

                      {/* Firmas table */}
                      {showFirmas && (() => {
                        const filtered = roster.filter(r => {
                          const estado = r.firma ? 'firmado' : 'pendiente';
                          if (firmaFilters.dni && !r.dni.toLowerCase().includes(firmaFilters.dni.toLowerCase())) return false;
                          if (firmaFilters.nombre && !r.nombre.toLowerCase().includes(firmaFilters.nombre.toLowerCase())) return false;
                          if (firmaFilters.estado && !estado.includes(firmaFilters.estado.toLowerCase())) return false;
                          if (firmaFilters.fecha && !(r.firma?.fechaFirma || '').toLowerCase().includes(firmaFilters.fecha.toLowerCase())) return false;
                          if (firmaFilters.correo && !(r.correo || '').toLowerCase().includes(firmaFilters.correo.toLowerCase())) return false;
                          return true;
                        }).sort((a, b) => {
                          const dir = firmaSort.dir === 'asc' ? 1 : -1;
                          switch (firmaSort.key) {
                            case 'dni': return a.dni.localeCompare(b.dni, 'es', { numeric: true }) * dir;
                            case 'nombre': return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }) * dir;
                            case 'estado': return ((a.firma ? 1 : 0) - (b.firma ? 1 : 0)) * dir;
                            case 'fecha': return (a.firma?.fechaFirma || '').localeCompare(b.firma?.fechaFirma || '', 'es') * dir;
                            case 'correo': return (a.correo || '').localeCompare(b.correo || '', 'es') * dir;
                            default: return 0;
                          }
                        });
                        const FSortIcon = ({ col }: { col: FirmaSortKey }) => (
                          firmaSort.key === col ? (firmaSort.dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />
                        );
                        const fTotalPages = Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE));
                        const fPage = Math.min(firmaPage, fTotalPages);
                        const pageFirmas = filtered.slice((fPage - 1) * TABLE_PAGE_SIZE, fPage * TABLE_PAGE_SIZE);
                        return (
                          <div className="border-t border-[#f3f4f5] px-4 py-3 bg-[#f8f9fa]">
                            {/* Lista de distribución por documento (item) */}
                            {doc.items.length > 0 && (
                              <div className="mb-3 space-y-1.5">
                                <p className="text-[9px] font-bold text-[#737781] uppercase tracking-wider">Lista de distribución por documento</p>
                                {doc.items.map((it, idx) => {
                                  const itemRoster = buildItemRoster(doc, it, actaFirmas, ingresoRecords);
                                  const itemFirmados = itemRoster.filter(r => r.firma).length;
                                  const key = `${doc.id}:${idx}`;
                                  return (
                                    <div key={idx} className="flex items-center justify-between gap-2 bg-white border border-[#e1e3e4] rounded-lg px-3 py-1.5">
                                      <span className="text-xs font-semibold text-[#424750] truncate">{it.nombre}</span>
                                      <span className="text-[10px] text-[#737781] flex-shrink-0">{itemFirmados}/{itemRoster.length} firmado(s)</span>
                                      <button onClick={() => handleGenerateDistribucion(doc, it, key)} disabled={itemFirmados === 0 || generatingPdfKey === key}
                                        title="Generar lista de distribución en PDF"
                                        className="flex items-center gap-1 px-2 py-1 bg-[#1b4d89]/10 text-[#1b4d89] rounded-md text-[10px] font-bold hover:bg-[#1b4d89]/20 transition-all disabled:opacity-40 flex-shrink-0">
                                        {generatingPdfKey === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} PDF
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[9px] font-bold text-[#737781] uppercase tracking-wider">Firmas ({filtered.length}{filtered.length !== roster.length ? ` / ${roster.length}` : ''})</p>
                              <button onClick={() => handleExportFirmas(doc, filtered)} disabled={roster.length === 0}
                                className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#e1e3e4] rounded-lg text-[10px] font-bold text-[#006d36] hover:bg-emerald-50 transition-all disabled:opacity-40">
                                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                              </button>
                            </div>
                            {roster.length === 0 ? (
                              <p className="text-xs text-[#737781] italic">Nadie asignado todavía. Verifica los perfiles/DNIs o que existan usuarios en INGRESOS.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-[9px] text-[#737781] uppercase">
                                      <th className="text-left pb-1 pr-3"><button onClick={() => toggleFirmaSort('dni')} className="inline-flex items-center gap-1 hover:text-[#1b4d89] uppercase font-bold">DNI <FSortIcon col="dni" /></button></th>
                                      <th className="text-left pb-1 pr-3"><button onClick={() => toggleFirmaSort('nombre')} className="inline-flex items-center gap-1 hover:text-[#1b4d89] uppercase font-bold">Apellidos y Nombres <FSortIcon col="nombre" /></button></th>
                                      <th className="text-center pb-1 pr-3"><button onClick={() => toggleFirmaSort('estado')} className="inline-flex items-center gap-1 hover:text-[#1b4d89] uppercase font-bold">Estado <FSortIcon col="estado" /></button></th>
                                      <th className="text-left pb-1 pr-3"><button onClick={() => toggleFirmaSort('fecha')} className="inline-flex items-center gap-1 hover:text-[#1b4d89] uppercase font-bold">Fecha <FSortIcon col="fecha" /></button></th>
                                      <th className="text-left pb-1 pr-3"><button onClick={() => toggleFirmaSort('correo')} className="inline-flex items-center gap-1 hover:text-[#1b4d89] uppercase font-bold">Correo <FSortIcon col="correo" /></button></th>
                                      <th className="pb-1"></th>
                                    </tr>
                                    <tr className="align-top">
                                      <th className="pb-2 pr-3"><input value={firmaFilters.dni} onChange={e => setFirmaFilters(f => ({ ...f, dni: e.target.value }))} placeholder="Filtrar…" className="w-full font-normal normal-case bg-white border border-[#e1e3e4] rounded-md px-1.5 py-1 text-[10px] focus:outline-none focus:border-[#1b4d89]" /></th>
                                      <th className="pb-2 pr-3"><input value={firmaFilters.nombre} onChange={e => setFirmaFilters(f => ({ ...f, nombre: e.target.value }))} placeholder="Filtrar…" className="w-full font-normal normal-case bg-white border border-[#e1e3e4] rounded-md px-1.5 py-1 text-[10px] focus:outline-none focus:border-[#1b4d89]" /></th>
                                      <th className="pb-2 pr-3"><input value={firmaFilters.estado} onChange={e => setFirmaFilters(f => ({ ...f, estado: e.target.value }))} placeholder="firmado…" className="w-full font-normal normal-case bg-white border border-[#e1e3e4] rounded-md px-1.5 py-1 text-[10px] text-center focus:outline-none focus:border-[#1b4d89]" /></th>
                                      <th className="pb-2 pr-3"><input value={firmaFilters.fecha} onChange={e => setFirmaFilters(f => ({ ...f, fecha: e.target.value }))} placeholder="Filtrar…" className="w-full font-normal normal-case bg-white border border-[#e1e3e4] rounded-md px-1.5 py-1 text-[10px] focus:outline-none focus:border-[#1b4d89]" /></th>
                                      <th className="pb-2 pr-3"><input value={firmaFilters.correo} onChange={e => setFirmaFilters(f => ({ ...f, correo: e.target.value }))} placeholder="Filtrar…" className="w-full font-normal normal-case bg-white border border-[#e1e3e4] rounded-md px-1.5 py-1 text-[10px] focus:outline-none focus:border-[#1b4d89]" /></th>
                                      <th className="pb-2"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#f3f4f5]">
                                    {filtered.length === 0 ? (
                                      <tr><td colSpan={6} className="py-3 text-center text-[#737781] italic text-[11px]">Sin resultados para los filtros aplicados</td></tr>
                                    ) : pageFirmas.map(r => (
                                      <tr key={r.dni}>
                                        <td className="py-1.5 pr-3 font-mono text-[#737781]">{r.dni}</td>
                                        <td className="py-1.5 pr-3 font-semibold text-[#424750]">{r.nombre}</td>
                                        <td className="py-1.5 pr-3 text-center">
                                          {r.firma
                                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 font-bold text-[10px]"><CheckCircle2 className="w-3 h-3" /> Firmado</span>
                                            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 font-bold text-[10px]">Pendiente</span>}
                                        </td>
                                        <td className="py-1.5 pr-3 text-[#737781] whitespace-nowrap">{r.firma?.fechaFirma || '—'}</td>
                                        <td className="py-1.5 pr-3 text-[#737781]">
                                          <span className="inline-flex items-center gap-1">
                                            {r.correo || '—'}
                                            {r.firma && (r.firma.correoEnviado === 'SI'
                                              ? <span title="Correo enviado" className="text-emerald-500"><Mail className="w-3 h-3" /></span>
                                              : <span title="Correo no enviado" className="text-amber-500"><Mail className="w-3 h-3" /></span>)}
                                          </span>
                                        </td>
                                        <td className="py-1.5 text-right whitespace-nowrap">
                                          {r.firma?.actaPdfUrl && (
                                            <a href={r.firma.actaPdfUrl} target="_blank" rel="noopener noreferrer" title="Ver PDF" className="inline-flex p-1 rounded-md hover:bg-slate-100 text-[#1b4d89]"><ExternalLink className="w-3.5 h-3.5" /></a>
                                          )}
                                          {r.firma && r.correo && (
                                            <button onClick={() => handleResendActa(r.firma!)} disabled={resendingFirma === r.firma.id} title="Reenviar correo"
                                              className="inline-flex p-1 rounded-md hover:bg-blue-50 text-blue-500 disabled:opacity-40">
                                              {resendingFirma === r.firma.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <Pager page={fPage} totalPages={fTotalPages} total={filtered.length} onPage={setFirmaPage} />
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Action Button (FAB) */}
      {(activeTab === 'topics' || (selectedTopicId && (activeTab === 'content' || activeTab === 'quiz'))) && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={activeTab === 'content' ? handleAddContentManual : activeTab === 'quiz' ? handleAddQuizManual : handleAddTopicManual}
          className={`fixed bottom-24 right-6 w-16 h-16 rounded-full shadow-[0_8px_24px_rgba(0,27,60,0.2)] flex items-center justify-center transition-all z-50 hover:shadow-[0_12px_32px_rgba(0,27,60,0.3)] ${
            activeTab === 'topics' ? 'bg-gradient-to-r from-[#582a00] to-[#8c4a00]' :
            activeTab === 'content' ? 'bg-gradient-to-r from-[#00366b] to-[#1b4d89]' :
            'bg-gradient-to-r from-[#006d36] to-[#005227]'
          }`}
          title={activeTab === 'content' ? 'Añadir sección manual' : activeTab === 'quiz' ? 'Añadir pregunta manual' : 'Añadir nuevo módulo'}
        >
          <Plus className="w-8 h-8 text-[#ffffff]" strokeWidth={3} />
        </motion.button>
      )}

      {/* Plantilla de lista de distribución — fuera de pantalla, solo para capturar con html2canvas/html2pdf */}
      {distribucionData && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
          <ActaDistribucionTemplate
            ref={distribucionRef}
            item={distribucionData.item}
            documentoTitulo={distribucionData.documentoTitulo}
            rows={distribucionData.rows}
            appConfig={appConfig ?? null}
          />
        </div>
      )}

      {/* Edit User Profile Modal (perfil / correo / DNI) */}
      <AnimatePresence>
        {editingUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => !savingProfile && setEditingUser(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-[0_16px_48px_rgba(0,0,0,0.15)]"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full bg-[#1b4d89]/10 flex items-center justify-center flex-shrink-0">
                  <Edit3 className="w-5 h-5 text-[#1b4d89]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#00366b]">Editar perfil de usuario</h3>
                  <p className="text-sm text-[#737781]">{editingUser.nombres} {editingUser.apellidos}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-2">Perfil (público)</p>
                  <div className="flex flex-wrap gap-2">
                    {AUDIENCE_CONFIG.profiles.map(profile => {
                      const checked = editForm.publico.includes(profile.id);
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => setEditForm(prev => ({
                            ...prev,
                            publico: checked ? prev.publico.filter(p => p !== profile.id) : [...prev.publico, profile.id],
                          }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                            checked
                              ? 'bg-[#1b4d89] border-[#1b4d89] text-white'
                              : 'bg-white border-[#e1e3e4] text-[#424750] hover:bg-[#f3f4f5]'
                          }`}
                        >
                          {profile.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-1.5 block">Correo</label>
                  <input
                    type="email"
                    value={editForm.correo}
                    onChange={e => setEditForm(prev => ({ ...prev, correo: e.target.value }))}
                    placeholder="correo@ejemplo.com"
                    className="w-full px-3 py-2.5 bg-white border border-[#e1e3e4] rounded-xl text-sm text-[#191c1d] focus:border-[#1b4d89] outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-[#737781] uppercase tracking-wide mb-1.5 block">DNI</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    value={editForm.dni}
                    onChange={e => setEditForm(prev => ({ ...prev, dni: e.target.value.replace(/\D/g, '') }))}
                    className="w-full px-3 py-2.5 bg-white border border-[#e1e3e4] rounded-xl text-sm text-[#191c1d] focus:border-[#1b4d89] outline-none"
                  />
                  {editForm.dni !== editingUser.dni && (
                    <p className="text-[10px] text-amber-600 font-semibold mt-1.5">
                      Se actualizará también en certificados, actas firmadas y evaluaciones cortas de este usuario. El usuario deberá usar el nuevo DNI para volver a ingresar.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setEditingUser(null)}
                  disabled={savingProfile}
                  className="flex-1 py-3 rounded-xl border-2 border-[#e1e3e4] text-[#424750] font-semibold text-sm hover:bg-[#f3f4f5] transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveUserProfile}
                  disabled={savingProfile}
                  className="flex-1 py-3 rounded-xl bg-[#1b4d89] text-white font-semibold text-sm hover:bg-[#163e6f] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Guardar
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => !isDeleting && setConfirmDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-[0_16px_48px_rgba(0,0,0,0.15)]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-[#ffdad6] flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-6 h-6 text-[#ba1a1a]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#00366b]">Confirmar eliminación</h3>
                  <p className="text-sm text-[#737781]">
                    {confirmDelete.type === 'topic' ? 'Módulo y su contenido' : confirmDelete.type === 'content' ? 'Sección de contenido' : 'Pregunta de quiz'}
                  </p>
                </div>
              </div>
              <p className="text-sm text-[#424750] mb-6 bg-[#f3f4f5] rounded-xl p-3 line-clamp-3">
                "{confirmDelete.label.substring(0, 120)}{confirmDelete.label.length > 120 ? '...' : ''}"
              </p>
              <p className="text-sm text-[#ba1a1a] font-semibold mb-6">
                Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 py-3 rounded-xl border-2 border-[#e1e3e4] text-[#424750] font-semibold text-sm hover:bg-[#f3f4f5] transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDeleteAction}
                  disabled={isDeleting}
                  className="flex-1 py-3 rounded-xl bg-[#ba1a1a] text-[#ffffff] font-semibold text-sm hover:bg-[#93000a] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Eliminar
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Markdown full-screen preview + editor */}
      <AnimatePresence>
        {previewChunkId && (() => {
          const chunk = draftContent.find(c => c.cod === previewChunkId);
          if (!chunk) return null;
          return (
            <motion.div
              key="md-preview"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[150] bg-white flex flex-col safe-area-top safe-area-bottom"
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e1e3e4] bg-white sticky top-0 z-10">
                <button
                  onClick={() => setPreviewChunkId(null)}
                  className="p-2 rounded-xl bg-[#f3f4f5] hover:bg-[#e7e8e9] transition-colors active:scale-95 flex-shrink-0"
                >
                  <ChevronLeft className="w-5 h-5 text-[#424750]" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#737781]">{chunk.contexto}</p>
                  <p className="font-bold text-[#00366b] text-sm truncate">{chunk.tema}</p>
                </div>
                {/* Imprimir PDF */}
                <button
                  onClick={() => handlePrintPdf(chunk)}
                  title="Imprimir / Guardar como PDF"
                  className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-[#f3f4f5] hover:bg-[#e7e8e9] text-[#1b4d89] transition-all active:scale-95 flex-shrink-0"
                >
                  <Printer className="w-3 h-3" /> PDF
                </button>
                {/* Mode toggle */}
                <div className="flex bg-[#f3f4f5] rounded-xl p-1 gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => switchPreviewMode('preview')}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${previewMode === 'preview' ? 'bg-white shadow-sm text-[#1b4d89]' : 'text-[#737781] hover:text-[#424750]'}`}
                  >
                    <Eye className="w-3 h-3" /> Ver
                  </button>
                  <button
                    onClick={() => switchPreviewMode('edit')}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${previewMode === 'edit' ? 'bg-white shadow-sm text-[#1b4d89]' : 'text-[#737781] hover:text-[#424750]'}`}
                  >
                    <Edit3 className="w-3 h-3" /> Editar
                  </button>
                  <button
                    onClick={() => switchPreviewMode('blocks')}
                    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${previewMode === 'blocks' ? 'bg-white shadow-sm text-red-600' : 'text-[#737781] hover:text-[#424750]'}`}
                  >
                    <Trash2 className="w-3 h-3" /> Bloques
                  </button>
                </div>
              </div>

              {/* Content area — fixed height via absolute panels to prevent resize on tab switch */}
              <div className="flex-1 relative overflow-hidden">
                {/* Ver (preview) panel */}
                <div
                  ref={mdPreviewScrollRef}
                  className={`absolute inset-0 overflow-y-auto px-5 py-6 bg-white${previewMode === 'preview' ? '' : ' hidden'}`}
                >
                  {previewLocalContent ? (
                    <div className="rich-content-light prose prose-sm max-w-none">
                      <RichContent content={previewLocalContent} className="rich-content-light" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-40 text-[#737781] text-sm">
                      Sin contenido aún
                    </div>
                  )}
                </div>

                {/* Editar panel */}
                <textarea
                  ref={mdEditScrollRef}
                  value={previewLocalContent}
                  onChange={e => {
                    setPreviewLocalContent(e.target.value);
                    setPreviewDirty(true);
                    handleUpdateContent(previewChunkId, { contenido: e.target.value });
                  }}
                  className={`absolute inset-0 p-5 text-sm text-[#1e293b] font-mono resize-none focus:outline-none border-0 overflow-y-auto${previewMode === 'edit' ? '' : ' hidden'}`}
                  placeholder="Escribe el contenido en Markdown o HTML (ambos se renderizan). Ejemplo: ## Título o <img src='...' />"
                />

                {/* Bloques panel */}
                <div className={`absolute inset-0 overflow-y-auto px-4 py-4 bg-[#fafafa]${previewMode === 'blocks' ? '' : ' hidden'}`}>
                  {(() => {
                    const blocks = splitIntoBlocks(previewLocalContent);
                    if (blocks.length === 0) {
                      return (
                        <div className="flex items-center justify-center h-40 text-[#737781] text-sm text-center px-8">
                          Sin bloques. Separa secciones con{' '}
                          <code className="mx-1 px-1 bg-[#f0f1f2] rounded text-xs">---</code>
                          {' '}o usa encabezados (##).
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-4">
                        {blocks.map((block, i) => (
                          <div key={i} className="bg-white rounded-2xl border border-[#e1e3e4] overflow-hidden shadow-sm">
                            <div className="px-4 py-2 border-b border-[#f0f1f2] flex items-center justify-between bg-[#f8f9fa]">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-[#737781]">Bloque {i + 1}</span>
                              <button
                                onClick={() => {
                                  if (window.confirm(`¿Eliminar bloque ${i + 1}? Esta acción no se puede deshacer.`)) deleteBlock(i);
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 active:scale-95 transition-all"
                              >
                                <Trash2 className="w-3 h-3" /> Eliminar
                              </button>
                            </div>
                            <div className="px-4 py-3">
                              <RichContent content={block} className="rich-content-light" />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Footer save */}
              <div className="px-4 py-4 border-t border-[#e1e3e4] bg-white">
                <button
                  onClick={handlePreviewSave}
                  disabled={previewSaving || !previewDirty}
                  className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    previewDirty
                      ? 'bg-gradient-to-r from-[#00366b] to-[#1b4d89] text-white shadow-lg shadow-[#1b4d89]/20'
                      : 'bg-[#f3f4f5] text-[#c3c6d1] cursor-not-allowed'
                  }`}
                >
                  {previewSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {previewSaving ? 'Guardando...' : previewDirty ? 'Guardar en Sheets' : 'Sin cambios'}
                </button>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Módulo de verificación del sistema */}
      <DiagnosticoPanel open={showDiagnostico} onClose={() => setShowDiagnostico(false)} />

      {/* Floating Sheets shortcut */}
      <a
        href="https://docs.google.com/spreadsheets/d/1tKXR0sRb3jZYFrQ8WUVjB3hhIpx1_qbQYfAjJIPPgTA/edit?usp=sharing"
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir Google Sheets"
        className="fixed bottom-6 right-6 z-[150] flex items-center justify-center w-12 h-12 rounded-full bg-[#1b4d89] text-white shadow-lg shadow-[#1b4d89]/40 hover:bg-[#163d70] hover:scale-110 active:scale-95 transition-all"
      >
        <FileSpreadsheet className="w-5 h-5" />
      </a>

      {/* Floating toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className={`fixed bottom-28 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold whitespace-nowrap ${
              toast.type === 'success'
                ? 'bg-[#006d36] text-white shadow-[#006d36]/30'
                : 'bg-[#ba1a1a] text-white shadow-[#ba1a1a]/30'
            }`}
          >
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
