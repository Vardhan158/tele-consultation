import { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { LOCATION_KEY, readLocation, validLocation } from '../../lib/location';
import LocationModal from './LocationModal';
import './location.css';

const LocationContext = createContext(null);
export const useSelectedLocation = () => useContext(LocationContext);

export function ChangeLocationButton() {
  const { openSelector, selected } = useSelectedLocation();
  return <button type="button" className="kc-change-location" onClick={openSelector} title={selected?.address}>
    <span className="material-symbols-outlined" aria-hidden="true">location_on</span>
    <span>Change Location</span>
  </button>;
}

export default function LocationProvider({ children }) {
  const [identity, setIdentity] = useState(undefined);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const key = identity ? `${LOCATION_KEY}:${identity}` : LOCATION_KEY;

  useEffect(() => {
    if (identity === undefined) return;
    let cancelled = false;
    setOpen(false);
    setSelected(null);
    const restore = async () => {
      let saved = readLocation(key);
      if (identity) {
        try {
          const remote = await apiRequest('/profile/location', { signal: AbortSignal.timeout(8000) });
          if (validLocation(remote.location)) saved = remote.location;
        } catch { /* The selector remains usable when the profile service is offline. */ }
      }
      if (cancelled) return;
      setSelected(saved);
      let skipped = false;
      try { skipped = sessionStorage.getItem(`${key}:skipped`) === '1'; } catch { /* Optional storage. */ }
      setOpen(!saved && !skipped);
    };
    restore();
    return () => { cancelled = true; };
  }, [identity, key]);

  const skip = () => {
    try { sessionStorage.setItem(`${key}:skipped`, '1'); } catch { /* Still dismiss. */ }
    setOpen(false);
  };
  const confirm = async (value, consent) => {
    if (!validLocation(value)) throw new Error('Please select a valid address.');
    if (identity && consent) {
      await apiRequest('/profile/location', { method: 'PUT', signal: AbortSignal.timeout(15000), body: JSON.stringify({ location: value, consent: true }) });
    }
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { setNotice('Location selected for this visit. Your browser could not save it for future visits.'); }
    setSelected(value);
    setOpen(false);
  };
  return <LocationContext.Provider value={{ selected, setIdentity, openSelector: () => setOpen(true) }}>
    {children}
    {notice && <div className="kc-location-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss location notice">×</button></div>}
    {open && <LocationModal key={key} initial={selected} authenticated={Boolean(identity)} onSkip={skip} onConfirm={confirm} />}
  </LocationContext.Provider>;
}
