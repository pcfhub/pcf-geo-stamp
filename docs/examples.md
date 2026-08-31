---
title: Examples
description: Worked configurations of Geo Stamp.
order: 6
---

# Examples

## Recording where an inspection happened

The plain case, and the one most deployments want: a technician opens an
inspection on their phone, presses once, and the coordinates land on the record.

Add a `SingleLine.Text` column — `cll_location`, length 50 — put Geo Stamp on it
in the form designer, and enable the component for **Phone** and **Tablet**.
Nothing else is configured; the defaults are six decimal places and a
hundred-metre accuracy warning.

::image{src=media/example-basic.png alt="A recorded location on an inspection form"}

That is the whole setup. On the web the control will say location is not
available on this client, which is correct — the reading comes from the mobile
app.

## Recording the numbers as well, for a map elsewhere

The same as above, plus two numeric columns so the values can be queried,
charted, or fed to a mapping component on another screen.

Add `cll_latitude` and `cll_longitude` as **Floating Point Number** with
**precision 6** — the same as the control's **Decimal places**, or Dataverse
rounds on save and the numbers stop agreeing with the text. Decimal Number works
too; the control accepts either. In the component's property pane, bind
**Latitude** to `cll_latitude` and **Longitude** to `cll_longitude`.

:::callout{type=info}
To use the **standard** address columns instead — `address1_latitude` and
`address1_longitude` on account, contact and the rest — bind straight to them.
They are Floating Point Number at precision 5, so set **Decimal places** to 5 if
you want the text column and the numeric ones to agree to the last digit.
:::

:::callout{type=info}
Both are optional and independent. Mapping only **Latitude** is allowed and does
what it says; the component writes whichever ones you gave it and leaves the
rest alone. Before the first recording it writes neither, rather than writing
zeroes — `0, 0` is a real place in the Gulf of Guinea and would look like data.
:::

## Attaching a photo of what was found

Needs a model-driven form, because the photo becomes a note.

Configure the control as above, then bind the two identity properties in the
component's property pane:

| Property | Bind to |
| --- | --- |
| **Record id** | `cll_inspectionid` |
| **Record table** | static value `cll_inspection` |

On most forms these are not needed — the platform supplies the record's identity
and the **Add photo** button appears on its own. Bind them when it does not.

Put the form's stock **Notes** control on the same tab and the photos appear
there, because that is where they are written.

## Reacting to a recording in a canvas app

```powerfx
// App.OnStart
Set(varStampCount, 0);

// GeoStamp.OnChange
If(
    GeoStamp.StampCount > varStampCount,
    Set(varStampCount, GeoStamp.StampCount);
    Patch(
        Inspections,
        varCurrentInspection,
        { cll_location: GeoStamp.Value }
    )
)
```

:::callout{type=warning}
The `StampCount` guard is not optional. Two recordings from the same doorway
produce identical coordinates, so `Value` does not change and `OnChange` never
fires — the user presses the button and nothing happens. `StampCount` is the
output that differs every time, which is the only thing that makes a repeat
visible.
:::

## Turning the map on

Set **Show map** to true. The control then loads one tile per recorded location
from **Map tile URL**, which defaults to OpenStreetMap.

:::callout{type=warning}
This is the feature the component's premium licensing exists for, and it is off
by default. Read [Limitations](limitations) first — the licensing consequence
applies whether or not you turn it on, but the external request only happens
when you do.
:::

::image{src=media/screenshot.png alt="The control with the map thumbnail turned on" zoom}

To keep every request inside your own network, point **Map tile URL** at your
own tile server:

```text
https://tiles.contoso.internal/osm/{z}/{x}/{y}.png
```

The template must be `https` and contain `{z}`, `{x}` and `{y}`. Anything else
builds no URL at all and the map is simply not shown.
