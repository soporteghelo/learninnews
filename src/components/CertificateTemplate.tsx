import React, { useMemo } from 'react';
import type { UserSession, AppDynamicConfig, UserProgress, QuizQuestion, LearnTopic } from '../types';

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
  topic?: LearnTopic;
  fullNameOverride?: string;
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
    topic,
    fullNameOverride,
  } = props;

  const finalHtml = useMemo(() => {
    const fullName = (fullNameOverride || `${userSession.apellidos} ${userSession.nombres}`).toUpperCase();
    const currentDate = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const currentYear = new Date().getFullYear().toString();

    // 1. Process Certificate Page
    const proxyUrl = (url: string) => {
      if (!url || url.startsWith('data:') || url.includes('weserv.nl')) return url;
      // Clean up the URL (remove https:// if present for weserv)
      const cleanUrl = url.replace(/^https?:\/\//, '');
      return `https://images.weserv.nl/?url=${cleanUrl}&default=${encodeURIComponent(url)}`;
    };

    const EMPTY_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    let certPage = certificateBaseHtml
      .replace(/{{certificate_logo_src}}/gi, proxyUrl(certificateLogoSrc) || 'https://via.placeholder.com/340x95?text=LOGO+EMPRESA')
      .replace(/{{user_full_name}}/gi, fullName)
      .replace(/{{user_cargo}}/gi, cargo || 'PERSONAL OPERATIVO')
      .replace(/{{user_celular}}/gi, celular || '-')
      .replace(/{{course_title}}/gi, (topic?.title || appConfig?.title || 'CAPACITACIÓN CORPORATIVA').toUpperCase())
      .replace(/{{user_dni}}/gi, userSession.dni)
      .replace(/{{user_audience}}/gi, (userSession.audience || []).join(', ') || 'General')
      .replace(/{{current_date}}/gi, currentDate)
      .replace(/{{current_year}}/gi, currentYear)
      .replace(/{{selfie_src}}/gi, selfieData || EMPTY_IMG)
      .replace(/{{timestamp}}/gi, timestamp)
      .replace(/{{participant_signature_src}}/gi, signatureData || EMPTY_IMG)
      .replace(/{{representative_signature_src}}/gi, proxyUrl(certificateSignatureSrc) || 'https://via.placeholder.com/160x70?text=FIRMA+AUTORIZADA')
      .replace(/{{representative_name}}/gi, appConfig?.nombreRepresentante || 'RESPONSABLE DE CALIDAD')
      .replace(/{{representative_cargo}}/gi, appConfig?.cargoRepresentante || 'Dirección de Cumplimiento');

    // 2. Build grouped questions by categoriaContenido
    const categoryMap: Record<string, typeof quizQuestions> = {};
    quizQuestions.forEach(q => {
      const cat = q.categoriaContenido?.trim() || 'General';
      if (!categoryMap[cat]) categoryMap[cat] = [];
      categoryMap[cat].push(q);
    });

    const scoreInfo = (() => {
      const p = progress[0];
      if (!p || p.quizScore === undefined) return '';
      const score = p.quizScore > 20 ? parseFloat(((p.quizScore / 100) * 20).toFixed(1)) : p.quizScore;
      const passed = score >= 16;
      return `<div style="display:inline-block; background: ${passed ? '#16a34a' : '#ca8a04'}; color: white; padding: 3px 14px; border-radius: 100px; font-size: 8pt; font-weight: 700; margin-bottom: 14px;">
        Nota: ${score.toFixed(1)} / 20 Pts — ${passed ? 'APROBADO ✓' : 'NO APROBADO'}
      </div>`;
    })();

    const modulesHtml = scoreInfo + Object.entries(categoryMap).map(([cat, questions]) => {
      const questionsHtml = questions.map((q, qi) => {
        const answer = q.correctAnswer === 'A' ? q.optionA
          : q.correctAnswer === 'B' ? q.optionB
          : q.correctAnswer === 'C' ? q.optionC : q.optionD;
        return `
          <div style="margin-bottom: 7px; padding: 5px 8px; border-left: 2px solid #cbd5e1;">
            <div style="font-weight: 600; color: #1e293b; margin-bottom: 2px;">${qi + 1}. ${q.question}</div>
            <div style="color: #1b4d89; font-style: italic;">✓ ${answer}</div>
          </div>
        `;
      }).join('');

      return `
        <div style="margin-bottom: 16px; break-inside: avoid;">
          <div style="background: #1b4d89; color: white; padding: 5px 10px; border-radius: 5px 5px 0 0; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
            ${cat}
          </div>
          <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 5px 5px; padding: 8px 10px; background: #fafbff;">
            ${questionsHtml}
          </div>
        </div>
      `;
    }).join('');

    // 3. Process Summary Page
    let summaryPage = summaryBaseHtml
      .replace(/{{course_title}}/gi, (topic?.title || appConfig?.title || 'CAPACITACIÓN CORPORATIVA').toUpperCase())
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
