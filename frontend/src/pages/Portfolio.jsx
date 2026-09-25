import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandMark, PageLoading } from '../components/Brand';
import EditableField from '../components/EditableField';
import { GridIcon, PersonIcon, UploadIcon, CheckIcon, PlusIcon, LinkedinOutlineIcon, MailIcon, PencilIcon } from '../components/Icons';
import { api } from '../lib/api';

const POLL_MS = 2500;
const CREDENTIAL_TAGS = ['ICF', 'EMCC', 'Another body']; // shown green with a check, like "ICF" in the wireframe

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind === 'error' ? 'toast--error' : ''}`} role="status" aria-live="polite">
      {toast.text}
    </div>
  );
}

// Story 11: shown small (96px) and as the hero, same image. With no photo both
// spots are a dashed "Add photo" control that opens the file picker.
function Photo({ url, variant, onError, onPick, uploading }) {
  const cls = variant === 'hero' ? 'hero-photo' : 'avatar';
  if (!url) {
    return (
      <button type="button" className={`${cls} photo-placeholder`} onClick={onPick} disabled={uploading} data-testid={`add-photo-${variant}`}>
        <PersonIcon size={variant === 'hero' ? 30 : 22} stroke="#9A8CBB" width={1.8} />
        <span>{uploading ? 'Uploading…' : 'Add photo'}</span>
      </button>
    );
  }
  if (variant === 'hero') return <img className={cls} src={url} alt="" onError={onError} />;
  return (
    <div className="avatar-wrap">
      <img className={cls} src={url} alt="Coach photo" onError={onError} />
      <button type="button" className="avatar-edit" onClick={onPick} disabled={uploading} aria-label="Change photo" data-testid="edit-photo">
        {uploading ? <span className="spinner spinner--sm spinner--accent" aria-hidden="true" /> : <PencilIcon size={12} />}
      </button>
    </div>
  );
}

function ShimmerLines() {
  return (
    <div className="shimmer-lines" role="status" aria-live="polite" data-testid="story-shimmer">
      <div className="shimmer-bar" style={{ width: '100%' }} />
      <div className="shimmer-bar" style={{ width: '92%' }} />
      <div className="shimmer-bar" style={{ width: '76%' }} />
      <p className="shimmer-note">Generating your story from what you shared — this usually takes a few seconds.</p>
    </div>
  );
}

export default function Portfolio() {
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null); // one field at a time, as in the wireframe
  const [photoFailed, setPhotoFailed] = useState(false);
  const [toast, setToast] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [coachId, setCoachId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const toastTimer = useRef(null);
  const fileRef = useRef(null);

  const showToast = useCallback((text, kind = 'info') => {
    clearTimeout(toastTimer.current);
    setToast({ text, kind });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(
    async (signal) => {
      try {
        let id = coachId;
        if (!id) {
          id = (await api.me({ signal })).coach_id;
          setCoachId(id);
        }
        const data = await api.getPortfolio(id, { signal });
        setPortfolio(data);
        setLoadError('');
      } catch (err) {
        if (err.name === 'AbortError') return;
        if (err.status === 401) navigate('/join', { replace: true });
        else setLoadError(err.message);
      }
    },
    [navigate, coachId],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while the story is being generated; stop as soon as it's done.
  const processing = portfolio?.bio_status === 'processing';
  useEffect(() => {
    if (!processing) return undefined;
    const controller = new AbortController();
    const id = setInterval(() => load(controller.signal), POLL_MS);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [processing, load]);

  useEffect(() => setPhotoFailed(false), [portfolio?.photo_presigned_url]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  if (!portfolio && !loadError) return <PageLoading label="Loading your portfolio…" />;
  if (!portfolio) {
    return (
      <main className="center-page">
        <div className="center-card">
          <div className="alert" role="alert">
            {loadError}
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => load()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  const saveField = (field) => async (value) => {
    const updated = await api.patchCoach(coachId, { [field]: value });
    setPortfolio(updated);
    showToast('Saved');
  };

  // Photo upload: bytes -> MinIO (photo.jpg), then PATCH photo_s3_key, then refresh.
  async function onPhotoChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      showToast('Please choose a JPG, PNG or WebP image.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('That image is larger than 5 MB.', 'error');
      return;
    }
    setUploading(true);
    try {
      const { photo_s3_key: key } = await api.uploadPhoto(coachId, file);
      const updated = await api.patchCoach(coachId, { photo_s3_key: key });
      setPortfolio(updated);
      showToast('Photo updated');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }
  const pickPhoto = () => fileRef.current?.click();

  const fieldProps = (fieldId) => ({
    fieldId,
    isEditing: editing === fieldId,
    onStartEdit: () => setEditing(fieldId),
    onStopEdit: () => setEditing(null),
    onSave: saveField(fieldId),
  });

  async function retryGeneration() {
    if (retrying) return;
    setRetrying(true);
    try {
      await api.generateStory(coachId);
      await load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRetrying(false);
    }
  }

  const photoUrl = photoFailed ? null : portfolio.photo_presigned_url;
  const niches = portfolio.coaching_niche || [];
  const credentialTags = (portfolio.credential || []).filter((c) => CREDENTIAL_TAGS.includes(c));
  const inTraining = (portfolio.credential || []).includes('In training');
  const lastRunFailed = portfolio.last_story_run?.status === 'failure';
  const editingStory = editing === 'coach_story';

  return (
    <div className="dashboard">
      <nav className="sidenav" aria-label="Main">
        <BrandMark />
        <ul className="nav-list">
          <li>
            <Link to="/portfolio" className="nav-item" aria-current="page">
              <GridIcon />
              Portfolio
            </Link>
          </li>
        </ul>
        <div className="nav-note">More menu items — decided later</div>
      </nav>

      <main className="dash-main">
        <div className="portfolio">
          <div className="portfolio-toolbar">
            {/* Visual only — the browser's print dialog also offers "Save as PDF". */}
            <button type="button" className="btn-outline" onClick={() => window.print()}>
              <UploadIcon size={15} stroke="#6D3FA0" />
              Download / Print
            </button>
          </div>

          {/* HEADER */}
          <section className="hero" aria-label="Profile">
            <div className="hero-left">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhotoChosen} data-testid="photo-input" />
              <Photo url={photoUrl} variant="avatar" onError={() => setPhotoFailed(true)} onPick={pickPhoto} uploading={uploading} />

              <EditableField
                {...fieldProps('coach_name')}
                label="name"
                variant="name"
                value={portfolio.coach_name}
                placeholder="Add your name"
                maxLength={100}
                renderDisplay={(v) => <h1 className="coach-name">{v}</h1>}
              />

              <EditableField
                {...fieldProps('headline')}
                label="headline"
                variant="headline"
                value={portfolio.headline}
                placeholder="Add a headline"
                maxLength={140}
                renderDisplay={(v) => <div className="coach-headline">{v}</div>}
              />

              {(niches.length > 0 || credentialTags.length > 0 || inTraining) && (
                <div className="tags">
                  {niches.map((n) => (
                    <span key={n} className="tag">
                      {n}
                    </span>
                  ))}
                  {inTraining && <span className="tag">Credential in training</span>}
                  {credentialTags.map((c) => (
                    <span key={c} className="tag tag--credential">
                      <CheckIcon />
                      {c === 'Another body' ? 'Credentialed' : c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Photo url={photoUrl} variant="hero" onError={() => setPhotoFailed(true)} onPick={pickPhoto} uploading={uploading} />
          </section>

          {/* STORY ("How I add value", formerly "About") */}
          <section className="story-section" aria-labelledby="story-heading">
            <div className="story-header">
              <EditableField
                {...fieldProps('story_heading')}
                label="story heading"
                variant="heading"
                value={portfolio.story_heading}
                placeholder="How I Help"
                maxLength={80}
                renderDisplay={(v) => (
                  <h2 className="story-heading" id="story-heading">
                    {v}
                  </h2>
                )}
              />
              {!processing && !editingStory && portfolio.coach_story && (
                <button type="button" className="text-action" onClick={() => setEditing('coach_story')} data-testid="edit-coach_story">
                  Edit
                </button>
              )}
            </div>

            {processing ? (
              <ShimmerLines />
            ) : editingStory ? (
              <EditableField
                {...fieldProps('coach_story')}
                label="story"
                variant="story"
                value={portfolio.coach_story}
                hideTrigger
                maxLength={6000}
                renderDisplay={() => null}
              />
            ) : portfolio.coach_story ? (
              <p className="story-body" data-testid="story-body">
                {portfolio.coach_story}
              </p>
            ) : (
              <div className="story-empty">
                <p>
                  {lastRunFailed
                    ? "We couldn't generate your story this time. You can try again, update your details, or write it yourself."
                    : 'No story yet.'}
                </p>
                <div className="story-empty-actions">
                  {lastRunFailed && portfolio.can_generate && (
                    <button type="button" className="text-action" onClick={retryGeneration} disabled={retrying}>
                      {retrying ? 'Starting…' : 'Try again'}
                    </button>
                  )}
                  <Link to="/personalize" className="text-action">
                    {lastRunFailed ? 'Update your details' : 'Add details'}
                  </Link>
                  <button type="button" className="text-action" onClick={() => setEditing('coach_story')}>
                    Write it yourself
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* PACKAGES — permanently inert: disabled buttons, no handlers, no requests. */}
          <section className="packages" aria-labelledby="packages-title">
            <h2 className="section-title" id="packages-title">
              Packages
            </h2>
            {[1, 2, 3, 4].map((n) => (
              <div className="package-slot" key={n} data-testid={`package-slot-${n}`}>
                <div className="package-slot-label">
                  <div className="package-number" aria-hidden="true">
                    {n}
                  </div>
                  Package {n}
                </div>
                <button type="button" className="package-add" disabled aria-disabled="true">
                  <PlusIcon />
                  Add package
                </button>
              </div>
            ))}
          </section>

          {/* FOOTER — LinkedIn + Email */}
          <footer className="contact-footer">
            <div className="contact-row">
              <LinkedinOutlineIcon />
              <EditableField
                {...fieldProps('linkedin_handle')}
                label="LinkedIn handle"
                variant="footer"
                value={portfolio.linkedin_handle}
                placeholder="Add your LinkedIn"
                maxLength={120}
                renderDisplay={(v) => <span className="contact-value">{v}</span>}
              />
            </div>
            <div className="contact-row">
              <MailIcon size={15} stroke="#8A7DA8" />
              <EditableField
                {...fieldProps('coach_email')}
                label="email"
                variant="footer"
                inputType="email"
                value={portfolio.coach_email}
                placeholder="Add your email"
                maxLength={254}
                renderDisplay={(v) => <span className="contact-value">{v}</span>}
              />
            </div>
          </footer>
        </div>
      </main>
      <Toast toast={toast} />
    </div>
  );
}
