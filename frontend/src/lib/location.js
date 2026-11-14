export const LOCATION_KEY = 'kaizen.location.v1';

export function validLocation(value) {
  return value?.version === 1 && typeof value.address === 'string' && value.address.trim().length > 0
    && ['city', 'state', 'country', 'postal_code'].every((key) => typeof value[key] === 'string')
    && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
    && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}

export function readLocation(key = LOCATION_KEY) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return validLocation(value) ? value : null;
  } catch { return null; }
}

export function normalizeLocation(result, position) {
  const components = result.address_components || result.addressComponents || [];
  const part = (...types) => {
    for (const type of types) {
      const component = components.find((item) => item.types.includes(type));
      if (component) return component.long_name || component.longText || '';
    }
    return '';
  };
  return {
    version: 1, address: result.formatted_address || result.formattedAddress || '',
    city: part('locality', 'postal_town', 'administrative_area_level_2'),
    state: part('administrative_area_level_1'), country: part('country'),
    postal_code: part('postal_code'), latitude: position.lat, longitude: position.lng,
  };
}

let mapsPromise;
export function loadGoogleMaps() {
  if (mapsPromise) return mapsPromise;
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error('Location maps are not configured yet. You can skip and continue.'));
  mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => fail(), 20000);
    const fail = () => {
      clearTimeout(timer);
      reject(new Error('Google Maps is unavailable. Please try again later or skip for now.'));
    };
    window.kaizenMapsReady = () => { clearTimeout(timer); resolve(window.google.maps); };
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: 'kaizenMapsReady' })}`;
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
  });
  return mapsPromise;
}
