'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getAdminUsers } from '@/lib/api';
import type { User } from '@/lib/api';
import { useLocale } from '@/app/components/LocaleContext';
import { t } from '@/lib/i18n';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TableShell, Table, TableHeadRow, TableBodyRow, Th, Td } from '@/components/ui/Table';

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const { locale } = useLocale();
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

  const fetchUsers = useCallback(() => {
    setLoading(true);
    setErr(null);
    getAdminUsers({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, search: debouncedSearch || undefined })
      .then(({ users: u, total: tot }) => {
        setUsers(u);
        setTotal(tot);
      })
      .catch((e) => setErr(e?.message || t(locale, 'admin.loadError')))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, locale]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-theme-fg mb-6">Users</h1>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Input
          type="search"
          placeholder="Search by email or name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="w-64"
        />
        <span className="text-sm text-theme-fg-muted">{total} total</span>
      </div>
      {err && (
        <div className="mb-4 rounded-lg border border-theme-danger/30 bg-theme-danger/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-theme-danger">{err}</span>
          <Button type="button" size="sm" onClick={() => fetchUsers()}>
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
                  <Th>Email</Th>
                  <Th>Name</Th>
                  <Th>Plan</Th>
                  <Th>Created</Th>
                  <Th>Admin</Th>
                  <Th></Th>
                </TableHeadRow>
              </thead>
              <tbody>
                {users.map((u) => (
                  <TableBodyRow key={u.id}>
                    <Td className="text-theme-fg">{u.email}</Td>
                    <Td className="text-theme-fg-muted">{u.full_name || '—'}</Td>
                    <Td className="text-theme-fg-muted">{u.plan || '—'}</Td>
                    <Td className="text-theme-fg-muted">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </Td>
                    <Td>{u.is_admin ? <Badge variant="accent" className="px-2 py-0.5 text-xs">Yes</Badge> : '—'}</Td>
                    <Td>
                      <Link href={`/admin/users/${u.id}`} className="text-theme-accent hover:underline">
                        View
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
