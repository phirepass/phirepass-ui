import { useState } from 'react';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { PipelineDetailsDialog } from '@/components/PipelineDetailsDialog';
import {
    Globe,
    Shield,
    Server,
    Clock,
    Plus,
    CheckCircle,
    AlertTriangle,
    XCircle,
    RefreshCw,
    ExternalLink,
    Calendar,
    Activity,
    GitBranch,
    GitCommit,
    Play,
    Pause,
    Timer,
    Eye,
} from 'lucide-react';

// Mock data for uptime monitors
const mockUptimeMonitors = [
    { id: '1', name: 'Production API', url: 'https://api.example.com', status: 'up', uptime: 99.98, lastCheck: '2 min ago', responseTime: 145 },
    { id: '2', name: 'Main Website', url: 'https://example.com', status: 'up', uptime: 99.95, lastCheck: '1 min ago', responseTime: 230 },
    { id: '3', name: 'Staging Server', url: 'https://staging.example.com', status: 'down', uptime: 98.5, lastCheck: '30 sec ago', responseTime: 0 },
    { id: '4', name: 'Documentation', url: 'https://docs.example.com', status: 'up', uptime: 100, lastCheck: '3 min ago', responseTime: 89 },
    { id: '5', name: 'CDN Endpoint', url: 'https://cdn.example.com', status: 'up', uptime: 99.99, lastCheck: '1 min ago', responseTime: 42 },
    { id: '6', name: 'Auth Service', url: 'https://auth.example.com', status: 'up', uptime: 99.97, lastCheck: '45 sec ago', responseTime: 112 },
    { id: '7', name: 'Billing Portal', url: 'https://billing.example.com', status: 'up', uptime: 99.92, lastCheck: '2 min ago', responseTime: 198 },
    { id: '8', name: 'Status Page', url: 'https://status.example.com', status: 'up', uptime: 100, lastCheck: '1 min ago', responseTime: 67 },
];

// Mock data for SSL certificates
const mockSslCertificates = [
    { id: '1', domain: 'example.com', issuer: "Let's Encrypt", expiresIn: 45, expiryDate: '2025-02-15', status: 'valid' },
    { id: '2', domain: 'api.example.com', issuer: 'DigiCert', expiresIn: 12, expiryDate: '2025-01-12', status: 'expiring' },
    { id: '3', domain: 'staging.example.com', issuer: "Let's Encrypt", expiresIn: 90, expiryDate: '2025-04-01', status: 'valid' },
    { id: '4', domain: 'old.example.com', issuer: 'Comodo', expiresIn: -5, expiryDate: '2024-12-28', status: 'expired' },
    { id: '5', domain: 'cdn.example.com', issuer: 'Cloudflare', expiresIn: 180, expiryDate: '2025-07-01', status: 'valid' },
    { id: '6', domain: 'auth.example.com', issuer: 'DigiCert', expiresIn: 60, expiryDate: '2025-03-02', status: 'valid' },
    { id: '7', domain: 'billing.example.com', issuer: "Let's Encrypt", expiresIn: 8, expiryDate: '2025-01-10', status: 'expiring' },
    { id: '8', domain: 'docs.example.com', issuer: 'Sectigo', expiresIn: 120, expiryDate: '2025-05-02', status: 'valid' },
];

// Mock data for DNS monitors
const mockDnsMonitors = [
    { id: '1', domain: 'example.com', recordType: 'A', expectedValue: '185.158.133.1', currentValue: '185.158.133.1', status: 'match', lastCheck: '5 min ago' },
    { id: '2', domain: 'mail.example.com', recordType: 'MX', expectedValue: 'mail.example.com', currentValue: 'mail.example.com', status: 'match', lastCheck: '5 min ago' },
    { id: '3', domain: 'api.example.com', recordType: 'CNAME', expectedValue: 'lb.example.com', currentValue: 'old-lb.example.com', status: 'mismatch', lastCheck: '2 min ago' },
    { id: '4', domain: 'www.example.com', recordType: 'A', expectedValue: '185.158.133.1', currentValue: '185.158.133.1', status: 'match', lastCheck: '3 min ago' },
    { id: '5', domain: 'example.com', recordType: 'TXT', expectedValue: 'v=spf1 include:_spf.google.com ~all', currentValue: 'v=spf1 include:_spf.google.com ~all', status: 'match', lastCheck: '10 min ago' },
    { id: '6', domain: 'cdn.example.com', recordType: 'CNAME', expectedValue: 'cdn.cloudflare.net', currentValue: 'cdn.cloudflare.net', status: 'match', lastCheck: '4 min ago' },
    { id: '7', domain: '_dmarc.example.com', recordType: 'TXT', expectedValue: 'v=DMARC1; p=reject', currentValue: 'v=DMARC1; p=none', status: 'mismatch', lastCheck: '6 min ago' },
    { id: '8', domain: 'auth.example.com', recordType: 'A', expectedValue: '185.158.133.2', currentValue: '185.158.133.2', status: 'match', lastCheck: '2 min ago' },
];

