"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Headset, Mail, MessageCircle } from "lucide-react";

const tawkScriptId = "tribe-tawk-live-chat";

export default function ContactClient() {
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatError, setChatError] = useState("");
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      if (window.Tawk_API) {
        window.Tawk_API.minimize?.();
        window.Tawk_API.hideWidget?.();
      }
    };
  }, []);

  function handleTawkReady() {
    if (!activeRef.current) {
      window.Tawk_API?.hideWidget?.();
      return;
    }
    window.Tawk_API?.showWidget?.();
    window.Tawk_API?.maximize?.();
    setChatLoading(false);
    setChatOpen(true);
    setChatError("");
  }

  function openLiveChat() {
    setChatError("");
    if (chatOpen) {
      window.Tawk_API?.minimize?.();
      window.Tawk_API?.hideWidget?.();
      setChatOpen(false);
      return;
    }

    const api = window.Tawk_API = window.Tawk_API || {};
    if (typeof api.maximize === "function") {
      api.showWidget?.();
      api.maximize();
      setChatOpen(true);
      return;
    }

    setChatLoading(true);
    api.onLoad = handleTawkReady;
    api.onChatMaximized = () => { if (activeRef.current) setChatOpen(true); };
    api.onChatMinimized = () => {
      if (activeRef.current) setChatOpen(false);
      window.Tawk_API?.hideWidget?.();
    };

    if (document.getElementById(tawkScriptId)) return;

    window.Tawk_LoadStart = new Date();
    const script = document.createElement("script");
    script.id = tawkScriptId;
    script.async = true;
    script.src = "https://embed.tawk.to/6ac3d87decb13c34c153df7e/1k46gbarl";
    script.charset = "UTF-8";
    script.setAttribute("crossorigin", "*");
    script.onerror = () => {
      if (!activeRef.current) return;
      setChatLoading(false);
      setChatError("Live chat could not connect. Please email our support team instead.");
      script.remove();
    };
    document.head.appendChild(script);
  }

  return <main className="settings-page">
    <div className="settings-content contact-content">
      <Link className="contact-back" href="/settings"><ArrowLeft size={15} />Settings</Link>
      <header className="settings-heading contact-heading">
        <span className="eyebrow">TRIBE SUPPORT</span>
        <h1>Get in touch</h1>
        <p>We’re here to help. Choose the way that works best for you.</p>
      </header>

      <div className="contact-options">
        <section className="contact-option">
          <span className="contact-option-icon"><Mail size={19} /></span>
          <div className="contact-option-copy">
            <span className="eyebrow">EMAIL SUPPORT</span>
            <h2>Send us a note</h2>
            <p>Write to the Tribe support team and we’ll get back to you.</p>
            <a className="contact-email-link" href="mailto:tribesupportcenter@gmail.com">tribesupportcenter@gmail.com</a>
          </div>
        </section>

        <section className="contact-option livechat-option">
          <span className="contact-option-icon"><Headset size={19} /></span>
          <div className="contact-option-copy">
            <span className="eyebrow">LIVE CHAT</span>
            <h2>Talk to us live</h2>
            <p>Start a conversation with our support team in the chat window.</p>
            <button className="contact-chat-button" type="button" onClick={openLiveChat} disabled={chatLoading} aria-expanded={chatOpen}>
              {chatLoading ? <><span className="contact-chat-spinner" />Connecting...</> : chatOpen ? <><Check size={16} />Close live chat</> : <><MessageCircle size={16} />Start live chat</>}
            </button>
            {chatError && <p className="contact-chat-error" role="alert">{chatError}</p>}
            {chatLoading && <p className="contact-chat-status" role="status">Connecting you to Tribe support...</p>}
          </div>
        </section>
      </div>
    </div>
  </main>;
}
