import {
  Award, BarChart3, BookOpen, CheckCircle2, ClipboardList, FileSignature,
  HelpCircle, IdCard, PenLine, Play, Route, Timer,
} from 'lucide-react';
import type { TourStep } from '../components/GuidedTour';

export interface TourContext {
  nombres?: string;
  /** CONFIG trae un video tutorial (columna Tutorial) */
  tieneTutorial: boolean;
  /** El trabajador tiene al menos un curso asignado a su perfil */
  tieneCursos: boolean;
  /** Ese primer curso tiene banco de preguntas */
  tieneQuiz: boolean;
  /** El módulo de actas está habilitado y tiene documentos asignados */
  tieneActas: boolean;
  /** Le quedan documentos por firmar (existe el botón "Firmar") */
  tieneActasPendientes: boolean;
}

/**
 * Recorrido guiado del trabajador: entra de verdad a cada módulo de la app
 * (inicio → ficha del curso → lección → evaluación → actas) resaltando los
 * elementos reales de cada pantalla.
 *
 * Orden fijado con el área usuaria:
 *  1. Empieza por el botón del video tutorial (llenado del file de Anexo 05).
 *  2. Recorre los módulos enseñando cómo se maneja cada uno.
 *  3. Termina siempre en Actas y documentos.
 *
 * Los pasos se arman según lo que este trabajador realmente tiene (`TourContext`),
 * así que nunca se anuncia una pantalla a la que no puede entrar.
 */
