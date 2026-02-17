'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getAdminUser } from '@/lib/api';

export default function AdminUserDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<Awaited<ReturnType<typeof getAdminUser>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getAdminUser(id)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [id]);

  if (err) {
    return (
      <div>
        <Link href="/admin/users" className="text-theme-accent hover:underline mb-4 inline-block">Back to Users</Link>
        <div className="rounded-lg border border-theme-danger/30 bg-theme-danger/10 px-4 py-3 text-theme-danger">{err}</div>
      </div>
    );
  }
  if (!data) {
    return <p className="text-theme-fg-muted">Loading...</p>;
  }

  const { user, job_count, thread_count } = data;

  return (
    <div>
      <Link href="/admin/users" className="text-theme-accent hover:underline mb-4 inline-block">Back to Users</Link>
      <div className="rounded-xl border border-theme-border bg-theme-bg-subtle overflow-hidden">
        <div className="p-6 border-b border-theme-border">
          <h1 className="text-xl font-semibold text-theme-fg">{user.email}</h1>
          <p className="text-theme-fg-muted mt-1">{user.full_name || 'No name'}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <span><strong className="text-theme-fg">Jobs:</strong> {job_count}</span>
            <span><strong className="text-theme-fg">Threads:</strong> {thread_count}</span>
            {user.plan && <span><strong className="text-theme-fg">Plan:</strong> {user.plan}</span>}
            {user.is_admin && <span className="text-theme-accent">Admin</span>}
          </div>
          <p className="text-theme-fg-muted text-xs mt-2">
            Created {user.created_at ? new Date(user.created_at).toLocaleString() : '—'}
          </p>
        </div>
        <div className="p-4">
          <Link
            href={`/admin/jobs?user_id=${user.id}`}
            className="text-theme-accent hover:underline text-sm"
          >
            View this user jobs
          </Link>
        </div>
      </div>
    </div>
  );
}
