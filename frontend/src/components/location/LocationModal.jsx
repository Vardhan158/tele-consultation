import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadGoogleMaps, normalizeLocation, validLocation } from '../../lib/location';

export default function LocationModal({ initial, authenticated, onSkip, onConfirm }) {
  const dialog = useRef(null);
  const mapNode = useRef(null);
  const searchNode = useRef(null);
  const selectPosition = useRef(null);
  const generation = useRef(0);
  const [selected, setSelected] = useState(initial);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.current.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let marker;
    const invalidate = () => { generation.current++; };
    const listeners = [];
    const previousAuthFailure = window.gm_authFailure;
    const unavailable = () => {
      if (!disposed) { generation.current++; setBusy(false); setReady(false); setError('Google Maps could not load. Please try again later or skip for now.'); }
    };
    window.gm_authFailure = unavailable;
    loadGoogleMaps().then(async (maps) => {
      const [{ Map }, { AdvancedMarkerElement }, { PlaceAutocompleteElement }, { Geocoder }] = await Promise.all([
        maps.importLibrary('maps'), maps.importLibrary('marker'), maps.importLibrary('places'), maps.importLibrary('geocoding'),
      ]);
      if (disposed) return;
      const center = initial ? { lat: initial.latitude, lng: initial.longitude } : { lat: 20.5937, lng: 78.9629 };
      const map = new Map(mapNode.current, { center, zoom: initial ? 15 : 5, mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID', mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      marker = new AdvancedMarkerElement({ map, position: center, gmpDraggable: true, title: 'Selected location: drag to move' });
      const geocoder = new Geocoder();
      const startSelection = () => { const id = ++generation.current; setSelected(null); setBusy(true); setError(''); return id; };
      const resolvePosition = async (position, id = startSelection()) => {
        if (disposed || id !== generation.current) return;
        marker.position = position;
        map.panTo(position);
        map.setZoom(15);
        try {
          const { results } = await geocoder.geocode({ location: position });
          if (disposed || id !== generation.current) return;
          const value = normalizeLocation(results[0] || {}, position);
          if (!validLocation(value)) throw new Error('No address found');
          setSelected(value);
        } catch {
          if (!disposed && id === generation.current) setError('Unable to find an address here. Try another point or search for an address.');
        } finally { if (!disposed && id === generation.current) setBusy(false); }
      };
      selectPosition.current = { resolvePosition, startSelection };
      listeners.push(marker.addListener('dragstart', startSelection));
      listeners.push(marker.addListener('dragend', () => {
        const p = marker.position;
        resolvePosition({ lat: typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.lng === 'function' ? p.lng() : p.lng });
      }));
      listeners.push(map.addListener('click', (event) => { if (event.latLng) resolvePosition(event.latLng.toJSON()); }));
      const search = new PlaceAutocompleteElement({});
      search.setAttribute('aria-label', 'Search location');
      searchNode.current.replaceChildren(search);
      search.addEventListener('gmp-error', () => { if (!disposed) setError('Address search is unavailable. Try the map or skip for now.'); });
      search.addEventListener('gmp-select', async ({ placePrediction }) => {
        const id = startSelection();
        try {
          const place = placePrediction.toPlace();
          await place.fetchFields({ fields: ['formattedAddress', 'addressComponents', 'location'] });
          if (disposed || id !== generation.current) return;
          const position = place.location.toJSON();
          const value = normalizeLocation(place, position);
          if (!validLocation(value)) throw new Error('No address');
          marker.position = position; map.panTo(position); map.setZoom(15);
          setSelected(value);
        } catch { if (!disposed && id === generation.current) setError('Could not retrieve that address. Try another search or map selection.'); }
        finally { if (!disposed && id === generation.current) setBusy(false); }
      });
      setReady(true);
    }).catch((err) => { if (!disposed) setError(err.message || 'Maps unavailable. You can skip for now.'); });
    return () => {
      disposed = true; invalidate(); selectPosition.current = null;
      listeners.forEach((listener) => listener.remove());
      if (marker) marker.map = null;
      if (window.gm_authFailure === unavailable) window.gm_authFailure = previousAuthFailure;
    };
  }, [initial]);

  const detect = () => {
    if (!navigator.geolocation) { setError('Your browser does not support location detection. Search or choose a point on the map.'); return; }
    const handlers = selectPosition.current;
    if (!handlers) return;
    const id = handlers.startSelection();
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { if (id === generation.current) handlers.resolvePosition({ lat: coords.latitude, lng: coords.longitude }, id); },
      (err) => {
        if (id !== generation.current) return;
        setBusy(false);
        setError(err.code === 1 ? 'Location permission was denied. You can still search or select on the map.' : 'Your current location is unavailable. Search or choose a point on the map.');
      }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  };
  const confirm = async () => {
    setSaving(true); setError('');
    try { await onConfirm(selected, consent); }
    catch { setError('Your location could not be saved to your profile. Retry, or uncheck profile storage to keep it on this device.'); setSaving(false); }
  };

  return createPortal(<dialog ref={dialog} className="kc-location-dialog" aria-labelledby="kc-location-title" onCancel={(event) => { event.preventDefault(); if (!saving) onSkip(); }}>
    <div className="kc-location-content">
      <div className="kc-location-heading"><div><p className="kc-location-eyebrow">KAIZEN CARE · YOUR CARE, CLOSER</p><h2 id="kc-location-title">Where would you like care?</h2></div><button onClick={onSkip} disabled={saving} aria-label="Close location selector">×</button></div>
      <p className="kc-location-intro">Choose your location for local doctor discovery where available. You can change it anytime.</p>
      <div ref={searchNode} className="kc-location-search" />
      <button className="kc-location-detect" onClick={detect} disabled={!ready || busy || saving}><span className="material-symbols-outlined" aria-hidden="true">my_location</span>Detect My Current Location</button>
      <p className="kc-location-hint">Or click the map or drag the marker to select manually.</p>
      <div ref={mapNode} className="kc-location-map" aria-label="Location selection map" />
      {!ready && !error && <p role="status">Loading Google Maps…</p>}
      {busy && <p role="status">Finding your address…</p>}
      {error && <p className="kc-location-error" role="alert">{error}</p>}
      <div className="kc-location-preview" aria-live="polite">
        <strong>{selected?.address || 'Select a location to preview its address'}</strong>
        {selected && <><dl>{[['City', selected.city], ['State', selected.state], ['Country', selected.country], ['Postal code', selected.postal_code]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl><p>Coordinates: {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}</p></>}
      </div>
      {authenticated && <label className="kc-location-consent"><input type="checkbox" checked={consent} disabled={saving} onChange={(event) => setConsent(event.target.checked)} />I consent to saving this location to my Kaizen Care profile for location-based doctor discovery.</label>}
      <p className="kc-location-hint">{authenticated ? 'Without profile consent, your choice stays on this device.' : 'Your confirmed location is saved on this device.'} Google Maps processes map and address searches.</p>
      <div className="kc-location-actions"><button onClick={onSkip} disabled={saving}>Skip for Now</button><button className="kc-location-confirm" onClick={confirm} disabled={!validLocation(selected) || busy || saving}>{saving ? 'Saving…' : 'Confirm Location'}</button></div>
    </div>
  </dialog>, document.body);
}
