import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

// Guards Page 2 and Portfolio: only signed-in, active coaches get through.
// Pending magic-link coaches have no session, so they are sent back to Page 1.
export function useActiveCoach() {
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, coach: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    api
      .me({ signal: controller.signal })
      .then((coach) => setState({ loading: false, coach, error: null }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (err.status === 401) navigate('/join', { replace: true });
        else setState({ loading: false, coach: null, error: err.message });
      });
    return () => controller.abort();
  }, [navigate]);

  return state;
}
