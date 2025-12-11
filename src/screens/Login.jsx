import React, { useState } from 'react';
import { Mail, Key, Eye, EyeOff, User } from 'lucide-react';
import "../styles/login-bg.css"; 

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
    <div className="login-bg-wrapper min-h-screen flex items-center justify-center relative overflow-hidden p-4">
      {/* Background Layers */}
      <div className="hero-overlay absolute inset-0 pointer-events-none" />
      <div className="login-bg absolute inset-0 pointer-events-none" />
      <div className="login-noise absolute inset-0 pointer-events-none"></div>
      <div className="login-vignette absolute inset-0 pointer-events-none"></div>
      <div className="card-glow absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="glow-pill" />
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-4xl mx-auto">
        
        {/* LAYOUT: Stack Vertically on Mobile (flex-col), Side-by-Side on Desktop (md:flex-row) */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12">
          
          {/* --- 1. HELMET SECTION (Appears on TOP for Mobile) --- */}
          <div className="flex flex-col items-center justify-center w-full md:w-5/12 order-1">
            {/* The Video Wrapper */}
            <div className="relative w-40 h-40 md:w-full md:h-auto flex justify-center items-center">
               <video
                className="w-full h-full object-contain mix-blend-screen" // mix-blend-screen REMOVES BLACK BACKGROUND
                autoPlay
                muted
                loop
                playsInline
                poster="/assets/hero.png"
               >
                   <source src="/assets/helmet.webm" type="video/webm" />
                   <source src="/assets/helmet.mp4" type="video/mp4" />
                   <img src="/assets/hero.png" alt="hero" />
               </video>
            </div>

            <div className="text-center mt-2">
              <div className="text-2xl font-black text-white tracking-wider">MAMA.MAPS</div>
              <div className="text-xs text-blue-200 font-medium tracking-wide uppercase mt-1">Realtime reports • Safer routes</div>
            </div>
          </div>

          {/* --- 2. LOGIN FORM (Appears Below Helmet on Mobile) --- */}
          <div className="w-full md:w-5/12 bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-2xl order-2">
            <h2 className="text-white text-2xl font-bold mb-1">{isSignup ? 'Create Account' : 'Welcome Back'}</h2>
            <p className="text-blue-100 mb-6 text-sm">{isSignup ? 'Join the force' : 'Enter details to login'}</p>

            <form onSubmit={doSubmit} className="space-y-4">
              {isSignup && (
                <div className="flex items-center gap-3 bg-black/20 border border-white/10 rounded-xl p-3">
                  <User className="text-blue-200" size={18} />
                  <input
                    className="bg-transparent outline-none placeholder:text-blue-200/50 text-white flex-1 text-sm font-medium"
                    placeholder="Officer Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}

              <div className="flex items-center gap-3 bg-black/20 border border-white/10 rounded-xl p-3">
                <Mail className="text-blue-200" size={18} />
                <input
                  className="bg-transparent outline-none placeholder:text-blue-200/50 text-white flex-1 text-sm font-medium"
                  type="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="flex items-center gap-3 bg-black/20 border border-white/10 rounded-xl p-3 relative">
                <Key className="text-blue-200" size={18} />
                <input
                  className="bg-transparent outline-none placeholder:text-blue-200/50 text-white flex-1 pr-8 text-sm font-medium"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 text-blue-200/70 hover:text-white"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {error && <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 text-xs text-center">{error}</div>}

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-900/20 active:scale-95 transition-all mt-2"
              >
                {busy ? 'Processing...' : isSignup ? 'Sign Up' : 'Log In'}
              </button>
            </form>

            <div className="mt-6 text-center border-t border-white/10 pt-4">
              <button
                onClick={() => setIsSignup(v => !v)}
                className="text-xs text-blue-200 hover:text-white font-medium transition-colors"
              >
                {isSignup ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}