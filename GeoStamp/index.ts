import { IInputs, IOutputs } from './generated/ManifestTypes';
import {
    clampPrecision,
    describeError,
    format,
    isGuid,
    isLogicalName,
    readGuid,
    tileUrl,
} from './geo';

/**
 * How long a confirmation stays on screen.
 *
 * Here rather than in `geo.ts` because it is a decision about this control's
 * behaviour, not a pure function — and because `pcf-scripts` allows this file
 * exactly one export, which is the class.
 */
const MESSAGE_MS = 6000;

/**
 * Stamps the device's location — and optionally a photo — onto a record.
 *
 * ---
 *
 * **This control is four controls, because it runs on four hosts that each
 * withhold something different.** That is the whole design, and every
 * `required="false"` in the manifest is part of it:
 *
 * | Host | Location | Photo | Map |
 * | --- | --- | --- | --- |
 * | model-driven, mobile | yes | yes | yes |
 * | model-driven, web | **no** | yes | yes |
 * | canvas | yes | **no** (no WebAPI) | yes |
 * | Power Pages | **no** | **no** | yes |
 *
 * The one people get wrong is the second row. `getCurrentPosition` is
 * documented for canvas apps and the model-driven *mobile* client — a
 * model-driven form in a browser has no geolocation at all, which is precisely
 * the host every one of these controls is developed on. It is not an error
 * state and it is not a permission problem; the API is simply absent, and the
 * control says so rather than showing a failure.
 *
 * Nothing here is a fallback to `navigator.geolocation`. That would work in the
 * browser hosts and change what the control means: the platform's call is the
 * one the user's mobile client has already asked permission for, and quietly
 * substituting the browser's would prompt a second time, from a component, for
 * a permission the app never declared.
 */
