import { config } from "dotenv";
import { beforeEach } from "vitest";

// Load .env then .env.local (local overrides for test credentials).
config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Node 25+ can inject a broken experimental `localStorage` that shadows
 * jsdom's Storage (no getItem/setItem/clear). CI uses Node 22 where jsdom
 * works. Install a Storage.prototype-backed shim once so draft/sync tests
 * and `vi.spyOn(Storage.prototype, "setItem")` keep working.
 */
let installed = false;

function ensureUsableLocalStorage() {
  if (typeof window === "undefined" || typeof Storage === "undefined") return;

  let needsReplace = false;
  try {
    needsReplace = !window.localStorage || typeof window.localStorage.clear !== "function";
  } catch {
    needsReplace = true;
  }
  if (!needsReplace) return;

  if (!installed) {
    const stores = new WeakMap<object, Map<string, string>>();

    const getStore = (target: object) => {
      let store = stores.get(target);
      if (!store) {
        store = new Map();
        stores.set(target, store);
      }
      return store;
    };

    Object.defineProperties(Storage.prototype, {
      length: {
        configurable: true,
        enumerable: true,
        get(this: object) {
          return getStore(this).size;
        },
      },
      key: {
        configurable: true,
        enumerable: true,
        writable: true,
        value(this: object, index: number) {
          return [...getStore(this).keys()][index] ?? null;
        },
      },
      getItem: {
        configurable: true,
        enumerable: true,
        writable: true,
        value(this: object, key: string) {
          const store = getStore(this);
          const k = String(key);
          return store.has(k) ? (store.get(k) ?? null) : null;
        },
      },
      setItem: {
        configurable: true,
        enumerable: true,
        writable: true,
        value(this: object, key: string, value: string) {
          getStore(this).set(String(key), String(value));
        },
      },
      removeItem: {
        configurable: true,
        enumerable: true,
        writable: true,
        value(this: object, key: string) {
          getStore(this).delete(String(key));
        },
      },
      clear: {
        configurable: true,
        enumerable: true,
        writable: true,
        value(this: object) {
          getStore(this).clear();
        },
      },
    });
    installed = true;
  }

  const storage = Object.create(Storage.prototype) as Storage;
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    enumerable: true,
    value: storage,
  });
}

beforeEach(() => {
  ensureUsableLocalStorage();
  if (typeof window === "undefined") return;
  try {
    // Node 25's origin-scoped localStorage is process-global. Without a reset,
    // drafts and TUS fingerprints leak across files and fail unrelated suites.
    window.localStorage.clear();
  } catch {
    // Opaque origins can throw; the shim above already replaced unusable storage.
  }
});
