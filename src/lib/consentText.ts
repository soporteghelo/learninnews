/**
 * Texto legal de la autorización de firma digital mostrada en el onboarding
 * (una sola vez, luego de ProfileForm) y reutilizado en el PDF de constancia.
 * Centralizado aquí para que la pantalla (ConsentSigning) y la plantilla del
 * certificado (ConsentTemplate) no dupliquen el mismo párrafo legal.
 */

export const CONSENT_TITULO = 'Autorización de Uso de Firma Digital y Datos Biométricos';

export const CONSENT_PARRAFOS: string[] = [
  'Autorizo de manera libre, expresa e informada a que esta plataforma capture y utilice mi firma digital (dibujada en pantalla) y una fotografía de verificación facial (selfie), con el fin de validar mi identidad en los procesos de capacitación, evaluación, emisión de certificados y firma de actas de recepción de documentos.',
  'Esta autorización tiene carácter permanente y rige para todos los usos posteriores de mi firma digital y mi fotografía dentro de la aplicación —incluyendo la firma de futuras actas, compromisos y la generación de certificados de capacitación— sin necesidad de solicitar un nuevo consentimiento en cada documento, mientras mantenga vínculo con la empresa o hasta que decida revocarla por escrito ante el administrador del sistema.',
  'Declaro haber sido informado(a) de que mi firma, fotografía y datos de verificación (fecha, hora y dispositivo utilizado) se almacenarán de forma segura en los sistemas de la empresa y se usarán exclusivamente para fines de control documentario y de Seguridad y Salud en el Trabajo (SST).',
  'Entiendo que esta autorización es un requisito indispensable para acceder a los módulos de capacitación, evaluación y firma de documentos de la plataforma.',
];

export const CONSENT_CHECKBOX_LABEL =
  'He leído y acepto los términos anteriores, y autorizo el uso de mi firma digital y fotografía conforme a lo descrito.';
