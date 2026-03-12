import { supabase } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

/** Returns display URL for media. When url is relative (no http), uses /api/media proxy with token. Data URLs are returned as-is. */
export function getMediaDisplayUrl(url: string | null | undefined, token: string | null): string {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (!token) return url; // Will likely fail; caller should handle
  return `${API_URL}/api/media?key=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
}

const TOKEN_REFRESH_BUFFER_MS = 60_000; // refresh if expires in < 1 min
let refreshPromise: Promise<string | null> | null = null;

/** Returns a valid access token. Refreshes if expired or about to expire. Keeps session alive during concurrent job polling. */
export async function getToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1]));
    const exp = (payload.exp ?? 0) * 1000;
    if (Date.now() >= exp - TOKEN_REFRESH_BUFFER_MS) {
      refreshPromise ??= supabase.auth.refreshSession()
        .then(({ data: { session: s } }) => {
          refreshPromise = null;
          return s?.access_token ?? null;
        })
        .catch(() => {
          refreshPromise = null;
          return null;
        });
      return await refreshPromise;
    }
  } catch {
    // invalid JWT, return as-is
  }
  return session.access_token;
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
  is_admin?: boolean;
  created_at: string;
  updated_at?: string;
}

/** Admin access only for this account (id or email). Sidebar and /admin use this. */
const ADMIN_ALLOWED_ID = 'ea3f2db4-355d-44c0-9791-61ff93fbbb13';
const ADMIN_ALLOWED_EMAIL = 'moiseioan1195@gmail.com';

export function isAdminUser(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  return user.id === ADMIN_ALLOWED_ID || user.email === ADMIN_ALLOWED_EMAIL;
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

/** Send password reset email. User clicks link and lands on /auth/callback then /auth/set-password. */
export async function resetPasswordForEmail(email: string): Promise<{ error?: string }> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${origin}/auth/callback`,
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

export class ThreadActionError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'ThreadActionError';
  }
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
    const e = await res.json().catch(() => ({})) as { error?: string; message?: string };
    const code = e.error || 'failed';
    const msg = e.message || 'Failed';
    throw new ThreadActionError(msg, code);
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
  incognito?: boolean,
  attachmentContentTypes?: string[]
): Promise<{ job_id: string; thread_id?: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const body: { prompt: string; attachment_urls?: string[]; attachment_content_types?: string[]; thread_id?: string; incognito?: boolean } = { prompt };
  if (attachmentUrls?.length) {
    body.attachment_urls = attachmentUrls;
    if (attachmentContentTypes?.length) body.attachment_content_types = attachmentContentTypes;
  }
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

export interface PromptVariantsParams {
  type: 'image' | 'video';
  description: string;
  angle?: string;
  movement?: string;
}

export async function generatePromptVariants(params: PromptVariantsParams): Promise<{ prompts: string[]; error?: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/prompt-variants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      type: params.type,
      description: params.description,
      angle: params.angle || '',
      movement: params.movement || '',
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { prompts?: string[]; error?: string };
  if (!res.ok) throw new Error(data.error || 'Failed');
  return { prompts: data.prompts ?? [], error: data.error };
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

export interface CreateImageInpaintParams {
  prompt: string;
  imageUrl: string;
  maskUrl: string;
  steps?: number;
  guidance?: number;
}

export async function createImageInpaint(params: CreateImageInpaintParams): Promise<{ job_id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/image-inpaint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      prompt: params.prompt,
      image_url: params.imageUrl,
      mask_url: params.maskUrl,
      steps: params.steps,
      guidance: params.guidance,
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('rate');
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Failed');
  }
  return res.json();
}

export interface CreateVideoParams {
  prompt: string;
  threadId?: string;
  incognito?: boolean;
  image?: string;
  video?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: '720p' | '480p';
  /** "1" = default (grok), "2" = Kling (start_image, end_image) */
  videoModel?: '1' | '2';
  startImage?: string;
  endImage?: string;
}

export async function createVideo(params: CreateVideoParams): Promise<{ job_id: string; thread_id?: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    thread_id: params.threadId,
    incognito: params.incognito ?? false,
    duration: params.duration ?? 5,
    aspect_ratio: params.aspectRatio ?? '16:9',
    resolution: params.resolution ?? '720p',
    video_model: params.videoModel ?? '1',
  };
  if (params.videoModel === '2') {
    if (params.startImage) body.start_image = params.startImage;
    if (params.endImage) body.end_image = params.endImage;
  } else {
    if (params.image) body.image = params.image;
    if (params.video) body.video = params.video;
  }
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

export interface UpscaleAdvancedOptions {
  enhance_model?: string;
  output_format?: 'jpg' | 'png';
  face_enhancement?: boolean;
  subject_detection?: string;
  face_enhancement_creativity?: number;
  face_enhancement_strength?: number;
}

export async function createUpscale(
  imageUrl: string,
  scale: 2 | 4,
  options?: UpscaleAdvancedOptions
): Promise<{ job_id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const body: Record<string, unknown> = { image_url: imageUrl, scale };
  if (options?.enhance_model) body.enhance_model = options.enhance_model;
  if (options?.output_format) body.output_format = options.output_format;
  if (options?.face_enhancement !== undefined) body.face_enhancement = options.face_enhancement;
  if (options?.subject_detection) body.subject_detection = options.subject_detection;
  if (options?.face_enhancement_creativity !== undefined) body.face_enhancement_creativity = options.face_enhancement_creativity;
  if (options?.face_enhancement_strength !== undefined) body.face_enhancement_strength = options.face_enhancement_strength;
  const res = await fetch(`${API_URL}/api/upscale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Upscale failed');
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
  replicate_id?: string | null;
  rating?: 'like' | 'dislike' | null;
  created_at: string;
  updated_at: string;
}

/** Salvează feedback (like/dislike) pentru un job – stocat în DB pentru analiză. */
export async function cancelJob(jobId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/jobs/${jobId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Cancel failed');
  }
}

export async function retryJob(jobId: string): Promise<{ job_id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/jobs/${jobId}/retry`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Retry failed');
  }
  return res.json();
}

export async function setJobFeedback(jobId: string, rating: 'like' | 'dislike' | null): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/jobs/${jobId}/feedback`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rating: rating ?? null }),
  });
  if (!res.ok) throw new Error('Failed to save feedback');
}

// --- Admin (requires is_admin) ---
export interface AdminStats {
  total_users: number;
  total_jobs: number;
  jobs_by_status: Record<string, number>;
  jobs_last_24h: number;
  jobs_completed: number;
  jobs_failed: number;
  total_threads: number;
}
export async function getAdminStats(): Promise<AdminStats> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403) throw new Error('Forbidden');
  if (!res.ok) throw new Error('Failed to load stats');
  return res.json();
}
export async function getAdminUsers(params: { limit?: number; offset?: number; search?: string }): Promise<{ users: User[]; total: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const sp = new URLSearchParams();
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.offset) sp.set('offset', String(params.offset));
  if (params.search?.trim()) sp.set('search', params.search.trim());
  const url = `${API_URL}/api/admin/users${sp.toString() ? `?${sp}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403) throw new Error('Forbidden');
  if (!res.ok) throw new Error('Failed to load users');
  return res.json();
}
export async function getAdminUser(id: string): Promise<{ user: User; job_count: number; thread_count: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/admin/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403) throw new Error('Forbidden');
  if (!res.ok) throw new Error('Failed to load user');
  return res.json();
}
export interface AdminJob extends Job {
  user_email: string;
}
export async function getAdminJobs(params: { limit?: number; offset?: number; status?: string; type?: string; user_id?: string }): Promise<{ jobs: AdminJob[]; total: number }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const sp = new URLSearchParams();
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.offset) sp.set('offset', String(params.offset));
  if (params.status) sp.set('status', params.status);
  if (params.type) sp.set('type', params.type);
  if (params.user_id) sp.set('user_id', params.user_id);
  const url = `${API_URL}/api/admin/jobs${sp.toString() ? `?${sp}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403) throw new Error('Forbidden');
  if (!res.ok) throw new Error('Failed to load jobs');
  return res.json();
}

export async function listJobs(cacheBust?: boolean): Promise<{ jobs: Job[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const url = cacheBust ? `${API_URL}/api/jobs?_=${Date.now()}` : `${API_URL}/api/jobs`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: cacheBust ? 'no-store' : 'default',
  });
  if (!res.ok) throw new Error('Failed to load jobs');
  return res.json();
}

export interface ListContentParams {
  page?: number;
  limit?: number;
  type?: 'image' | 'video' | 'logo' | '';
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
  if (res.status === 401) throw new Error('session_expired');
  if (!res.ok) throw new Error('Failed to load content');
  return res.json();
}

/** Export a URL (e.g. current project image) to My Collection. Creates a completed job so it appears in content. */
export async function exportToCollection(url: string, type: 'image' | 'video'): Promise<{ job_id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/content/from-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url, type }),
  });
  if (res.status === 401) throw new Error('session_expired');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body?.error ?? 'Failed to export to collection');
  }
  return res.json();
}

/** Returns job or null if not found / error. Never throws - caller can show "not found" + retry. */
export async function getJob(id: string): Promise<Job | null> {
  try {
    const token = await getToken();
    if (!token) return null;
    const res = await fetch(`${API_URL}/api/jobs/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/** SSE stream URL for a job (for EventSource). Append token via query for auth. */
export function getJobStreamUrl(jobId: string, token: string | null): string {
  if (!token) return '';
  return `${API_URL}/api/jobs/${jobId}/stream?token=${encodeURIComponent(token)}`;
}

// --- Edit Studio (projects) ---

export interface Project {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

export interface ProjectItem {
  id: string;
  project_id: string;
  type: 'image' | 'video';
  source_url: string;
  job_id?: string;
  sort_order: number;
  created_at: string;
  latest_url?: string;
  version_num?: number;
}

export interface ProjectVersion {
  id: string;
  item_id: string;
  version_num: number;
  url: string;
  created_at: string;
}

export async function listProjects(limit?: number): Promise<{ projects: Project[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const sp = new URLSearchParams();
  if (limit) sp.set('limit', String(limit));
  sp.set('_', String(Date.now()));
  const res = await fetch(`${API_URL}/api/projects?${sp}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401) throw new Error('session_expired');
  if (!res.ok) throw new Error('Failed to load projects');
  return res.json();
}

export async function createProject(name?: string): Promise<{ id: string; name: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: name || 'Untitled' }),
  });
  if (res.status === 401) throw new Error('session_expired');
  if (res.status === 409) throw new Error('name_exists');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body?.error || `Failed to create project (${res.status})`);
  }
  return res.json();
}

export async function getProject(id: string): Promise<{ project: Project; items: ProjectItem[] }> {
  let token = await getToken();
  if (!token) {
    await new Promise((r) => setTimeout(r, 300));
    token = await getToken();
  }
  if (!token) throw new Error('Not logged in');
  const doFetch = () => {
    const url = `${API_URL}/api/projects/${id}?_=${Date.now()}`;
    return fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
    });
  };
  let res = await doFetch();
  if (res.status === 401) throw new Error('session_expired');
  if (res.status === 404) {
    await new Promise((r) => setTimeout(r, 400));
    res = await doFetch();
  }
  if (!res.ok) {
    if (process.env.NODE_ENV === 'development') {
      if (process.env.NODE_ENV === 'development') console.warn('[getProject]', res.status, `${API_URL}/api/projects/${id}`);
    }
    throw new Error('Project not found');
  }
  return res.json();
}

export async function updateProject(id: string, name: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  if (res.status === 401) throw new Error('session_expired');
  if (res.status === 409) throw new Error('name_exists');
  if (!res.ok) throw new Error('Failed to update project');
}

export async function deleteProject(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/projects/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('session_expired');
  if (!res.ok) throw new Error('Failed to delete project');
}

export async function addProjectItem(projectId: string, type: 'image' | 'video', sourceUrl: string, jobId?: string): Promise<{ id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/projects/${projectId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type, source_url: sourceUrl, job_id: jobId || undefined }),
  });
  if (res.status === 401) throw new Error('session_expired');
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err?.error || `Failed to add item (${res.status})`);
  }
  return res.json();
}

export async function removeProjectItem(itemId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/projects/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('session_expired');
  if (!res.ok) throw new Error('Failed to remove item');
}

/** List versions for a project item (v1, v2, …). Does not include “Original” (use item.source_url). */
export async function listProjectVersions(itemId: string): Promise<{ versions: ProjectVersion[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/projects/items/${itemId}/versions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('session_expired');
  if (!res.ok) throw new Error('Failed to load versions');
  return res.json();
}

/** Delete one version of a project item (versionNum 1, 2, …). Cannot delete Original. */
export async function removeProjectVersion(itemId: string, versionNum: number): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/projects/items/${itemId}/versions/${versionNum}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('session_expired');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body?.error ?? 'Failed to remove version');
  }
}

/** Upload file to project (image/video from device). Returns full item for optimistic UI. */
export async function uploadProjectItem(projectId: string, file: File): Promise<{ id: string; item: ProjectItem }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/projects/${projectId}/items/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => ({})) as { id?: string; item?: ProjectItem; error?: string };
  if (res.status === 401) throw new Error('session_expired');
  if (!res.ok) throw new Error(body?.error || 'Upload failed');
  if (!body.item) throw new Error('Upload failed');
  return { id: body.id!, item: body.item };
}

/** Add a new version by URL (e.g. after AI edit job completes). URL must be https. */
export async function addProjectVersionByUrl(itemId: string, url: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/projects/items/${itemId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  });
  if (res.status === 401) throw new Error('session_expired');
  if (!res.ok) throw new Error('Failed to add version');
}

/** Upload file as new version of project item. One request: upload + add version. */
export async function uploadProjectVersion(itemId: string, file: File): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/projects/items/${itemId}/versions/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
}

/** Remove background from project item image. Creates a new version (PNG with transparency). Long timeout (120s) – Replicate can take 30–60s. */
// ===== Business Zone =====

export interface UserFile {
  id: string;
  user_id: string;
  name: string;
  content: string;
  file_type: 'seo' | 'text';
  created_at: string;
  updated_at: string;
}

export async function createSEOJob(params: {
  source_text?: string;
  source_url?: string;
  title?: string;
  language?: string;
  /** 'markdown' = article only, 'html' = HTML only, 'both' = article + HTML */
  output_format?: 'markdown' | 'html' | 'both';
}): Promise<{ job_id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/seo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'SEO failed');
  }
  return res.json();
}

export async function listFiles(): Promise<{ files: UserFile[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/files`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('List files failed');
  return res.json();
}

export async function getFile(id: string): Promise<UserFile> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/files/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('File not found');
  return res.json();
}

export async function renameFile(id: string, name: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  await fetch(`${API_URL}/api/files/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
}

export async function createOutlineJob(params: {
  topic: string;
  audience?: string;
  language?: string;
  word_count?: string;
}): Promise<{ job_id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/outline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Outline failed');
  }
  return res.json();
}

export async function createLogoJob(params: {
  prompt: string;
  logo_text?: string;
  logo_type?: string;
  style?: string;
  primary_color?: string;
  secondary_color?: string;
  aspect_ratio?: string;
  output_format?: 'png' | 'jpg';
}): Promise<{ job_id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/logo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      prompt: params.prompt.trim(),
      logo_text: params.logo_text?.trim() || '',
      logo_type: params.logo_type?.trim() || '',
      style: params.style?.trim() || '',
      primary_color: params.primary_color?.trim() || '',
      secondary_color: params.secondary_color?.trim() || '',
      aspect_ratio: params.aspect_ratio || '1:1',
      output_format: params.output_format || 'png',
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Logo creation failed');
  }
  return res.json();
}

export async function createTranslateJob(params: {
  source_url?: string;
  source_text?: string;
  source_lang?: string;
  target_lang: string;
  project_id?: string;
  item_id?: string;
}): Promise<{ job_id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Translation failed');
  }
  return res.json();
}

export interface TranslationProject {
  id: string;
  user_id: string;
  name: string;
  source_lang: string;
  target_lang: string;
  created_at: string;
  updated_at: string;
}

export interface TranslationItem {
  id: string;
  project_id: string;
  source_type: 'url' | 'text';
  source_value: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result_text?: string | null;
  error_message?: string | null;
  job_id?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function listTranslationProjects(): Promise<{ projects: TranslationProject[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/translation-projects`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Failed to list projects');
  return res.json();
}

export async function createTranslationProject(params: { name: string; source_lang?: string; target_lang?: string }): Promise<{ id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/translation-projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Failed to create project');
  }
  return res.json();
}

export async function getTranslationProject(id: string): Promise<{ project: TranslationProject; items: TranslationItem[] }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/translation-projects/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Project not found');
  return res.json();
}

export async function addTranslationItem(projectId: string, params: { source_type: 'url' | 'text'; source_value: string }): Promise<{ id: string }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/translation-projects/${projectId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error || 'Failed to add item');
  }
  return res.json();
}

export async function deleteTranslationItem(itemId: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const res = await fetch(`${API_URL}/api/translation-projects/items/${itemId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Failed to delete item');
}

export async function deleteFile(id: string): Promise<void> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  await fetch(`${API_URL}/api/files/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

export function getFileDownloadUrl(id: string, token: string): string {
  return `${API_URL}/api/files/${id}?download=1&token=${encodeURIComponent(token)}`;
}

export async function removeProjectItemBackground(projectId: string, itemId: string): Promise<{ url: string; ok: boolean }> {
  const token = await getToken();
  if (!token) throw new Error('Not logged in');
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/items/${itemId}/remove-bg`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({})) as { url?: string; ok?: boolean; error?: string };
    if (res.status === 401) throw new Error('session_expired');
    if (!res.ok) throw new Error(body?.error || 'Remove background failed');
    return { url: body.url ?? '', ok: body.ok === true };
  } finally {
    clearTimeout(t);
  }
}
