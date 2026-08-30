/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * What it does: installs the DOM and the platform globals, loads
 * `out/controls/GeoStamp/bundle.js` the way a form would, drives the control
 * through the states a form can put it in, and asserts what it did.
 *
 * Why it exists alongside `npm start` and `dev/harness.html`: both of those
 * *show* you the control, and the states that matter most are ones nobody
 * thinks to look at — a column the user cannot read, a business rule that
 * failed, a host with no column metadata, a cleared value that has to travel
 * back as `null` rather than `undefined`. Those are decisions, they are what
 * regresses, and here they are assertions with an exit code.
 *
 * Why no test framework: there is none in this repository, and adding one to
 * run a handful of assertions against a bundle would be a dependency, a config
 * file and a second build pipeline for something `node` already does. It also
 * runs the **built bundle** rather than the TypeScript sources, which is the
 * part worth checking — webpack, the externals and the manifest all sit between
 * the source and what a form actually loads. CI runs it after the msbuild pack,
 * so there it drives the production bundle.
 *
 * **What passing here does NOT mean.** Every value below is supplied by this
 * file. It cannot tell you that the control looks right, that the stylesheet
 * applies, that focus order works, that a real form hands down what these
 * fixtures hand down, or that a save persists anything. Keep the answers to
 * those in SPEC.md under "Not verified".
 *
 * **And a stub must never be more capable than the thing it stands in for.**
 * `dev/host.js` withholds `security`, `attributes` and `fluentDesignLanguage`
 * exactly where the platform withholds them. When you add to it, stub the
 * refusals first — the argument the call requires, the field it omits, the
 * empty collection it hands back. If you cannot say what the real call
 * withholds, the stub is a guess and the assertions resting on it prove
 * nothing.
 *
 * ---
 *
 * **The assertions below the divider are a worked example. Replace them.**
 * Everything above the divider is plumbing that works for any field control;
 * the examples exercise the scaffolded control and are meant to be thrown away
 * with it.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Resolved from this file rather than from the working directory, so the script
// behaves the same run directly or through npm.
const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const clock = require('./clock.js');

