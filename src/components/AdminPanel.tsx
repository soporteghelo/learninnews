import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import RichContent from './RichContent';
import * as XLSX from 'xlsx';
import {
  ChevronLeft, ChevronRight, Save, Trash2, Edit3,
  Plus, Copy, Search, BookOpen, HelpCircle,
  CheckCircle2, Loader2, Lock, Eye, EyeOff, RefreshCw,
  Wifi, WifiOff, ChevronDown, ChevronUp,
  FileText, Settings, Video, Link2, MessageSquare, Undo2,
  Wand2, Filter, FileSpreadsheet, LogOut, Printer, Users, TrendingUp
} from 'lucide-react';
import { ADMIN_CONFIG, AUDIENCE_CONFIG } from '../config/app.config';
import {
  saveQuizToSheets, deleteQuizFromSheets,
  saveContentToSheets, deleteContentFromSheets,
  saveTopicToSheets, deleteTopicFromSheets,
  testSheetsConnection, testAppsScriptConnection,
  clearSheetCache, fetchAllIngresos,
} from '../services/sheetsService';
import type { IngresoRecord } from '../services/sheetsService';
import type {
  LearnTopic, DataChunk, QuizQuestion, QuizDraft,
  ContentDraft, TopicDraft, AdminTab, ConnectionTestResult, UserProgress
} from '../types';

const ADMIN_AUTH_KEY = 'learndrive_admin_auth';

interface AdminPanelProps {
  topics: LearnTopic[];
  allChunks: DataChunk[];
  allQuizQuestions: QuizQuestion[];
  onBack: () => void;
  onRefreshData: () => Promise<void> | void;
  adminPass?: string;
}

