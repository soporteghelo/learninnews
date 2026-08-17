# Módulo de login (extraído de LearnDrive AI)

Boilerplate autocontenido con la misma metodología de login que usa esta app
(identificación por DNI contra una Google Sheet, vía un Web App de Apps
Script) más una pantalla de inicio que se muestra al ingresar. Pensado para
copiarse dentro de otro proyecto nuevo — **no está conectado a la app actual**
ni se importa desde `src/`.

## Cómo funciona el login

1. El usuario escribe su **DNI** (8 dígitos). Si el DNI ya se usó antes en
   este navegador o ya existe en la hoja, sus **Apellidos/Nombres** se
   autocompletan y quedan bloqueados (no editables) — evita que alguien
   suplante a otro con datos distintos.
2. Al enviar el formulario (`LoginScreen.tsx`), el frontend:
   - Busca el DNI en la hoja `USUARIOS` vía Apps Script (`getUserByDni`,
     acotado con `TextFinder` a la columna DNI — no descarga toda la hoja).
   - Crea o actualiza ese registro (`registerUser`): si es nuevo, fija
     `FechaRegistro`; si ya existía, solo actualiza `UltimoAcceso` y
     `Dispositivo`, preservando la fecha de registro original.
   - Guarda la sesión en `localStorage` y navega a la **pantalla de inicio**
     (`HomeScreen.tsx`).
3. El autocompletado de usuarios conocidos (`fetchKnownUsers` en `api.ts`) lee
   el CSV público de la hoja (gviz) en vez de pasar por Apps Script — es
   opcional; si no compartes la hoja como pública, el login sigue
   funcionando, solo sin ese autocompletado remoto (el de `localStorage`
   sigue activo).

## Contenido de la carpeta

```
login-module/
  apps-script/
    Code.gs           # Backend: doPost, getUserByDni, registerUser, helpers
  frontend/
    config.ts          # URLs, IDs y storage keys (ajustar por proyecto)
    types.ts            # UserRecord, UserSession
    api.ts               # postToAppsScript, fetchUserByDni, registerOrUpdateUser, fetchKnownUsers
    LoginScreen.tsx       # Pantalla de login (DNI + Apellidos/Nombres)
    HomeScreen.tsx         # Pantalla de inicio mostrada tras un login exitoso
    App.example.tsx         # Ejemplo mínimo de integración de los 3 anteriores
```

## Puesta en marcha en el proyecto nuevo

1. **Google Sheet**: crea una hoja nueva (o reutiliza una), copia su ID desde
   la URL (`.../d/<ID>/edit`).
2. **Apps Script**: en esa hoja, Extensiones → Apps Script → pega
   `apps-script/Code.gs` → reemplaza `SPREADSHEET_ID` con el ID del paso 1 →
   ejecuta `CrearHojaUsuarios` una vez (crea la hoja `USUARIOS` con sus
   columnas) → Implementar → Nueva implementación → tipo "Aplicación web",
   acceso "Cualquiera" → copia la URL resultante.
3. **(Opcional)** comparte la hoja como "Cualquiera con el enlace — Lector"
   si vas a usar `fetchKnownUsers`.
4. **Frontend**: copia `frontend/*` dentro de tu proyecto (por ejemplo
   `src/login/`). En el `.env` de ese proyecto define:
   ```
   VITE_APPS_SCRIPT_URL=<URL del Web App del paso 2>
   VITE_SHEET_ID=<ID de la hoja del paso 1>
   ```
5. Dependencias npm que usa este boilerplate (las mismas que ya usa
   LearnDrive AI para su login): `react`, `framer-motion`, `lucide-react`,
   `papaparse` (+ `@types/papaparse`), y Tailwind CSS configurado en el
   proyecto (las clases usadas en `LoginScreen.tsx`/`HomeScreen.tsx` asumen
   Tailwind).
6. Usa `App.example.tsx` como referencia de integración: no lo importes tal
   cual, adapta ese patrón (login → guardar sesión → pantalla de inicio → el
   resto de tu app) a la raíz de tu propia aplicación.

## Diferencias a propósito respecto al login de esta app

Esta versión es una extracción **mínima**: solo cubre identificación por DNI
+ registro/actualización en la hoja + pantalla de inicio. Deliberadamente
**no** incluye lo que en LearnDrive AI es lógica de negocio propia de esta
app (no de "login" en sí): formulario de perfil extendido (empresa/área/
cargo/contactos de emergencia), firma+selfie de consentimiento, selección de
audiencia, ni progreso de cursos. Si tu app nueva necesita algo de eso,
resuelve esos pasos como pantallas posteriores a `HomeScreen`, no dentro del
login.
