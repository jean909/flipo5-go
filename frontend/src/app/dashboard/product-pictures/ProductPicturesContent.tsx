'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocale } from '@/app/components/LocaleContext';
import { useToast } from '@/app/components/ToastContext';
import { t } from '@/lib/i18n';
import {
  uploadAttachments,
  getToken,
  getMediaDisplayUrl,
  createProduct,
  updateProduct,
  listProducts,
  getProduct,
  addProductPhotos,
  deleteProductPhoto,
  deleteProduct,
  createProductScoreJob,
  createProductDescriptionImproveJob,
  createProductSceneImproveJob,
  createImage,
  getJob,
  createJobShare,
  fetchBlobForJobRef,
  type Product,
  type ProductPhoto,
  type Job,
} from '@/lib/api';
import { getOutputUrls } from '@/lib/jobOutput';
import { zipBlobsAndDownload, zipEntryName } from '@/lib/zipExport';

const MIN_AVG_SCORE = 5;
const MIN_DESCRIPTION_LENGTH_FOR_IMPROVE = 15;
const MIN_SCENE_LENGTH_FOR_IMPROVE = 10;

const CATEGORY_OPTIONS = [
  { value: '', labelKey: 'productPictures.categoryNone' as const },
  { value: 'electronics', labelKey: 'productPictures.categoryElectronics' as const },
  { value: 'fashion', labelKey: 'productPictures.categoryFashion' as const },
  { value: 'home', labelKey: 'productPictures.categoryHome' as const },
  { value: 'food', labelKey: 'productPictures.categoryFood' as const },
  { value: 'sports', labelKey: 'productPictures.categorySports' as const },
  { value: 'beauty', labelKey: 'productPictures.categoryBeauty' as const },
  { value: 'other', labelKey: 'productPictures.categoryOther' as const },
] as const;

const SCENE_TEMPLATES = [
  { labelKey: 'productPictures.sceneWhite' as const, prompt: 'product on pure white background, studio lighting, e-commerce style' },
  { labelKey: 'productPictures.sceneLiving' as const, prompt: 'product in a modern living room, natural daylight, lifestyle shot' },
  { labelKey: 'productPictures.sceneMinimal' as const, prompt: 'product on minimalist light gray background, soft shadows, clean product shot' },
  { labelKey: 'productPictures.sceneMarble' as const, prompt: 'product on white marble surface, luxury feel, soft reflections' },
  { labelKey: 'productPictures.sceneWood' as const, prompt: 'product on wooden table, warm natural light, cozy atmosphere' },
  { labelKey: 'productPictures.sceneOutdoor' as const, prompt: 'product outdoors in nature, soft daylight, greenery in background' },
  { labelKey: 'productPictures.sceneFlatlay' as const, prompt: 'product in flat lay composition, top-down view, styled with complementary objects' },
  { labelKey: 'productPictures.sceneGradient' as const, prompt: 'product on soft gradient background, modern and clean, professional lighting' },
];

const CATEGORY_LABEL_BY_VALUE: Record<string, (typeof CATEGORY_OPTIONS)[number]['labelKey']> = CATEGORY_OPTIONS
  .filter((opt) => opt.value)
  .reduce((acc, opt) => {
    acc[opt.value] = opt.labelKey;
    return acc;
  }, {} as Record<string, (typeof CATEGORY_OPTIONS)[number]['labelKey']>);

function averageScore(photos: ProductPhoto[]): number | null {
  const withScore = photos.filter((p) => p.score != null);
  if (withScore.length === 0) return null;
  const sum = withScore.reduce((a, p) => a + (p.score ?? 0), 0);
  return sum / withScore.length;
}

