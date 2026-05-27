import { defaultLocale, Locale, normalizeLocale } from "./types";

export const localeStorageKey = "octo:locale";

function getLocaleFromQuery(): Locale | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    return normalizeLocale(params.get("locale"));
  } catch (_) {
    return undefined;
  }
}

function getLocaleFromStorage(): Locale | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return normalizeLocale(window.localStorage.getItem(localeStorageKey));
  } catch (_) {
    return undefined;
  }
}

function getLocaleFromNavigator(): Locale | undefined {
  if (typeof navigator === "undefined") return undefined;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const firstLanguage = languages.find(Boolean);
  if (!firstLanguage) return undefined;
  return firstLanguage.replace("_", "-").toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function detectLocale(explicitLocale?: string | Locale): Locale {
  return (
    normalizeLocale(explicitLocale) ||
    getLocaleFromQuery() ||
    getLocaleFromStorage() ||
    getLocaleFromNavigator() ||
    defaultLocale
  );
}
