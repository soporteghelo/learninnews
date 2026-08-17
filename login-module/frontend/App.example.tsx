import { useEffect, useState } from 'react';
import LoginScreen from './LoginScreen';
import HomeScreen from './HomeScreen';
import { fetchUserByDni, registerOrUpdateUser } from './api';
import { getStorageKey, APP_CONFIG } from './config';
import type { UserSession } from './types';

/**
 * Ejemplo mínimo de integración: login por DNI -> pantalla de inicio.
 * Copia el patrón (no necesariamente este archivo tal cual) dentro del punto
 * de entrada de tu propia app.
 */
export default function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // Restaura sesión guardada al recargar la página.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(getStorageKey(APP_CONFIG.storage.keys.session));
      if (saved) setSession(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const handleLogin = async (dni: string, apellidos: string, nombres: string) => {
    setIsRegistering(true);
    try {
      // Si ya existe en la hoja, se respeta el nombre guardado allí.
      const existing = await fetchUserByDni(dni);
      const finalApellidos = existing?.apellidos || apellidos;
      const finalNombres = existing?.nombres || nombres;

      await registerOrUpdateUser({ dni, apellidos: finalApellidos, nombres: finalNombres });

      const newSession: UserSession = {
        dni,
        apellidos: finalApellidos,
        nombres: finalNombres,
        inicio: new Date().toISOString(),
      };
      setSession(newSession);
      localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(newSession));
    } finally {
      setIsRegistering(false);
    }
  };

  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem(getStorageKey(APP_CONFIG.storage.keys.session));
  };

  if (!session) {
    return <LoginScreen onLogin={handleLogin} isRegistering={isRegistering} />;
  }

  return <HomeScreen session={session} onLogout={handleLogout} />;
}
