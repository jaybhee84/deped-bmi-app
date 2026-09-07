import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, SUPABASE_URL } from "../utils/supabaseClient";
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
const roleLabel = (value) => value === "division" ? "SDO Based" : value === "school" ? "School Based" : "Any Role";

export default function SDOAllowedUsers({ currentUser }) {
  const [tab, setTab] = useState("registered");
  const [profiles, setProfiles] = useState([]);
  const [presence, setPresence] = useState([]);
  const [schools, setSchools] = useState([]);
  const [allowed, setAllowed] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("school");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [message, setMessage] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const loadVersion = useRef(0);
  useLogoCacheHydrated();

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
    const [p, live, list, schoolList] = await Promise.all([
      supabase.from("bmi_profiles").select("id,email,fullname,position,school_id,school_name,role,created_at").eq("role", "school").order("fullname"),
      supabase.from("user_presence").select("user_id,email,status,last_seen").eq("app_id", "bmi"),
      supabase.from("bmi_allowed_users").select("id,email,role,added_by,created_at").order("created_at", { ascending: false }),
      supabase.from("schools").select("school_id,name,logo_url").order("name"),
    ]);
    if (version !== loadVersion.current) return;
    const error = p.error || live.error || list.error || schoolList.error;
    if (error) setMessage(error.message || "Unable to load users.");
    setProfiles(p.data || []);
    setPresence(live.data || []);
    setAllowed(list.data || []);
    setSchools(schoolList.data || []);
    setLastRefreshed(error ? null : new Date().toISOString());
    } catch (error) {
      if (version !== loadVersion.current) return;
      setMessage(error.message || "Unable to refresh users from Supabase.");
      setLastRefreshed(null);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const channel = supabase.channel("sdo-bmi-users")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bmi_profiles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bmi_allowed_users" }, load)
      .subscribe();
    const timer = window.setInterval(load, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", load);
    window.addEventListener("online", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      // Invalidate the latest request; this ref is a counter, not a DOM node.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      ++loadVersion.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("online", load);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
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
    const { error } = await supabase.from("bmi_allowed_users").insert({ email: normalized, role, added_by: currentUser?.email || currentUser?.username || "SDO" });
    setSaving(false);
    if (error) setMessage(error.message);
    else { setEmail(""); setMessage(`${normalized} can now register as ${role === "division" ? "SDO Based" : "School Based"}.`); await load(); }
  }

  async function removeEmail(row) {
    if (removingId !== null) return;
    const confirmed = window.confirm(`Permanently delete ${row.email} from Supabase Authentication, registered BMI users, and the registration allowlist? They will need to be allowed and register again to use the app.`);
    window.electronAPI?.forceRefocusWindow?.();
    if (!confirmed) return;
    setRemovingId(row.id);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("remove_bmi_user_access", {
        target_email: row.email,
      });
      if (error) throw error;
      if (typeof data?.auth !== "number") {
        await load();
        throw new Error("The database removal function needs the Auth deletion migration. The Auth account has not been confirmed deleted.");
      }
      if (data.allowed + data.profiles + data.auth === 0) {
        throw new Error("Supabase did not confirm the deletion. Refresh the list and check that your account has permission to delete allowed emails.");
      }
      const matchesEmail = (item) => item.email?.trim().toLowerCase() === row.email.trim().toLowerCase();
      setAllowed((items) => items.filter((item) => !matchesEmail(item)));
      setProfiles((items) => items.filter((item) => !matchesEmail(item)));
      setMessage(`${row.email} removed from Supabase Authentication, registered BMI users, and the allowlist.`);
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to delete the email from Supabase. Please try again.");
    } finally {
      setRemovingId(null);
    }
  }

  return <div className="page sdo-users-page">
    <h1 className="page-title">Allowed Users</h1>
    <p className="page-sub">Manage School-Based registration access and view registered accounts.</p>
    <div className="sdo-users-help">
      <button type="button" className="btn" disabled={loading} onClick={load}>{loading ? "Refreshing..." : "Refresh users"}</button>
      {" "}Database: {new URL(SUPABASE_URL).hostname} · {lastRefreshed ? `Updated ${formatDate(lastRefreshed)}` : "Waiting for a successful refresh"}
    </div>
    <div className="sdo-users-tabs">
      <button className={tab === "registered" ? "active" : ""} onClick={() => setTab("registered")}>Registered Users ({profiles.length})</button>
      <button className={tab === "allowed" ? "active" : ""} onClick={() => setTab("allowed")}>Allowed Emails ({visibleAllowed.length})</button>
    </div>
    {message && <div className="sdo-users-message">{message}</div>}
    {tab === "allowed" ? <div className="card sdo-users-card">
      <form className="sdo-allow-form" onSubmit={addEmail}><div className="sdo-email-input"><input className="form-input" type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email username" autoCapitalize="none" autoCorrect="off" /><span>@deped.gov.ph</span></div><select className="form-input sdo-role-select" value={role} onChange={(e) => setRole(e.target.value)}><option value="school">School Based</option><option value="division">SDO Based</option></select><button className="btn btn-primary" disabled={saving}>{saving ? "Adding…" : "+ Add Email"}</button></form>
      <p className="sdo-users-help"><strong>Hint:</strong> Enter only the email username—the <span>@deped.gov.ph</span> domain is added automatically. The role you pick here locks in the account type, so the registrant still ends up correctly registered even if they open the wrong register card. Only emails listed here can create a BMI app account.</p>
      {loading ? <div className="sdo-users-empty">Loading…</div> : visibleAllowed.length === 0 ? <div className="sdo-users-empty">No allowed emails yet.</div> : <div className="sdo-users-list">{visibleAllowed.map((row) => <div className="sdo-allowed-row" key={row.id}><div><strong>{row.email}</strong><span>{roleLabel(row.role)} · Added by {row.added_by || "—"} · {formatDate(row.created_at)}</span></div><button className="sdo-remove-btn" disabled={removingId !== null} onClick={() => removeEmail(row)}>{removingId === row.id ? "Removing..." : "Remove"}</button></div>)}</div>}
    </div> : <div className="card sdo-users-card">
      {loading ? <div className="sdo-users-empty">Loading…</div> : profiles.length === 0 ? <div className="sdo-users-empty">No registered School-Based users yet.</div> : <div className="sdo-users-table-wrap"><table className="data-table sdo-users-table"><thead><tr><th>Full Name</th><th>Email</th><th className="sdo-school-column">School</th><th>Position</th><th>Status</th><th>Last Login / Activity</th><th>Actions</th></tr></thead><tbody>{profiles.map((profile) => { const live = presenceByUser.get(String(profile.id)) || presenceByUser.get((profile.email || "").toLowerCase()); const online = isOnline(live); const school = schoolsById.get(String(profile.school_id)); const schoolName = school?.name || profile.school_name || "Not assigned"; const logo = getCachedLogoSrc(schoolName) || school?.logo_url; return <tr key={profile.id}><td><strong>{profile.fullname || "—"}</strong></td><td>{profile.email}</td><td className="sdo-school-column"><div className="sdo-school-cell">{logo ? <img src={logo} alt="" /> : <span className="sdo-school-logo-fallback">{schoolName === "Not assigned" ? "—" : schoolName.charAt(0)}</span>}<div><strong>{schoolName}</strong>{profile.school_id && <small>School ID: {profile.school_id}</small>}</div></div></td><td>{profile.position || "—"}</td><td><span className={`sdo-presence ${online ? "online" : "offline"}`}><i />{online ? "Online" : "Offline"}</span></td><td>{formatDate(live?.last_seen)}</td><td><button className="sdo-remove-btn" disabled={removingId !== null} onClick={() => removeEmail(profile)}>{removingId === profile.id ? "Removing..." : "Remove"}</button></td></tr>; })}</tbody></table></div>}
    </div>}
  </div>;
}
