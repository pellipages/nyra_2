# Fonts

| Folder | Font | Licence | Status |
|---|---|---|---|
| `pinyon-script/` | Pinyon Script | SIL OFL 1.1 (see `OFL.txt`) | Included |
| `canela/` | Canela (Commercial Type) | Commercial web licence | **Add your files** |
| `sloop-script-pro/` | Sloop Script Pro (Sudtipos) | Commercial web licence | **Add your files** |

Buy a web licence for Canela and Sloop Script Pro, then add the web font files here.

**canela/** (each as `.woff2` and `.woff`):
`Canela-Light-Web`, `Canela-LightItalic-Web`, `Canela-Regular-Web`,
`Canela-RegularItalic-Web`, `Canela-Medium-Web`, `Canela-MediumItalic-Web`

**sloop-script-pro/**: `SloopScriptPro-Regular.woff2` / `.woff`

If your purchased files are named differently, edit the `url()` values in `css/fonts.css`.
Until the files are added the site falls back to Cormorant Garamond (for Canela)
and Pinyon Script (for Sloop). Check your licence allows a public repo; many
foundries only permit the font files on the licensed domain, so you may prefer to
keep them out of git (add the two folders to `.gitignore`) and upload them at deploy time.
