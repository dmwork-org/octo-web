import { IconLanguage, IconTick } from "@douyinfe/semi-icons";
import React from "react";
import { Locale, useI18n } from "../../i18n";

function getNextLocale(locale: Locale): Locale {
  return locale === "zh-CN" ? "en-US" : "zh-CN";
}

export default function NavLanguageSwitcher() {
  const [open, setOpen] = React.useState(false);
  const { locale, setLocale, t } = useI18n();
  const nextLocale = getNextLocale(locale);
  const titleKey = nextLocale === "en-US"
    ? "base.navRail.language.switchToEnglish"
    : "base.navRail.language.switchToChinese";
  const title = t(titleKey);
  const locales: Array<{ locale: Locale; labelKey: string }> = [
    { locale: "zh-CN", labelKey: "base.navRail.language.name.zh" },
    { locale: "en-US", labelKey: "base.navRail.language.name.en" },
  ];

  const handleSelect = (next: Locale) => {
    setLocale(next);
    setOpen(false);
  };

  return (
    <div className="wk-navrail__language-wrap">
      <button
        type="button"
        className={`wk-navrail__item wk-navrail__language${open ? " wk-navrail__language--open" : ""}`}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <IconLanguage aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="wk-navrail__language-mask" onClick={() => setOpen(false)} />
          <div className="wk-navrail__language-menu" role="menu">
            {locales.map((item) => {
              const active = item.locale === locale;
              return (
                <button
                  key={item.locale}
                  type="button"
                  className={`wk-navrail__language-menu-item${active ? " wk-navrail__language-menu-item--active" : ""}`}
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => handleSelect(item.locale)}
                >
                  <span className="wk-navrail__language-menu-label">{t(item.labelKey)}</span>
                  {active && <IconTick aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export { NavLanguageSwitcher };
