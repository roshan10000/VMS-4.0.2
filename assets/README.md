# assets/

Drop your brand assets here. The shipped UI doesn't reference any image
files by default — it uses inline SVG for the logo mark and CSS for
everything else — but if you want to override:

| Filename | Where it appears |
|----------|------------------|
| `logo.svg` | Top-left of the sidebar (replace inline SVG in `js/shell.js`) |
| `favicon.ico` or `favicon.svg` | Browser tab icon (add `<link rel="icon">` to each HTML page) |
| `login-bg.jpg` | Optional login-page background (referenced in `css/login.css` if you uncomment) |

Keep file sizes small — every byte loads on the warehouse Wi-Fi.

If you don't add anything, the app still works.
