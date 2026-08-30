---
title: Canvas apps
description: Adding Geo Stamp to a canvas app or custom page.
order: 3
---

# Using it in a canvas app

Canvas is the host where the **location** half works best and the **photo** half
does not exist at all. `context.webAPI` is not available to code components in
canvas apps, so the Add photo button is not shown there — see
[Limitations](limitations).

:::steps
1. In the environment, enable **Power Apps component framework for canvas apps**
   if it is not already on.
2. From **Insert → Get more components**, open the **Code** tab and import
   **Geo Stamp**.
3. Place it from **Insert → Code components**.
4. Bind the properties below.
:::

## Wiring the properties

```powerfx
// Somewhere that runs before the screen shows — App.OnStart or Screen.OnVisible
Set(varLocation, "");
Set(varStampCount, 0);
```

| Property | Value |
| --- | --- |
| Value | `varLocation` |
| Decimal places | `6` |
| Accuracy warning (m) | `100` |
| Show map | `false` |

::callout{type=info}
**Latitude** and **Longitude** are bound properties. In canvas they behave as
plain two-way values — set them from variables if you want the numbers, or leave
them unset and read the formatted **Value**.
::

## Reading the output

The component writes back through `OnChange`, and the property to watch is
**Stamp count** rather than the coordinates:

```powerfx
// GeoStamp.OnChange
If(
    GeoStamp.StampCount > varStampCount,
    Set(varStampCount, GeoStamp.StampCount);
    Set(varLocation, GeoStamp.Value);
    Patch(
        Inspections,
        varCurrentInspection,
        { cll_location: GeoStamp.Value }
    )
)
```

The guard is the point. Two recordings taken from the same doorway produce the
same coordinates, so `Value` does not change and `OnChange` would not fire at
all without a value that does. **Stamp count** is that value; comparing it
against what you last saw is how you tell a fresh press from a re-render.

## Location, and the permission behind it

Canvas apps can read location, but the player asks the user's permission the
first time something does. If the user refuses, the component says so and
records nothing — it does not retry and does not fall back to anything else.
That refusal is remembered by the browser or the device, not by the app, so
undoing it is a matter of the user's own settings.
