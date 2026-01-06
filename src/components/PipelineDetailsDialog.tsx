import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Pause,
  GitBranch,
  GitCommit,
  Timer,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Terminal,
  Package,
  TestTube,
  Rocket,
  Shield,
} from 'lucide-react';
import { useState } from 'react';

interface PipelineStep {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'running' | 'pending' | 'skipped';
  duration: string;
  startedAt: string;
  icon: 'checkout' | 'install' | 'build' | 'test' | 'security' | 'deploy';
  logs: string[];
}

interface Pipeline {
  id: string;
  name: string;
  repo: string;
  branch: string;
  commit: string;
  commitMessage: string;
  status: string;
  duration: string;
  startedAt: string;
  triggeredBy: string;
}

interface PipelineDetailsDialogProps {
  pipeline: Pipeline | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Mock pipeline steps data
const getMockPipelineSteps = (pipelineId: string): PipelineStep[] => {
  const baseSteps: PipelineStep[] = [
    {
    id: '1',
    name: 'Checkout',
    status: 'success',
    duration: '3s',
    startedAt: '14:30:00',
    icon: 'checkout',
    logs: [
        '> Cloning repository...',
        '> Fetching commit a1b2c3d',
        '> Checking out branch main',
        '> Successfully checked out in 2.8s',
    ],
    },
    {
    id: '2',
    name: 'Install Dependencies',
    status: 'success',
    duration: '45s',
    startedAt: '14:30:03',
    icon: 'install',
    logs: [
        '> npm ci --legacy-peer-deps',
        '> Installing 847 packages...',
        '> added 847 packages in 44s',
        '> 142 packages are looking for funding',
    ],
    },
    {
    id: '3',
    name: 'Build',
    status: 'success',
    duration: '1m 22s',
    startedAt: '14:30:48',
    icon: 'build',
    logs: [
        '> vite build',
        '> vite v5.0.0 building for production...',
        '> ✓ 234 modules transformed.',
        '> dist/index.html                  0.46 kB │ gzip:  0.30 kB',
        '> dist/assets/index-DZR5k0.css    28.15 kB │ gzip:  5.23 kB',
        '> dist/assets/index-B8kF2s.js    156.23 kB │ gzip: 48.92 kB',
        '> ✓ built in 1m 21s',
    ],
    },
    {
    id: '4',
    name: 'Run Tests',
    status: pipelineId === '3' ? 'failed' : 'success',
    duration: pipelineId === '3' ? '1m 12s' : '2m 15s',
    startedAt: '14:32:10',
    icon: 'test',
    logs: pipelineId === '3'
        ? [
            '> vitest run --coverage',
            '> Running 156 tests...',
            '> ✓ auth.test.ts (12 tests) 2.3s',
            '> ✓ api.test.ts (28 tests) 4.1s',
            '> ✗ user.test.ts (8 tests) 1.2s',
            '>   FAIL: should validate user email',
            '>   Expected: true',
            '>   Received: false',
            '>   at validateEmail (src/utils/validate.ts:12:5)',
            '> Test suite failed. 1 of 156 tests failed.',
        ]
        : [
            '> vitest run --coverage',
            '> Running 156 tests...',
            '> ✓ auth.test.ts (12 tests) 2.3s',
            '> ✓ api.test.ts (28 tests) 4.1s',
            '> ✓ user.test.ts (8 tests) 1.2s',
            '> ✓ components.test.ts (45 tests) 8.2s',
            '> ✓ hooks.test.ts (23 tests) 3.8s',
            '> ✓ utils.test.ts (40 tests) 5.1s',
            '> All tests passed. Coverage: 87.3%',
        ],
    },
    {
    id: '5',
    name: 'Security Scan',
    status: pipelineId === '3' ? 'skipped' : 'success',
    duration: pipelineId === '3' ? '-' : '32s',
    startedAt: '14:34:25',
    icon: 'security',
    logs: pipelineId === '3'
        ? ['> Step skipped due to previous failure']
        : [
            '> Running security audit...',
            '> npm audit',
            '> found 0 vulnerabilities',
            '> Running SAST scan...',
            '> No security issues detected',
            '> ✓ Security scan passed',
        ],
    },
    {
    id: '6',
    name: 'Deploy',
    status: pipelineId === '3' ? 'skipped' : pipelineId === '2' ? 'running' : pipelineId === '7' ? 'pending' : 'success',
    duration: pipelineId === '3' || pipelineId === '7' ? '-' : pipelineId === '2' ? '1m 12s' : '45s',
    startedAt: '14:34:57',
    icon: 'deploy',
    logs: pipelineId === '3'
        ? ['> Step skipped due to previous failure']
        : pipelineId === '2'
        ? [
            '> Deploying to staging environment...',
            '> Uploading build artifacts...',
            '> Updating container images...',
            '> Waiting for health check...',
        ]
        : pipelineId === '7'
        ? ['> Waiting for previous steps to complete...']
        : [
            '> Deploying to production...',
            '> Uploading build artifacts...',
            '> Updating container images...',
            '> Running database migrations...',
            '> Invalidating CDN cache...',
            '> ✓ Deployment successful',
            '> Live at: https://app.example.com',
        ],
    },
  ];

  return baseSteps;
};

const getStepIcon = (icon: PipelineStep['icon']) => {
  switch (icon) {
    case 'checkout':
    return <GitBranch className="w-4 h-4" />;
    case 'install':
    return <Package className="w-4 h-4" />;
    case 'build':
    return <Terminal className="w-4 h-4" />;
    case 'test':
    return <TestTube className="w-4 h-4" />;
    case 'security':
    return <Shield className="w-4 h-4" />;
    case 'deploy':
    return <Rocket className="w-4 h-4" />;
    default:
    return <Terminal className="w-4 h-4" />;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'success':
    return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'failed':
    return <XCircle className="w-4 h-4 text-red-500" />;
    case 'running':
    return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
    case 'pending':
    return <Pause className="w-4 h-4 text-muted-foreground" />;
    case 'skipped':
    return <ChevronRight className="w-4 h-4 text-muted-foreground" />;
    default:
    return null;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'success':
    return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Success</Badge>;
    case 'failed':
    return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Failed</Badge>;
    case 'running':
    return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Running</Badge>;
    case 'pending':
    return <Badge className="bg-muted text-muted-foreground border-border">Pending</Badge>;
    case 'skipped':
    return <Badge className="bg-muted text-muted-foreground border-border">Skipped</Badge>;
    default:
    return null;
  }
};

export function PipelineDetailsDialog({ pipeline, open, onOpenChange }: PipelineDetailsDialogProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set(['4', '6']));

