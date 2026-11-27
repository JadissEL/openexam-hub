import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const Oeh = registerPlugin('Oeh');
const native = () => Capacitor.isNativePlatform();

export async function openExternal(url) {
  if (!url) return;
  if (native()) {
    try {
      await Browser.open({ url, presentationStyle: 'popover' });
      return;
    } catch {
      /* fall through */
    }
  }
  window.open(url, '_blank', 'noopener');
}

export async function lightHaptic() {
  if (!native()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* ignore */
  }
}

export async function syncStatusBar() {
  if (!native()) return;
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: dark ? '#12110F' : '#F7F5F0' });
  } catch {
    /* ignore */
  }
}

export function onBackButton(handler) {
  if (!native()) return () => {};
  let remove = () => {};
  App.addListener('backButton', handler).then((h) => {
    remove = () => h.remove();
  });
  return () => remove();
}

export function onAppUrl(handler) {
  if (!native()) return () => {};
  let remove = () => {};
  App.addListener('appUrlOpen', (event) => handler(event?.url)).then((h) => {
    remove = () => h.remove();
  });
  App.getLaunchUrl().then((res) => {
    if (res?.url) handler(res.url);
  }).catch(() => {});
  return () => remove();
}

async function call(method, args) {
  if (!native()) return null;
  try {
    return await Oeh[method](args || {});
  } catch (err) {
    return { error: err?.message || String(err) };
  }
}

export const setBanner = (visible, personalized) => call('setBanner', { visible: !!visible, personalized: !!personalized });
export const setAnalyticsEnabled = (enabled) => call('setAnalytics', { enabled: !!enabled });
export const setClarityEnabled = (enabled) => call('setClarity', { enabled: !!enabled });
export const setSensitive = (on) => call('setSensitive', { on: !!on });
export const logNativeEvent = (name, params) => call('logEvent', { name, params: params || {} });
export const setNativeScreen = (name) => call('setScreen', { name });
export const requestAdConsent = () => call('requestConsent', {});
export const showAdPrivacyOptions = () => call('showPrivacyOptions', {});
export const googleSignIn = () => call('googleSignIn', {});

export async function exitApp() {
  if (native()) {
    try {
      await App.exitApp();
    } catch {
      /* ignore */
    }
  }
}
