// Finds English UI text written straight into a component instead of coming from the messages (src/lib/i18n).
// Used by tests/i18n-guard.test.mjs. Reads the code with TypeScript's own parser, so JSX is understood, not guessed.
import ts from "typescript";

// Names that stay as published in every language (docs/CHATTOGRAM.md, Languages): missions, products, agencies,
// units, formats and standards. Matched as whole words, case-sensitive.
const PUBLISHED = new Set(
  `NISAR GCOV NASA ISRO ASF DAAC CMR Earthdata HH HV VV HHHH HVHV dB km px UTC LST URL ID SHA-256 MD5 HDF5 JSON CSV
   GeoJSON PDF PNG GeoTIFF EPSG UTM RTC QA Mapbox OpenStreetMap IMERG GPM MERRA-2 GEOS-IT BBS HDX`.split(/\s+/),
);

/** True when the text has at least one English word that isn't a published name. */
const isEnglish = (text) => (text.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? []).some((w) => w.length > 1 && !PUBLISHED.has(w));

// Attributes a person reads or hears (tooltips, screen readers, empty inputs, image descriptions).
const USER_FACING = new Set(["aria-label", "aria-description", "aria-valuetext", "aria-roledescription", "title", "placeholder", "alt", "label"]);

const collapseWhitespace = (s) => s.replace(/\s+/g, " ").trim();

/** The visible text of a string or template literal (template holes dropped), or null for other nodes. */
function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return collapseWhitespace(node.text);
  if (ts.isTemplateExpression(node)) return collapseWhitespace([node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" "));
  return null;
}

/**
 * Whether a literal ends up on screen: it reaches a JSX `{…}` child only through the result positions of `a ? x : y`,
 * `x ?? y`, `x || y`, `c && x`, `x + y` and parentheses. A literal passed to a function (`fmt(x, "en-GB")`) is not shown.
 */
function isShown(node) {
  let child = node;
  for (let p = node.parent; p; child = p, p = p.parent) {
    if (ts.isParenthesizedExpression(p)) continue;
    if (ts.isConditionalExpression(p) && child !== p.condition) continue;
    if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken.kind;
      if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.PlusToken) continue;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken && child === p.right) continue;
      return false;
    }
    if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent)) continue;
    if (ts.isJsxAttribute(p)) return USER_FACING.has(p.name.getText());
    return ts.isJsxExpression(p);
  }
  return false;
}

/** The string value of a JSX attribute such as lang="en", or undefined. */
function attribute(opening, name) {
  const a = opening.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === name);
  return a?.initializer && ts.isStringLiteral(a.initializer) ? a.initializer.text : undefined;
}

/**
 * English kept on purpose (source citations, technical details, proper names) is marked `lang="en" translate="no"`,
 * HTML for "this is English, don't translate it"; the element and its contents are skipped. `lang="en"` alone only
 * labels the language (screen readers switch voice), so untranslated UI marked that way is still reported.
 */
function isKeptEnglish(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
  return !!opening && attribute(opening, "lang") === "en" && attribute(opening, "translate") === "no";
}

/** @param {string} source TSX source. @returns {{ line: number, text: string }[]} */
export function findHardcodedText(source) {
  const file = ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const reportIfEnglish = (node, text) => {
    if (isEnglish(text)) found.push({ line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, text });
  };
  const visit = (node) => {
    if (isKeptEnglish(node)) return;
    if (ts.isJsxText(node)) reportIfEnglish(node, collapseWhitespace(node.text));
    else {
      const text = literalText(node);
      if (text !== null && isShown(node)) reportIfEnglish(node, text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
