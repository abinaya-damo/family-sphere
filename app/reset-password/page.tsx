"use client";

import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const tokenFromEmail = fragment.get("access_token") || "";
    const type = fragment.get("type");
    const error = fragment.get("error_description") || fragment.get("error");
    // Recovery URLs can contain sensitive tokens: remove them from the visible URL.
    window.history.replaceState(null, "", window.location.pathname);
    if (error) setMessage(decodeURIComponent(error.replace(/\+/g, " ")));
    else if (type === "recovery" && tokenFromEmail) setToken(tokenFromEmail);
    else setMessage("This reset link is invalid or expired. Request a new link from the login page.");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8 || password.length > 128) { setMessage("Use a password of 8–128 characters."); return; }
    if (password !== confirm) { setMessage("Passwords do not match."); return; }
    if (!token) { setMessage("Please request a new password reset link."); return; }
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/family-sphere", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "confirm_password_reset", password }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to reset password.");
      setToken(""); setPassword(""); setConfirm("");
      setMessage("Your password has been updated. Return to Family Sphere and log in with your new password.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reset password."); }
    finally { setSaving(false); }
  }

  return <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",padding:20,background:"linear-gradient(130deg,#eaf6f0,#f7f4eb)",fontFamily:"system-ui, sans-serif",color:"#153c31"}}>
    <section style={{width:"min(100%,440px)",background:"white",padding:32,borderRadius:22,boxShadow:"0 20px 55px #10392a19"}}>
      <div style={{fontSize:29,marginBottom:12}}>◎ <strong>Family Sphere</strong></div>
      <h1 style={{fontSize:26,marginBottom:8}}>Choose a new password</h1>
      <p style={{color:"#587469",lineHeight:1.5,marginBottom:20}}>Create a new password for your Family Sphere account.</p>
      {token && <form onSubmit={submit} style={{display:"grid",gap:14}}>
        <label style={{display:"grid",gap:6}}>New password<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} style={{padding:12,borderRadius:10,border:"1px solid #a8beb4"}} /></label>
        <label style={{display:"grid",gap:6}}>Confirm password<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)} style={{padding:12,borderRadius:10,border:"1px solid #a8beb4"}} /></label>
        <button disabled={saving} type="submit" style={{padding:13,borderRadius:10,border:0,background:"#176c56",color:"white",fontWeight:700,cursor:"pointer"}}>{saving ? "Updating…" : "Update password"}</button>
      </form>}
      {message && <p role="status" style={{lineHeight:1.5,marginTop:16}}>{message}</p>}
      <a href="/" style={{display:"inline-block",marginTop:22,color:"#176c56",fontWeight:700}}>← Return to login</a>
    </section>
  </main>;
}
