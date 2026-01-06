import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Footer } from '@/components/Footer';
import {
  ArrowLeft,
  Bell,
  Shield,
  Key,
  Globe,
  Moon,
  Trash2,
  Save,
  Terminal,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  const router = useRouter();
  const { toast } = useToast();

  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: false,
    alertThreshold: 80,
    darkMode: true,
    twoFactorAuth: false,
    sessionTimeout: 30,
  });

  const handleSave = () => {
    toast({
    title: "Settings saved",
    description: "Your preferences have been updated successfully.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
    {/* Background effects */}
    <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_50%)]" />

    <div className="relative z-10 container mx-auto px-4 py-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/nodes')}>
            <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground text-sm">Manage your account and preferences</p>
        </div>
        </div>

        <div className="space-y-6">
        {/* Notifications */}
        <div className="gradient-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
                <h2 className="font-semibold text-foreground">Notifications</h2>
                <p className="text-sm text-muted-foreground">Configure how you receive alerts</p>
            </div>
            </div>

            <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                <p className="font-medium text-foreground">Email Notifications</p>
                <p className="text-sm text-muted-foreground">Receive alerts via email</p>
                </div>
                <Switch
                checked={settings.emailNotifications}
                onCheckedChange={(checked) => setSettings({ ...settings, emailNotifications: checked })}
                />
            </div>
            <div className="flex items-center justify-between">
                <div>
                <p className="font-medium text-foreground">Push Notifications</p>
                <p className="text-sm text-muted-foreground">Browser push notifications</p>
                </div>
                <Switch
                checked={settings.pushNotifications}
                onCheckedChange={(checked) => setSettings({ ...settings, pushNotifications: checked })}
                />
            </div>
            <div className="flex items-center justify-between">
                <div>
                <p className="font-medium text-foreground">Alert Threshold</p>
                <p className="text-sm text-muted-foreground">CPU/Memory warning level</p>
                </div>
                <div className="flex items-center gap-2">
                <input
                    type="number"
                    value={settings.alertThreshold}
                    onChange={(e) => setSettings({ ...settings, alertThreshold: parseInt(e.target.value) })}
                    className="w-20 bg-secondary border border-border rounded-lg px-3 py-2 text-foreground text-sm text-center"
                    min={50}
                    max={100}
                />
                <span className="text-muted-foreground">%</span>
                </div>
            </div>
            </div>
        </div>

        {/* Security */}
        <div className="gradient-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
                <h2 className="font-semibold text-foreground">Security</h2>
                <p className="text-sm text-muted-foreground">Protect your account</p>
            </div>
            </div>

            <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                <p className="font-medium text-foreground">Two-Factor Authentication</p>
                <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                </div>
                <Switch
                checked={settings.twoFactorAuth}
                onCheckedChange={(checked) => setSettings({ ...settings, twoFactorAuth: checked })}
                />
            </div>
            <div className="flex items-center justify-between">
                <div>
                <p className="font-medium text-foreground">Session Timeout</p>
                <p className="text-sm text-muted-foreground">Auto logout after inactivity</p>
                </div>
                <div className="flex items-center gap-2">
                <input
                    type="number"
                    value={settings.sessionTimeout}
                    onChange={(e) => setSettings({ ...settings, sessionTimeout: parseInt(e.target.value) })}
                    className="w-20 bg-secondary border border-border rounded-lg px-3 py-2 text-foreground text-sm text-center"
                    min={5}
                    max={120}
                />
                <span className="text-muted-foreground">min</span>
                </div>
            </div>
            </div>
        </div>

        {/* API Keys */}
        <div className="gradient-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Key className="w-5 h-5 text-primary" />
            </div>
            <div>
                <h2 className="font-semibold text-foreground">API Keys</h2>
                <p className="text-sm text-muted-foreground">Manage your API access tokens</p>
            </div>
            </div>

            <div className="bg-secondary/50 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
                <div>
                <p className="font-mono text-sm text-foreground">pp_live_xxxx...xxxx</p>
                <p className="text-xs text-muted-foreground">Created: Dec 10, 2024</p>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
                </Button>
            </div>
            </div>

            <Button variant="outline" size="sm">
            <Key className="w-4 h-4 mr-2" />
            Generate New Key
            </Button>
        </div>

        {/* Appearance */}
        <div className="gradient-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Moon className="w-5 h-5 text-primary" />
            </div>
            <div>
                <h2 className="font-semibold text-foreground">Appearance</h2>
                <p className="text-sm text-muted-foreground">Customize the interface</p>
            </div>
            </div>

            <div className="flex items-center justify-between">
            <div>
                <p className="font-medium text-foreground">Dark Mode</p>
                <p className="text-sm text-muted-foreground">Use dark theme</p>
            </div>
            <Switch
                checked={settings.darkMode}
                onCheckedChange={(checked) => setSettings({ ...settings, darkMode: checked })}
            />
            </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
            <Button variant="glow" onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
            </Button>
        </div>
        </div>
    </div>
    <Footer />
    </div>
  );
}