export default function ProductPicturesContent() {
  const { locale } = useLocale();
  const { showToast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productBrand, setProductBrand] = useState('');
  const [productId, setProductId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [photos, setPhotos] = useState<ProductPhoto[]>([]);
  const [generatedJobs, setGeneratedJobs] = useState<Job[]>([]);
  const [mediaToken, setMediaToken] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scoreJobId, setScoreJobId] = useState<string | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generatedUrls, setGeneratedUrls] = useState<string[]>([]);
  const [shareJobId, setShareJobId] = useState<string | null>(null);
  const [selectedGenerated, setSelectedGenerated] = useState<Set<number>>(() => new Set());
  const [exportGenBusy, setExportGenBusy] = useState(false);
  const [error, setError] = useState('');
  const [improveDialogOpen, setImproveDialogOpen] = useState(false);
  const [improveProductUrl, setImproveProductUrl] = useState('');
  const [improveJobId, setImproveJobId] = useState<string | null>(null);
  const [improveLoading, setImproveLoading] = useState(false);
  const [sceneImproveDialogOpen, setSceneImproveDialogOpen] = useState(false);
  const [sceneImproveJobId, setSceneImproveJobId] = useState<string | null>(null);
  const [sceneImproveLoading, setSceneImproveLoading] = useState(false);
  const [suggestedScenes, setSuggestedScenes] = useState<string[]>([]);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductName, setEditingProductName] = useState('');
  const [editingProductCategory, setEditingProductCategory] = useState('');
  const [editingProductDescription, setEditingProductDescription] = useState('');
  const [editingProductBrand, setEditingProductBrand] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [categoryMenuOpen, setCategoryMenuOpen] = useState<'create' | 'edit' | null>(null);

  useEffect(() => {
    getToken().then(setMediaToken);
  }, []);

  const loadProducts = useCallback(() => {
    listProducts().then((r) => setProducts(r.products ?? [])).catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const loadProduct = useCallback((id: string) => {
    getProduct(id).then((r) => {
      setProduct(r.product);
      setPhotos(r.photos ?? []);
      setGeneratedJobs(r.generated_jobs ?? []);
      setSuggestedScenes(r.suggested_scenes ?? []);
    }).catch(() => {
      setProduct(null);
      setPhotos([]);
      setGeneratedJobs([]);
      setSuggestedScenes([]);
    });
  }, []);

  useEffect(() => {
    if (!productId) return;
    setSuggestedScenes([]);
    loadProduct(productId);
  }, [productId, loadProduct]);

  const handleCreateProduct = async () => {
    const name = productName.trim();
    if (!name) return;
    setError('');
    try {
      const { id } = await createProduct({
        name,
        category: productCategory.trim() || undefined,
        description: productDescription.trim() || undefined,
        brand: productBrand.trim() || undefined,
      });
      setProductId(id);
      setProduct({
        id,
        user_id: '',
        name,
        category: productCategory.trim() || undefined,
        description: productDescription.trim() || undefined,
        brand: productBrand.trim() || undefined,
        created_at: '',
        updated_at: '',
      });
      setPhotos([]);
      setGeneratedJobs([]);
      setStep(2);
      loadProducts();
      showToast('toast.created');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleSelectProduct = (id: string) => {
    setProductId(id);
    setStep(2);
  };

  const handleOpenEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setEditingProductName(p.name ?? '');
    setEditingProductCategory(p.category ?? '');
    setEditingProductDescription(p.description ?? '');
    setEditingProductBrand(p.brand ?? '');
    setError('');
  };

  const handleSaveEditProduct = async () => {
    if (!editingProductId) return;
    const name = editingProductName.trim();
    if (!name) return;
    setError('');
    try {
      await updateProduct(editingProductId, {
        name,
        category: editingProductCategory.trim() || undefined,
        description: editingProductDescription.trim() || undefined,
        brand: editingProductBrand.trim() || undefined,
      });
      setProducts((prev) => prev.map((p) => p.id === editingProductId ? {
        ...p,
        name,
        category: editingProductCategory.trim() || '',
        description: editingProductDescription.trim() || '',
        brand: editingProductBrand.trim() || '',
      } : p));
      if (productId === editingProductId) {
        loadProduct(editingProductId);
      }
      setEditingProductId(null);
      showToast('toast.saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (deletingProductId) return;
    setError('');
    setDeletingProductId(id);
    try {
      await deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      if (productId === id) {
        setProductId(null);
        setProduct(null);
        setPhotos([]);
        setStep(1);
      }
      showToast('toast.deleted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setDeletingProductId(null);
    }
  };

  const canShowImproveHint = productDescription.trim().length >= MIN_DESCRIPTION_LENGTH_FOR_IMPROVE;

  const handleOpenImproveDialog = () => {
    setImproveProductUrl('');
    setError('');
    setImproveDialogOpen(true);
  };

  const handleImproveDescription = async () => {
    const desc = productDescription.trim();
    if (!desc) return;
    setError('');
    try {
      const { job_id } = await createProductDescriptionImproveJob({
        description: desc,
        product_url: improveProductUrl.trim() || undefined,
      });
      setImproveJobId(job_id);
      setImproveLoading(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      setImproveLoading(false);
    }
  };

  useEffect(() => {
    if (!improveJobId || !improveLoading) return;
    const jobId: string = improveJobId;
    let cancelled = false;
    function poll() {
      getJob(jobId).then((j) => {
        if (cancelled) return;
        if (j?.status === 'completed') {
          const out = j.output && typeof j.output === 'object' && 'output' in j.output
            ? String((j.output as { output?: string }).output ?? '')
            : '';
          if (out) setProductDescription(out);
          setImproveDialogOpen(false);
          setImproveJobId(null);
          setImproveLoading(false);
          return;
        }
        if (j?.status === 'failed') {
          setError(j.error ?? 'Improve failed');
          setImproveJobId(null);
          setImproveLoading(false);
          return;
        }
        setTimeout(poll, 2000);
      });
    }
    poll();
    return () => { cancelled = true; };
  }, [improveJobId, improveLoading]);

  const canShowSceneImproveHint = prompt.trim().length >= MIN_SCENE_LENGTH_FOR_IMPROVE;

  const handleOpenSceneImproveDialog = () => {
    setError('');
    setSceneImproveDialogOpen(true);
  };

  const handleImproveScene = async () => {
    const scene = prompt.trim();
    if (!scene || !productId) return;
    setError('');
    try {
      const { job_id } = await createProductSceneImproveJob({ scene_prompt: scene, product_id: productId });
      setSceneImproveJobId(job_id);
      setSceneImproveLoading(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      setSceneImproveLoading(false);
    }
  };

  useEffect(() => {
    if (!sceneImproveJobId || !sceneImproveLoading) return;
    const jobId: string = sceneImproveJobId;
    let cancelled = false;
    function poll() {
      getJob(jobId).then((j) => {
        if (cancelled) return;
        if (j?.status === 'completed') {
          const out = j.output && typeof j.output === 'object' && 'output' in j.output
            ? String((j.output as { output?: string }).output ?? '')
            : '';
          if (out) setPrompt(out);
          setSceneImproveDialogOpen(false);
          setSceneImproveJobId(null);
          setSceneImproveLoading(false);
          return;
        }
        if (j?.status === 'failed') {
          setError(j.error ?? 'Improve failed');
          setSceneImproveJobId(null);
          setSceneImproveLoading(false);
          return;
        }
        setTimeout(poll, 2000);
      });
    }
    poll();
    return () => { cancelled = true; };
  }, [sceneImproveJobId, sceneImproveLoading]);

  const handleImageFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!productId || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const urls = await uploadAttachments(files.slice(0, 10));
      await addProductPhotos(productId, urls);
      loadProduct(productId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!productId || deletingPhotoId) return;
    setError('');
    setDeletingPhotoId(photoId);
    try {
      await deleteProductPhoto(productId, photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      showToast('toast.deleted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingPhotoId(null);
    }
  };

  const handleScore = async () => {
    if (!productId || photos.length === 0) return;
    setError('');
    setScoreLoading(true);
    try {
      const { job_id } = await createProductScoreJob(productId);
      setScoreJobId(job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Score failed');
      setScoreLoading(false);
    }
  };

  useEffect(() => {
    if (!scoreJobId || !scoreLoading) return;
    const jobId: string = scoreJobId;
    let cancelled = false;
    function poll() {
      getJob(jobId).then((j) => {
        if (cancelled) return;
        if (j?.status === 'completed') {
          loadProduct(productId!);
          setScoreJobId(null);
          setScoreLoading(false);
          return;
        }
        if (j?.status === 'failed') {
          setError(j.error ?? 'Score failed');
          setScoreJobId(null);
          setScoreLoading(false);
          return;
        }
        setTimeout(poll, 2000);
      });
    }
    poll();
    return () => { cancelled = true; };
  }, [scoreJobId, scoreLoading, productId, loadProduct]);

  const handleGenerate = async () => {
    if (!productId || photos.length === 0 || !prompt.trim()) return;
    setError('');
    setGenerateLoading(true);
    setGeneratedUrls([]);
    setShareJobId(null);
    setSelectedGenerated(new Set());
    try {
      const imageUrls = photos.map((p) => p.image_url);
      const { job_id } = await createImage({
        prompt: prompt.trim(),
        size: 'HD',
        imageInput: imageUrls,
        productId,
        aspectRatio: 'match_input_image',
      });
      setGenerateJobId(job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generate failed');
      setGenerateLoading(false);
    }
  };

  useEffect(() => {
    if (!generateJobId || !generateLoading) return;
    const jobId: string = generateJobId;
    let cancelled = false;
    function poll() {
      getJob(jobId).then((j) => {
        if (cancelled) return;
        if (j?.status === 'completed') {
          setGeneratedUrls(getOutputUrls(j.output ?? {}));
          setShareJobId(jobId);
          setSelectedGenerated(new Set());
          setGenerateJobId(null);
          setGenerateLoading(false);
          if (productId) loadProduct(productId);
          return;
        }
        if (j?.status === 'failed') {
          setError(j.error ?? 'Generation failed');
          setGenerateJobId(null);
          setGenerateLoading(false);
          return;
        }
        setTimeout(poll, 2000);
      });
    }
    poll();
    return () => { cancelled = true; };
  }, [generateJobId, generateLoading, productId, loadProduct]);

  const avgScore = averageScore(photos);
  const canGenerate = avgScore != null && avgScore >= MIN_AVG_SCORE && photos.length > 0;
  const scoreBlocked = avgScore != null && avgScore < MIN_AVG_SCORE;
  const productsByCategory = useMemo(() => {
    const map = new Map<string, Product[]>();
    products.forEach((p) => {
      const categoryKey = (p.category ?? '').trim() || '__uncategorized__';
      const list = map.get(categoryKey) ?? [];
      list.push(p);
      map.set(categoryKey, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === '__uncategorized__') return 1;
      if (b === '__uncategorized__') return -1;
      return a.localeCompare(b);
    });
  }, [products]);
  const categorySuggestions = useMemo(() => {
    const set = new Set<string>();
    CATEGORY_OPTIONS.forEach((opt) => {
      if (opt.value) set.add(opt.value);
    });
    products.forEach((p) => {
      const c = (p.category ?? '').trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);
  const createCategorySuggestions = useMemo(() => {
    const q = productCategory.trim().toLowerCase();
    if (!q) return categorySuggestions.slice(0, 10);
    return categorySuggestions
      .filter((category) => category.toLowerCase().includes(q))
      .slice(0, 10);
  }, [categorySuggestions, productCategory]);
  const editCategorySuggestions = useMemo(() => {
    const q = editingProductCategory.trim().toLowerCase();
    if (!q) return categorySuggestions.slice(0, 10);
    return categorySuggestions
      .filter((category) => category.toLowerCase().includes(q))
      .slice(0, 10);
  }, [categorySuggestions, editingProductCategory]);

  const getCategoryDisplay = useCallback((categoryKey: string) => {
    const normalized = categoryKey.trim().toLowerCase();
    const labelKey = CATEGORY_LABEL_BY_VALUE[normalized];
    return labelKey ? t(locale, labelKey) : categoryKey;
  }, [locale]);

  useEffect(() => {
    setExpandedCategories((prev) => {
      const next: Record<string, boolean> = {};
      productsByCategory.forEach(([key]) => {
        next[key] = prev[key] ?? true;
      });
      return next;
    });
  }, [productsByCategory]);

  const previewGeneratedUrls = useMemo(() => {
    const out: string[] = [];
    generatedJobs.forEach((job) => {
      getOutputUrls(job.output).forEach((u) => out.push(u));
    });
    return out;
  }, [generatedJobs]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 scrollbar-subtle">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-xl font-semibold text-theme-fg mb-1">{t(locale, 'productPictures.title')}</h1>
        <p className="text-sm text-theme-fg-muted mb-6">{t(locale, 'productPictures.sub')}</p>

        {/* Step indicator: 2 and 3 disabled until product is chosen */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${step === 1 ? 'bg-theme-bg-hover text-theme-fg' : 'text-theme-fg-muted hover:text-theme-fg'}`}
          >
            {t(locale, 'productPictures.stepProduct')}
          </button>
          <button
            type="button"
            onClick={() => productId && setStep(2)}
            disabled={!productId}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 disabled:pointer-events-none ${step === 2 ? 'bg-theme-bg-hover text-theme-fg' : productId ? 'text-theme-fg-muted hover:text-theme-fg' : 'text-theme-fg-muted'}`}
          >
            {t(locale, 'productPictures.stepPhotos')}
          </button>
          <button
            type="button"
            onClick={() => productId && canGenerate && setStep(3)}
            disabled={!productId || !canGenerate}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 disabled:pointer-events-none ${step === 3 ? 'bg-theme-bg-hover text-theme-fg' : productId && canGenerate ? 'text-theme-fg-muted hover:text-theme-fg' : 'text-theme-fg-muted'}`}
          >
            {t(locale, 'productPictures.stepGenerate')}
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-500 dark:text-red-400">{error}</p>}

        {/* Step 1: Choose existing product or create new */}
        {step === 1 && (
          <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-5 space-y-5">
            {products.length > 0 && (
              <div>
                <p className="text-xs font-medium text-theme-fg-muted mb-2">{t(locale, 'productPictures.selectExisting')}</p>
                <div className="space-y-3">
                  {productsByCategory.map(([categoryKey, categoryProducts]) => {
                    const open = expandedCategories[categoryKey] ?? true;
                    const isUncategorized = categoryKey === '__uncategorized__';
                    const title = isUncategorized ? t(locale, 'common.none') : getCategoryDisplay(categoryKey);
                    return (
                      <div key={categoryKey} className="rounded-xl border border-theme-border bg-theme-bg/60">
                        <button
                          type="button"
                          onClick={() => setExpandedCategories((prev) => ({ ...prev, [categoryKey]: !open }))}
                          className="w-full flex items-center justify-between px-3 py-2 text-left"
                        >
                          <span className="text-sm font-medium text-theme-fg">{title}</span>
                          <span className="text-xs text-theme-fg-muted">{categoryProducts.length} {open ? '▲' : '▼'}</span>
                        </button>
                        {open && (
                          <div className="px-3 pb-3 flex flex-wrap gap-2">
                            {categoryProducts.map((p) => (
                              <div key={p.id} className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-xl border border-theme-border bg-theme-bg">
                                <button
                                  type="button"
                                  onClick={() => handleSelectProduct(p.id)}
                                  className="btn-tap px-2 py-1 rounded-lg text-theme-fg text-sm font-medium hover:bg-theme-bg-hover"
                                  title={p.category ? `${p.name} · ${p.category}` : p.name}
                                >
                                  {p.name}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditProduct(p)}
                                  className="btn-tap px-2 py-1 rounded-md text-xs border border-theme-border text-theme-fg-muted hover:text-theme-fg hover:border-theme-border-hover"
                                >
                                  {t(locale, 'common.edit') || 'Edit'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProduct(p.id)}
                                  disabled={deletingProductId === p.id}
                                  className="btn-tap px-2 py-1 rounded-md text-xs border border-red-400/40 text-red-300 hover:bg-red-500/20 disabled:opacity-60"
                                >
                                  {deletingProductId === p.id ? '…' : (t(locale, 'common.delete') || 'Delete')}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className={products.length > 0 ? 'pt-4 border-t border-theme-border' : ''}>
              <p className="text-xs font-medium text-theme-fg-muted mb-3">{products.length > 0 ? t(locale, 'productPictures.orCreateNew') : t(locale, 'productPictures.productName')}</p>
              <div className={`space-y-3 ${improveLoading ? 'pointer-events-none opacity-70' : ''}`}>
                <div>
                  <label className="block text-xs text-theme-fg-muted mb-1">{t(locale, 'productPictures.productName')}</label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder={t(locale, 'productPictures.productNamePlaceholder')}
                    disabled={improveLoading}
                    className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-4 py-2.5 focus:outline-none disabled:opacity-70"
                  />
                </div>
                <div>
                  <label className="block text-xs text-theme-fg-muted mb-1">{t(locale, 'productPictures.category')}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={productCategory}
                      onFocus={() => setCategoryMenuOpen('create')}
                      onBlur={() => setTimeout(() => setCategoryMenuOpen((prev) => (prev === 'create' ? null : prev)), 120)}
                      onChange={(e) => {
                        setProductCategory(e.target.value);
                        if (categoryMenuOpen !== 'create') setCategoryMenuOpen('create');
                      }}
                      disabled={improveLoading}
                      placeholder={t(locale, 'productPictures.categoryNone')}
                      className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-4 py-2.5 focus:outline-none disabled:opacity-70"
                    />
                    {categoryMenuOpen === 'create' && createCategorySuggestions.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-xl border border-theme-border-hover bg-theme-bg shadow-xl max-h-56 overflow-y-auto">
                        {createCategorySuggestions.map((category) => (
                          <button
                            key={category}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setProductCategory(category);
                              setCategoryMenuOpen(null);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-theme-bg-hover transition-colors"
                          >
                            <div className="text-sm text-theme-fg">{category}</div>
                            <div className="text-xs text-theme-fg-muted">{getCategoryDisplay(category)}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-theme-fg-muted mb-1">{t(locale, 'productPictures.description')}</label>
                  <div className="relative">
                    <textarea
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      placeholder={t(locale, 'productPictures.descriptionPlaceholder')}
                      rows={2}
                      disabled={improveLoading}
                      className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-4 py-2.5 focus:outline-none resize-none disabled:opacity-70 disabled:pointer-events-none"
                    />
                    {canShowImproveHint && !improveLoading && (
                      <button
                        type="button"
                        onClick={handleOpenImproveDialog}
                        className="absolute right-2 bottom-2 text-xs font-medium text-theme-fg-muted hover:text-theme-fg rounded-md px-2 py-1 bg-theme-fg/5 hover:bg-theme-fg/10 transition-colors"
                      >
                        {t(locale, 'productPictures.improve')}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-theme-fg-muted mb-1">{t(locale, 'productPictures.brand')}</label>
                  <input
                    type="text"
                    value={productBrand}
                    onChange={(e) => setProductBrand(e.target.value)}
                    placeholder={t(locale, 'productPictures.brandPlaceholder')}
                    disabled={improveLoading}
                    className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-4 py-2.5 focus:outline-none disabled:opacity-70"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateProduct}
                  disabled={!productName.trim() || improveLoading}
                  className="btn-tap w-full sm:w-auto px-4 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover text-theme-fg text-sm font-medium disabled:opacity-50"
                >
                  {t(locale, 'productPictures.createProduct')}
                </button>
              </div>
            </div>
          </div>
        )}

        {editingProductId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setEditingProductId(null)}>
            <div className="rounded-2xl border border-theme-border-hover bg-theme-bg p-5 w-full max-w-md shadow-2xl ring-1 ring-white/15 text-left" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-theme-fg mb-3">{t(locale, 'common.edit') || 'Edit product'}</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-theme-fg-muted mb-1">{t(locale, 'productPictures.productName')}</label>
                  <input value={editingProductName} onChange={(e) => setEditingProductName(e.target.value)} className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-4 py-2.5 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-theme-fg-muted mb-1">{t(locale, 'productPictures.category')}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={editingProductCategory}
                      onFocus={() => setCategoryMenuOpen('edit')}
                      onBlur={() => setTimeout(() => setCategoryMenuOpen((prev) => (prev === 'edit' ? null : prev)), 120)}
                      onChange={(e) => {
                        setEditingProductCategory(e.target.value);
                        if (categoryMenuOpen !== 'edit') setCategoryMenuOpen('edit');
                      }}
                      className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-4 py-2.5 focus:outline-none"
                    />
                    {categoryMenuOpen === 'edit' && editCategorySuggestions.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-xl border border-theme-border-hover bg-theme-bg shadow-xl max-h-56 overflow-y-auto">
                        {editCategorySuggestions.map((category) => (
                          <button
                            key={category}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setEditingProductCategory(category);
                              setCategoryMenuOpen(null);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-theme-bg-hover transition-colors"
                          >
                            <div className="text-sm text-theme-fg">{category}</div>
                            <div className="text-xs text-theme-fg-muted">{getCategoryDisplay(category)}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-theme-fg-muted mb-1">{t(locale, 'productPictures.description')}</label>
                  <textarea value={editingProductDescription} onChange={(e) => setEditingProductDescription(e.target.value)} rows={2} className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-4 py-2.5 focus:outline-none resize-none" />
                </div>
                <div>
                  <label className="block text-xs text-theme-fg-muted mb-1">{t(locale, 'productPictures.brand')}</label>
                  <input value={editingProductBrand} onChange={(e) => setEditingProductBrand(e.target.value)} className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-4 py-2.5 focus:outline-none" />
                </div>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button type="button" onClick={() => setEditingProductId(null)} className="btn-tap px-3 py-2 rounded-xl border border-theme-border text-theme-fg text-sm">{t(locale, 'productPictures.cancel')}</button>
                <button type="button" onClick={handleSaveEditProduct} disabled={!editingProductName.trim()} className="btn-tap px-4 py-2 rounded-xl border border-theme-border-hover bg-theme-bg-hover text-theme-fg text-sm font-medium disabled:opacity-50">{t(locale, 'common.save') || 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Improve description dialog */}
        {improveDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !improveLoading && setImproveDialogOpen(false)}>
            <div className="rounded-2xl border border-theme-border-hover bg-theme-bg p-5 w-full max-w-md shadow-2xl ring-1 ring-white/15 text-left" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-theme-fg mb-3">{t(locale, 'productPictures.improveDescriptionTitle')}</h3>
              {improveLoading ? (
                <div className="flex items-center gap-2 text-theme-fg-muted text-sm py-4">
                  <span className="w-4 h-4 rounded-full border-2 border-theme-border border-t-theme-fg animate-spin" />
                  {t(locale, 'productPictures.improving')}
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <label className="block text-xs text-theme-fg-muted mb-1">{t(locale, 'productPictures.productLinkOptional')}</label>
                    <input
                      type="url"
                      value={improveProductUrl}
                      onChange={(e) => setImproveProductUrl(e.target.value)}
                      placeholder={t(locale, 'productPictures.productLinkPlaceholder')}
                      className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-4 py-2.5 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setImproveDialogOpen(false)}
                      className="btn-tap px-3 py-2 rounded-xl border border-theme-border text-theme-fg text-sm"
                    >
                      {t(locale, 'productPictures.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleImproveDescription}
                      className="btn-tap px-4 py-2 rounded-xl border border-theme-border-hover bg-theme-bg-hover text-theme-fg text-sm font-medium"
                    >
                      {t(locale, 'productPictures.improve')}
                    </button>
                  </div>
                </>
              )}
              {error && !improveLoading && <p className="mt-2 text-sm text-red-500 dark:text-red-400">{error}</p>}
            </div>
          </div>
        )}

        {/* Step 2: Add photos + Score */}
        {step === 2 && productId && product && (
          <div className="rounded-2xl border border-theme-border bg-theme-bg-subtle p-5 space-y-5">
            <div className="text-sm text-theme-fg-muted">
              <span>{t(locale, 'productPictures.product')}: <strong className="text-theme-fg">{product.name}</strong></span>
              {(product.category || product.brand) && (
                <span className="ml-2 text-theme-fg-muted/80">
                  {[product.category, product.brand].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'productPictures.uploadProductPhotos')}</label>
              <input
                type="file"
                accept="image/*"
                multiple
                value=""
                onChange={handleImageFiles}
                disabled={uploading}
                className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-4 py-2.5 file:mr-3 file:py-1.5 file:rounded-lg file:border file:border-theme-border file:bg-theme-bg-hover file:text-theme-fg file:text-sm"
              />
            </div>
            {photos.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {photos.map((ph) => (
                    <div key={ph.id} className="relative group">
                      <img
                        src={mediaToken ? getMediaDisplayUrl(ph.image_url, mediaToken) || ph.image_url : ph.image_url}
                        alt=""
                        className="w-16 h-16 rounded-lg border border-theme-border object-cover"
                      />
                      {ph.score != null && (
                        <span className={`absolute bottom-0 left-0 right-0 text-center text-xs font-medium py-0.5 rounded-b-lg ${ph.score >= MIN_AVG_SCORE ? 'bg-green-500/80 text-white' : 'bg-amber-500/80 text-white'}`}>
                          {ph.score}/10
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(ph.id)}
                        disabled={deletingPhotoId === ph.id || uploading || scoreLoading || generateLoading}
                        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full border border-theme-border-hover bg-black/90 text-white text-sm leading-none flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 hover:bg-red-500 hover:border-red-300 hover:text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={t(locale, 'common.remove')}
                        title={t(locale, 'common.remove')}
                      >
                        {deletingPhotoId === ph.id ? '…' : '×'}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={handleScore}
                    disabled={scoreLoading || photos.length === 0}
                    className="btn-tap px-4 py-2 rounded-xl border border-theme-border-hover bg-theme-bg-hover text-theme-fg text-sm font-medium disabled:opacity-50"
                  >
                    {scoreLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full border-2 border-theme-border border-t-theme-fg animate-spin" />
                        {t(locale, 'productPictures.scoring')}
                      </span>
                    ) : (
                      t(locale, 'productPictures.scorePhotos')
                    )}
                  </button>
                  {avgScore != null && (
                    <span className={`text-sm ${scoreBlocked ? 'text-amber-600 dark:text-amber-400' : 'text-theme-fg-muted'}`}>
                      {t(locale, 'productPictures.averageScore')}: {avgScore.toFixed(1)}/10
                      {scoreBlocked && ` — ${t(locale, 'productPictures.scoreTooLow')}`}
                    </span>
                  )}
                </div>
                {canGenerate && (
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="btn-tap px-4 py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg text-sm font-medium"
                  >
                    {t(locale, 'productPictures.continueToGenerate')}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 3: Generate */}
        {step === 3 && productId && product && photos.length > 0 && canGenerate && (
          <div className="relative rounded-2xl border border-theme-border bg-theme-bg-subtle p-5 space-y-5">
            {previewGeneratedUrls.length > 0 && (
              <div className="absolute top-4 right-4 group">
                <div
                  className="w-9 h-9 rounded-lg bg-theme-fg/10 flex items-center justify-center text-theme-fg-muted hover:text-theme-fg hover:bg-theme-fg/15 transition-colors cursor-default"
                  title={t(locale, 'productPictures.previewGenerated')}
                  aria-hidden
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </div>
                <div className="absolute right-0 top-full mt-1.5 w-48 p-2 rounded-xl border border-theme-border bg-theme-bg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto pointer-events-none transition-all duration-150 z-20">
                  <p className="text-[10px] font-medium text-theme-fg-muted uppercase tracking-wider mb-2">{t(locale, 'productPictures.previewGenerated')}</p>
                  <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                    {previewGeneratedUrls.slice(0, 9).map((url, i) => (
                      <div key={i} className="aspect-square rounded-lg border border-theme-border overflow-hidden bg-theme-bg-subtle">
                        <img
                          src={mediaToken ? getMediaDisplayUrl(url, mediaToken) || url : url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                  {previewGeneratedUrls.length > 9 && (
                    <p className="text-[10px] text-theme-fg-subtle mt-1">+{previewGeneratedUrls.length - 9}</p>
                  )}
                </div>
              </div>
            )}
            <div className="text-sm text-theme-fg-muted">
              <span>{t(locale, 'productPictures.product')}: <strong className="text-theme-fg">{product.name}</strong></span>
              {(product.category || product.brand) && (
                <span className="ml-2 text-theme-fg-muted/80">
                  {[product.category, product.brand].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-theme-fg-muted mb-1.5">{t(locale, 'productPictures.scenePrompt')}</label>
              <div className="relative">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t(locale, 'productPictures.scenePlaceholder')}
                  disabled={generateLoading || sceneImproveLoading}
                  className="w-full rounded-xl border border-theme-border bg-theme-bg text-theme-fg text-sm px-4 py-2.5 focus:outline-none disabled:opacity-70"
                />
                {canShowSceneImproveHint && !sceneImproveLoading && !generateLoading && (
                  <button
                    type="button"
                    onClick={handleOpenSceneImproveDialog}
                    className="absolute right-2 bottom-2 text-xs font-semibold text-white rounded-md px-2.5 py-1 bg-theme-accent/90 hover:bg-theme-accent transition-colors shadow-sm"
                  >
                    {t(locale, 'productPictures.improve')}
                  </button>
                )}
              </div>
              <p className="text-xs text-theme-fg-muted mt-1.5 mb-1.5">{t(locale, 'productPictures.sceneIdeas')}</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {SCENE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.labelKey}
                    type="button"
                    onClick={() => setPrompt(tpl.prompt)}
                    disabled={generateLoading}
                    className="btn-tap text-xs px-3 py-1.5 rounded-lg border border-theme-border bg-theme-bg/80 text-theme-fg-muted hover:text-theme-fg hover:border-theme-border-hover hover:bg-theme-bg-hover/80 transition-colors disabled:opacity-50"
                  >
                    {t(locale, tpl.labelKey)}
                  </button>
                ))}
              </div>
              {suggestedScenes.length > 0 && (
                <>
                  <p className="text-xs text-theme-fg-muted mb-1.5">{t(locale, 'productPictures.suggestedForProduct')}</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedScenes.map((scene, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPrompt(scene)}
                        disabled={generateLoading}
                        className="btn-tap text-xs px-3 py-1.5 rounded-lg border border-theme-border bg-theme-fg/5 text-theme-fg-muted hover:text-theme-fg hover:border-theme-border-hover hover:bg-theme-fg/10 transition-colors disabled:opacity-50 max-w-[200px] truncate"
                        title={scene}
                      >
                        {scene.length > 36 ? scene.slice(0, 35) + '…' : scene}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Scene improve dialog */}
            {sceneImproveDialogOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !sceneImproveLoading && setSceneImproveDialogOpen(false)}>
                <div className="rounded-2xl border border-theme-border-hover bg-theme-bg p-5 w-full max-w-md shadow-2xl ring-1 ring-white/15 text-left" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-sm font-semibold text-theme-fg mb-3">{t(locale, 'productPictures.sceneImproveTitle')}</h3>
                  {sceneImproveLoading ? (
                    <div className="flex items-center gap-2 text-theme-fg-muted text-sm py-4">
                      <span className="w-4 h-4 rounded-full border-2 border-theme-border border-t-theme-fg animate-spin" />
                      {t(locale, 'productPictures.improving')}
                    </div>
                  ) : (
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setSceneImproveDialogOpen(false)} className="btn-tap px-3 py-2 rounded-xl border border-theme-border text-theme-fg text-sm">
                        {t(locale, 'productPictures.cancel')}
                      </button>
                      <button type="button" onClick={handleImproveScene} className="btn-tap px-4 py-2 rounded-xl border border-theme-border-hover bg-theme-bg-hover text-theme-fg text-sm font-medium">
                        {t(locale, 'productPictures.improve')}
                      </button>
                    </div>
                  )}
                  {error && !sceneImproveLoading && <p className="mt-2 text-sm text-red-500 dark:text-red-400">{error}</p>}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!prompt.trim() || generateLoading}
              className="btn-tap w-full py-2.5 rounded-xl border border-theme-border-hover bg-theme-bg-hover-strong text-theme-fg font-medium text-sm disabled:opacity-50"
            >
              {generateLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-theme-border border-t-theme-fg animate-spin" />
                  {t(locale, 'productPictures.generating')}
                </span>
              ) : (
                t(locale, 'productPictures.generate')
              )}
            </button>
            {generatedUrls.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-theme-fg-muted mb-2">{t(locale, 'productPictures.result')}</h2>
                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    disabled={exportGenBusy || selectedGenerated.size === 0}
                    onClick={async () => {
                      if (selectedGenerated.size === 0 || exportGenBusy) return;
                      setExportGenBusy(true);
                      try {
                        const refs = generatedUrls.filter((_, i) => selectedGenerated.has(i));
                        const entries: { name: string; blob: Blob }[] = [];
                        let idx = 0;
                        for (const ref of refs) {
                          const blob = await fetchBlobForJobRef(ref);
                          idx += 1;
                          entries.push({ name: zipEntryName(idx, blob, ref), blob });
                        }
                        await zipBlobsAndDownload(entries, `flipo5-product-${new Date().toISOString().slice(0, 10)}`);
                      } catch {
                        showToast('productPictures.exportZipError');
                      } finally {
                        setExportGenBusy(false);
                      }
                    }}
                    className="btn-tap px-3 py-2 rounded-xl text-sm font-medium border border-theme-border-hover bg-theme-accent-muted text-theme-accent hover:bg-theme-accent-hover disabled:opacity-50"
                  >
                    {exportGenBusy ? t(locale, 'productPictures.exportZipBusy') : t(locale, 'productPictures.exportZip')}
                  </button>
                  {shareJobId ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const { path } = await createJobShare(shareJobId);
                          await navigator.clipboard.writeText(`${typeof window !== 'undefined' ? window.location.origin : ''}${path}`);
                          showToast('productPictures.clientLinkCopied');
                        } catch {
                          showToast('productPictures.clientLinkFailed');
                        }
                      }}
                      className="btn-tap px-3 py-2 rounded-xl text-sm font-medium border border-theme-border bg-theme-bg-hover text-theme-fg hover:bg-theme-bg-hover-strong"
                    >
                      {t(locale, 'productPictures.clientLink')}
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3">
                  {generatedUrls.map((url, i) => {
                    const checked = selectedGenerated.has(i);
                    return (
                      <div key={i} className="relative rounded-xl border border-theme-border overflow-hidden">
                        <label className="absolute top-2 left-2 z-10 flex items-center justify-center w-8 h-8 rounded-md bg-theme-bg-elevated/90 border border-theme-border cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-theme-accent"
                            checked={checked}
                            onChange={() => {
                              setSelectedGenerated((prev) => {
                                const next = new Set(prev);
                                if (next.has(i)) next.delete(i);
                                else next.add(i);
                                return next;
                              });
                            }}
                          />
                        </label>
                        <a
                          href={url.startsWith('http') ? url : (mediaToken ? getMediaDisplayUrl(url, mediaToken) : '#')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <img src={mediaToken ? getMediaDisplayUrl(url, mediaToken) || url : url} alt="" className="w-full max-w-xs aspect-square object-cover" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && productId && (
          <button
            type="button"
            onClick={() => { setStep(1); setProductId(null); setProduct(null); setPhotos([]); }}
            className="mt-4 text-sm text-theme-fg-muted hover:text-theme-fg"
          >
            ← {t(locale, 'productPictures.back')}
          </button>
        )}
        {step === 3 && (
          <button
            type="button"
            onClick={() => setStep(2)}
            className="mt-4 text-sm text-theme-fg-muted hover:text-theme-fg"
          >
            ← {t(locale, 'productPictures.back')}
          </button>
        )}
      </div>
    </div>
  );
}
