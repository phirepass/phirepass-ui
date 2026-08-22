import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RequestLog } from '@/types/tunnel';
import { format } from 'date-fns';

interface RequestLogsTableProps {
  logs: RequestLog[];
}

const getMethodColor = (method: RequestLog['method']) => {
  switch (method) {
    case 'GET': return 'bg-green-500/10 text-green-500 hover:bg-green-500/20';
    case 'POST': return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20';
    case 'PUT': return 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20';
    case 'DELETE': return 'bg-red-500/10 text-red-500 hover:bg-red-500/20';
    case 'PATCH': return 'bg-purple-500/10 text-purple-500 hover:bg-purple-500/20';
    default: return 'bg-muted text-muted-foreground';
  }
};

const getStatusColor = (status: number) => {
  if (status >= 200 && status < 300) return 'text-green-500';
  if (status >= 300 && status < 400) return 'text-blue-500';
  if (status >= 400 && status < 500) return 'text-yellow-500';
  if (status >= 500) return 'text-red-500';
  return 'text-muted-foreground';
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

export const RequestLogsTable = ({ logs }: RequestLogsTableProps) => {
  if (logs.length === 0) {
    return (
    <div className="text-center py-8 text-muted-foreground">
        No request logs available
    </div>
    );
  }

  return (
    <ScrollArea className="h-[300px] rounded-md border border-hairline">
    <Table>
        <TableHeader>
        <TableRow className="hover:bg-transparent">
            <TableHead className="w-[100px]">Time</TableHead>
            <TableHead className="w-[80px]">Method</TableHead>
            <TableHead>Path</TableHead>
            <TableHead className="w-[80px]">Status</TableHead>
            <TableHead className="w-[80px]">Duration</TableHead>
            <TableHead className="w-[80px]">Size</TableHead>
            <TableHead className="w-[120px]">IP</TableHead>
        </TableRow>
        </TableHeader>
        <TableBody>
        {logs.map((log) => (
            <TableRow key={log.id} className="font-mono text-xs">
            <TableCell className="text-muted-foreground">
                {format(log.timestamp, 'HH:mm:ss')}
            </TableCell>
            <TableCell>
                <Badge variant="secondary" className={`${getMethodColor(log.method)} font-mono text-xs`}>
                {log.method}
                </Badge>
            </TableCell>
            <TableCell className="max-w-[200px] truncate text-foreground">
                {log.path}
            </TableCell>
            <TableCell className={getStatusColor(log.statusCode)}>
                {log.statusCode}
            </TableCell>
            <TableCell className="text-muted-foreground">
                {log.duration}ms
            </TableCell>
            <TableCell className="text-muted-foreground">
                {formatBytes(log.size)}
            </TableCell>
            <TableCell className="text-muted-foreground">
                {log.ip}
            </TableCell>
            </TableRow>
        ))}
        </TableBody>
    </Table>
    </ScrollArea>
  );
};