export default function AdminPanel({
  topics,
  allChunks,
  allQuizQuestions,
  onBack,
  onRefreshData,
  adminPass,
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
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressSearch, setProgressSearch] = useState('');
  const [progressEmpresaFilter, setProgressEmpresaFilter] = useState('');
  const [progressPublicoFilter, setProgressPublicoFilter] = useState('');
  const [progressExpandedDni, setProgressExpandedDni] = useState<string | null>(null);

  // Toast notification
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load ingreso records when progress tab opens
  useEffect(() => {
    if (activeTab !== 'progress') return;
    if (ingresoRecords.length > 0) return;
    setProgressLoading(true);
    fetchAllIngresos().then(records => {
      setIngresoRecords(records);
      setProgressLoading(false);
    }).catch(() => setProgressLoading(false));
  }, [activeTab]);

  const handleRefreshProgress = () => {
    setProgressLoading(true);
    setIngresoRecords([]);
    fetchAllIngresos().then(records => {
      setIngresoRecords(records);
      setProgressLoading(false);
    }).catch(() => setProgressLoading(false));
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

  // ========== MAIN PANEL ==========
  return (
    <div className="min-h-screen bg-[#f8f9fa] safe-area-top safe-area-bottom pb-24">
      {/* Header */}
      <header className="w-full top-0 sticky bg-white border-b border-[#e1e3e4] z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 rounded-xl bg-[#f3f4f5] hover:bg-[#e7e8e9] transition-colors active:scale-95 duration-150">
              <ChevronLeft className="w-5 h-5 text-[#424750]" />
            </button>
            <div className="flex items-center gap-3">
              <Settings className="w-7 h-7 text-[#1b4d89]" />
              <h1 className="text-xl font-bold tracking-tight text-[#00366b]">Admin Control Center</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleTestConnection} disabled={isTesting} className="p-2.5 rounded-xl hover:bg-[#f3f4f5] transition-colors" title="Test conexión">
              {isTesting ? <Loader2 className="w-5 h-5 animate-spin text-[#1b4d89]" /> : <Wifi className="w-5 h-5 text-[#424750]" />}
            </button>
            <button onClick={onRefreshData} className="p-2.5 rounded-xl hover:bg-[#f3f4f5] transition-colors" title="Refrescar datos">
              <RefreshCw className="w-5 h-5 text-[#424750]" />
            </button>
            <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-[#ba1a1a] hover:bg-[#ffdad6]/40 transition-colors" title="Cerrar sesión admin">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 pt-3 pb-8">
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

        {/* Tab bar */}
        <div className="mb-6 grid grid-cols-5 gap-1">
          {([
            { key: 'topics', label: 'Detalles', badge: null },
            { key: 'overview', label: 'Resumen', badge: null },
            { key: 'content', label: 'Contenido', badge: selectedTopicId ? activeContentCount : null },
            { key: 'quiz', label: 'Quizzes', badge: selectedTopicId ? activeQuizCount : null },
            { key: 'progress', label: 'Usuarios', badge: ingresoRecords.length > 0 ? ingresoRecords.length : null },
          ] as { key: AdminTab; label: string; badge: number | null }[]).map(tab => (
            <button
              key={tab.key}
              disabled={tab.key !== 'topics' && tab.key !== 'progress' && !selectedTopicId}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center justify-center gap-1 px-1 py-1.5 text-[10px] xs:text-[11px] font-bold rounded-xl transition-all border ${
                activeTab === tab.key
                  ? 'bg-[#1b4d89] text-white border-[#1b4d89] shadow-sm'
                  : (tab.key !== 'topics' && tab.key !== 'progress' && !selectedTopicId)
                  ? 'bg-[#f8f9fa]/50 text-[#c3c6d1] border-[#e1e3e4]/60 cursor-not-allowed opacity-60'
                  : 'bg-white text-[#737781] border-[#e1e3e4] hover:bg-[#f3f4f5] hover:border-[#1b4d89]/30 hover:text-[#00366b]'
              }`}
            >
              <span className="truncate">{tab.label}</span>
              {tab.badge !== null && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md min-w-[15px] text-center leading-none ${
                  activeTab === tab.key ? 'bg-white/25 text-white' : 'bg-[#e1e3e4] text-[#424750]'
                }`}>{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

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

        {selectedTopicId && activeTab !== 'topics' && activeTab !== 'progress' && (
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

        {!selectedTopicId && activeTab !== 'progress' && (
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
                ) : (
                  <div className="space-y-2">
                    {filteredIngresos
                      .slice()
                      .sort((a, b) => {
                        // Parse "DD/MM/YYYY - (HH:MM:SS)" → timestamp
                        const parse = (s: string) => {
                          const m = s?.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*\((\d{2}):(\d{2}):(\d{2})\)/);
                          return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`).getTime() : 0;
                        };
                        return parse(b.inicio) - parse(a.inicio);
                      })
                      .map(record => {
                        const userProgress = parseUserProgress(record.progressJson);
                        const isExpanded = progressExpandedDni === record.dni;
                        const avanceNum = parseFloat(record.avance?.replace('%', '') || '0') || 0;
                        const userScores = userProgress.filter(p => p.quizScore !== undefined).map(p => p.quizScore!);
                        const avgUserNotaPct = userScores.length > 0 ? Math.round(userScores.reduce((a, b) => a + b, 0) / userScores.length / 20 * 100) : null;
                        const startedTopics = userProgress.filter(p => p.currentChunk > 0 || p.completed);

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
                                  <div className="text-xs font-bold text-amber-600">{avgUserNotaPct !== null ? `${avgUserNotaPct}%` : '—'}</div>
                                  <div className="text-[9px] text-[#737781] uppercase">nota</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-xs font-bold text-slate-500">{startedTopics.length}</div>
                                  <div className="text-[9px] text-[#737781] uppercase">módulos</div>
                                </div>
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-[#737781]" /> : <ChevronDown className="w-4 h-4 text-[#737781]" />}
                              </div>
                            </button>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <div className="border-t border-[#f3f4f5] px-4 py-4 bg-[#f8f9fa] space-y-4">
                                {/* Profile info */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {[
                                    { label: 'Área', value: record.area || '—' },
                                    { label: 'Cargo', value: record.cargo || '—' },
                                    { label: 'Correo', value: record.correo || '—' },
                                    { label: 'Último acceso', value: record.ultimoAcceso ? new Date(record.ultimoAcceso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
                                  ].map(({ label, value }) => (
                                    <div key={label}>
                                      <p className="text-[9px] text-[#737781] uppercase font-bold tracking-wide">{label}</p>
                                      <p className="text-xs text-[#424750] font-semibold truncate">{value}</p>
                                    </div>
                                  ))}
                                </div>

                                {/* Per-topic progress */}
                                <div>
                                  <p className="text-[9px] font-bold text-[#737781] uppercase tracking-wider mb-2">Avance por módulo</p>
                                  {topics.length === 0 ? (
                                    <p className="text-xs text-[#737781]">—</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {topics.map(topic => {
                                        const tp = userProgress.find(p => p.topicId === topic.id);
                                        if (!tp) return null;
                                        const totalChunks = allChunks.filter(c => c.idMain === topic.id).length;
                                        const pct = tp.completed ? 100 : Math.min(100, Math.round(((tp.currentChunk || 0) / Math.max(totalChunks, 1)) * 100));
                                        const score = tp.quizScore;
                                        return (
                                          <div key={topic.id} className="flex items-center gap-3">
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center justify-between gap-2 mb-1">
                                                <p className="text-xs font-semibold text-[#191c1d] truncate">{topic.title}</p>
                                                <span className="text-[10px] font-bold text-[#424750] flex-shrink-0">{pct}%</span>
                                              </div>
                                              <div className="h-1.5 bg-[#e1e3e4] rounded-full overflow-hidden">
                                                <div
                                                  className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-[#1b4d89]'}`}
                                                  style={{ width: `${pct}%` }}
                                                />
                                              </div>
                                            </div>
                                            {score !== undefined && (
                                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${score >= 14 ? 'bg-emerald-100 text-emerald-700' : score >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                                                {Math.round((score / 20) * 100)}%
                                              </span>
                                            )}
                                            {tp.completed && score === undefined && (
                                              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                            )}
                                          </div>
                                        );
                                      })}
                                      {userProgress.every(p => !topics.find(t => t.id === p.topicId)) && (
                                        <p className="text-xs text-[#737781] italic">Sin avance registrado en módulos activos</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
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

      {/* Floating Sheets shortcut */}
      <a
        href="https://docs.google.com/spreadsheets/d/1fXcrk-6YSA5NcgDbCBinu4WaPpyJMRK0og6miVE8ZZw/edit?usp=sharing"
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
