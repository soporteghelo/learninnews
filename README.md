# LearnDrive AI v2.5 🚀 | Professional Learning Platform

**LearnDrive AI** es una solución integral de aprendizaje corporativo *mobile-first* diseñada para entornos industriales y operativos. Combina la potencia de **React 19** con la flexibilidad de **Google Sheets como base de datos viva**, permitiendo una gestión de capacitación ágil, escalable y asistida por Inteligencia Artificial.

---

## 🌟 Características Principales

### 1. 🎓 Experiencia del Estudiante (User Side)
*   **Modo Aprendizaje Guiado**: Navegación segmentada por "chunks" para facilitar la retención.
*   **🎙️ TTS (Text-to-Speech) Nativo**: Lectura automática por voz con controles de velocidad, ideal para manos libres en campo.
*   **🎦 Centro Multimedia**: Integración fluida de vídeos de Google Drive y visor de documentos PDF.
*   **📝 Evaluaciones Dinámicas**: Quizzes interactivos al final de cada tema con feedback correctivo inmediato y explicaciones detalladas.
*   **📊 Seguimiento de Progreso**: Registro automático de avances, notas de exámenes y tiempos de estudio directamente en la nube.
*   **🌓 Adaptabilidad Visual**: Soporte completo para Modo Oscuro y Claro con estética premium.

### 2. ⚡ Panel de Control Administrativo (Admin Panel)
*   **Gestión Centralizada**: Editor completo (CRUD) de Cursos, Módulos y Preguntas.
*   **🎨 UI Moderna**: Selector de módulos animado con `Framer Motion` y diseño de alta densidad de información.
*   **🔐 Persistencia de Sesión**: Sistema de navegación inteligente que mantiene el login del administrador activo durante la gestión.
*   **📥 Exportación de Datos**: Botón de exportación masiva a CSV para reportes externos.

### 3. ✨ Generador de Prompts PDF (Novedad v2.5)
*   **OCR Integrado**: Extracción automática de texto desde archivos PDF alojados en Google Drive mediante Google Apps Script.
*   **Automatización de IA**: Generación instantánea de prompts estructurados para modelos de lenguaje (GPT/Gemini).
*   **Flujo de Trabajo**: Extrae el contenido teórico -> Genera el prompt para 20 preguntas -> Lo copia al portapapeles con un solo clic.

---

## 🛠️ Stack Tecnológico

| Componente | Tecnología |
|---|---|
| **Frontend** | React 19 + Vite |
| **Estilos** | **Tailwind CSS 4** (Ultra-fast engine) |
| **Animaciones** | Framer Motion |
| **Iconografía** | Lucide React |
| **Base de Datos** | Google Sheets (vía CSV Proxy) |
| **Lógica Backend** | **Google Apps Script** (Proxy REST API) |
| **Servicios Cloud**| Google Drive API (OCR & Multimedia) |

---

## 🚀 Guía de Instalación

### Requisitos Previos
*   Node.js v18 o superior.
*   Un proyecto de Google Apps Script desplegado como Aplicación Web.

### Configuración del Entorno
1.  Clonar el repositorio e instalar dependencias:
    ```bash
    npm install
    ```
2.  Crear un archivo `.env` en la raíz con lo siguiente:
    ```env
    VITE_APPS_SCRIPT_URL=TU_URL_DE_APPS_SCRIPT
    VITE_SHEET_ID=ID_DE_TU_GOOGLE_SHEET
    ```

### Configuración de Google Apps Script (Crucial para OCR)
Para habilitar la extracción de texto de PDFs dentro del Admin Panel:
1.  En el editor de Apps Script, ve a **Servicios (+)**.
2.  Añade **"Drive API"** (versión v2).
3.  Ejecuta una vez la función `extractPdfText` manualmente para autorizar permisos.
4.  Despliega como **"Nueva Implementación"**.

---

## 📱 Diseño y Estética
La plataforma utiliza una arquitectura **Mobile-First**, priorizando la usabilidad en smartphones (360px+). 
*   **Aesthetics**: Glassmorphism, gradientes suaves y micro-interacciones.
*   **Accesibilidad**: Tipografía optimizada (Outfit/Inter) y contrastes adaptativos según el modo de luz.

---

**LearnDrive AI v2.5** - *Innovación en capacitación industrial.*
