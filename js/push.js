// ============================================================
// push.js — Web Push helpers for Pickleball League Manager
//
// Implements:
//   • VAPID key pair generation (ECDSA P-256)
//   • VAPID JWT creation and signing (ES256)
//   • Web Push message encryption (RFC 8291, aes128gcm)
//   • Browser push subscription management
//
// Used by admin.js (send notifications) and player.js (subscribe).
// ============================================================

const VapidPush = (() => {
  const enc = new TextEncoder();

  // ── Base64url encode / decode ─────────────────────────────

  function b64uEncode(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64uDecode(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }

  // ── HKDF (HMAC-SHA-256) ───────────────────────────────────

  async function hkdfExtract(salt, ikm) {
    const key = await crypto.subtle.importKey(
      'raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
  }

  async function hkdfExpand(prk, info, len) {
    const key    = await crypto.subtle.importKey(
      'raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const infoU8 = info instanceof Uint8Array ? info : enc.encode(info);
    let prev = new Uint8Array(0);
    let out  = new Uint8Array(0);
    for (let i = 1; out.length < len; i++) {
      const data = new Uint8Array(prev.length + infoU8.length + 1);
      data.set(prev);
      data.set(infoU8, prev.length);
      data[prev.length + infoU8.length] = i;
      prev = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
      const merged = new Uint8Array(out.length + prev.length);
      merged.set(out);
      merged.set(prev, out.length);
      out = merged;
    }
    return out.slice(0, len);
  }

  // ── VAPID key generation ──────────────────────────────────

  async function generateVapidKeys() {
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
    );
    const pubRaw  = new Uint8Array(await crypto.subtle.exportKey('raw',  pair.publicKey));
    const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    return {
      publicKey:  b64uEncode(pubRaw),
      privateKey: JSON.stringify(privJwk),
    };
  }

  // ── VAPID JWT (ES256) ─────────────────────────────────────

  async function createVapidJwt(privJwkStr, audience, subject) {
    const jwk = typeof privJwkStr === 'string' ? JSON.parse(privJwkStr) : privJwkStr;
    const key  = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
    );
    const header  = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const payload = b64uEncode(enc.encode(JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 43200,  // 12 h
      sub: subject,
    })));
    const toSign = `${header}.${payload}`;
    const sig    = new Uint8Array(await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      key,
      enc.encode(toSign)
    ));
    return `${toSign}.${b64uEncode(sig)}`;
  }

  // ── Web Push encryption (RFC 8291, aes128gcm) ─────────────

  async function encryptPayload(plaintext, p256dhB64, authB64) {
    const recipPubRaw = b64uDecode(p256dhB64);
    const authBytes   = b64uDecode(authB64);

    const recipPub = await crypto.subtle.importKey(
      'raw', recipPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, true, []
    );

    const ephemeral = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
    );
    const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

    const sharedSecret = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'ECDH', public: recipPub }, ephemeral.privateKey, 256)
    );

    const salt = crypto.getRandomValues(new Uint8Array(16));

    // PRK_combine = HKDF-Extract(salt=auth, IKM=sharedSecret)
    const prkCombine = await hkdfExtract(authBytes, sharedSecret);

    // key_info = "WebPush: info\0" || ua_pub(65) || as_pub(65)
    const labelBytes = enc.encode('WebPush: info\x00');
    const keyInfo    = new Uint8Array(labelBytes.length + recipPubRaw.length + ephPubRaw.length);
    keyInfo.set(labelBytes);
    keyInfo.set(recipPubRaw, labelBytes.length);
    keyInfo.set(ephPubRaw,   labelBytes.length + recipPubRaw.length);

    const ikm  = await hkdfExpand(prkCombine, keyInfo, 32);
    const prk2 = await hkdfExtract(salt, ikm);
    const cek  = await hkdfExpand(prk2, enc.encode('Content-Encoding: aes128gcm\x00'), 16);
    const iv   = await hkdfExpand(prk2, enc.encode('Content-Encoding: nonce\x00'),     12);

    // Pad: append 0x02 record delimiter
    const ptBytes = enc.encode(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext));
    const padded  = new Uint8Array(ptBytes.length + 1);
    padded.set(ptBytes);
    padded[ptBytes.length] = 0x02;

    const aesKey     = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, padded)
    );

    // Record: salt(16) + rs(uint32be=4096) + keylen(1=65) + as_pub(65) + ciphertext
    const record = new Uint8Array(16 + 4 + 1 + 65 + ciphertext.length);
    const view   = new DataView(record.buffer);
    let   off    = 0;
    record.set(salt, off);              off += 16;
    view.setUint32(off, 4096, false);   off += 4;
    record[off++] = 65;
    record.set(ephPubRaw, off);         off += 65;
    record.set(ciphertext, off);

    return record;
  }

  // ── Send one push notification ────────────────────────────

  async function sendOne(subscription, payload, privJwkStr, vapidPubB64, subject) {
    const url      = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const jwt      = await createVapidJwt(privJwkStr, audience, subject);
    const body     = await encryptPayload(
      typeof payload === 'string' ? payload : JSON.stringify(payload),
      subscription.keys.p256dh,
      subscription.keys.auth
    );
    const resp = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization:        `vapid t=${jwt},k=${vapidPubB64}`,
        'Content-Encoding':   'aes128gcm',
        'Content-Type':       'application/octet-stream',
        TTL:                  '86400',
      },
      body,
    });
    return { ok: resp.ok, status: resp.status, endpoint: subscription.endpoint };
  }

  // ── Send to all subscribers ───────────────────────────────

  async function sendToAll(subscriptions, payload, privJwkStr, vapidPubB64, subject) {
    const results = await Promise.allSettled(
      subscriptions.map(sub => sendOne(sub, payload, privJwkStr, vapidPubB64, subject))
    );
    let sent = 0, failed = 0;
    const expired = [];
    results.forEach((r, i) => {
      const ok     = r.status === 'fulfilled' && r.value.ok;
      const status = r.status === 'fulfilled' ? r.value.status : 0;
      if (ok) {
        sent++;
      } else {
        failed++;
        if (status === 404 || status === 410) expired.push(subscriptions[i].endpoint);
      }
    });
    return { sent, failed, expired };
  }

  // ── Browser subscription management ──────────────────────

  async function subscribeToPush(vapidPublicKeyB64) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push notifications are not supported in this browser.');
    }
    const reg    = await navigator.serviceWorker.ready;
    const appKey = b64uDecode(vapidPublicKeyB64);
    const sub    = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: appKey,
    });
    return sub.toJSON();  // { endpoint, keys: { p256dh, auth } }
  }

  async function getExistingSubscription() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return sub ? sub.toJSON() : null;
    } catch { return null; }
  }

  async function unsubscribeFromPush() {
    if (!('serviceWorker' in navigator)) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await sub.unsubscribe(); return true; }
    } catch { /* ignore */ }
    return false;
  }

  // ── Build pre-encrypted notifications for server-side delivery ──────────
  // Encrypts each payload in the browser, returns objects the GAS proxy can
  // POST directly — avoiding the CORS block on Apple's push service.

  async function buildNotifications(subscriptions, payload, privJwkStr, vapidPubB64, subject) {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return Promise.all(subscriptions.map(async sub => {
      const url      = new URL(sub.endpoint);
      const audience = `${url.protocol}//${url.host}`;
      const jwt      = await createVapidJwt(privJwkStr, audience, subject);
      const vapidHeader = `vapid t=${jwt},k=${vapidPubB64}`;
      const encrypted   = await encryptPayload(str, sub.keys.p256dh, sub.keys.auth);
      // Standard base64 (not base64url) — GAS Utilities.base64Decode expects this
      let bin = '';
      for (const b of encrypted) bin += String.fromCharCode(b);
      return { endpoint: sub.endpoint, payloadB64: btoa(bin), vapidHeader };
    }));
  }

  return {
    generateVapidKeys,
    buildNotifications,
    sendToAll,
    sendOne,
    subscribeToPush,
    getExistingSubscription,
    unsubscribeFromPush,
  };
})();
