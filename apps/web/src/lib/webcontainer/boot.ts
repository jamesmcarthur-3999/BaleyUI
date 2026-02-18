/**
 * WebContainer Boot Singleton
 *
 * Lazily boots a single WebContainer instance per browser tab.
 * The WebContainer API is dynamically imported to avoid loading
 * the ~5MB WASM bundle until actually needed.
 */

let bootPromise: Promise<InstanceType<
  Awaited<typeof import('@webcontainer/api')>['WebContainer']
>> | null = null;

/**
 * Get or boot the singleton WebContainer instance.
 * Safe to call multiple times — returns the same instance.
 */
export async function getWebContainer() {
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    const { WebContainer } = await import('@webcontainer/api');
    const instance = await WebContainer.boot();
    return instance;
  })();

  return bootPromise;
}

/**
 * Tear down the WebContainer instance (e.g. on page unmount).
 */
export async function teardownWebContainer() {
  if (!bootPromise) return;
  try {
    const instance = await bootPromise;
    instance.teardown();
  } catch {
    // ignore teardown errors
  }
  bootPromise = null;
}
