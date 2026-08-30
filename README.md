# Geo Stamp

Stamp the device's location, and optionally a photo, onto a record.

[![Build](https://github.com/pcfhub/pcf-geo-stamp/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-geo-stamp/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-geo-stamp/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-geo-stamp/actions/workflows/release.yml)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-geo-stamp), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.


## What it does

Records the device's location into a bound text column, and — on a
model-driven form — attaches a photo from the same interaction as a note on the
record. One button, on a form, for something the platform otherwise offers only
as a Power Fx function or a device API.

**The interesting part is what it does when it cannot.** `getCurrentPosition` is
offered to canvas apps and the model-driven *mobile* client, so a model-driven
form open in a browser has no geolocation at all — the API is absent rather than
refused. A device API can also fail three further ways that are not
interchangeable: a refusal carrying `{ code, message }`, a rejection with a bare
`null` on older mobile clients, and an ordinary `Error` in a browser with no
native bridge. A handler written for one of those throws on the others, inside a
promise nobody is holding, which reads as a button that does nothing. All four
are separate states here, and each says something the user can act on.

The other decision worth knowing: a low-confidence fix is **recorded and
labelled**, not discarded. A reading from inside a warehouse can be a kilometre
out; refusing it leaves somebody with an empty column and no way forward, and
accepting it silently puts a kilometre of error into a record that reads as
exact.


## Properties

**Bound.** `value` (`SingleLine.Text`, required) takes the formatted pair.
`latitude` and `longitude` (`Decimal`) are optional and independent — map
neither, one, or both. They are written only once there is a reading, rather
than defaulting to zero, because `0, 0` is a real place and would look like
data.

**Input.**

| Property | Type | Default |
| --- | --- | --- |
| `coordinatePrecision` | `Whole.None` | `6` — about 0.1 m; finer is noise |
| `accuracyThreshold` | `Whole.None` | `100` metres; a worse fix is recorded and labelled |
| `showMap` | `TwoOptions` | off — and it *cannot* default to on, which is the point |
| `tileUrlTemplate` | `SingleLine.Text` | OpenStreetMap; any `https` template with `{z}`, `{x}`, `{y}` |
| `recordId` / `recordEntity` | `SingleLine.Text` | empty — the platform's documented identity fallback |

**Output.** `stampCount` (`Whole.None`) and `lastNoteId` (`SingleLine.Text`).
The counter exists because `OnChange` fires on a change rather than on a write:
two recordings from the same doorway produce identical coordinates, so without
it the second press is silent and no handler runs.

**Permissions requested at install.** `Device.getCurrentPosition`,
`Device.captureImage`, `WebAPI` and `Utility` — **every one `required="false"`**.
That is the whole design rather than caution: `required="true"` does not make a
feature more available, it makes the component fail to load where the feature is
missing, and each of these is missing somewhere this control is meant to run.
Power Pages settles it on its own — it supports no `Device.*` API and forbids
`uses-feature` being `true` at all.

| Host | Location | Photo | Map |
| --- | --- | --- | --- |
| model-driven, mobile | yes | yes | yes |
| model-driven, web | **no** | yes | yes |
| canvas | yes | **no** — no `webAPI` | yes |
| Power Pages | **no** | **no** | yes |

**`external-service-usage` is enabled**, listing `tile.openstreetmap.org`,
which makes this a **premium** component: end users of any app containing it
need Power Apps licences. It buys one optional feature, the map thumbnail. The
mitigation is structural rather than a promise — `showMap` is a `TwoOptions`
input and a `TwoOptions` input cannot be defaulted to on, so the component as
shipped makes no external request. The licensing consequence still follows the
declaration rather than the configuration, and `docs/limitations.md` says so to
the person deciding whether to install it.


## On the hub

`demo.fidelity` is `limited`, and unusually it is settled three times over —
any one of the device APIs, the `webAPI` write, or the external tile would be
enough on its own. This is the first control in the catalogue where an external
service is one of the reasons.

What the demo does show is the state the control spends most of its life in: a
column that already holds a reading. The readout, the decimal-places property,
the approximate-accuracy label and the theming are all real there. Three presets
cover a recorded location, the same one at two decimal places, and the empty
state. What is absent is the press itself — the sandbox has no `context.device`,
so **Record location** shows the control's own "not available on this client"
message, which is exactly what a model-driven form in a browser shows too.

**Add photo** is not rendered in the demo at all, for the same reason it is not
rendered in a canvas app: without `context.webAPI` there is no condition under
which it could work, and a disabled button would promise one.


## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-geo-stamp/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
npm run check      # what CI runs first: placeholders, pcfhub.json, control shape
npm run smoke      # assertions against the built bundle — see dev/
npm run harness    # serves dev/harness.html and opens it
```

`npm start` renders the control; `dev/` is for the states it cannot reach. Build
first, then `npm run smoke` for the assertions, or `npm run harness` for the
switches — field-level security, a failed business rule, a host that publishes
no theme or no column metadata, and for a dataset control, more than one page.
Both read the bundle `npm run build` wrote, and both are described in the header
of `dev/smoke.js`.

`npm run harness` serves the repository over `http://` rather than leaving you to
open the file: over `file://` a dataset fixture cannot be fetched and a module
script is refused, and both arrive as an empty control with a CORS error. It
takes `--port` and `--no-open`, and needs no dependency — `dev/serve.js` is
`node:http`. A React (virtual) control has no harness page, and the script says
so rather than serving a 404.

Run `npm run refreshTypes` after every manifest edit — until you do,
`context.parameters` is typed from the old manifest and `tsc` will accept code that
cannot work.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`. This is the only local step that compiles
in **production** mode, so a green `npm run build` is not evidence the shipping
bundle compiles — and the pack is incremental, so delete `obj/`, `out/`,
`Solution/obj/` and `Solution/bin/` first if you intend to quote a bundle size from
it.

## Release

1. Bump the version in **three** places, in one commit — they are checked
   against each other in CI:
   - `GeoStamp/ControlManifest.Input.xml` → `<control version="…">`
   - `Solution/src/Other/Solution.xml` → `<Version>`
   - `package.json` → `"version"`
2. Tag it: `git tag v1.2.3 && git push --tags`

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise. A sync imports a draft; a person publishes it.

## Repository layout

| Path | What it is |
| --- | --- |
| `GeoStamp/` | The control: manifest, entry point, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `dev/` | A stand-in host: `npm run smoke` asserts, `harness.html` shows |
| `SPEC.md` | What building this corrected, and what is verified versus read |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
