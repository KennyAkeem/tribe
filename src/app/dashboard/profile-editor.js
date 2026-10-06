"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Camera, LoaderCircle, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ProfileLocationControl from "./profile-location-control";

const avatarBucket = "avatars";
const maxAvatarSize = 5 * 1024 * 1024;
const allowedAvatarTypes = ["image/jpeg", "image/png", "image/webp"];

function parseSkills(value) {
  return Array.from(new Set(
    String(value || "")
      .split(/[\n,;]+/)
      .map((skill) => skill.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .filter((skill) => skill.length >= 2 && skill.length <= 40)
  ));
}

function initials(name) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "?";
}

function avatarStoragePath(url) {
  const marker = "/storage/v1/object/public/avatars/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;
  return decodeURIComponent(url.slice(markerIndex + marker.length).split("?")[0]);
}

function createUploadId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function ProfileEditor({ profile }) {
  const router = useRouter();
  const [fields, setFields] = useState({
    fullName: profile.fullName,
    username: profile.username,
    bio: profile.bio,
    teachSkills: profile.teachSkills?.join(", ") || "",
    learnSkills: profile.learnSkills?.join(", ") || "",
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview("");
      return undefined;
    }
    const previewUrl = URL.createObjectURL(avatarFile);
    setAvatarPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [avatarFile]);

  function updateField(event) {
    setFields((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function chooseAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!allowedAvatarTypes.includes(file.type)) {
      setFeedback("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > maxAvatarSize) {
      setFeedback("Profile photos must be 5 MB or smaller.");
      return;
    }
    setFeedback("");
    setRemoveAvatar(false);
    setAvatarFile(file);
  }

  async function saveProfile(event) {
    event.preventDefault();
    const fullName = fields.fullName.trim();
    const username = fields.username.trim().toLowerCase();
    const bio = fields.bio.trim();
    const teachSkills = parseSkills(fields.teachSkills);
    const learnSkills = parseSkills(fields.learnSkills);

    if (!fullName || fullName.length > 80) {
      setFeedback("Your name is required and must be 80 characters or fewer.");
      return;
    }
    if (username && !/^[a-z0-9_]{3,24}$/.test(username)) {
      setFeedback("Usernames must be 3-24 characters using letters, numbers, or underscores.");
      return;
    }
    if (bio.length > 280) {
      setFeedback("Your bio must be 280 characters or fewer.");
      return;
    }
    if (teachSkills.length > 20 || learnSkills.length > 20) {
      setFeedback("Keep each skill list to 20 skills or fewer.");
      return;
    }

    setBusy(true);
    setFeedback("");
    let supabase;
    let uploadedPath;
    try {
      supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setFeedback("Your session expired. Sign in again to update your profile.");
        return;
      }

      let avatarUrl = removeAvatar ? null : profile.avatarUrl || null;
      if (avatarFile) {
        const extension = avatarFile.type === "image/jpeg" ? "jpg" : avatarFile.type.split("/")[1];
        uploadedPath = `${user.id}/${Date.now()}-${createUploadId()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(avatarBucket).upload(uploadedPath, avatarFile, {
          cacheControl: "3600",
          contentType: avatarFile.type,
          upsert: false,
        });
        if (uploadError) {
          if (uploadError.message.includes("Bucket not found")) setFeedback("Apply the avatar-storage migration in Supabase, then try again.");
          else if (/failed to fetch|network|fetch error/i.test(uploadError.message)) setFeedback("Could not reach Supabase Storage. Check your phone's internet connection and try again.");
          else setFeedback(uploadError.message);
          return;
        }
        const { data } = supabase.storage.from(avatarBucket).getPublicUrl(uploadedPath);
        avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          username: username || null,
          bio,
          avatar_url: avatarUrl,
          teach_skills: teachSkills,
          learn_skills: learnSkills,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select("id")
        .single();

      if (updateError) {
        if (uploadedPath) await supabase.storage.from(avatarBucket).remove([uploadedPath]);
        if (updateError.code === "23505") setFeedback("That username is already taken.");
        else if (updateError.code === "23514") setFeedback("Choose a username with 3-24 letters, numbers, or underscores.");
        else if (/teach_skills|learn_skills|column .* does not exist/i.test(updateError.message)) {
          setFeedback("The profile schema is out of sync in Supabase. Run the latest migrations, then save again.");
        } else if (/row level security|policy|permission/i.test(updateError.message)) {
          setFeedback("Your profile update is being blocked by Supabase permissions. Check the policies for profiles and storage.");
        } else setFeedback(updateError.message || "The profile could not be saved.");
        return;
      }

      const oldPath = avatarStoragePath(profile.avatarUrl || "");
      const newPath = avatarStoragePath(avatarUrl || "");
      if (oldPath && oldPath !== newPath) await supabase.storage.from(avatarBucket).remove([oldPath]);

      setAvatarFile(null);
      setRemoveAvatar(false);
      setFeedback("Profile saved.");
      router.refresh();
    } catch (error) {
      if (uploadedPath && supabase) await supabase.storage.from(avatarBucket).remove([uploadedPath]);
      const message = error instanceof Error ? error.message : String(error || "");
      if (/Bucket not found/i.test(message)) {
        setFeedback("The avatars bucket is missing from Supabase. Apply the profile media migration, then try again.");
      } else if (/teach_skills|learn_skills|column .* does not exist/i.test(message)) {
        setFeedback("The profile schema is out of sync in Supabase. Run the latest migrations, then save again.");
      } else {
        setFeedback(message || "Could not reach Tribe or Supabase Storage. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const displayedAvatar = avatarPreview || (removeAvatar ? "" : profile.avatarUrl);

  return (
    <section className="profile-editor">
      <div className="profile-editor-heading">
        <div><span className="eyebrow">MAKE IT YOURS</span><h2>Edit your profile</h2></div>
        <span className="profile-editor-hint">Your profile is visible to Tribe members.</span>
      </div>
      <form onSubmit={saveProfile}>
        <div className="profile-photo-row">
          <span className="profile-photo-preview">
            {displayedAvatar
              ? <Image src={displayedAvatar} alt="" fill sizes="84px" unoptimized />
              : initials(fields.fullName)}
          </span>
          <div className="profile-photo-actions">
            <label className="profile-photo-upload">
              <Camera size={15} /> Change photo
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar} disabled={busy} />
            </label>
            {(profile.avatarUrl || avatarFile) && <button className="profile-photo-remove" type="button" onClick={() => { setAvatarFile(null); setRemoveAvatar(true); setFeedback(""); }} disabled={busy}><X size={14} /> Remove</button>}
            <span>JPG, PNG, or WebP, up to 5 MB</span>
          </div>
        </div>
        <div className="profile-editor-fields">
          <label>Full name<input name="fullName" value={fields.fullName} onChange={updateField} maxLength={80} autoComplete="name" required /></label>
          <label>Username<div className="profile-username-input"><span>@</span><input name="username" value={fields.username} onChange={updateField} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" autoComplete="username" placeholder="yourname" /></div></label>
          <label className="profile-bio-field">Bio<textarea name="bio" value={fields.bio} onChange={updateField} maxLength={280} rows={3} placeholder="A little about you" /></label>
          <label className="profile-skill-field">I can teach<textarea name="teachSkills" value={fields.teachSkills} onChange={updateField} rows={3} placeholder="HTML, Photoshop, Mathematics" /></label>
          <label className="profile-skill-field">I want to learn<textarea name="learnSkills" value={fields.learnSkills} onChange={updateField} rows={3} placeholder="Python, Guitar, Video editing" /></label>
        </div>
        <ProfileLocationControl initialLocation={profile.location} />
        <div className="profile-editor-footer">
          <p className="profile-editor-feedback" role="status" aria-live="polite">{feedback}</p>
          <button className="profile-save-button" type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}{busy ? "Saving..." : "Save profile"}</button>
        </div>
      </form>
    </section>
  );
}