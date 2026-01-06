import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield,
  Plus,
  Trash2,
  Save,
  Clock,
  Ban,
  Activity,
  Globe,
  AlertTriangle
} from 'lucide-react';
import { RateLimitConfig, RateLimitRule, RateLimitStats } from '@/types/rate-limit';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const mockConfig: RateLimitConfig = {
  id: 'rl-1',
  tunnelId: 'tun-1',
  enabled: true,
  requestsPerSecond: 100,
  requestsPerMinute: 1000,
  requestsPerHour: 10000,
  burstLimit: 50,
  blockDuration: 60,
  whitelistedIps: ['192.168.1.1', '10.0.0.0/8'],
  blacklistedIps: ['1.2.3.4'],
  customRules: [
    { id: 'rule-1', name: 'Auth endpoints', path: '/api/auth/*', method: 'POST', requestsPerMinute: 10, enabled: true },
    { id: 'rule-2', name: 'Webhooks', path: '/webhook/*', requestsPerMinute: 500, enabled: true },
  ],
};

const mockStats: RateLimitStats = {
  totalBlocked: 12847,
  blockedToday: 234,
  topBlockedIps: [
    { ip: '45.33.32.156', count: 1523 },
    { ip: '91.108.56.0', count: 892 },
    { ip: '185.220.101.1', count: 654 },
    { ip: '23.129.64.0', count: 421 },
  ],
  requestsThrottled: 5623,
};

