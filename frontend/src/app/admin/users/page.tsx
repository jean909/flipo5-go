'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAdminUsers } from '@/lib/api';
import type { User } from '@/lib/api';

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    getAdminUsers({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, search: debouncedSearch || undefined })
      .then(({ users: u, total: tot }) => {
        setUsers(u);
        setTotal(tot);
        setErr(null);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-theme-fg mb-6">Users</h1>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input
          type="search"
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="px-3 py-2 rounded-lg border border-theme-border bg-theme-bg-subtle text-theme-fg placeholder:text-theme-fg-subtle focus:outline-none focus:ring-2 focus:ring-theme-accent w-64"
        />
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
                  <th className="px-4 py-3 font-medium text-theme-fg">Email</th>
                  <th className="px-4 py-3 font-medium text-theme-fg">Name</th>
                  <th className="px-4 py-3 font-medium text-theme-fg">Plan</th>
                  <th className="px-4 py-3 font-medium text-theme-fg">Created</th>
                  <th className="px-4 py-3 font-medium text-theme-fg">Admin</th>
                  <th className="px-4 py-3 font-medium text-theme-fg"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-theme-border-subtle hover:bg-theme-bg-hover/50">
                    <td className="px-4 py-3 text-theme-fg">{u.email}</td>
                    <td className="px-4 py-3 text-theme-fg-muted">{u.full_name || '—'}</td>
                    <td className="px-4 py-3 text-theme-fg-muted">{u.plan || '—'}</td>
                    <td className="px-4 py-3 text-theme-fg-muted">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">{u.is_admin ? <span className="text-theme-accent">Yes</span> : '—'}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.id}`} className="text-theme-accent hover:underline">
                        View
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
