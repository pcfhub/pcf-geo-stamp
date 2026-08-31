---
title: Model-driven apps
description: Adding Geo Stamp to a form.
order: 4
---

# Using it on a model-driven form

:::steps
1. Open the form in the modern form designer.
2. Select the text column the stamp should be written to.
3. Under **Components → Add component**, choose **Geo Stamp**.
4. Enable it for **Web**, **Phone** and **Tablet**.
5. Save and publish.
:::

:::callout{type=warning}
Enable it for **Phone** and **Tablet** even if most people use the web app. The
location half only works in the mobile client — leaving those off means it never
works at all. See [Limitations](limitations).
:::

## Column types

**Value** binds to a `SingleLine.Text` column and is required. Give it enough
length for the formatted pair: 24 characters covers six decimal places on both
numbers, and the default 100 is plenty.

**Latitude** and **Longitude** are optional and bind to numeric columns —
either **Floating Point Number** or **Decimal Number**. Map them if you want to
query or plot the numbers; leave them unmapped if the text column is all you
need. Either one alone is fine.

Dataverse's own `address1_latitude` and `address1_longitude` are Floating Point
Number columns, which is why both types are accepted: a control that took only
Decimal could not be bound to them at all, because the column picker offers only
columns whose type matches.

::callout{type=info}
Set the columns' **precision** to at least the **Decimal places** property, or
Dataverse rounds the value on save and the numeric columns quietly disagree with
the text one. The standard address columns are **precision 5** while this
control defaults to 6 — so on those, expect the sixth decimal place to be
rounded away. Six places is about 0.1 m and five is about 1 m, so this rarely
matters; set **Decimal places** to 5 if you would rather the two agreed exactly.
::

## Letting it attach photos

The **Add photo** button appears only when the component can work out which
record it is on. On most forms `context.mode.contextInfo` supplies that and
nothing needs configuring.

Where it does not, bind the two documented properties — this is the platform's
own answer to the question, and the values are set in the component's property
pane:

| Property | Bind to |
| --- | --- |
| **Record id** | the table's own id column, e.g. `accountid` |
| **Record table** | a static value: the table's logical name, e.g. `account` |

The logical name is the lowercase one (`account`, `cll_inspection`), not the
display name. A value that cannot be a logical name is ignored rather than sent.

Photos are written as **notes** on the record, so the form's own Notes control
shows them with no further configuration.

## What the maker sets

| Property | Default | Notes |
| --- | --- | --- |
| **Decimal places** | `6` | About 0.1 m. Lower it to record roughly rather than exactly. |
| **Accuracy warning (m)** | `100` | A worse fix is still recorded, and labelled approximate. |
| **Show map** | off | Loads an external tile. See [Limitations](limitations) before turning it on. |
| **Map tile URL** | OpenStreetMap | Any `https` template with `{z}`, `{x}` and `{y}`. |

## Reacting to a stamp

**Stamp count** increases on every recording, including one that produces the
same coordinates as the last. That is what makes a repeat visible to a business
rule or a flow — the coordinates alone would be unchanged, and nothing would
fire.
