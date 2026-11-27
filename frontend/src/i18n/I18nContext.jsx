import React, { createContext, useContext, useState, useEffect } from "react";
import { translations, SUPPORTED_LANGUAGES } from "./translations";

const I18nContext = createContext({
  language: "en",
  changeLanguage: () => {},
  t: (key, fallback = "") => fallback,
  languages: SUPPORTED_LANGUAGES,
});

export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem("kaizen_locale") || "en";
    } catch {
      return "en";
    }
  });

  const changeLanguage = (code) => {
    if (translations[code]) {
      setLanguage(code);
      try {
        localStorage.setItem("kaizen_locale", code);
      } catch {
        // Fallback
      }
    }
  };

  const t = (path, fallback = "") => {
    if (!path) return fallback;
    const parts = path.split(".");
    let current = translations[language] || translations["en"];
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        // Fall back to English
        let fallbackCurrent = translations["en"];
        for (const fbPart of parts) {
          if (fallbackCurrent && typeof fallbackCurrent === "object" && fbPart in fallbackCurrent) {
            fallbackCurrent = fallbackCurrent[fbPart];
          } else {
            return fallback || path;
          }
        }
        return typeof fallbackCurrent === "string" ? fallbackCurrent : fallback || path;
      }
    }
    return typeof current === "string" ? current : fallback || path;
  };

  return (
    <I18nContext.Provider value={{ language, changeLanguage, t, languages: SUPPORTED_LANGUAGES }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
