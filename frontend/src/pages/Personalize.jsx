import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandPanel, StepIndicator, PageLoading } from '../components/Brand';
import { SparkIcon, CalendarIcon, BoltIcon, UploadIcon, FileIcon, CloseIcon } from '../components/Icons';
import { useActiveCoach } from '../components/useActiveCoach';
import { api } from '../lib/api';
import { NICHE_OPTIONS, CREDENTIAL_OPTIONS, CLIENT_COUNT_OPTIONS, MAX_RESUME_BYTES, MAX_NARRATIVE_CHARS } from '../lib/options';

// Left-panel copy: verbatim from the Page 2 wireframe.
const POINTS = [
  { icon: <SparkIcon />, text: 'One sentence from you is enough to start your story.' },
  { icon: <CalendarIcon />, text: "Point us to your website or resume — we'll do the extraction. No either? A few quick picks work too." },
  { icon: <BoltIcon />, text: 'Skip for now — finish anytime from your portfolio.' },
];

function formatBytes(n) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function looksLikeUrl(value) {
  const v = value.trim();
  if (!v) return true;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`);
    return ['http:', 'https:'].includes(u.protocol) && u.hostname.includes('.');
  } catch {
    return false;
  }
}

function ChipGroup({ legend, hint, options, selected, onToggle, multi, name }) {
  return (
    <fieldset className="question">
      <legend>
        {legend} {hint && <span className="optional">{hint}</span>}
      </legend>
      <div className="chips" role={multi ? 'group' : 'radiogroup'} aria-label={legend}>
        {options.map((label) => {
          const on = multi ? selected.includes(label) : selected === label;
          return (
            <button
              key={label}
              type="button"
              className="chip"
              name={name}
              {...(multi ? { 'aria-pressed': on } : { role: 'radio', 'aria-checked': on })}
              onClick={() => onToggle(label)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function Personalize() {
  const navigate = useNavigate();
  const { loading, coach, error: loadError } = useActiveCoach();

  const [narrative, setNarrative] = useState('');
  const [tab, setTab] = useState('auto');
  const [website, setWebsite] = useState('');
  const [resume, setResume] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [niche, setNiche] = useState([]);
  const [credential, setCredential] = useState([]);
  const [clientCount, setClientCount] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(null); // 'continue' | 'skip' | null
  const submittingRef = useRef(false); // guards double clicks before React re-renders
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (coach?.story_text) setNarrative(coach.story_text);
    if (coach?.website_url) setWebsite(coach.website_url);
  }, [coach]);

  if (loading) return <PageLoading />;
  if (loadError) {
    return (
      <main className="center-page">
        <div className="alert" role="alert">
          {loadError}
        </div>
      </main>
    );
  }

  function pickFile(file) {
    setErrors((e) => ({ ...e, resume: undefined }));
    setFormError('');
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setErrors((e) => ({ ...e, resume: 'Please choose a PDF file.' }));
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setErrors((e) => ({ ...e, resume: 'That PDF is larger than 5 MB. Please choose a smaller file.' }));
      return;
    }
    setResume(file);
  }

  function clearFile() {
    setResume(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function toggleMulti(setter) {
    return (label) => setter((cur) => (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]));
  }

  // Story 8: Continue and Skip both save whatever the active tab holds; the
  // server says whether there's anything to generate from (step 5), and only
  // then is the generate_coach_story endpoint called.
  function validate() {
    const next = {};
    if (narrative.length > MAX_NARRATIVE_CHARS) next.narrative = 'Please keep this to a sentence or two.';
    if (tab === 'auto' && !looksLikeUrl(website)) {
      next.website = "That website address doesn't look right. Try something like https://yourcoachingsite.com";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(action) {
    if (submittingRef.current) return;
    setFormError('');
    if (!validate()) return;

    submittingRef.current = true;
    setSubmitting(action);
    const fd = new FormData();
    fd.append('narrative', narrative);
    fd.append('mode', tab);
    if (tab === 'auto') {
      fd.append('website_url', website.trim());
      if (resume) fd.append('resume', resume);
    } else {
      fd.append('niches', JSON.stringify(niche));
      fd.append('credentials', JSON.stringify(credential));
      if (clientCount) fd.append('clients_coached', clientCount);
    }

    try {
      const { generate } = await api.personalize(coach.coach_id, fd);
      if (generate) await api.generateStory(coach.coach_id);
      navigate('/portfolio');
    } catch (err) {
      if (err.status === 401) {
        navigate('/join', { replace: true });
        return;
      }
      if (err.code === 'website_invalid') setErrors({ website: err.message });
      else if (err.code?.startsWith('resume')) setErrors({ resume: err.message });
      else if (err.code === 'narrative_too_long') setErrors({ narrative: err.message });
      else setFormError(err.message);
      submittingRef.current = false;
      setSubmitting(null);
    }
  }

  const busy = submitting !== null;

  return (
    <div className="onboarding">
      <BrandPanel title="Let's shape your story." subtitle="A couple of quick things, then we'll draft the rest." points={POINTS} />
      <main className="form-panel">
        <form
          className="form-column form-column--personalize"
          onSubmit={(e) => {
            e.preventDefault();
            submit('continue');
          }}
          noValidate
        >
          <StepIndicator step={2} total={2} label="Personalize" />

          <div className="page-heading">
            <h2>Help us personalize your experience</h2>
            <p>This shapes your portfolio story. You can change it anytime.</p>
          </div>

          {/* Always-asked narrative seed */}
          <div className="field">
            <label className="field-label" htmlFor="story">
              In a sentence or two, what do you want potential clients to know about you or how you coach?
            </label>
            <textarea
              id="story"
              className="textarea"
              rows={3}
              placeholder="e.g. I help mid-career professionals find clarity before burnout catches up with them."
              value={narrative}
              maxLength={MAX_NARRATIVE_CHARS}
              onChange={(e) => setNarrative(e.target.value)}
              aria-invalid={Boolean(errors.narrative)}
              aria-describedby={errors.narrative ? 'story-error' : undefined}
            />
            {errors.narrative && (
              <p className="field-error" id="story-error">
                {errors.narrative}
              </p>
            )}
            {narrative.length > MAX_NARRATIVE_CHARS * 0.8 && (
              <span className="char-count">
                {narrative.length}/{MAX_NARRATIVE_CHARS}
              </span>
            )}
          </div>

          {/* Fork: auto-extract (default) vs quick questions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="tabs" role="tablist" aria-label="How should we get your details?">
              <button
                type="button"
                role="tab"
                id="tab-auto"
                aria-controls="panel-auto"
                aria-selected={tab === 'auto'}
                className="tab"
                onClick={() => {
                  setTab('auto');
                  setFormError('');
                }}
              >
                Add automatically
              </button>
              <button
                type="button"
                role="tab"
                id="tab-quick"
                aria-controls="panel-quick"
                aria-selected={tab === 'quick'}
                className="tab"
                onClick={() => {
                  setTab('quick');
                  setFormError('');
                }}
              >
                Answer a few quick questions
              </button>
            </div>

            {tab === 'auto' ? (
              <div className="tab-panel" role="tabpanel" id="panel-auto" aria-labelledby="tab-auto">
                <div className="field">
                  <label className="field-label" htmlFor="website">
                    Website / portfolio URL
                  </label>
                  <input
                    id="website"
                    className="input"
                    type="url"
                    inputMode="url"
                    placeholder="https://yourcoachingsite.com"
                    value={website}
                    onChange={(e) => {
                      setWebsite(e.target.value);
                      setErrors((er) => ({ ...er, website: undefined }));
                    }}
                    aria-invalid={Boolean(errors.website)}
                    aria-describedby={errors.website ? 'website-error' : undefined}
                  />
                  {errors.website && (
                    <p className="field-error" id="website-error">
                      {errors.website}
                    </p>
                  )}
                </div>

                <div className="divider">
                  <span>OR</span>
                </div>

                <div className="field">
                  <span className="field-label" id="resume-label">
                    Resume / credential PDF
                  </span>
                  {resume ? (
                    <div className="file-chosen">
                      <FileIcon />
                      <span className="file-chosen-name" title={resume.name}>
                        {resume.name}
                      </span>
                      <span className="file-chosen-size">{formatBytes(resume.size)}</span>
                      <button type="button" className="icon-btn" onClick={clearFile} aria-label="Remove PDF">
                        <CloseIcon />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor="resume"
                      className={`dropzone ${dragging ? 'is-dragging' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        pickFile(e.dataTransfer.files?.[0]);
                      }}
                    >
                      <UploadIcon />
                      Upload PDF, or drag it here
                      <input
                        ref={fileInputRef}
                        id="resume"
                        type="file"
                        accept="application/pdf,.pdf"
                        aria-labelledby="resume-label"
                        aria-describedby={errors.resume ? 'resume-error' : undefined}
                        onChange={(e) => pickFile(e.target.files?.[0])}
                      />
                    </label>
                  )}
                  {errors.resume && (
                    <p className="field-error" id="resume-error">
                      {errors.resume}
                    </p>
                  )}
                </div>
                <p className="field-help">We'll extract what we can — this can take a few seconds and finishes on your portfolio page.</p>
              </div>
            ) : (
              <div className="tab-panel tab-panel--quick" role="tabpanel" id="panel-quick" aria-labelledby="tab-quick">
                <ChipGroup
                  legend="What's your coaching niche?"
                  hint="(select all that apply)"
                  options={NICHE_OPTIONS}
                  selected={niche}
                  onToggle={toggleMulti(setNiche)}
                  multi
                  name="niche"
                />
                <ChipGroup
                  legend="Do you hold a coaching credential?"
                  hint="(select all that apply)"
                  options={CREDENTIAL_OPTIONS}
                  selected={credential}
                  onToggle={toggleMulti(setCredential)}
                  multi
                  name="credential"
                />
                <ChipGroup
                  legend="How many clients are you coaching right now?"
                  options={CLIENT_COUNT_OPTIONS}
                  selected={clientCount}
                  onToggle={(label) => setClientCount((cur) => (cur === label ? null : label))}
                  name="clients"
                />
              </div>
            )}
          </div>

          {formError && (
            <div className="alert" role="alert">
              {formError}
            </div>
          )}

          <div className="cta-stack">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {submitting === 'continue' && <span className="spinner" aria-hidden="true" />}
              {submitting === 'continue' ? 'Starting your story…' : 'Continue to my portfolio'}
            </button>
            <button type="button" className="skip-link" onClick={() => submit('skip')} disabled={busy}>
              Skip for now — I'll do this later →
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