  if (!pipeline) return null;

  const steps = getMockPipelineSteps(pipeline.id);

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
    const newSet = new Set(prev);
    if (newSet.has(stepId)) {
        newSet.delete(stepId);
    } else {
        newSet.add(stepId);
    }
    return newSet;
    });
  };

  const copyLogs = (logs: string[]) => {
    navigator.clipboard.writeText(logs.join('\n'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
            {getStatusIcon(pipeline.status)}
            <span>{pipeline.name}</span>
            {getStatusBadge(pipeline.status)}
        </DialogTitle>
        </DialogHeader>

        {/* Pipeline Info */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground border-b border-border pb-4">
        <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            <span className="font-mono">{pipeline.repo}</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="text-foreground">{pipeline.branch}</span>
        </div>
        <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4" />
            <span className="font-mono text-xs">{pipeline.commit}</span>
        </div>
        <div className="flex items-center gap-2">
            <Timer className="w-4 h-4" />
            <span>{pipeline.duration}</span>
        </div>
        </div>

        <div className="text-sm mb-2">
        <span className="text-muted-foreground">Commit:</span>{' '}
        <span className="text-foreground">{pipeline.commitMessage}</span>
        </div>

        {/* Execution Timeline */}
        <ScrollArea className="flex-1 -mx-6 px-6">
        <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground mb-3">Execution Timeline</h3>

            {steps.map((step, index) => (
            <div key={step.id} className="relative">
                {/* Timeline connector */}
                {index < steps.length - 1 && (
                <div className="absolute left-[19px] top-10 w-0.5 h-[calc(100%-24px)] bg-border" />
                )}

                <div className="border border-border rounded-lg overflow-hidden bg-card">
                {/* Step Header */}
                <button
                    onClick={() => toggleStep(step.id)}
                    className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        step.status === 'success' ? 'bg-green-500/10 text-green-500' :
                        step.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                        step.status === 'running' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-muted text-muted-foreground'
                    }`}>
                        {getStepIcon(step.icon)}
                    </div>
                    <div className="text-left">
                        <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{step.name}</span>
                        {getStatusBadge(step.status)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                        Started at {step.startedAt} • Duration: {step.duration}
                        </div>
                    </div>
                    </div>
                    <div className="flex items-center gap-2">
                    {expandedSteps.has(step.id) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                    </div>
                </button>

                {/* Logs */}
                {expandedSteps.has(step.id) && (
                    <div className="border-t border-border bg-background/50">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                        <span className="text-xs text-muted-foreground font-medium">Build Logs</span>
                        <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={(e) => {
                            e.stopPropagation();
                            copyLogs(step.logs);
                        }}
                        >
                        <Copy className="w-3 h-3" />
                        Copy
                        </Button>
                    </div>
                    <div className="p-3 font-mono text-xs space-y-1 max-h-48 overflow-y-auto bg-background">
                        {step.logs.map((log, logIndex) => (
                        <div
                            key={logIndex}
                            className={`${
                            log.includes('FAIL') || log.includes('✗') || log.includes('Error')
                                ? 'text-red-500'
                                : log.includes('✓') || log.includes('Successfully') || log.includes('passed')
                                ? 'text-green-500'
                                : 'text-muted-foreground'
                            }`}
                        >
                            {log}
                        </div>
                        ))}
                    </div>
                    </div>
                )}
                </div>
            </div>
            ))}
        </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
        <Button variant="outline" size="sm" className="gap-2">
            <ExternalLink className="w-4 h-4" />
            View in GitHub
        </Button>
        <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
            Download Logs
            </Button>
            <Button size="sm" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Re-run Pipeline
            </Button>
        </div>
        </div>
    </DialogContent>
    </Dialog>
  );
}
