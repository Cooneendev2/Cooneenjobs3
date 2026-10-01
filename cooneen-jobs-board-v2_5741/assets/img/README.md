# Cooneen logo

The display looks for the Cooneen Group logo in this order and uses the first one that loads:

1. `assets/img/logo.svg`
2. `assets/img/logo.png`
3. `logo.png` next to `index.html` (the place the first version of the display looked)
4. the logo on cooneengroup.com (`https://www.cooneengroup.com/wp-content/uploads/2025/01/cooneen_group_rgb_reverse_grad.png`)
5. if none of those loads, the words "Cooneen Group" in the logo's place

So the screens show the real logo even if you add nothing, as long as the screen's network can reach cooneengroup.com.
**Add your own copy as `assets/img/logo.svg` or `assets/img/logo.png`** so the display does not depend on the website being
reachable (a locked-down factory network, for example) and loads the logo faster.

## Which logo file

- The website's own logo is the white-lettered "reverse" artwork (`cooneen_group_rgb_reverse_grad.png`), made for dark backgrounds.
  The display therefore puts it on a dark plate. Save it from the address above, or use the official file from your brand pack.
- If you add a dark or full-colour logo instead, add `&logobg=light` to the screen addresses (the plate becomes white), or
  `&logobg=none` to draw the logo straight onto the orange band.
- SVG is best (sharp at any screen size). A PNG should be at least 600 pixels wide, with a transparent background.
- The height is set by the display; the width follows the logo's own shape (wide logos are limited to about four times the plate height).

This folder is part of the website, so on Cloudflare Workers keep this README out of it: `/assets/img/README.md` is listed in
`.assetsignore`.
