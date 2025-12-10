// src/screens/Login.jsx
import React, { useState } from 'react';
import { Mail, Key, Eye, EyeOff, User } from 'lucide-react';
import "../styles/login-bg.css"; // import the new styles

export default function Login({ onSubmit, onSignUp, onSocial }) {
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const doSubmit = async (e) => {
    e && e.preventDefault();
    if (!email || !password) return setError('Email + password required');
    setError('');
    setBusy(true);
    try {
      if (isSignup) await onSignUp?.({ email: email.trim(), password });
      else await onSubmit?.({ email: email.trim(), password });
    } catch (err) {
      setError(err?.message || 'Auth failed');
    }
    setBusy(false);
  };

  return (
    <div className="login-bg-wrapper min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* hero graphic (big helmet) blended behind */}
      <div className="hero-overlay absolute inset-0 pointer-events-none" />

      {/* neon + color flare layers (main) */}
      <div className="login-bg absolute inset-0 pointer-events-none" />

      {/* noise + vignette */}
      <div className="login-noise absolute inset-0 pointer-events-none"></div>
      <div className="login-vignette absolute inset-0 pointer-events-none"></div>

      {/* subtle glow behind card */}
      <div className="card-glow absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="glow-pill" />
      </div>

      {/* main login card */}
      <div className="relative z-10 w-full max-w-3xl mx-auto p-6">
        <div className="flex flex-col md:flex-row items-stretch gap-6">
          {/* left visual column - shows helmet and small details */}
          <div className="left-visual hidden md:flex flex-col items-center justify-center w-2/5">
            <video
             className="left-hero-video"
             autoPlay
             muted
                 loop
              playsInline
                poster="/assets/hero.png"   // optional poster image
>
                <source src="/assets/helmet.webm" type="video/webm" />
                   <source src="/assets/helmet.mp4" type="video/mp4" />
                 {/* fallback img */}
                   <img src="/assets/hero.png" alt="hero" />
</video>

            <div className="left-caption text-slate-200 mt-4 text-center">
              <div className="text-lg font-bold text-white">MAMA.MAPS</div>
              <div className="text-xs text-slate-300 mt-1">Realtime reports • Safer routes</div>
            </div>
          </div>

          {/* right form card (glass) */}
          <div className="flex-1 bg-white/6 backdrop-blur-lg border border-white/25 rounded-3xl px-6 py-8 shadow-xl">
            <h2 className="text-white text-2xl font-bold mb-2">{isSignup ? 'Create Account' : 'Welcome Back'}</h2>
            <p className="text-slate-200 mb-6 text-sm">{isSignup ? 'Join us to unlock features' : 'Log in to continue'}</p>

            <form onSubmit={doSubmit} className="space-y-4">
              {isSignup && (
                <div className="flex items-center gap-3 glass-pill">
                  <User className="text-white" size={18} />
                  <input
                    className="bg-transparent outline-none placeholder:text-slate-300 text-white flex-1"
                    placeholder="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}

              <div className="flex items-center gap-3 glass-pill">
                <Mail className="text-white" size={18} />
                <input
                  className="bg-transparent outline-none placeholder:text-slate-300 text-white flex-1"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="flex items-center gap-3 glass-pill relative">
                <Key className="text-white" size={18} />
                <input
                  className="bg-transparent outline-none placeholder:text-slate-300 text-white flex-1 pr-10"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Password (min 6 char)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-200"
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="w-full mt-2 primary-cta"
              >
                {busy ? 'Please wait...' : isSignup ? 'Sign up' : 'Continue'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => setIsSignup(v => !v)}
                className="text-xs text-slate-200 underline"
              >
                {isSignup ? 'Already have account? Log in' : 'New here? Sign up'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
