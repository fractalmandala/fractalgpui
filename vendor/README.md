# vendor

## `svelte/`

Svelte **5.57.0**, pinned at git commit `ff9658a`.

This is the custom-renderer Svelte build that `gpuix-svelte` requires. Upstream ships it inside itself, but a git install of `gpuix-svelte` does not unpack bundled dependencies, so the same build lives here as an unpacked package directory and is installed via `"svelte": "file:vendor/svelte"` in the app `package.json`.

Do not replace it with the registry `svelte`: same version number, none of the custom renderer API. When `gpuix-svelte` is published properly, this folder (and the direct `svelte` dependency) can go.
