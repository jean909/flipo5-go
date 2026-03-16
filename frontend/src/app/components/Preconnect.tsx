'use client';

import { useEffect } from 'react';

/**
 * Injects preconnect hints for API and Supabase so the first request is faster
 * (DNS + TCP + TLS ready). Runs once on mount; safe to mount in root layout.
 */
export function Preconnect() {
  useEffect(() => {
    const origins: string[] = [];
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      origins.push(new URL(apiUrl).origin);
    } catch {}
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl) origins.push(new URL(supabaseUrl).origin);
    } catch {}

    origins.forEach((origin) => {
      if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = origin;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
  }, []);
  return null;
}