const BUNDLE = path.join(root, 'out', 'controls', 'GeoStamp', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/GeoStamp. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

/*
 * Time, replaced with something the test drives.
 *
 * `vm.runInThisContext` below evaluates the bundle in *this* realm, so the
 * `Date`, `setInterval` and `setTimeout` the control closes over are the ones
 * installed here. That is what makes a control with a clock testable without
 * an injectable clock parameter — which would be production code bent to suit
 * a harness, and the only reason that seam would exist.
 *
 * A control with no timers is unaffected by this: nothing schedules, nothing
 * fires, and `time.pending()` stays at zero. Keep it anyway — the teardown
 * assertion at the bottom of this file is written against it, and it is the
 * assertion worth keeping when the worked example goes.
 *
 * The start value is arbitrary and fixed. A suite that starts at "now" asserts
 * something slightly different every time it runs.
 */
const time = clock.install(Date.UTC(2026, 0, 1, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

/*
 * The platform libraries, supplied under the names the bundle actually asks
 * for — read out of the bundle rather than written down here.
 *
 * A `<platform-library>` entry becomes a webpack external, and the global it
 * compiles to carries a version in its name. **That version is not the one the
 * manifest declares.** `pcf-scripts` maps a declared version onto the platform
 * build it supports, so Fluent `9.46.2` arrives as `FluentUIReactv940` and
 * React `16.14.0` as `Reactv16`. Hardcoding either is a trap that springs on
 * the next version bump, with a `ReferenceError` naming a global that appears
 * nowhere in the repository.
 *
 * A standard control has no externals at all, in which case both lists are
 * empty and nothing below runs.
 */
const reactGlobals = [...new Set(source.match(/\bReactv[\w]*\b/g) || [])];
const fluentGlobals = [...new Set(source.match(/\bFluentUIReact[\w]*\b/g) || [])];

let React = null;

if (reactGlobals.length > 0) {
    React = require(path.join(root, 'node_modules', 'react'));
    reactGlobals.forEach((name) => {
        global[name] = React;
    });
}

/*
 * Fluent is stubbed rather than loaded, the way the grid rig stubs it: every
 * component resolves to its own name as an element type, so
 * `React.createElement(Input, …)` produces `{ type: 'Input', props }` and the
 * props the control passed survive for inspection. These assertions are about
 * the control's decisions, not about how Fluent renders them — and Fluent 9
 * ships no UMD build, so there is nothing to load in a browser either.
 */
const fluent = new Proxy({}, { get: (_target, name) => (typeof name === 'string' ? name : undefined) });

fluentGlobals.forEach((name) => {
    global[name] = fluent;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

// `getString` returns a marked key rather than a real string, so an assertion
// can tell "read from the .resx" apart from "hardcoded in the source" — which
// would otherwise look identical in the output.
const marked = (key) => `resx:${key}`;

/**
 * Mount a fresh control in a given state and hand back everything worth
 * asserting about it.
 *
 * A new instance per state on purpose: `init` runs once per control on a real
 * form, so a suite that reused one instance would be testing a sequence the
 * platform never produces. Where the *sequence* is the point — a value arriving
 * after an edit — drive `updateView` again through the returned handle.
 */
/**
 * Every control mounted and not yet destroyed.
 *
 * A suite that mounts and walks away is testing something other than what it
 * says: an abandoned control keeps its interval and its `document` listeners,
 * so the next section's counts include them and the next event dispatched at
 * `document` reaches all of them. That is the leak the teardown assertion
 * exists to catch, and asserting it from inside one proves nothing.
 */
const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

function mount(options) {
    const container = dom.createElement('div');
    const calls = [];
    // Every mount gets the manifest's own defaults, including the ones in the
    // control-agnostic teardown section below. See MANIFEST_DEFAULTS.
    options = { ...options, inputs: { ...MANIFEST_DEFAULTS, ...(options.inputs || {}) } };
    // `getString` first, so a single assertion can override it — the marked key
    // proves a string came from the .resx, but it cannot prove a `{0}` was
    // substituted, because a marked key has no `{0}` in it to substitute.
    const context = host.createContext({ getString: marked, ...options, calls });
    const instance = new registration.ctor();

    let notifications = 0;

    instance.init(context, () => {
        notifications += 1;
    }, {}, container);

    // A standard control returns nothing and has written into `container`; a
    // virtual one returns the element it wants rendered and was handed no
    // container at all.
    const element = instance.updateView(context);

    const handle = {
        instance,
        container,
        element,
        props: () => (element && element.props) || {},
        outputs: () => instance.getOutputs(),
        notifications: () => notifications,
        /** `trackContainerResize` / `setFullScreen` calls the control made. */
        calls: () => calls,
        /** Re-render in a new state, as the platform does on every change. */
        update: (next) => instance.updateView(host.createContext({ getString: marked, ...options, ...next })),
        /** Unmount, as the platform does when the form closes or navigates. */
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(handle);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
        find: (selector) => container.querySelector(selector),
    };

    live.push(handle);

    return handle;
}

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}
/* ======================================================================== *
 *  This control is four controls, and every assertion below is about which
 *  one a given host gets. See the table at the top of GeoStamp/index.ts.
 *
 *  What makes the suite worth having: the three ways a device API refuses are
 *  not interchangeable, and only one of them is an `Error`. A control tested
 *  against one refusal has a failure handler that throws on the other two, in
 *  a promise nobody is holding — which is a silent hang on the exact client
 *  the control exists for.
 * ======================================================================== */

/**
 * The manifest's own defaults, seeded into every mount.
 *
 * `dev/host.js` builds `parameters` from whatever is in its `inputs` option, so
 * a property with a `default-value` in the manifest arrives here as
 * `undefined` and reading `.raw` off it throws — while the same read works
 * perfectly on a form, because the platform applies the default.
 *
 * The fix belongs here rather than as a `?.` in production code: the control is
 * entitled to assume a declared property exists, and writing around a gap in
 * the rig would hide the day the platform stops supplying one.
 */
const MANIFEST_DEFAULTS = {
    coordinatePrecision: 6,
    accuracyThreshold: 100,
    showMap: false,
    tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    recordId: null,
    recordEntity: null,
    latitude: null,
    longitude: null,
};

const SEATTLE = { latitude: 47.6062, longitude: -122.3321, accuracy: 20 };

const PHOTO = {
    fileName: 'capture.png',
    mimeType: 'image/png',
    // KB, not bytes. See `pickFile` in dev/host.js.
    fileSize: 1,
    fileContent: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
};

const ON_RECORD = { entityId: '0f8fad5b-d9cb-469f-a165-70867728950e', entityTypeName: 'account' };

/** Mount with the manifest defaults already applied. */
function geo(options = {}) {
    return mount({ value: '', ...options });
}

const press = (handle, selector) => handle.find(selector).click();
const text = (handle, selector) => (handle.find(selector) || {}).textContent;

/*
 * Every device call is a promise, so the assertions have to be too. One
 * `await` per press settles the whole chain: the control awaits at most three
 * platform calls in a row, and `flush()` below drains the microtask queue
 * rather than guessing at a count.
 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function main() {
    /* ------------------------------------------------- the four hosts */

    /*
     * A model-driven form in a browser. The API is ABSENT, not failing — the
     * control has to say something different from "that did not work", because
     * there is nothing the user can do about it here and something they can do
     * about it on their phone.
     */
    {
        const web = geo({ position: 'absent' });
        press(web, '.GeoStamp-button');
        await flush();

        check(
            'no geolocation on this host: says so, rather than reporting a failure',
            text(web, '.GeoStamp-message') === marked('GeoStamp_NoGeolocation'),
            text(web, '.GeoStamp-message'),
        );

        check(
            'and writes nothing',
            web.outputs().value === '' && web.outputs().stampCount === 0,
            JSON.stringify(web.outputs()),
        );
    }

    /*
     * Power Pages removes `context.device` outright rather than one method, so
     * the guard has to survive the bag being missing as well as the member.
     */
    {
        const pages = geo({ device: false });
        press(pages, '.GeoStamp-button');
        await flush();

        check(
            'a host with no context.device at all reaches the same sentence',
            text(pages, '.GeoStamp-message') === marked('GeoStamp_NoGeolocation'),
            text(pages, '.GeoStamp-message'),
        );
    }

    /* ------------------------------------------ the platform's own value */

    /*
     * The round trip, and the bug it caught.
     *
     * `render()` runs off the end of the press, before the platform has been
     * told anything. A control comparing the incoming value against its own
     * reads "the platform disagrees" and re-adopts the empty column it was
     * mounted on — discarding the reading that caused the call, so the button
     * appears to do nothing at all.
     */
    {
        const trip = geo({ position: SEATTLE });

        press(trip, '.GeoStamp-button');
        await flush();

        check(
            'a fresh reading survives the render that follows the press',
            trip.outputs().value === '47.606200, -122.332100',
            trip.outputs().value,
        );

        // Now the platform answers, echoing back what it was given.
        trip.update({ value: '47.606200, -122.332100' });

        check(
            "and the platform's echo changes nothing",
            trip.outputs().value === '47.606200, -122.332100'
                && trip.outputs().latitude === 47.6062,
            JSON.stringify(trip.outputs()),
        );
    }

    /*
     * A real external change — a save, a rollback, another control on the same
     * column — is a different thing and has to win.
     */
    {
        const replaced = geo({ position: SEATTLE });

        press(replaced, '.GeoStamp-button');
        await flush();

        replaced.update({ value: '51.507400, -0.127800' });

        check(
            "a value that genuinely came from elsewhere replaces the control's",
            text(replaced, '.GeoStamp-coordinates') === '51.507400, -0.127800',
            text(replaced, '.GeoStamp-coordinates'),
        );

        check(
            'and takes the accuracy with it, rather than captioning the new one',
            replaced.find('.GeoStamp-accuracy').hidden === true
                && !('latitude' in replaced.outputs()),
            JSON.stringify(replaced.outputs()),
        );
    }

    /* ----------------------------------------- the three refusals, apart */

    {
        const denied = geo({ position: 'denied' });
        press(denied, '.GeoStamp-button');
        await flush();

        check(
            'permission denied is told apart from every other failure',
            text(denied, '.GeoStamp-message') === marked('GeoStamp_Denied'),
            text(denied, '.GeoStamp-message'),
        );
    }

    {
        /*
         * The one that matters most, and the reason the stub rejects with
         * `null` at all. A handler written as `error.message` throws HERE —
         * inside the catch — so the failure handler fails, no message is shown,
         * and the button stays on "Finding you…" forever.
         */
        const unavailable = geo({ position: 'unavailable' });
        press(unavailable, '.GeoStamp-button');
        await flush();

        check(
            'a rejection of null is survived, and explained',
            text(unavailable, '.GeoStamp-message') === marked('GeoStamp_Unavailable'),
            text(unavailable, '.GeoStamp-message'),
        );

        check(
            'and the button comes back rather than staying on "Finding you…"',
            unavailable.find('.GeoStamp-button').textContent === marked('GeoStamp_Stamp'),
            unavailable.find('.GeoStamp-button').textContent,
        );
    }

    /* ------------------------------------------------------ a real fix */

    {
        const fixed = geo({ position: SEATTLE });
        press(fixed, '.GeoStamp-button');
        await flush();

        check(
            'a fix is written to the bound column at the configured precision',
            fixed.outputs().value === '47.606200, -122.332100',
            fixed.outputs().value,
        );

        check(
            'and to the optional decimal columns as numbers, not strings',
            fixed.outputs().latitude === 47.6062 && fixed.outputs().longitude === -122.3321,
            JSON.stringify([fixed.outputs().latitude, fixed.outputs().longitude]),
        );

        check(
            'the accuracy is reported beside the reading',
            text(fixed, '.GeoStamp-accuracy') === marked('GeoStamp_Accuracy'),
            text(fixed, '.GeoStamp-accuracy'),
        );

        check(
            'and is not flagged as approximate under the threshold',
            !fixed.find('.GeoStamp-accuracy').classList.contains('GeoStamp-accuracy--vague'),
        );
    }

    {
        const coarse = geo({ inputs: { coordinatePrecision: 2 }, position: SEATTLE });
        press(coarse, '.GeoStamp-button');
        await flush();

        check(
            'the precision property is honoured',
            coarse.outputs().value === '47.61, -122.33',
            coarse.outputs().value,
        );
    }

    /*
     * A vague fix is RECORDED and labelled, not discarded. Refusing it leaves
     * a user inside a warehouse with an empty column and no explanation.
     */
    {
        const vague = geo({ position: { latitude: 47.6062, longitude: -122.3321, accuracy: 1200 } });
        press(vague, '.GeoStamp-button');
        await flush();

        check(
            'a fix worse than the threshold is still recorded',
            vague.outputs().value === '47.606200, -122.332100',
            vague.outputs().value,
        );

        check(
            'and is labelled approximate rather than dropped',
            text(vague, '.GeoStamp-accuracy') === marked('GeoStamp_Vague')
                && vague.find('.GeoStamp-accuracy').classList.contains('GeoStamp-accuracy--vague'),
            text(vague, '.GeoStamp-accuracy'),
        );
    }

    /* ------------------------------------ the unmapped optional columns */

    /*
     * `latitude` and `longitude` are optional bound properties. Before any fix
     * there is nothing to send, and sending 0 would be a coordinate in the Gulf
     * of Guinea rather than an absence.
     */
    {
        const untouched = geo();

        check(
            'before any fix, the optional columns are omitted rather than zeroed',
            !('latitude' in untouched.outputs()) && !('longitude' in untouched.outputs()),
            JSON.stringify(untouched.outputs()),
        );
    }

    /* --------------------------------------------- the repeat that is silent */

    /*
     * Two stamps from the same doorway produce identical coordinates, so the
     * second is a write with no change and `OnChange` never fires. The counter
     * is the only output that differs, and it is why the property exists.
     */
    {
        const twice = geo({ position: SEATTLE });

        press(twice, '.GeoStamp-button');
        await flush();
        const first = twice.outputs();

        press(twice, '.GeoStamp-button');
        await flush();
        const second = twice.outputs();

        check(
            'two identical fixes produce identical coordinates',
            first.value === second.value,
            `${first.value} / ${second.value}`,
        );

        check(
            'so the counter is what makes the repeat observable',
            first.stampCount === 1 && second.stampCount === 2,
            `${first.stampCount} → ${second.stampCount}`,
        );
    }

    /* ------------------------------------------------------------ the map */

    /*
     * The premium half. With `showMap` off — which is the shipped default,
     * because a TwoOptions input cannot be defaulted to on — NO request is made
     * to the tile host at all. Asserting the absence is the point: it is what
     * lets someone install this without paying for a capability they did not
     * ask for.
     */
    {
        const noMap = geo({ position: SEATTLE });
        press(noMap, '.GeoStamp-button');
        await flush();

        const image = noMap.find('.GeoStamp-map');

        check(
            'with the map off, no tile is requested and none is shown',
            image.hidden === true && image.getAttribute('src') === null,
            `hidden=${image.hidden} src=${image.getAttribute('src')}`,
        );

        check(
            'and the attribution is not shown either',
            noMap.find('.GeoStamp-attribution').hidden === true,
        );
    }

    {
        const withMap = geo({ inputs: { showMap: true }, position: SEATTLE });
        press(withMap, '.GeoStamp-button');
        await flush();

        const image = withMap.find('.GeoStamp-map');

        check(
            'with the map on, the tile url is built from the coordinates',
            image.hidden === false && image.getAttribute('src') === 'https://tile.openstreetmap.org/15/5249/11443.png',
            image.getAttribute('src'),
        );

        check(
            "and OpenStreetMap's attribution is shown, because its tile policy requires it",
            withMap.find('.GeoStamp-attribution').hidden === false,
        );
    }

    /*
     * `tileUrlTemplate` is free text from a properties pane, so it reaches an
     * `img` src. Only https is built.
     */
    {
        const hostile = geo({
            inputs: { showMap: true, tileUrlTemplate: 'javascript:alert(1)' },
            position: SEATTLE,
        });

        press(hostile, '.GeoStamp-button');
        await flush();

        check(
            'a tile template that is not https builds no url at all',
            hostile.find('.GeoStamp-map').getAttribute('src') === null,
            hostile.find('.GeoStamp-map').getAttribute('src'),
        );
    }

    /* ----------------------------------------------------------- the photo */

    /*
     * Canvas has no `context.webAPI`, and no maker setting brings it back — so
     * the button is hidden rather than disabled. A disabled button promises a
     * condition the user could reach.
     */
    {
        const canvas = geo({ host: 'canvas', webAPI: false, position: SEATTLE });

        check(
            'where the host cannot save a photo at all, the button is hidden not disabled',
            canvas.find('.GeoStamp-button--secondary').hidden === true,
        );

        check(
            'and location still works there — canvas has geolocation',
            (() => {
                press(canvas, '.GeoStamp-button');

                return true;
            })(),
        );

        await flush();

        check(
            'canvas records a location with no WebAPI present',
            canvas.outputs().value === '47.606200, -122.332100',
            canvas.outputs().value,
        );
    }

    /*
     * The host CAN save, but nobody told the control which record it is on.
     * Neither `contextInfo` nor the bound inputs are configured — so it says so
     * rather than guessing, and the coordinate half is unaffected.
     */
    {
        const orphan = geo({ position: SEATTLE });
        press(orphan, '.GeoStamp-button--secondary');
        await flush();

        check(
            'with no record identity, the photo declines with a reason',
            text(orphan, '.GeoStamp-message') === marked('GeoStamp_NoRecord'),
            text(orphan, '.GeoStamp-message'),
        );

        press(orphan, '.GeoStamp-button');
        await flush();

        check(
            'and the coordinate half still works without it',
            orphan.outputs().value === '47.606200, -122.332100',
            orphan.outputs().value,
        );
    }

    /*
     * The documented fallback: the FAQ's `entityId` / `entityName` inputs,
     * bound by the maker on the form. This is the path that works when
     * `contextInfo` does not exist.
     */
    {
        const bound = geo({
            inputs: { recordId: ON_RECORD.entityId, recordEntity: 'account' },
            captureImage: PHOTO,
        });

        press(bound, '.GeoStamp-button--secondary');
        await flush();

        check(
            'the documented recordId/recordEntity inputs are enough to attach a photo',
            text(bound, '.GeoStamp-message') === marked('GeoStamp_PhotoSaved'),
            text(bound, '.GeoStamp-message'),
        );

        check(
            'and the note id is read off the EntityReference rather than stringified',
            bound.outputs().lastNoteId === '11111111-2222-3333-4444-555555555555',
            bound.outputs().lastNoteId,
        );

        const create = bound.calls().find((call) => call.startsWith('webAPI.createRecord'));

        check(
            'the note is an annotation, and the entity set name came from metadata',
            create === 'webAPI.createRecord("annotation")'
                && bound.calls().some((call) => call === 'getEntityMetadata("account")'),
            bound.calls().join(' '),
        );
    }

    /* A maker can type anything into a text property, and it reaches a URL. */
    {
        const injected = geo({
            inputs: { recordId: ON_RECORD.entityId, recordEntity: 'accounts(1)/x' },
            captureImage: PHOTO,
        });

        press(injected, '.GeoStamp-button--secondary');
        await flush();

        check(
            'an entity name that cannot be a logical name never reaches the query',
            text(injected, '.GeoStamp-message') === marked('GeoStamp_NoRecord')
                && !injected.calls().some((call) => call.startsWith('webAPI.createRecord')),
            injected.calls().join(' '),
        );
    }

    /* And the undocumented one, which is preferred where the host has it. */
    {
        const onForm = geo({ contextInfo: ON_RECORD, captureImage: PHOTO });

        press(onForm, '.GeoStamp-button--secondary');
        await flush();

        check(
            'mode.contextInfo is used where the host publishes it, with nothing bound',
            text(onForm, '.GeoStamp-message') === marked('GeoStamp_PhotoSaved'),
            text(onForm, '.GeoStamp-message'),
        );
    }

    /* A camera that refuses is an ordinary outcome, not an error state. */
    {
        const noCamera = geo({ contextInfo: ON_RECORD });

        press(noCamera, '.GeoStamp-button--secondary');
        await flush();

        check(
            'a camera that rejects is reported, and nothing is written',
            text(noCamera, '.GeoStamp-message') === marked('GeoStamp_PhotoFailed')
                && noCamera.outputs().lastNoteId === '',
            text(noCamera, '.GeoStamp-message'),
        );
    }

    /*
     * A webAPI rejection is a plain object carrying `message`, not an `Error`.
     * The reflex `error instanceof Error ? … : String(error)` renders the
     * literal text "[object Object]" here.
     */
    {
        const refused = geo({ contextInfo: ON_RECORD, captureImage: PHOTO, createRecord: null });

        press(refused, '.GeoStamp-button--secondary');
        await flush();

        check(
            'a webAPI rejection is read as an object, never stringified',
            text(refused, '.GeoStamp-message') === marked('GeoStamp_PhotoFailed')
                && !String(text(refused, '.GeoStamp-message')).includes('[object Object]'),
            text(refused, '.GeoStamp-message'),
        );
    }

    /* --------------------------------------- the states a form puts it in */

    {
        const secured = geo({ security: 'no-access', position: SEATTLE });

        check(
            'a column the user cannot read hides the readout and says why',
            secured.find('.GeoStamp-readout').hidden === true
                && text(secured, '.GeoStamp-message') === marked('GeoStamp_NoAccess'),
            text(secured, '.GeoStamp-message'),
        );

        check(
            'and offers no button to write with',
            secured.find('.GeoStamp-button').hidden === true,
        );
    }

    {
        const readOnly = geo({ security: 'read-only' });

        check(
            'a read-only column shows the value and disables the button',
            readOnly.find('.GeoStamp-readout').hidden === false
                && readOnly.find('.GeoStamp-button').disabled === true,
        );
    }

    {
        const disabled = geo({ disabled: true });

        check(
            "the form's own read-only state disables it too",
            disabled.find('.GeoStamp-button').disabled === true,
        );
    }

    {
        const empty = geo();

        check(
            'an empty column reads as "no location recorded", not as a blank',
            text(empty, '.GeoStamp-coordinates') === marked('GeoStamp_Empty'),
            text(empty, '.GeoStamp-coordinates'),
        );
    }

    {
        const existing = geo({ value: '51.507400, -0.127800' });

        check(
            'a value already in the column is shown without asking the device',
            text(existing, '.GeoStamp-coordinates') === '51.507400, -0.127800'
                && !existing.calls().some((call) => call === 'getCurrentPosition'),
            text(existing, '.GeoStamp-coordinates'),
        );
    }

    {
        const hidden = geo({ visible: false });

        check(
            'mode.isVisible false hides the whole control',
            hidden.container.classList.contains('GeoStamp--hidden'),
        );
    }

    /*
     * The live region has to start empty. `role="status"` announces what lands
     * in it, so a control that renders its message on the first pass reads it
     * out to somebody who has pressed nothing.
     */
    {
        const quiet = geo();

        check(
            'the live region is silent until something happens',
            text(quiet, '.GeoStamp-message') === '',
            JSON.stringify(text(quiet, '.GeoStamp-message')),
        );
    }

    /* ------------------------------------------ teardown, mid-flight */

    /*
     * A capture is a native camera UI and can sit open for a minute, so the
     * form may well be gone before it resolves. Two things are asserted: the
     * confirmation's timer is handed back, and nothing throws when the promise
     * lands against a control that no longer exists.
     */
    {
        disposeAll();

        const before = time.pending();
        const inFlight = geo({ contextInfo: ON_RECORD, captureImage: PHOTO });

        press(inFlight, '.GeoStamp-button--secondary');
        inFlight.destroy();

        await flush();

        check(
            'destroy() during a capture releases every timer',
            time.pending() === before,
            `${before} → ${time.pending()}`,
        );

        check(
            'and the resolved capture writes nothing into a destroyed control',
            inFlight.outputs().lastNoteId === '',
            inFlight.outputs().lastNoteId,
        );
    }

    /*
     * The confirmation takes a real timer, so this is the control that makes
     * the generic teardown assertion below mean something.
     */
    {
        disposeAll();

        const before = time.pending();
        const talking = geo();

        press(talking, '.GeoStamp-button');
        await flush();

        check(
            'a message on screen is holding a timer',
            time.pending() === before + 1,
            `${before} → ${time.pending()}`,
        );

        talking.destroy();

        check(
            'and destroy() gives it back',
            time.pending() === before,
            `${before} → ${time.pending()}`,
        );
    }

    disposeAll();
    generic();
    report();
}

/* ---------------------------------------------------- what destroy owes */

function generic() {

/* ---------------------------------------------------- what destroy owes */

/*
 * **Keep this when the worked example above goes.** It is written against no
 * particular control and needs no knowledge of what yours takes.
 *
 * `destroy` is the lifecycle method with nothing visible riding on it, so it is
 * the one that quietly does nothing. A control that takes an interval, a
 * `requestAnimationFrame` loop, or a listener on `document` or `window` owes
 * each of them back — and none of the three shows up on a form. The interval
 * keeps firing against a container the platform has already thrown away; the
 * document listener keeps the whole control reachable, so nothing about it is
 * ever collected. On a form somebody leaves open all afternoon, or a subgrid
 * that re-renders its rows, they accumulate.
 *
 * Counting before and after is the whole trick. The scaffolded control takes
 * neither, so both numbers are zero and this passes trivially — which is the
 * point: it starts passing for a real reason the moment somebody adds a timer,
 * and fails the moment they forget the other half.
 */
disposeAll();

const timersBefore = time.pending();
const listenersBefore = Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);

const disposable = mount({});

disposable.destroy();

check(
    'destroy() releases every timer the control took',
    time.pending() === timersBefore,
    `${timersBefore} → ${time.pending()}`,
);

check(
    'and every document-level listener',
    Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0) === listenersBefore,
    `${listenersBefore} → ${Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0)}`,
);

/*
 * The other half, and the leak this shape is famous for. `updateView` runs on
 * every change to any bound value, so a `setInterval` reached from the render
 * path adds a timer per render rather than replacing one.
 */
const rerendered = mount({});
const afterFirst = time.pending();

rerendered.update({});
rerendered.update({});
rerendered.update({});

check(
    'and re-rendering does not add another one',
    time.pending() === afterFirst,
    `${afterFirst} → ${time.pending()}`,
);

disposeAll();

}

void main();

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real form still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
