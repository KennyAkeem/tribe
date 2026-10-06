import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, GraduationCap, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

function normalizeSkillList(skills) {
  if (!Array.isArray(skills)) return [];
  const unique = new Set();
  for (const skill of skills) {
    const next = String(skill || "").trim();
    if (!next) continue;
    unique.add(next.replace(/\s+/g, " "));
  }
  return [...unique];
}

export const metadata = { title: "Skill Swap — Tribe" };

export default async function SkillSwapPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile = null;
  let matches = [];

  if (user) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url, teach_skills, learn_skills")
      .eq("id", user.id)
      .maybeSingle();

    profile = profileData;

    const { data: matchedProfiles, error: matchError } = await supabase.rpc("get_skill_swap_matches", {
      p_user_id: user.id,
      p_limit: 8,
    });

    if (!matchError) {
      matches = matchedProfiles ?? [];
    }
  }

  const teachSkills = normalizeSkillList(profile?.teach_skills ?? []);
  const learnSkills = normalizeSkillList(profile?.learn_skills ?? []);

  return (
    <main className="skill-swap-page">
      <section className="skill-swap-content">
        <span className="eyebrow">MEET PEOPLE WHO CAN HELP YOU GROW</span>
        <h1>Skill Swap</h1>
        <p className="skill-swap-lede">Trade what you know for what you want to learn. Tribe matches you with people who can teach you something and who might benefit from your expertise.</p>

        {!user ? (
          <div className="skill-swap-cta surface">
            <Sparkles size={22} />
            <div>
              <h2>Start exchanging skills</h2>
              <p>Sign in to set your teach and learn list and unlock matching suggestions.</p>
            </div>
            <Link className="skill-swap-link" href="/login?next=%2Fskill-swap">Sign in</Link>
          </div>
        ) : (
          <>
            <div className="skill-swap-grid">
              <article className="skill-swap-card surface">
                <div className="skill-swap-card-header">
                  <BookOpenCheck size={18} />
                  <h2>I can teach</h2>
                </div>
                {teachSkills.length ? (
                  <div className="skill-pills">
                    {teachSkills.map((skill) => <span key={skill} className="skill-pill teach">{skill}</span>)}
                  </div>
                ) : (
                  <p className="skill-swap-empty">Add a few skills you can share and Tribe will start suggesting people who want to learn them.</p>
                )}
              </article>

              <article className="skill-swap-card surface">
                <div className="skill-swap-card-header">
                  <GraduationCap size={18} />
                  <h2>I want to learn</h2>
                </div>
                {learnSkills.length ? (
                  <div className="skill-pills">
                    {learnSkills.map((skill) => <span key={skill} className="skill-pill learn">{skill}</span>)}
                  </div>
                ) : (
                  <p className="skill-swap-empty">Tell the community what you want to grow in and discover people who can help.</p>
                )}
              </article>
            </div>

            <div className="skill-swap-match-header">
              <h2>Best matches</h2>
              <Link href="/dashboard" className="skill-swap-link small">Update your skills <ArrowRight size={14} /></Link>
            </div>

            {matches.length ? (
              <div className="skill-swap-matches">
                {matches.map((match) => {
                  const canTeach = normalizeSkillList(match.can_teach ?? []);
                  const wantsToLearn = normalizeSkillList(match.wants_to_learn ?? []);
                  return (
                    <article key={match.matched_user_id} className="skill-swap-match surface">
                      <div className="skill-swap-match-head">
                        <span className="skill-swap-avatar">
                          {match.avatar_url ? <Image src={match.avatar_url} alt="" fill sizes="52px" unoptimized /> : (match.full_name || match.username || "T").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "T"}
                        </span>
                        <div>
                          <h3>{match.full_name || match.username || "Tribe member"}</h3>
                          <p>{match.username ? `@${match.username}` : "Member"}</p>
                        </div>
                        <span className="skill-match-score">{match.match_score} match</span>
                      </div>

                      <div className="skill-swap-match-details">
                        {canTeach.length ? (
                          <div>
                            <span className="skill-match-label">Can teach</span>
                            <div className="skill-pills compact">
                              {canTeach.map((skill) => <span key={`${match.matched_user_id}-teach-${skill}`} className="skill-pill teach">{skill}</span>)}
                            </div>
                          </div>
                        ) : null}

                        {wantsToLearn.length ? (
                          <div>
                            <span className="skill-match-label">Wants to learn</span>
                            <div className="skill-pills compact">
                              {wantsToLearn.map((skill) => <span key={`${match.matched_user_id}-learn-${skill}`} className="skill-pill learn">{skill}</span>)}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <Link className="skill-swap-link small" href={match.username ? `/profile/${encodeURIComponent(match.username)}` : `/profile/${match.matched_user_id}`}>
                        View profile
                      </Link>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="skill-swap-empty-panel surface">
                <p>No matches yet. Add a few skills to your profile so Tribe can find your next great connection.</p>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
