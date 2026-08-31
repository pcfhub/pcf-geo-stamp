---
title: Overview
description: What Geo Stamp does, and when to reach for it.
order: 1
---

# Geo Stamp

Records where somebody was standing when they filled a record in, into a column
you already have — and, on a phone, attaches a photo from the same press.

::image{src=media/screenshot.png alt="Geo Stamp on a form" zoom}

## Why this one

The platform gives you `Location` in Power Fx and a `Device` API in code, and
neither is a control you can put on a form. Getting a coordinate onto a record
therefore means either a canvas screen built around it, or a JavaScript web
resource, or asking people to type numbers they cannot read off their phone.
This is the field-control version: it binds to a text column, it has one button,
and it works on a form.

The constraint it is built around is that **location is not available
everywhere**, and pretending otherwise is what makes controls like this
frustrating. `getCurrentPosition` is documented for canvas apps and the
model-driven *mobile* client. A model-driven form open in a browser cannot get a
reading at all — not "sometimes", not "if you allow it": the API is absent. So
the control tells you which of those you are looking at, in those words, rather
than showing a failure you cannot act on.

The other constraint is that a bad fix is still a fix. A reading from inside a
warehouse can be a kilometre out, and refusing it leaves the user with an empty
column and nothing to do about it. Geo Stamp records it and says how far off it
might be.

## What it works with

- **A text column** for the formatted stamp — required, and the only thing it
  needs.
- **Two numeric columns**, optional, if you want the numbers separately for
  queries or a map elsewhere. Dataverse's own `address1_latitude` and
  `address1_longitude` are exactly this shape — they are **Floating Point
  Number** columns, and the control accepts either those or Decimal.
- **Notes**, optional, if you want the photo half. That needs a model-driven
  form.

## What it costs

::callout{type=warning}
This component declares `external-service-usage`, which makes it a **premium**
component: an app containing it requires Power Apps licences for its end users
rather than Office 365 ones.
::

That is the price of the optional map thumbnail, which loads a tile from a
third-party host. **The map is off by default** and every other feature works
with it off, so you can install this and never make a request outside your
tenant — but the licensing consequence follows the declaration in the manifest,
not your configuration of it. [Limitations](limitations) says what to weigh.
