import { NextResponse } from "next/server";
import { createHash } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const configured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY);

function jsonError(message, status = 400, details) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

async function supabaseFetch(path, options = {}, mode = "service", accessToken) {
  const key = mode === "service" ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const headers = new Headers(options.headers || {});
  headers.set("apikey", key);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  else if (key.startsWith("eyJ")) headers.set("Authorization", `Bearer ${key}`);
  else headers.delete("Authorization");
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof Uint8Array)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers, cache: "no-store" });
  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const message = payload?.msg || payload?.message || payload?.error_description || payload?.error || `Supabase request failed (${res.status})`;
    throw Object.assign(new Error(message), { status: res.status, payload });
  }
  return payload;
}

function bearer(req) {
  const h = req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

async function authUser(token) {
  if (!token) throw Object.assign(new Error("Authentication required"), { status: 401 });
  return supabaseFetch("/auth/v1/user", { method: "GET" }, "anon", token);
}

async function signIn(email, password) {
  return supabaseFetch(
    "/auth/v1/token?grant_type=password",
    { method: "POST", body: JSON.stringify({ email, password }) },
    "anon"
  );
}

async function ensureAuthUser(email, password, name) {
  // A new member may already have a Supabase account; confirm password without
  // altering an existing account. Do not create a user on network/service errors.
  try {
    return await signIn(email, password);
  } catch (firstError) {
    if (firstError?.status !== 400 && firstError?.status !== 401) throw firstError;
    const reason = String(firstError?.message || "").toLowerCase();
    if (!/invalid login credentials|invalid credentials|email not confirmed|user not found/.test(reason)) throw firstError;
    if (/email not confirmed/.test(reason)) throw Object.assign(new Error("Verify your email in Supabase Auth, then log in."), {status: 403});
    try {
      await supabaseFetch(
        "/auth/v1/admin/users",
        { method: "POST", body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }) },
        "service"
      );
    } catch (createError) {
      if (createError?.status === 422) {
        throw Object.assign(new Error("This email is already registered. Use the existing account password or sign in instead."), { status: 409 });
      }
      throw createError;
    }
    return signIn(email, password);
  }
}

async function select(table, query) {
  return supabaseFetch(`/rest/v1/${table}?${query}`, { method: "GET" }, "service");
}

async function insert(table, rows, upsert = false, onConflict = "") {
  const suffix = upsert && onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  return supabaseFetch(
    `/rest/v1/${table}${suffix}`,
    {
      method: "POST",
      headers: { Prefer: upsert ? "resolution=merge-duplicates,return=representation" : "return=representation" },
      body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    },
    "service"
  );
}

async function patch(table, query, values) {
  return supabaseFetch(
    `/rest/v1/${table}?${query}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(values) },
    "service"
  );
}

async function removeRows(table, query) {
  return supabaseFetch(`/rest/v1/${table}?${query}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }, "service");
}

function familyCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "FAM-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function genderFromRelation(relation) {
  const r = normalizeName(relation);
  if (["father", "husband", "son", "brother"].includes(r)) return "male";
  if (["mother", "wife", "daughter", "sister"].includes(r)) return "female";
  return "";
}

function newPersonId() {
  return `person_${crypto.randomUUID().replace(/-/g, "")}`;
}

function newRelationshipId() {
  return `bond_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function membership(userId, familyId) {
  const rows = await select("family_memberships", `user_id=eq.${encodeURIComponent(userId)}&family_id=eq.${encodeURIComponent(familyId)}&select=*`);
  return rows?.[0] || null;
}

async function requireMembership(userId, familyId, ownerOnly = false) {
  const row = await membership(userId, familyId);
  if (!row) throw Object.assign(new Error("You do not have access to this family"), { status: 403 });
  if (ownerOnly && row.role !== "owner") throw Object.assign(new Error("Family owner access required"), { status: 403 });
  return row;
}

async function familyState(familyId) {
  const rows = await select("family_states", `family_id=eq.${encodeURIComponent(familyId)}&select=state,photos,removed_members,updated_at`);
  return rows?.[0] || null;
}

async function familyRow(familyId) {
  const rows = await select("families", `id=eq.${encodeURIComponent(familyId)}&select=*`);
  return rows?.[0] || null;
}

async function graphPeople(familyId) {
  return (await select("family_people", `family_id=eq.${encodeURIComponent(familyId)}&select=*&order=created_at.asc`)) || [];
}

async function graphRelationships(familyId) {
  return (await select("family_relationships", `family_id=eq.${encodeURIComponent(familyId)}&select=*&order=created_at.asc`)) || [];
}
async function documentRows(familyId) {
  return (await select("documents", `family_id=eq.${encodeURIComponent(familyId)}&select=*&order=created_at.asc`)) || [];
}

async function documentFingerprint(familyId) {
  const rows = (await select("documents", `family_id=eq.${encodeURIComponent(familyId)}&select=id,client_id,title,category,storage_path,file_size,created_at&order=created_at.asc`)) || [];
  return JSON.stringify(rows.map((row) => [
    String(row.id || ""), String(row.client_id || ""), String(row.title || ""),
    String(row.category || ""), String(row.storage_path || ""), Number(row.file_size || 0),
    String(row.created_at || ""),
  ]));
}

async function notificationLedgerState(familyId) {
  const row = await familyState(familyId);
  const state = row?.state && typeof row.state === "object" ? row.state : {};
  const ledger = Array.isArray(state.__notificationLedgerV3) ? state.__notificationLedgerV3 : [];
  return { row, state, ledger };
}

async function saveNotificationLedger(familyId, ledger) {
  const { row, state } = await notificationLedgerState(familyId);
  const cleaned = (Array.isArray(ledger) ? ledger : [])
    .filter((n) => n && n.id && n.recipient_user_id)
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
    .slice(-1200);
  const nextState = { ...state, __notificationLedgerV3: cleaned };
  await insert("family_states", {
    family_id: familyId,
    state: nextState,
    photos: row?.photos || {},
    removed_members: Array.isArray(row?.removed_members) ? row.removed_members : [],
    // Notification-only writes must not create family-state conflicts.
    updated_at: row?.updated_at || new Date().toISOString(),
  }, true, "family_id");
  return cleaned;
}

async function notificationFingerprint(familyId) {
  const rows = (await select("notifications", `family_id=eq.${encodeURIComponent(familyId)}&select=id,recipient_user_id,type,title,message,target_page,is_read,created_at&order=created_at.asc`)) || [];
  return JSON.stringify(rows.map((row) => [
    String(row.id || ""), String(row.recipient_user_id || ""), String(row.type || ""),
    String(row.title || ""), String(row.message || ""), String(row.target_page || ""),
    Boolean(row.is_read), String(row.created_at || ""),
  ]));
}

function stableNotificationUuid(input) {
  const hex = createHash("sha256").update(String(input || "")).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20,32)}`;
}