export function buildUserTourSteps(ctx: TourContext): TourStep[] {
  const primerNombre = (ctx.nombres || '').trim().split(/\s+/)[0] || '';
  const saludo = primerNombre ? `Hola ${primerNombre}. ` : '';
  const steps: TourStep[] = [];

  // ── 1. Inicio: el video tutorial es lo primero ──────────────────────────
  if (ctx.tieneTutorial) {
    steps.push({
      id: 'tutorial',
      stage: 'dashboard',
      target: '[data-tour="tutorial"]',
      icon: Play,
      accent: 'blue',
      title: 'Video tutorial',
      body: `${saludo}Empecemos por aquí: este botón reproduce el video tutorial de cómo llenar tu file de Anexo 05. Está siempre disponible y puedes verlo las veces que necesites.`,
    });
  } else {
    steps.push({
      id: 'bienvenida',
      stage: 'dashboard',
      icon: Route,
      accent: 'blue',
      title: primerNombre ? `¡Bienvenido, ${primerNombre}!` : '¡Bienvenido!',
      body: 'Te mostramos la app por dentro: entraremos a cada sección para que veas cómo se usa. Avanza tocando "Siguiente".',
    });
  }

  steps.push({
    id: 'perfil',
    stage: 'dashboard',
    target: '[data-tour="perfil"]',
    icon: IdCard,
    accent: 'blue',
    title: 'Tu perfil de trabajo',
    body: 'Estas etiquetas son los perfiles que elegiste al registrarte (Obrero, Conductor, Empleado…). De ellos depende qué cursos te aparecen. Si necesitas cambiarlos, solicítalo al área de SSMA.',
  });

  steps.push({
    id: 'stats',
    stage: 'dashboard',
    target: '[data-tour="stats"]',
    icon: BarChart3,
    accent: 'violet',
    title: 'Tu avance en números',
    body: 'Cursos asignados, cuántos aprobaste y tu porcentaje de avance. Se actualiza solo cada vez que terminas una evaluación.',
  });

  if (!ctx.tieneCursos) {
    // Sin cursos asignados no hay ficha ni lección que mostrar.
    steps.push({
      id: 'sin-cursos',
      stage: 'dashboard',
      icon: BookOpen,
      accent: 'amber',
      title: 'Aún no tienes cursos',
      body: 'Cuando SSMA programe capacitaciones para tu perfil aparecerán aquí. Cada curso tiene una lección para estudiar y una evaluación calificada sobre 20.',
    });
  } else {
    steps.push({
      id: 'cursos',
      stage: 'dashboard',
      target: '[data-tour="cursos"]',
      icon: BookOpen,
      accent: 'blue',
      title: 'Tus cursos programados',
      body: 'Cada tarjeta es un curso: muestra cuántas lecciones y preguntas tiene, tu nota y una barra azul con lo que llevas leído. Se entra tocándola — vamos a entrar juntos al primero.',
    });

    // ── 2. Módulo: ficha del curso ────────────────────────────────────────
    steps.push({
      id: 'detalle-resumen',
      stage: 'courseDetail',
      target: '[data-tour="detalle-resumen"]',
      icon: ClipboardList,
      accent: 'blue',
      title: 'Ya estás dentro del curso',
      body: 'Esta es la ficha del curso: arriba su nombre y aquí el resumen con los puntos clave. Léelo antes de empezar; te dice de qué trata la capacitación.',
    });

    steps.push({
      id: 'detalle-acciones',
      stage: 'courseDetail',
      target: '[data-tour="detalle-acciones"]',
      icon: Route,
      accent: 'emerald',
      demo: 'flow',
      title: 'Los dos botones del curso',
      body: 'Desde aquí se hace todo el curso, siempre en este orden:',
      bullets: [
        'IR A LECCIÓN: estudias el contenido',
        'EVALUACIÓN: rindes las preguntas calificadas',
        'Al aprobar generas tu certificado',
      ],
    });

    // ── 3. Módulo: lección ────────────────────────────────────────────────
    steps.push({
      id: 'leccion',
      stage: 'learning',
      dim: 0.62,
      icon: BookOpen,
      accent: 'blue',
      title: 'Así se ve una lección',
      body: 'Entramos a la lección del curso. El contenido está dividido en temas cortos, uno por pantalla.',
      bullets: [
        'Toca el video para verlo a pantalla completa',
        'ABRIR PDF TÉCNICO muestra el documento del tema',
        'LEER RESUMEN cambia el video por el texto',
        'Tu avance se guarda solo: puedes salir y seguir después',
      ],
    });

    steps.push({
      id: 'leccion-nav',
      stage: 'learning',
      target: '[data-tour="leccion-nav"]',
      icon: Route,
      accent: 'blue',
      title: 'Cómo avanzar en la lección',
      body: 'Con estos botones pasas de un tema al siguiente y puedes regresar. En el último tema el botón cambia a FINALIZAR MÓDULO: te muestra un repaso y te lleva a la evaluación.',
    });

    // ── 4. Módulo: evaluación ─────────────────────────────────────────────
    steps.push({
      id: 'evaluacion',
      stage: 'courseDetail',
      target: '[data-tour="detalle-evaluacion"]',
      icon: Timer,
      accent: 'emerald',
      title: 'Cómo rendir tu evaluación',
      body: 'Volvimos a la ficha. Este botón abre la evaluación calificada. Antes de tocarlo, ten en cuenta:',
      bullets: [
        'Tienes 30 segundos por pregunta; si se agotan, cuenta como errada',
        'Marca una alternativa y toca Confirmar',
        'Verás al instante si acertaste, con la explicación',
        'La cámara verifica que estés atento: a las 5 distracciones se reinicia',
        'Si se corta el internet, tu avance se guarda y puedes retomarlo',
      ],
    });

    steps.push({
      id: 'practica',
      stage: 'courseDetail',
      dim: 0.9,
      demo: 'quiz',
      icon: HelpCircle,
      accent: 'amber',
      title: 'Practiquemos',
      body: 'Así se ve y así se responde una pregunta. Toca la alternativa que creas correcta para continuar.',
    });

    steps.push({
      id: 'nota',
      stage: 'courseDetail',
      target: ctx.tieneQuiz ? '[data-tour="detalle-nota"]' : undefined,
      demo: 'score',
      icon: Award,
      accent: 'amber',
      title: 'Tu nota y tu certificado',
      body: 'Cada evaluación se califica sobre 20 y tu nota queda aquí. Con 16 o más apruebas: en la tarjeta del curso aparece el botón Generar Certificado y luego podrás abrirlo en Drive o enviarlo por WhatsApp.',
    });
  }

  // ── 5. Último módulo: actas y documentos ────────────────────────────────
  if (ctx.tieneActas) {
    steps.push({
      id: 'actas-intro',
      stage: 'actas',
      dim: 0.62,
      icon: FileSignature,
      accent: 'amber',
      title: 'Actas y documentos',
      body: 'Terminamos en la sección de Actas y documentos, a la que entras desde la tarjeta "Actas y Compromisos" de la pantalla de inicio. Aquí llega todo lo que debes revisar y firmar.',
    });

    steps.push({
      id: 'actas-lista',
      stage: 'actas',
      target: '[data-tour="actas-lista"]',
      icon: ClipboardList,
      accent: 'amber',
      title: 'Tus documentos',
      body: 'Arriba los pendientes y abajo los ya firmados. Toca cualquiera para abrirlo y leerlo antes de firmar; los que dicen "físico" se te entregan impresos.',
    });

    if (ctx.tieneActasPendientes) {
      steps.push({
        id: 'actas-firmar',
        stage: 'actas',
        target: '[data-tour="actas-firmar"]',
        icon: PenLine,
        accent: 'amber',
        title: 'Firmar tus documentos',
        body: 'Con este botón firmas el acta: dibujas tu firma con el dedo en la pantalla y queda registrada. Después puedes descargar el acta firmada desde esta misma pantalla.',
      });
    }
  }

  steps.push({
    id: 'fin',
    stage: ctx.tieneActas ? 'actas' : 'dashboard',
    dim: 0.86,
    icon: CheckCircle2,
    accent: 'emerald',
    title: '¡Listo para empezar!',
    body: ctx.tieneActas
      ? 'Eso es todo. Te dejamos en el inicio para que empieces por tu primer curso y revises tus documentos pendientes. Si algo no te queda claro, vuelve al video tutorial o consulta a tu supervisor SSMA.'
      : 'Eso es todo. Empieza por tu primer curso. Si algo no te queda claro, vuelve al video tutorial o consulta a tu supervisor SSMA.',
  });

  return steps;
}
