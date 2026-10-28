import { SecurityAuditEvent } from '../../src/types/index.ts';

const auditLogs: SecurityAuditEvent[] = [];

/**
 * Redacts sensitive tokens, passwords, and source code fragments from text
 */
export function sanitizeLogDetails(text: string): string {
  if (!text) return '';
  return text
    .replace(/(password|token|secret|key|authorization)=([^\s&]+)/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(function\s*\(.*?\)|local\s+\w+\s*=)/g, '[CODE_REDACTED]');
}

export function logAuditEvent(
  event: Omit<SecurityAuditEvent, 'id' | 'timestamp'>
): SecurityAuditEvent {
  const auditEvent: SecurityAuditEvent = {
    id: 'audit_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36),
    timestamp: new Date().toISOString(),
    userId: event.userId,
    username: event.username,
    ipAddress: event.ipAddress || '127.0.0.1',
    action: event.action,
    category: event.category,
    status: event.status,
    details: sanitizeLogDetails(event.details),
  };

  auditLogs.unshift(auditEvent);

  // Keep latest 1000 events in memory
  if (auditLogs.length > 1000) {
    auditLogs.pop();
  }

  // Structured safe stdout output (no raw code or secrets)
  const safeLog = `[SECURITY_AUDIT] [${auditEvent.category.toUpperCase()}] status=${auditEvent.status} action="${auditEvent.action}" user="${auditEvent.username || 'anon'}" ip=${auditEvent.ipAddress} details="${auditEvent.details}"`;
  console.log(safeLog);

  return auditEvent;
}

export function getAuditLogs(): SecurityAuditEvent[] {
  return [...auditLogs];
}
