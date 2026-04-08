import React, { useMemo } from 'react';
import type { UserSession, AppDynamicConfig, UserProgress, QuizQuestion } from '../types';

// Vite raw imports for the HTML templates
// @ts-ignore
import certificateBaseHtml from '../templates/certificate.html?raw';
// @ts-ignore
import summaryBaseHtml from '../templates/summary.html?raw';

interface CertificateTemplateProps {
  userSession: UserSession;
  appConfig: AppDynamicConfig | null;
  cargo: string;
  celular: string;
  signatureData: string | null;
  selfieData: string | null;
  timestamp: string;
  progress: UserProgress[];
  quizQuestions: QuizQuestion[];
  certificateLogoSrc: string;
  certificateSignatureSrc: string;
}

const CertificateTemplate = React.forwardRef<HTMLDivElement, CertificateTemplateProps>((props, ref) => {
  const {
    userSession,
    appConfig,
    cargo,
    celular,
    signatureData,
    selfieData,
    timestamp,
    progress,
    quizQuestions,
    certificateLogoSrc,
    certificateSignatureSrc,
  } = props;

  const finalHtml = useMemo(() => {
    const fullName = `${userSession.apellidos} ${userSession.nombres}`.toUpperCase();
    const currentDate = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const currentYear = new Date().getFullYear().toString();

    // 1. Process Certificate Page
    const proxyUrl = (url: string) => {
      if (!url || url.startsWith('data:') || url.includes('weserv.nl')) return url;
      // Clean up the URL (remove https:// if present for weserv)
      const cleanUrl = url.replace(/^https?:\/\//, '');
      return `https://images.weserv.nl/?url=${cleanUrl}&default=${encodeURIComponent(url)}`;
    };

    let certPage = certificateBaseHtml
      .replace(/{{certificate_logo_src}}/gi, proxyUrl(certificateLogoSrc) || 'https://via.placeholder.com/340x95?text=LOGO+EMPRESA')
      .replace(/{{user_full_name}}/gi, fullName)
      .replace(/{{user_cargo}}/gi, cargo || 'PERSONAL OPERATIVO')
      .replace(/{{user_celular}}/gi, celular || '-')
      .replace(/{{course_title}}/gi, (appConfig?.title || 'CAPACITACIÓN CORPORATIVA').toUpperCase())
      .replace(/{{user_dni}}/gi, userSession.dni)
      .replace(/{{user_audience}}/gi, userSession.audience || 'General')
      .replace(/{{current_date}}/gi, currentDate)
      .replace(/{{current_year}}/gi, currentYear)
      .replace(/{{selfie_src}}/gi, selfieData || '')
      .replace(/{{timestamp}}/gi, timestamp)
      .replace(/{{participant_signature_src}}/gi, signatureData || '')
      .replace(/{{representative_signature_src}}/gi, proxyUrl(certificateSignatureSrc) || 'https://via.placeholder.com/160x70?text=FIRMA+AUTORIZADA')
      .replace(/{{representative_name}}/gi, appConfig?.nombreRepresentante || 'RESPONSABLE DE CALIDAD')
      .replace(/{{representative_cargo}}/gi, appConfig?.cargoRepresentante || 'Dirección de Cumplimiento');

    // 2. Build Modules Content for Summary Page
    const modulesHtml = progress
      .filter(p => p.completed)
      .map((prog, idx) => {
        const topicQuestions = quizQuestions.filter(q => q.idMain === prog.topicId);
        const questionsHtml = topicQuestions.slice(0, 3).map((q, qi) => `
          <div style="margin-bottom: 5px; padding-left: 10px; border-left: 1px dashed #ccc;">
            <div style="font-weight: 700; color: #333;">${qi + 1}. ${q.question}</div>
            <div style="color: #1b4d89; font-style: italic;">
              R: ${q.correctAnswer === 'A' ? q.optionA : q.correctAnswer === 'B' ? q.optionB : q.correctAnswer === 'C' ? q.optionC : q.optionD}
            </div>
          </div>
        `).join('') || '<div style="padding-left: 10px; color: #aaa; font-style: italic;">Módulo completado sin evaluación escrita.</div>';

        const scoreBadge = prog.quizScore !== undefined ? `
          <div style="background: #ca8a04; color: white; padding: 3px 12px; border-radius: 100px; font-size: 8pt; font-weight: 700; display: inline-block; white-space: nowrap;">
            ${prog.quizScore.toFixed(1)} / 20 Pts
          </div>
        ` : '';

        return `
          <div style="margin-bottom: 12px; break-inside: avoid;">
            <table style="width: 100%; background: #f1f4f9; border-left: 5px solid #1b4d89; margin-bottom: 7px; border-collapse: collapse;">
              <tr>
                <td style="padding: 7px 10px; font-weight: 700; text-align: left; vertical-align: middle; font-size: 9pt; color: #333;">
                  Módulo ${idx + 1}
                </td>
                <td style="padding: 7px 10px; text-align: right; vertical-align: middle;">
                  ${scoreBadge}
                </td>
              </tr>
            </table>
            ${questionsHtml}
          </div>
        `;
      }).join('');

    // 3. Process Summary Page
    let summaryPage = summaryBaseHtml
      .replace(/{{user_full_name}}/gi, fullName)
      .replace(/{{user_dni}}/gi, userSession.dni)
      .replace(/{{current_date}}/gi, currentDate)
      .replace(/{{modules_content}}/gi, modulesHtml);

    return certPage + summaryPage;
  }, [
    userSession, appConfig, cargo, celular, signatureData, 
    selfieData, timestamp, progress, quizQuestions, 
    certificateLogoSrc, certificateSignatureSrc
  ]);

  return (
    <div
      ref={ref}
      style={{ width: '210mm', background: 'white' }}
      dangerouslySetInnerHTML={{ __html: finalHtml }}
    />
  );
});

CertificateTemplate.displayName = 'CertificateTemplate';

export default CertificateTemplate;
