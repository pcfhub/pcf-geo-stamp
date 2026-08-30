---
title: Limitations
description: What Geo Stamp does not do.
order: 7
---

# Limitations

## It is a premium component, and that is a real cost

The manifest declares:

```xml
<external-service-usage enabled="true">
  <domain>tile.openstreetmap.org</domain>
</external-service-usage>
```

A component that connects to an external service directly from the browser is
**premium**. Any app containing it requires its end users to hold Power Apps
licences rather than Office 365 ones. That follows from the declaration being
present, not from whether you turn the map on.

The declaration is there because of one optional feature: the map thumbnail,
which loads a tile from a third-party host. Everything else — the location, the
photo, the columns, the accuracy reporting — stays entirely inside your tenant.

**Show map is off by default and cannot be defaulted to on**, because a
`TwoOptions` input cannot be. So the component as shipped makes no external
request at all. If the licensing is the deciding factor for you and you do not
want the map, the honest answer is that this component still costs you the
licence — and you should weigh that before installing rather than after.

`Map tile URL` accepts any `https` template containing `{z}`, `{x}` and `{y}`.
Pointing it at a tile server inside your own network means no request leaves
your infrastructure. It does not change the licensing.

## Location does not work on a model-driven form in a browser

`context.device.getCurrentPosition()` is documented as available for **canvas
apps and the model-driven mobile client**. On a model-driven form open in a web
browser the API is simply not there — the control detects that and says
"Location is not available on this client", which is the accurate statement.
There is no setting that changes it.

The component deliberately does **not** fall back to the browser's own
`navigator.geolocation`. That would work in exactly the hosts where the platform
declined to offer it, and it would prompt the user for a permission the app
never declared, from inside a component. If you need location in a browser, a
canvas app is the supported route.

| Host | Location | Photo | Map |
| --- | --- | --- | --- |
| Model-driven, mobile app | yes | yes | yes |
| Model-driven, web browser | **no** | yes | yes |
| Canvas app | yes | **no** | yes |
| Power Pages | **no** | **no** | yes |

## Photos are notes, and need a model-driven form

The framework cannot bind a File column, and `context.webAPI` has no method that
writes one. So a photo becomes a **note** (`annotation`) attached to the record,
which is where a form's Notes control already looks.

That needs three things a canvas app does not have: `context.webAPI` (absent in
canvas entirely), `context.utils.getEntityMetadata` (model-driven only), and the
identity of the record the control is on. Where any is missing the **Add photo**
button is not shown at all, rather than shown and failing.

## The control has to be told which record it is on

The framework does not give a component the record's id — deliberately, because
components have to work on surfaces where there is no record. Geo Stamp uses
`context.mode.contextInfo` where the host provides it, and otherwise needs the
**Record id** and **Record table** properties bound on the form. Both are
described in [Model-driven apps](model-driven).

If neither is available, the location half still works normally; only the photo
declines, with a message saying why.

## Only one photo, and it is not retrievable from here

Each press creates one note. The component reports the note's id through
`Last note id` and does nothing else with it — there is no gallery, no delete,
and no way to replace the previous photo. Use the form's own Notes control for
that; this writes into the same place.

## Nothing here is verified against a real device

The component's behaviour is asserted against a test rig that stands in for the
platform, including all four ways a device API can be unavailable. What that
cannot prove is that a real mobile client resolves `getCurrentPosition` the way
the documentation describes, or that the note lands against the right record in
a real environment. Both are recorded in the repository's `SPEC.md` as
outstanding.
