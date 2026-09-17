import { registerRootComponent } from 'expo';

// Hermes in React Native does not currently support TextDecoder('utf-16le').
// h3-js initializes that decoder at module load, which crashes the app before
// React can render. Temporarily hide TextDecoder while loading the app so
// h3-js takes its pure-JS UTF-16 fallback, then restore it immediately.
const originalTextDecoder = globalThis.TextDecoder;
let restoreTextDecoder = false;

if (typeof originalTextDecoder === 'function') {
  try {
    // Probe the exact encoding used by h3-js.
    new originalTextDecoder('utf-16le');
  } catch {
    try {
      globalThis.TextDecoder = undefined;
      restoreTextDecoder = true;
    } catch {
      // If the global is not writable, the module-level workaround below
      // cannot be applied; keep startup behavior unchanged.
    }
  }
}

const { OnboardingGate } = require('./src/OnboardingGate');

if (restoreTextDecoder) {
  globalThis.TextDecoder = originalTextDecoder;
}

registerRootComponent(OnboardingGate);
