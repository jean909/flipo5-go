import { supabase } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export async function getToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/** Download media via backend proxy (avoids CORS, forces attachment). */
export async function downloadMediaUrl(imageUrl: string): Promise<Blob> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/download?url=${encodeURIComponent(imageUrl)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Download failed');
  return res.blob();
}

/** Call after login so backend syncs user to users table (GET /api/me). Returns true if sync succeeded. */
export async function syncMe(): Promise<boolean> {
  const token = await getToken();
  if (!token) return false;
  const res = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
  return res.ok;
}

export interface AIConfiguration {
  style?: string;
  primary_language?: string;
  user_details?: string;
}

export interface User {
  id: string;
  email: string;
  full_name?: string;
  where_heard?: string;
  use_case?: string;
  plan?: string;
  data_retention_accepted?: boolean | null;
  ai_configuration?: AIConfiguration | null;
  ai_config_updated_at?: string | null;
  created_at: string;
  updated_at?: string;
}

/** Get current user. Returns null if not logged in or request fails. */
export async function getMe(): Promise<User | null> {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return res.json();
}

/** Check if email is registered (Supabase Auth). Public endpoint. */
export async function checkEmail(email: string): Promise<{ exists: boolean }> {
  const res = await fetch(`${API_URL}/api/check-email?email=${encodeURIComponent(email.trim())}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { reason?: string }).reason ?? (body as { error?: string }).error ?? 'Check failed';
    throw new Error(msg);
  }
  return body as { exists: boolean };
}

export async function signInWithPassword(email: string, password: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return { error: error?.message };
}

export async function signUpWithPassword(email: string, password: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback` },
  });
  return { error: error?.message };
}

/** Update profile and plan (onboarding). Requires auth. */
export async function updateProfile(profile: {
  full_name?: string;
  where_heard?: string;
  use_case?: string;
  plan?: string;
}): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Update failed');
  }
}

/** Update settings (data retention, AI config). AI config can change once per 24h. */
export async function updateSettings(settings: {
  data_retention_accepted?: boolean;
  ai_configuration?: Partial<AIConfiguration>;
}): Promise<User> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(settings),
  });
  const e = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429 || (e as { error?: string }).error === 'ai_config_cooldown') {
      throw new Error('ai_config_cooldown');
    }
    throw new Error((e as { error?: string }).error || 'Update failed');
  }
  return e as User;
}

/** Magic link – e.g. for login from different IP / recovery. */
export async function signInWithMagicLink(email: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
  return { error: error?.message };
}

/** Upload files (e.g. images) to R2. Returns public URLs. */
export async function uploadAttachments(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Upload failed');
  }
  const data = (await res.json()) as { urls?: string[] };
  return data.urls ?? [];
}

export interface Thread {
  id: string;
  user_id: string;
  title?: string;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export async function listThreads(archived?: boolean): Promise<{ threads: Thread[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const url = archived ? `${API_URL}/api/threads?archived=true` : `${API_URL}/api/threads`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Failed to load sessions');
  return res.json();
}

export async function patchThread(threadId: string, action: 'archive' | 'unarchive' | 'delete'): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Failed');
  }
}

export async function getThread(id: string): Promise<{ thread: Thread; jobs: Job[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/threads/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Session not found');
  return res.json();
}

export async function createChat(
  prompt: string,
  attachmentUrls?: string[],
  threadId?: string,
  incognito?: boolean
): Promise<{ job_id: string; thread_id?: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const body: { prompt: string; attachment_urls?: string[]; thread_id?: string; incognito?: boolean } = { prompt };
  if (attachmentUrls?.length) body.attachment_urls = attachmentUrls;
  if (threadId) body.thread_id = threadId;
  if (incognito) body.incognito = true;
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('rate');
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Failed');
  }
  return res.json();
}

export interface CreateImageParams {
  prompt: string;
  threadId?: string;
  incognito?: boolean;
  size?: '2K' | '4K' | 'HD';
  aspectRatio?: string;
  imageInput?: string[];
  maxImages?: number;
}

export async function createImage(params: CreateImageParams | string, threadId?: string): Promise<{ job_id: string; thread_id?: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const body: Record<string, unknown> =
    typeof params === 'string'
      ? { prompt: params, thread_id: threadId, size: '2K', aspect_ratio: 'match_input_image', max_images: 4, sequential_image_generation: 'auto' }
      : {
          prompt: params.prompt,
          thread_id: params.threadId,
          incognito: params.incognito,
          size: params.size ?? '2K',
          aspect_ratio: params.aspectRatio ?? 'match_input_image',
          image_input: params.imageInput?.length ? params.imageInput : undefined,
          max_images: params.maxImages ?? 4,
          sequential_image_generation: 'auto',
        };
  const res = await fetch(`${API_URL}/api/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('rate');
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Failed');
  }
  return res.json();
}

export async function createVideo(prompt: string, threadId?: string, incognito?: boolean): Promise<{ job_id: string; thread_id?: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const body: { prompt: string; thread_id?: string; incognito?: boolean } = { prompt };
  if (threadId) body.thread_id = threadId;
  if (incognito) body.incognito = true;
  const res = await fetch(`${API_URL}/api/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('rate');
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Failed');
  }
  return res.json();
}

export interface Job {
  id: string;
  user_id: string;
  thread_id?: string | null;
  type: string;
  status: string;
  name?: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  cost_cents: number;
  created_at: string;
  updated_at: string;
}

export async function listJobs(): Promise<{ jobs: Job[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/jobs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to load jobs');
  return res.json();
}

export interface ListContentParams {
  page?: number;
  limit?: number;
  type?: 'image' | 'video' | '';
  q?: string;
}

export async function listContent(params: ListContentParams = {}): Promise<{
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
}> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const sp = new URLSearchParams();
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.type) sp.set('type', params.type);
  if (params.q?.trim()) sp.set('q', params.q.trim());
  const url = `${API_URL}/api/content${sp.toString() ? `?${sp}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Failed to load content');
  return res.json();
}

/** Returns job or null if 404 (e.g. stale id). Throws on other errors. */
export async function getJob(id: string): Promise<Job | null> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/jobs/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Job not found');
  return res.json();
}

/** SSE stream URL for a job (for EventSource). Append token via query for auth. */
export function getJobStreamUrl(jobId: string, token: string | null): string {
  if (!token) return '';
  return `${API_URL}/api/jobs/${jobId}/stream?token=${encodeURIComponent(token)}`;
}
