// src/api.js
//
// Client réseau + moteur de synchronisation "hors-ligne d'abord".
// Principe : l'application écrit TOUJOURS en local en premier (jamais bloquée
// par une coupure réseau). Chaque clé modifiée est marquée "à synchroniser".
// Dès que la connexion est là, une synchronisation en arrière-plan envoie les
// changements en attente au serveur, silencieusement.

import bcrypt from "bcryptjs";

const API_BASE = "https://wcpbrejdznoiodspcedn.supabase.co/functions/v1";

/* ---------- Identifiant d'appareil ---------- */

function getDeviceId() {
  let id = localStorage.getItem("device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("device_id", id);
  }
  return id;
}

/* ---------- Appel réseau de base ---------- */

async function callFunction(name, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("OFFLINE");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur (${name})`);
  return data;
}

/* ---------- Licence (inchangé) ---------- */

export async function activateLicense({ code, shopName }) {
  return callFunction("activate", { code, device_id: getDeviceId(), shop_name: shopName });
}
export async function checkLicense() {
  return callFunction("check", { device_id: getDeviceId() });
}

/* ---------- Propriétaire (page Abonnement, inchangé) ---------- */

export async function getOwnerShops({ email, secret }) {
  return callFunction("owner-shops", { email, secret });
}

/* ---------- Liaison boutique <-> appareil ---------- */

function getShopDeviceSecret() { return localStorage.getItem("shop_device_secret"); }
function setShopDeviceSecret(v) { localStorage.setItem("shop_device_secret", v); }
function getBackendShopId() { return localStorage.getItem("backend_shop_id"); }
function setBackendShopId(v) { localStorage.setItem("backend_shop_id", v); }

export function isShopLinked() {
  return !!(getBackendShopId() && getShopDeviceSecret());
}

function shopAuthFields() {
  return { device_id: getDeviceId(), device_secret: getShopDeviceSecret() };
}

// Crée une boutique côté serveur (device + shop_id uniquement — le contenu
// réel de la boutique, lui, est poussé ensuite via le moteur de synchro).
export async function createShopBackend({ name, type, currency }) {
  const data = await callFunction("create-shop", { name, type, currency, device_id: getDeviceId() });
  setBackendShopId(data.shop_id);
  setShopDeviceSecret(data.device_secret);
  return data; // { shop_id, join_code, device_secret }
}

export async function joinShopBackend({ joinCode }) {
  const data = await callFunction("join-shop", { join_code: joinCode, device_id: getDeviceId() });
  setBackendShopId(data.shop_id);
  setShopDeviceSecret(data.device_secret);
  return data; // { shop_id, device_secret }
}

/* ---------- Synchronisation générique (clé/valeur) ---------- */

const ALL_SYNC_KEYS = [
  "shopMeta", "vendors", "products", "sales", "categories",
  "suppliers", "expenses", "movements", "inventories", "clients",
];

function getSyncQueue() {
  try { return JSON.parse(localStorage.getItem("sync_queue") || "{}"); } catch { return {}; }
}
function setSyncQueue(q) {
  localStorage.setItem("sync_queue", JSON.stringify(q));
}
export function markDirty(key) {
  const q = getSyncQueue();
  q[key] = true;
  setSyncQueue(q);
}
export function getPendingCount() {
  return Object.keys(getSyncQueue()).length;
}

async function pushOne(key, value) {
  await callFunction("store", { ...shopAuthFields(), action: "set", key, value });
}
async function pullOne(key) {
  const data = await callFunction("store", { ...shopAuthFields(), action: "get", key });
  return data.value;
}

// Tente d'envoyer toutes les clés en attente. Ne jette jamais d'erreur :
// en cas d'échec (hors-ligne), les clés restent en attente pour la prochaine
// tentative. `getLocalValue(key)` doit renvoyer la valeur locale actuelle.
export async function flushSyncQueue(getLocalValue) {
  if (!isShopLinked()) return { synced: 0, remaining: 0, lastError: null };
  const queue = getSyncQueue();
  const keys = Object.keys(queue);
  let synced = 0;
  let lastError = null;
  for (const key of keys) {
    try {
      await pushOne(key, getLocalValue(key));
      delete queue[key];
      synced += 1;
      setSyncQueue(queue);
    } catch (e) {
      lastError = `${key} : ${e.message}`;
      if (e.message === "OFFLINE") break; // pas la peine d'essayer les autres, pas de réseau
      // sinon (erreur serveur sur CETTE clé) — on continue avec les autres clés
    }
  }
  return { synced, remaining: Object.keys(getSyncQueue()).length, lastError };
}

// Récupère l'intégralité des données de la boutique depuis le serveur
// (utilisé juste après avoir rejoint une boutique existante, ou pour
// resynchroniser un appareil).
export async function pullAll() {
  const result = {};
  for (const key of ALL_SYNC_KEYS) {
    try {
      result[key] = await pullOne(key);
    } catch {
      result[key] = undefined; // hors-ligne — on gardera les valeurs locales
    }
  }
  return result;
}

/* ---------- Mots de passe (hachage local, sécurité conservée) ---------- */

export function hashPin(pin) {
  return bcrypt.hashSync(pin, 8);
}
export function verifyPin(pin, hash) {
  if (!hash) return false;
  try { return bcrypt.compareSync(pin, hash); } catch { return false; }
}