// Mock data for cron jobs
const mockCronJobs = [
    { id: '1', name: 'Database Backup', schedule: '0 2 * * *', lastRun: '2025-01-02 02:00', nextRun: '2025-01-03 02:00', status: 'success', duration: '45s' },
    { id: '2', name: 'Email Queue', schedule: '*/5 * * * *', lastRun: '2025-01-02 14:55', nextRun: '2025-01-02 15:00', status: 'success', duration: '3s' },
    { id: '3', name: 'Report Generation', schedule: '0 8 * * 1', lastRun: '2024-12-30 08:00', nextRun: '2025-01-06 08:00', status: 'failed', duration: '120s' },
    { id: '4', name: 'Cache Cleanup', schedule: '0 */6 * * *', lastRun: '2025-01-02 12:00', nextRun: '2025-01-02 18:00', status: 'success', duration: '12s' },
    { id: '5', name: 'Log Rotation', schedule: '0 0 * * *', lastRun: '2025-01-02 00:00', nextRun: '2025-01-03 00:00', status: 'success', duration: '8s' },
    { id: '6', name: 'SSL Check', schedule: '0 6 * * *', lastRun: '2025-01-02 06:00', nextRun: '2025-01-03 06:00', status: 'success', duration: '15s' },
    { id: '7', name: 'Analytics Sync', schedule: '*/15 * * * *', lastRun: '2025-01-02 14:45', nextRun: '2025-01-02 15:00', status: 'success', duration: '22s' },
    { id: '8', name: 'Webhook Retry', schedule: '*/10 * * * *', lastRun: '2025-01-02 14:50', nextRun: '2025-01-02 15:00', status: 'failed', duration: '5s' },
];

// Mock data for CI/CD pipelines
const mockCicdPipelines = [
    { id: '1', name: 'production-deploy', repo: 'acme/web-app', branch: 'main', commit: 'a1b2c3d', commitMessage: 'feat: add user dashboard', status: 'success', duration: '4m 32s', startedAt: '2025-01-02 14:30', triggeredBy: 'John Doe' },
    { id: '2', name: 'staging-deploy', repo: 'acme/web-app', branch: 'develop', commit: 'e4f5g6h', commitMessage: 'fix: resolve login bug', status: 'running', duration: '2m 15s', startedAt: '2025-01-02 14:55', triggeredBy: 'Jane Smith' },
    { id: '3', name: 'api-tests', repo: 'acme/api-service', branch: 'feature/auth', commit: 'i7j8k9l', commitMessage: 'test: add auth tests', status: 'failed', duration: '1m 45s', startedAt: '2025-01-02 14:20', triggeredBy: 'Bob Wilson' },
    { id: '4', name: 'lint-check', repo: 'acme/mobile-app', branch: 'main', commit: 'm0n1o2p', commitMessage: 'chore: update deps', status: 'success', duration: '45s', startedAt: '2025-01-02 14:10', triggeredBy: 'Alice Brown' },
    { id: '5', name: 'build-docker', repo: 'acme/microservices', branch: 'main', commit: 'q3r4s5t', commitMessage: 'feat: add caching layer', status: 'success', duration: '8m 12s', startedAt: '2025-01-02 13:45', triggeredBy: 'Charlie Davis' },
    { id: '6', name: 'security-scan', repo: 'acme/web-app', branch: 'main', commit: 'u6v7w8x', commitMessage: 'security: patch vuln', status: 'success', duration: '3m 22s', startedAt: '2025-01-02 13:30', triggeredBy: 'Security Bot' },
    { id: '7', name: 'e2e-tests', repo: 'acme/web-app', branch: 'develop', commit: 'y9z0a1b', commitMessage: 'test: e2e checkout flow', status: 'pending', duration: '-', startedAt: '2025-01-02 15:00', triggeredBy: 'CI Schedule' },
    { id: '8', name: 'deploy-preview', repo: 'acme/docs', branch: 'docs/update', commit: 'c2d3e4f', commitMessage: 'docs: update API reference', status: 'success', duration: '1m 8s', startedAt: '2025-01-02 14:00', triggeredBy: 'Eve Martin' },
];

