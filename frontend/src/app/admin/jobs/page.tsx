'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getAdminJobs, type AdminJob } from '@/lib/api';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TableShell, Table, TableHeadRow, TableBodyRow, Th, Td } from '@/components/ui/Table';

const PAGE_SIZE = 30;

export default function AdminJobsPage() {
  const { locale } = useLocale();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [type, setType] = useState(searchParams.get('type') || '');
  const [userId, setUserId] = useState(searchParams.get('user_id') || '');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchJobs = useCallback(() => {
    setLoading(true);
    setErr(null);
    getAdminJobs({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      status: status || undefined,
      type: type || undefined,
      user_id: userId || undefined,
    })
      .then(({ jobs: j, total: tot }) => {
        setJobs(j);
        setTotal(tot);
      })
      .catch((e) => setErr(e?.message || t(locale, 'admin.loadError')))
      .finally(() => setLoading(false));
  }, [page, status, type, userId, locale]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-theme-fg mb-6">Jobs</h1>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          type="text"
          placeholder="User ID"
          value={userId}
          onChange={(e) => { setUserId(e.target.value); setPage(0); }}
          className="w-48"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg focus:outline-none focus:ring-2 focus:ring-theme-accent"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg focus:outline-none focus:ring-2 focus:ring-theme-accent"
        >
          <option value="">All types</option>
          <option value="chat">Chat</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
        <span className="text-sm text-theme-fg-muted">{total} total</span>
      </div>
      {err && (
        <div className="mb-4 rounded-lg border border-theme-danger/30 bg-theme-danger/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-theme-danger">{err}</span>
          <Button type="button" size="sm" onClick={() => fetchJobs()}>
            {t(locale, 'admin.retry')}
          </Button>
        </div>
      )}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-theme-fg-muted">Loading...</div>
        ) : (
          <TableShell>
            <Table>
              <thead>
                <TableHeadRow>
                  <Th>ID</Th>
                  <Th>User</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th>Rating</Th>
                  <Th>Created</Th>
                  <Th></Th>
                </TableHeadRow>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <TableBodyRow key={j.id}>
                    <Td className="font-mono text-xs text-theme-fg-muted">{j.id.slice(0, 8)}…</Td>
                    <Td>
                      <Link href={`/admin/users/${j.user_id}`} className="text-theme-accent hover:underline">
                        {j.user_email}
                      </Link>
                    </Td>
                    <Td className="text-theme-fg-muted capitalize">{j.type}</Td>
                    <Td>
                      <span className={`capitalize ${j.status === 'failed' ? 'text-theme-danger' : j.status === 'completed' ? 'text-theme-success' : ''}`}>
                        {j.status}
                      </span>
                    </Td>
                    <Td className="text-theme-fg-muted">{j.rating || '—'}</Td>
                    <Td className="text-theme-fg-muted">
                      {j.created_at ? new Date(j.created_at).toLocaleString() : '—'}
                    </Td>
                    <Td>
                      <Link href={`/dashboard/jobs/${j.id}`} target="_blank" rel="noopener noreferrer" className="text-theme-accent hover:underline text-xs">
                        Open
                      </Link>
                    </Td>
                  </TableBodyRow>
                ))}
              </tbody>
            </Table>
          </TableShell>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-theme-border">
            <Button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              size="sm"
            >
              Previous
            </Button>
            <span className="text-theme-fg-muted text-sm">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              size="sm"
            >
              Next
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