async function documentStateRows(familyId) {
  const rows = await documentRows(familyId);
  if (!rows.length) return [];
  const memberships = (await select("family_memberships", `family_id=eq.${encodeURIComponent(familyId)}&select=user_id,display_name,person_id`)) || [];
  const byUser = new Map(memberships.map((m) => [String(m.user_id || ""), m]));
  return rows.map((row) => {
    const member = byUser.get(String(row.uploaded_by || ""));
    return {
      id: row.client_id || row.id,
      dbId: row.id,
      name: row.title,
      cat: row.category || "Other",
      access: row.access_level || "Entire family",
      storagePath: row.storage_path || "",
      storageBucket: "family-documents",
      fileName: row.file_name || "",
      fileType: row.file_type || "",
      fileSize: Number(row.file_size || 0),
      uploadedAt: row.created_at,
      postedBy: member?.display_name || "Family member",
      postedById: member?.person_id || "",
    };
  });
}

function personRowFromState(familyId, p, claimedByUserId = null) {
  const defaultRole = String(p?.defaultRole || "").trim();
  const editableName = String(p?.editableName || "").trim();
  const rawName = editableName || String(p?.name || "").trim() || defaultRole || "Family member";
  const placeholder = Boolean(defaultRole && defaultRole !== "You" && !editableName);
  return {
    family_id: familyId,
    person_id: String(p.id),
    name: rawName,
    gender: String(p.gender || "") || null,
    dob: String(p.dob || "") || null,
    phone: String(p.phone || p.mobile || "") || null,
    alternate_phone: String(p.alternatePhone || "") || null,
    email: String(p.email || "") || null,
    address: String(p.address || "") || null,
    default_role: defaultRole || null,
    editable_name: editableName || null,
    is_placeholder: placeholder,
    claimed_by_user_id: claimedByUserId || null,
    profile: p,
    updated_at: new Date().toISOString(),
  };
}

function relationshipRowFromState(familyId, e) {
  return {
    family_id: familyId,
    relationship_id: String(e.id || newRelationshipId()),
    from_person_id: String(e.fromPersonId || ""),
    to_person_id: String(e.toPersonId || ""),
    relationship_type: String(e.type || ""),
    metadata: e,
    updated_at: new Date().toISOString(),
  };
}

async function syncGraphFromState(familyId, state, allowDelete = false) {
  const people = Array.isArray(state?.people) ? state.people.filter((p) => p?.id) : [];
  const relationships = Array.isArray(state?.connections)
    ? state.connections.filter((e) => e?.fromPersonId && e?.toPersonId && ["parent", "spouse", "sibling"].includes(e?.type))
    : [];
  const memberships = await select("family_memberships", `family_id=eq.${encodeURIComponent(familyId)}&select=user_id,person_id`);
  const claimByPerson = new Map((memberships || []).filter((m) => m.person_id).map((m) => [String(m.person_id), m.user_id]));

  if (people.length) {
    const rows = people.map((p) => personRowFromState(familyId, p, claimByPerson.get(String(p.id)) || null));
    await insert("family_people", rows, true, "family_id,person_id");
  }
  if (relationships.length) {
    await insert("family_relationships", relationships.map((e) => relationshipRowFromState(familyId, e)), true, "family_id,relationship_id");
  }

  if (allowDelete) {
    const keepPeople = new Set(people.map((p) => String(p.id)));
    const currentPeople = await graphPeople(familyId);
    const currentMemberships = await select("family_memberships", `family_id=eq.${encodeURIComponent(familyId)}&select=id,user_id,role,person_id`);

    // Never allow the family owner's linked profile to be deleted accidentally.
    for (const member of currentMemberships || []) {
      if (member?.role === "owner" && member?.person_id && !keepPeople.has(String(member.person_id))) {
        throw Object.assign(new Error("The family owner's profile cannot be removed from the tree."), { status: 400 });
      }
    }

    for (const row of currentPeople) {
      if (!keepPeople.has(String(row.person_id))) {
        // Revoking the person must also revoke any approved member account linked to it.
        // Otherwise another browser can stay authorized with a stale treeProfile.
        await removeRows("family_memberships", `family_id=eq.${encodeURIComponent(familyId)}&person_id=eq.${encodeURIComponent(row.person_id)}&role=eq.member`).catch(() => {});
        await removeRows("family_relationships", `family_id=eq.${encodeURIComponent(familyId)}&or=(from_person_id.eq.${encodeURIComponent(row.person_id)},to_person_id.eq.${encodeURIComponent(row.person_id)})`).catch(() => {});
        await removeRows("family_people", `family_id=eq.${encodeURIComponent(familyId)}&person_id=eq.${encodeURIComponent(row.person_id)}`);
      }
    }
    const keepRelationships = new Set(relationships.map((e) => String(e.id || "")));
    const currentRelationships = await graphRelationships(familyId);
    for (const row of currentRelationships) {
      if (row.relationship_id && !keepRelationships.has(String(row.relationship_id))) {
        await removeRows("family_relationships", `family_id=eq.${encodeURIComponent(familyId)}&relationship_id=eq.${encodeURIComponent(row.relationship_id)}`);
      }
    }
  }
}

async function syncOwnPersonFromState(familyId, state, personId, userId) {
  if (!personId) return;
  const p = (Array.isArray(state?.people) ? state.people : []).find((x) => String(x?.id) === String(personId));
  if (!p) return;
  await insert("family_people", personRowFromState(familyId, p, userId), true, "family_id,person_id");
}

async function canonicalState(familyId, baseState = {}) {
  const peopleRows = await graphPeople(familyId);
  const relationshipRows = await graphRelationships(familyId);
  if (!peopleRows.length) return baseState || {};
  const people = peopleRows.map((row) => {
    const p = row.profile && typeof row.profile === "object" ? { ...row.profile } : {};
    p.id = row.person_id;
    p.name = row.name;
    if (row.gender) p.gender = row.gender;
    if (row.dob) p.dob = row.dob;
    if (row.phone) p.phone = row.phone;
    if (row.alternate_phone) p.alternatePhone = row.alternate_phone;
    if (row.email) p.email = row.email;
    if (row.address) p.address = row.address;
    if (row.default_role) p.defaultRole = row.default_role;
    if (row.editable_name !== null && row.editable_name !== undefined) p.editableName = row.editable_name || "";
    return p;
  });
  const connections = relationshipRows.map((row) => ({
    ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
    id: row.relationship_id,
    fromPersonId: row.from_person_id,
    toPersonId: row.to_person_id,
    type: row.relationship_type,
  }));
  const dbDocs = await documentStateRows(familyId);
  const legacyDocs = Array.isArray(baseState?.docs) ? baseState.docs : [];
  const dbIds = new Set(dbDocs.map((d) => String(d.id)));
  const docs = [...dbDocs, ...legacyDocs.filter((d) => !dbIds.has(String(d?.id || "")))];
  return { ...(baseState || {}), people, connections, docs, relationshipGraphVersion: 3 };
}

