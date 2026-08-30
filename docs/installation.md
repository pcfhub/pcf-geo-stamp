---
title: Installation
description: Import the solution and make the control available.
order: 2
---

# Installation


:::steps
1. Download the **managed** solution for your environment.
2. In the Power Platform admin centre, import the solution.
3. Publish all customizations.
4. Enable **Code components for canvas apps** if this control is used there.
:::

:::callout{type=warning}
Import the managed solution into production. The unmanaged one is for a
development environment where you intend to change the control itself — it
cannot be cleanly uninstalled.
:::

## Requirements

No dependencies to install first. The component is self-contained — no libraries,
no connectors, no configuration outside the form or screen it is placed on.

:::callout{type=warning}
**Licensing.** This component declares `external-service-usage`, which makes it
premium: end users of an app containing it need Power Apps licences rather than
Office 365 ones. Confirm that before importing — it applies from the moment the
component is in an app, whether or not its map feature is switched on. See
[Limitations](limitations).
:::

## Where it will and will not work

Enable it for **Phone** and **Tablet** as well as Web. The location half only
works in the mobile client and in canvas apps; a model-driven form in a browser
has no geolocation API to call. Enabling it only for Web means it never records
anything.
