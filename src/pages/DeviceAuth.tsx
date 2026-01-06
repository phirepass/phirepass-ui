import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, Shield, Terminal } from 'lucide-react';

type AuthStatus = 'pending' | 'verifying' | 'success' | 'error' | 'expired';

export default function DeviceAuth() {
  const [status, setStatus] = useState<AuthStatus>('pending');
  const [deviceCode, setDeviceCode] = useState('');
  const [deviceName, setDeviceName] = useState('Unknown Device');

  useEffect(() => {
    if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    setDeviceCode(params.get('code') || '');
    setDeviceName(params.get('name') || 'Unknown Device');
    }
  }, []);

  const handleAuthorize = async () => {
    setStatus('verifying');
    // Simulate authorization
    await new Promise((r) => setTimeout(r, 2000));
    setStatus('success');
  };

  const handleDeny = () => {
    setStatus('error');
  };

  useEffect(() => {
    // Check if code is expired (example: after 10 minutes)
    if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const codeTimestamp = params.get('ts');
    if (codeTimestamp) {
        const timestamp = parseInt(codeTimestamp);
        const tenMinutes = 10 * 60 * 1000;
        if (Date.now() - timestamp > tenMinutes) {
        setStatus('expired');
        }
    }
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
    {/* Background grid effect */}
    <div className="fixed inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:50px_50px] pointer-events-none" />

    <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 rounded-2xl gradient-accent flex items-center justify-center mb-4 glow-primary">
            <Shield className="w-8 h-8 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold">
            <span className="text-gradient">Phire</span>
            <span className="text-foreground">pass</span>
        </h1>
        <p className="text-muted-foreground mt-2">Device Authorization</p>
        </div>

        {/* Authorization Card */}
        <div className="gradient-card border border-border rounded-2xl p-8">
        {status === 'pending' && (
            <div className="space-y-6">
            <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <Terminal className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                Authorize Device
                </h2>
                <p className="text-muted-foreground text-sm">
                A device is requesting access to your Phirepass account
                </p>
            </div>

            <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Device Name</span>
                <span className="font-mono text-foreground">{deviceName}</span>
                </div>
                <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Device Code</span>
                <span className="font-mono text-primary">{deviceCode || 'XXXX-XXXX'}</span>
                </div>
            </div>

            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <p className="text-sm text-destructive">
                Only authorize devices you trust. This will grant full access to manage your nodes.
                </p>
            </div>

            <div className="flex gap-3">
                <Button
                variant="outline"
                className="flex-1"
                onClick={handleDeny}
                >
                Deny
                </Button>
                <Button
                variant="glow"
                className="flex-1"
                onClick={handleAuthorize}
                >
                Authorize
                </Button>
            </div>
            </div>
        )}

        {status === 'verifying' && (
            <div className="text-center py-8">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
                Verifying Device...
            </h2>
            <p className="text-muted-foreground text-sm">
                Please wait while we authorize the device
            </p>
            </div>
        )}

        {status === 'success' && (
            <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
                Device Authorized!
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
                The device has been successfully connected. You can close this window.
            </p>
            <div className="bg-secondary/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground">
                The agent on your server will now receive its authentication token automatically.
                </p>
            </div>
            </div>
        )}

        {status === 'error' && (
            <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-10 h-10 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
                Authorization Denied
            </h2>
            <p className="text-muted-foreground text-sm">
                The device was not authorized. You can close this window.
            </p>
            </div>
        )}

        {status === 'expired' && (
            <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
                Code Expired
            </h2>
            <p className="text-muted-foreground text-sm mb-4">
                This authorization code has expired. Please restart the agent on your server to get a new code.
            </p>
            <Button variant="outline" onClick={() => window.close()}>
                Close Window
            </Button>
            </div>
        )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
        Need help?{' '}
        <a href="#" className="text-primary hover:underline">
            View documentation
        </a>
        </p>
    </div>
    </div>
  );
}