const RateLimiting = () => {
  const [config, setConfig] = useState<RateLimitConfig>(mockConfig);
  const [stats] = useState<RateLimitStats>(mockStats);
  const [newWhitelistIp, setNewWhitelistIp] = useState('');
  const [newBlacklistIp, setNewBlacklistIp] = useState('');
  const [newRule, setNewRule] = useState<Partial<RateLimitRule>>({
    name: '',
    path: '',
    requestsPerMinute: 100,
    enabled: true,
  });

  const handleSave = () => {
    toast.success('Rate limiting configuration saved');
  };

  const addWhitelistIp = () => {
    if (!newWhitelistIp.trim()) return;
    setConfig(prev => ({
    ...prev,
    whitelistedIps: [...prev.whitelistedIps, newWhitelistIp.trim()],
    }));
    setNewWhitelistIp('');
  };

  const addBlacklistIp = () => {
    if (!newBlacklistIp.trim()) return;
    setConfig(prev => ({
    ...prev,
    blacklistedIps: [...prev.blacklistedIps, newBlacklistIp.trim()],
    }));
    setNewBlacklistIp('');
  };

  const removeWhitelistIp = (ip: string) => {
    setConfig(prev => ({
    ...prev,
    whitelistedIps: prev.whitelistedIps.filter(i => i !== ip),
    }));
  };

  const removeBlacklistIp = (ip: string) => {
    setConfig(prev => ({
    ...prev,
    blacklistedIps: prev.blacklistedIps.filter(i => i !== ip),
    }));
  };

  const addCustomRule = () => {
    if (!newRule.name || !newRule.path) {
    toast.error('Please fill in all required fields');
    return;
    }
    const rule: RateLimitRule = {
    id: `rule-${Date.now()}`,
    name: newRule.name,
    path: newRule.path,
    method: newRule.method,
    requestsPerMinute: newRule.requestsPerMinute || 100,
    enabled: true,
    };
    setConfig(prev => ({
    ...prev,
    customRules: [...prev.customRules, rule],
    }));
    setNewRule({ name: '', path: '', requestsPerMinute: 100, enabled: true });
    toast.success('Custom rule added');
  };

  const removeCustomRule = (ruleId: string) => {
    setConfig(prev => ({
    ...prev,
    customRules: prev.customRules.filter(r => r.id !== ruleId),
    }));
  };

  const toggleRule = (ruleId: string) => {
    setConfig(prev => ({
    ...prev,
    customRules: prev.customRules.map(r =>
        r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    ),
    }));
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-foreground">Rate Limiting</h1>
            <p className="text-muted-foreground">Protect your tunnels from abuse and DDoS attacks</p>
        </div>
        <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" />
            Save Configuration
        </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Ban className="h-4 w-4" />
            Total Blocked
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.totalBlocked.toLocaleString()}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Shield className="h-4 w-4" />
            Blocked Today
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.blockedToday}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Activity className="h-4 w-4" />
            Throttled
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.requestsThrottled.toLocaleString()}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <AlertTriangle className="h-4 w-4" />
            Top Blocked IPs
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{stats.topBlockedIps.length}</p>
        </div>
        </div>

        <Tabs defaultValue="global" className="space-y-4">
        <TabsList>
            <TabsTrigger value="global">Global Limits</TabsTrigger>
            <TabsTrigger value="rules">Custom Rules</TabsTrigger>
            <TabsTrigger value="ips">IP Management</TabsTrigger>
            <TabsTrigger value="blocked">Blocked IPs</TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-4">
            <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                <div>
                    <CardTitle>Global Rate Limits</CardTitle>
                    <CardDescription>Configure default rate limits for all requests</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <Label htmlFor="enabled">Enabled</Label>
                    <Switch
                    id="enabled"
                    checked={config.enabled}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enabled: checked }))}
                    />
                </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="rps">Requests per Second</Label>
                    <Input
                    id="rps"
                    type="number"
                    value={config.requestsPerSecond}
                    onChange={(e) => setConfig(prev => ({ ...prev, requestsPerSecond: parseInt(e.target.value) || 0 }))}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="rpm">Requests per Minute</Label>
                    <Input
                    id="rpm"
                    type="number"
                    value={config.requestsPerMinute}
                    onChange={(e) => setConfig(prev => ({ ...prev, requestsPerMinute: parseInt(e.target.value) || 0 }))}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="rph">Requests per Hour</Label>
                    <Input
                    id="rph"
                    type="number"
                    value={config.requestsPerHour}
                    onChange={(e) => setConfig(prev => ({ ...prev, requestsPerHour: parseInt(e.target.value) || 0 }))}
                    />
                </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="burst">Burst Limit</Label>
                    <Input
                    id="burst"
                    type="number"
                    value={config.burstLimit}
                    onChange={(e) => setConfig(prev => ({ ...prev, burstLimit: parseInt(e.target.value) || 0 }))}
                    />
                    <p className="text-xs text-muted-foreground">Maximum requests allowed in a burst</p>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="block">Block Duration (seconds)</Label>
                    <Input
                    id="block"
                    type="number"
                    value={config.blockDuration}
                    onChange={(e) => setConfig(prev => ({ ...prev, blockDuration: parseInt(e.target.value) || 0 }))}
                    />
                    <p className="text-xs text-muted-foreground">How long to block offending IPs</p>
                </div>
                </div>
            </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
            <Card>
            <CardHeader>
                <CardTitle>Custom Rate Limit Rules</CardTitle>
                <CardDescription>Create path-specific rate limits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Add New Rule */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-2">
                    <Label>Rule Name</Label>
                    <Input
                    placeholder="e.g., Auth endpoints"
                    value={newRule.name}
                    onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Path Pattern</Label>
                    <Input
                    placeholder="/api/*"
                    value={newRule.path}
                    onChange={(e) => setNewRule(prev => ({ ...prev, path: e.target.value }))}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Method (optional)</Label>
                    <Input
                    placeholder="POST"
                    value={newRule.method || ''}
                    onChange={(e) => setNewRule(prev => ({ ...prev, method: e.target.value || undefined }))}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Requests/min</Label>
                    <Input
                    type="number"
                    value={newRule.requestsPerMinute}
                    onChange={(e) => setNewRule(prev => ({ ...prev, requestsPerMinute: parseInt(e.target.value) || 100 }))}
                    />
                </div>
                <div className="flex items-end">
                    <Button onClick={addCustomRule} className="w-full gap-2">
                    <Plus className="h-4 w-4" />
                    Add Rule
                    </Button>
                </div>
                </div>

                {/* Existing Rules */}
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Limit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {config.customRules.map((rule) => (
                    <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell><code className="text-sm">{rule.path}</code></TableCell>
                        <TableCell>{rule.method || 'All'}</TableCell>
                        <TableCell>{rule.requestsPerMinute}/min</TableCell>
                        <TableCell>
                        <Switch
                            checked={rule.enabled}
                            onCheckedChange={() => toggleRule(rule.id)}
                        />
                        </TableCell>
                        <TableCell>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => removeCustomRule(rule.id)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="ips" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Whitelist */}
            <Card>
                <CardHeader>
                <CardTitle className="text-green-500">Whitelisted IPs</CardTitle>
                <CardDescription>These IPs bypass rate limiting</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Input
                    placeholder="IP address or CIDR"
                    value={newWhitelistIp}
                    onChange={(e) => setNewWhitelistIp(e.target.value)}
                    />
                    <Button onClick={addWhitelistIp}>Add</Button>
                </div>
                <div className="space-y-2">
                    {config.whitelistedIps.map((ip) => (
                    <div key={ip} className="flex items-center justify-between p-2 bg-muted rounded">
                        <code className="text-sm">{ip}</code>
                        <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeWhitelistIp(ip)}
                        >
                        <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                    ))}
                </div>
                </CardContent>
            </Card>

            {/* Blacklist */}
            <Card>
                <CardHeader>
                <CardTitle className="text-red-500">Blacklisted IPs</CardTitle>
                <CardDescription>These IPs are permanently blocked</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Input
                    placeholder="IP address or CIDR"
                    value={newBlacklistIp}
                    onChange={(e) => setNewBlacklistIp(e.target.value)}
                    />
                    <Button onClick={addBlacklistIp}>Add</Button>
                </div>
                <div className="space-y-2">
                    {config.blacklistedIps.map((ip) => (
                    <div key={ip} className="flex items-center justify-between p-2 bg-muted rounded">
                        <code className="text-sm">{ip}</code>
                        <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeBlacklistIp(ip)}
                        >
                        <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                    ))}
                </div>
                </CardContent>
            </Card>
            </div>
        </TabsContent>

        <TabsContent value="blocked" className="space-y-4">
            <Card>
            <CardHeader>
                <CardTitle>Top Blocked IPs</CardTitle>
                <CardDescription>IPs that have been blocked most frequently</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Block Count</TableHead>
                    <TableHead>Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {stats.topBlockedIps.map((item) => (
                    <TableRow key={item.ip}>
                        <TableCell>
                        <code className="text-sm">{item.ip}</code>
                        </TableCell>
                        <TableCell>
                        <Badge variant="destructive">{item.count.toLocaleString()}</Badge>
                        </TableCell>
                        <TableCell>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                            setConfig(prev => ({
                                ...prev,
                                blacklistedIps: [...prev.blacklistedIps, item.ip],
                            }));
                            toast.success(`${item.ip} added to blacklist`);
                            }}
                        >
                            Add to Blacklist
                        </Button>
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </CardContent>
            </Card>
        </TabsContent>
        </Tabs>
    </div>
  );
};

export default RateLimiting;
