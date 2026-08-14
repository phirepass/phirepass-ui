'use client';

import { useState } from 'react';
import { PhirepassLogo } from '@/components/PhirepassLogo';
import { useRouter } from 'next/navigation'
import Link from 'next/link';
import { useRuntimeConfig } from '@/components/RuntimeConfigProvider';
import { Button } from '@/components/ui/button';
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator';
import { toast } from '@/components/ui/sonner';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShowcase } from '@/components/AuthShowcase';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { config, isLoading: isConfigLoading } = useRuntimeConfig();
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        // Form login is disabled - only OAuth login is available
    };

    const handleOAuthLogin = async (provider: 'google' | 'github') => {
        if (provider === 'github') {
            const clientId = config.NEXT_PUBLIC_GITHUB_CLIENT_ID;
            if (!clientId) {
                toast.error('GitHub OAuth is not configured.');
                return;
            }

            const redirectUri = `${window.location.origin}/auth/github/callback`;
            const state = Math.random().toString(36).substring(7);

            // Store state for verification (optional but recommended)
            sessionStorage.setItem('github_oauth_state', state);

            // Redirect to GitHub OAuth
            window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('user:email read:user')}&state=${state}`;
        }
        // Google OAuth not implemented - do nothing
    };

    const isGithubLoginDisabled = isLoading || isConfigLoading || !config.NEXT_PUBLIC_GITHUB_CLIENT_ID;

    return (
        <div className="min-h-screen flex justify-center">
            <div className="w-full max-w-8xl flex">
                {/* Left Panel - Branding */}
                <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary/20 via-background to-background">
                    {/* Animated grid background */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.05)_1px,transparent_1px)] bg-[size:60px_60px] animate-pulse-glow" />

                    {/* Floating elements */}
                    <div className="absolute top-20 left-20 w-32 h-32 bg-primary/10 rounded-full blur-3xl animate-pulse" />
                    <div className="absolute bottom-40 right-20 w-48 h-48 bg-accent/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
                    <div className="absolute top-1/2 left-1/3 w-24 h-24 bg-success/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '2s' }} />

                    {/* Content */}
                    <div className="relative z-10 flex flex-col justify-center px-16 py-12">
                        <AuthShowcase />
                    </div>
                </div>

                {/* Right Panel - Login Form */}
                <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
                    <div className="w-full max-w-md animate-fade-in">
                        {/* Mobile Logo */}
                        <div className="flex flex-col items-center mb-8 lg:hidden">
                            <PhirepassLogo className="w-16 h-16 rounded-2xl mb-4 glow-primary" />
                            <h1 className="text-3xl font-bold">
                                <span className="text-gradient">Phire</span>
                                <span className="text-foreground">pass</span>
                            </h1>
                            <p className="text-muted-foreground mt-2">Remote access &amp; uptime monitoring</p>
                        </div>

                        {/* Welcome Text */}
                        <div className="mb-8 hidden lg:block">
                            <h2 className="text-3xl font-bold text-foreground mb-2">Welcome back</h2>
                            <p className="text-muted-foreground">Sign in to your nodes, tunnels, and monitors</p>
                        </div>

                        {/* Login Form */}
                        <div className="space-y-6">
                            {/* OAuth Buttons */}
                            <div className="grid grid-cols-2 gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-12 text-sm font-medium opacity-50 cursor-not-allowed"
                                    disabled={true}
                                    title="Google login not available - use GitHub"
                                >
                                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                                        <path
                                            fill="currentColor"
                                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        />
                                        <path
                                            fill="currentColor"
                                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        />
                                        <path
                                            fill="currentColor"
                                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                        />
                                        <path
                                            fill="currentColor"
                                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                        />
                                    </svg>
                                    Google
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-12 text-sm font-medium hover:bg-secondary/80 hover:border-primary/50 transition-all"
                                    onClick={() => handleOAuthLogin('github')}
                                    disabled={isGithubLoginDisabled}
                                    title={isConfigLoading ? 'Loading app configuration...' : (!config.NEXT_PUBLIC_GITHUB_CLIENT_ID ? 'GitHub login is not configured' : undefined)}
                                >
                                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                    </svg>
                                    GitHub
                                </Button>
                            </div>

                            {/* Divider */}
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-border" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-3 text-muted-foreground">or</span>
                                </div>
                            </div>

                            {/* Email Form */}
                            <form onSubmit={handleLogin} className="space-y-4 opacity-50 pointer-events-none">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                                        required
                                        disabled
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="w-full bg-secondary/50 border border-border rounded-xl px-4 py-3.5 pr-12 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                                            required
                                            disabled
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                            disabled
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                    <PasswordStrengthIndicator password={password} />
                                </div>

                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full h-12 text-base font-semibold rounded-xl opacity-50 cursor-not-allowed"
                                    disabled={true}
                                    title="Form login disabled - use GitHub"
                                >
                                    Sign in
                                </Button>
                            </form>

                            <p className="text-center text-sm text-muted-foreground">
                                Don't have an account?{' '}
                                <Link href="/signup" className="text-primary font-medium hover:text-primary/80 transition-colors">
                                    Create account
                                </Link>
                            </p>
                        </div>

                        {/* Footer */}
                        <p className="text-center text-xs text-muted-foreground mt-8">
                            By signing in, you agree to our{' '}
                            <Link href="/terms" className="hover:text-foreground transition-colors underline underline-offset-2">
                                Terms
                            </Link>{' '}
                            and{' '}
                            <Link href="/privacy" className="hover:text-foreground transition-colors underline underline-offset-2">
                                Privacy Policy
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
