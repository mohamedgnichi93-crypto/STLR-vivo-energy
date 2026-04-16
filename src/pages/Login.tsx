import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { login, getDefaultRoute, getCurrentUser } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useTranslation } from 'react-i18next';

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const { t } = useTranslation();
  
  const navigate = useNavigate();

  useEffect(() => {
    setShowContent(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const success = await login(email, password);
    if (success) {
      const user = getCurrentUser();
      if (user) {
        navigate(getDefaultRoute(user.role));
      }
    } else {
      setError(t('login.error') || "Identifiants incorrects");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
      {/* Animated Electric Particles Background */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary rounded-full mix-blend-screen filter blur-[100px] animate-pulse" />
        <div className="absolute top-1/2 right-1/4 w-[30rem] h-[30rem] bg-indigo-600 rounded-full mix-blend-screen filter blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className={`relative z-10 w-full max-w-4xl p-8 flex flex-col items-center transition-all duration-1000 transform ${showContent ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
        
        {/* Logo Area */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-primary/20 rounded-2xl">
              <Zap className="h-16 w-16 text-primary" />
            </div>
          </div>
          <h1 className="text-7xl font-bold tracking-tighter mb-2 bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent drop-shadow-sm">STLR</h1>
          <h2 className="text-2xl font-semibold text-muted-foreground tracking-wide uppercase">Vivo Energy</h2>
        </div>

        <div className="text-center mb-12 space-y-4">
          <h1 className="text-4xl font-medium text-foreground">Bienvenue sur STLR Énergie Intelligente</h1>
          <p className="text-xl text-muted-foreground">Plateforme de surveillance énergétique en temps réel</p>
        </div>

        {/* Login Form Formatted like CTA */}
        <div className="w-full max-w-sm bg-card/60 backdrop-blur-md border border-border/50 rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-foreground/80">{t('login.email') || 'Email'}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-background/80 border-border focus:border-primary focus:ring-primary/20 transition-all rounded-lg"
                placeholder="mohamedgnichi93@gmail.com"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2 relative">
              <Label htmlFor="password" className="text-sm text-foreground/80">{t('login.password') || 'Mot de passe'}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background/80 border-border focus:border-primary focus:ring-primary/20 transition-all rounded-lg pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm mt-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full group relative inline-flex items-center justify-center gap-3 px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_-5px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_-5px_rgba(255,255,255,0.4)] disabled:opacity-70 disabled:hover:scale-100"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
              <span className="relative text-lg tracking-wide flex items-center gap-2">
                {loading ? (
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>⚡ {t('login.submit') || 'Connexion'}</>
                )}
              </span>
            </button>
          </form>
        </div>

      </div>

      {/* Footer */}
      <div className={`absolute bottom-8 text-sm text-muted-foreground/60 transition-opacity duration-1000 delay-500 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
        STLR © 2026 — Powered by Vivo Energy
      </div>
    </div>
  );
}
