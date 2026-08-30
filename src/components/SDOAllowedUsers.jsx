import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../utils/supabaseClient";
import { getCachedLogoSrc, useLogoCacheHydrated } from "../utils/logoCache";
import "./SDOAllowedUsers.css";

const ONLINE_WINDOW_MS = 120000;
const PROTECTED_CREATOR_EMAILS = new Set([
  "jaybhee84@gmail.com",
  "jl3hee@gmail.com",
]);
const formatDate = (value) => {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleString();
};
const isOnline = (row) => row?.status === "online" && row.last_seen && Date.now() - new Date(row.last_seen).getTime() < ONLINE_WINDOW_MS;

export default function SDOAllowedUsers({ currentUser }) {
  const [tab, setTab] = useState("registered");
  const [profiles, setProfiles] = useState([]);
  const [presence, setPresence] = useState([]);
  const [schools, setSchools] = useState([]);
  const [allowed, setAllowed] = useState([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useLogoCacheHydrated();

  const load = useCallback(async () => {
    setLoading(true);
    const [p, live, list, schoolList] = await Promise.all([
      supabase.from("bmi_profiles").select("id,email,fullname,position,school_id,school_name,role,created_at").eq("role", "school").order("fullname"),
      supabase.from("user_presence").select("user_id,email,status,last_seen").eq("app_id", "bmi"),
      supabase.from("bmi_allowed_users").select("id,email,added_by,created_at").order("created_at", { ascending: false }),
      supabase.from("schools").select("school_id,name,logo_url").order("name"),
    ]);
    const error = p.error || live.error || list.error || schoolList.error;
    if (error) setMessage(error.message || "Unable to load users.");
    setProfiles(p.data || []);
    setPresence(live.data || []);
    setAllowed(list.data || []);
    setSchools(schoolList.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase.channel("sdo-bmi-users")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bmi_profiles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bmi_allowed_users" }, load)
      .subscribe();
    const timer = window.setInterval(load, 30000);
    return () => { window.clearInterval(timer); supabase.removeChannel(channel); };
  }, [load]);

  const presenceByUser = useMemo(() => {
    const result = new Map();
    presence.forEach((row) => {
      if (row.user_id) result.set(String(row.user_id), row);
      if (row.email) result.set(row.email.toLowerCase(), row);
    });
    return result;
  }, [presence]);

  const schoolsById = useMemo(() => new Map(
    schools.map((school) => [String(school.school_id), school]),
  ), [schools]);

  const isCreator =
    currentUser?.email?.trim().toLowerCase() === "jaybhee84@gmail.com" ||
    currentUser?.username?.trim().toLowerCase() === "admin1";
  const visibleAllowed = useMemo(
    () => isCreator
      ? allowed
      : allowed.filter((row) => !PROTECTED_CREATOR_EMAILS.has(row.email?.trim().toLowerCase())),
    [allowed, isCreator],
  );

  async function addEmail(event) {
    event.preventDefault();
    const entered = email.trim().toLowerCase();
    const localPart = entered.endsWith("@deped.gov.ph")
      ? entered.slice(0, -"@deped.gov.ph".length)
      : entered;
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)) return setMessage("Enter a valid DepEd email username.");
    const normalized = `${localPart}@deped.gov.ph`;
    if (allowed.some((row) => row.email.toLowerCase() === normalized)) return setMessage("That email is already allowed.");
    setSaving(true);
    const { error } = await supabase.from("bmi_allowed_users").insert({ email: normalized, added_by: currentUser?.email || currentUser?.username || "SDO" });
    setSaving(false);
    if (error) setMessage(error.message);
    else { setEmail(""); setMessage(`${normalized} can now register.`); await load(); }
  }

  async function removeEmail(row) {
    if (!window.confirm(`Remove ${row.email} from the registration allowlist?`)) return;
    const { error } = await supabase.from("bmi_allowed_users").delete().eq("id", row.id);
    if (error) setMessage(error.message);
    else { setMessage(`${row.email} removed from the allowlist.`); setAllowed((items) => items.filter((item) => item.id !== row.id)); }
  }

  return <div className="page sdo-users-page">
    <h1 className="page-title">Allowed Users</h1>
    <p className="page-sub">Manage School-Based registration access and view registered accounts.</p>
    <div className="sdo-users-tabs">
      <button className={tab === "registered" ? "active" : ""} onClick={() => setTab("registered")}>Registered Users ({profiles.length})</button>
      <button className={tab === "allowed" ? "active" : ""} onClick={() => setTab("allowed")}>Allowed Emails ({visibleAllowed.length})</button>
    </div>
    {message && <div className="sdo-users-message">{message}</div>}
    {tab === "allowed" ? <div className="card sdo-users-card">
      <form className="sdo-allow-form" onSubmit={addEmail}><div className="sdo-email-input"><input className="form-input" type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email username" autoCapitalize="none" autoCorrect="off" /><span>@deped.gov.ph</span></div><button className="btn btn-primary" disabled={saving}>{saving ? "Adding…" : "+ Add Email"}</button></form>
      <p className="sdo-users-help"><strong>Hint:</strong> Enter only the email username—the <span>@deped.gov.ph</span> domain is added automatically. Only emails listed here can create a BMI app account.</p>
      {loading ? <div className="sdo-users-empty">Loading…</div> : visibleAllowed.length === 0 ? <div className="sdo-users-empty">No allowed emails yet.</div> : <div className="sdo-users-list">{visibleAllowed.map((row) => <div className="sdo-allowed-row" key={row.id}><div><strong>{row.email}</strong><span>Added by {row.added_by || "—"} · {formatDate(row.created_at)}</span></div><button className="sdo-remove-btn" onClick={() => removeEmail(row)}>Remove</button></div>)}</div>}
    </div> : <div className="card sdo-users-card">
      {loading ? <div className="sdo-users-empty">Loading…</div> : profiles.length === 0 ? <div className="sdo-users-empty">No registered School-Based users yet.</div> : <div className="sdo-users-table-wrap"><table className="data-table sdo-users-table"><thead><tr><th>Full Name</th><th>Email</th><th className="sdo-school-column">School</th><th>Position</th><th>Status</th><th>Last Login / Activity</th></tr></thead><tbody>{profiles.map((profile) => { const live = presenceByUser.get(String(profile.id)) || presenceByUser.get((profile.email || "").toLowerCase()); const online = isOnline(live); const school = schoolsById.get(String(profile.school_id)); const schoolName = school?.name || profile.school_name || "Not assigned"; const logo = getCachedLogoSrc(schoolName) || school?.logo_url; return <tr key={profile.id}><td><strong>{profile.fullname || "—"}</strong></td><td>{profile.email}</td><td className="sdo-school-column"><div className="sdo-school-cell">{logo ? <img src={logo} alt="" /> : <span className="sdo-school-logo-fallback">{schoolName === "Not assigned" ? "—" : schoolName.charAt(0)}</span>}<div><strong>{schoolName}</strong>{profile.school_id && <small>School ID: {profile.school_id}</small>}</div></div></td><td>{profile.position || "—"}</td><td><span className={`sdo-presence ${online ? "online" : "offline"}`}><i />{online ? "Online" : "Offline"}</span></td><td>{formatDate(live?.last_seen)}</td></tr>; })}</tbody></table></div>}
    </div>}
  </div>;
}
