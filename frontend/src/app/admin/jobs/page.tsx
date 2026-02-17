'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getAdminJobs, type AdminJob } from '@/lib/api';

const PAGE_SIZE = 30;

export default function AdminJobsPage() {
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [type, setType] = useState(searchParams.get('type') || '');
  const [userId, setUserId] = useState(searchParams.get('user_id') || '');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
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
        setErr(null);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [page, status, type, userId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-theme-fg mb-6">Jobs</h1>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="User ID"
          value={userId}
          onChange={(e) => { setUserId(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg placeholder:text-theme-fg-subtle focus:outline-none focus:ring-2 focus:ring-theme-accent w-48 text-sm"
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
        <div className="mb-4 rounded-lg border border-theme-danger/30 bg-theme-danger/10 px-4 py-3 text-theme-danger">
          {err}
        </div>
      )}
      <div className="rounded-xl border border-theme-border bg-theme-bg-subtle overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-theme-fg-muted">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-theme-border bg-theme-bg-hover">
                  <th className="px-4 py-3 font-medium text-theme-fg">ID</th>
                  <th className="px-4 py-3 font-medium text-theme-fg">User</th>
                  <th className="px-4 py-3 font-medium text-theme-fg">Type</th>
                  <th className="px-4 py-3 font-medium text-theme-fg">Status</th>
                  <th className="px-4 py-3 font-medium text-theme-fg">Rating</th>
                  <th className="px-4 py-3 font-medium text-theme-fg">Created</th>
                  <th className="px-4 py-3 font-medium text-theme-fg"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b border-theme-border-subtle hover:bg-theme-bg-hover/50">
                    <td className="px-4 py-3 font-mono text-xs text-theme-fg-muted">{j.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${j.user_id}`} className="text-theme-accent hover:underline">
                        {j.user_email}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-theme-fg-muted capitalize">{j.type}</td>
                    <td className="px-4 py-3">
                      <span className={`capitalize ${j.status === 'failed' ? 'text-theme-danger' : j.status === 'completed' ? 'text-theme-success' : ''}`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-theme-fg-muted">{j.rating || '—'}</td>
                    <td className="px-4 py-3 text-theme-fg-muted">
                      {j.created_at ? new Date(j.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/jobs/${j.id}`} target="_blank" rel="noopener noreferrer" className="text-theme-accent hover:underline text-xs">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-theme-border">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-theme-fg-muted text-sm">
              Page {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg-hover text-theme-fg disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
