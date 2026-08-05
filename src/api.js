const API_BASE = "https://wcpbrejdznoiodspcedn.supabase.co/functions/v1";

function getDeviceId() {
  let id = localStorage.getItem("device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("device_id", id);
  }
  return id;
}

async function callFunction(name, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Impossible de contacter le serveur. Vérifiez la connexion internet.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur (${name})`);
  return data;
}

export async function activateLicense({ code, shopName }) {
  return callFunction("activate", { code, device_id: getDeviceId(), shop_name: shopName });
}

export async function checkLicense() {
  return callFunction("check", { device_id: getDeviceId() });
}

export async function getOwnerShops({ email, birthdate }) {
  return callFunction("owner-shops", { email, birthdate });
}

function getShopDeviceSecret() { return localStorage.getItem("shop_device_secret"); }
function setShopDeviceSecret(v) { localStorage.setItem("shop_device_secret", v); }
function getBackendShopId() { return localStorage.getItem("backend_shop_id"); }
function setBackendShopId(v) { localStorage.setItem("backend_shop_id", v); }

export function isShopLinked() {
  return !!(getBackendShopId() && getShopDeviceSecret());
}

export async function createShopBackend({ name, type, currency, adminPin, vendorName, vendorPin }) {
  const data = await callFunction("create-shop", {
    name, type, currency, admin_pin: adminPin,
    vendor_name: vendorName, vendor_pin: vendorPin,
    device_id: getDeviceId(),
  });
  setBackendShopId(data.shop_id);
  setShopDeviceSecret(data.device_secret);
  return data;
}

export async function joinShopBackend({ joinCode }) {
  const data = await callFunction("join-shop", { join_code: joinCode, device_id: getDeviceId() });
  setBackendShopId(data.shop_id);
  setShopDeviceSecret(data.device_secret);
  return data;
}

function shopAuthFields() {
  return { device_id: getDeviceId(), device_secret: getShopDeviceSecret() };
}

export async function loginBackend({ role, pin }) {
  return callFunction("auth", { ...shopAuthFields(), role, pin });
}

export async function getStoreValue(key) {
  const data = await callFunction("store", { ...shopAuthFields(), action: "get", key });
  return data.value;
}
export async function setStoreValue(key, value) {
  return callFunction("store", { ...shopAuthFields(), action: "set", key, value });
}

export async function listVendorsBackend(adminPin) {
  const data = await callFunction("manage-vendors", { ...shopAuthFields(), admin_pin: adminPin, action: "list" });
  return data.vendors;
}
export async function createVendorBackend(adminPin, vendor) {
  return callFunction("manage-vendors", { ...shopAuthFields(), admin_pin: adminPin, action: "create", vendor });
}
export async function updateVendorBackend(adminPin, vendorId, vendor) {
  return callFunction("manage-vendors", { ...shopAuthFields(), admin_pin: adminPin, action: "update", vendor_id: vendorId, vendor });
}
export async function deleteVendorBackend(adminPin, vendorId) {
  return callFunction("manage-vendors", { ...shopAuthFields(), admin_pin: adminPin, action: "delete", vendor_id: vendorId });
    }
