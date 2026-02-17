'use client';

import { useEffect, useState } from 'react';
import { getAdminStats } from '@/lib/api';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getAdminStats>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) {
    return (
      <div className="rounded-lg border border-theme-danger/30 bg-theme-danger/10 px-4 py-3 text-theme-danger">
        {err}
      </div>
    );
  }
  if (!stats) {
    return <p className="text-theme-fg-muted">Loading…</p>;
  }

  const cards = [
    { label: 'Total users', value: stats.total_users },
    { label: 'Total jobs', value: stats.total_jobs },
    { label: 'Jobs (24h)', value: stats.jobs_last_24h },
    { label: 'Completed', value: stats.jobs_completed },
    { label: 'Failed', value: stats.jobs_failed },
    { label: 'Threads', value: stats.total_threads },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-theme-fg mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {cards.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl border border-theme-border bg-theme-bg-subtle p-4"
          >
            <p className="text-sm text-theme-fg-muted mb-1">{label}</p>
            <p className="text-2xl font-semibold text-theme-fg">{value.toLocaleString()}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-theme-border bg-theme-bg-subtle p-4">
        <h2 className="text-lg font-medium text-theme-fg mb-3">Jobs by status</h2>
        <div className="flex flex-wrap gap-3">
          {Object.entries(stats.jobs_by_status).map(([status, count]) => (
            <span
              key={status}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-bg-hover text-theme-fg text-sm"
            >
              <span className="capitalize">{status}</span>
              <span className="font-medium">{count}</span>
            </span>
          ))}
          {Object.keys(stats.jobs_by_status).length === 0 && (
            <p className="text-theme-fg-muted text-sm">No data</p>
          )}
        </div>
      </div>
    </div>
  );
}
