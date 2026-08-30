---
title: API reference
description: Properties and outputs, generated from the control manifest.
order: 5
---

# API reference


## Input properties

::props-table{kind=input}

## Bound properties

::props-table{kind=bound}

## Outputs

::props-table{kind=output}

## Notes

**Map tile URL** must be an `https` URL containing the literal tokens `{z}`,
`{x}` and `{y}`. Anything else — including `http` — builds no URL and the map
is not shown. This is checked in the control rather than left to the browser,
because the value is free text from a properties pane and its result becomes an
image source.

**Record table** must be a table's logical name — lowercase, starting with a
letter, letters digits and underscores only. A value that cannot be a logical
name is ignored rather than sent, because it is interpolated into the request
that attaches the note.

**Latitude** and **Longitude** are written only once there is a reading. Before
the first recording the control returns neither, rather than returning zero — so
an unmapped or untouched column stays empty instead of pointing at the Gulf of
Guinea.

**Stamp count** increases on every recording, including ones that produce the
same coordinates as the last. It is the only output guaranteed to change, and so
the only reliable trigger for `OnChange`.

### Features requested at install

| Feature | Required | Why |
| --- | --- | --- |
| `Device.getCurrentPosition` | no | The reading. Absent outside canvas and the mobile client. |
| `Device.captureImage` | no | The photo. Absent wherever there is no camera bridge. |
| `WebAPI` | no | Writes the note. Absent in canvas apps entirely. |
| `Utility` | no | Resolves the table name the note is attached through. Model-driven only. |

Every one is `required="false"`, so the component loads and degrades on a host
that lacks them rather than failing to load. Declaring any of them `true` would
mean the component does not render at all on most hosts.
