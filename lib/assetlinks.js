/**
 * Digital Asset Links for the Android app (package org.openexamhub.app).
 * Served at https://openexamhub.org/.well-known/assetlinks.json
 * (public file for Workers Static Assets, and worker/index.js if the asset is missing).
 *
 * The fingerprint below is a PLACEHOLDER. App Links stay unverified until it is replaced
 * with the SHA-256 of the Play App Signing certificate:
 * Play Console → your app → Test and release → App integrity → App signing key certificate.
 * Do not put the upload key here once Play App Signing is on; Google signs installs with the app signing key.
 */
export const PLAY_APP_SIGNING_SHA256_PLACEHOLDER =
  '00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF';

export const ASSETLINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'org.openexamhub.app',
      sha256_cert_fingerprints: [PLAY_APP_SIGNING_SHA256_PLACEHOLDER]
    }
  }
];

export function assetlinksJson() {
  return `${JSON.stringify(ASSETLINKS, null, 2)}\n`;
}
