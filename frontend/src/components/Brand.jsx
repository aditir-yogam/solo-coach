export function BrandMark({ className = '' }) {
  return (
    <div className={`brand ${className}`}>
      <div className="brand-logo" aria-hidden="true">C</div>
      <div className="brand-name">Coaching Platform</div>
    </div>
  );
}

// Left panel shared by Page 1 and Page 2.
export function BrandPanel({ title, subtitle, points }) {
  return (
    <aside className="brand-panel">
      <div className="brand-panel-top">
        <BrandMark />
        <div className="brand-panel-intro">
          <h1>{title}</h1>
          <p className="brand-panel-sub">{subtitle}</p>
        </div>
        <ul className="brand-points">
          {points.map(({ icon, text }) => (
            <li className="brand-point" key={text}>
              <span className="brand-point-icon">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export function StepIndicator({ step, total, label }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="step">
      <div className="step-label" id="step-label">
        Step {step} of {total} — {label}
      </div>
      <div
        className="step-track"
        role="progressbar"
        aria-labelledby="step-label"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={step}
      >
        <div className="step-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PageLoading({ label = 'Loading…' }) {
  return (
    <div className="page-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}
