import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldCheck, LockKeyhole, Mail, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';

const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/577f93874_logo_Interativa_versao_final_sem_fundo_0002.png';

export default function LoginPage() {
  const { isAuthenticated, login, authMode } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mouseLight, setMouseLight] = useState({ x: 50, y: 35 });
  const [mouseTilt, setMouseTilt] = useState({ x: 0, y: 0 });

  const interactiveTransforms = useMemo(() => {
    const leftPanel = {
      transform: `perspective(1200px) rotateX(${mouseTilt.x * 0.2}deg) rotateY(${mouseTilt.y * -0.24}deg) translateZ(0)`,
    };

    const rightCard = {
      transform: `perspective(1200px) rotateX(${mouseTilt.x * -0.16}deg) rotateY(${mouseTilt.y * 0.2}deg) translateZ(0)`,
    };

    return { leftPanel, rightCard };
  }, [mouseTilt.x, mouseTilt.y]);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (submitError) {
      setError(submitError.message || 'Não foi possível entrar no sistema.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = (event.clientX - rect.left) / rect.width;
    const relY = (event.clientY - rect.top) / rect.height;

    const clampedX = Math.max(0, Math.min(1, relX));
    const clampedY = Math.max(0, Math.min(1, relY));

    setMouseLight({ x: clampedX * 100, y: clampedY * 100 });
    setMouseTilt({
      x: (clampedY - 0.5) * 8,
      y: (clampedX - 0.5) * 8,
    });
  };

  const resetMouseEffects = () => {
    setMouseLight({ x: 50, y: 35 });
    setMouseTilt({ x: 0, y: 0 });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,116,144,0.18),_transparent_32%),linear-gradient(135deg,#f4f7f5_0%,#e7efe9_45%,#d9e7e1_100%)] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.05) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      <div
        className="relative w-full max-w-5xl grid lg:grid-cols-[1.1fr_0.9fr] gap-5 lg:gap-8 items-stretch"
        onMouseMove={handleMouseMove}
        onMouseLeave={resetMouseEffects}
      >
        <div
          className="hidden lg:flex flex-col justify-between rounded-[28px] border border-white/60 bg-slate-900 text-white p-10 shadow-2xl shadow-cyan-950/15 overflow-hidden relative transition-transform duration-200 ease-out motion-reduce:transform-none"
          style={interactiveTransforms.leftPanel}
        >
          <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(8,145,178,0.26),transparent_35%,rgba(34,197,94,0.18)_100%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm tracking-wide text-slate-100">
              <ShieldCheck className="w-4 h-4" />
              Ambiente protegido
            </div>
            <h1 className="mt-8 text-4xl font-semibold leading-tight">
              Acesso ao
              <span className="block text-cyan-300">Project Control</span>
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-slate-200/90">
              Entre com seu email corporativo e senha para acessar planejamento, execuções, documentos e relatórios.
            </p>
          </div>

          <div className="relative grid grid-cols-3 gap-4 text-sm">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p className="text-cyan-300 font-medium">Planejamento</p>
              <p className="mt-2 text-slate-200/80">Cronogramas, reprogramação e capacidade do time.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p className="text-emerald-300 font-medium">Execução</p>
              <p className="mt-2 text-slate-200/80">Acompanhamento do trabalho em andamento.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p className="text-amber-300 font-medium">Gestão</p>
              <p className="mt-2 text-slate-200/80">Documentos, usuários e visão consolidada.</p>
            </div>
          </div>
        </div>

        <Card
          className="relative overflow-hidden border-white/70 bg-white/90 backdrop-blur-sm shadow-2xl shadow-slate-900/10 rounded-[24px] sm:rounded-[28px] transition-transform duration-200 ease-out motion-reduce:transform-none"
          style={interactiveTransforms.rightCard}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70 transition-opacity duration-200"
            style={{
              background: `radial-gradient(420px circle at ${mouseLight.x}% ${mouseLight.y}%, rgba(56,189,248,0.18), transparent 58%)`,
            }}
          />
          <CardHeader className="space-y-5 pb-6 pt-7 sm:pt-8 px-5 sm:px-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-2xl sm:text-3xl text-slate-900">Entrar</CardTitle>
                <CardDescription className="mt-2 text-sm text-slate-600">
                  Use suas credenciais para acessar o sistema.
                </CardDescription>
              </div>
              <img src={LOGO_URL} alt="Project Control" className="h-12 sm:h-14 w-auto transition-transform duration-200 group-hover:scale-[1.02]" />
            </div>
            {authMode !== 'local' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Este ambiente está configurado para autenticação externa. O login local não será usado aqui.
              </div>
            )}
          </CardHeader>

          <CardContent className="px-5 sm:px-8 pb-7 sm:pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <div className="relative group/input">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="pl-10 h-12 rounded-xl transition-all duration-200 border-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-300 hover:border-cyan-300"
                    placeholder="nome@empresa.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Senha</Label>
                <div className="relative group/input">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pl-10 h-12 rounded-xl transition-all duration-200 border-slate-200 focus-visible:ring-2 focus-visible:ring-cyan-300 hover:border-cyan-300"
                    placeholder="Digite sua senha"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={isSubmitting || authMode !== 'local'} className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/25 active:scale-[0.99] text-white transition-all duration-200">
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                {isSubmitting ? 'Entrando...' : 'Acessar sistema'}
              </Button>

              <p className="text-sm text-slate-500 leading-6">
                Se o usuário já existe mas ainda não possui senha, defina a senha na tela de usuários antes de liberar o acesso.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}