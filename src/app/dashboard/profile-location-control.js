"use client";

import { useState } from "react";
import { LoaderCircle, MapPin, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 0,
      timeout: 15000,
    });
  });
}

function describePositionError(error) {
  if (error.code === 1) return "Location access was not allowed. You can enable it in your browser settings.";
  if (error.code === 2) return "Your current location is unavailable. Try again outside or near a window.";
  if (error.code === 3) return "Location lookup took too long. Try again.";
  return "Your browser could not get your location.";
}

function cityLabel(address = {}) {
  const city = address.city || address.town || address.village || address.municipality || address.hamlet;
  const region = address.state || address.province || address.region;
  const country = address.country;
  const parts = [city, region, country].filter(Boolean);
  return [...new Set(parts)].join(", ").slice(0, 120);
}

export default function ProfileLocationControl({ initialLocation = "" }) {
  const router = useRouter();
  const [location, setLocation] = useState(initialLocation);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function saveLocation(value) {
    const { data, error } = await createClient().rpc("set_my_profile_location", { p_location: value });
    if (error) {
      if (error.message.includes("set_my_profile_location")) {
        throw new Error("Apply the 202610060004_profile_location.sql migration, then try again.");
      }
      throw new Error(error.message);
    }
    const savedLocation = data || "";
    setLocation(savedLocation);
    router.refresh();
  }

  async function updateLocation() {
    if (!navigator.geolocation) {
      setFeedback("Your browser does not support location access.");
      return;
    }
    setBusy(true);
    setFeedback("");
    try {
      const position = await getBrowserPosition();
      const latitude = (Math.round(position.coords.latitude * 10) / 10).toFixed(1);
      const longitude = (Math.round(position.coords.longitude * 10) / 10).toFixed(1);
      const parameters = new URLSearchParams({ lat: latitude, lon: longitude });
      const response = await fetch(`/api/location/reverse?${parameters}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The location service is unavailable. Try again later.");
      const nextLocation = cityLabel(result.address);
      if (!nextLocation) throw new Error("A city-level location could not be found here.");
      await saveLocation(nextLocation);
      setFeedback("Your city-level location is now public on your profile.");
    } catch (error) {
      setFeedback(error.code ? describePositionError(error) : error.message || "Could not update your location.");
    } finally {
      setBusy(false);
    }
  }

  async function removeLocation() {
    setBusy(true);
    setFeedback("");
    try {
      await saveLocation(null);
      setFeedback("Your profile location was removed.");
    } catch (error) {
      setFeedback(error.message || "Could not remove your location.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="profile-location-editor" aria-labelledby="profile-location-heading">
    <div className="profile-location-editor-copy">
      <span className="skill-label" id="profile-location-heading">Profile location</span>
      <strong>{location || "No location shared"}</strong>
      <small>Only your city and region are shown publicly. Rounded coordinates go to OpenStreetMap for lookup; precise coordinates are not saved.</small>
      <small>Location lookup: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></small>
    </div>
    <div className="profile-location-editor-actions">
      <button className="profile-location-update" type="button" onClick={() => void updateLocation()} disabled={busy}>
        {busy ? <LoaderCircle size={15} className="spin" /> : location ? <RefreshCw size={15} /> : <MapPin size={15} />}
        {busy ? "Updating..." : location ? "Update location" : "Share my location"}
      </button>
      {location && <button className="profile-photo-remove" type="button" onClick={() => void removeLocation()} disabled={busy}><X size={14} />Remove</button>}
    </div>
    {feedback && <p className="profile-location-feedback" role="status" aria-live="polite">{feedback}</p>}
  </section>;
}