export default function Monitoring() {
    const [activeTab, setActiveTab] = useState('uptime');
    const [selectedPipeline, setSelectedPipeline] = useState<typeof mockCicdPipelines[0] | null>(null);
    const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'up':
            case 'valid':
            case 'match':
            case 'success':
                return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'down':
            case 'expired':
            case 'mismatch':
            case 'failed':
                return <XCircle className="w-4 h-4 text-red-500" />;
            case 'expiring':
                return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
            case 'running':
                return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
            case 'pending':
                return <Pause className="w-4 h-4 text-muted-foreground" />;
            default:
                return <Activity className="w-4 h-4 text-muted-foreground" />;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'up':
            case 'valid':
            case 'match':
            case 'success':
                return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Healthy</Badge>;
            case 'down':
            case 'expired':
            case 'mismatch':
            case 'failed':
                return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Critical</Badge>;
            case 'expiring':
                return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Warning</Badge>;
            case 'running':
                return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Running</Badge>;
            case 'pending':
                return <Badge className="bg-muted text-muted-foreground border-border">Pending</Badge>;
            default:
                return <Badge variant="secondary">Unknown</Badge>;
        }
    };

    return (
        <div className="container mx-auto px-4 py-6 space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Monitoring</h1>
                    <p className="text-muted-foreground">Monitor uptime, SSL certificates, DNS records, cron jobs, and CI/CD pipelines</p>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Globe className="h-4 w-4 text-green-500" />
                        Sites Up
                    </div>
                    <p className="text-2xl font-bold text-foreground mt-1">
                        {mockUptimeMonitors.filter(m => m.status === 'up').length}/{mockUptimeMonitors.length}
                    </p>
                </div>
                <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Shield className="h-4 w-4 text-blue-500" />
                        SSL Valid
                    </div>
                    <p className="text-2xl font-bold text-foreground mt-1">
                        {mockSslCertificates.filter(c => c.status === 'valid').length}/{mockSslCertificates.length}
                    </p>
                </div>
                <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Server className="h-4 w-4 text-purple-500" />
                        DNS OK
                    </div>
                    <p className="text-2xl font-bold text-foreground mt-1">
                        {mockDnsMonitors.filter(d => d.status === 'match').length}/{mockDnsMonitors.length}
                    </p>
                </div>
                <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Clock className="h-4 w-4 text-yellow-500" />
                        Crons OK
                    </div>
                    <p className="text-2xl font-bold text-foreground mt-1">
                        {mockCronJobs.filter(c => c.status === 'success').length}/{mockCronJobs.length}
                    </p>
                </div>
                <div className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <GitBranch className="h-4 w-4 text-cyan-500" />
                        CI/CD OK
                    </div>
                    <p className="text-2xl font-bold text-foreground mt-1">
                        {mockCicdPipelines.filter(p => p.status === 'success').length}/{mockCicdPipelines.length}
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList>
                    <TabsTrigger value="uptime">Uptime</TabsTrigger>
                    <TabsTrigger value="ssl">SSL</TabsTrigger>
                    <TabsTrigger value="dns">DNS</TabsTrigger>
                    <TabsTrigger value="cron">Cron Jobs</TabsTrigger>
                    <TabsTrigger value="cicd">CI/CD</TabsTrigger>
                </TabsList>

                {/* Uptime Monitoring */}
                <TabsContent value="uptime" className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Website Uptime Monitors</h2>
                        <Button size="sm" className="gap-2">
                            <Plus className="w-4 h-4" />
                            Add Monitor
                        </Button>
                    </div>

                    <div className="border border-border rounded-lg overflow-hidden">
                        {mockUptimeMonitors.map((monitor, index) => (
                            <div
                                key={monitor.id}
                                className={`p-4 bg-card flex items-center justify-between ${index !== mockUptimeMonitors.length - 1 ? 'border-b border-border' : ''}`}
                            >
                                <div className="flex items-center gap-4">
                                    {getStatusIcon(monitor.status)}
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium text-foreground">{monitor.name}</h3>
                                            {getStatusBadge(monitor.status)}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span>{monitor.url}</span>
                                            <ExternalLink className="w-3 h-3" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                    <div className="text-right">
                                        <p className="font-medium text-foreground">{monitor.uptime.toFixed(2)}%</p>
                                        <p className="text-muted-foreground">Uptime</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-medium text-foreground">{monitor.responseTime > 0 ? `${monitor.responseTime}ms` : '-'}</p>
                                        <p className="text-muted-foreground">Response</p>
                                    </div>
                                    <div className="text-right hidden md:block">
                                        <p className="font-medium text-foreground">{monitor.lastCheck}</p>
                                        <p className="text-muted-foreground">Last Check</p>
                                    </div>
                                    <Button variant="ghost" size="icon">
                                        <RefreshCw className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                {/* SSL Monitoring */}
                <TabsContent value="ssl" className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">SSL Certificate Monitors</h2>
                        <Button size="sm" className="gap-2">
                            <Plus className="w-4 h-4" />
                            Add Domain
                        </Button>
                    </div>

                    <div className="border border-border rounded-lg overflow-hidden">
                        {mockSslCertificates.map((cert, index) => (
                            <div
                                key={cert.id}
                                className={`p-4 bg-card flex items-center justify-between ${index !== mockSslCertificates.length - 1 ? 'border-b border-border' : ''}`}
                            >
                                <div className="flex items-center gap-4">
                                    {getStatusIcon(cert.status)}
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium text-foreground">{cert.domain}</h3>
                                            {getStatusBadge(cert.status)}
                                        </div>
                                        <p className="text-sm text-muted-foreground">Issued by {cert.issuer}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                    <div className="text-right">
                                        <p className="font-medium text-foreground">{cert.expiresIn > 0 ? `${cert.expiresIn} days` : 'Expired'}</p>
                                        <p className="text-muted-foreground">Expires In</p>
                                    </div>
                                    <div className="text-right hidden md:block">
                                        <p className="font-medium text-foreground">{cert.expiryDate}</p>
                                        <p className="text-muted-foreground">Expiry Date</p>
                                    </div>
                                    <div className="w-24 hidden md:block">
                                        <Progress
                                            value={Math.max(0, Math.min(100, (cert.expiresIn / 90) * 100))}
                                            className={cert.status === 'expired' ? 'bg-red-500/20' : cert.status === 'expiring' ? 'bg-yellow-500/20' : ''}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                {/* DNS Monitoring */}
                <TabsContent value="dns" className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">DNS Record Monitors</h2>
                        <Button size="sm" className="gap-2">
                            <Plus className="w-4 h-4" />
                            Add DNS Monitor
                        </Button>
                    </div>

                    <div className="border border-border rounded-lg overflow-hidden">
                        {mockDnsMonitors.map((dns, index) => (
                            <div
                                key={dns.id}
                                className={`p-4 bg-card flex items-center justify-between ${index !== mockDnsMonitors.length - 1 ? 'border-b border-border' : ''}`}
                            >
                                <div className="flex items-center gap-4">
                                    {getStatusIcon(dns.status)}
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium text-foreground">{dns.domain}</h3>
                                            <Badge variant="outline">{dns.recordType}</Badge>
                                            {getStatusBadge(dns.status)}
                                        </div>
                                        <p className="text-sm text-muted-foreground">Last checked {dns.lastCheck}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                    <div className="text-right hidden md:block">
                                        <p className="font-medium font-mono text-xs text-foreground">{dns.expectedValue}</p>
                                        <p className="text-muted-foreground">Expected</p>
                                    </div>
                                    <div className="text-right hidden md:block">
                                        <p className={`font-medium font-mono text-xs ${dns.status === 'mismatch' ? 'text-red-500' : 'text-foreground'}`}>
                                            {dns.currentValue}
                                        </p>
                                        <p className="text-muted-foreground">Current</p>
                                    </div>
                                    <Button variant="ghost" size="icon">
                                        <RefreshCw className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                {/* Cron Job Monitoring */}
                <TabsContent value="cron" className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Cron Job Monitors</h2>
                        <Button size="sm" className="gap-2">
                            <Plus className="w-4 h-4" />
                            Add Cron Job
                        </Button>
                    </div>

                    <div className="border border-border rounded-lg overflow-hidden">
                        {mockCronJobs.map((cron, index) => (
                            <div
                                key={cron.id}
                                className={`p-4 bg-card flex items-center justify-between ${index !== mockCronJobs.length - 1 ? 'border-b border-border' : ''}`}
                            >
                                <div className="flex items-center gap-4">
                                    {getStatusIcon(cron.status)}
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium text-foreground">{cron.name}</h3>
                                            {getStatusBadge(cron.status)}
                                        </div>
                                        <p className="text-sm text-muted-foreground font-mono">{cron.schedule}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                    <div className="text-right">
                                        <p className="font-medium text-foreground">{cron.duration}</p>
                                        <p className="text-muted-foreground">Duration</p>
                                    </div>
                                    <div className="text-right hidden md:block">
                                        <p className="font-medium text-foreground">{cron.lastRun}</p>
                                        <p className="text-muted-foreground">Last Run</p>
                                    </div>
                                    <div className="text-right hidden md:block">
                                        <p className="font-medium text-foreground">{cron.nextRun}</p>
                                        <p className="text-muted-foreground">Next Run</p>
                                    </div>
                                    <Button variant="ghost" size="icon">
                                        <Calendar className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                {/* CI/CD Monitoring */}
                <TabsContent value="cicd" className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">CI/CD Pipeline Monitors</h2>
                        <Button size="sm" className="gap-2">
                            <Plus className="w-4 h-4" />
                            Add Pipeline
                        </Button>
                    </div>

                    <div className="border border-border rounded-lg overflow-hidden">
                        {mockCicdPipelines.map((pipeline, index) => (
                            <div
                                key={pipeline.id}
                                className={`p-4 bg-card flex flex-col md:flex-row md:items-center justify-between gap-4 ${index !== mockCicdPipelines.length - 1 ? 'border-b border-border' : ''}`}
                            >
                                <div className="flex items-center gap-4">
                                    {getStatusIcon(pipeline.status)}
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-medium text-foreground">{pipeline.name}</h3>
                                            {getStatusBadge(pipeline.status)}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                            <span className="font-mono">{pipeline.repo}</span>
                                            <span>•</span>
                                            <GitBranch className="w-3 h-3" />
                                            <span>{pipeline.branch}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 md:gap-6 text-sm flex-wrap">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <GitCommit className="w-3 h-3" />
                                        <span className="font-mono text-xs">{pipeline.commit}</span>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-medium text-foreground flex items-center gap-1">
                                            <Timer className="w-3 h-3" />
                                            {pipeline.duration}
                                        </p>
                                        <p className="text-muted-foreground text-xs">Duration</p>
                                    </div>
                                    <div className="text-right hidden md:block">
                                        <p className="font-medium text-foreground">{pipeline.startedAt}</p>
                                        <p className="text-muted-foreground text-xs">Started</p>
                                    </div>
                                    <div className="text-right hidden md:block">
                                        <p className="font-medium text-foreground text-xs">{pipeline.triggeredBy}</p>
                                        <p className="text-muted-foreground text-xs">Triggered By</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                setSelectedPipeline(pipeline);
                                                setPipelineDialogOpen(true);
                                            }}
                                        >
                                            <Eye className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon">
                                            {pipeline.status === 'running' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Pipeline Details Dialog */}
            <PipelineDetailsDialog
                pipeline={selectedPipeline}
                open={pipelineDialogOpen}
                onOpenChange={setPipelineDialogOpen}
            />
        </div>
    );
}
