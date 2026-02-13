'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type OptimisticJob = { id: string; type: 'image' | 'video'; thread_id?: string | null };

const JobsInProgressContext = createContext<{
  optimisticJobs: OptimisticJob[];
  addOptimisticJob: (job: OptimisticJob) => void;
  removeOptimisticJob: (id: string) => void;
} | null>(null);

export function JobsInProgressProvider({ children }: { children: ReactNode }) {
  const [optimisticJobs, setOptimisticJobs] = useState<OptimisticJob[]>([]);

  const addOptimisticJob = useCallback((job: OptimisticJob) => {
    setOptimisticJobs((prev) => (prev.some((j) => j.id === job.id) ? prev : [...prev, job]));
  }, []);

  const removeOptimisticJob = useCallback((id: string) => {
    setOptimisticJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  return (
    <JobsInProgressContext.Provider value={{ optimisticJobs, addOptimisticJob, removeOptimisticJob }}>
      {children}
    </JobsInProgressContext.Provider>
  );
}

export function useJobsInProgress() {
  const ctx = useContext(JobsInProgressContext);
  return ctx ?? {
    optimisticJobs: [],
    addOptimisticJob: () => {},
    removeOptimisticJob: () => {},
  };
}
