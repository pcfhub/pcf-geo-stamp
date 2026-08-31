---
title: FAQ
description: Questions that come up more than once.
order: 8
---

# FAQ

## Why does it say location is not available?

Because on that client it is not. `getCurrentPosition` is offered to canvas apps
and to the model-driven **mobile** client, and a model-driven form open in a web
browser has no such API — it is absent rather than refused, so there is no
permission to grant and no setting to change.

Open the record in the Power Apps mobile app, or build the screen as a canvas
app. See [Limitations](limitations).

## Why is there no Add photo button?

Because the host cannot save one. The button is hidden rather than disabled
where that is structurally true — in canvas apps, which have no `context.webAPI`
at all, and on Power Pages.

On a model-driven form where it is still missing, the cause is the record's
identity: bind **Record id** and **Record table** as described in
[Model-driven apps](model-driven).

## Does this make my app premium?

Yes. The component declares `external-service-usage` for the optional map tile,
and a component that connects to an external service directly is premium — so
end users of any app containing it need Power Apps licences.

The map is off by default and everything else works with it off, but the
licensing follows the declaration in the manifest rather than your configuration
of it. [Limitations](limitations) says this in full.

## Can I use my own map server?

Yes. **Map tile URL** takes any `https` template containing `{z}`, `{x}` and
`{y}`, so pointing it at a tile server inside your network means no request
leaves your infrastructure. It does not change the licensing.

## It recorded a location that is clearly wrong

Check the line under the coordinates. A reading the device is not confident
about is labelled *approximate*, with the margin in metres — indoors that can be
a kilometre or more.

The control records those deliberately rather than discarding them: an
approximate answer with its error stated is more useful than an empty column,
and refusing it leaves the user with no way forward. Lower **Accuracy warning
(m)** to be told about it sooner.

## Why does my flow not run on the second recording?

Because nothing changed. `OnChange` fires when an output changes, and two
recordings from the same spot produce the same coordinates.

Watch **Stamp count** instead — it increases on every press, which is exactly
why the property exists. There is a formula in [Canvas apps](canvas).

## Why are my Latitude and Longitude columns slightly different from the text?

Dataverse rounds a numeric column to its configured precision on save. Set the
columns' precision to at least the control's **Decimal places** property.

If you bound the **standard** address columns, that is the explanation:
`address1_latitude` and `address1_longitude` are precision 5 and cannot be
changed, while the control defaults to 6 decimal places. Set **Decimal places**
to 5 and the two agree exactly. The difference is about 10 cm either way.

## Can I bind it to address1_latitude?

Yes. Those columns are **Floating Point Number**, and the control accepts both
Floating Point and Decimal for its Latitude and Longitude properties precisely
so that the standard address columns work — a control that accepted only Decimal
would not offer them in the column picker at all.

## Does it work offline?

The reading does — geolocation is a device capability and needs no network. The
photo does not: it is written through the Web API at the moment of capture, and
fails with the platform's own message if there is no connection.

## How do I report a bug?

Open an issue at <https://github.com/pcfhub/pcf-geo-stamp/issues>, with the
platform version, the control version from the solution, and — for anything
about location — which client you were on.
