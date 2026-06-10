import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Briefcase, Phone,
  Users, ArrowRight, AlertCircle, User,
} from 'lucide-react';
import type { UserSession } from '../types';

const EMPRESAS = ['AESA', 'FERREYROS', 'TH', 'LUCARBAL', 'OTROS'];

const AREAS = [
  'AVANCES',
  'SERVICIOS',
  'ADMINISTRACIÓN',
  'LOGÍSTICA',
  'MANTENIMIENTO',
  'SEGURIDAD',
  'OFICINA TÉCNICA',
];

const PARENTESCOS = ['ESPOSA(O)', 'PADRE', 'MADRE', 'HIJO(A)', 'OTROS'];

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function isoToPeruDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export interface ProfileFormData {
  empresa: string;
  area: string;
  cargo: string;
  fechaIngreso: string;     // DD/MM/YYYY
  fechaNacimiento: string;  // DD/MM/YYYY
  correo: string;
  celular: string;
  contacto1Numero: string;
  contacto1Parentesco: string;
  contacto2Numero: string;
  contacto2Parentesco: string;
}

interface ProfileFormProps {
  userSession: UserSession;
  onComplete: (data: ProfileFormData) => void | Promise<void>;
}

export default function ProfileForm({ userSession, onComplete }: ProfileFormProps) {
  const [empresa, setEmpresa] = useState('AESA');
  const [empresaOtro, setEmpresaOtro] = useState('');
  const [area, setArea] = useState('');
  const [cargo, setCargo] = useState(userSession.cargo || '');
  const [fechaIngresoISO, setFechaIngresoISO] = useState(todayISO());
  const [fechaNacimientoISO, setFechaNacimientoISO] = useState('');
  const [correo, setCorreo] = useState(userSession.correo || '');
  const [celular, setCelular] = useState(userSession.celular || '');

  const [c1Numero, setC1Numero] = useState('');
  const [c1Parentesco, setC1Parentesco] = useState('');
  const [c1Otro, setC1Otro] = useState('');

  const [c2Numero, setC2Numero] = useState('');
  const [c2Parentesco, setC2Parentesco] = useState('');
  const [c2Otro, setC2Otro] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const resolveEmpresa = () =>
    empresa === 'OTROS' ? empresaOtro.trim().toUpperCase() || 'OTROS' : empresa;

  const resolveParentesco = (sel: string, otro: string) =>
    sel === 'OTROS' ? otro.trim().toUpperCase() || 'OTROS' : sel;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!empresa)           e.empresa = 'Selecciona una empresa';
    if (empresa === 'OTROS' && !empresaOtro.trim()) e.empresaOtro = 'Escribe el nombre de la empresa';
    if (!area)              e.area = 'Selecciona un área';
    if (!cargo.trim())      e.cargo = 'Ingresa tu cargo';
    if (!fechaIngresoISO)   e.fechaIngreso = 'Indica la fecha de ingreso a unidad';
    if (!fechaNacimientoISO) e.fechaNacimiento = 'Ingresa tu fecha de nacimiento';
    if (!correo.trim())     e.correo = 'Ingresa tu correo';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) e.correo = 'Correo inválido';
    if (!celular.trim())    e.celular = 'Ingresa tu celular';
    else if (celular.replace(/\D/g, '').length !== 9) e.celular = 'Debe tener 9 dígitos';
    if (!c1Numero.trim())   e.c1Numero = 'Ingresa el número de contacto 1';
    else if (c1Numero.replace(/\D/g, '').length !== 9) e.c1Numero = 'Debe tener 9 dígitos';
    if (!c1Parentesco)      e.c1Parentesco = 'Indica el parentesco';
    if (c1Parentesco === 'OTROS' && !c1Otro.trim()) e.c1Otro = 'Escribe el parentesco';
    if (c2Numero.trim() && c2Numero.replace(/\D/g, '').length !== 9) e.c2Numero = 'Debe tener 9 dígitos';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setSaving(true);
    await onComplete({
      empresa: resolveEmpresa(),
      area,
      cargo: cargo.trim().toUpperCase(),
      fechaIngreso: isoToPeruDate(fechaIngresoISO),
      fechaNacimiento: isoToPeruDate(fechaNacimientoISO),
      correo: correo.trim().toLowerCase(),
      celular: celular.replace(/\D/g, ''),
      contacto1Numero: c1Numero.replace(/\D/g, ''),
      contacto1Parentesco: resolveParentesco(c1Parentesco, c1Otro),
      contacto2Numero: c2Numero.replace(/\D/g, ''),
      contacto2Parentesco: c2Numero.trim() ? resolveParentesco(c2Parentesco, c2Otro) : '',
    });
    setSaving(false);
  };

  const field = (key: string) => errors[key]
    ? <p className="flex items-center gap-1 text-red-400 text-[10px] font-bold mt-1"><AlertCircle className="w-3 h-3" />{errors[key]}</p>
    : null;

  const inputCls = (key: string) =>
    `w-full px-4 py-3 rounded-xl bg-white/5 border text-white text-sm font-medium focus:outline-none transition-all ${
      errors[key] ? 'border-red-500/60 focus:border-red-400' : 'border-white/10 focus:border-blue-500/50'
    }`;

  const labelCls = 'text-[10px] text-blue-400 font-bold uppercase tracking-widest pl-1 mb-1 block';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-start p-4 pt-8 safe-area-top safe-area-bottom overflow-y-auto">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-xl relative pb-12">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Completa tu Perfil</h2>
          <p className="text-slate-500 text-xs font-bold tracking-widest">INFORMACIÓN REQUERIDA</p>
        </div>

        {/* User badge */}
        <div className="flex items-center gap-3 mb-6 px-4 py-3 glass-card rounded-2xl border-white/5">
          <div className="w-10 h-10 rounded-full bg-blue-500/15 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-white font-black text-sm">{userSession.nombres} {userSession.apellidos}</p>
            <p className="text-slate-500 text-xs font-bold">DNI: {userSession.dni}</p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          {/* Submit button at top */}
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-xs tracking-widest hover:bg-blue-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border-2 border-white/25 disabled:opacity-60"
          >
            {saving
              ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />GUARDANDO...</>
              : <>GUARDAR Y CONTINUAR <ArrowRight className="w-4 h-4" /></>}
          </button>

          {/* ── DATOS LABORALES ── */}
          <div className="glass-card rounded-2xl p-5 border-white/5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Datos Laborales</h3>
            </div>

            {/* EMPRESA */}
            <div>
              <label className={labelCls}>Empresa *</label>
              <select
                value={empresa}
                onChange={e => { setEmpresa(e.target.value); setErrors(v => ({ ...v, empresa: '', empresaOtro: '' })); }}
                className={inputCls('empresa') + ' appearance-none cursor-pointer'}
              >
                {EMPRESAS.map(e => <option key={e} value={e} className="bg-slate-900">{e}</option>)}
              </select>
              {field('empresa')}
            </div>

            {empresa === 'OTROS' && (
              <div>
                <label className={labelCls}>Nombre de la empresa *</label>
                <input
                  type="text"
                  placeholder="Ej. CONTRATISTA SAC..."
                  value={empresaOtro}
                  onChange={e => { setEmpresaOtro(e.target.value.toUpperCase()); setErrors(v => ({ ...v, empresaOtro: '' })); }}
                  className={inputCls('empresaOtro') + ' uppercase'}
                />
                {field('empresaOtro')}
              </div>
            )}

            {/* ÁREA */}
            <div>
              <label className={labelCls}>Área *</label>
              <select
                value={area}
                onChange={e => { setArea(e.target.value); setErrors(v => ({ ...v, area: '' })); }}
                className={inputCls('area') + ' appearance-none cursor-pointer'}
              >
                <option value="" disabled className="bg-slate-900">Selecciona tu área</option>
                {AREAS.map(a => <option key={a} value={a} className="bg-slate-900">{a}</option>)}
              </select>
              {field('area')}
            </div>

            {/* CARGO */}
            <div>
              <label className={labelCls}>Cargo / Puesto *</label>
              <input
                type="text"
                placeholder="Ej. OPERADOR DE EQUIPO, SUPERVISOR..."
                value={cargo}
                onChange={e => { setCargo(e.target.value.toUpperCase()); setErrors(v => ({ ...v, cargo: '' })); }}
                className={inputCls('cargo') + ' uppercase'}
              />
              {field('cargo')}
            </div>

            {/* FECHA INGRESO */}
            <div>
              <label className={labelCls}>
                Fecha de Ingreso a Unidad *
                <span className="ml-1 normal-case text-slate-500 font-medium">(el día que llegaste a la unidad)</span>
              </label>
              <input
                type="date"
                value={fechaIngresoISO}
                max={todayISO()}
                onChange={e => { setFechaIngresoISO(e.target.value); setErrors(v => ({ ...v, fechaIngreso: '' })); }}
                className={inputCls('fechaIngreso') + ' cursor-pointer'}
              />
              {field('fechaIngreso')}
            </div>
          </div>

          {/* ── DATOS PERSONALES ── */}
          <div className="glass-card rounded-2xl p-5 border-white/5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Datos Personales</h3>
            </div>

            {/* FECHA NACIMIENTO */}
            <div>
              <label className={labelCls}>Fecha de Nacimiento *</label>
              <input
                type="date"
                value={fechaNacimientoISO}
                max={todayISO()}
                onChange={e => { setFechaNacimientoISO(e.target.value); setErrors(v => ({ ...v, fechaNacimiento: '' })); }}
                className={inputCls('fechaNacimiento') + ' cursor-pointer'}
              />
              {field('fechaNacimiento')}
            </div>

            {/* CORREO */}
            <div>
              <label className={labelCls}>Correo Electrónico *</label>
              <input
                type="email"
                placeholder="Ej. nombre@empresa.com"
                value={correo}
                onChange={e => { setCorreo(e.target.value); setErrors(v => ({ ...v, correo: '' })); }}
                className={inputCls('correo')}
                inputMode="email"
              />
              {field('correo')}
            </div>

            {/* CELULAR */}
            <div>
              <label className={labelCls}>Celular *</label>
              <input
                type="text"
                placeholder="Ej. 987654321"
                value={celular}
                onChange={e => { setCelular(e.target.value.replace(/\D/g, '').slice(0, 9)); setErrors(v => ({ ...v, celular: '' })); }}
                className={inputCls('celular')}
                inputMode="numeric"
                maxLength={9}
              />
              {field('celular')}
            </div>
          </div>

          {/* ── CONTACTO EMERGENCIA 1 ── */}
          <div className="glass-card rounded-2xl p-5 border-white/5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Phone className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Contacto de Emergencia 1 <span className="text-blue-400 text-xs">(requerido)</span></h3>
            </div>

            <div>
              <label className={labelCls}>Número *</label>
              <input
                type="text"
                placeholder="Ej. 987654321"
                value={c1Numero}
                onChange={e => { setC1Numero(e.target.value.replace(/\D/g, '').slice(0, 9)); setErrors(v => ({ ...v, c1Numero: '' })); }}
                className={inputCls('c1Numero')}
                inputMode="numeric"
                maxLength={9}
              />
              {field('c1Numero')}
            </div>

            <div>
              <label className={labelCls}>Parentesco *</label>
              <select
                value={c1Parentesco}
                onChange={e => { setC1Parentesco(e.target.value); setErrors(v => ({ ...v, c1Parentesco: '' })); }}
                className={inputCls('c1Parentesco') + ' appearance-none cursor-pointer'}
              >
                <option value="" disabled className="bg-slate-900">Selecciona el parentesco</option>
                {PARENTESCOS.map(p => <option key={p} value={p} className="bg-slate-900">{p}</option>)}
              </select>
              {field('c1Parentesco')}
            </div>

            {c1Parentesco === 'OTROS' && (
              <div>
                <label className={labelCls}>Especifica el parentesco *</label>
                <input
                  type="text"
                  placeholder="Ej. HERMANO, TÍO..."
                  value={c1Otro}
                  onChange={e => { setC1Otro(e.target.value.toUpperCase()); setErrors(v => ({ ...v, c1Otro: '' })); }}
                  className={inputCls('c1Otro') + ' uppercase'}
                />
                {field('c1Otro')}
              </div>
            )}
          </div>

          {/* ── CONTACTO EMERGENCIA 2 (opcional) ── */}
          <div className="glass-card rounded-2xl p-5 border-white/5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-bold text-white">
                Contacto de Emergencia 2
                <span className="ml-2 text-slate-500 text-xs font-medium normal-case">(opcional)</span>
              </h3>
            </div>

            <div>
              <label className={labelCls}>Número</label>
              <input
                type="text"
                placeholder="Ej. 987654321"
                value={c2Numero}
                onChange={e => { setC2Numero(e.target.value.replace(/\D/g, '').slice(0, 9)); setErrors(v => ({ ...v, c2Numero: '' })); }}
                className={inputCls('c2Numero')}
                inputMode="numeric"
                maxLength={9}
              />
              {field('c2Numero')}
            </div>

            {c2Numero.trim().length > 0 && (
              <>
                <div>
                  <label className={labelCls}>Parentesco</label>
                  <select
                    value={c2Parentesco}
                    onChange={e => setC2Parentesco(e.target.value)}
                    className={inputCls('c2Parentesco') + ' appearance-none cursor-pointer'}
                  >
                    <option value="" disabled className="bg-slate-900">Selecciona el parentesco</option>
                    {PARENTESCOS.map(p => <option key={p} value={p} className="bg-slate-900">{p}</option>)}
                  </select>
                </div>
                {c2Parentesco === 'OTROS' && (
                  <div>
                    <label className={labelCls}>Especifica el parentesco</label>
                    <input
                      type="text"
                      placeholder="Ej. HERMANO, TÍO..."
                      value={c2Otro}
                      onChange={e => setC2Otro(e.target.value.toUpperCase())}
                      className={inputCls('c2Otro') + ' uppercase'}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Submit again at bottom for convenience */}
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-xs tracking-widest hover:bg-blue-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border-2 border-white/25 disabled:opacity-60"
          >
            {saving
              ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />GUARDANDO...</>
              : <>GUARDAR Y CONTINUAR <ArrowRight className="w-4 h-4" /></>}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