async function canonicalStateRow(familyId) {
  const row = (await familyState(familyId)) || { state: {}, photos: {}, removed_members: [], updated_at: new Date().toISOString() };
  row.state = await canonicalState(familyId, row.state || {});
  return row;
}

async function userBundle(userId) {
  const memberships = await select("family_memberships", `user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.asc&limit=1`);
  const m = memberships?.[0];
  if (!m) return { membership: null, family: null, state: null };
  const family = await familyRow(m.family_id);
  const state = await canonicalStateRow(m.family_id);
  return { membership: m, family, state };
}

async function uniqueFamilyCode() {
  for (let i = 0; i < 8; i++) {
    const code = familyCode();
    const hit = await select("families", `code=eq.${encodeURIComponent(code)}&select=id&limit=1`);
    if (!hit?.length) return code;
  }
  return `FAM-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

function symmetricType(type) {
  return type === "spouse" || type === "sibling";
}

function relationshipExists(list, from, to, type) {
  return list.some((e) => e.relationship_type === type && (
    symmetricType(type)
      ? ((e.from_person_id === from && e.to_person_id === to) || (e.from_person_id === to && e.to_person_id === from))
      : (e.from_person_id === from && e.to_person_id === to)
  ));
}

function makeRelationship(familyId, from, to, type) {
  const id = newRelationshipId();
  return {
    family_id: familyId,
    relationship_id: id,
    from_person_id: from,
    to_person_id: to,
    relationship_type: type,
    metadata: { id, fromPersonId: from, toPersonId: to, type },
    updated_at: new Date().toISOString(),
  };
}

function parentsOfFromRows(list, personId) {
  return list.filter((e) => e.relationship_type === "parent" && e.to_person_id === personId).map((e) => e.from_person_id);
}

function childrenOfFromRows(list, personId) {
  return list.filter((e) => e.relationship_type === "parent" && e.from_person_id === personId).map((e) => e.to_person_id);
}

function spousesOfFromRows(list, personId) {
  return list.filter((e) => e.relationship_type === "spouse" && (e.from_person_id === personId || e.to_person_id === personId))
    .map((e) => e.from_person_id === personId ? e.to_person_id : e.from_person_id);
}

async function addJoinRelationship(familyId, relationships, anchorId, personId, relation) {
  const created = [];
  const add = (from, to, type) => {
    if (!from || !to || from === to || relationshipExists([...relationships, ...created], from, to, type)) return;
    created.push(makeRelationship(familyId, from, to, type));
  };
  const rel = normalizeName(relation);
  if (["son", "daughter"].includes(rel)) {
    add(anchorId, personId, "parent");
    spousesOfFromRows(relationships, anchorId).forEach((spouseId) => add(spouseId, personId, "parent"));
  } else if (["father", "mother"].includes(rel)) {
    add(personId, anchorId, "parent");
  } else if (["husband", "wife", "spouse"].includes(rel)) {
    add(anchorId, personId, "spouse");
    childrenOfFromRows(relationships, anchorId).forEach((childId) => add(personId, childId, "parent"));
  } else if (["brother", "sister"].includes(rel)) {
    const parents = parentsOfFromRows(relationships, anchorId);
    if (parents.length) parents.forEach((parentId) => add(parentId, personId, "parent"));
    else add(anchorId, personId, "sibling");
  }
  if (created.length) await insert("family_relationships", created, true, "family_id,relationship_id");
  return created;
}


export async function GET(req) {
  try {
    if (!configured()) return jsonError("Supabase backend is not configured", 503);
    const url = new URL(req.url);
    if (url.searchParams.get("stream") !== "1") return jsonError("Unknown backend request", 404);
    const familyId = String(url.searchParams.get("familyId") || "");
    if (!familyId) return jsonError("Family id is required", 400);
    const token = bearer(req);
    const user = await authUser(token);
    await requireMembership(user.id, familyId);

    const encoder = new TextEncoder();
    let stateRow = await familyState(familyId);
    let lastUpdatedAt = String(stateRow?.updated_at || "");
    let lastDocumentsFingerprint = await documentFingerprint(familyId);
    let lastNotificationsFingerprint = await notificationFingerprint(familyId);
    let stopped = false;
    let timer = null;
    let heartbeat = null;
    let busy = false;
    let cleanup = () => {};

    const stream = new ReadableStream({
      start(controller) {
        const send = (event, payload) => {
          if (stopped) return;
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
          } catch {
            cleanup();
          }
        };

        cleanup = () => {
          if (stopped) return;
          stopped = true;
          if (timer) clearInterval(timer);
          if (heartbeat) clearInterval(heartbeat);
          try { controller.close(); } catch {}
        };

        send("ready", { familyId, updatedAt: lastUpdatedAt });

        timer = setInterval(async () => {
          if (stopped || busy) return;
          busy = true;
          try {
            const rows = await select("family_states", `family_id=eq.${encodeURIComponent(familyId)}&select=updated_at`);
            const updatedAt = String(rows?.[0]?.updated_at || "");
            if (updatedAt && updatedAt !== lastUpdatedAt) {
              lastUpdatedAt = updatedAt;
              send("family-state", { familyId, updatedAt });
            }
            const documentsFingerprint = await documentFingerprint(familyId);
            if (documentsFingerprint !== lastDocumentsFingerprint) {
              lastDocumentsFingerprint = documentsFingerprint;
              send("family-documents", { familyId, changedAt: Date.now() });
            }
            const notificationsFingerprint = await notificationFingerprint(familyId);
            if (notificationsFingerprint !== lastNotificationsFingerprint) {
              lastNotificationsFingerprint = notificationsFingerprint;
              send("family-notifications", { familyId, changedAt: Date.now() });
            }
          } catch (error) {
            send("warning", { message: error?.message || "Live sync check failed" });
          } finally {
            busy = false;
          }
        }, 650);

        heartbeat = setInterval(() => send("heartbeat", { at: Date.now() }), 15000);
        req.signal.addEventListener("abort", cleanup, { once: true });
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Family Sphere realtime API:", error);
    return jsonError(error?.message || "Live sync failed", error?.status || 500, error?.payload);
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "health") return NextResponse.json({ ok: true, configured: configured(), sharedGraphVersion: 244, stabilityVersion: 3 });
    if (!configured()) return jsonError("Supabase is not configured. Add SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to .env.local.", 503);

    if (action === "create_family") {
      const ownerName = String(body.ownerName || "").trim();
      const familyName = String(body.familyName || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!ownerName || !familyName || !email || password.length < 6) return jsonError("Complete all create-family fields");
      const session = await ensureAuthUser(email, password, ownerName);
      const userId = session?.user?.id;
      if (!userId) return jsonError("Could not create the Supabase account", 500);
      const existing = await select("family_memberships", `user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`);
      if (existing?.length) return jsonError("This account is already linked to a Family Sphere family", 409);
      const code = await uniqueFamilyCode();
      const family = (await insert("families", { code, name: familyName, owner_user_id: userId, owner_email: email }))?.[0];
      if (!family) return jsonError("Family creation failed", 500);
      const membershipRow = (await insert("family_memberships", { family_id: family.id, user_id: userId, role: "owner", display_name: ownerName }))?.[0] || null;
      await insert("family_states", { family_id: family.id, state: {}, photos: {}, removed_members: [] }, true, "family_id");
      return NextResponse.json({ ok: true, session, family, membership: membershipRow });
    }

    if (action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const session = await signIn(email, password);
      const bundle = await userBundle(session?.user?.id);
      if (!bundle.membership) {
        const pending=await select("join_requests", `user_id=eq.${encodeURIComponent(session.user.id)}&status=eq.pending&select=id&limit=1`);
        return jsonError(pending?.length ? "Your join request is awaiting family-owner approval. Please try logging in after approval." : "This account is not linked to an approved family. Use Join family first, or ask the owner to approve your request.", 403);
      }
      return NextResponse.json({ ok: true, session, ...bundle });
    }

    if (action === "join_info") {
      const code = String(body.code || "").trim().toUpperCase();
      const family = (await select("families", `code=eq.${encodeURIComponent(code)}&select=id,code,name&limit=1`))?.[0];
      if (!family) return jsonError("Family ID was not found", 404);
      const rows = await graphPeople(family.id);
      const people = rows
        .filter((p) => !p.is_placeholder && p.person_id && p.name)
        .map((p) => ({ id: p.person_id, name: p.name, gender: p.gender || "" }));
      return NextResponse.json({ ok: true, family, people });
    }

    if (action === "refresh_auth") {
      const refreshToken = String(body.refreshToken || "");
      if (!refreshToken) return jsonError("Refresh token is required", 401);
      const session = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) }, "anon");
      return NextResponse.json({ ok: true, session });
    }

    if (action === "join_request") {
      const code = String(body.code || "").trim().toUpperCase();
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const anchorPersonId = String(body.anchorPersonId || "");
      const anchorName = String(body.anchorName || "");
      const relation = String(body.relation || "");
      if (!code || !name || !email || password.length < 6 || !anchorPersonId || !relation) return jsonError("Complete all join-family fields");
      const family = (await select("families", `code=eq.${encodeURIComponent(code)}&select=*&limit=1`))?.[0];
      if (!family) return jsonError("Family ID was not found", 404);
      const anchor = (await select("family_people", `family_id=eq.${encodeURIComponent(family.id)}&person_id=eq.${encodeURIComponent(anchorPersonId)}&select=person_id,name,is_placeholder&limit=1`))?.[0];
      if (!anchor || anchor.is_placeholder) return jsonError("Select a named family member from the shared tree", 400);
      const session = await ensureAuthUser(email, password, name);
      const userId = session?.user?.id;
      if (await membership(userId, family.id)) return jsonError("This account is already an approved member of this family", 409);
      const request = (await insert("join_requests", {
        family_id: family.id, user_id: userId, name, email, anchor_person_id: anchorPersonId,
        anchor_name: anchor.name || anchorName, relation, status: "pending", requested_at: new Date().toISOString(),
        approved_at: null, rejected_at: null, person_id: null,
      }, true, "family_id,user_id"))?.[0] || null;
      return NextResponse.json({ ok: true, session, family: { id: family.id, code: family.code, name: family.name }, request });
    }

    const token = bearer(req);
    const user = await authUser(token);
    const userId = user?.id;
    if (!userId) return jsonError("Invalid login session", 401);

    if (action === "change_password") {
      const password = String(body.password || "");
      if (password.length < 6) return jsonError("Password must be at least 6 characters");
      // authUser above already verifies that this bearer token belongs to a real
      // signed-in Supabase user. Update THAT user's password only.
      await supabaseFetch(
        "/auth/v1/user",
        { method: "PUT", body: JSON.stringify({ password }) },
        "anon",
        token
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "current_access") {
      // V273: authoritative membership probe used before showing the
      // "access removed" warning. A missing membership is returned as a normal
      // 200 response so the browser can distinguish real removal from a stale
      // family id / transient 403 on another browser.
      const bundle = await userBundle(userId);
      return NextResponse.json({
        ok: true,
        membership: bundle.membership || null,
        family: bundle.family || null,
        state: bundle.state || null,
      });
    }

    async function resolveHelpRequest(familyId, body, includeDeleted = false) {
      const requestId = String(body.requestId || "").trim();
      const clientId = String(body.clientId || "").trim();
      const statusPart = includeDeleted ? "" : "&status=neq.deleted";
      if (requestId) {
        const byId = await select("help_requests", `family_id=eq.${encodeURIComponent(familyId)}&id=eq.${encodeURIComponent(requestId)}${statusPart}&select=*&limit=1`);
        if (byId?.[0]) return byId[0];
      }
      if (clientId) {
        const byClient = await select("help_requests", `family_id=eq.${encodeURIComponent(familyId)}&client_id=eq.${encodeURIComponent(clientId)}${statusPart}&select=*&limit=1`);
        if (byClient?.[0]) return byClient[0];
      }
      return null;
    }

    if (action === "list_notifications") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const rows = (await select("notifications", `family_id=eq.${encodeURIComponent(familyId)}&recipient_user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=120`)) || [];
      return NextResponse.json({ ok: true, notifications: rows });
    }

    if (action === "create_notification") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const type = String(body.type || "activity").trim();
      const title = String(body.title || "").trim();
      const message = String(body.message || "").trim();
      const targetPage = String(body.targetPage || "home").trim() || "home";
      const scope = String(body.scope || "family").trim();
      const recipientPersonId = String(body.recipientPersonId || "").trim();
      const dedupeSeconds = Math.max(5, Math.min(604800, Number(body.dedupeSeconds || 45)));
      const explicitDedupeKey = String(body.dedupeKey || "").trim();
      if (!title) return jsonError("Notification title is required", 400);

      let targetUserIds = [];
      if (scope === "self") {
        targetUserIds = [userId];
      } else if (scope === "person") {
        if (!recipientPersonId) return jsonError("Notification recipient is required", 400);
        const matches = await select("family_memberships", `family_id=eq.${encodeURIComponent(familyId)}&person_id=eq.${encodeURIComponent(recipientPersonId)}&select=user_id`);
        targetUserIds = (matches || []).map((m) => String(m.user_id || "")).filter(Boolean);
      } else {
        const members = await select("family_memberships", `family_id=eq.${encodeURIComponent(familyId)}&select=user_id`);
        targetUserIds = (members || []).map((m) => String(m.user_id || "")).filter(Boolean);
      }
      targetUserIds = [...new Set(targetUserIds)];
      if (!targetUserIds.length) return NextResponse.json({ ok: true, notifications: [] });

      const bucket = Math.floor(Date.now() / (dedupeSeconds * 1000));
      const createdAt = new Date().toISOString();
      const rows = targetUserIds.map((recipientUserId) => {
        const dedupeBase = explicitDedupeKey || [userId, type, title, message, targetPage, bucket].join("|");
        return {
          id: stableNotificationUuid(`${familyId}|${recipientUserId}|${dedupeBase}`),
          family_id: familyId,
          recipient_user_id: recipientUserId,
          recipient_person_id: scope === "person" ? recipientPersonId : null,
          type,
          title,
          message,
          target_page: targetPage,
          is_read: false,
          created_at: createdAt,
        };
      });
      const saved = await insert("notifications", rows, true, "id");
      return NextResponse.json({ ok: true, notifications: saved || rows });
    }

    if (action === "mark_notifications_read") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const ids = [...new Set(Array.isArray(body.ids) ? body.ids.map((id) => String(id || "").trim()).filter(Boolean) : [])];
      for (const id of ids) {
        await patch("notifications", `family_id=eq.${encodeURIComponent(familyId)}&recipient_user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(id)}`, { is_read: true });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_all_notifications_read") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      await patch("notifications", `family_id=eq.${encodeURIComponent(familyId)}&recipient_user_id=eq.${encodeURIComponent(userId)}&is_read=eq.false`, { is_read: true });
      return NextResponse.json({ ok: true });
    }

    if (action === "list_help") {
      const familyId = String(body.familyId || "");
      const m = await requireMembership(userId, familyId);

      // Ensure the two original Help Board starter cards exist exactly once.
      // A deleted starter card stays deleted because we keep its DB row with status='deleted'.
      const existing = await select("help_requests", `family_id=eq.${encodeURIComponent(familyId)}&select=*`);
      const byClient = new Set((existing || []).map((r) => String(r.client_id || "")));
      const seeds = [
        { client_id: "help-transport", title: "Take Grandma to hospital", description: "Need someone available today from 5:30–7:00 PM.", category: "Transport", created_by_name: "Mom" },
        { client_id: "help-shopping", title: "Pick up medicines", description: "Please collect the monthly prescription before Sunday.", category: "Shopping", created_by_name: "Dad" },
      ].filter((x) => !byClient.has(x.client_id)).map((x) => ({
        family_id: familyId, created_by: null, created_by_person_id: null,
        title: x.title, description: x.description, category: x.category,
        status: "open", client_id: x.client_id, created_by_name: x.created_by_name,
      }));
      if (seeds.length) await insert("help_requests", seeds, true, "family_id,client_id");

      const requests = await select("help_requests", `family_id=eq.${encodeURIComponent(familyId)}&status=neq.deleted&order=created_at.asc&select=*`);
      const ids = (requests || []).map((r) => r.id).filter(Boolean);
      let volunteers = [];
      if (ids.length) {
        volunteers = await select("help_volunteers", `help_request_id=in.(${ids.map((id)=>encodeURIComponent(id)).join(",")})&status=eq.volunteered&select=*`);
      }
      return NextResponse.json({ ok: true, membership: m, requests: requests || [], volunteers: volunteers || [] });
    }

    if (action === "create_help") {
      const familyId = String(body.familyId || "");
      const m = await requireMembership(userId, familyId);
      const title = String(body.title || "").trim();
      const description = String(body.description || "").trim();
      if (!title || !description) return jsonError("Help title and details are required", 400);
      const clientId = String(body.clientId || `help-${Date.now()}`);
      const existingHelp = (await select("help_requests", `family_id=eq.${encodeURIComponent(familyId)}&client_id=eq.${encodeURIComponent(clientId)}&select=*&limit=1`))?.[0] || null;
      if (existingHelp) return NextResponse.json({ ok: true, request: existingHelp });
      const createdByName = String(body.createdByName || m.display_name || user?.email || "Family member").trim();
      const row = (await insert("help_requests", {
        family_id: familyId,
        created_by: userId,
        created_by_person_id: m.person_id || null,
        created_by_name: createdByName,
        title,
        description,
        category: String(body.category || "New request"),
        status: "open",
        client_id: clientId,
      }))?.[0] || null;
      return NextResponse.json({ ok: true, request: row });
    }

    if (action === "delete_help") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      if (!String(body.clientId || "").trim() && !String(body.requestId || "").trim()) return jsonError("Help request id is required", 400);
      const row = await resolveHelpRequest(familyId, body, true);
      if (!row) return jsonError("Help request not found", 404);
      await patch("help_requests", `id=eq.${encodeURIComponent(row.id)}`, { status: "deleted" });
      return NextResponse.json({ ok: true });
    }

    if (action === "volunteer_help") {
      const familyId = String(body.familyId || "");
      const m = await requireMembership(userId, familyId);
      const reqRow = await resolveHelpRequest(familyId, body, false);
      if (!reqRow) return jsonError("Help request not found", 404);
      const active = await select("help_volunteers", `help_request_id=eq.${encodeURIComponent(reqRow.id)}&status=eq.volunteered&select=*`);
      const mine = (active || []).find((v) => String(v.user_id) === String(userId));
      if ((active || []).length && !mine) return jsonError("Another family member is already helping with this request", 409);
      const displayName = String(body.displayName || m.display_name || user?.email || "Family member").trim();
      const now = new Date().toISOString();
      let volunteer = null;
      const mineAny = (await select("help_volunteers", `help_request_id=eq.${encodeURIComponent(reqRow.id)}&user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`))?.[0] || null;
      if (mineAny) {
        const updated = await patch("help_volunteers", `id=eq.${encodeURIComponent(mineAny.id)}`, {
          person_id: m.person_id || null,
          display_name: displayName,
          status: "volunteered",
          volunteered_at: now,
          updated_at: now,
        });
        volunteer = Array.isArray(updated) ? updated[0] || mineAny : mineAny;
      } else {
        volunteer = (await insert("help_volunteers", {
          help_request_id: reqRow.id,
          user_id: userId,
          person_id: m.person_id || null,
          display_name: displayName,
          status: "volunteered",
          volunteered_at: now,
          updated_at: now,
        }))?.[0] || null;
      }
      return NextResponse.json({ ok: true, volunteer });
    }

    if (action === "cancel_help") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const reqRow = await resolveHelpRequest(familyId, body, true);
      if (!reqRow) return jsonError("Help request not found", 404);
      await patch("help_volunteers", `help_request_id=eq.${encodeURIComponent(reqRow.id)}&user_id=eq.${encodeURIComponent(userId)}`, { status: "cancelled", updated_at: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }

    // v242 Help Board: use the canonical family_states JSON as the single source of truth.
    // This deliberately uses the same stable help IDs the existing UI already uses
    // (help-transport, help-shopping, help-<timestamp>) so buttons never depend on a
    // separate database UUID/client_id lookup.
    async function helpStateBundle(familyId) {
      const current = (await familyState(familyId)) || { state: {}, photos: {}, removed_members: [] };
      const state = current.state && typeof current.state === "object" ? { ...current.state } : {};
      if (!Array.isArray(state.help)) state.help = [];
      if (!Array.isArray(state.removedHelp)) state.removedHelp = [];
      if (!state.helpVolunteers || typeof state.helpVolunteers !== "object" || Array.isArray(state.helpVolunteers)) state.helpVolunteers = {};
      return { current, state };
    }

    async function saveHelpState(familyId, current, state) {
      const saved = (await insert("family_states", {
        family_id: familyId,
        state,
        photos: current?.photos || {},
        removed_members: current?.removed_members || [],
        updated_at: new Date().toISOString(),
      }, true, "family_id"))?.[0] || null;
      return saved;
    }

    if (action === "help_state_get") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const { current, state } = await helpStateBundle(familyId);

      // One-time compatibility import from the short-lived v238-v241 help tables.
      // This preserves requests/volunteers already created there, then all future
      // Help Board actions use family_states only.
      let imported = false;
      try {
        const rows = await select("help_requests", `family_id=eq.${encodeURIComponent(familyId)}&select=*`);
        const known = new Set(state.help.map((x) => String(x?.id || "")));
        for (const row of rows || []) {
          const id = String(row.client_id || row.id || "");
          if (!id) continue;
          const isDefault = id === "help-transport" || id === "help-shopping";
          if (String(row.status || "") === "deleted") {
            if (isDefault && !state.removedHelp.includes(id)) { state.removedHelp.push(id); imported = true; }
            continue;
          }
          if (!isDefault && !known.has(id)) {
            state.help.push({
              id,
              title: String(row.title || "Help request"),
              text: String(row.description || ""),
              tag: String(row.category || "New request"),
              tone: String(row.category || "").toLowerCase() === "shopping" ? "purple" : "orange",
              postedBy: "you",
              postedById: String(row.created_by_person_id || ""),
              postedByName: String(row.created_by_name || "Family member"),
            });
            known.add(id); imported = true;
          }
        }
        const requestRows = rows || [];
        const idToClient = new Map(requestRows.map((r) => [String(r.id || ""), String(r.client_id || r.id || "")]));
        const dbIds = requestRows.map((r) => r.id).filter(Boolean);
        if (dbIds.length) {
          const volunteers = await select("help_volunteers", `help_request_id=in.(${dbIds.map((id) => encodeURIComponent(id)).join(",")})&status=eq.volunteered&select=*`);
          for (const v of volunteers || []) {
            const helpId = idToClient.get(String(v.help_request_id || ""));
            if (helpId && !state.helpVolunteers[helpId]) {
              state.helpVolunteers[helpId] = {
                memberId: String(v.person_id || ""),
                name: String(v.display_name || "Family member"),
                volunteeredAt: v.volunteered_at || v.updated_at || new Date().toISOString(),
              };
              imported = true;
            }
          }
        }
      } catch (_) {
        // The old help tables are optional from v242 onward.
      }
      if (imported) await saveHelpState(familyId, current, state);
      return NextResponse.json({ ok: true, help: state.help, removedHelp: state.removedHelp, helpVolunteers: state.helpVolunteers });
    }

    if (action === "help_state_create") {
      const familyId = String(body.familyId || "");
      const m = await requireMembership(userId, familyId);
      const title = String(body.title || "").trim();
      const text = String(body.text || body.description || "").trim();
      if (!title || !text) return jsonError("Help title and details are required", 400);
      const { current, state } = await helpStateBundle(familyId);
      const id = String(body.id || `help-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`);
      const existing = state.help.find((x) => String(x?.id || "") === id);
      if (!existing) {
        state.help.push({
          id,
          title,
          text,
          tag: String(body.tag || "New request"),
          tone: String(body.tone || "orange"),
          postedBy: "you",
          postedById: String(m.person_id || body.postedById || ""),
          postedByName: String(body.postedByName || m.display_name || user?.email || "Family member"),
        });
      }
      await saveHelpState(familyId, current, state);
      return NextResponse.json({ ok: true, help: state.help, removedHelp: state.removedHelp, helpVolunteers: state.helpVolunteers });
    }

    if (action === "help_state_delete") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const id = String(body.id || "").trim();
      const kind = String(body.kind || "").trim();
      if (!id) return jsonError("Help request id is required", 400);
      const { current, state } = await helpStateBundle(familyId);
      if (kind === "default" || id === "help-transport" || id === "help-shopping") {
        if (!state.removedHelp.includes(id)) state.removedHelp.push(id);
      } else {
        state.help = state.help.filter((x) => String(x?.id || "") !== id);
      }
      delete state.helpVolunteers[id];
      await saveHelpState(familyId, current, state);
      return NextResponse.json({ ok: true, help: state.help, removedHelp: state.removedHelp, helpVolunteers: state.helpVolunteers });
    }

    if (action === "help_state_volunteer") {
      const familyId = String(body.familyId || "");
      const m = await requireMembership(userId, familyId);
      const id = String(body.id || "").trim();
      if (!id) return jsonError("Help request id is required", 400);
      const { current, state } = await helpStateBundle(familyId);
      const isDefault = id === "help-transport" || id === "help-shopping";
      const exists = isDefault ? !state.removedHelp.includes(id) : state.help.some((x) => String(x?.id || "") === id);
      if (!exists) return jsonError("Help request not found", 404);
      const currentVolunteer = state.helpVolunteers[id];
      const memberId = String(m.person_id || body.memberId || "");
      if (currentVolunteer && String(currentVolunteer.memberId || "") !== memberId) {
        return jsonError("Another family member is already helping with this request", 409);
      }
      state.helpVolunteers[id] = {
        memberId,
        name: String(body.displayName || m.display_name || user?.email || "Family member"),
        volunteeredAt: new Date().toISOString(),
      };
      await saveHelpState(familyId, current, state);
      return NextResponse.json({ ok: true, help: state.help, removedHelp: state.removedHelp, helpVolunteers: state.helpVolunteers });
    }

    if (action === "help_state_cancel") {
      const familyId = String(body.familyId || "");
      const m = await requireMembership(userId, familyId);
      const id = String(body.id || "").trim();
      if (!id) return jsonError("Help request id is required", 400);
      const { current, state } = await helpStateBundle(familyId);
      const currentVolunteer = state.helpVolunteers[id];
      if (currentVolunteer && (!m.person_id || String(currentVolunteer.memberId || "") === String(m.person_id))) {
        delete state.helpVolunteers[id];
      }
      await saveHelpState(familyId, current, state);
      return NextResponse.json({ ok: true, help: state.help, removedHelp: state.removedHelp, helpVolunteers: state.helpVolunteers });
    }

    if (action === "get_state") {
      const familyId = String(body.familyId || "");
      const m = await requireMembership(userId, familyId);
      const family = await familyRow(familyId);
      const state = await canonicalStateRow(familyId);
      return NextResponse.json({ ok: true, family, membership: m, state });
    }

    if (action === "save_state") {
      const familyId = String(body.familyId || "");
      const m = await requireMembership(userId, familyId);
      const incoming = body.state && typeof body.state === "object" ? body.state : {};
      const expectedUpdatedAt = String(body.expectedUpdatedAt || "");
      const current = await familyState(familyId);

      // Optimistic concurrency: never silently overwrite a newer family snapshot.
      if (expectedUpdatedAt && current?.updated_at && expectedUpdatedAt !== current.updated_at) {
        const latest = await canonicalStateRow(familyId);
        return NextResponse.json({
          ok: false,
          error: "This family was updated on another device. Refreshing the newest version before saving.",
          code: "STATE_CONFLICT",
          state: latest,
        }, { status: 409 });
      }

      if (m.role === "owner") await syncGraphFromState(familyId, incoming, true);
      else await syncOwnPersonFromState(familyId, incoming, m.person_id, userId);
      // Notification ledger is backend-owned. Browser state saves must never erase it.
      const incomingWithBackendState = {
        ...incoming,
        __notificationLedgerV3: Array.isArray(current?.state?.__notificationLedgerV3) ? current.state.__notificationLedgerV3 : [],
      };
      const merged = await canonicalState(familyId, incomingWithBackendState);
      const state = (await insert("family_states", {
        family_id: familyId, state: merged, photos: body.photos || {},
        removed_members: Array.isArray(body.removedMembers) ? body.removedMembers : [],
        updated_at: new Date().toISOString(),
      }, true, "family_id"))?.[0] || null;
      return NextResponse.json({ ok: true, state });
    }

    if (action === "link_person") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const personId = String(body.personId || "") || null;
      const rows = await patch("family_memberships", `family_id=eq.${encodeURIComponent(familyId)}&user_id=eq.${encodeURIComponent(userId)}`, { person_id: personId });
      if (personId) await patch("family_people", `family_id=eq.${encodeURIComponent(familyId)}&person_id=eq.${encodeURIComponent(personId)}`, { claimed_by_user_id: userId, updated_at: new Date().toISOString() }).catch(() => {});
      if (body.ownerPersonId) await patch("families", `id=eq.${encodeURIComponent(familyId)}&owner_user_id=eq.${encodeURIComponent(userId)}`, { owner_person_id: String(body.ownerPersonId) });
      return NextResponse.json({ ok: true, membership: rows?.[0] || null });
    }

    if (action === "list_join_requests") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId, true);
      const rows = await select("join_requests", `family_id=eq.${encodeURIComponent(familyId)}&status=eq.pending&select=*&order=requested_at.asc`);
      return NextResponse.json({ ok: true, requests: rows || [] });
    }

    if (action === "approve_join") {
      const familyId = String(body.familyId || "");
      const requestId = String(body.requestId || "");
      const viewerMembership = await requireMembership(userId, familyId, true);
      const request = (await select("join_requests", `id=eq.${encodeURIComponent(requestId)}&family_id=eq.${encodeURIComponent(familyId)}&select=*&limit=1`))?.[0];
      if (!request) return jsonError("Join request was not found", 404);
      if (request.status !== "pending") return jsonError("This join request has already been processed", 409);

      const currentState = (await familyState(familyId)) || { state: {}, photos: {}, removed_members: [] };
      if (!(await graphPeople(familyId)).length && Array.isArray(currentState?.state?.people)) {
        await syncGraphFromState(familyId, currentState.state, false);
      }
      let people = await graphPeople(familyId);
      let relationships = await graphRelationships(familyId);
      const memberships = await select("family_memberships", `family_id=eq.${encodeURIComponent(familyId)}&select=user_id,person_id`);
      const claimed = new Set((memberships || []).filter((m) => m.person_id).map((m) => String(m.person_id)));

      let person = people.find((p) => normalizeName(p.name) === normalizeName(request.name) && !claimed.has(String(p.person_id)));
      const requestedGender = genderFromRelation(request.relation);
      if (!person) {
        const personId = newPersonId();
        const profile = { id: personId, name: request.name, gender: requestedGender, dob: "", phone: "", address: "", createdAt: Date.now() };
        person = (await insert("family_people", {
          family_id: familyId, person_id: personId, name: request.name, gender: requestedGender || null,
          is_placeholder: false, claimed_by_user_id: request.user_id, profile, updated_at: new Date().toISOString(),
        }, true, "family_id,person_id"))?.[0];
      } else {
        const updatedProfile = { ...(person.profile || {}), id: person.person_id, name: request.name };
        if (requestedGender && !updatedProfile.gender) updatedProfile.gender = requestedGender;
        person = (await patch("family_people", `family_id=eq.${encodeURIComponent(familyId)}&person_id=eq.${encodeURIComponent(person.person_id)}`, {
          name: request.name, gender: person.gender || requestedGender || null, is_placeholder: false,
          claimed_by_user_id: request.user_id, profile: updatedProfile, updated_at: new Date().toISOString(),
        }))?.[0] || person;
      }

      if (!people.some((p) => p.person_id === person.person_id)) people.push(person);
      await addJoinRelationship(familyId, relationships, request.anchor_person_id, person.person_id, request.relation);
      relationships = await graphRelationships(familyId);

      await patch("join_requests", `id=eq.${encodeURIComponent(requestId)}`, {
        status: "approved", approved_at: new Date().toISOString(), rejected_at: null, person_id: person.person_id,
      });
      const newMembership = (await insert("family_memberships", {
        family_id: familyId, user_id: request.user_id, role: "member", display_name: request.name, person_id: person.person_id,
      }, true, "family_id,user_id"))?.[0] || null;

      const canonical = await canonicalState(familyId, currentState.state || {});
      const savedState = (await insert("family_states", {
        family_id: familyId, state: canonical, photos: currentState.photos || {}, removed_members: currentState.removed_members || [], updated_at: new Date().toISOString(),
      }, true, "family_id"))?.[0] || null;
      const family = await familyRow(familyId);
      return NextResponse.json({ ok: true, family, viewerMembership, newMembership, person, state: savedState });
    }

    if (action === "reject_join") {
      const familyId = String(body.familyId || "");
      const requestId = String(body.requestId || "");
      await requireMembership(userId, familyId, true);
      await patch("join_requests", `id=eq.${encodeURIComponent(requestId)}&family_id=eq.${encodeURIComponent(familyId)}`, { status: "rejected", rejected_at: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }

    if (action === "list_documents") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const documents = await documentStateRows(familyId);
      return NextResponse.json({ ok: true, documents });
    }

    if (action === "save_document") {
      const familyId = String(body.familyId || "");
      const m = await requireMembership(userId, familyId);
      const title = String(body.title || "").trim();
      const category = String(body.category || "").trim();
      const accessLevel = String(body.accessLevel || "Entire family").trim();
      const fileName = String(body.fileName || "document").replace(/[^a-zA-Z0-9._-]/g, "_");
      const clientId = String(body.recordId || `doc-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "_");
      const dataUrl = String(body.dataUrl || "");
      if (!title || !category || !dataUrl) return jsonError("Document name, category and file are required");
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return jsonError("Invalid file payload");
      const contentType = String(body.contentType || match[1] || "application/octet-stream");
      const allowed = /^(image\/(jpeg|png|webp|gif)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)|text\/plain)$/i;
      if (!allowed.test(contentType)) return jsonError("Unsupported file type. Use PDF, Word, Excel, text, JPG, PNG, WEBP or GIF.", 415);
      const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
      if (bytes.byteLength > 12 * 1024 * 1024) return jsonError("File is too large. Maximum size is 12 MB.", 413);
      const path = `${familyId}/${clientId}/${fileName}`;
      await supabaseFetch(`/storage/v1/object/family-documents/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { "Content-Type": contentType, "x-upsert": "true" }, body: bytes }, "service");
      const existing = await select("documents", `family_id=eq.${encodeURIComponent(familyId)}&client_id=eq.${encodeURIComponent(clientId)}&select=id&limit=1`);
      const values = { uploaded_by: userId, title, category, access_level: accessLevel, storage_path: path, file_name: fileName, file_type: contentType, file_size: bytes.byteLength, client_id: clientId };
      let row;
      if (existing?.[0]?.id) row = (await patch("documents", `id=eq.${encodeURIComponent(existing[0].id)}&family_id=eq.${encodeURIComponent(familyId)}`, values))?.[0];
      else row = (await insert("documents", { family_id: familyId, ...values }))?.[0];
      return NextResponse.json({ ok: true, document: { id: clientId, dbId: row?.id, name: title, cat: category, access: accessLevel, storagePath: path, storageBucket: "family-documents", fileName, fileType: contentType, fileSize: bytes.byteLength, uploadedAt: row?.created_at || new Date().toISOString(), postedBy: m.display_name || "Family member", postedById: m.person_id || "" } });
    }

    if (action === "delete_document") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const clientId = String(body.recordId || "");
      const rows = await select("documents", `family_id=eq.${encodeURIComponent(familyId)}&client_id=eq.${encodeURIComponent(clientId)}&select=*`);
      const row = rows?.[0];
      if (row?.storage_path) {
        try { await supabaseFetch(`/storage/v1/object/family-documents`, { method: "DELETE", body: JSON.stringify({ prefixes: [row.storage_path] }) }, "service"); } catch (e) { console.warn("Document object cleanup:", e?.message); }
      }
      if (row?.id) await removeRows("documents", `id=eq.${encodeURIComponent(row.id)}&family_id=eq.${encodeURIComponent(familyId)}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_document_category") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const category = String(body.category || "");
      const rows = await select("documents", `family_id=eq.${encodeURIComponent(familyId)}&category=eq.${encodeURIComponent(category)}&select=*`);
      for (const row of rows || []) {
        if (row.storage_path) {
          try { await supabaseFetch(`/storage/v1/object/family-documents`, { method: "DELETE", body: JSON.stringify({ prefixes: [row.storage_path] }) }, "service"); } catch (e) { console.warn("Document object cleanup:", e?.message); }
        }
      }
      await removeRows("documents", `family_id=eq.${encodeURIComponent(familyId)}&category=eq.${encodeURIComponent(category)}`);
      return NextResponse.json({ ok: true });
    }

    if (action === "upload_file") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const bucket = body.bucket === "profile-photos" ? "profile-photos" : "family-documents";
      const fileName = String(body.fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
      const recordId = String(body.recordId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "_");
      const dataUrl = String(body.dataUrl || "");
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return jsonError("Invalid file payload");
      const contentType = String(body.contentType || match[1] || "application/octet-stream");
      const allowed = /^(image\/(jpeg|png|webp|gif)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)|text\/plain)$/i;
      if (!allowed.test(contentType)) return jsonError("Unsupported file type. Use PDF, Word, Excel, text, JPG, PNG, WEBP or GIF.", 415);
      const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
      if (bytes.byteLength > 12 * 1024 * 1024) return jsonError("File is too large. Maximum size is 12 MB.", 413);
      const path = `${familyId}/${recordId}/${fileName}`;
      await supabaseFetch(`/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { "Content-Type": contentType, "x-upsert": "true" }, body: bytes }, "service");
      return NextResponse.json({ ok: true, bucket, path });
    }

    if (action === "download_file") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const bucket = body.bucket === "profile-photos" ? "profile-photos" : "family-documents";
      const path = String(body.path || "");
      if (!path.startsWith(`${familyId}/`)) return jsonError("Invalid file path", 403);
      const requestedName = String(body.fileName || path.split("/").pop() || "document");
      const safeName = requestedName.replace(/[\r\n\"]/g, "_");
      const objectPath = path.split("/").map(encodeURIComponent).join("/");
      const headers = new Headers({ apikey: SUPABASE_SERVICE_ROLE_KEY });
      if (SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")) headers.set("Authorization", `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`);
      const storageRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, { method: "GET", headers, cache: "no-store" });
      if (!storageRes.ok) {
        const details = await storageRes.text().catch(() => "");
        return jsonError(details || "Could not download document", storageRes.status);
      }
      const bytes = await storageRes.arrayBuffer();
      const contentType = storageRes.headers.get("content-type") || String(body.contentType || "application/octet-stream");
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(requestedName)}`,
          "Content-Length": String(bytes.byteLength),
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    if (action === "sign_file") {
      const familyId = String(body.familyId || "");
      await requireMembership(userId, familyId);
      const bucket = body.bucket === "profile-photos" ? "profile-photos" : "family-documents";
      const path = String(body.path || "");
      if (!path.startsWith(`${familyId}/`)) return jsonError("Invalid file path", 403);
      const signed = await supabaseFetch(`/storage/v1/object/sign/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", body: JSON.stringify({ expiresIn: 3600 }) }, "service");
      const signedPath = signed?.signedURL || signed?.signedUrl || "";
      const url = signedPath.startsWith("http") ? signedPath : `${SUPABASE_URL}/storage/v1${signedPath}`;
      return NextResponse.json({ ok: true, url });
    }

    return jsonError("Unknown backend action", 404);
  } catch (error) {
    console.error("Family Sphere Supabase API:", error);
    return jsonError(error?.message || "Backend request failed", error?.status || 500, error?.payload);
  }
}
