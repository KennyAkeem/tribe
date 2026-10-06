"use client";

import Link from "next/link";
import { ArrowRight, Check, MessageCircle, Moon, Monitor, Sun, UsersRound } from "lucide-react";
import { useAppearance } from "@/components/appearance-provider";
import appPackage from "../../../package.json";

const colorModes = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
];

const uiStyles = [
  { id: "glass", number: "01", name: "Glass UI", label: "Glassmorphism", description: "Translucent layers, soft blur, and crisp edges." },
  { id: "clay", number: "02", name: "Clay UI", label: "Claymorphism", description: "Puffy surfaces, rounded forms, and gentle depth." },
  { id: "skeuomorphic", number: "03", name: "Real object UI", label: "Skeuomorphism", description: "Tactile materials with dimensional controls." },
  { id: "neumorphic", number: "04", name: "Soft surface UI", label: "Neumorphism", description: "Quiet, pressed-in shapes and soft shadows." },
];

export default function SettingsClient() {
  const { settings, updateSetting } = useAppearance();

  return <main className="settings-page">
    <div className="settings-content">
      <header className="settings-heading">
        <span className="eyebrow">MAKE IT YOURS</span>
        <h1>Settings</h1>
        <p>Shape how Tribe looks and feels on this device.</p>
      </header>

      <section className="settings-section" aria-labelledby="appearance-heading">
        <div className="settings-section-heading">
          <div><span className="eyebrow">APPEARANCE</span><h2 id="appearance-heading">Color mode</h2></div>
          <span className="settings-current-value">{settings.colorMode === "system" ? "Follows device" : `${settings.colorMode} mode`}</span>
        </div>
        <div className="settings-mode-options" role="group" aria-label="Color mode">
          {colorModes.map(({ id, label, Icon }) => <button
            key={id}
            type="button"
            className={`settings-mode-option${settings.colorMode === id ? " selected" : ""}`}
            aria-pressed={settings.colorMode === id}
            onClick={() => updateSetting("colorMode", id)}
          ><Icon size={17} /><span>{label}</span>{settings.colorMode === id && <Check size={15} />}</button>)}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="ui-style-heading">
        <div className="settings-section-heading">
          <div><span className="eyebrow">INTERFACE</span><h2 id="ui-style-heading">Choose your UI</h2></div>
          <span className="settings-current-value">{uiStyles.find(({ id }) => id === settings.uiStyle)?.name}</span>
        </div>
        <div className="settings-theme-grid" role="group" aria-label="Interface style">
          {uiStyles.map((style) => <button
            key={style.id}
            type="button"
            className={`settings-theme-option${settings.uiStyle === style.id ? " selected" : ""}`}
            data-preview-style={style.id}
            aria-pressed={settings.uiStyle === style.id}
            onClick={() => updateSetting("uiStyle", style.id)}
          >
            <span className="settings-theme-art" aria-hidden="true"><i /><i /><i /><b /></span>
            <span className="settings-theme-copy"><span className="settings-theme-number">{style.number}</span><strong>{style.name}</strong><small>{style.label}</small><span className="settings-theme-description">{style.description}</span></span>
            {settings.uiStyle === style.id && <span className="settings-theme-check" aria-label="Selected"><Check size={14} /></span>}
          </button>)}
        </div>
      </section>

      <section className="settings-section settings-preference-section" aria-labelledby="comfort-heading">
        <div className="settings-section-heading"><div><span className="eyebrow">COMFORT</span><h2 id="comfort-heading">Layout and motion</h2></div></div>
        <label className="settings-switch-row">
          <span><strong>Compact layout</strong><small>Reduce spacing to fit more into each view.</small></span>
          <input type="checkbox" role="switch" checked={settings.compact} onChange={(event) => updateSetting("compact", event.target.checked)} />
        </label>
        <label className="settings-switch-row">
          <span><strong>Reduce motion</strong><small>Limit interface animation and transitions.</small></span>
          <input type="checkbox" role="switch" checked={settings.reduceMotion} onChange={(event) => updateSetting("reduceMotion", event.target.checked)} />
        </label>
        <p className="settings-device-note">These preferences are saved on this device and do not change your profile.</p>
      </section>

      <section className="settings-section settings-contact-section" aria-labelledby="contact-heading">
        <div className="settings-section-heading"><div><span className="eyebrow">SUPPORT</span><h2 id="contact-heading">Need a hand?</h2></div></div>
        <p>Reach the Tribe team by email or start a live chat.</p>
        <Link className="settings-contact-link" href="/settings/contact"><MessageCircle size={17} /><span>Get in touch</span><ArrowRight size={16} /></Link>
      </section>

      <section className="settings-section settings-about-section" aria-labelledby="about-heading">
        <div className="settings-about-brand">
          <span className="settings-about-icon"><UsersRound size={20} /></span>
          <div><span className="eyebrow">ABOUT TRIBE</span><h2 id="about-heading">Tribe Social App</h2><p>A place to find your people, exchange skills, and share what matters.</p></div>
        </div>
        <dl className="settings-app-info">
          <div><dt>Version</dt><dd>{appPackage.version}</dd></div>
          <div><dt>Platform</dt><dd>Web app</dd></div>
        </dl>
      </section>
    </div>
  </main>;
}