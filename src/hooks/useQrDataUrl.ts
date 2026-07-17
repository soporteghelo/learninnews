import { useEffect, useState } from 'react';
import { generateQrDataUrl, type QrOptions } from '../lib/qrCode';

/**
 * Hook que genera (de forma asíncrona) el QR de `value` como data URL PNG.
 * Se regenera cuando cambia el valor o el tamaño. Devuelve '' mientras carga o si no hay valor.
 *
 * Uso: mostrar el QR del enlace de Drive del documento en el panel admin y en el acta.
 */
export function useQrDataUrl(value: string | null | undefined, opts: QrOptions = {}): string {
  const [dataUrl, setDataUrl] = useState('');
  const { size, margin, dark, light } = opts;

  useEffect(() => {
    let active = true;
    if (!value || !String(value).trim()) {
      setDataUrl('');
      return;
    }
    generateQrDataUrl(value, { size, margin, dark, light }).then((url) => {
      if (active) setDataUrl(url);
    });
    return () => { active = false; };
  }, [value, size, margin, dark, light]);

  return dataUrl;
}
