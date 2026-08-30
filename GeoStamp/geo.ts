/*
 * The parts of this control that are not a control: coordinate arithmetic,
 * validation, and reading a message off whatever a platform API rejected with.
 *
 * ---
 *
 * **They are in their own module because they had to be.** `pcf-scripts`
 * refuses to build a control whose entry file defines more than one export —
 * `[pcf-1023] Control source code defines more than one export` — so an
 * exported helper beside the control class fails the build, before webpack, in
 * a message that names no file and no symbol. The two ways out are to stop
 * exporting the helpers, which makes them unreachable from anywhere else, or to
 * put them here. Only the entry point is declared in the manifest; anything it
 * imports is bundled with it, so a second module costs nothing.
 */

/**
 * Reads a message off whatever a platform API rejected with.
 *
 * Three shapes arrive here and only one of them is an `Error`:
 *
 *   - `context.webAPI` rejects with `{ errorCode, message }` — a plain object,
 *     exactly as the Client API's `errorCallback` documents.
 *   - The device APIs reject with `{ code, message }`. Same idea, different
 *     name for the number.
 *   - `getCurrentPosition` also rejects with **`null`**, documented for an
 *     older mobile client or a device with no geolocation hardware.
 *
 * So the reflex that handles every other failure in a TypeScript codebase —
 * `error instanceof Error ? error.message : String(error)` — falls through to
 * `String({ code, message })` and renders the literal text "[object Object]"
 * where the platform's explanation belongs, and throws outright on the third.
 *
 * Returns `''` rather than a sentence when there is nothing usable, so the
 * caller picks a localised string instead of showing punctuation.
 */
export function describeError(error: unknown): string {
    if (error === null || error === undefined) {
        return '';
    }

    if (error instanceof Error && error.message !== '') {
        return error.message;
    }

    if (typeof error === 'object') {
        const message = (error as { message?: unknown }).message;

        if (typeof message === 'string' && message !== '') {
            return message;
        }
    }

    return typeof error === 'string' ? error : '';
}

/**
 * `createRecord` resolves with an `EntityReference` whose `id` is an object
 * carrying a `guid` — not a string. `String(reference.id)` is therefore the
 * literal text "[object Object]", which stores cleanly in an output property
 * and is discovered by whoever tries to open the note.
 *
 * A plain string turns up too, depending on the host, so both are accepted and
 * nothing else is.
 */
export function readGuid(id: unknown): string {
    if (typeof id === 'string') {
        return id;
    }

    if (typeof id === 'object' && id !== null) {
        const guid = (id as { guid?: unknown }).guid;

        if (typeof guid === 'string') {
            return guid;
        }
    }

    return '';
}

/**
 * Six places is about 0.1 m at the equator, finer than any consumer GPS
 * resolves — so digits past it are noise that reads as precision.
 *
 * Clamped rather than trusted because `toFixed` throws a `RangeError` outside
 * 0–100 and a maker can type anything into a whole-number property. A thrown
 * RangeError here would surface as a control that does nothing when pressed.
 */
export function clampPrecision(raw: number | null): number {
    if (raw === null || !Number.isFinite(raw)) {
        return 6;
    }

    return Math.min(Math.max(Math.trunc(raw), 0), 10);
}

/**
 * `{0}` substitution.
 *
 * The strings are templates rather than concatenations so a translation can put
 * the number where its language wants it — German and Japanese both move it.
 */
export function format(template: string, value: string): string {
    return template.replace('{0}', value);
}

export function isGuid(value: string): boolean {
    return /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i.test(value);
}

/**
 * A Dataverse logical name, and the reason it is checked here.
 *
 * The table name is interpolated into a navigation property
 * (`objectid_<entity>@odata.bind`) and reaches the server as part of a request.
 * On the fallback identity path it is free text a maker typed into a properties
 * pane. A logical name is `/^[a-z][a-z0-9_]*$/`; anything else cannot name a
 * table, so anything else is refused before it is sent rather than after.
 */
export function isLogicalName(value: string): boolean {
    return /^[a-z][a-z0-9_]*$/.test(value);
}

/** The zoom the thumbnail is drawn at. Street level, one tile, no panning. */
export const TILE_ZOOM = 15;

/**
 * The one slippy-map tile containing a point, as arithmetic.
 *
 * No SDK, no key, no third-party script — an `<img>` and the standard Web
 * Mercator projection. That is the same trade `pcf-sparkline` made with a
 * constant `viewBox`: the maths is nine lines and a dependency is forever, and
 * this one would also be a second external host to declare.
 *
 * Returns `''` for anything it will not build, and the scheme check is the
 * point of that: `tileUrlTemplate` is free text from a properties pane and its
 * result reaches an `img` src, so `javascript:` and `data:` are refused here
 * rather than by the browser.
 */
export function tileUrl(template: string, latitude: number, longitude: number): string {
    if (!/^https:\/\//i.test(template) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return '';
    }

    // Web Mercator is undefined at the poles; ±85.0511 is the standard clamp,
    // and without it a reading from an ice station produces NaN tile indices.
    const lat = Math.min(Math.max(latitude, -85.0511), 85.0511);
    const scale = 2 ** TILE_ZOOM;

    const x = Math.floor(((longitude + 180) / 360) * scale);
    const y = Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * scale);

    return template
        .replace('{z}', String(TILE_ZOOM))
        .replace('{x}', String(Math.min(Math.max(x, 0), scale - 1)))
        .replace('{y}', String(Math.min(Math.max(y, 0), scale - 1)));
}