export class GeoStamp implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private container!: HTMLDivElement;
    private readout!: HTMLDivElement;
    private coordinates!: HTMLParagraphElement;
    private accuracy!: HTMLParagraphElement;
    private map!: HTMLImageElement;
    private attribution!: HTMLParagraphElement;
    private stampButton!: HTMLButtonElement;
    private photoButton!: HTMLButtonElement;
    private message!: HTMLParagraphElement;

    private notifyOutputChanged!: () => void;

    /** The stamp, as it will travel back to the bound column. */
    private value = '';

    /**
     * The last value the PLATFORM sent, which is not the same as `value`.
     *
     * Between `notifyOutputChanged()` and the platform's answering
     * `updateView`, the control holds a value the platform has not got yet —
     * and `render()` runs in that window, off the end of the press. Comparing
     * the incoming value against `this.value` therefore reads "the platform
     * disagrees with me" and adopts the STALE one, discarding the reading that
     * caused the call. The control writes a coordinate, immediately overwrites
     * it with the empty column it was mounted on, and the button appears to do
     * nothing.
     *
     * Comparing against what the platform last *said* instead is what tells a
     * real external change — a save, a rollback, another control on the same
     * column — apart from this control's own echo.
     */
    private received: string | undefined;
    /**
     * Held separately from `value`, and only set when there is a number to
     * send. `undefined` here means "this control has not produced one", which
     * is what keeps `getOutputs` from writing over a column it never filled.
     */
    private latitude: number | undefined;
    private longitude: number | undefined;

    /**
     * Why a counter exists at all.
     *
     * `OnChange` fires when an output *changes*, not when the control writes
     * one. Two stamps taken from the same doorway produce the same coordinates
     * to six places, so the second one is a write with no change and a Power Fx
     * handler never runs — the user pressed the button and nothing happened,
     * for a reason that is invisible from the maker's side. The counter is the
     * output that is different every time.
     */
    private stampCount = 0;
    private lastNoteId = '';

    /** The last accuracy reading, in metres, or `undefined` before any fix. */
    private accuracyMetres: number | undefined;

    /** A press in flight. Guards against a second one, and drives the label. */
    private busy = false;

    /**
     * Set in `destroy()`. Every `await` below crosses a point where the
     * platform may have torn the control down — a capture is a native camera UI
     * and can take a minute — and touching the DOM after that throws inside a
     * promise nobody is holding.
     */
    private disposed = false;

    /** The transient confirmation's timer, and the one thing destroy() owes. */
    private messageTimer: number | undefined;

    private context!: ComponentFramework.Context<IInputs>;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary,
        container: HTMLDivElement,
    ): void {
        this.container = container;
        this.context = context;
        this.notifyOutputChanged = notifyOutputChanged;

        this.coordinates = document.createElement('p');
        this.coordinates.className = 'GeoStamp-coordinates';

        this.accuracy = document.createElement('p');
        this.accuracy.className = 'GeoStamp-accuracy';

        this.map = document.createElement('img');
        this.map.className = 'GeoStamp-map';
        this.map.hidden = true;
        // Decorative only where the coordinates are already read out beside it,
        // but it is the only thing that conveys *where* to a sighted user, so
        // it gets a real name rather than an empty alt.
        this.map.alt = '';
        this.map.loading = 'lazy';

        this.attribution = document.createElement('p');
        this.attribution.className = 'GeoStamp-attribution';
        this.attribution.hidden = true;

        this.readout = document.createElement('div');
        this.readout.className = 'GeoStamp-readout';
        this.readout.append(this.coordinates, this.accuracy, this.map, this.attribution);

        this.stampButton = document.createElement('button');
        this.stampButton.className = 'GeoStamp-button';
        this.stampButton.type = 'button';
        this.stampButton.addEventListener('click', this.onStamp);

        this.photoButton = document.createElement('button');
        this.photoButton.className = 'GeoStamp-button GeoStamp-button--secondary';
        this.photoButton.type = 'button';
        this.photoButton.addEventListener('click', this.onPhoto);

        const actions = document.createElement('div');
        actions.className = 'GeoStamp-actions';
        actions.append(this.stampButton, this.photoButton);

        /*
         * A live region, and it has to start silent.
         *
         * `role="status"` announces what lands in it *after* it is in the
         * accessibility tree, so it is created empty and filled later. Creating
         * it with text and hiding it announces the text on the first render, to
         * a user who has not pressed anything.
         */
        this.message = document.createElement('p');
        this.message.className = 'GeoStamp-message';
        this.message.setAttribute('role', 'status');
        this.message.setAttribute('aria-live', 'polite');

        this.container.classList.add('GeoStamp');
        this.container.append(this.readout, actions, this.message);

        this.render(context);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;
        this.render(context);
    }

    /**
     * Only the outputs this control actually produced.
     *
     * `latitude` and `longitude` are optional bound properties, so a maker may
     * have mapped neither, one, or both — and an unmapped one is
     * indistinguishable from a mapped-but-empty one from in here. Writing
     * `undefined` into them would be harmless; writing `0` would be a wrong
     * coordinate in the Gulf of Guinea, which is what a `?? 0` reflex produces.
     * So the keys are only present once there is a reading to put in them.
     */
    public getOutputs(): IOutputs {
        const outputs: IOutputs = {
            value: this.value,
            stampCount: this.stampCount,
            lastNoteId: this.lastNoteId,
        };

        if (this.latitude !== undefined && this.longitude !== undefined) {
            outputs.latitude = this.latitude;
            outputs.longitude = this.longitude;
        }

        return outputs;
    }

    public destroy(): void {
        this.disposed = true;
        this.stampButton.removeEventListener('click', this.onStamp);
        this.photoButton.removeEventListener('click', this.onPhoto);
        this.clearMessageTimer();
    }

    /* --------------------------------------------------------- rendering */

    private render(context: ComponentFramework.Context<IInputs>): void {
        const parameter = context.parameters.value;

        this.applyTheme(context);

        this.container.classList.toggle('GeoStamp--hidden', !context.mode.isVisible);

        if (!context.mode.isVisible) {
            return;
        }

        // Field-level security is not the form's read-only state. A user denied
        // read access gets `raw === null`, indistinguishable from "empty".
        const security = parameter.security;

        if (security !== undefined && !security.readable) {
            this.readout.hidden = true;
            this.stampButton.hidden = true;
            this.photoButton.hidden = true;
            this.message.textContent = context.resources.getString('GeoStamp_NoAccess');

            return;
        }

        this.readout.hidden = false;
        this.stampButton.hidden = false;

        const incoming = parameter.raw ?? '';

        if (incoming !== this.received) {
            this.received = incoming;

            if (incoming !== this.value) {
                /*
                 * The platform genuinely has something else — not this
                 * control's own write coming back. Adopt it, and drop the
                 * readings with it: the accuracy and the decimals described the
                 * value that just got replaced, and leaving them would caption
                 * one location with another's margin of error.
                 */
                this.value = incoming;
                this.latitude = undefined;
                this.longitude = undefined;
                this.accuracyMetres = undefined;
            }
        }

        this.coordinates.textContent =
            this.value === '' ? context.resources.getString('GeoStamp_Empty') : this.value;
        this.coordinates.classList.toggle('GeoStamp-coordinates--empty', this.value === '');

        this.renderAccuracy(context);
        this.renderMap(context);

        const locked =
            context.mode.isControlDisabled || (security !== undefined && !security.editable);

        this.stampButton.disabled = locked || this.busy;
        this.stampButton.textContent = context.resources.getString(
            this.busy ? 'GeoStamp_Locating' : 'GeoStamp_Stamp',
        );

        /*
         * The photo button is hidden, not disabled, where the host cannot save
         * a photo at all.
         *
         * A disabled button is a promise that it would work under some
         * condition the user can reach. In canvas there is no such condition —
         * `context.webAPI` does not exist there and no maker setting brings it
         * back — so offering the affordance would be a lie that costs a support
         * call. Where the host *could* save but is not configured to, the
         * button stays and says why on press, which is a different case.
         */
        this.photoButton.hidden = !this.hasPhotoRoute(context);
        this.photoButton.disabled = locked || this.busy;
        this.photoButton.textContent = context.resources.getString('GeoStamp_Photo');

        this.container.dir = context.userSettings.isRTL ? 'rtl' : 'ltr';
        this.container.classList.toggle('GeoStamp--disabled', locked);
        this.container.classList.toggle('GeoStamp--invalid', parameter.error);

        if (parameter.error) {
            this.message.textContent = parameter.errorMessage;
        }
    }

    private renderAccuracy(context: ComponentFramework.Context<IInputs>): void {
        if (this.accuracyMetres === undefined) {
            this.accuracy.hidden = true;
            this.accuracy.textContent = '';

            return;
        }

        const threshold = context.parameters.accuracyThreshold.raw ?? 100;
        const vague = this.accuracyMetres > threshold;

        this.accuracy.hidden = false;
        this.accuracy.classList.toggle('GeoStamp-accuracy--vague', vague);

        /*
         * A vague fix is stamped and labelled, never discarded.
         *
         * 1200 metres from inside a warehouse is a real answer and often the
         * only one the device can give. Refusing it leaves the user with an
         * empty column and no explanation; accepting it silently puts a
         * kilometre of error into a record that reads as exact. So it goes in,
         * and the number that says how wrong it might be goes in beside it.
         */
        this.accuracy.textContent = format(
            context.resources.getString(vague ? 'GeoStamp_Vague' : 'GeoStamp_Accuracy'),
            String(Math.round(this.accuracyMetres)),
        );
    }

    /**
     * The premium half, and the only part of this control that leaves the
     * tenant.
     *
     * Off unless a maker turned it on: `showMap` is a TwoOptions input and a
     * TwoOptions input cannot be defaulted to on, which is normally an
     * irritation and is exactly right here. With it off, no request is made and
     * `external-service-usage` costs the installer a licence for a capability
     * nobody is using — so `docs/limitations.md` says to leave it off unless
     * the map is wanted.
     */
    private renderMap(context: ComponentFramework.Context<IInputs>): void {
        const wanted = context.parameters.showMap.raw === true;
        const lat = this.latitude;
        const lon = this.longitude;

        if (!wanted || lat === undefined || lon === undefined) {
            this.map.hidden = true;
            this.attribution.hidden = true;
            // Cleared, not just hidden. A hidden <img> with a src still holds
            // the request that was already made, and leaving it means the tile
            // for the *previous* location flashes in when the map is re-enabled.
            this.map.removeAttribute('src');

            return;
        }

        const template = context.parameters.tileUrlTemplate.raw ?? '';
        const url = tileUrl(template, lat, lon);

        if (url === '') {
            this.map.hidden = true;
            this.attribution.hidden = true;

            return;
        }

        this.map.hidden = false;
        this.map.src = url;
        this.map.alt = context.resources.getString('GeoStamp_MapAlt');
        this.attribution.hidden = false;
        this.attribution.textContent = context.resources.getString('GeoStamp_MapAttribution');
    }

    private applyTheme(context: ComponentFramework.Context<IInputs>): void {
        const isDarkTheme = context.fluentDesignLanguage?.isDarkTheme;

        if (isDarkTheme === undefined) {
            return;
        }

        this.container.classList.toggle('GeoStamp--dark', isDarkTheme);
    }

    /* ----------------------------------------------------------- stamping */

    private onStamp = (): void => {
        void this.stamp(this.context);
    };

    private async stamp(context: ComponentFramework.Context<IInputs>): Promise<void> {
        if (this.busy) {
            return;
        }

        /*
         * Feature-detected, even though the types say `context.device` is
         * always there and always carries this method.
         *
         * That is a claim about `@types/powerapps-component-framework`, not
         * about the host. `required="false"` means the platform is entitled to
         * leave the API out entirely, and on Power Pages it does — so the guard
         * has to be written *against* the type rather than with it.
         */
        if (typeof context.device?.getCurrentPosition !== 'function') {
            this.say(context.resources.getString('GeoStamp_NoGeolocation'));

            return;
        }

        this.busy = true;
        this.clearMessage();
        this.render(context);

        try {
            const position = await context.device.getCurrentPosition();

            if (this.disposed) {
                return;
            }

            this.applyPosition(context, position);
        } catch (error) {
            if (this.disposed) {
                return;
            }

            this.say(this.explainLocationFailure(context, error));
        } finally {
            this.busy = false;

            if (!this.disposed) {
                this.render(context);
            }
        }
    }

    private applyPosition(
        context: ComponentFramework.Context<IInputs>,
        position: ComponentFramework.DeviceApi.Position,
    ): void {
        const coords = position.coords;

        /*
         * `altitude`, `heading` and `speed` are declared non-optional on
         * `Position['coords']` and are routinely null on a device standing
         * still. Only the three read here are dependable, and `accuracy` is the
         * one the readout is about.
         */
        const precision = clampPrecision(context.parameters.coordinatePrecision.raw);

        this.latitude = coords.latitude;
        this.longitude = coords.longitude;
        this.accuracyMetres = typeof coords.accuracy === 'number' ? coords.accuracy : undefined;

        this.value = `${coords.latitude.toFixed(precision)}, ${coords.longitude.toFixed(precision)}`;

        /*
         * `position.timestamp` is deliberately not read.
         *
         * It is typed `Date` and documented, on the same reference page, as a
         * DOMTimeStamp — a number. The platform sends the number, so
         * `timestamp.toISOString()` compiles and throws, and there is no way to
         * tell from the types which one you have. A stamp that needs the time
         * should take it from the record's own modifiedon, which is a date the
         * platform agrees with itself about.
         */

        this.stampCount += 1;
        this.notifyOutputChanged();
    }

    /**
     * Which of the three refusals happened, in the user's language.
     *
     * They are not interchangeable, and the differences are the whole reason
     * this function exists rather than one catch-all sentence:
     *
     *   - **`null`** — documented, and the shape nothing survives by accident.
     *     An older mobile client, or a device with no geolocation hardware,
     *     passes `null` to the error callback and nothing else. Any handler
     *     that starts `error.message` throws here, so the *failure handler*
     *     fails and the control hangs.
     *   - **`{ code, message }`** — a plain object, not an `Error`. Note
     *     `code`, where a `webAPI` rejection uses `errorCode`: two platform
     *     APIs, two names for the same idea.
     *   - **`Error`** — a browser with no native bridge.
     *
     * The user is told something different in each case because they can act on
     * only one of them.
     */
    private explainLocationFailure(
        context: ComponentFramework.Context<IInputs>,
        error: unknown,
    ): string {
        if (error === null || error === undefined) {
            return context.resources.getString('GeoStamp_Unavailable');
        }

        // Documented: 1 is permission denied, 2 position unavailable, 3 timeout.
        const code = typeof error === 'object' ? (error as { code?: unknown }).code : undefined;

        if (code === 1) {
            return context.resources.getString('GeoStamp_Denied');
        }

        const detail = describeError(error);

        return detail === ''
            ? context.resources.getString('GeoStamp_Unavailable')
            : format(context.resources.getString('GeoStamp_Failed'), detail);
    }

    /* -------------------------------------------------------------- photo */

    /**
     * Whether this host could save a photo at all, before asking whether it is
     * configured to.
     *
     * Both halves are feature detection against the type system's promises:
     * `context.webAPI` is typed as always present and is absent in canvas;
     * `context.utils` is typed the same way and is gated behind `Utility`.
     */
    /**
     * Whether this host is one where a model-driven-only API means anything.
     *
     * **`typeof x.method === 'function'` is not that test.** Measured with a
     * host probe on a real canvas app, 2026-09-22: **fifteen of fifteen**
     * platform surfaces are published there — `webAPI.createRecord` and
     * `utils.getEntityMetadata` among them — and the ones safe to call throw
     * `Method not implemented.` from the call itself.
     *
     * What discriminates is **an answer rather than a method**. `getClientUrl`
     * refuses by throwing, and a thrown refusal is an answer once it is caught.
     * It is undocumented, which is why it is read defensively and why the `Xrm`
     * global is tried after it.
     */
    private modelDrivenHost(context: ComponentFramework.Context<IInputs>): boolean {
        const ask = <T>(call: () => T): T | undefined => {
            try {
                return call();
            } catch {
                return undefined;
            }
        };

        const page = (context as { page?: { getClientUrl?: unknown } }).page;
        const fromPage = typeof page?.getClientUrl === 'function'
            ? ask(() => (page.getClientUrl as () => unknown)())
            : undefined;
        const fromGlobal = ask(() => (globalThis as {
            Xrm?: { Utility?: { getGlobalContext?: () => { getClientUrl?: () => unknown } } };
        }).Xrm?.Utility?.getGlobalContext?.()?.getClientUrl?.());

        return [fromPage, fromGlobal].some((url) => typeof url === 'string' && url !== '');
    }

    /**
     * Whether a photo can be captured *and saved*.
     *
     * The three methods below all exist on canvas, so the photo button was
     * offered there — on a host where the note it would write cannot be
     * created. `docs/` has said since 0.1.0 that the photo half is model-driven
     * only; the code had no way to tell until `modelDrivenHost`.
     */
    private hasPhotoRoute(context: ComponentFramework.Context<IInputs>): boolean {
        return (
            typeof context.device?.captureImage === 'function'
            && typeof context.webAPI?.createRecord === 'function'
            && typeof context.utils?.getEntityMetadata === 'function'
            && this.modelDrivenHost(context)
        );
    }

    private onPhoto = (): void => {
        void this.capturePhoto(this.context);
    };

    private async capturePhoto(context: ComponentFramework.Context<IInputs>): Promise<void> {
        if (this.busy) {
            return;
        }

        if (!this.hasPhotoRoute(context)) {
            this.say(context.resources.getString('GeoStamp_NoPhotoHost'));

            return;
        }

        const target = this.resolveRecord(context);

        if (target === null) {
            this.say(context.resources.getString('GeoStamp_NoRecord'));

            return;
        }

        this.busy = true;
        this.clearMessage();
        this.render(context);

        try {
            /*
             * ONE `FileObject`, not an array.
             *
             * `pickFile` resolves with `FileObject[]` and this resolves with a
             * single object, so the `[0]` that was right on the picker reads
             * `undefined` here — and `undefined.fileContent` throws inside a
             * promise, some seconds after the camera closed, which is as far
             * from the mistake as a stack trace can get.
             */
            const photo = await context.device.captureImage();

            if (this.disposed) {
                return;
            }

            /*
             * `@odata.bind` needs the parent's entity SET name — the plural —
             * and the only thing that knows it is `getEntityMetadata`. That is
             * the whole reason this control declares `Utility`, and it is
             * model-driven only, which is one more reason the photo half cannot
             * exist in canvas.
             */
            const metadata = await context.utils.getEntityMetadata(target.entityTypeName);

            if (this.disposed) {
                return;
            }

            const entitySet = metadata.EntitySetName;

            if (typeof entitySet !== 'string' || entitySet === '') {
                this.say(context.resources.getString('GeoStamp_NoRecord'));

                return;
            }

            /*
             * `documentbody` is base64 with no `data:` prefix, which is exactly
             * what `FileObject.fileContent` already is — so it is passed
             * straight through. Prefixing it produces a Note that saves without
             * complaint and cannot be opened.
             */
            const note: Record<string, string> = {
                subject: this.value === '' ? context.resources.getString('GeoStamp_Name') : this.value,
                filename: photo.fileName,
                mimetype: photo.mimeType,
                documentbody: photo.fileContent,
            };

            note[`objectid_${target.entityTypeName}@odata.bind`] = `/${entitySet}(${target.entityId})`;

            const reference = await context.webAPI.createRecord('annotation', note);

            if (this.disposed) {
                return;
            }

            /*
             * `createRecord` resolves with an `EntityReference`, whose `id` is
             * an object carrying a `guid` — not a string. `String(reference.id)`
             * is the literal text "[object Object]", stored in an output
             * property and discovered by whoever tries to open the note.
             */
            this.lastNoteId = readGuid(reference.id);
            this.notifyOutputChanged();
            this.say(context.resources.getString('GeoStamp_PhotoSaved'));
        } catch (error) {
            if (this.disposed) {
                return;
            }

            const detail = describeError(error);

            this.say(
                detail === ''
                    ? context.resources.getString('GeoStamp_PhotoFailedUnknown')
                    : format(context.resources.getString('GeoStamp_PhotoFailed'), detail),
            );
        } finally {
            this.busy = false;

            if (!this.disposed) {
                this.render(context);
            }
        }
    }

    /**
     * Which record this control is sitting on — two answers, neither sufficient
     * alone.
     *
     * `context.mode.contextInfo` is what everybody writes and it is absent from
     * the type definitions altogether, so reaching it costs a cast. The
     * platform's *documented* answer is the opposite: components deliberately
     * are not given the record's identity, "because they need to be supported
     * on multiple surfaces where this information may not be available", and
     * the FAQ says to declare `recordId` / `recordEntity` inputs and have the
     * maker bind them on the form.
     *
     * So: prefer the undocumented one where the host has it, fall back to the
     * documented one, and where neither is configured, say so instead of
     * guessing. The coordinate half never touches this and works regardless.
     */
    private resolveRecord(
        context: ComponentFramework.Context<IInputs>,
    ): { entityId: string; entityTypeName: string } | null {
        const contextInfo = (
            context.mode as unknown as {
                contextInfo?: { entityId?: string; entityTypeName?: string };
            }
        ).contextInfo;

        const candidates: Array<[string | undefined, string | undefined]> = [
            [contextInfo?.entityId, contextInfo?.entityTypeName],
            [context.parameters.recordId.raw ?? undefined, context.parameters.recordEntity.raw ?? undefined],
        ];

        for (const [id, entity] of candidates) {
            /*
             * Both are validated before they reach a URL, and the entity name
             * is the one that matters: it is interpolated into a navigation
             * property AND into a path, and on the fallback path it is free
             * text a maker typed into a properties pane. A logical name is
             * `/^[a-z][a-z0-9_]*$/` and anything else cannot name a table, so
             * anything else is dropped here rather than sent.
             */
            if (id !== undefined && entity !== undefined && isGuid(id) && isLogicalName(entity)) {
                return { entityId: id, entityTypeName: entity };
            }
        }

        return null;
    }

    /* ------------------------------------------------------------ message */

    /**
     * Says something, and takes it back after a while.
     *
     * The timer is the reason `destroy()` has work to do: a control torn down
     * between the message and the clear leaves a callback holding a detached
     * element, and `dev/smoke.js` asserts the pending count is zero afterwards.
     */
    private say(text: string): void {
        this.clearMessageTimer();
        this.message.textContent = text;

        this.messageTimer = setTimeout(() => {
            this.messageTimer = undefined;

            if (!this.disposed) {
                this.message.textContent = '';
            }
        }, MESSAGE_MS) as unknown as number;
    }

    private clearMessage(): void {
        this.clearMessageTimer();
        this.message.textContent = '';
    }

    private clearMessageTimer(): void {
        if (this.messageTimer !== undefined) {
            clearTimeout(this.messageTimer);
            this.messageTimer = undefined;
        }
    }
}
