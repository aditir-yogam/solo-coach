import { useEffect, useRef, useState } from 'react';
import { PencilIcon } from './Icons';

// Click-to-edit, matching the Portfolio wireframe:
//   display + pencil  ->  input/textarea + Save / Cancel
// Save calls onSave(value) (the PATCH); the display only changes after the
// server confirms. Cancel discards the draft locally and sends nothing.
//
// variant: 'name' | 'headline' | 'heading' | 'footer' | 'story'
export default function EditableField({
  fieldId,
  label,
  value,
  placeholder,
  variant,
  inputType = 'text',
  isEditing,
  onStartEdit,
  onStopEdit,
  onSave,
  renderDisplay,
  hideTrigger = false,
  maxLength,
}) {
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(value || '');
      setError('');
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          if (variant !== 'story') el.select();
        }
      });
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      onStopEdit();
    } catch (err) {
      setError(err.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (saving) return;
    setDraft(value || '');
    setError('');
    onStopEdit();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && variant !== 'story') {
      e.preventDefault();
      save();
    } else if (e.key === 'Enter' && variant === 'story' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  }

  const inputId = `edit-${fieldId}-input`;
  const errorId = `edit-${fieldId}-error`;

  if (isEditing) {
    const actionsClass =
      variant === 'story' ? 'edit-actions edit-actions--lg' : variant === 'heading' ? 'edit-actions edit-actions--heading' : 'edit-actions';
    const actions = (
      <div className={actionsClass}>
        <button type="button" className="btn-save" onClick={save} disabled={saving} data-testid={`save-${fieldId}`}>
          {saving && <span className="spinner spinner--sm" aria-hidden="true" />}
          {saving ? 'Saving' : 'Save'}
        </button>
        <button type="button" className="btn-cancel" onClick={cancel} disabled={saving} data-testid={`cancel-${fieldId}`}>
          Cancel
        </button>
      </div>
    );
    const common = {
      id: inputId,
      ref: inputRef,
      value: draft,
      maxLength,
      onChange: (e) => setDraft(e.target.value),
      onKeyDown,
      'aria-label': label,
      'aria-invalid': Boolean(error),
      'aria-describedby': error ? errorId : undefined,
      disabled: saving,
    };
    const errorLine = error ? (
      <p className="edit-error" id={errorId} role="alert">
        {error}
      </p>
    ) : null;

    if (variant === 'story') {
      return (
        <div className="edit-form">
          <textarea {...common} className="edit-textarea" rows={8} />
          {actions}
          {errorLine}
        </div>
      );
    }
    if (variant === 'heading' || variant === 'footer') {
      return (
        <div className="edit-form edit-form--inline">
          <input {...common} type={inputType} className={`edit-input edit-input--${variant}`} />
          {actions}
          {errorLine}
        </div>
      );
    }
    return (
      <div className="edit-form">
        <input {...common} type={inputType} className={`edit-input edit-input--${variant}`} />
        {actions}
        {errorLine}
      </div>
    );
  }

  const shown = value ? renderDisplay(value) : <span className="placeholder-text">{placeholder}</span>;
  return (
    <div className="editable-display">
      {shown}
      {!hideTrigger && (
        <button
          type="button"
          className={`edit-pencil ${variant === 'name' ? '' : 'edit-pencil--sm'}`}
          onClick={onStartEdit}
          aria-label={`Edit ${label}`}
          data-testid={`edit-${fieldId}`}
        >
          <PencilIcon size={variant === 'name' ? 12 : 11} />
        </button>
      )}
    </div>
  );
}
