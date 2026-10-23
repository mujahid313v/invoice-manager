# Bundled fonts

- `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` — Noto Sans by Google,
  licensed under the SIL Open Font License 1.1
  (https://openfontlicense.org).
- Purpose: `@react-pdf/renderer` needs a TTF whose coverage includes the
  currency glyphs (₹ U+20B9, €, £, ¥) that the built-in WinAnsi Helvetica
  does not provide.
- Source: `@expo-google-fonts/noto-sans` package (static TTF builds), used
  unmodified.
- If the license file is required for distribution, fetch `OFL.txt` from the
  upstream repository and commit it next to the fonts.
