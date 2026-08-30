# Geo Stamp

Stamp the device's location, and optionally a photo, onto a record.

## What the build disagreed with

**A control's entry file may define exactly one export.** The helpers started
beside the class in `index.ts`, exported so `dev/smoke.js` and a future control
could reach them, and `pcf-scripts` refused the build outright:

```
[pcf-1023] [Error] Control source code defines more than one export.
```

Once per exported symbol, naming neither the file nor the symbol, at the
"Validating control" step before webpack runs — so nothing in the message points
at the cause. The two ways out are to stop exporting the helpers, which makes
them unreachable from anywhere, or to move them to a second module. They are in
`GeoStamp/geo.ts` for that reason and no other; only the manifest's entry point
is declared, and anything it imports is bundled with it.

Promoted to the skill — see `references/control-patterns.md`, "One export per
control file".

## Platform behaviour worth knowing

**`getCurrentPosition` is narrower than "device API" suggests.** Read from the
reference: it is available for *canvas apps and the model-driven mobile client*.
A model-driven form in a browser has no such method — which is the host this
control was developed on, and the one every developer will try first. It is
absence, not refusal: there is no permission to grant.

**A device rejection arrives in three shapes and only one is an `Error`.** Read
from the Client API reference for `getCurrentPosition`: the error callback
receives `{ code, message }`, and "if you're using an earlier version of the
model-driven apps mobile client or if geolocation capability isn't available on
your mobile device, **null** is passed to the error callback". So `catch (error)`
can receive `null`, and any handler beginning `error.message` throws inside its
own catch — the failure handler fails, and the control hangs on its own promise
with the button stuck on "Finding you…".

Note also `code`, where a `webAPI` rejection carries `errorCode`. Two platform
APIs, two names for the same idea, one error reader that has to know both.

**`Position.timestamp` is typed `Date` and is not one.** The type definitions
declare `timestamp: Date`; the reference page for `Position` says, of the same
member, "represented as DOMTimeStamp" — a number. So
`position.timestamp.toISOString()` compiles against the types and throws against
the host, and there is no way to tell from the types which you have. This
control does not read it at all, and says why at the point where it would have.

**`CaptureImageOptions` has five non-optional fields** — `allowEdit`, `height`,
`preferFrontCamera`, `quality`, `width`. So `captureImage({ quality: 80 })` does
not compile; it is all five or no argument.

**Power Pages is a third host, not a variant of the other two.** It supports no
`Device.*` API at all, no `Utility`, and documents that `uses-feature` **must not
be set to `true`** — which on its own settles the `required` attribute for every
feature here.

**A component is not told which record it is on, deliberately.** The FAQ:
components "do not provide this because they need to be supported on multiple
surfaces where this information may not be available", and the documented answer
is to declare input properties and have the maker bind them. `context.mode.contextInfo`
does carry it at runtime and is absent from
`@types/powerapps-component-framework` entirely, so using it costs a cast —
which `pcf-tag-list` already does, undocumented. This control does both,
preferring the undocumented one and falling back to the documented one.

All promoted to the skill — `references/control-patterns.md`, "Device APIs" and
"The current record's identity, from a field control".

## What the rig was missing, and now is not

Three fixes went back into `_template/dev/` rather than staying here:

- **`getCurrentPosition` did not exist in the field rig, and `captureImage` was a
  hardcoded rejection with no switch** — unlike `pickFile`, which had one. Both
  are now switchable, and the position switch models the three refusals
  *separately*, because a control that handles one handles none.
- **Absence was not modelled at all.** The rig had refusals but no way to make a
  method simply not be there, which is the only thing `required="false"` is
  about. There are now `position: 'absent'` and a `device: false` switch for the
  whole bag.
- **`img.src = url` was invisible to `getAttribute('src')`** in `dev/dom.js`, so
  an assertion reading "the control requested no tile" passed whether or not it
  had. It was reading a slot nothing ever wrote to and reporting the absence as
  proof. A short list of attributes now reflects.

The third is the one worth remembering: a rig that drops a write silently is
worse than a rig that lacks the feature, because the suite reports the gap as
covered.

## What the suite caught in this control

**The render that follows the press re-adopted the platform's stale value.**
`render()` runs off the end of a recording, before `notifyOutputChanged` has
reached the platform — so comparing the incoming value against the control's own
reads "the platform disagrees with me" and adopts the empty column it was
mounted on. The coordinate was written and immediately overwritten; the button
appeared to do nothing.

The fix is to compare against what the platform *last said* rather than against
what the control holds, which is also what distinguishes this control's own echo
from a genuine external change — a save, a rollback, another control on the same
column. Two assertions cover the pair.

## Demo

`limited`, and settled three times over: the device APIs, the `webAPI` write,
and the external tile each forbid `full` independently. This is the catalogue's
first control where an external service is one of the reasons.

The presets hand the control a coordinate directly, which is the state it spends
most of its life in — a saved record being displayed rather than a recording
being taken. Everything visible in that state is real. What the sandbox cannot
do is the press: it has no `context.device`, so **Record location** shows the
control's own "not available on this client" message, which is also exactly what
a model-driven form in a browser shows. **Add photo** is not rendered there at
all, for the same reason it is not rendered in canvas.

## Not verified

Nothing here has been on a real Power App. Three items are load-bearing:

- **That `getCurrentPosition` resolves on a model-driven mobile client**, and
  that its rejection on a denied permission carries `code: 1`. Everything about
  the four device states is read from the reference and reproduced in the rig;
  none of it has been observed. Needs the Power Apps mobile app on a real
  device, with location permission granted and then revoked.
- **That the note attaches to the right record.** `objectid_<entity>@odata.bind`
  with an entity set name from `getEntityMetadata` is the documented shape and
  the same one `pcf-tag-list` uses for its parent lookup, but this control
  builds a *polymorphic* `objectid_` navigation property, which that one does
  not. Needs a real environment and one press.
- **That a canvas app actually treats the component as premium.** The licensing
  consequence of `external-service-usage enabled="true"` is documented and is
  the entire justification for the trade recorded in `docs/limitations.md`. It
  has never been seen happen. Needs an app in an environment with an Office
  365-only user.

Two smaller ones: that `Decimal` bound properties round to the column's
precision the way `docs/model-driven.md` claims, and that
`context.mode.contextInfo` is in fact populated on a form — this control's
fallback exists precisely because that is not guaranteed, but the preference
order has not been observed either way.

## Promoting a finding

Everything general has already gone to `references/control-patterns.md`; the
sections above link to where. What stays here is what is true of this control
rather than of PCF — the round-trip bug, the demo reasoning, and the list of
what a real device still has to confirm.
